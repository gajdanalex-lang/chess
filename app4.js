const PRE=[
['Standard start',START],
['King + Queen vs King','8/8/8/4k3/8/8/3Q4/4K3 w - - 0 1'],
['King + Rook vs King','8/8/8/4k3/8/8/3R4/4K3 w - - 0 1'],
['Two Bishops vs King','8/8/8/4k3/8/8/2BB4/4K3 w - - 0 1'],
['Bishop + Knight vs King','8/8/8/4k3/8/8/2BN4/4K3 w - - 0 1'],
['King + Pawn (opposition)','8/8/8/4k3/8/4K3/4P3/8 w - - 0 1'],
['Lucena position','1K6/1P1k4/8/8/8/8/r7/2R5 w - - 0 1'],
['Back-rank mate in 1','6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1'],
['Scholar\u2019s mate in 1','r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4'],
['Smothered mate in 1','6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1'],
['Fool\u2019s mate in 1','rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2']
];
function buildPresets(){$('pre').innerHTML='<option value="">Choose a position…</option>'+PRE.map((p,i)=>'<option value="'+i+'">'+h(p[0])+'</option>').join('');}
function loadPreset(v){if(v==='')return;loadLine(PRE[+v][1],[]);$('pre').value='';}

/* ---------- game tools ---------- */
async function copyText(t){
  try{await navigator.clipboard.writeText(t);toast('Copied');}
  catch(e){prompt('Copy this:',t);}
}
function loadFenBox(){const f=$('fen').value.trim();if(f)loadLine(f,[]);}
function fullPgn(){
  const t=startFen===START?new Chess():new Chess(startFen);
  t.header('Event','Stockfish Analyzer','Date',new Date().toISOString().slice(0,10).replace(/-/g,'.'));
  SANS.forEach(s=>t.move(s));
  return t.pgn();
}
function exportPgn(){$('pgn').value=fullPgn();}
function importPgn(){
  const txt=$('pgn').value.trim();if(!txt)return;
  const t=new Chess();
  if(!t.load_pgn(txt)){toast('Could not read PGN');return;}
  const hd=t.header(),fen=(hd.SetUp==='1'&&hd.FEN)?hd.FEN:START;
  loadLine(fen,t.history());
}
function sharePgn(){
  const p=fullPgn();$('pgn').value=p;
  if(navigator.share)navigator.share({title:'Chess game',text:p}).catch(()=>{});else copyText(p);
}
function saveGame(){
  const nm=prompt('Name this game','Game '+new Date().toLocaleString());if(!nm)return;
  const a=LS.get('sfa_games',[]);
  a.unshift({n:nm,start:startFen,sans:SANS.slice(),t:Date.now()});
  LS.set('sfa_games',a.slice(0,50));renderSaves();toast('Saved');
}
function renderSaves(){
  const a=LS.get('sfa_games',[]);
  $('saves').innerHTML=a.map((x,i)=>'<div class="bk"><span data-load="'+i+'">'+h(x.n)+'<br><small>'+x.sans.length+' plies</small></span><button data-del="'+i+'">🗑</button></div>').join('')||'<div class="dim">No saved games yet.</div>';
}
$('saves').onclick=e=>{
  const l=e.target.closest('[data-load]'),d=e.target.closest('[data-del]');
  const a=LS.get('sfa_games',[]);
  if(d){a.splice(+d.dataset.del,1);LS.set('sfa_games',a);renderSaves();}
  else if(l){const x=a[+l.dataset.load];if(x){loadLine(x.start,x.sans);window.scrollTo({top:0,behavior:'smooth'});}}
};

/* ---------- settings ---------- */
function apply(){
  document.body.classList.toggle('light',S.theme==='light');
  $('bw').dataset.bt=S.bt;
  $('bw').classList.toggle('nocoord',!S.coords);
}
function bindSettings(){
  document.querySelectorAll('[data-s]').forEach(el=>{
    const k=el.dataset.s;
    if(el.type==='checkbox')el.checked=!!S[k];else el.value=String(S[k]);
    el.onchange=()=>{
      S[k]=el.type==='checkbox'?el.checked:(isNaN(+el.value)?el.value:+el.value);
      LS.set('sfa_set',S);onSet(k);
    };
  });
}
function onSet(k){
  apply();
  if(k==='tcmin'||k==='tcinc'){resetClocks();renderPlayers();}
  if(k==='wake')wakeLock();
  refresh();
}
let wl=null;
async function wakeLock(){
  try{
    if(S.wake&&navigator.wakeLock){wl=await navigator.wakeLock.request('screen');}
    else if(wl){await wl.release();wl=null;}
  }catch(e){}
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&S.wake)wakeLock();});

/* ---------- engine info / config ---------- */
function applyInfo(j){
  $('lv').innerHTML=j.levels.map((l,i)=>'<option value="'+(i+1)+'">'+(i+1)+' · '+h(l.name)+'</option>').join('');
  $('lv').value=String(S.level);
  let t='';for(let i=1;i<=j.maxthreads;i++)t+='<option value="'+i+'">'+i+'</option>';
  $('thr').innerHTML=t;$('thr').value=String(j.threads);
  $('hsh').value=String(j.hash);
  $('engn').textContent=j.engine||'';
}
async function loadInfo(){
  let j;
  try{j=await (await fetch('/info')).json();}
  catch(e){j={levels:['Beginner','Easy','Casual','Fast','Strong','Expert','Master','Max'].map(n=>({name:n})),threads:4,maxthreads:4,hash:128,engine:'(offline)'};}
  applyInfo(j);
}
async function cfg(q){
  try{const j=await (await fetch('/cfg?'+q)).json();applyInfo(j);toast('Engine updated');}
  catch(e){toast('Engine unreachable');}
}
async function quitServer(){
  if(!confirm('Stop the analyzer server?'))return;
  try{await fetch('/quit');}catch(e){}
  document.body.innerHTML='<p style="padding:30px;font:18px sans-serif;color:#888">Server stopped. You can close this tab.</p>';
}

/* ---------- keyboard ---------- */
document.addEventListener('keydown',e=>{
  const t=e.target.tagName;if(t==='INPUT'||t==='TEXTAREA'||t==='SELECT')return;
  const k=e.key;
  if(k==='ArrowLeft')goPrev();else if(k==='ArrowRight')goNext();
  else if(k==='Home')goFirst();else if(k==='End')goLast();
  else if(k==='f')flipB();else if(k==='z')undo();else if(k==='h')hint();
  else if(k==='b')playBest();else if(k==='n')rst();else return;
  e.preventDefault();
});

/* ---------- start ---------- */
(async function init(){
  await loadInfo();
  bindSettings();apply();buildPresets();renderSaves();resetClocks();
  const sv=LS.get('sfa_cur',null);
  if(sv&&sv.sans&&sv.sans.length){
    flip=!!sv.flip;
    loadLine(sv.start||START,sv.sans,true);
    if(typeof sv.ply==='number')jump(sv.ply);
  }else refresh();
  wakeLock();loadOpenings();
})();
