"use strict";
pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([Uint8Array.from(atob(window.PDFJS_WORKER), c=>c.charCodeAt(0))], {type:'text/javascript'}));

// Lista padrão. Em todas as listas, cada item tem um tipo (t) que diz qual regra de leitura automática ele usa.
const DEFAULT_CATS = [
  {k:'01', n:'01 Foto 3x4'},
  {k:'02', n:'Ficha de solicitação de emprego'},
  // link: botão "emitir" no site · plink: link impresso na capa (o da ficha em papel)
  {k:'03', n:'Comprovante de situação cadastral no CPF', link:'https://servicos.receita.fazenda.gov.br/servicos/cpf/consultasituacao/consultapublica.asp', plink:'https://l1nk.dev/comprovantesituacaocadastral'},
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
  {k:'20', n:'Certidão judicial criminal', link:'https://certidoes.trf5.jus.br/certidoes2022/', plink:'https://acesse.one/certidaocriminal'},
  {k:'21', n:'Certidão negativa da Justiça Eleitoral', link:'https://certidoes.trf5.jus.br/certidoes2022/', plink:'https://encr.pw/certidaoeleitoral'},
  {k:'22', n:'Certidão negativa da Justiça Federal', link:'https://certidoes.trf5.jus.br/certidoes2022/', plink:'https://www.cjf.jus.br/cjf/certidao-negativa'},
  {k:'23', n:'Certidão negativa da Justiça Militar Federal', link:'https://www2.stm.jus.br/ceneg_internet/emitir/index.php', plink:'www.stm.gov.br'},
  {k:'24a', n:'Se tiver filhos igual ou menor que 14 anos – Xerox certidão de nascimento', opt:true},
  {k:'24b', n:'Se tiver filhos igual ou menor que 14 anos – Xerox CPF', opt:true},
  {k:'24c', n:'Se tiver filhos igual ou menor que 14 anos – Cartão de vacina', opt:true},
  {k:'24d', n:'Se tiver filhos igual ou menor que 14 anos – Declaração do colégio', opt:true},
];
// nomes antigos da lista padrão (para atualizar a cópia já salva no navegador)
const OLD_DEFAULT_NAMES = {'Foto 3x4':'01 Foto 3x4',
  'Filhos até 14 anos – certidão de nascimento':DEFAULT_CATS[22].n, 'Filhos até 14 anos – CPF':DEFAULT_CATS[23].n,
  'Filhos até 14 anos – cartão de vacina':DEFAULT_CATS[24].n, 'Filhos até 14 anos – declaração do colégio':DEFAULT_CATS[25].n};
const DEFAULT_LIST_NAME = 'RELAÇÃO DOC - SEGURANÇA';
const DEFAULT_LIST = () => ({id:'padrao', name:DEFAULT_LIST_NAME, items:DEFAULT_CATS.map(c=>({...c, t:c.k}))});
const EXTRA = {OUT:{k:'OUT', n:'Outros documentos (vão depois do último item)'}, X:{k:'X', n:'Descartar (não imprimir)'}};
let LIST = null, CATS = [], ORDER = [];
const catByKey = k => CATS.find(c=>c.k===k) || EXTRA[k];
const rank = k => k==null ? ORDER.length : ORDER.indexOf(k);
const keyForType = t => { const c = t && (CATS.find(c=>c.t===t) || CATS.find(c=>catTypes(c).includes(t))); return c ? c.k : null; };
function useList(list){ LIST=list; CATS=list.items; ORDER=[...CATS.map(c=>c.k), 'OUT']; }

/* listas salvas neste navegador */
const LISTS_KEY='rh-organizador-listas', ACTIVE_KEY='rh-organizador-lista-ativa';
function loadLists(){
  try{
    const v=JSON.parse(localStorage.getItem(LISTS_KEY));
    if(Array.isArray(v) && v.some(l=>l.id==='padrao')){
      // atualiza nomes antigos da lista padrão já salva no navegador
      for(const l of v) if(l.id==='padrao'){
        if(l.name==='Lista padrão (vigilante)') l.name=DEFAULT_LIST_NAME;
        for(const c of l.items){
          if(OLD_DEFAULT_NAMES[c.n]) c.n=OLD_DEFAULT_NAMES[c.n];
          // links da capa: o site continua com o link oficial; a capa ganha o da ficha
          const d=DEFAULT_CATS.find(x=>x.k===c.k);
          if(d && d.plink){
            if(c.link===d.plink) c.link=d.link; // cópia que chegou a ficar com o link da ficha no site
            if(!c.plink && c.link===d.link) c.plink=d.plink;
          }
          if(c.k==='17' && c.t==='17' && c.opt && !c.note) c.note='se for casado';
        }
      }
      return v;
    }
  }catch(e){}
  return [DEFAULT_LIST()];
}
function saveLists(lists, activeId){
  try{ localStorage.setItem(LISTS_KEY, JSON.stringify(lists)); localStorage.setItem(ACTIVE_KEY, activeId); return true; }catch(e){ return false; }
}
function activeListId(){ try{ return localStorage.getItem(ACTIVE_KEY); }catch(e){ return null; } }
{ const ls=loadLists(); useList(ls.find(l=>l.id===activeListId()) || ls[0]); }

let locked = true;
let sources = [], items = [], sel = new Set(), anchor = null, view = 'classify', nextId = 1, loading = 0, modalId = null;
const $ = s => document.querySelector(s);
const grid = $('#grid');

function toast(msg, ms=2200){ const t=$('#toast'); t.textContent=msg; t.classList.add('on'); clearTimeout(toast.h); toast.h=setTimeout(()=>t.classList.remove('on'),ms); }
async function copyText(txt){
  try{ await navigator.clipboard.writeText(txt); }
  catch(err){ const t=document.createElement('textarea'); t.value=txt; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
}
function esc(s){ return String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

/* ---------- carregar arquivos ---------- */
async function addFiles(fileList){
  const files = [...fileList];
  if(!files.length) return;
  if(!$('#nome').value.trim() && !askedName){
    askedName=true;
    const v=prompt('Qual é o nome completo do candidato?\n\nEle é usado para separar os documentos do candidato (certidão de nascimento, cartão de vacina e CPF) dos documentos dos filhos.\n\nSe deixar em branco, o programa tenta identificar o nome pelos documentos.');
    if(v && v.trim()){ $('#nome').value=v.trim(); nameTyped=true; }
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
    items.push({id:nextId++, src, page:i-1, origRot:page.rotate||0, rot:0, cat:null, thumb:c.toDataURL('image/jpeg',0.8), name:f.name, ...namedByFile(f.name)});
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
  items.push({id:nextId++, src, page:null, origRot:0, rot:0, cat:null, thumb:c.toDataURL('image/jpeg',0.8), name:f.name, ...namedByFile(f.name)});
  render();
}
// arquivo que você já nomeou ("RG.jpg", "comprovante de residencia.pdf"): classifica pelo nome, sem OCR
function namedByFile(fileName){
  const base=fileName.replace(/\.[^.]+$/,'').replace(/[_\-.]+/g,' ');
  const t=typeForName(base);
  if(t==='01' && !/3\s*x\s*4/i.test(base)) return {}; // "foto 1.jpg" não é necessariamente a foto 3x4
  let k=keyForType(t);
  if(!k && FALLBACK[t]) k=keyForType(FALLBACK[t]);
  if(!k) return {};
  const c=catByKey(k);
  return {cat:k, manual:true, mtype:c.t, mname:norm(c.n)};
}

/* ---------- leitura automática (OCR neste computador) ---------- */
const RULES = {
  '02':[[/solicitacao de emprego/,10],[/ficha de (emprego|solicitacao)/,8],[/pretensao salarial/,4],[/experiencia profissional/,3]],
  '03':[[/comprovante de situacao cadastral/,12],[/situacao cadastral/,8],[/digito verificador/,2]],
  '04':[[/registro geral/,8],[/carteira de identidade/,8],[/instituto de identificacao/,5],[/valida em todo o territorio/,5],[/lei n?\s?7 ?116/,5],[/seguranca publica/,3],[/filiacao/,2],[/naturalidade/,1]],
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
  'cnh':[[/carteira nacional de habilitacao/,12],[/permissao para dirigir/,6],[/\bdetran\b/,4]],
  'banco':[[/(comprovante|dados) (de )?(conta|bancari)/,10],[/conta corrente/,5],[/titular da conta/,5],[/\bagencia\b/,2],[/\bbanco\b/,1]],
  'aso':[[/atestado de saude ocupacional/,12],[/exame admissional/,8],[/\baso\b/,6],[/(medico|medicina) do trabalho/,4],[/\bapto\b/,3]],
  'curriculo':[[/curriculo|curriculum/,10],[/objetivo profissional/,5],[/formacao academica/,4],[/experiencia profissional/,3]],
};
// tipos que só existem fora da lista padrão
const TYPE_NAMES = {cnh:'CNH (carteira de motorista)', banco:'Comprovante de conta bancária', aso:'Atestado de saúde ocupacional (ASO)', curriculo:'Currículo'};
const typeName = t => TYPE_NAMES[t] || (DEFAULT_CATS.find(c=>c.k===t)||{}).n;
const FALLBACK = {cnh:'04'}; // se a lista não pede CNH, ela entra no lugar do RG (com ⚠)
// nome do item da lista → tipo. A ordem importa: os nomes mais específicos vêm primeiro.
const ALIASES = [
  ['24a',/(filh|dependente).*nascimento|nascimento.*(filh|dependente)/],
  ['24b',/(filh|dependente).*\bcpf\b|\bcpf\b.*(filh|dependente)/],
  ['24c',/(filh|dependente).*vacina|vacina.*(filh|dependente)/],
  ['24d',/(filh|dependente).*(colegio|escola|matricula)|declaracao (de matricula|escolar|do colegio)/],
  ['03',/situacao cadastral/],
  ['23',/justica militar|tribunal militar/],
  ['22',/justica federal/],
  ['21',/(certidao|negativa|quitacao).*eleitora|crimes eleitorais/],
  ['20',/criminal|antecedentes/],
  ['13',/\bcnv\b|carteira nacional de vigilante/],
  ['15',/reciclagem/],
  ['14',/formacao.*vigilan|vigilan.*formacao|curso de formacao/],
  ['cnh',/\bcnh\b|habilitacao|carteira de motorista/],
  ['10',/carteira de trabalho|\bctps\b/],
  ['18',/vacina/],
  ['19',/sangu/],
  ['16',/nascimento/],
  ['17',/casamento|uniao estavel/],
  ['03',/situacao.*\bcpf\b/],
  ['04',/\brg\b|identidade|registro geral/],
  ['05',/\bcpf\b/],
  ['06',/titulo|eleitor/],
  ['07',/reservista|alistamento|servico militar/],
  ['08',/\bpis\b|pasep|\bnis\b/],
  ['11',/residencia|endereco/],
  ['12',/escolaridade|escolar|historico|diploma|conclusao|ensino/],
  ['aso',/\baso\b|saude ocupacional|exame admissional|atestado de saude/],
  ['banco',/bancari|conta (corrente|salario|poupanca)|\bbanco\b/],
  ['curriculo',/curriculo/],
  ['01',/\bfoto/],
  ['02',/ficha|solicitacao de emprego/],
];
const typeForName = n => { const t=norm(n); const a=ALIASES.find(([,re])=>re.test(t)); return a ? a[0] : null; };
// "RG ou CNH", "Certidão de nascimento / casamento": cada parte vale como um tipo aceito pelo item
const typesForName = n => [...new Set([typeForName(n), ...n.split(/\s+ou\s+|\s*\/\s*/i).map(typeForName)].filter(Boolean))];
const catTypes = c => [c.t, ...(c.alt||[])].filter(Boolean);
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
  return renderPage(await src.pjs.getPage(it.page+1), maxDim);
}
async function renderPage(page, maxDim){
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
const createOcr = () => withTimeout(Tesseract.createWorker('por',1,{workerPath:ocrWorkerUrl(), langPath:'https://ocr.local', workerBlobURL:false, cacheMethod:'none', gzip:true}),90000);
async function readItem(it, worker, gen){
  const src=sources[it.src];
  if(src.kind==='pdf'){
    const page=await src.pjs.getPage(it.page+1);
    const tc=await page.getTextContent();
    const raw=textLines(tc.items).join('\n');
    const r=classify(raw);
    if(r.len>=80 && r.score>=4) return finishItem(it,{...r,raw,rot:0},gen);
  }
  const base=await pageCanvas(it,2000);
  const ocr=async c=>{ const {data}=await worker.recognize(c); return {...classify(data.text), raw:data.text, conf:data.confidence}; };
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
  it.read=true; it.few=r.len<40; it.raw=r.raw||'';
  // guarda o que foi lido (tipo de documento); o item da lista é escolhido em reviewSet
  if(r.score>=4){
    it.rtype=r.k; it.rcheck=!(r.score>=8 && r.lead>=4); it.text=r.text;
    if(!it.manual && !it.rot && r.rot) it.rot=r.rot;
  } else if(r.photo){ it.rtype='01'; it.rcheck=true; }
}
// regras que dependem das páginas vizinhas, do nome do candidato e da lista em uso.
// Recalcula tudo a partir do que foi lido, então pode rodar de novo quando o nome ou a lista mudam.
function reviewSet(){
  const auto=it=>it.read && !it.manual;
  const typeOf=it=>it.manual ? it.mtype : it.type;
  for(const it of items) if(auto(it)){ it.type=it.rtype||null; it.check=!!it.rcheck; }
  const name=nameTokens($('#nome').value);
  const ownSeen=new Set(items.filter(it=>it.manual && it.mtype).map(it=>it.mtype));
  const unknown=[];
  for(const it of items){
    if(!auto(it) || !FAMILY[it.rtype]) continue;
    const o=name.length ? findOwner(it.text,name) : {};
    if(o.own || o.child){
      if(!o.own) it.type=FAMILY[it.rtype]; else ownSeen.add(it.rtype);
      it.check=it.rcheck || !o.strong || (o.own && o.child);
    } else unknown.push(it);
  }
  // nome não encontrado (sem nome digitado, leitura ruim ou nome de solteira): decide pela ordem e pede conferência
  for(const it of unknown){
    const prev=items[items.indexOf(it)-1];
    if(it.rtype!=='16' && prev && prev.rtype===it.rtype && !/\bnome\b/.test(it.text)){ it.type=typeOf(prev); it.check=true; } // continuação do mesmo cartão
    // CPF/vacina com o nome de outra pessoa. A certidão fica de fora: a da candidata pode estar com o nome de solteira.
    else if(it.rtype!=='16' && otherPerson(it, name)){ it.type=FAMILY[it.rtype]; it.check=true; }
    else if(ownSeen.has(it.rtype)){ it.type=FAMILY[it.rtype]; it.check=true; }
    else { ownSeen.add(it.rtype); if(name.length) it.check=true; }
  }
  const twoSided=['04','10','14'];
  const inherit=(it,nb)=>{ if(nb && auto(it) && it.few && !it.type && twoSided.includes(typeOf(nb))){ it.type=typeOf(nb); it.check=true; } };
  items.forEach((it,i)=>inherit(it,items[i-1]));
  items.forEach((it,i)=>inherit(it,items[i+1]));
  // tipo → item da lista em uso; documento que a lista não pede vai para "Outros", com ⚠
  for(const it of items){
    if(!auto(it)) continue;
    if(!it.type){ it.cat=null; continue; }
    let k=keyForType(it.type);
    if(!k && FALLBACK[it.type]){ k=keyForType(FALLBACK[it.type]); it.check=true; }
    if(!k){ k='OUT'; it.check=true; }
    it.cat=k;
  }
}
/* ---------- dados do candidato (tirados do texto lido) ---------- */
const PERSON_W = {'03':6,'05':5,'04':5,'cnh':5,'10':3,'16':3,'06':2}; // peso de cada tipo de documento
const CHILD_TYPES = new Set(['24a','24b','24c','24d']);
const PARENT_RE = /\b(mae|pai|genitor|genitora|responsavel|filiacao|conjuge)\b/;
const NAME_STOP = /\b(cpf|data|nascimento|nasc|rg|sexo|filia\S*|naturalidade|doc\S*|inscri\S*|situa\S*|digito|assinatura|registro|nacionalidade|emiss\S*|expedi\S*|m[ãa]e|pai)\b/i;
const PERSON_FIELDS = [['nome','Nome completo'],['cpf','CPF'],['nasc','Data de nascimento'],['mae','Nome da mãe']];
let personEdit = {};
function cpfOk(d){
  if(!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  for(const n of [9,10]){ let s=0; for(let i=0;i<n;i++) s+=+d[i]*(n+1-i); if((s*10)%11%10!==+d[n]) return false; }
  return true;
}
const fmtCpf = d => `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
function cleanName(s){
  const w=String(s||'').split(NAME_STOP)[0].replace(/[^A-Za-zÀ-ÿ' ]+/g,' ').trim().toUpperCase().split(/\s+/).filter(Boolean);
  return w.length>=2 && w.length<=8 && w.every(x=>x.length>=2 || x==='E') ? w.join(' ') : '';
}
// valor depois do rótulo, na mesma linha ou na de baixo
const afterLabel = (lines, i, re) => cleanName(lines[i].replace(re,'')) || cleanName(lines[i+1]);
const nameLabel = /^.*?\bnome(\s+completo|\s+civil)?\b\s*[:\-]?\s*/i;
// o documento traz "Nome:" de outra pessoa, e nenhum "Nome:" com o nome do candidato
function otherPerson(it, typed){
  if(!typed.length || !it.raw) return false;
  const lines=it.raw.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  const names=lines.map((l,i)=>/\bnome\b/.test(norm(l)) && !PARENT_RE.test(norm(l)) ? afterLabel(lines,i,nameLabel) : '').filter(Boolean);
  return names.length>0 && !names.some(n=>{ const o=findOwner(n,typed); return o.own || o.child; });
}
function extractPerson(){
  if(!readData) return {}; // leitura dos dados desligada pelo botão "Ler"
  const typeOf=it=>it.manual ? it.mtype : it.type;
  const votes={nome:{}, cpf:{}, nasc:{}, mae:{}};
  const vote=(f,v,w,it,sure)=>{
    const o=votes[f][v]||(votes[f][v]={v, w:0, top:0, it, sure:false});
    o.w+=w; if(sure) o.sure=true; if(w>o.top){ o.top=w; o.it=it; }
  };
  const typed=nameTokens($('#nome').value), maxYear=new Date().getFullYear()-14;
  for(const it of items){
    const t=typeOf(it);
    if(!it.raw || it.cat==='X' || CHILD_TYPES.has(t)) continue; // documento de filho não conta
    const w=PERSON_W[t]||1, strong=w>=5;
    const lines=it.raw.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
    // documento com "Nome:" de outra pessoa (ex.: CPF do filho que caiu no item do candidato) não conta
    if(otherPerson(it, typed)) continue;
    lines.forEach((line,i)=>{
      const nl=norm(line), parent=PARENT_RE.test(nl);
      if(!parent){
        const found=new Set();
        for(const m of line.matchAll(/(?<!\d)(\d{3})[.\s]?(\d{3})[.\s]?(\d{3})\s?[-–.\s]?\s?(\d{2})(?!\d)/g)){
          const d=m.slice(1,5).join(''); if(cpfOk(d)){ found.add(d); vote('cpf',fmtCpf(d),w,it,strong); }
        }
        // depois do rótulo "CPF", corrige trocas comuns do OCR (7→/, 0→O, 1→I, 5→S, 8→B); só vale se os dígitos verificadores baterem
        const lab=line.match(/\bc\.?p\.?f\.?\b[^0-9A-Za-z]*(.{11,24})/i);
        if(!found.size && lab){
          const d=lab[1].replace(/[OoQD]/g,'0').replace(/[Il|!]/g,'1').replace(/[Ss]/g,'5').replace(/B/g,'8').replace(/\//g,'7').replace(/\D/g,'').slice(0,11);
          if(cpfOk(d)) vote('cpf',fmtCpf(d),w,it,false);
        }
      }
      if(/\bnasc/.test(nl) && !parent){
        for(const l of [line, lines[i+1]||'']){
          const m=l.match(/(\d{2})\s?[\/.\-]\s?(\d{2})\s?[\/.\-]\s?(\d{4})/);
          if(m && +m[1]>=1 && +m[1]<=31 && +m[2]>=1 && +m[2]<=12 && +m[3]>=1920 && +m[3]<=maxYear){ vote('nasc',`${m[1]}/${m[2]}/${m[3]}`,w,it,strong); break; }
        }
      }
      if(/\bnome\b/.test(nl) && !parent && !/nome (social|do empregador|da empresa)/.test(nl)){
        const v=afterLabel(lines,i,nameLabel);
        if(v) vote('nome',v,w+(typed.length && findOwner(v,typed).strong ? 3 : 0),it,strong);
      }
      if(/\b(nome da mae|mae)\b/.test(nl)){
        const v=afterLabel(lines,i,/^.*?\b(nome\s+da\s+m[ãa]e|m[ãa]e)\s*[:\-]?\s*/i);
        if(v) vote('mae',v,w+2,it,true);
      } else if(/\bfiliacao\b/.test(nl)){
        // sem o rótulo "mãe": na filiação o nome da mãe costuma vir por último, então só sugere (⚠)
        const rest=line.replace(/^.*?filia\S*\s*[:\-]?\s*/i,'');
        const parts=(cleanName(rest) ? rest.split(/\s+e\s+|\s*\/\s*/i) : [lines[i+1], lines[i+2]]).map(cleanName).filter(Boolean);
        if(parts.length>=2) vote('mae',parts[parts.length-1],1,it,false);
      }
    });
  }
  const out={};
  for(const f in votes){
    const vs=Object.values(votes[f]).sort((a,b)=>b.w-a.w);
    if(vs.length) out[f]={v:vs[0].v, it:vs[0].it, sure:vs[0].sure && (vs.length<2 || vs[0].w>=vs[1].w*2)};
  }
  return out;
}
// botão "Ler": liga/desliga a leitura de nome, CPF, nascimento e mãe (fica guardado neste navegador)
const READ_KEY='rh-organizador-ler-dados';
let readData = (()=>{ try{ return localStorage.getItem(READ_KEY)!=='0'; }catch(e){ return true; } })();
function setReadData(v){
  readData=v;
  try{ localStorage.setItem(READ_KEY, v?'1':'0'); }catch(e){}
  if(!v){ personEdit={}; const n=$('#nome'); if(n.classList.contains('auto')){ n.value=''; n.classList.remove('auto'); n.title=''; reviewSet(); } }
  render();
}
function renderPerson(){
  $('#readData').checked=readData;
  $('#person').classList.toggle('off', !readData);
  $('#personOff').hidden=readData;
  $('#btnCopyPerson').disabled=!readData;
  const p=extractPerson();
  for(const [f] of PERSON_FIELDS){
    const inp=$('#p_'+f), info=$('#pi_'+f), r=p[f], edited=personEdit[f]!=null;
    inp.disabled=!readData;
    if(!readData){ inp.value=''; inp.classList.remove('warn'); info.textContent=''; continue; }
    if(document.activeElement!==inp && !edited) inp.value=r ? r.v : '';
    inp.classList.toggle('warn', !edited && !!r && !r.sure);
    const c=r && r.it.cat && catByKey(r.it.cat);
    info.innerHTML = edited ? 'corrigido por você' : !r ? (items.some(i=>i.read) ? 'não encontrado' : '') :
      `${r.sure?'':'⚠ confira · '}<a href="#" data-id="${r.it.id}">ver ${esc(c ? c.n : r.it.name)}</a>`;
  }
  const typed=$('#nome').value.trim(), got=$('#p_nome').value.trim();
  if(typed && got && norm(typed)!==norm(got)) $('#pi_nome').insertAdjacentHTML('beforeend',' · <b>diferente do nome digitado no topo</b>');
}

// páginas que você já classificou (no site ou pelo nome do arquivo) não passam pelo OCR
const pendingRead = x => !x.read && !x.busy && !x.failed && !(x.manual && x.skipped);
const doneRead = x => x.read || x.failed || (x.manual && x.skipped);
async function skipItem(it){
  // só pega o texto digital do PDF, que é instantâneo, para os Dados do candidato
  const src=sources[it.src];
  if(src.kind==='pdf'){ try{ it.raw=textLines((await (await src.pjs.getPage(it.page+1)).getTextContent()).items).join('\n'); }catch(e){} }
  it.skipped=true;
}
async function readAll(){
  if(reading) return;
  reading=true; loading++; updateButtons();
  const gen=readGen;
  const workers=[];
  try{
    const run=async w=>{
      for(;;){
        const it=items.find(pendingRead); // inclui arquivos soltos durante a leitura
        if(!it || gen!==readGen) return;
        if(it.manual){ await skipItem(it); continue; }
        if(!w) return;
        it.busy=true; render();
        const total=items.length, done=items.filter(doneRead).length;
        setProgress(`Lendo os documentos: ${done+1} de ${total}…`, done/total);
        try{ await readItem(it,w,gen); }catch(e){ console.error(e); it.failed=true; }
        it.busy=false;
        if(gen===readGen){ reviewSet(); render(); }
      }
    };
    await run(null); // primeiro as já classificadas: não precisa preparar o OCR para elas
    if(gen===readGen && items.some(pendingRead)){
      const n=(navigator.hardwareConcurrency||2)>=4?2:1;
      setProgress('Preparando a leitura automática…', 0);
      for(let i=0;i<n;i++) workers.push(await createOcr());
      await Promise.all(workers.map(run));
    }
  }catch(e){
    console.error(e); toast('Leitura automática indisponível — classifique manualmente');
    for(const x of items) if(!doneRead(x)) x.failed=true; // entram na conferência manual
  }
  for(const w of workers) w.terminate();
  reading=false; loading--; setProgress('');
  if(gen!==readGen){ updateButtons(); if(items.some(x=>!doneRead(x))) readAll(); return; }
  autoName();
  updateButtons(); render();
  const pend=items.filter(i=>i.cat==null).length, chk=items.filter(i=>i.check).length;
  if(items.length) toast(`Leitura concluída: ${chk} para conferir, ${pend} sem classificação`);
}
// nome do candidato vazio e não digitado por você: usa o nome lido nos documentos (fica amarelo para conferir)
let nameTyped=false;
function autoName(){
  const n=$('#nome');
  if(!readData || nameTyped || n.value.trim()) return;
  const v=personEdit.nome ?? (extractPerson().nome || {}).v;
  if(!v) return;
  n.value=v; n.classList.add('auto'); n.classList.remove('need');
  n.title='Nome identificado pelos documentos: confira';
  reviewSet(); // com o nome, separa de novo os documentos do candidato e dos filhos
}

/* ---------- ordem ---------- */
function finalOrder(){
  return items.map((it,idx)=>({it,idx})).filter(x=>x.it.cat!=='X')
    .sort((a,b)=>rank(a.it.cat)-rank(b.it.cat) || a.idx-b.idx).map(x=>x.it);
}
// páginas que pedem atenção: com ⚠ ou sem classificação, depois de lidas
const needCheck = it => (it.check || it.cat==null) && (it.read || it.failed || it.manual);
let conferMode = false;
function visibleOrder(){
  const base = view==='classify' ? items : [...finalOrder(), ...items.filter(i=>i.cat==='X')];
  return conferMode ? base.filter(needCheck) : base;
}
function setProgress(text, frac){
  $('#progress').textContent = text;
  $('#pbar').hidden = frac==null;
  if(frac!=null) $('#pbar i').style.width = Math.round(frac*100)+'%';
}

/* ---------- render ---------- */
function cardHTML(it){
  const c = it.cat && catByKey(it.cat);
  const badge = it.cat==null ? '<div class="badge">? sem classificação</div>'
    : it.cat==='X' ? '<div class="badge x">Descartar</div>'
    : `<div class="badge ${it.check?'warn':'ok'}" title="${it.check?'Leitura incerta, confira: ':''}${esc(c.n)}">${it.check?'⚠ ':''}${it.cat==='OUT'?'Outros':esc(it.cat)+' · '+esc(c.n)}</div>`;
  const r = ((it.rot%360)+360)%360;
  const pg = it.page==null ? 'imagem' : 'p. '+(it.page+1);
  return `<div class="card${sel.has(it.id)?' sel':''}${it.cat==='X'?' disc':''}${it.busy?' busy':''}" data-id="${it.id}" draggable="${view==='classify'}">
    ${badge}${it.busy?'<div class="reading">Lendo…</div>':''}<div class="img"><img class="r${r}" src="${it.thumb}" style="transform:rotate(${r}deg)" alt=""></div>
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
    return `<div class="cat ${st} ${cls}" data-k="${esc(c.k)}"><span class="k">${esc(keyLabel)}</span><span class="n">${esc(c.n)}${c.opt?` <small>(${esc(c.note||'se houver')})</small>`:''}${c.link?` <a href="${esc(/^https?:\/\//i.test(c.link) ? c.link : 'https://'+c.link)}" target="_blank" rel="noopener noreferrer" title="Abrir site para emitir">↗ emitir</a>`:''}</span><span class="c">${n}</span></div>`;
  };
  $('#cats').innerHTML = CATS.map(c=>row(c)).join('') + row(EXTRA.OUT,'sep') + row(EXTRA.X) +
    `<div class="cat" data-k="__none"><span class="k">⌫</span><span class="n">Remover classificação</span><span class="c"></span></div>`;
  $('#listName').textContent = LIST.name;
  const pend = items.filter(i=>i.cat==null).length;
  const missing = CATS.filter(c=>!c.opt && !m[c.k]);
  $('#summary').innerHTML = !items.length ? 'Nenhum arquivo carregado.' :
    `<b>${items.length}</b> páginas · <b style="color:${pend?'var(--warn)':'var(--ok)'}">${pend}</b> sem classificação · <b style="color:${items.some(i=>i.check)?'var(--warn)':'var(--ok)'}">${items.filter(i=>i.check).length}</b> para conferir (⚠)<br>`+
    (missing.length ? `<button type="button" class="missbtn" id="btnMiss">⚠ Faltam ${missing.length} documento(s) · ver e montar mensagem</button>` : '<span style="color:var(--ok)">✓ Todos os obrigatórios presentes</span>');
  renderPerson();
  const pendN = items.filter(needCheck).length, bc = $('#btnConfer');
  bc.textContent = conferMode ? `Mostrar todas as páginas (${pendN} para conferir)` : `⚠ Conferir (${pendN})`;
  bc.disabled = !conferMode && !pendN; bc.classList.toggle('on', conferMode);

  // grid
  if(!items.length){
    grid.innerHTML = `<div class="empty"><h2>Arraste aqui o PDF do candidato</h2>
      <div class="hint">ou clique em <b>+ Adicionar arquivos</b>. Também aceita fotos (JPG/PNG) e vários PDFs de uma vez.</div>
      <ol><li>Informe o nome completo do candidato e aguarde: o programa lê e classifica cada página sozinho.</li>
      <li>Confira as páginas com <b>⚠</b> e as sem classificação (selecione e digite o número do documento, ou clique na lista à esquerda).</li>
      <li>Confira a aba <b>Ordem de impressão</b>.</li>
      <li>Clique em <b>Baixar PDF organizado</b> ou <b>Abrir para imprimir</b>.</li>
      <li>Ao terminar o candidato, clique em <b>Limpar</b>.</li></ol>
      <div class="hint">Tudo acontece neste computador. Nenhum documento é enviado para a internet.</div></div>`;
    return;
  }
  const shown = it => !conferMode || needCheck(it);
  if(view==='classify'){ grid.innerHTML = items.filter(shown).map(cardHTML).join(''); return; }
  const groups = [...CATS, EXTRA.OUT].map(c=>{
    const its = items.filter(i=>i.cat===c.k && shown(i));
    if(!its.length && (c.opt || c.k==='OUT' || conferMode)) return '';
    const pill = its.length ? `<span class="pill ok">${its.length} pág.</span>` : `<span class="pill miss">faltando</span>`;
    return `<div class="group"><h3>${c.k==='OUT'?'':esc(c.k)+' – '}${esc(c.n)} ${pill}</h3><div class="row">${its.map(cardHTML).join('')}</div></div>`;
  });
  const un = items.filter(i=>i.cat==null && shown(i)), dx = items.filter(i=>i.cat==='X' && shown(i));
  if(un.length) groups.push(`<div class="group"><h3>Sem classificação <span class="pill miss">vão para o final</span></h3><div class="row">${un.map(cardHTML).join('')}</div></div>`);
  if(dx.length) groups.push(`<div class="group"><h3>Descartadas <span class="pill opt">não serão impressas</span></h3><div class="row">${dx.map(cardHTML).join('')}</div></div>`);
  grid.innerHTML = groups.join('');
}
function updateButtons(){
  const ok = items.length && !loading && finalOrder().length;
  $('#btnSave').disabled = !ok; $('#btnPrint').disabled = !ok;
  const why = loading ? 'Aguarde a leitura dos documentos terminar' : '';
  $('#btnSave').title = why; $('#btnPrint').title = why;
}
function refresh(){
  if(conferMode && !items.some(needCheck)){ conferMode=false; closeModal(); toast('✓ Tudo conferido'); }
  render(); updateButtons(); if(modalId!=null) showModal();
}

/* ---------- ações ---------- */
function assign(k){
  if(!sel.size){ toast('Selecione uma ou mais páginas primeiro'); return; }
  const key = k==='__none' ? null : k;
  const ids = [...sel];
  const c = key && catByKey(key);
  // guarda também o tipo e o nome do item, para manter a escolha se a lista for trocada
  for(const it of items) if(sel.has(it.id)){ it.cat = key; it.manual = true; it.check = false; it.mtype = c && c.t || null; it.mname = c ? norm(c.n) : null; }
  toast(`${ids.length} pág. → ${key==null?'sem classificação':(key==='X'||key==='OUT'?'':key+' – ')+(c?c.n:'')}`);
  goNextAfter(ids);
  refresh(); scrollToSel();
}
// avança para a próxima página visível (no modo conferir: a próxima que ainda pede atenção)
function goNextAfter(ids){
  if(view!=='classify') return;
  const order = visibleOrder();
  const last = Math.max(...ids.map(id=>items.findIndex(i=>i.id===id)));
  const nxt = order.find(i=>items.indexOf(i)>last) || (conferMode ? order[0] : null);
  if(nxt){ sel = new Set([nxt.id]); anchor = nxt.id; if(modalId!=null) modalId = nxt.id; }
}
// "está certo": tira o ⚠ mantendo a classificação
function confirmSel(){
  const its = items.filter(it=>sel.has(it.id) && it.cat!=null);
  if(!its.length){ toast(sel.size ? 'Página sem classificação: digite o nº do documento' : 'Selecione uma ou mais páginas primeiro'); return; }
  for(const it of its){ const c=catByKey(it.cat); it.check=false; it.manual=true; it.mtype=c && c.t || null; it.mname=norm(c.n); }
  toast(`${its.length} pág. conferida(s) ✓`);
  goNextAfter(its.map(it=>it.id));
  refresh(); scrollToSel();
}
function toggleConfer(){
  if(conferMode){ conferMode=false; refresh(); return; }
  const first = items.find(needCheck); if(!first) return;
  view='classify'; document.querySelectorAll('.tabs button').forEach(x=>x.classList.toggle('on', x.dataset.v==='classify'));
  conferMode=true; sel=new Set([first.id]); anchor=first.id;
  refresh(); openModal(first.id);
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
$('#nome').addEventListener('input', e=>{ nameTyped=true; e.target.classList.remove('auto'); e.target.title=''; });
for(const id of ['#nome','#v_posto','#v_empresa','#v_cidade']) $(id).addEventListener('input', e=>{ if(e.target.value.trim()) e.target.classList.remove('need'); });
$('#file').onchange = e => { addFiles(e.target.files); e.target.value=''; };
$('#btnClear').onclick = () => {
  if(items.length && !confirm('Limpar todas as páginas? (Os arquivos originais não são alterados.)')) return;
  readGen++;
  for(const s of sources){ if(s.pjs) s.pjs.destroy(); if(s.url) URL.revokeObjectURL(s.url); }
  sources=[]; items=[]; sel.clear(); anchor=null; $('#nome').value=''; $('#nome').classList.remove('auto'); nameTyped=false; askedName=false; personEdit={}; conferMode=false; closeModal(); refresh();
};
for(const [f] of PERSON_FIELDS) $('#p_'+f).addEventListener('input', e=>{ personEdit[f]=e.target.value.trim() ? e.target.value : null; renderPerson(); });
$('#person').addEventListener('click', e=>{ const a=e.target.closest('a[data-id]'); if(!a) return; e.preventDefault(); sel=new Set([+a.dataset.id]); anchor=+a.dataset.id; openModal(anchor); render(); });
$('#readToggle').addEventListener('click', e=>{
  e.preventDefault(); e.stopPropagation(); // fica no título do quadro: não abre/fecha o quadro
  setReadData(!readData);
  toast(readData ? 'Leitura dos dados do candidato ligada' : 'Leitura dos dados desligada: digite o nome do candidato', 4000);
});
$('#btnCopyPerson').onclick = async e=>{
  e.preventDefault(); // o botão fica no título do quadro: não abre/fecha o quadro
  await copyText([...PERSON_FIELDS.map(([f,l])=>`${l}: ${$('#p_'+f).value.trim()}`), ...VAGA_FIELDS.map(([f,l])=>`${l}: ${vaga(f)}`)].join('\n'));
  toast('Dados copiados');
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
window.addEventListener('drop', e=>{ if(isFileDrag(e)){ e.preventDefault(); document.body.classList.remove('dragging'); if(locked) return; if(listOpen) importList(e.dataTransfer.files[0]); else addFiles(e.dataTransfer.files); } });

// teclado
let buf='', bufT=null;
const keyNum = k => String(parseInt(k,10)); // '04' → '4', '24a' → '24'
function flushBuf(){
  clearTimeout(bufT); const s=buf; buf=''; if(!s) return;
  const c = CATS.find(c=>keyNum(c.k)===keyNum(s));
  if(c) assign(c.k); else toast('Não existe documento nº '+s);
}
document.addEventListener('keydown', e=>{
  if(locked || listOpen || missOpen || e.target.matches('input,textarea,select')) return;
  if(e.ctrlKey||e.metaKey){ if(e.key==='a'){ e.preventDefault(); sel=new Set(visibleOrder().map(i=>i.id)); render(); } return; }
  if(/^[0-9]$/.test(e.key)){
    e.preventDefault(); buf+=e.key; clearTimeout(bufT);
    if(buf==='0') return;
    // espera o próximo dígito só se algum número da lista começa com o que já foi digitado
    const p=keyNum(buf), longer=!(buf[0]==='0' && buf.length>1) && CATS.some(c=>{ const q=keyNum(c.k); return q.length>p.length && q.startsWith(p); });
    if(longer) bufT=setTimeout(flushBuf, 700); else flushBuf();
    return;
  }
  const k=e.key.toLowerCase();
  if(k==='x'||e.key==='Delete'){ assign('X'); }
  else if(k==='o'){ assign('OUT'); }
  else if(e.key==='Backspace'){ e.preventDefault(); assign('__none'); }
  else if(k==='r'){ rotateSel(); }
  else if(k==='v'){ confirmSel(); }
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
$('#mClose').onclick=closeModal; $('#mPrev').onclick=()=>move(-1); $('#mNext').onclick=()=>move(1); $('#mRot').onclick=rotateSel; $('#mOk').onclick=confirmSel;
$('#btnConfer').onclick=toggleConfer;
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
// Capa no formato da "RELAÇÃO DOCUMENTOS": título = nome da lista, dados do candidato no canto superior direito,
// itens "NN – NOME (link)" e subitens com o mesmo número (24a, 24b…) agrupados em marcadores.
async function addCover(out, ordered=finalOrder()){
  const {StandardFonts, rgb} = PDFLib;
  const W=595.28, H=841.89, M=56, MR=36, SIZE=10, LH=13;
  const f = await out.embedFont(StandardFonts.Helvetica), fb = await out.embedFont(StandardFonts.HelveticaBold);
  const black=rgb(0,0,0), blue=rgb(.02,.27,.76), marca=rgb(1,.93,.25);
  // documentos que o candidato entregou: grifados com marca-texto
  const has={}; for(const it of ordered) if(it.cat) has[it.cat]=true;
  // na capa, "Doc", "DOC", "docs" ou "doc." como palavra solta vira "DOCUMENTAÇÃO"
  const fullDoc = s => String(s).replace(/\bdocs?\b\.?/gi, 'documentação');
  const up = s => winAnsi(String(s).toLocaleUpperCase('pt-BR'));
  let p = out.addPage([W,H]), y = H-36;
  const nextLine = () => { y-=LH; if(y<50){ p=out.addPage([W,H]); y=H-60; } };
  // gap: espaço antes do pedaço (um texto que começa com espaço pode sair sem ele no PDF).
  // O link e seus parênteses podem ter letra menor (ls) que o resto da linha (ts).
  const sz = (q,ts,ls) => q.lk ? ls : ts;
  // A fonte não vai embutida: o leitor de PDF usa uma parecida, um pouco mais larga, e num nome longo o
  // texto avança alguns pontos além do calculado. "slack" deixa essa folga antes do link para não encostar.
  const gapOf = (q,before) => (q.gap||0) + (q.slack ? before*0.025 : 0);
  const width = (ps,ts,ls=ts) => ps.reduce((a,q)=>a+gapOf(q,a)+q.font.widthOfTextAtSize(q.t,sz(q,ts,ls)),0);
  const draw = (ps, x, ts, ls, hl) => {
    if(hl) p.drawRectangle({x:x-1.5, y:y-2.8, width:width(ps,ts,ls)+3, height:ts+2.8, color:marca});
    const x0=x;
    for(const q of ps){
      x+=gapOf(q,x-x0);
      const size=sz(q,ts,ls), w=q.font.widthOfTextAtSize(q.t,size), color=q.link?blue:black;
      p.drawText(q.t,{x,y,size,font:q.font,color});
      if(q.link) p.drawLine({start:{x,y:y-1.3}, end:{x:x+w,y:y-1.3}, thickness:.5, color});
      x+=w;
    }
  };
  // tentativas para o link caber ao lado do nome: primeiro diminui só o link, depois um pouco a linha toda
  const STEPS = [[10,10],[10,9],[10,8],[10,7],[9.5,7],[9,6.5],[8.5,6.5]];
  const line = (parts, x, hl) => {
    const avail=W-MR-x;
    // o link sai como está na lista; só perde o "https://" se não couber
    const short=parts.map(q=>q.link ? {...q, t:q.t.replace(/^https?:\/\//i,'')} : q);
    for(const [ts,ls] of STEPS) for(const ps of [parts, short]) if(width(ps,ts,ls)<=avail){ draw(ps,x,ts,ls,hl); return nextLine(); }
    parts=short;
    // último caso: o link desce para a linha de baixo, alinhado depois de "NN – "
    const li=parts.findIndex(q=>q.link);
    const head=li>1 ? parts.slice(0,li-1) : [];
    if(li>0 && width(head,SIZE)<=avail){
      draw(head,x,SIZE,SIZE,hl); nextLine();
      const rest=[{t:'(',font:f,lk:true}, ...parts.slice(li)], ind=x+width(parts.slice(0,2),SIZE);
      const [ts,ls]=STEPS.find(([t,l])=>width(rest,t,l)<=W-MR-ind) || STEPS[STEPS.length-1];
      draw(rest,ind,ts,ls,hl); return nextLine();
    }
    const [ts,ls]=STEPS[STEPS.length-1]; draw(parts,x,ts,ls,hl); nextLine();
  };
  // na capa sai o link da ficha (plink); se o item não tiver, o mesmo do site
  const linkParts = c => { const u=c.plink||c.link; return u ? [{t:'(',font:f,gap:3,slack:true,lk:true},{t:winAnsi(u),font:f,link:true,lk:true},{t:')',font:f,lk:true}] : []; };
  const noteText = c => c.opt && c.note ? ` (${up(c.note)})` : '';

  // canto superior direito
  const info = [['Nome', $('#nome').value.trim()], ...VAGA_FIELDS.map(([k,l])=>[l, vaga(k)])].filter(([,v])=>v);
  for(const [l,v] of info){
    const a=winAnsi(l+': '), b=up(v), sz=9;
    const x=W-36-fb.widthOfTextAtSize(a,sz)-f.widthOfTextAtSize(b,sz);
    p.drawText(a,{x,y,size:sz,font:fb}); p.drawText(b,{x:x+fb.widthOfTextAtSize(a,sz),y,size:sz,font:f});
    y-=11.5;
  }
  // título
  y = Math.min(y-18, H-92);
  const title = up(fullDoc(LIST.name)), ts=12;
  p.drawText(title,{x:(W-fb.widthOfTextAtSize(title,ts))/2, y, size:ts, font:fb});
  y -= 34;
  const dash = /\s[–—-]\s/;
  for(let i=0;i<CATS.length;i++){
    const c=CATS[i], m=c.k.match(/^(\d+)[a-z]$/);
    if(m && dash.test(c.n)){
      const prefix=c.n.split(dash)[0], grp=[];
      for(let j=i; j<CATS.length; j++){
        const mj=CATS[j].k.match(/^(\d+)[a-z]$/);
        if(!mj || mj[1]!==m[1] || !dash.test(CATS[j].n) || CATS[j].n.split(dash)[0]!==prefix) break;
        grp.push(CATS[j]);
      }
      if(grp.length>1){
        line([{t:m[1],font:fb},{t:' – ',font:f},{t:up(fullDoc(prefix))+':',font:f}], M);
        for(const g of grp){
          p.drawText('•',{x:M+38,y,size:SIZE,font:f});
          line([{t:up(fullDoc(g.n.split(dash).slice(1).join(' – ')))+noteText(g),font:f}, ...linkParts(g)], M+54, has[g.k]);
        }
        i+=grp.length-1; continue;
      }
    }
    line([{t:winAnsi(c.k),font:fb},{t:' – ',font:f},{t:up(fullDoc(c.n))+noteText(c),font:f}, ...linkParts(c)], M, has[c.k]);
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
/* ---------- salvar: pasta "NOME - POSTO - EMPRESA - CIDADE" ---------- */
const REQUIRED = [['#nome','nome do candidato'],['#v_posto','posto'],['#v_empresa','empresa'],['#v_cidade','cidade']];
// nome válido para pasta/arquivo no Windows
const safeName = s => s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g,' ').replace(/\s+/g,' ').trim().replace(/[. ]+$/,'').toLocaleUpperCase('pt-BR');
const exportName = () => REQUIRED.map(([s])=>safeName($(s).value)).join(' - ').slice(0,180);
// a pasta escolhida fica guardada neste navegador (IndexedDB), para não perguntar toda vez
function kv(mode, fn){
  return new Promise((res,rej)=>{
    const r=indexedDB.open('rh-organizador',1);
    r.onupgradeneeded=()=>r.result.createObjectStore('kv');
    r.onerror=()=>rej(r.error);
    r.onsuccess=()=>{ const tx=r.result.transaction('kv',mode), q=fn(tx.objectStore('kv')); tx.oncomplete=()=>res(q && q.result); tx.onerror=()=>rej(tx.error); };
  });
}
const kvGet = k => kv('readonly', s=>s.get(k)).catch(()=>null);
const kvSet = (k,v) => kv('readwrite', s=>s.put(v,k)).catch(()=>null);
async function pickFolder(change){
  let h = change ? null : await kvGet('pasta');
  if(h){
    let perm = await h.queryPermission({mode:'readwrite'});
    if(perm!=='granted') perm = await h.requestPermission({mode:'readwrite'});
    if(perm==='granted') return h;
  }
  h = await window.showDirectoryPicker({id:'rh-pdfs', mode:'readwrite'}); // cancelar = AbortError
  await kvSet('pasta', h); showFolder(h);
  return h;
}
function showFolder(h){ $('#btnFolder').title = h ? `Os PDFs são salvos em: ${h.name}\nClique para trocar a pasta` : 'Escolher a pasta onde os PDFs são salvos'; }
async function doExport(mode){
  const miss = REQUIRED.filter(([s])=>!$(s).value.trim());
  if(miss.length){
    miss.forEach(([s])=>$(s).classList.add('need')); $(miss[0][0]).focus();
    toast('Preencha antes de imprimir ou baixar: '+miss.map(x=>x[1]).join(', '), 5000);
    return;
  }
  const base = exportName();
  // a pasta é pedida antes de montar o PDF: o navegador só deixa escolher logo depois do clique
  let dir = null;
  if(mode==='save' && window.showDirectoryPicker){
    try{ dir = await pickFolder(false); }
    catch(e){ if(e.name==='AbortError'){ toast('Escolha a pasta onde salvar os PDFs', 4000); return; } console.error(e); }
  }
  const un = items.filter(i=>i.cat==null).length;
  if(un && !confirm(`${un} página(s) ainda sem classificação. Elas vão para o final do PDF.\n\nContinuar mesmo assim?`)) return;
  const btns=[$('#btnSave'),$('#btnPrint')]; btns.forEach(b=>b.disabled=true);
  try{
    const blob = await buildPdf();
    if(mode==='print'){
      const url = URL.createObjectURL(blob);
      window.open(url,'_blank'); toast('PDF aberto em nova aba — use Ctrl+P para imprimir');
      setTimeout(()=>URL.revokeObjectURL(url), 120000);
    } else if(dir){
      const sub = await dir.getDirectoryHandle(base, {create:true});
      let exists = true; try{ await sub.getFileHandle(base+'.pdf'); }catch(e){ exists = false; }
      if(exists && !confirm(`Já existe "${base}.pdf" nessa pasta.\n\nSubstituir pelo novo?`)){ updateButtons(); return; }
      const w = await (await sub.getFileHandle(base+'.pdf', {create:true})).createWritable();
      await w.write(blob); await w.close();
      toast(`PDF salvo em: ${dir.name}\\${base}`, 6000);
    } else {
      // navegador sem permissão para criar pastas: baixa só o arquivo, já com o nome certo
      const url = URL.createObjectURL(blob);
      const a=document.createElement('a'); a.href=url; a.download=base+'.pdf';
      document.body.appendChild(a); a.click(); a.remove();
      toast('PDF baixado (este navegador não deixa criar a pasta)', 5000);
      setTimeout(()=>URL.revokeObjectURL(url), 120000);
    }
  }catch(e){ console.error(e); toast('Erro ao gerar o PDF: '+e.message, 6000); $('#progress').textContent=''; }
  updateButtons();
}
$('#btnFolder').onclick = async ()=>{
  if(!window.showDirectoryPicker){ toast('Este navegador não deixa escolher a pasta. Use o Chrome ou o Edge.', 5000); return; }
  try{ const h=await pickFolder(true); toast(`Os PDFs serão salvos em: ${h.name}`, 4000); }catch(e){ if(e.name!=='AbortError') console.error(e); }
};
kvGet('pasta').then(h=>showFolder(h));

/* ---------- documentos faltantes + mensagem de WhatsApp ---------- */
let missOpen=false, missOff=new Set();
const missingDocs = () => { const m=counts(); return CATS.filter(c=>!c.opt && !m[c.k]); };
const docUpper = s => String(s).replace(/\bdocs?\b\.?/gi,'documentação').toLocaleUpperCase('pt-BR');
function missMessage(){
  const its=missingDocs().filter(c=>!missOff.has(c.k));
  return its.length ? '*DOCUMENTOS FALTANTES*\n'+its.map(c=>'• '+docUpper(c.n)).join('\n') : '';
}
function fillMiss(){
  const its=missingDocs();
  $('#mmList').innerHTML = its.length ? its.map(c=>`<label class="mm-item"><input type="checkbox" data-k="${esc(c.k)}"${missOff.has(c.k)?'':' checked'}> <b>${esc(c.k)}</b> ${esc(c.n)}</label>`).join('')
    : '<div class="hint">Nenhum documento obrigatório faltando.</div>';
  $('#mmText').value = missMessage();
  const pend=items.filter(i=>i.cat==null).length;
  $('#mmWarn').textContent = reading ? 'A leitura ainda não terminou: a lista pode mudar.'
    : pend ? `${pend} página(s) sem classificação: algum desses documentos pode estar nelas.` : '';
}
function openMiss(){ missOff=new Set(); missOpen=true; $('#missModal').classList.add('on'); fillMiss(); }
function closeMiss(){ missOpen=false; $('#missModal').classList.remove('on'); }
$('#summary').addEventListener('click', e=>{ if(e.target.closest('#btnMiss')) openMiss(); });
$('#mmList').addEventListener('change', e=>{ const k=e.target.dataset.k; if(!k) return; e.target.checked ? missOff.delete(k) : missOff.add(k); $('#mmText').value=missMessage(); });
$('#mmClose').onclick=closeMiss;
$('#missModal').addEventListener('click', e=>{ if(e.target.id==='missModal') closeMiss(); });
$('#missModal').addEventListener('keydown', e=>{ if(e.key==='Escape') closeMiss(); });
$('#mmCopy').onclick=async ()=>{ await copyText($('#mmText').value); toast('Mensagem copiada: é só colar no WhatsApp'); };
$('#mmWa').onclick=()=>{ window.open('https://wa.me/?text='+encodeURIComponent($('#mmText').value),'_blank','noopener'); };
$('#btnSave').onclick=()=>doExport('save');
$('#btnPrint').onclick=()=>doExport('print');

/* ---------- vaga: posto, empresa e cidade ---------- */
// As sugestões começam com estes exemplos e guardam o que for digitado (só neste navegador).
// Os campos não são apagados em "Limpar": costumam ser os mesmos para vários candidatos seguidos.
const VAGA_FIELDS = [['posto','Posto',['ASG','Vigilante']], ['empresa','Empresa',['Fornecedora']], ['cidade','Cidade',['Itaitinga','Fortaleza']]];
const VAGA_KEY = 'rh-organizador-vaga-sugestoes';
const vaga = f => $('#v_'+f).value.trim();
function loadVagaSug(){ try{ return JSON.parse(localStorage.getItem(VAGA_KEY)) || {}; }catch(e){ return {}; } }
function fillVagaLists(){
  const s=loadVagaSug();
  for(const [f,,def] of VAGA_FIELDS){
    const vals=[...new Set([...def, ...(s[f]||[])])];
    $('#dl_'+f).innerHTML=vals.map(v=>`<option value="${esc(v)}">`).join('');
  }
}
function rememberVaga(){
  const s=loadVagaSug();
  for(const [f] of VAGA_FIELDS){
    const v=vaga(f);
    if(v) s[f]=[v, ...(s[f]||[]).filter(x=>x.toLowerCase()!==v.toLowerCase())].slice(0,20);
  }
  try{ localStorage.setItem(VAGA_KEY, JSON.stringify(s)); }catch(e){}
  fillVagaLists();
}
for(const [f] of VAGA_FIELDS) $('#v_'+f).addEventListener('change', rememberVaga);
fillVagaLists();

/* ---------- mudar lista ---------- */
// Texto da lista: um documento por linha, ex. "04 – RG", "Reservista (se houver)", "... https://site-para-emitir"
const OPT_TEST = /\b(se houver|se tiver|se possuir|se for|caso possua|caso tenha|caso seja|opcional|quando houver|se aplicavel|se existir)\b/;
// só tira do nome o trecho entre parênteses: "Se tiver filhos… – CPF" continua com o texto inteiro
const OPT_STRIP = /\s*[(\[]\s*(se houver|se tiver\b[^)\]]*|se possuir\b[^)\]]*|se for\b[^)\]]*|caso (possua|tenha|seja)\b[^)\]]*|opcional|quando houver|se aplic[aá]vel|se existir)\s*[)\]]/gi;
const LINE_MARK = /^\s*(\d{1,3}[a-zA-Z]?\s*[-–—.):º°]|\d{1,3}[a-zA-Z]?\s+\S|[•·▪◦*–—-]\s|\(\s*\)|\[\s*\]|[☐□❏])/;
function parseListText(text){
  const rows=[];
  for(const raw of text.split(/\r?\n/)){
    let s=raw.trim();
    // link com ou sem "https://" ("www.stm.gov.br"), tirando também os parênteses em volta dele.
    // Com dois links na linha: o 1º é o do botão "emitir" no site, o 2º é o impresso na capa.
    const links=[];
    s=s.replace(/\(?\s*((?:https?:\/\/|\bwww\.)[^\s)]+)\s*\)?/gi, (_,u)=>{ links.push(u.replace(/[.,;]+$/,'')); return ' '; }).replace(/\s{2,}/g,' ').trim();
    const [link=null, plink=null]=links;
    s=s.replace(/^([•·▪◦*–—-]|\(\s*\)|\[\s*\]|[☐□❏✓✔])\s*/,'');
    const m=s.match(/^(\d{1,3}[a-zA-Z]?)\s*(?:[-–—.):º°]\s*|\s+)(.+)$/);
    if(!s) continue;
    rows.push({k:m ? m[1].toLowerCase() : null, full:s, rest:m ? m[2] : s, link, plink});
  }
  // usa a numeração do texto só se todas as linhas tiverem número e nenhum se repetir
  const ks=rows.map(r=>r.k), numbered=ks.length && ks.every(Boolean) && new Set(ks).size===ks.length;
  return rows.map((r,i)=>{
    let n=(numbered ? r.rest : r.full).replace(/^[-–—:.)\s]+/,'');
    const opt=OPT_TEST.test(norm(n));
    // "(se for casado)" fica guardado como observação; "(se houver)" e "(opcional)" não
    const om=opt && n.match(new RegExp(OPT_STRIP.source,'i'));
    const note=om && !/^(se houver|opcional)$/i.test(om[1].trim()) ? om[1].trim() : null;
    if(opt) n=n.replace(OPT_STRIP,'');
    n=n.replace(/\s+[-–—:]\s*$/,'').replace(/\s{2,}/g,' ').trim() || (numbered ? r.full : 'Documento');
    const k=numbered ? (/^\d$/.test(r.k) ? '0'+r.k : r.k) : String(i+1).padStart(2,'0');
    const ts=typesForName(n);
    const c={k, n, t:ts[0]||null};
    if(ts.length>1) c.alt=ts.slice(1);
    if(opt) c.opt=true;
    if(note) c.note=note;
    if(r.link) c.link=r.link;
    if(r.plink && r.plink!==r.link) c.plink=r.plink;
    return c;
  });
}
const listToText = list => list.items.map(c=>`${c.k} – ${c.n}${c.opt?` (${c.note||'se houver'})`:''}${c.link?' '+c.link:''}${c.link&&c.plink?' '+c.plink:''}`).join('\n');
// linhas do texto de um PDF: junta os pedaços que estão na mesma altura da página
function textLines(tcItems){
  const rows=[];
  for(const it of tcItems){
    if(!it.str.trim()) continue;
    const x=it.transform[4], y=it.transform[5], h=Math.abs(it.transform[3])||10;
    let r=rows.find(r=>Math.abs(r.y-y)<h*0.5);
    if(!r) rows.push(r={y, parts:[]});
    r.parts.push({x, s:it.str});
  }
  return rows.sort((a,b)=>b.y-a.y).map(r=>r.parts.sort((a,b)=>a.x-b.x).map(p=>p.s).join(' ').replace(/\s+/g,' ').trim());
}
// das linhas lidas, fica só com os itens: se a maioria for numerada ou marcada, ignora títulos e rodapés
function pickListLines(lines){
  const clean=lines.map(l=>l.replace(/\s+/g,' ').trim()).filter(Boolean);
  if(clean.filter(l=>LINE_MARK.test(l)).length<3) return clean.filter(l=>l.length>=2 && l.length<=120);
  const out=[];
  for(const l of clean){
    if(LINE_MARK.test(l)) out.push(l);
    else if(out.length && /^[a-zà-ú(]/.test(l)) out[out.length-1]+=' '+l; // continuação do item anterior
  }
  return out;
}
async function readListFile(f){
  if(/\.txt$/i.test(f.name) || f.type==='text/plain') return (await f.text()).split(/\r?\n/);
  const lines=[]; let worker=null;
  const ocr=async c=>{ worker=worker||await createOcr(); const {data}=await worker.recognize(c); return data.text.split('\n'); };
  try{
    if(f.type==='application/pdf' || /\.pdf$/i.test(f.name)){
      const pjs=await pdfjsLib.getDocument({data:new Uint8Array(await f.arrayBuffer()), isEvalSupported:false}).promise;
      try{
        for(let i=1;i<=pjs.numPages;i++){
          $('#lmMsg').textContent=`Lendo a página ${i} de ${pjs.numPages}…`;
          const page=await pjs.getPage(i);
          const ls=textLines((await page.getTextContent()).items);
          if(ls.join('').replace(/\s/g,'').length>=20) lines.push(...ls);
          else lines.push(...await ocr(await renderPage(page,2400))); // página escaneada
        }
      } finally { pjs.destroy(); }
    } else {
      $('#lmMsg').textContent='Lendo a imagem…';
      const url=URL.createObjectURL(f);
      try{ lines.push(...await ocr(rotatedCanvas(await loadImg(url),0,2400))); } finally { URL.revokeObjectURL(url); }
    }
  } finally { if(worker) worker.terminate(); }
  return lines;
}

let listOpen=false, lmLists=[], lmId=null, lmDirty=false;
function lmFill(id){
  const l=lmLists.find(l=>l.id===id);
  lmId=id; lmDirty=false;
  $('#lmSelect').innerHTML=lmLists.map(l=>`<option value="${esc(l.id)}"${l.id===id?' selected':''}>${esc(l.name)}${l.id===LIST.id?' (em uso)':''}</option>`).join('');
  $('#lmName').value=l.name; $('#lmText').value=listToText(l);
  $('#lmDelete').hidden=id==='padrao'; $('#lmReset').hidden=id!=='padrao';
  $('#lmMsg').textContent=''; lmPreview();
}
function lmPreview(){
  const its=parseListText($('#lmText').value);
  const auto=its.filter(c=>c.t).length;
  $('#lmPreview').innerHTML = !its.length ? '<div class="hint">A lista está vazia.</div>' :
    `<div class="hint">${its.length} documentos · ${auto} com leitura automática</div>` +
    its.map(c=>`<div class="pv"><b>${esc(c.k)}</b><span>${esc(c.n)}${c.opt?' <small>(se houver)</small>':''}${c.link?' <small>↗ link</small>':''}${c.plink?' <small>· outro link na capa</small>':''}<br>`+
      (c.t ? `<small class="ok">✓ lê sozinho como: ${catTypes(c).map(t=>esc(typeName(t))).join(' ou ')}</small>` : '<small class="mute">só classificação manual</small>')+`</span></div>`).join('');
}
function openLists(){
  lmLists=loadLists(); if(!lmLists.some(l=>l.id===LIST.id)) lmLists.push(LIST);
  listOpen=true; $('#listModal').classList.add('on'); lmFill(LIST.id); $('#lmText').focus();
}
function closeLists(){ listOpen=false; $('#listModal').classList.remove('on'); }
const lmDiscardOk = () => !lmDirty || confirm('Descartar as alterações desta lista?');
function lmStartNew(name, text){
  lmId=null;
  $('#lmSelect').insertAdjacentHTML('afterbegin','<option value="" selected>(lista nova, ainda não salva)</option>');
  $('#lmName').value=name; $('#lmText').value=text;
  $('#lmDelete').hidden=true; $('#lmReset').hidden=true;
}
// troca a lista em uso sem perder o que já foi classificado
function applyList(list){
  useList(list);
  for(const it of items){
    if(!it.manual || it.cat==null || it.cat==='X' || it.cat==='OUT') continue;
    const c=(it.mtype && CATS.find(c=>catTypes(c).includes(it.mtype))) || (it.mname && CATS.find(c=>norm(c.n)===it.mname));
    if(c) it.cat=c.k;
    else if(it.read) it.manual=false; // volta para a classificação automática
    else it.cat=null;
  }
  reviewSet(); refresh();
}
async function importList(f){
  if(!f) return;
  if(!lmDiscardOk()) return;
  $('#lmImport').disabled=true;
  try{
    const lines=pickListLines(await readListFile(f));
    if(!lines.length){ $('#lmMsg').textContent='Não encontrei nenhum item nesse arquivo.'; return; }
    lmStartNew(f.name.replace(/\.[^.]+$/,''), listToText({items:parseListText(lines.join('\n'))}));
    lmDirty=true; lmPreview();
    $('#lmMsg').textContent=`Encontrei ${lines.length} itens. Confira, corrija o que for preciso e clique em "Salvar e usar".`;
  }catch(e){ console.error(e); $('#lmMsg').textContent='Não consegui ler esse arquivo.'; }
  finally{ $('#lmImport').disabled=false; }
}
$('#btnList').onclick=openLists;
$('#lmClose').onclick=$('#lmCancel').onclick=()=>{ if(lmDiscardOk()) closeLists(); };
$('#listModal').addEventListener('keydown', e=>{ if(e.key==='Escape' && lmDiscardOk()) closeLists(); });
$('#lmSelect').onchange=e=>{ if(lmDiscardOk()) lmFill(e.target.value); else e.target.value=lmId||''; };
$('#lmText').oninput=$('#lmName').oninput=()=>{ lmDirty=true; lmPreview(); };
$('#lmNew').onclick=()=>{
  if(!lmDiscardOk()) return;
  lmStartNew('Nova lista', ''); lmDirty=false; lmPreview();
  $('#lmMsg').textContent='Escreva um documento por linha, na ordem de impressão.'; $('#lmName').select();
};
$('#lmImport').onclick=()=>$('#lmFile').click();
$('#lmFile').onchange=e=>{ importList(e.target.files[0]); e.target.value=''; };
$('#lmReset').onclick=()=>{ const d=DEFAULT_LIST(); $('#lmName').value=d.name; $('#lmText').value=listToText(d); lmDirty=true; lmPreview(); };
$('#lmExport').onclick=()=>{
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob(['﻿'+$('#lmText').value],{type:'text/plain'}));
  a.download=($('#lmName').value.trim().replace(/[\\/:*?"<>|]+/g,'')||'lista')+'.txt';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),60000);
};
$('#lmDelete').onclick=()=>{
  const l=lmLists.find(l=>l.id===lmId); if(!l || l.id==='padrao') return;
  if(!confirm(`Excluir a lista "${l.name}"?`)) return;
  lmLists=lmLists.filter(x=>x.id!==l.id);
  const active = LIST.id===l.id ? lmLists.find(x=>x.id==='padrao') : LIST;
  if(!saveLists(lmLists, active.id)) toast('Não consegui salvar neste navegador');
  if(LIST.id===l.id) applyList(active);
  lmFill(active.id);
};
$('#lmSave').onclick=()=>{
  const name=$('#lmName').value.trim(), its=parseListText($('#lmText').value);
  if(!name){ $('#lmMsg').textContent='Dê um nome para a lista.'; $('#lmName').focus(); return; }
  if(!its.length){ $('#lmMsg').textContent='A lista está vazia.'; $('#lmText').focus(); return; }
  const id=lmId || 'l'+Date.now().toString(36);
  const list={id, name, items:its};
  const i=lmLists.findIndex(l=>l.id===id);
  if(i>=0) lmLists[i]=list; else lmLists.push(list);
  if(!saveLists(lmLists, id)) toast('Atenção: não consegui salvar a lista neste navegador. Ela vale só até fechar a página.');
  applyList(list); lmDirty=false; closeLists();
  toast(`Lista em uso: ${name}`);
};

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
