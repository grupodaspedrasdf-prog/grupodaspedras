/* ============================================================
   Nuvem — Firebase / Firestore
   Só um aparelho escreve por noite, e só ao Fechar os Trabalhos.
   Noite fechada é imutável (garantido também pelas regras do servidor).

   O Firebase é carregado SOB DEMANDA. Sem internet, este arquivo
   simplesmente não carrega nada e o app segue funcionando offline.
   ============================================================ */

const SDK = 'https://www.gstatic.com/firebasejs/10.12.5/';

const firebaseConfig = {
  apiKey: "AIzaSyDhZx4JMpOZiQ8PCXjZ6yL1icA9fhFSNZs",
  authDomain: "grupo-das-pedras-5f4a1.firebaseapp.com",
  projectId: "grupo-das-pedras-5f4a1",
  storageBucket: "grupo-das-pedras-5f4a1.firebasestorage.app",
  messagingSenderId: "764872755418",
  appId: "1:764872755418:web:c3db22ed342962186a7de3"
};

/* Código do grupo: quem tem este identificador enxerga as noites.
   Para abrir um segundo grupo um dia, basta trocar aqui. */
export const GRUPO = 'pedras-df-2026';

/* Identidade deste aparelho — para saber quem está com a marcação da mesa. */
export const APARELHO = (() => {
  try{
    let id = localStorage.getItem('pedras-aparelho');
    if(!id){ id = 'ap-' + Math.random().toString(36).slice(2,10); localStorage.setItem('pedras-aparelho', id); }
    return id;
  }catch(e){ return 'ap-' + Math.random().toString(36).slice(2,10); }
})();

let fs = null;          // funções do Firestore, carregadas sob demanda
let db = null;
let pronto = false;
let msg = 'Só neste aparelho';
let tentando = false;

export function estadoNuvem(){ return {ok: pronto, msg}; }

export async function iniciarNuvem(){
  if(pronto) return true;
  if(tentando) return false;
  if(navigator.onLine === false){ msg = 'Sem internet — a noite fica guardada aqui'; return false; }
  tentando = true;
  try{
    const [{ initializeApp }, { getAuth, signInAnonymously }, firestore] = await Promise.all([
      import(SDK + 'firebase-app.js'),
      import(SDK + 'firebase-auth.js'),
      import(SDK + 'firebase-firestore.js')
    ]);
    fs = firestore;
    const app = initializeApp(firebaseConfig);
    await signInAnonymously(getAuth(app));
    db = fs.getFirestore(app);
    await fs.setDoc(fs.doc(db, 'grupos', GRUPO),
      {nome:'Grupo das Pedras', atualizadoEm: Date.now()}, {merge:true});
    pronto = true; msg = 'Sincronizado com o grupo';
    return true;
  }catch(e){
    pronto = false;
    msg = 'Nuvem indisponível — a noite fica guardada aqui';
    console.warn('[nuvem]', e && e.message);
    return false;
  }finally{ tentando = false; }
}

export async function enviarNoite(noite){
  if(!pronto && !(await iniciarNuvem())) return false;
  try{
    const {_naNuvem, ...limpa} = noite;
    await fs.setDoc(fs.doc(db, 'grupos', GRUPO, 'noites', noite.id),
      {...limpa, enviadoEm: Date.now()});
    noite._naNuvem = true;
    return true;
  }catch(e){
    /* As regras proíbem alterar noite já enviada. Se caiu aqui, ou a noite já
       está na nuvem, ou outro aparelho fechou uma noite com o mesmo código —
       e nesse caso NÃO se pode fingir que deu certo. */
    if(e && e.code === 'permission-denied'){
      const igual = await mesmaNoiteNaNuvem(noite);
      if(igual){ noite._naNuvem = true; return true; }
      return 'conflito';
    }
    console.warn('[nuvem] envio', e && e.message);
    return false;
  }
}

async function mesmaNoiteNaNuvem(noite){
  try{
    const d = await fs.getDoc(fs.doc(db, 'grupos', GRUPO, 'noites', noite.id));
    if(!d.exists()) return false;
    const lá = d.data();
    return (lá.totais && noite.totais && lá.totais.partidas === noite.totais.partidas)
        && (lá.resumo||[]).length === (noite.resumo||[]).length;
  }catch(e){ return false; }
}

/* ---------- noite em andamento (mutável, some ao fechar os trabalhos) ---------- */
export async function publicarAberta(estado){
  if(!pronto && !(await iniciarNuvem())) return false;
  try{
    await fs.setDoc(fs.doc(db, 'grupos', GRUPO, 'abertas', estado.id),
      {...estado, marcador: APARELHO, atualizadoEm: Date.now()});
    return true;
  }catch(e){ console.warn('[nuvem] aberta', e && e.message); return false; }
}

export async function apagarAberta(id){
  if(!pronto) return false;
  try{ await fs.deleteDoc(fs.doc(db, 'grupos', GRUPO, 'abertas', id)); return true; }
  catch(e){ return false; }
}

/* Ouve a noite em andamento em tempo real. Devolve uma função para parar de ouvir. */
export function assistirAberta(cb){
  if(!pronto) return () => {};
  try{
    return fs.onSnapshot(fs.collection(db, 'grupos', GRUPO, 'abertas'),
      snap => cb(snap.docs.map(d => ({...d.data(), id:d.id}))),
      err => console.warn('[nuvem] escuta', err && err.message));
  }catch(e){ return () => {}; }
}

export async function baixarNoites(){
  if(!pronto) return [];
  try{
    const snap = await fs.getDocs(fs.collection(db, 'grupos', GRUPO, 'noites'));
    return snap.docs.map(d => ({...d.data(), id:d.id, _naNuvem:true}));
  }catch(e){ console.warn('[nuvem] leitura', e && e.message); return []; }
}

export async function salvarJogadores(lista){
  if(!pronto) return false;
  try{
    await fs.setDoc(fs.doc(db, 'grupos', GRUPO, 'cadastro', 'jogadores'), {
      lista: lista.map(({id,nome,curto,ini,ativo}) => ({id,nome,curto,ini,ativo: ativo !== false})),
      atualizadoEm: Date.now()
    });
    return true;
  }catch(e){ return false; }
}

export async function baixarJogadores(){
  if(!pronto) return [];
  try{
    const d = await fs.getDoc(fs.doc(db, 'grupos', GRUPO, 'cadastro', 'jogadores'));
    return d.exists() ? (d.data().lista || []) : [];
  }catch(e){ return []; }
}
