/* ============================================================
   Grupo das Pedras — placar e ranking
   Regras: gato (4x0), gato aleijado (acima de 4 x 0),
   partida fechada (4x1/2/3, só com fila), reiniciada e sem resultado.
   ============================================================ */

import { iniciarNuvem, enviarNoite, baixarNoites, salvarJogadores, baixarJogadores,
         estadoNuvem, publicarAberta, apagarAberta, assistirAberta, APARELHO } from './sync.js';

/* ---------------- dados ---------------- */
const SEMENTE_JOGADORES = [
  {id:'paulo',    nome:'Pr. Paulo',       curto:'Paulo',    ini:'PP', ativo:true},
  {id:'alcimar',  nome:'Alcimar',         curto:'Alcimar',  ini:'AL', ativo:true},
  {id:'adenoque', nome:'Pr. Adenoque',    curto:'Adenoque', ini:'AD', ativo:true},
  {id:'marcos',   nome:'Marcos',          curto:'Marcos',   ini:'MC', ativo:true},
  {id:'dina',     nome:'Valdinar (Dina)', curto:'Valdinar', ini:'VD', ativo:true}
];
const SEMENTE_NOITES = [{
  id:'PEDRAS-07-09-26', cod:'PEDRAS-07/09/26', dia:'domingo, 07/09/26',
  abriu:'22h07', fechou:'02h14',
  totais:{partidas:24, gatos:8, aleijados:0, fechadas:14, sem:2},
  nota:'Folha de papel auditada e fechada: 8 gatos + 14 fechadas + 2 sem resultado = 24 partidas; 96 participações.',
  /* PJ e SR contados na folha por Marcos em 09/09/26.
     Conferência: soma de PJ = 96 = 24 partidas x 4 jogadores; soma de SR = 8 = 2 x 4. */
  resumo:[
    {id:'paulo',    gd:5, gt:3, pf:8, pj:22, sr:2},
    {id:'alcimar',  gd:4, gt:2, pf:5, pj:20, sr:2},
    {id:'adenoque', gd:3, gt:2, pf:6, pj:16, sr:0},
    {id:'marcos',   gd:2, gt:4, pf:4, pj:18, sr:2},
    {id:'dina',     gd:2, gt:5, pf:5, pj:20, sr:2}
  ],
  titulos:{rei:'paulo', gateiro:'dina'},
  rodadas:[]
}];

let PLAYERS = [];
let NOITES  = [];
let noite   = {aberta:false, codigo:null, id:null, rodadas:[], parcial:{}};
let sala = [], seats = {A1:null,A2:null,B1:null,B2:null}, fila = [], seguidas = {};
let game = null, plano = null, aberta = null;
/* mesa compartilhada: quem está com a marcação, e o que a nuvem diz */
let marcador = APARELHO;          // quem este aparelho acha que está marcando
let nuvemAberta = null;           // noite em andamento como está na nuvem
const souMarcador = () => !nuvemAberta || nuvemAberta.marcador === APARELHO;

const P = id => PLAYERS.find(p => p.id === id) || {id, nome:'—', curto:'—', ini:'??'};

/* soma de todas as noites fechadas */
function acum(){
  const m = {};
  /* gdC/pfC/gtC = só das noites que registram participação, para o aproveitamento bater */
  const zero = () => ({gd:0, gt:0, pf:0, pj:0, sr:0, gdC:0, pfC:0, gtC:0, reis:0, gateiros:0, pjParcial:false});
  NOITES.forEach(n => {
    (n.resumo||[]).forEach(r => { m[r.id] = m[r.id] || zero();
      m[r.id].gd += r.gd||0; m[r.id].gt += r.gt||0; m[r.id].pf += r.pf||0;
      if(r.pj === null || r.pj === undefined){ m[r.id].pjParcial = true; }
      else {
        m[r.id].pj += r.pj; m[r.id].sr += r.sr||0;
        m[r.id].gdC += r.gd||0; m[r.id].pfC += r.pf||0; m[r.id].gtC += r.gt||0;
      } });
    if(n.titulos){
      if(n.titulos.rei){ m[n.titulos.rei] = m[n.titulos.rei] || zero(); m[n.titulos.rei].reis++; }
      if(n.titulos.gateiro){ m[n.titulos.gateiro] = m[n.titulos.gateiro] || zero(); m[n.titulos.gateiro].gateiros++; }
    }
  });
  return m;
}
const saldo = t => (t.gd||0) - (t.gt||0);
/* Contas do aproveitamento — só sobre as noites que registram quem sentou.
   A noite de 07/09 veio do papel sem esse dado e fica de fora destas quatro. */
const decididas = t => (t.pj||0) - (t.sr||0);          // partidas com resultado em que jogou
const vitorias  = t => (t.gdC||0) + (t.pfC||0);
const ds = t => decididas(t) - vitorias(t) - (t.gtC||0);  // derrotas sem gato
const aproveitamento = t => { const d = decididas(t); return d > 0 ? vitorias(t)/d : null; };

/* ---------------- som ---------------- */
let ctxAudio=null, master=null, somLigado=true;
try{ somLigado = localStorage.getItem('pedras-som') !== 'off'; }catch(e){}
function audio(){
  if(!ctxAudio){
    const AC = window.AudioContext || window.webkitAudioContext; if(!AC) return null;
    ctxAudio = new AC();
    master = ctxAudio.createGain(); master.gain.value = .9; master.connect(ctxAudio.destination);
  }
  if(ctxAudio.state === 'suspended') ctxAudio.resume();
  return ctxAudio;
}
function toggleSom(){
  somLigado = !somLigado;
  try{ localStorage.setItem('pedras-som', somLigado?'on':'off'); }catch(e){}
  renderSom(); if(somLigado) somVitoria();
}
function renderSom(){
  const b = document.getElementById('somBtn'); if(!b) return;
  b.setAttribute('aria-pressed', somLigado);
  b.setAttribute('aria-label', somLigado ? 'Som ligado' : 'Som desligado');
  b.innerHTML = somLigado
    ? '<svg width="17" height="17" viewBox="0 0 20 20" fill="none"><path d="M4 7.5h2.8L10.5 4v12L6.8 12.5H4z" fill="currentColor"/><path d="M13.2 7.2a4 4 0 010 5.6M15.4 5a7 7 0 010 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'
    : '<svg width="17" height="17" viewBox="0 0 20 20" fill="none"><path d="M4 7.5h2.8L10.5 4v12L6.8 12.5H4z" fill="currentColor"/><path d="M13.4 8l4 4M17.4 8l-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
}
function miado(t0, tom, dur, vol){
  const c = audio(); if(!c) return;
  const t = c.currentTime + (t0||0), d = dur||.72, k = tom||1;
  const osc = c.createOscillator(); osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(430*k, t);
  osc.frequency.exponentialRampToValueAtTime(780*k, t+d*.17);
  osc.frequency.setValueAtTime(780*k, t+d*.42);
  osc.frequency.exponentialRampToValueAtTime(320*k, t+d*.92);
  const lfo = c.createOscillator(); lfo.frequency.value = 17;
  const lg = c.createGain(); lg.gain.value = 16*k; lfo.connect(lg); lg.connect(osc.frequency);
  const f1 = c.createBiquadFilter(); f1.type='bandpass'; f1.Q.value=5;
  f1.frequency.setValueAtTime(780*k,t); f1.frequency.linearRampToValueAtTime(980*k, t+d*.9);
  const f2 = c.createBiquadFilter(); f2.type='bandpass'; f2.Q.value=7;
  f2.frequency.setValueAtTime(2350*k,t); f2.frequency.exponentialRampToValueAtTime(900*k, t+d*.9);
  const g = c.createGain(); const v = vol||.42;
  g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(v, t+.07);
  g.gain.setValueAtTime(v, t+d*.5); g.gain.exponentialRampToValueAtTime(.0001, t+d);
  osc.connect(f1); osc.connect(f2); f1.connect(g); f2.connect(g); g.connect(master);
  lfo.start(t); lfo.stop(t+d); osc.start(t); osc.stop(t+d+.02);
}
function somGato(){ if(somLigado) miado(0,1,.7,.42); }
function somAleijado(){
  if(!somLigado) return;
  miado(0,.72,1.05,.45); miado(.5,.9,.8,.4); miado(.95,1.15,.75,.36);
}
function somVitoria(){
  if(!somLigado) return;
  const c = audio(); if(!c) return; const t = c.currentTime;
  [0,.11,.22,.36].forEach((dt,i)=>{
    const f = [523.25,659.25,783.99,1046.5][i];
    const o = c.createOscillator(); o.type='triangle'; o.frequency.value=f;
    const o2 = c.createOscillator(); o2.type='sine'; o2.frequency.value=f*2;
    const g = c.createGain(); const v = i===3?.34:.26;
    g.gain.setValueAtTime(.0001,t+dt); g.gain.exponentialRampToValueAtTime(v,t+dt+.02);
    g.gain.exponentialRampToValueAtTime(.0001, t+dt+(i===3?.75:.3));
    const g2 = c.createGain(); g2.gain.value=.25; o2.connect(g2); g2.connect(g);
    o.connect(g); g.connect(master);
    o.start(t+dt); o.stop(t+dt+.8); o2.start(t+dt); o2.stop(t+dt+.8);
  });
}

/* ---------------- ícones ---------------- */
const ICON = {
  edit:'<svg width="15" height="15" viewBox="0 0 20 20" fill="none"><path d="M13.2 3.6l3.2 3.2-8.6 8.6-4 .8.8-4 8.6-8.6z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
  trash:'<svg width="15" height="15" viewBox="0 0 20 20" fill="none"><path d="M4 5.5h12M8 5.5V3.8h4v1.7M6 5.5l.8 10.2h6.4L14 5.5M8.4 8.4v4.6M11.6 8.4v4.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  box:'<svg width="15" height="15" viewBox="0 0 20 20" fill="none"><path d="M3 6.4h14V16H3zM2.4 3.6h15.2v2.8H2.4zM8 9.6h4" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>',
  undo:'<svg width="15" height="15" viewBox="0 0 20 20" fill="none"><path d="M4.5 8.5h7.2a4 4 0 110 8H7M4.5 8.5l3-3M4.5 8.5l3 3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  voltar:'<svg width="15" height="15" viewBox="0 0 20 20" fill="none"><path d="M16 10H4.5M9 4.8L3.8 10 9 15.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};
function iconeRei(s){
  s = s||22;
  return `<svg class="tit rei" width="${s}" height="${s}" viewBox="0 0 24 24" role="img" aria-label="Rei dos Gatos"><title>Rei dos Gatos</title>
    <path d="M7.1 13.6 6.5 8.2l4.1 2.7zM16.9 13.6l.6-5.4-4.1 2.7z" fill="#C08A57"/>
    <path d="M8 12.6 7.6 9.7l2.2 1.4zM16 12.6l.4-2.9-2.2 1.4z" fill="#E0A9A0"/>
    <ellipse cx="12" cy="15.2" rx="5.2" ry="4.6" fill="#C08A57"/>
    <path d="M9.3 10.5 8.9 5.5l2.1 1.8L12 4.3l1 3 2.1-1.8-.4 5z" fill="#F59E0B"/>
    <path d="M9.3 10.5h5.4" stroke="#D97706" stroke-width="1.1" stroke-linecap="round"/>
    <circle cx="12" cy="5.4" r=".75" fill="#FDE9C8"/>
    <circle cx="10.2" cy="14.9" r=".95" fill="#2A1A0B"/><circle cx="13.8" cy="14.9" r=".95" fill="#2A1A0B"/>
    <path d="M11.1 16.9h1.8L12 17.9z" fill="#8A5236"/>
    <path d="M6.9 15.2H4.4M7 17h-2.4M17.1 15.2h2.5M17 17h2.4" stroke="#9A7048" stroke-width="1" stroke-linecap="round"/>
  </svg>`;
}
function iconeGateiro(s){
  s = s||22;
  return `<svg class="tit gat" width="${s}" height="${s}" viewBox="0 0 24 24" role="img" aria-label="Gateiro"><title>Gateiro</title>
    <path d="M6.8 13.5c0-5 10.4-5 10.4 0" fill="none" stroke="#8B6540" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M9.6 10.3 8.8 7.4l2.7 1.5zM14.4 10.3l.8-2.9-2.7 1.5z" fill="#C3CEDD"/>
    <ellipse cx="12" cy="11.3" rx="3" ry="2.7" fill="#C3CEDD"/>
    <circle cx="10.9" cy="11.2" r=".72" fill="#26374F"/><circle cx="13.1" cy="11.2" r=".72" fill="#26374F"/>
    <path d="M11.4 12.6h1.2L12 13.3z" fill="#6B7C93"/>
    <path d="M4.6 12.9h14.8l-1.5 7.5a1 1 0 0 1-1 .8H7.1a1 1 0 0 1-1-.8z" fill="#A9744A"/>
    <path d="M5.4 15.6h13.2M6 18.2h12" stroke="#7C4A21" stroke-width="1.1" stroke-linecap="round"/>
    <path d="M4.6 12.9h14.8" stroke="#7C4A21" stroke-width="1.4" stroke-linecap="round"/>
  </svg>`;
}
function cross(n, gato, size){
  const s=size||64, c=s/2, r=s*.34, on='#F8FAFC', off='#3D4F68', acc='#D97706';
  const arms=[[c,c-r],[c+r,c],[c,c+r],[c-r,c]];
  let svg=`<svg class="cross" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" role="img" aria-label="${gato?'gato':n+' pontos'}">`;
  if(gato){
    svg+=`<circle cx="${c}" cy="${c}" r="${r*.78}" fill="none" stroke="${acc}" stroke-width="2"/>`;
    svg+=`<path d="M${c-r*.72} ${c-r*.5} L${c-r*.86} ${c-r*1.15} L${c-r*.18} ${c-r*.78} Z" fill="${acc}"/>`;
    svg+=`<path d="M${c+r*.72} ${c-r*.5} L${c+r*.86} ${c-r*1.15} L${c+r*.18} ${c-r*.78} Z" fill="${acc}"/>`;
    svg+=`<circle cx="${c-r*.3}" cy="${c-r*.12}" r="2.2" fill="${acc}"/><circle cx="${c+r*.3}" cy="${c-r*.12}" r="2.2" fill="${acc}"/>`;
    svg+=`<path d="M${c-r*.34} ${c+r*.34} Q${c} ${c+r*.62} ${c+r*.34} ${c+r*.34}" fill="none" stroke="${acc}" stroke-width="1.6" stroke-linecap="round"/>`;
    svg+=`<path d="M${c-r} ${c+r*.16} H${c-r*.66} M${c+r} ${c+r*.16} H${c+r*.66}" stroke="${acc}" stroke-width="1.4" stroke-linecap="round"/>`;
  } else {
    arms.forEach((a,i)=>{
      const lit = i < Math.min(n,4);
      svg+=`<line x1="${c}" y1="${c}" x2="${a[0]}" y2="${a[1]}" stroke="${lit?on:off}" stroke-width="${lit?2.4:1.4}" stroke-linecap="round"/>`;
      svg+=`<circle cx="${a[0]}" cy="${a[1]}" r="2.6" fill="${lit?on:off}"/>`;
    });
    svg+=`<circle cx="${c}" cy="${c}" r="3" fill="${n>0?on:off}"/>`;
    const extra=Math.max(0,n-4), passo=s*.105;
    for(let k=0;k<extra;k++){
      const x=c-((extra-1)*passo)/2+k*passo;
      svg+=`<line x1="${x-s*.02}" y1="${c+r*1.02}" x2="${x+s*.02}" y2="${c+r*.58}" stroke="${acc}" stroke-width="2.3" stroke-linecap="round"/>`;
    }
  }
  return svg+'</svg>';
}

/* ---------------- navegação ---------------- */
function go(id){
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === id));
  document.querySelectorAll('.navbtn').forEach(b => b.classList.toggle('on', b.dataset.t === id));
  document.querySelector('.screens').scrollTop = 0;
  if(id === 's-room') renderRoom();
  if(id === 's-table') renderTable();
}
function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(t._x); t._x = setTimeout(()=>t.classList.remove('on'), 2400);
}

/* ---------------- sessão ---------------- */
function dataHoje(){
  const d = new Date();
  const p = n => String(n).padStart(2,'0');
  return {curta:`${p(d.getDate())}/${p(d.getMonth()+1)}/${String(d.getFullYear()).slice(2)}`,
          id:`${p(d.getDate())}-${p(d.getMonth()+1)}-${String(d.getFullYear()).slice(2)}`,
          longa:d.toLocaleDateString('pt-BR',{weekday:'long', day:'2-digit', month:'2-digit', year:'2-digit'}),
          hora:d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}).replace(':','h')};
}
function abrir(){
  const d = dataHoje();
  let id = 'PEDRAS-'+d.id, n = 1;
  while(NOITES.some(x => x.id === id)){ n++; id = 'PEDRAS-'+d.id+'-'+n; }
  noite = {aberta:true, id, codigo:'PEDRAS-'+d.curta, dia:d.longa, abriu:d.hora, rodadas:[], parcial:{}};
  seguidas = {};
  renderRank(); renderHist(); publicar(); toast('Trabalhos abertos · '+noite.codigo); go('s-room');
}
async function fechar(){
  const n = noite.rodadas.length;
  if(!n){
    if(!confirmarSimples('Fechar sem nenhuma rodada registrada?')) return;
    noite = {aberta:false, codigo:null, id:null, rodadas:[], parcial:{}};
    renderRank(); renderHist(); go('s-rank'); return;
  }
  const resumo = Object.entries(noite.parcial)
    .map(([id,d]) => ({id, gd:d.gd||0, gt:d.gt||0, pf:d.pf||0, pj:d.pj||0, sr:d.sr||0}))
    .filter(r => r.gd+r.gt+r.pf+r.pj > 0)
    .sort((a,b) => (b.gd-b.gt)-(a.gd-a.gt) || b.pf-a.pf || b.gd-a.gd);

  const fechada = {
    id:noite.id, cod:noite.codigo, dia:noite.dia, abriu:noite.abriu, fechou:dataHoje().hora,
    totais:{
      partidas:n,
      gatos:noite.rodadas.filter(r=>r.tipo==='gato' && !r.aleijado).length,
      aleijados:noite.rodadas.filter(r=>r.aleijado).length,
      fechadas:noite.rodadas.filter(r=>r.tipo==='pf').length,
      sem:noite.rodadas.filter(r=>r.tipo==='rein'||r.tipo==='inac').length
    },
    resumo,
    titulos:{ rei: resumo[0] ? resumo[0].id : null,
              gateiro: resumo.length > 2 ? resumo[resumo.length-1].id : null },
    rodadas: noite.rodadas.map(r => ({hora:r.hora, a:r.a, b:r.b, pa:r.pa, pb:r.pb, tipo:r.tipo, aleijado:!!r.aleijado}))
  };
  NOITES.unshift(fechada);
  noite = {aberta:false, codigo:null, id:null, rodadas:[], parcial:{}};
  renderRank(); renderHist(); go('s-rank');

  const rei = fechada.titulos.rei;
  toast(rei ? `${P(rei).curto} é o Rei dos Gatos da noite` : 'Noite fechada');
  salvar();
  const ok = await enviarNoite(fechada);
  if(ok === 'conflito'){
    toast('Atenção: já existe uma noite fechada com este código na nuvem');
  }
  await apagarAberta(fechada.id);
  await salvarJogadores(PLAYERS);
  nuvemAberta = null;
  renderRank();
  if(ok === true) toast('Noite enviada ao grupo');
  else if(ok === false) toast('Salvo aqui — envio pendente, sem internet');
}
function confirmarSimples(msg){ return window.confirm(msg); }

/* ---------------- ranking ---------------- */
function renderRank(){
  const tot = acum();
  const lista = PLAYERS
    .map(p => ({p, t: tot[p.id]}))
    .filter(x => x.t)
    .sort((x,y) => saldo(y.t)-saldo(x.t) || y.t.pf-x.t.pf || y.t.gd-x.t.gd);

  document.getElementById('rankBody').innerHTML = lista.map((x,i) => {
    const s = saldo(x.t), ult = lista.length > 2 && i === lista.length-1;
    const tit = i===0 ? iconeRei(21) : ult ? iconeGateiro(21) : '';
    const pj = x.t.pjParcial
      ? (x.t.pj ? x.t.pj + '<span class="parcial" title="Há noite sem registro de participação">+</span>' : '—')
      : x.t.pj;
    return `<tr><td>${i+1}</td>
      <td><span class="nome-tit">${tit}${x.p.nome}</span></td>
      <td>${pj}</td><td>${x.t.gd}</td><td>${x.t.gt}</td><td>${x.t.pf}</td>
      <td class="pts ${s>0?'pos-good':s<0?'pos-bad':''}">${s>0?'+':''}${s}</td></tr>`;
  }).join('') || '<tr><td colspan="7" class="foot-note" style="text-align:left">Nenhuma noite fechada ainda.</td></tr>';

  document.getElementById('titulos').innerHTML = lista.length > 2
    ? `<div class="titulos">
         <div class="tit-card rei">${iconeRei(34)}<div><span class="eyebrow">Rei dos Gatos</span><b>${lista[0].p.nome}</b></div></div>
         <div class="tit-card gat">${iconeGateiro(34)}<div><span class="eyebrow">Gateiro</span><b>${lista[lista.length-1].p.nome}</b></div></div>
       </div>` : '';

  document.getElementById('sessBox').innerHTML = noite.aberta
    ? `<div class="sess open"><div><b>Trabalhos abertos</b><span>${noite.codigo} · ${noite.rodadas.length} rodada${noite.rodadas.length===1?'':'s'} · desde ${noite.abriu}</span></div><span class="dot"></span></div>
       <div style="height:10px"></div><button class="btn ghost" id="btnFechar">Fechar os trabalhos</button>`
    : `<div class="sess shut"><div><b>Trabalhos fechados</b><span>${NOITES.length ? `Última noite: ${NOITES[0].cod} · ${NOITES[0].totais.partidas} partidas` : 'Nenhuma noite registrada ainda'}</span></div></div>
       <div style="height:10px"></div><button class="btn" id="btnAbrir">Abrir os trabalhos</button>`;
  const bf = document.getElementById('btnFechar'), ba = document.getElementById('btnAbrir');
  if(bf) bf.onclick = fechar;
  if(ba) ba.onclick = abrir;

  const box = document.getElementById('mesaBox');
  if(nuvemAberta && !souMarcador()){
    box.innerHTML = `<div class="alerta ok" style="align-items:center">
        <span>Outro aparelho está marcando <b>${nuvemAberta.codigo}</b> — ${(nuvemAberta.rodadas||[]).length} rodada${(nuvemAberta.rodadas||[]).length===1?'':'s'}.
        Você acompanha em tempo real, sem poder alterar.</span></div>
      <div style="height:8px"></div>
      <button class="btn ghost" id="btnAssumir">Assumir a marcação</button><div style="height:10px"></div>`;
    document.getElementById('btnAssumir').onclick = assumirMesa;
    if(bf) bf.disabled = true;
    if(ba) ba.disabled = true;
  } else box.innerHTML = '';

  const comApr = lista.map(x => ({...x, ap: aproveitamento(x.t), pd: decididas(x.t), d: ds(x.t)}))
                      .filter(x => x.ap !== null)
                      .sort((a,b) => b.ap - a.ap);
  document.getElementById('aproveita').innerHTML = comApr.length
    ? `<div class="card"><div class="row" style="margin-bottom:4px">
         <span class="eyebrow">Aproveitamento</span>
         <span class="eyebrow">vitórias ÷ partidas decididas</span></div>
       ${comApr.map(x => `<div class="apr">
          <span class="apr-nome">${x.p.nome}</span>
          <span class="apr-det">${vitorias(x.t)}V · ${x.t.gtC + x.d}D · ${x.pd} decididas</span>
          <span class="apr-num">${Math.round(x.ap*100)}<small>%</small></span>
        </div>
        <div class="barra"><i style="width:${Math.round(x.ap*100)}%"></i></div>`).join('')}
       <p class="foot-note" style="margin-top:10px">Partidas reiniciadas e sem resultado não entram — não houve vitória nem derrota nelas.${
         comApr.some(x => x.t.pjParcial) ? ' A noite de 07/09 também fica de fora: veio do papel sem o registro de quem sentou.' : ''}</p></div>`
    : '';

  const comTit = lista.filter(x => x.t.reis + x.t.gateiros > 0)
                      .sort((a,b) => (b.t.reis-a.t.reis) || (a.t.gateiros-b.t.gateiros));
  document.getElementById('coroas').innerHTML = comTit.length
    ? `<div class="card"><div class="row" style="margin-bottom:9px">
         <span class="eyebrow">Títulos por noite</span>
         <span class="eyebrow">${NOITES.length} noite${NOITES.length===1?'':'s'}</span></div>
       ${comTit.map(x => `<div class="delta"><span>${x.p.nome}</span>
          <b style="display:flex;align-items:center;gap:12px">
            ${x.t.reis?`<span class="cont rei">${iconeRei(19)}${x.t.reis}×</span>`:''}
            ${x.t.gateiros?`<span class="cont gat">${iconeGateiro(19)}${x.t.gateiros}×</span>`:''}
          </b></div>`).join('')}
       <p class="foot-note" style="margin-top:10px">Contados ao fechar os trabalhos: o primeiro e o último <b>daquela noite</b>.</p></div>`
    : '';

  const par = Object.entries(noite.parcial).filter(([,d]) => (d.gd||0)+(d.gt||0)+(d.pf||0) > 0);
  document.getElementById('parcialBox').innerHTML = (noite.aberta && par.length)
    ? `<div class="card"><span class="eyebrow">Parcial desta noite — ainda não enviada</span>
        ${par.map(([id,d]) => `<div class="delta"><span>${P(id).nome}</span><b>${[
          d.gd?`<span class="tag-good">+${d.gd} GD</span>`:'',
          d.gt?`<span class="tag-bad">+${d.gt} GT</span>`:'',
          d.pf?`+${d.pf} VI`:''].filter(Boolean).join(' · ')}</b></div>`).join('')}
      </div>` : '';

  renderNuvem();
  salvar();
}
function lanc(id, campo, n){
  noite.parcial[id] = noite.parcial[id] || {gd:0, gt:0, pf:0, pj:0, sr:0};
  noite.parcial[id][campo] = (noite.parcial[id][campo]||0) + n;
}
const naMesa = () => [seats.A1, seats.A2, seats.B1, seats.B2].filter(Boolean);

/* ---------------- cadastro de jogadores ---------------- */
let gerenciar=false, editando=null, confirmando=null;
const temHistorico = p => { const t = acum()[p.id]; return !!t || !!noite.parcial[p.id]; };

function toggleManage(){
  gerenciar = !gerenciar; confirmando = null;
  document.getElementById('roomTitle').textContent = gerenciar ? 'Cadastro de jogadores' : 'Presença';
  if(!gerenciar && !document.getElementById('addForm').hidden) toggleAdd();
  const b = document.getElementById('mgBtn');
  b.setAttribute('aria-pressed', gerenciar);
  b.innerHTML = gerenciar ? ICON.voltar + ' Voltar' : ICON.edit + ' Gerenciar';
  document.getElementById('roomHelp').textContent = gerenciar
    ? 'Toque no lápis para corrigir o nome. A lixeira só apaga quem nunca jogou — quem já tem partidas é arquivado, para não furar o histórico.'
    : 'Toque no nome de quem chegou. Quem está na sala entra no rodízio; quem não está fica de fora da noite.';
  renderRoom();
}
function toggleAdd(){
  const f = document.getElementById('addForm');
  f.hidden = !f.hidden;
  document.getElementById('addToggle').hidden = !f.hidden;
  if(f.hidden){ editando=null; document.getElementById('npNome').value=''; document.getElementById('npApelido').value=''; }
  else document.getElementById('npNome').focus();
  document.getElementById('saveBtn').textContent = editando ? 'Salvar alterações' : 'Salvar e pôr na sala';
  document.getElementById('addHelp').textContent = editando
    ? 'A correção vale em todo o histórico.'
    : 'Ele entra no grupo zerado e passa a valer no ranking depois da primeira noite fechada.';
}
function editar(id){
  editando = id; const p = P(id);
  if(document.getElementById('addForm').hidden) toggleAdd();
  document.getElementById('npNome').value = p.nome;
  document.getElementById('npApelido').value = p.curto;
  document.getElementById('saveBtn').textContent = 'Salvar alterações';
  document.getElementById('addHelp').textContent = 'A correção vale em todo o histórico.';
  document.getElementById('npNome').focus();
}
function iniciais(nome){
  const t = nome.trim().split(/\s+/);
  return ((t[0][0]||'') + (t[1] ? t[1][0] : (t[0][1]||''))).toUpperCase();
}
async function savePlayer(){
  const nome = document.getElementById('npNome').value.trim();
  if(!nome){ document.getElementById('npNome').focus(); toast('Digite o nome do jogador'); return; }
  const curto = document.getElementById('npApelido').value.trim() || nome.split(' ')[0];
  if(editando){
    const p = P(editando); p.nome = nome; p.curto = curto; p.ini = iniciais(nome);
    editando = null; toggleAdd(); renderRoom(); renderTable(); renderRank();
    toast('Cadastro atualizado');
  } else {
    let id = nome.toLowerCase().normalize('NFD').replace(/[^a-z]/g,'').slice(0,10) || 'jog';
    while(PLAYERS.some(p => p.id === id)) id += 'x';
    PLAYERS.push({id, nome, curto, ini:iniciais(nome), ativo:true});
    sala.push(id); fila.push(id);
    toggleAdd(); renderRoom(); renderTable();
    toast(curto + ' entrou no grupo');
  }
  salvar(); salvarJogadores(PLAYERS);
}
function pedirExcluir(id){ confirmando = id; renderRoom(); }
function cancelarExcluir(){ confirmando = null; renderRoom(); }
function excluir(id){
  const p = P(id);
  PLAYERS = PLAYERS.filter(x => x.id !== id);
  sala = sala.filter(x => x !== id); fila = fila.filter(x => x !== id);
  Object.keys(seats).forEach(k => { if(seats[k] === id) seats[k] = null; });
  confirmando = null; renderRoom(); renderTable(); renderRank();
  toast(p.curto + ' foi excluído'); salvarJogadores(PLAYERS);
}
function arquivar(id){
  const p = P(id); p.ativo = false;
  sala = sala.filter(x => x !== id); fila = fila.filter(x => x !== id);
  Object.keys(seats).forEach(k => { if(seats[k] === id) seats[k] = null; });
  confirmando = null; renderRoom(); renderTable();
  toast(p.curto + ' arquivado — histórico mantido'); salvar(); salvarJogadores(PLAYERS);
}
function reativar(id){ P(id).ativo = true; renderRoom(); toast(P(id).curto + ' voltou ao grupo'); salvar(); salvarJogadores(PLAYERS); }

function toggleSala(id){
  if(sala.includes(id)){
    sala = sala.filter(x => x !== id);
    Object.keys(seats).forEach(k => { if(seats[k] === id) seats[k] = null; });
    fila = fila.filter(x => x !== id);
  } else { sala.push(id); fila.push(id); }
  renderRoom();
}
function renderRoom(){
  const ativos = PLAYERS.filter(p => p.ativo !== false), arq = PLAYERS.filter(p => p.ativo === false);
  document.getElementById('roomChips').hidden = gerenciar;
  document.getElementById('roomList').hidden = !gerenciar;

  document.getElementById('roomChips').innerHTML = ativos.map(p =>
    `<button class="chip ${sala.includes(p.id)?'':'out'}" data-acao="sala" data-id="${p.id}">
      <span class="av">${p.ini}</span>${p.curto}</button>`).join('');

  document.getElementById('roomList').innerHTML =
    ativos.map(p => p.id === confirmando
      ? `<div class="confirm"><span>${temHistorico(p)
            ? `<b>${p.curto}</b> já tem partidas. Arquivar?`
            : `Excluir <b>${p.curto}</b> do grupo?`}</span>
          ${temHistorico(p)
            ? `<button class="btn sm ghost" data-acao="arquivar" data-id="${p.id}">Arquivar</button>`
            : `<button class="btn sm danger" data-acao="excluir" data-id="${p.id}">Excluir</button>`}
          <button class="btn sm ghost" data-acao="cancelar">Não</button></div>`
      : `<div class="prow">
          <span class="av">${p.ini}</span>
          <span class="nm">${p.nome}<small>${p.curto}${temHistorico(p)?'':' · sem partidas'}</small></span>
          <button class="act" data-acao="editar" data-id="${p.id}" aria-label="Editar ${p.curto}">${ICON.edit}</button>
          <button class="act ${temHistorico(p)?'':'danger'}" data-acao="pedir" data-id="${p.id}" aria-label="${temHistorico(p)?'Arquivar':'Excluir'} ${p.curto}">${temHistorico(p)?ICON.box:ICON.trash}</button>
        </div>`).join('')
    + (arq.length ? `<div style="height:14px"></div><span class="eyebrow">Arquivados</span>`
        + arq.map(p => `<div class="prow off"><span class="av">${p.ini}</span>
            <span class="nm">${p.nome}<small>fora do rodízio · histórico mantido</small></span>
            <button class="act" data-acao="reativar" data-id="${p.id}" aria-label="Trazer ${p.curto} de volta">${ICON.undo}</button></div>`).join('') : '');

  document.getElementById('roomCount').textContent = sala.length + (sala.length===1?' jogador':' jogadores');
  const q = Math.max(0, sala.length - 4);
  document.getElementById('roomRule').innerHTML = sala.length < 4
    ? 'Faltam jogadores para formar a mesa.'
    : q===0 ? 'Ninguém de fora: <b>só encerra com gato</b> e a mesa não muda.'
    : q===1 ? '1 esperando: quem perder resolve na <b>pedra maior</b> ou por partidas seguidas.'
    : q===2 ? '2 esperando: <b>sai a dupla perdedora inteira</b>.'
    : q+' esperando: sai a dupla perdedora, mas ela <b>volta na frente da fila</b>.';
  salvar();
}

/* ---------------- mesa ---------------- */
let sel = null;
const seatOf = id => Object.keys(seats).find(k => seats[k] === id);
function place(id, seat){
  const prev = seatOf(id), occ = seats[seat];
  if(prev) seats[prev] = occ || null; else fila = fila.filter(x => x !== id);
  if(occ && !prev && !fila.includes(occ)) fila.push(occ);
  seats[seat] = id; sel = null; renderTable();
}
function unseat(id){
  const s = seatOf(id); if(s) seats[s] = null;
  if(!fila.includes(id)) fila.push(id);
  sel = null; renderTable();
}
function tapChip(id){ sel = (sel === id) ? null : id; renderTable(); }
function tapSeat(seat){
  if(sel){ place(sel, seat); return; }
  if(seats[seat]) unseat(seats[seat]);
}
function renderTable(){
  fila = fila.filter(id => sala.includes(id) && !seatOf(id));
  sala.forEach(id => { if(!seatOf(id) && !fila.includes(id)) fila.push(id); });

  document.querySelectorAll('.seat').forEach(el => {
    const id = seats[el.dataset.seat];
    el.classList.toggle('filled', !!id);
    el.innerHTML = id ? `<span class="av">${P(id).ini}</span>${P(id).curto}` : 'cadeira livre';
    el.dataset.pid = id || '';
  });
  document.getElementById('filaChips').innerHTML = fila.length
    ? fila.map((id,i) => `<div class="chip ${sel===id?'sel':''}" data-pid="${id}"><span class="av">${i+1}º</span>${P(id).curto}</div>`).join('')
    : '<span class="foot-note">Ninguém esperando.</span>';
  document.getElementById('filaCount').textContent = fila.length ? fila.length + ' na fila' : 'vazia';
  document.getElementById('filaRule').innerHTML = fila.length === 0
    ? 'Sem fila: a partida <b>só encerra com gato (4 × 0)</b>. Qualquer outro 4 reinicia.'
    : 'Com fila: encerra a partir de 4 pontos. <b>4 × 0 é gato</b>, o resto é partida fechada.';

  const ok = Object.values(seats).filter(Boolean).length === 4;
  const btn = document.getElementById('startBtn');
  btn.disabled = !ok || !noite.aberta || !souMarcador();
  btn.textContent = !souMarcador() ? 'Outro aparelho está marcando'
                  : noite.aberta ? 'Iniciar partida' : 'Abra os trabalhos primeiro';
  bindDrag(); salvar();
}
function autoMesa(){
  const pool = [...sala].sort(() => Math.random()-.5);
  seats = {A1:pool[0]||null, A2:pool[1]||null, B1:pool[2]||null, B2:pool[3]||null};
  fila = pool.slice(4); sel = null; renderTable(); toast('Mesa sorteada');
}
let drag = null;
function bindDrag(){
  document.querySelectorAll('#filaChips .chip, .seat').forEach(el => {
    if(el._b) return; el._b = true;
    el.addEventListener('pointerdown', e => {
      const pid = el.dataset.pid; if(!pid) return;
      drag = {pid, x:e.clientX, y:e.clientY, moved:false};
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', e => {
      if(!drag || drag.pid !== el.dataset.pid) return;
      if(!drag.moved && Math.hypot(e.clientX-drag.x, e.clientY-drag.y) < 7) return;
      if(!drag.moved){
        drag.moved = true; el.classList.add('dragging');
        const g = document.createElement('div');
        g.className = 'chip ghostchip';
        g.innerHTML = `<span class="av">${P(drag.pid).ini}</span>${P(drag.pid).curto}`;
        document.body.appendChild(g); drag.ghost = g;
      }
      drag.ghost.style.left = e.clientX+'px'; drag.ghost.style.top = e.clientY+'px';
      document.querySelectorAll('.seat').forEach(s => s.classList.remove('hot'));
      const t = document.elementFromPoint(e.clientX, e.clientY);
      const seat = t && t.closest && t.closest('.seat');
      if(seat) seat.classList.add('hot');
    });
    el.addEventListener('pointerup', e => {
      if(!drag || drag.pid !== el.dataset.pid) return;
      const {pid, moved, ghost} = drag;
      if(ghost) ghost.remove();
      el.classList.remove('dragging');
      document.querySelectorAll('.seat').forEach(s => s.classList.remove('hot'));
      drag = null;
      if(!moved){ el.classList.contains('seat') ? tapSeat(el.dataset.seat) : tapChip(pid); return; }
      const t = document.elementFromPoint(e.clientX, e.clientY);
      const seat = t && t.closest && t.closest('.seat');
      if(seat) place(pid, seat.dataset.seat);
      else if(t && t.closest && t.closest('#filaBox')) unseat(pid);
      else renderTable();
    });
    el.addEventListener('pointercancel', () => { if(drag && drag.ghost) drag.ghost.remove(); drag = null; renderTable(); });
    el.addEventListener('keydown', e => {
      if(e.key !== 'Enter' && e.key !== ' ') return; e.preventDefault();
      el.classList.contains('seat') ? tapSeat(el.dataset.seat) : tapChip(el.dataset.pid);
    });
  });
}

/* ---------------- partida ---------------- */
const nomes = t => [seats[t+'1'], seats[t+'2']].map(id => P(id).nome);
function startGame(){
  [seats.A1,seats.A2,seats.B1,seats.B2].forEach(id => seguidas[id] = (seguidas[id]||0)+1);
  fila.forEach(id => seguidas[id] = 0);
  game = {A:0, B:0, fila:fila.length > 0, nA:nomes('A'), nB:nomes('B'), fim:null, som:null};
  document.getElementById('liveMode').textContent = game.fila ? fila.length+' na fila' : 'sem fila';
  renderLive(); publicar(); go('s-live');
}
function avaliar(){
  if(!game) return null;
  const a = game.A, b = game.B, hi = Math.max(a,b), lo = Math.min(a,b);
  if(hi < 4 || a === b) return null;
  const v = a > b ? 'A' : 'B';
  if(lo === 0) return {v, tipo:'gato', aleijado: hi >= 5};
  return game.fila ? {v, tipo:'pf'} : {reinicia:true};
}
function addPt(t, d){
  if(!game) return;
  game[t] = Math.max(0, Math.min(8, game[t]+d));
  const r = avaliar();
  if(r && r.reinicia){
    registrar({tipo:'rein', pa:game.A, pb:game.B});
    game.A = 0; game.B = 0; game.som = null; renderLive();
    const b = document.getElementById('liveBanner');
    b.className = 'banner gato';
    b.innerHTML = 'Ninguém na fila — <b>só vale gato</b>. Partida reiniciada em 0 × 0 e registrada.';
    return;
  }
  renderLive();
  const marca = r ? r.tipo + (r.aleijado?'-alj':'') : null;
  if(marca && marca !== game.som){
    game.som = marca;
    if(r.aleijado) somAleijado(); else if(r.tipo === 'gato') somGato(); else somVitoria();
  }
  if(!marca) game.som = null;
}
function encerrar(){
  const r = avaliar(); if(!r || r.reinicia) return;
  game.fim = r; showSummary();
}
function renderLive(){
  const g = game, r = avaliar();
  document.getElementById('duoWrap').innerHTML = ['A','B'].map(t => {
    const o = t === 'A' ? 'B' : 'A';
    const gato = r && r.tipo === 'gato' && r.v === o;
    return `<div class="duo-card ${g[t]>g[o]?'lead':''}">
      <div class="duo-name">${(t==='A'?g.nA:g.nB).join('<br>')}</div>
      ${cross(g[t], gato, 66)}
      <div class="duo-score">${g[t]}</div>
      <div class="pt-row"><button data-pt="${t}:-1" aria-label="Tirar ponto">−</button><button class="plus" data-pt="${t}:1" aria-label="Marcar ponto">+</button></div>
    </div>`;
  }).join('');
  const b = document.getElementById('liveBanner'), btn = document.getElementById('fimBtn');
  if(r && r.aleijado){
    b.className='banner gato'; b.innerHTML = `<b>GATO ALEIJADO!</b> ${Math.max(g.A,g.B)} × 0 — gato acima de 4.`;
  } else if(r && r.tipo === 'gato'){
    b.className='banner gato'; b.innerHTML = '<b>Gato!</b> 4 × 0. Se a rodada ainda render, siga marcando — daí em diante vira aleijado.';
  } else if(r && r.tipo === 'pf'){
    b.className='banner gato'; b.innerHTML = '<b>Partida fechada.</b> Vitória sem gato — pode encerrar.';
  } else {
    b.className='banner info';
    b.innerHTML = g.fila ? 'Tem fila: encerra a partir de 4 pontos. <b>4 × 0 = gato.</b>'
                         : 'Sem fila: <b>só encerra com gato (4 × 0 ou mais).</b>';
  }
  btn.hidden = !r;
  if(r) btn.textContent = r.aleijado ? 'Encerrar — GATO ALEIJADO'
        : r.tipo === 'gato' ? 'Encerrar — GATO' : 'Encerrar — PARTIDA FECHADA';
  salvar();
}
function horaAgora(){ return dataHoje().hora; }
function registrar(o){
  const jogaram = naMesa();
  const r = {rid:'r'+Date.now()+Math.random().toString(36).slice(2,5), hora:horaAgora(),
             a:game.nA, b:game.nB, pa:o.pa, pb:o.pb, tipo:o.tipo, aleijado:false,
             idsV:[], idsL:[], jogaram};
  jogaram.forEach(id => { lanc(id,'pj',1); lanc(id,'sr',1); });
  noite.rodadas.push(r); renderHist(); renderRank();
  publicar();
}
function inacabada(){
  if(!game) return;
  registrar({tipo:'inac', pa:game.A, pb:game.B});
  game = null; toast('Partida registrada sem resultado'); go('s-table');
}

/* ---------------- rodízio ---------------- */
function calcRodizio(){
  const v = game.fim.v, l = v === 'A' ? 'B' : 'A';
  const perd = [seats[l+'1'], seats[l+'2']];
  const q = fila.length;
  if(q === 0) return {tipo:'nada', txt:'Ninguém esperando — a mesma mesa segue.'};
  if(q === 1){
    const [p1,p2] = perd, s1 = seguidas[p1]||0, s2 = seguidas[p2]||0;
    if(s1 !== s2){
      const sai = s1 > s2 ? p1 : p2;
      return {tipo:'auto', sai:[sai], entra:[fila[0]],
        txt:`<b>${P(sai).curto}</b> sai — ${Math.max(s1,s2)} partidas seguidas na mesa. Entra <b>${P(fila[0]).curto}</b>.`};
    }
    return {tipo:'pedra', perd, entra:[fila[0]],
      txt:`<b>${P(p1).curto}</b> e <b>${P(p2).curto}</b> estão com ${s1} partida${s1===1?'':'s'} cada. Puxem pedra — quem tirar a maior fica.`};
  }
  if(q === 2) return {tipo:'auto', sai:perd, entra:[fila[0],fila[1]],
    txt:`Sai a dupla: <b>${P(perd[0]).curto}</b> e <b>${P(perd[1]).curto}</b>. Entram <b>${P(fila[0]).curto}</b> e <b>${P(fila[1]).curto}</b>.`};
  return {tipo:'pedra-vantagem', perd, entra:[fila[0],fila[1]],
    txt:`Sai a dupla e entram <b>${P(fila[0]).curto}</b> e <b>${P(fila[1]).curto}</b>. Os dois voltam na frente da fila — puxem pedra para ver quem volta primeiro.`};
}
function renderRodizio(){
  const box = document.getElementById('rodizioBox');
  let html = `<p class="foot-note" style="line-height:1.6">${plano.txt}</p>`;
  if(plano.tipo === 'pedra' || plano.tipo === 'pedra-vantagem'){
    html += `<div style="height:10px"></div><div class="chips">` +
      plano.perd.map(id => `<button class="chip" data-pedra="${id}"><span class="av">${P(id).ini}</span>${P(id).curto} tirou a maior</button>`).join('') + `</div>`;
  }
  box.innerHTML = html;
  document.getElementById('sumBtn').disabled =
    (plano.tipo === 'pedra' || plano.tipo === 'pedra-vantagem') && !plano.escolhido;
}
function pedra(id){
  plano.escolhido = id;
  const outro = plano.perd.find(x => x !== id);
  if(plano.tipo === 'pedra'){
    plano.sai = [outro];
    plano.txt = `<b>${P(id).curto}</b> tirou a maior e fica. <b>${P(outro).curto}</b> dá lugar a <b>${P(plano.entra[0]).curto}</b>.`;
  } else {
    plano.sai = plano.perd; plano.ordemVolta = [id, outro];
    plano.txt = `Sai a dupla. <b>${P(id).curto}</b> tirou a maior e volta primeiro, depois <b>${P(outro).curto}</b>. Entram <b>${P(plano.entra[0]).curto}</b> e <b>${P(plano.entra[1]).curto}</b>.`;
  }
  renderRodizio();
}

/* ---------------- resumo ---------------- */
function showSummary(){
  const g = game, v = g.fim.v, l = v === 'A' ? 'B' : 'A';
  const venc = v === 'A' ? g.nA : g.nB, perd = l === 'A' ? g.nA : g.nB;
  document.getElementById('sumCross').innerHTML = cross(0, g.fim.tipo === 'gato', 74);
  document.getElementById('sumKind').textContent = g.fim.aleijado ? 'GATO ALEIJADO'
    : g.fim.tipo === 'gato' ? 'GATO' : 'PARTIDA FECHADA';
  document.getElementById('sumWho').innerHTML = venc.join(' &amp; ') + ' venceram';
  document.getElementById('sumScore').textContent = `${g[v]} × ${g[l]} contra ${perd.join(' e ')}`;
  document.getElementById('sumDeltas').innerHTML = g.fim.tipo === 'gato'
    ? venc.map(n => `<div class="delta"><span>${n}</span><b class="tag-good">+1 GD</b></div>`).join('')
      + perd.map(n => `<div class="delta"><span>${n}</span><b class="tag-bad">+1 GT</b></div>`).join('')
    : venc.map(n => `<div class="delta"><span>${n}</span><b class="tag-good">+1 VI</b></div>`).join('')
      + perd.map(n => `<div class="delta"><span>${n}</span><b style="color:var(--muted)">sem lançamento</b></div>`).join('');
  plano = calcRodizio(); renderRodizio(); go('s-sum');
}
function confirmGame(){
  const g = game, v = g.fim.v, l = v === 'A' ? 'B' : 'A';
  const idsV = [seats[v+'1'], seats[v+'2']], idsL = [seats[l+'1'], seats[l+'2']];
  if(g.fim.tipo === 'gato'){ idsV.forEach(id => lanc(id,'gd',1)); idsL.forEach(id => lanc(id,'gt',1)); }
  else idsV.forEach(id => lanc(id,'pf',1));
  const jogaram = [...idsV, ...idsL];
  jogaram.forEach(id => lanc(id,'pj',1));

  noite.rodadas.push({rid:'r'+Date.now(), hora:horaAgora(), a:g.nA, b:g.nB, pa:g.A, pb:g.B,
                      tipo:g.fim.tipo, aleijado:!!g.fim.aleijado, idsV, idsL, jogaram});

  if(plano.sai && plano.sai.length){
    plano.sai.forEach(id => { const s = seatOf(id); if(s) seats[s] = null; seguidas[id] = 0; });
    fila = fila.filter(id => !plano.entra.includes(id));
    const ordem = plano.ordemVolta || plano.sai;
    fila = fila.concat(ordem.filter(id => plano.sai.includes(id)));
    const livres = Object.keys(seats).filter(k => !seats[k]);
    plano.entra.forEach((id,i) => { if(livres[i]) seats[livres[i]] = id; });
  }
  game = null; plano = null;
  renderRank(); renderHist(); renderTable();
  go('s-table'); toast('Rodada gravada · próxima mesa montada');
  publicar();
}

/* ---------------- histórico ---------------- */
function apagarRodada(rid){
  const r = noite.rodadas.find(x => x.rid === rid); if(!r) return;
  if(r.tipo === 'gato'){ r.idsV.forEach(id => lanc(id,'gd',-1)); r.idsL.forEach(id => lanc(id,'gt',-1)); }
  else if(r.tipo === 'pf') r.idsV.forEach(id => lanc(id,'pf',-1));
  (r.jogaram||[]).forEach(id => { lanc(id,'pj',-1); if(r.tipo==='rein'||r.tipo==='inac') lanc(id,'sr',-1); });
  noite.rodadas = noite.rodadas.filter(x => x.rid !== rid);
  renderRank(); renderHist(); publicar(); toast('Rodada apagada e lançamentos desfeitos');
}
function expandir(cod){ aberta = (aberta === cod) ? null : cod; renderHist(); }
const rotulo = h => h.aleijado ? 'Aleijado'
  : ({gato:'Gato', pf:'Fechada', rein:'Reiniciada', inac:'Sem resultado'})[h.tipo];
function linhaRodada(h, apagavel){
  return `<div class="hist-item">
    <span class="eyebrow" style="width:38px;flex:none">${h.hora||''}</span>
    <span style="flex:1;line-height:1.35">${h.a.map(n => n.split(' ').pop()).join(' + ')}
      <b style="color:var(--accent-2)">${h.pa} × ${h.pb}</b> ${h.b.map(n => n.split(' ').pop()).join(' + ')}</span>
    <span class="badge ${h.tipo}${h.aleijado?' mut':''}">${rotulo(h)}</span>
    ${apagavel ? `<button class="act danger" style="width:28px;height:28px" data-apagar="${h.rid}" aria-label="Apagar rodada">${ICON.trash}</button>` : ''}
  </div>`;
}
function renderHist(){
  const rodadas = [...noite.rodadas].reverse();
  document.getElementById('histNoite').innerHTML = noite.aberta
    ? `<div class="sess open" style="margin-bottom:10px"><div><b>${noite.codigo}</b>
         <span>Em andamento · ${noite.rodadas.length} rodada${noite.rodadas.length===1?'':'s'} · aberto às ${noite.abriu}</span></div><span class="dot"></span></div>
       <div class="card">${rodadas.length ? rodadas.map(h => linhaRodada(h, true)).join('')
         : '<p class="foot-note">Nenhuma rodada ainda nesta noite. Monte a mesa e marque a primeira.</p>'}</div>`
    : `<div class="sess shut" style="margin-bottom:10px"><div><b>Nenhuma noite aberta</b>
         <span>Abra os trabalhos no Ranking para começar a registrar</span></div></div>`;

  document.getElementById('histAntigas').innerHTML = NOITES.length ? NOITES.map(n => {
    const on = aberta === n.id, t = n.totais || {};
    const rei = n.titulos && n.titulos.rei, gat = n.titulos && n.titulos.gateiro;
    return `<div class="card" style="margin-bottom:10px; padding:0">
      <button class="night" data-noite="${n.id}" aria-expanded="${on}">
        <span style="flex:1;text-align:left"><b>${n.cod}</b><small>${n.dia} · ${n.abriu} às ${n.fechou}</small></span>
        <span style="text-align:right"><b class="num">${t.partidas||0}</b><small>partidas</small></span>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" style="flex:none;transform:rotate(${on?180:0}deg)" aria-hidden="true"><path d="M5 8l5 5 5-5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      ${on ? `<div style="padding:0 14px 14px">
        ${n.nota ? `<div class="alerta ok"><svg width="15" height="15" viewBox="0 0 20 20" fill="none" style="flex:none;margin-top:1px"><path d="M4.5 10.5l3.5 3.5 7.5-8" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg><span>${n.nota}</span></div>` : ''}
        ${(() => {
          const somaPJ = (n.resumo||[]).reduce((x,r) => x + (r.pj||0), 0);
          const esperado = (t.partidas||0) * 4;
          if(!somaPJ) return '';
          return somaPJ === esperado
            ? `<p class="foot-note" style="margin-bottom:10px">Conferido: ${somaPJ} participações = ${t.partidas} partidas × 4 jogadores.</p>`
            : `<div class="alerta"><span>Atenção: as participações somam ${somaPJ}, mas ${t.partidas} partidas deveriam dar ${esperado}.</span></div>`;
        })()}
        <div class="chips" style="margin-bottom:10px">
          <span class="badge gato">${t.gatos||0} gatos</span>
          ${t.aleijados ? `<span class="badge mut">${t.aleijados} aleijados</span>` : ''}
          <span class="badge pf">${t.fechadas||0} fechadas</span>
          ${t.sem ? `<span class="badge rein">${t.sem} sem resultado</span>` : ''}
        </div>
        ${rei ? `<div class="titulos" style="margin-bottom:12px">
          <div class="tit-card rei">${iconeRei(30)}<div><span class="eyebrow">Rei dos Gatos</span><b>${P(rei).nome}</b></div></div>
          ${gat ? `<div class="tit-card gat">${iconeGateiro(30)}<div><span class="eyebrow">Gateiro</span><b>${P(gat).nome}</b></div></div>` : ''}
        </div>` : ''}
        <table class="rank mini"><thead><tr><th>Jogador</th><th>PJ</th><th>GD</th><th>GT</th><th>VI</th><th>DE</th><th>Saldo</th></tr></thead>
        <tbody>${(n.resumo||[]).map(r => { const s = r.gd-r.gt;
          const dsN = (r.pj===null||r.pj===undefined) ? null : (r.pj - (r.sr||0)) - r.gd - r.pf - r.gt;
          return `<tr><td style="text-align:left;font-weight:600">${P(r.id).nome}</td><td>${(r.pj===null||r.pj===undefined)?'—':r.pj}</td><td>${r.gd}</td><td>${r.gt}</td><td>${r.pf}</td><td>${dsN===null?'—':dsN}</td>
          <td class="${s>0?'pos-good':s<0?'pos-bad':''}">${s>0?'+':''}${s}</td></tr>`; }).join('')}</tbody></table>
        ${(n.rodadas||[]).length ? `<div style="height:12px"></div><span class="eyebrow">Rodadas</span>
          <div class="card" style="margin-top:8px">${n.rodadas.map(h => linhaRodada(h, false)).join('')}</div>` : ''}
      </div>` : ''}
    </div>`;
  }).join('') : '<p class="foot-note">Nenhuma noite fechada ainda.</p>';
}

/* ---------------- mesa compartilhada ---------------- */
let publicando = null;
function publicar(){
  if(!noite.aberta || !souMarcador()) return;
  clearTimeout(publicando);
  publicando = setTimeout(() => {
    publicarAberta({
      id:noite.id, codigo:noite.codigo, dia:noite.dia, abriu:noite.abriu,
      rodadas:noite.rodadas, parcial:noite.parcial,
      sala, seats, fila, seguidas
    });
  }, 800);
}
function adotarDaNuvem(a){
  noite = {aberta:true, id:a.id, codigo:a.codigo, dia:a.dia, abriu:a.abriu,
           rodadas:a.rodadas||[], parcial:a.parcial||{}};
  sala = a.sala||[]; seats = a.seats||{A1:null,A2:null,B1:null,B2:null};
  fila = a.fila||[]; seguidas = a.seguidas||{}; game = null;
  renderRank(); renderRoom(); renderTable(); renderHist();
}
function assumirMesa(){
  if(!nuvemAberta) return;
  adotarDaNuvem(nuvemAberta);
  marcador = APARELHO;
  nuvemAberta = {...nuvemAberta, marcador: APARELHO};
  publicarAberta({
    id:noite.id, codigo:noite.codigo, dia:noite.dia, abriu:noite.abriu,
    rodadas:noite.rodadas, parcial:noite.parcial, sala, seats, fila, seguidas
  });
  renderRank(); renderTable();
  toast('Você assumiu a marcação da mesa');
}
function aoMudarNuvem(lista){
  const antes = nuvemAberta && nuvemAberta.marcador;
  nuvemAberta = lista && lista.length ? lista[0] : null;

  if(!nuvemAberta){                       // a noite foi fechada em outro aparelho
    if(noite.aberta && !souMarcador()){ noite = {aberta:false, codigo:null, id:null, rodadas:[], parcial:{}}; }
    renderRank(); renderHist(); return;
  }
  if(nuvemAberta.marcador === APARELHO){ renderRank(); return; }

  // outro aparelho está marcando: acompanha em modo leitura
  if(antes === APARELHO) toast('Outro aparelho assumiu a marcação');
  if(noite.aberta || !noite.id) adotarDaNuvem(nuvemAberta);
  renderRank(); renderHist(); renderTable();
}

/* ---------------- salvamento local ---------------- */
const CHAVE = 'pedras-v2';
function salvar(){
  try{
    localStorage.setItem(CHAVE, JSON.stringify({PLAYERS, NOITES, noite, sala, seats, fila, seguidas, game}));
    const el = document.getElementById('salvo');
    if(el) el.textContent = 'salvo ' + new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  }catch(e){}
}
function carregar(){
  try{
    const raw = localStorage.getItem(CHAVE); if(!raw) return false;
    const d = JSON.parse(raw);
    if(!d || !Array.isArray(d.PLAYERS)) return false;
    PLAYERS = d.PLAYERS; NOITES = d.NOITES || [];
    noite = d.noite || {aberta:false, codigo:null, id:null, rodadas:[], parcial:{}};
    sala = d.sala || []; seats = d.seats || {A1:null,A2:null,B1:null,B2:null};
    fila = d.fila || []; seguidas = d.seguidas || {}; game = d.game || null;
    return true;
  }catch(e){ return false; }
}
function zerarTudo(){ try{ localStorage.removeItem(CHAVE); }catch(e){} location.reload(); }
function renderZerar(){
  document.getElementById('zerar').innerHTML =
    `<div class="row"><span class="foot-note">Guardado neste aparelho · <span id="salvo">pronto</span></span>
     <button class="iconbtn" id="btnZerar">Recomeçar do zero</button></div>`;
  document.getElementById('btnZerar').onclick = () => {
    document.getElementById('zerar').innerHTML = `<div class="confirm" style="border-top:0">
      <span>Apagar tudo <b>deste aparelho</b>? As noites já enviadas continuam na nuvem.</span>
      <button class="btn sm danger" id="simZerar">Apagar</button>
      <button class="btn sm ghost" id="naoZerar">Não</button></div>`;
    document.getElementById('simZerar').onclick = zerarTudo;
    document.getElementById('naoZerar').onclick = renderZerar;
  };
}

/* ---------------- nuvem ---------------- */
function renderNuvem(){
  const e = estadoNuvem();
  const box = document.getElementById('nuvemBox'); if(!box) return;
  box.innerHTML = `<div class="row" style="padding:4px 0 2px">
    <span class="foot-note">${e.ok ? 'Sincronizado com o grupo' : e.msg}</span>
    <span class="dot" style="background:${e.ok?'var(--good)':'var(--muted)'};box-shadow:none"></span></div>`;
}
async function sincronizar(){
  const ok = await iniciarNuvem();
  renderNuvem();
  if(!ok) return;
  const [jog, noites] = await Promise.all([baixarJogadores(), baixarNoites()]);
  if(jog && jog.length){
    jog.forEach(j => { if(!PLAYERS.some(p => p.id === j.id)) PLAYERS.push(j); });
  }
  if(noites && noites.length){
    noites.forEach(n => { if(!NOITES.some(x => x.id === n.id)) NOITES.push(n); });
    NOITES.sort((a,b) => (b.id > a.id ? 1 : -1));
  }
  // reenvia noites que ficaram só aqui (fechadas offline)
  for(const n of NOITES){ if(!n._naNuvem) await enviarNoite(n); }
  assistirAberta(aoMudarNuvem);
  if(noite.aberta) publicar();
  renderRank(); renderHist(); renderNuvem(); salvar();
}

/* ---------------- eventos ---------------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-acao],[data-pt],[data-pedra],[data-apagar],[data-noite]');
  if(!el) return;
  if(el.dataset.pt){ const [t,d] = el.dataset.pt.split(':'); addPt(t, +d); return; }
  if(el.dataset.pedra){ pedra(el.dataset.pedra); return; }
  if(el.dataset.apagar){ apagarRodada(el.dataset.apagar); return; }
  if(el.dataset.noite){ expandir(el.dataset.noite); return; }
  const id = el.dataset.id;
  ({sala:toggleSala, editar, pedir:pedirExcluir, excluir, arquivar, reativar,
    cancelar:cancelarExcluir})[el.dataset.acao]?.(id);
});
document.getElementById('npNome').addEventListener('keydown', e => {
  if(e.key === 'Enter') document.getElementById('npApelido').focus();
});
document.getElementById('npApelido').addEventListener('keydown', e => {
  if(e.key === 'Enter') savePlayer();
});

/* funções chamadas pelo HTML */
Object.assign(window, {go, toggleSom, toggleManage, toggleAdd, savePlayer, autoMesa,
  startGame, encerrar, inacabada, confirmGame});

/* ---------------- início ---------------- */
/* a noite de 07/09 entrou sem PJ; quem já a tem guardada recebe a contagem da folha */
function migrarSemente(){
  SEMENTE_NOITES.forEach(sem => {
    const n = NOITES.find(x => x.id === sem.id);
    if(n && (n.resumo||[]).some(r => r.pj === null || r.pj === undefined)){
      n.resumo = sem.resumo.map(r => ({...r}));
      n.nota = sem.nota;
    }
  });
}

const tinha = carregar();
migrarSemente();
if(!tinha){
  PLAYERS = SEMENTE_JOGADORES.map(p => ({...p}));
  NOITES  = SEMENTE_NOITES.map(n => ({...n}));
  sala    = PLAYERS.map(p => p.id);
  seats   = {A1:sala[0]||null, A2:sala[1]||null, B1:sala[2]||null, B2:sala[3]||null};
  fila    = sala.slice(4);
}
renderSom(); renderRank(); renderRoom(); renderTable(); renderHist(); renderZerar();
if(!gerenciar) toggleManage(), toggleManage();   // preenche os textos do botão Gerenciar
if(tinha && game && !game.fim){ renderLive(); go('s-live'); toast('Partida em andamento recuperada'); }
salvar();
sincronizar();

if('serviceWorker' in navigator){
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(()=>{}));
}
