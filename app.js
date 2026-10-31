"use strict";
pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([Uint8Array.from(atob(window.PDFJS_WORKER), c=>c.charCodeAt(0))], {type:'text/javascript'}));

const CATS = [
  {k:'01', n:'Foto 3x4'},
  {k:'02', n:'Ficha de solicitação de emprego'},
  {k:'03', n:'Comprovante de situação cadastral no CPF', link:'https://servicos.receita.fazenda.gov.br/servicos/cpf/consultasituacao/consultapublica.asp'},
  {k:'04', n:'RG'},
  {k:'05', n:'CPF'},
  {k:'06', n:'Título de eleitor'},
  {k:'07', n:'Reservista', opt:true},
  {k:'08', n:'PIS'},
  {k:'10', n:'Carteira de trabalho (frente e verso)'},
  {k:'11', n:'Comprovante de residência'},
  {k:'12', n:'Certificado de escolaridade'},
  {k:'13', n:'Carteira Nacional de Vigilante (CNV)'},
  {k:'14', n:'Certificado de formação de vigilante (frente e verso)'},
  {k:'15', n:'Certificado de reciclagem de vigilante atualizado'},
  {k:'16', n:'Certidão de nascimento'},
  {k:'17', n:'Certidão de casamento', opt:true, note:'se for casado'},
  {k:'18', n:'Cartão de vacina e COVID-19 atualizado'},
  {k:'19', n:'Comprovante de tipo sanguíneo'},
  {k:'20', n:'Certidão judicial criminal', link:'https://certidoes.trf5.jus.br/certidoes2022/'},
  {k:'21', n:'Certidão negativa da Justiça Eleitoral', link:'https://certidoes.trf5.jus.br/certidoes2022/'},
  {k:'22', n:'Certidão negativa da Justiça Federal', link:'https://certidoes.trf5.jus.br/certidoes2022/'},
  {k:'23', n:'Certidão negativa da Justiça Militar Federal', link:'https://www2.stm.jus.br/ceneg_internet/emitir/index.php'},
  {k:'24a', n:'Filhos até 14 anos – certidão de nascimento', opt:true},
  {k:'24b', n:'Filhos até 14 anos – CPF', opt:true},
  {k:'24c', n:'Filhos até 14 anos – cartão de vacina', opt:true},
  {k:'24d', n:'Filhos até 14 anos – declaração do colégio', opt:true},
];
const EXTRA = {OUT:{k:'OUT', n:'Outros documentos (vai depois do 24)'}, X:{k:'X', n:'Descartar (não imprimir)'}};
const ORDER = [...CATS.map(c=>c.k), 'OUT'];
const catByKey = k => CATS.find(c=>c.k===k) || EXTRA[k];
const rank = k => k==null ? ORDER.length : ORDER.indexOf(k);

let locked = true;
let sources = [], items = [], sel = new Set(), anchor = null, view = 'classify', nextId = 1, loading = 0, modalId = null;
const $ = s => document.querySelector(s);
const grid = $('#grid');

function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('on'); clearTimeout(toast.h); toast.h=setTimeout(()=>t.classList.remove('on'),2200); }
function esc(s){ return String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

/* ---------- carregar arquivos ---------- */
async function addFiles(fileList){
  const files = [...fileList];
  if(!files.length) return;
  if(!$('#nome').value.trim() && !askedName){
    askedName=true;
    const v=prompt('Qual é o nome completo do candidato?\n\nEle é usado para separar os documentos do candidato (certidão de nascimento, cartão de vacina e CPF) dos documentos dos filhos.');
    if(v) $('#nome').value=v.trim();
  }
  loading++; updateButtons();
  for(const f of files){
    const isPdf = f.type==='application/pdf' || /\.pdf$/i.test(f.name);
    const isImg = f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp)$/i.test(f.name);
    try{
      if(isPdf) await addPdf(f);
      else if(isImg) await addImage(f);
      else toast('Tipo de arquivo não suportado: '+f.name);
    }catch(e){ console.error(e); toast('Não consegui abrir '+f.name+(/password|encrypt/i.test(e.message||'')?' (PDF com senha)':'')); }
  }
  loading--; $('#progress').textContent=''; updateButtons(); render();
  readAll();
}
async function addPdf(f){
  const bytes = new Uint8Array(await f.arrayBuffer());
  const pjs = await pdfjsLib.getDocument({data: bytes.slice(), isEvalSupported:false}).promise;
  const src = sources.push({kind:'pdf', name:f.name, bytes, pjs}) - 1;
  for(let i=1;i<=pjs.numPages;i++){
    $('#progress').textContent = `Lendo ${f.name}: página ${i} de ${pjs.numPages}…`;
    const page = await pjs.getPage(i);
    const vp1 = page.getViewport({scale:1});
    const scale = Math.min(200/vp1.width, 220/vp1.height) * 2;
    const vp = page.getViewport({scale});
    const c = document.createElement('canvas'); c.width=Math.ceil(vp.width); c.height=Math.ceil(vp.height);
    const ctx = c.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,c.width,c.height);
    await page.render({canvasContext:ctx, viewport:vp}).promise;
    items.push({id:nextId++, src, page:i-1, origRot:page.rotate||0, rot:0, cat:null, thumb:c.toDataURL('image/jpeg',0.8), name:f.name});
    if(i%4===0 || i===pjs.numPages) render();
  }
}
function loadImg(url){ return new Promise((res,rej)=>{ const im=new Image(); im.onload=()=>res(im); im.onerror=()=>rej(new Error('imagem inválida')); im.src=url; }); }
async function addImage(f){
  const url = URL.createObjectURL(f);
  const img = await loadImg(url);
  const src = sources.push({kind:'img', name:f.name, img, url}) - 1;
  const s = Math.min(400/img.naturalWidth, 440/img.naturalHeight, 1);
  const c = document.createElement('canvas'); c.width=Math.round(img.naturalWidth*s); c.height=Math.round(img.naturalHeight*s);
  c.getContext('2d').drawImage(img,0,0,c.width,c.height);
  items.push({id:nextId++, src, page:null, origRot:0, rot:0, cat:null, thumb:c.toDataURL('image/jpeg',0.8), name:f.name});
  render();
}

/* ---------- leitura automática (OCR neste computador) ---------- */
const RULES = {
  '02':[[/solicitacao de emprego/,10],[/ficha de (emprego|solicitacao)/,8],[/pretensao salarial/,4],[/experiencia profissional/,3]],
  '03':[[/comprovante de situacao cadastral/,12],[/situacao cadastral/,8],[/digito verificador/,2]],
  '04':[[/registro geral/,8],[/carteira de identidade/,8],[/instituto de identificacao/,5],[/valida em todo o territorio/,5],[/lei n?\s?7 ?116/,5],[/seguranca publica/,3],[/filiacao/,2],[/naturalidade/,1],[/carteira nacional de habilitacao/,5]],
  '05':[[/cadastro de pessoas? fisicas?/,9],[/receita federal/,2],[/ministerio da fazenda/,2],[/\bcpf\b/,1]],
  '06':[[/titulo (de )?eleitor/,10],[/\bzona\b/,2],[/\bsecao\b/,2],[/justica eleitoral/,3]],
  '07':[[/reservista/,10],[/dispensa de incorporacao/,10],[/alistamento militar/,8],[/servico militar/,5],[/ministerio da defesa/,3]],
  '08':[[/\bpasep\b/,6],[/\bpis\b/,5],[/\bnis\b/,3],[/identificacao social/,6],[/cartao cidadao/,6]],
  '10':[[/carteira de trabalho/,10],[/\bctps\b/,7],[/contrato de trabalho/,4],[/anotacoes gerais/,4],[/previdencia social/,3],[/empregador/,2]],
  '11':[[/comprovante de (residencia|endereco)/,10],[/conta de (luz|agua|energia|telefone)/,8],[/\bkwh\b/,6],[/energia eletrica/,5],[/(neoenergia|enel|cemig|copel|equatorial|energisa|cpfl|celpe|coelba|sabesp|embasa|compesa|cagece|copasa|caern|cosern)/,5],[/consumo/,3],[/fatura/,3],[/vencimento/,2],[/\bcep\b/,1]],
  '12':[[/historico escolar/,9],[/certificado de conclusao/,8],[/ensino (medio|fundamental)/,5],[/diploma/,5],[/escolaridade/,5],[/secretaria (estadual |municipal )?de educacao/,3]],
  '13':[[/carteira nacional de vigilante/,12],[/\bcnv\b/,7],[/policia federal/,2],[/vigilante/,2]],
  '14':[[/formacao de vigilantes?/,10],[/curso de formacao/,5],[/vigilante/,2]],
  '15':[[/reciclagem/,12],[/vigilante/,2]],
  '16':[[/certidao de nascimento/,12],[/registro civil/,3],[/nascimento/,2]],
  '17':[[/certidao de casamento/,12],[/\b(conjuges|nubentes)\b/,4],[/casamento/,3],[/registro civil/,2]],
  '18':[[/(cartao|caderneta|carteira)( nacional)? de vacin/,10],[/vacinacao/,6],[/covid/,5],[/imunizacao/,5],[/(coronavac|pfizer|astrazeneca|janssen)/,4],[/\bdose\b/,3],[/conecte sus/,3]],
  '19':[[/(tipo|grupo|tipagem) sangu/,10],[/fator rh/,7],[/\babo\b/,3]],
  '20':[[/certidao judicial/,6],[/(distribuicao|antecedentes|acoes|feitos) (crimina|de natureza criminal)/,8],[/criminal/,4],[/tribunal de justica/,4],[/justica federal|tribunal regional federal/,-12],[/justica militar|tribunal militar/,-12]],
  '21':[[/crimes eleitorais/,12],[/certidao (negativa )?.{0,40}eleitora/,8],[/quitacao eleitoral/,10],[/justica eleitoral/,3]],
  '22':[[/justica federal/,7],[/conselho da justica federal/,5],[/tribunal regional federal/,6],[/certidao/,1]],
  '23':[[/justica militar/,9],[/superior tribunal militar/,9],[/certidao/,1]],
  '24d':[[/declaracao (de matricula|escolar)/,10],[/matriculad/,7],[/ano letivo/,3],[/cursando/,3]],
};
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
function classify(text){
  const t = norm(text);
  const sc = Object.entries(RULES).map(([k,rs])=>[k, rs.reduce((s,[re,w])=>s+(re.test(t)?w:0),0)]).sort((a,b)=>b[1]-a[1]);
  return {k:sc[0][0], score:sc[0][1], lead:sc[0][1]-sc[1][1], len:t.length, text:t};
}
/* de quem é o documento: procura o nome do candidato e olha a palavra que vem antes dele */
const FAMILY = {'16':'24a','05':'24b','18':'24c'}; // documento do candidato → mesmo documento do filho
const NAME_SKIP = new Set(['de','da','do','das','dos','e']);
const OWN_CUES = new Set(['nome','titular','paciente','vacinado','vacinada','registrado','registrada']);
const CHILD_CUES = new Set(['pai','mae','filho','filha','filiacao','genitor','genitora','responsavel','declarante','avos','avo']);
const nameTokens = s => norm(s).split(' ').filter(t=>t && !NAME_SKIP.has(t));
function nearWord(a,b){ // tolera erro de leitura em nomes
  if(a===b) return true;
  const max = b.length>=8 ? 2 : b.length>=4 ? 1 : 0;
  if(!max || Math.abs(a.length-b.length)>max) return false;
  let prev=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
    const cur=[i];
    for(let j=1;j<=b.length;j++) cur[j]=Math.min(prev[j]+1, cur[j-1]+1, prev[j-1]+(a[i-1]===b[j-1]?0:1));
    prev=cur;
  }
  return prev[b.length]<=max;
}
function findOwner(text, name){
  const T=nameTokens(text), n=name.length, need=n<=2 ? n : Math.ceil(n*0.7);
  let hits=[];
  for(let i=0;i<T.length;i++){
    if(!nearWord(T[i],name[0])) continue;
    let m=1, k=i+1;
    for(let j=1;j<n;j++) for(let q=k;q<Math.min(T.length,i+n+2);q++) if(nearWord(T[q],name[j])){ m++; k=q+1; break; }
    if(m<need) continue;
    let role='own'; // sem palavra indicando o contrário, conta como o próprio candidato
    for(let q=i-1;q>=Math.max(0,i-8);q--){
      if(CHILD_CUES.has(T[q])){ role='child'; break; }
      if(OWN_CUES.has(T[q])){ role='own'; break; }
    }
    hits.push({role, strong:m===n});
  }
  if(hits.some(h=>h.strong)) hits=hits.filter(h=>h.strong);
  return {own:hits.some(h=>h.role==='own'), child:hits.some(h=>h.role==='child'), strong:n>=2 && hits.some(h=>h.strong)};
}
async function pageCanvas(it, maxDim){
  const src = sources[it.src];
  if(src.kind!=='pdf') return rotatedCanvas(src.img, 0, maxDim);
  const page = await src.pjs.getPage(it.page+1);
  const vp1 = page.getViewport({scale:1});
  const vp = page.getViewport({scale:maxDim/Math.max(vp1.width,vp1.height)});
  const c = document.createElement('canvas'); c.width=Math.ceil(vp.width); c.height=Math.ceil(vp.height);
  const ctx = c.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,c.width,c.height);
  await page.render({canvasContext:ctx, viewport:vp}).promise;
  return c;
}
function turnCanvas(c, r){
  const out=document.createElement('canvas'); const swap=r===90||r===270;
  out.width=swap?c.height:c.width; out.height=swap?c.width:c.height;
  const ctx=out.getContext('2d'); ctx.translate(out.width/2,out.height/2); ctx.rotate(r*Math.PI/180); ctx.drawImage(c,-c.width/2,-c.height/2);
  return out;
}
// foto 3x4: bloco único, cheio, em formato retrato, com fundo branco em volta ou ocupando a imagem toda
function looksLikePhoto(c){
  const s=Math.min(1,160/Math.max(c.width,c.height)), w=Math.max(1,Math.round(c.width*s)), h=Math.max(1,Math.round(c.height*s));
  const t=document.createElement('canvas'); t.width=w; t.height=h;
  const ctx=t.getContext('2d',{willReadFrequently:true}); ctx.drawImage(c,0,0,w,h);
  const d=ctx.getImageData(0,0,w,h).data;
  let x0=w,y0=h,x1=-1,y1=-1,ink=0;
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const i=(y*w+x)*4;
    if(Math.min(d[i],d[i+1],d[i+2])<235){ ink++; if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; }
  }
  if(x1<0) return false;
  const bw=x1-x0+1, bh=y1-y0+1, ratio=bw/bh;
  return ratio>=0.62 && ratio<=0.9 && ink/(bw*bh)>=0.8;
}
let reading=false, readGen=0, askedName=false;
const b64 = id => window.OCR_DATA[id];
// Aberto por file://, o worker não pode carregar outros blobs: idioma, motor e código vão num único script.
// O idioma é entregue pelo próprio worker, que nunca usa a rede para buscá-lo.
function ocrWorkerUrl(){
  if(ocrWorkerUrl.v) return ocrWorkerUrl.v;
  const shim=`const _l=${JSON.stringify(b64('ocr-lang'))},_f=self.fetch.bind(self);self.fetch=async(u,o)=>{if(!String(u).includes('traineddata'))return _f(u,o);const b=atob(_l),a=new Uint8Array(b.length);for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return new Response(a);};\n`;
  const bytes = id => Uint8Array.from(atob(b64(id)), c=>c.charCodeAt(0));
  return ocrWorkerUrl.v=URL.createObjectURL(new Blob([shim, bytes('ocr-core'), ';\n', bytes('ocr-worker')],{type:'text/javascript'}));
}
// se o motor falhar ao iniciar, o worker não avisa: sem este limite a tela ficaria presa
const withTimeout = (p, ms) => Promise.race([p, new Promise((_,rej)=>setTimeout(()=>rej(new Error('tempo esgotado ao iniciar o OCR')),ms))]);
async function readItem(it, worker, gen){
  const src=sources[it.src];
  if(src.kind==='pdf'){
    const page=await src.pjs.getPage(it.page+1);
    const tc=await page.getTextContent();
    const r=classify(tc.items.map(x=>x.str).join(' '));
    if(r.len>=80 && r.score>=4) return finishItem(it,{...r,rot:0},gen);
  }
  const base=await pageCanvas(it,2000);
  const ocr=async c=>{ const {data}=await worker.recognize(c); return {...classify(data.text), conf:data.confidence}; };
  let best={...await ocr(base), rot:0};
  if(best.score<8 && best.conf<70){
    for(const rot of [90,270,180]){
      if(gen!==readGen) return;
      if(it.manual){ it.read=true; return; }
      const r=await ocr(turnCanvas(base,rot));
      if(r.score>best.score) best={...r,rot};
      if(best.score>=8) break;
    }
  }
  finishItem(it,{...best, photo:best.score<4 && best.len<60 && looksLikePhoto(base)},gen);
}
function finishItem(it, r, gen){
  if(gen!==readGen) return;
  it.read=true; it.few=r.len<40;
  if(it.manual) return;
  if(r.score>=4){
    it.cat=r.k; it.check=!(r.score>=8 && r.lead>=4);
    if(FAMILY[r.k]){ it.base=r.k; it.baseCheck=it.check; it.text=r.text; }
    if(!it.rot && r.rot) it.rot=r.rot;
  } else if(r.photo){ it.cat='01'; it.check=true; }
}
// regras que dependem das páginas vizinhas e do conjunto
function reviewSet(){
  const auto=it=>it.read && !it.manual;
  const name=nameTokens($('#nome').value);
  const ownSeen=new Set(items.filter(it=>it.manual && it.cat).map(it=>it.cat));
  const unknown=[];
  for(const it of items){
    if(!auto(it) || !it.base) continue;
    it.cat=it.base; it.check=it.baseCheck;
    const o=name.length ? findOwner(it.text,name) : {};
    if(o.own || o.child){
      if(!o.own) it.cat=FAMILY[it.base]; else ownSeen.add(it.base);
      it.check=it.baseCheck || !o.strong || (o.own && o.child);
    } else unknown.push(it);
  }
  // nome não encontrado (sem nome digitado, leitura ruim ou nome de solteira): decide pela ordem e pede conferência
  for(const it of unknown){
    const prev=items[items.indexOf(it)-1];
    if(it.base!=='16' && prev && prev.base===it.base && !/\bnome\b/.test(it.text)){ it.cat=prev.cat; it.check=true; } // continuação do mesmo cartão
    else if(ownSeen.has(it.base)){ it.cat=FAMILY[it.base]; it.check=true; }
    else { ownSeen.add(it.base); if(name.length) it.check=true; }
  }
  const twoSided=['04','10','14'];
  const inherit=(it,nb)=>{ if(nb && auto(it) && it.few && !it.cat && twoSided.includes(nb.cat)){ it.cat=nb.cat; it.check=true; } };
  items.forEach((it,i)=>inherit(it,items[i-1]));
  items.forEach((it,i)=>inherit(it,items[i+1]));
}
async function readAll(){
  if(reading) return;
  reading=true; loading++; updateButtons();
  const gen=readGen;
  const workers=[];
  try{
    const workerPath=ocrWorkerUrl();
    const n=(navigator.hardwareConcurrency||2)>=4?2:1;
    $('#progress').textContent='Preparando a leitura automática…';
    for(let i=0;i<n;i++) workers.push(await withTimeout(Tesseract.createWorker('por',1,{workerPath, langPath:'https://ocr.local', workerBlobURL:false, cacheMethod:'none', gzip:true}),90000));
    const run=async w=>{
      for(;;){
        const it=items.find(x=>!x.read && !x.busy && !x.failed); // inclui arquivos soltos durante a leitura
        if(!it || gen!==readGen) return;
        it.busy=true;
        const total=items.length, done=items.filter(x=>x.read||x.failed).length;
        $('#progress').textContent=`Lendo os documentos: ${done+1} de ${total}…`;
        try{ await readItem(it,w,gen); }catch(e){ console.error(e); it.failed=true; }
        it.busy=false;
        if(gen===readGen){ reviewSet(); render(); }
      }
    };
    await Promise.all(workers.map(run));
  }catch(e){ console.error(e); toast('Leitura automática indisponível — classifique manualmente'); }
  for(const w of workers) w.terminate();
  reading=false; loading--; $('#progress').textContent='';
  if(gen!==readGen){ updateButtons(); if(items.some(x=>!x.read&&!x.failed)) readAll(); return; }
  updateButtons(); render();
  const pend=items.filter(i=>i.cat==null).length, chk=items.filter(i=>i.check).length;
  if(items.length) toast(`Leitura concluída: ${chk} para conferir, ${pend} sem classificação`);
}

/* ---------- ordem ---------- */
function finalOrder(){
  return items.map((it,idx)=>({it,idx})).filter(x=>x.it.cat!=='X')
    .sort((a,b)=>rank(a.it.cat)-rank(b.it.cat) || a.idx-b.idx).map(x=>x.it);
}
function visibleOrder(){
  if(view==='classify') return items;
  return [...finalOrder(), ...items.filter(i=>i.cat==='X')];
}

/* ---------- render ---------- */
function cardHTML(it){
  const c = it.cat && catByKey(it.cat);
  const badge = it.cat==null ? '<div class="badge">? sem classificação</div>'
    : it.cat==='X' ? '<div class="badge x">Descartar</div>'
    : `<div class="badge ${it.check?'warn':'ok'}" title="${it.check?'Leitura incerta, confira: ':''}${esc(c.n)}">${it.check?'⚠ ':''}${it.cat==='OUT'?'Outros':esc(it.cat)+' · '+esc(c.n)}</div>`;
  const r = ((it.rot%360)+360)%360;
  const pg = it.page==null ? 'imagem' : 'p. '+(it.page+1);
  return `<div class="card${sel.has(it.id)?' sel':''}${it.cat==='X'?' disc':''}" data-id="${it.id}" draggable="${view==='classify'}">
    ${badge}<div class="img"><img class="r${r}" src="${it.thumb}" style="transform:rotate(${r}deg)" alt=""></div>
    <div class="meta" title="${esc(it.name)}">${pg} · ${esc(it.name)}</div></div>`;
}
function counts(){ const m={}; for(const it of items) if(it.cat) m[it.cat]=(m[it.cat]||0)+1; return m; }
function render(){
  const m = counts();
  // sidebar
  const row = (c, cls='') => {
    const n = m[c.k]||0;
    const st = n ? 'has' : (c.opt || c.k==='OUT' || c.k==='X') ? '' : 'miss';
    const keyLabel = c.k==='X' ? 'X' : c.k==='OUT' ? 'O' : c.k;
    return `<div class="cat ${st} ${cls}" data-k="${c.k}"><span class="k">${keyLabel}</span><span class="n">${esc(c.n)}${c.opt?' <small>(se houver)</small>':''}${c.link?` <a href="${c.link}" target="_blank" rel="noopener noreferrer" title="Abrir site para emitir">↗ emitir</a>`:''}</span><span class="c">${n}</span></div>`;
  };
  $('#cats').innerHTML = CATS.map(c=>row(c)).join('') + row(EXTRA.OUT,'sep') + row(EXTRA.X) +
    `<div class="cat" data-k="__none"><span class="k">⌫</span><span class="n">Remover classificação</span><span class="c"></span></div>`;
  const pend = items.filter(i=>i.cat==null).length;
  const missing = CATS.filter(c=>!c.opt && !m[c.k]);
  $('#summary').innerHTML = !items.length ? 'Nenhum arquivo carregado.' :
    `<b>${items.length}</b> páginas · <b style="color:${pend?'var(--warn)':'var(--ok)'}">${pend}</b> sem classificação · <b style="color:${items.some(i=>i.check)?'var(--warn)':'var(--ok)'}">${items.filter(i=>i.check).length}</b> para conferir (⚠)<br>`+
    (missing.length ? `<span style="color:var(--warn)">Faltando ${missing.length} obrigatório(s): ${missing.map(c=>c.k).join(', ')}</span>` : '<span style="color:var(--ok)">✓ Todos os obrigatórios presentes</span>');

  // grid
  if(!items.length){
    grid.innerHTML = `<div class="empty"><h2>Arraste aqui o PDF do candidato</h2>
      <div class="hint">ou clique em <b>+ Adicionar arquivos</b>. Também aceita fotos (JPG/PNG) e vários PDFs de uma vez.</div>
      <ol><li>Informe o nome completo do candidato e aguarde: o programa lê e classifica cada página sozinho.</li>
      <li>Confira as páginas com <b>⚠</b> e as sem classificação (selecione e digite o número do documento, ou clique na lista à esquerda).</li>
      <li>Confira a aba <b>Ordem de impressão</b>.</li>
      <li>Clique em <b>Baixar PDF organizado</b> ou <b>Abrir para imprimir</b>.</li>
      <li>Ao terminar o candidato, clique em <b>Limpar</b>.</li></ol>
      <div class="hint">🔒 Tudo acontece neste computador. Nenhum documento é enviado para a internet.</div></div>`;
    return;
  }
  if(view==='classify'){ grid.innerHTML = items.map(cardHTML).join(''); return; }
  const groups = [...CATS, EXTRA.OUT].map(c=>{
    const its = items.filter(i=>i.cat===c.k);
    if(!its.length && (c.opt || c.k==='OUT')) return '';
    const pill = its.length ? `<span class="pill ok">${its.length} pág.</span>` : `<span class="pill miss">faltando</span>`;
    return `<div class="group"><h3>${c.k==='OUT'?'':esc(c.k)+' – '}${esc(c.n)} ${pill}</h3><div class="row">${its.map(cardHTML).join('')}</div></div>`;
  });
  const un = items.filter(i=>i.cat==null), dx = items.filter(i=>i.cat==='X');
  if(un.length) groups.push(`<div class="group"><h3>Sem classificação <span class="pill miss">vão para o final</span></h3><div class="row">${un.map(cardHTML).join('')}</div></div>`);
  if(dx.length) groups.push(`<div class="group"><h3>Descartadas <span class="pill opt">não serão impressas</span></h3><div class="row">${dx.map(cardHTML).join('')}</div></div>`);
  grid.innerHTML = groups.join('');
}
function updateButtons(){
  const ok = items.length && !loading && finalOrder().length;
  $('#btnSave').disabled = !ok; $('#btnPrint').disabled = !ok;
}
function refresh(){ render(); updateButtons(); if(modalId!=null) showModal(); }

/* ---------- ações ---------- */
function assign(k){
  if(!sel.size){ toast('Selecione uma ou mais páginas primeiro'); return; }
  const key = k==='__none' ? null : k;
  const ids = [...sel];
  for(const it of items) if(sel.has(it.id)){ it.cat = key; it.manual = true; it.check = false; }
  const c = key && catByKey(key);
  toast(`${ids.length} pág. → ${key==null?'sem classificação':(key==='X'||key==='OUT'?'':key+' – ')+(c?c.n:'')}`);
  if(view==='classify'){ // avança para a próxima página
    const order = visibleOrder();
    const last = Math.max(...ids.map(id=>order.findIndex(i=>i.id===id)));
    const nxt = order[last+1];
    if(nxt){ sel = new Set([nxt.id]); anchor = nxt.id; if(modalId!=null) modalId = nxt.id; }
  }
  refresh(); scrollToSel();
}
function rotateSel(){ if(!sel.size) return; for(const it of items) if(sel.has(it.id)) it.rot=(it.rot+90)%360; refresh(); }
function move(d){
  const order = visibleOrder(); if(!order.length) return;
  let i = anchor!=null ? order.findIndex(x=>x.id===anchor) : -1;
  i = Math.max(0, Math.min(order.length-1, i+d));
  sel = new Set([order[i].id]); anchor = order[i].id; if(modalId!=null) modalId=anchor;
  refresh(); scrollToSel();
}
function scrollToSel(){ const el = grid.querySelector(`.card[data-id="${anchor}"]`); if(el) el.scrollIntoView({block:'nearest'}); }

/* ---------- eventos ---------- */
$('#btnAdd').onclick = () => $('#file').click();
$('#nome').addEventListener('change', ()=>{ reviewSet(); refresh(); });
$('#file').onchange = e => { addFiles(e.target.files); e.target.value=''; };
$('#btnClear').onclick = () => {
  if(items.length && !confirm('Limpar todas as páginas? (Os arquivos originais não são alterados.)')) return;
  readGen++;
  for(const s of sources){ if(s.pjs) s.pjs.destroy(); if(s.url) URL.revokeObjectURL(s.url); }
  sources=[]; items=[]; sel.clear(); anchor=null; $('#nome').value=''; askedName=false; closeModal(); refresh();
};
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{ view=b.dataset.v; document.querySelectorAll('.tabs button').forEach(x=>x.classList.toggle('on',x===b)); render(); });
$('#cats').addEventListener('click', e=>{ if(e.target.closest('a')) return; const r=e.target.closest('.cat'); if(r) assign(r.dataset.k); });

grid.addEventListener('click', e=>{
  const card = e.target.closest('.card'); if(!card) return;
  const id = +card.dataset.id;
  if(e.shiftKey && anchor!=null){
    const order = visibleOrder(); const a=order.findIndex(i=>i.id===anchor), b=order.findIndex(i=>i.id===id);
    sel = new Set(order.slice(Math.min(a,b), Math.max(a,b)+1).map(i=>i.id));
  } else if(e.ctrlKey || e.metaKey){ sel.has(id)?sel.delete(id):sel.add(id); anchor=id; }
  else { sel = new Set([id]); anchor=id; }
  render();
});
grid.addEventListener('dblclick', e=>{ const card=e.target.closest('.card'); if(card){ sel=new Set([+card.dataset.id]); anchor=+card.dataset.id; openModal(anchor); } });

// arrastar para reordenar (aba Classificar)
let dragId = null;
grid.addEventListener('dragstart', e=>{ const c=e.target.closest('.card'); if(!c||view!=='classify') return; dragId=+c.dataset.id; e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData('text/plain','x'); });
grid.addEventListener('dragover', e=>{
  if(dragId==null) return; e.preventDefault();
  grid.querySelectorAll('.dropL,.dropR').forEach(x=>x.classList.remove('dropL','dropR'));
  const c=e.target.closest('.card'); if(!c) return; const r=c.getBoundingClientRect();
  c.classList.add(e.clientX < r.left+r.width/2 ? 'dropL':'dropR');
});
grid.addEventListener('drop', e=>{
  if(dragId==null) return; e.preventDefault(); e.stopPropagation();
  const c=e.target.closest('.card');
  if(c && +c.dataset.id!==dragId){
    const r=c.getBoundingClientRect(), after = e.clientX >= r.left+r.width/2;
    const from = items.findIndex(i=>i.id===dragId); const [it]=items.splice(from,1);
    let to = items.findIndex(i=>i.id===+c.dataset.id) + (after?1:0); items.splice(to,0,it);
  }
  dragId=null; render();
});
grid.addEventListener('dragend', ()=>{ dragId=null; grid.querySelectorAll('.dropL,.dropR').forEach(x=>x.classList.remove('dropL','dropR')); });

// soltar arquivos do computador
const isFileDrag = e => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
window.addEventListener('dragover', e=>{ if(isFileDrag(e)){ e.preventDefault(); document.body.classList.add('dragging'); } });
window.addEventListener('dragleave', e=>{ if(!e.relatedTarget) document.body.classList.remove('dragging'); });
window.addEventListener('drop', e=>{ if(isFileDrag(e)){ e.preventDefault(); document.body.classList.remove('dragging'); if(!locked) addFiles(e.dataTransfer.files); } });

// teclado
let buf='', bufT=null;
function flushBuf(){
  clearTimeout(bufT); const s=buf; buf=''; if(!s) return;
  const n = parseInt(s,10); const k = n===24 ? '24a' : String(n).padStart(2,'0');
  if(CATS.some(c=>c.k===k)) assign(k); else toast('Não existe documento nº '+s);
}
document.addEventListener('keydown', e=>{
  if(locked || e.target.matches('input,textarea')) return;
  if(e.ctrlKey||e.metaKey){ if(e.key==='a'){ e.preventDefault(); sel=new Set(visibleOrder().map(i=>i.id)); render(); } return; }
  if(/^[0-9]$/.test(e.key)){
    e.preventDefault(); buf+=e.key; clearTimeout(bufT);
    if(buf.length>=2 || /^[3-9]$/.test(buf) || buf==='0') { if(buf==='0') return; flushBuf(); }
    else bufT=setTimeout(flushBuf, 700);
    return;
  }
  const k=e.key.toLowerCase();
  if(k==='x'||e.key==='Delete'){ assign('X'); }
  else if(k==='o'){ assign('OUT'); }
  else if(e.key==='Backspace'){ e.preventDefault(); assign('__none'); }
  else if(k==='r'){ rotateSel(); }
  else if(e.key==='ArrowRight'||e.key==='ArrowDown'){ e.preventDefault(); move(1); }
  else if(e.key==='ArrowLeft'||e.key==='ArrowUp'){ e.preventDefault(); move(-1); }
  else if(e.key==='Enter'||e.key===' '){ e.preventDefault(); if(modalId!=null) closeModal(); else if(anchor!=null) openModal(anchor); }
  else if(e.key==='Escape'){ if(modalId!=null) closeModal(); else { sel.clear(); render(); } }
});

/* ---------- ampliar ---------- */
let modalToken=0;
function openModal(id){ modalId=id; $('#modal').classList.add('on'); showModal(); }
function closeModal(){ modalId=null; $('#modal').classList.remove('on'); $('#mBody').innerHTML=''; }
async function showModal(){
  const it = items.find(i=>i.id===modalId); if(!it){ closeModal(); return; }
  const tok = ++modalToken; const c = it.cat && catByKey(it.cat);
  $('#mInfo').textContent = `${it.name} · ${it.page==null?'imagem':'página '+(it.page+1)} · ${c? (it.cat.length<=3&&it.cat!=='OUT'&&it.cat!=='X'?it.cat+' – ':'')+c.n : 'sem classificação'}  (digite o nº para classificar)`;
  const src = sources[it.src]; const rot = ((it.origRot+it.rot)%360+360)%360;
  const body=$('#mBody');
  if(src.kind==='pdf'){
    const page = await src.pjs.getPage(it.page+1);
    const vp1 = page.getViewport({scale:1, rotation:rot});
    const s = Math.min(innerWidth*0.92/vp1.width, innerHeight*0.84/vp1.height) * (devicePixelRatio||1);
    const vp = page.getViewport({scale:s, rotation:rot});
    const cv=document.createElement('canvas'); cv.width=vp.width; cv.height=vp.height;
    cv.style.width=(vp.width/(devicePixelRatio||1))+'px';
    await page.render({canvasContext:cv.getContext('2d'), viewport:vp}).promise;
    if(tok===modalToken){ body.innerHTML=''; body.appendChild(cv); }
  } else {
    const cv = rotatedCanvas(src.img, it.rot, 2400);
    if(tok===modalToken){ body.innerHTML=''; body.appendChild(cv); }
  }
}
$('#mClose').onclick=closeModal; $('#mPrev').onclick=()=>move(-1); $('#mNext').onclick=()=>move(1); $('#mRot').onclick=rotateSel;
$('#modal').addEventListener('click', e=>{ if(e.target.id==='modal') closeModal(); });

/* ---------- gerar PDF ---------- */
function rotatedCanvas(img, rot, maxDim){
  const r=((rot%360)+360)%360, w=img.naturalWidth, h=img.naturalHeight;
  const s=Math.min(1, maxDim/Math.max(w,h)); const sw=Math.round(w*s), sh=Math.round(h*s);
  const cv=document.createElement('canvas'); const swap=r===90||r===270;
  cv.width=swap?sh:sw; cv.height=swap?sw:sh;
  const ctx=cv.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,cv.width,cv.height);
  ctx.translate(cv.width/2, cv.height/2); ctx.rotate(r*Math.PI/180); ctx.drawImage(img,-sw/2,-sh/2,sw,sh);
  return cv;
}
const winAnsi = s => s.replace(/[^\x20-\x7E -ÿ–—•’‘“”]/g,'');
async function addCover(out, ordered){
  const {StandardFonts, rgb} = PDFLib;
  const p = out.addPage([595.28, 841.89]);
  const f = await out.embedFont(StandardFonts.Helvetica), fb = await out.embedFont(StandardFonts.HelveticaBold);
  let y = 790;
  p.drawText('DOCUMENTAÇÃO DE CANDIDATO', {x:50, y, size:18, font:fb}); y-=28;
  const nome = winAnsi($('#nome').value.trim());
  if(nome){ p.drawText('Candidato: '+nome, {x:50, y, size:12, font:f}); y-=18; }
  p.drawText('Data: '+new Date().toLocaleDateString('pt-BR'), {x:50, y, size:10, font:f, color:rgb(.4,.4,.4)}); y-=28;
  const m={}; for(const it of ordered) if(it.cat) m[it.cat]=(m[it.cat]||0)+1;
  for(const c of CATS){
    const n=m[c.k]||0;
    const mark = n ? 'OK' : c.opt ? '—' : 'FALTA';
    const col = n ? rgb(.09,.5,.2) : c.opt ? rgb(.55,.55,.55) : rgb(.8,.15,.15);
    p.drawText(mark, {x:50, y, size:10, font:fb, color:col});
    p.drawText(winAnsi(`${c.k} – ${c.n}${c.opt?' (se houver)':''}`), {x:100, y, size:10.5, font:f});
    if(n) p.drawText(`${n} pág.`, {x:500, y, size:9, font:f, color:rgb(.4,.4,.4)});
    y-=22;
  }
}
async function buildPdf(){
  const {PDFDocument, degrees} = PDFLib;
  const ordered = finalOrder();
  const out = await PDFDocument.create();
  if($('#capa').checked) await addCover(out, ordered);
  const cache = new Map();
  let n=0;
  for(const it of ordered){
    $('#progress').textContent = `Montando PDF: ${++n} de ${ordered.length}…`;
    const src = sources[it.src];
    if(src.kind==='pdf'){
      let doc = cache.get(it.src);
      if(!doc){ doc = await PDFDocument.load(src.bytes, {ignoreEncryption:true}); cache.set(it.src, doc); }
      const [pg] = await out.copyPages(doc, [it.page]);
      pg.setRotation(degrees(((it.origRot+it.rot)%360+360)%360));
      out.addPage(pg);
    } else {
      const cv = rotatedCanvas(src.img, it.rot, 2400);
      const jpg = await new Promise(r=>cv.toBlob(b=>b.arrayBuffer().then(r),'image/jpeg',0.9));
      const img = await out.embedJpg(jpg);
      const land = img.width>img.height, W = land?841.89:595.28, H = land?595.28:841.89, M=24;
      const s = Math.min((W-2*M)/img.width, (H-2*M)/img.height);
      const pg = out.addPage([W,H]);
      pg.drawImage(img, {x:(W-img.width*s)/2, y:(H-img.height*s)/2, width:img.width*s, height:img.height*s});
    }
  }
  out.setTitle(winAnsi('Documentação '+($('#nome').value.trim()||'candidato')));
  out.setProducer('Organizador de Documentos RH (offline)');
  const bytes = await out.save();
  $('#progress').textContent='';
  return new Blob([bytes], {type:'application/pdf'});
}
async function doExport(mode){
  const un = items.filter(i=>i.cat==null).length;
  if(un && !confirm(`${un} página(s) ainda sem classificação. Elas vão para o final do PDF.\n\nContinuar mesmo assim?`)) return;
  const btns=[$('#btnSave'),$('#btnPrint')]; btns.forEach(b=>b.disabled=true);
  try{
    const blob = await buildPdf();
    const url = URL.createObjectURL(blob);
    if(mode==='print'){ window.open(url,'_blank'); toast('PDF aberto em nova aba — use Ctrl+P para imprimir'); }
    else {
      const nome = $('#nome').value.trim().replace(/[\\/:*?"<>|]+/g,'').replace(/\s+/g,' ');
      const a=document.createElement('a'); a.href=url; a.download=(nome?nome+' - ':'')+'Documentação organizada.pdf';
      document.body.appendChild(a); a.click(); a.remove(); toast('PDF baixado');
    }
    setTimeout(()=>URL.revokeObjectURL(url), 120000);
  }catch(e){ console.error(e); toast('Erro ao gerar o PDF: '+e.message); $('#progress').textContent=''; }
  updateButtons();
}
$('#btnSave').onclick=()=>doExport('save');
$('#btnPrint').onclick=()=>doExport('print');

/* ---------- senha e bloqueio ---------- */
// Tela de bloqueio: guarda só o resumo da senha. Os documentos continuam só na memória.
const PASS = {salt:'1949e4c7c951c0611e4c06df1eb21e1a', iter:200000, hash:'0bfb0aa9f8c757123ebe26f1ec82e28cb68d88778edfc43d251daa7a02d2ca49'};
const IDLE_MS = 10*60*1000;
let lastUse = Date.now();
async function hashPass(pass){
  const salt=Uint8Array.from(PASS.salt.match(/../g), x=>parseInt(x,16));
  const key=await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2', hash:'SHA-256', salt, iterations:PASS.iter}, key, 256);
  return [...new Uint8Array(bits)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function lock(){ locked=true; $('#lock').classList.remove('off'); $('#lockPass').value=''; $('#lockErr').textContent=''; $('#lockPass').focus(); }
function unlock(){ locked=false; lastUse=Date.now(); $('#lock').classList.add('off'); $('#lockPass').value=''; }
$('#lockForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const err=$('#lockErr'), btn=$('#lockBtn');
  err.textContent='';
  if(!crypto.subtle){ err.textContent='Este navegador não permite usar a senha aqui. Use o Chrome ou o Edge.'; return; }
  btn.disabled=true;
  try{
    if(await hashPass($('#lockPass').value)===PASS.hash) return unlock();
    await new Promise(r=>setTimeout(r,1000)); // atrasa tentativas repetidas
    err.textContent='Senha incorreta.'; $('#lockPass').value=''; $('#lockPass').focus();
  } finally { btn.disabled=false; }
});
$('#btnLock').onclick=lock;
for(const ev of ['mousemove','mousedown','keydown','wheel','touchstart']) window.addEventListener(ev, ()=>{ if(!locked) lastUse=Date.now(); }, {passive:true});
const checkIdle=()=>{ if(!locked && Date.now()-lastUse>=IDLE_MS) lock(); };
setInterval(checkIdle, 15000);
document.addEventListener('visibilitychange', checkIdle);
lock();
refresh();
