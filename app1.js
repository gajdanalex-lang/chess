const $=id=>document.getElementById(id);
const h=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const LS={get(k,d){try{const v=localStorage.getItem(k);return v===null?d:JSON.parse(v)}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
const START='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const FILES='abcdefgh';
const SYM={p:'♟\uFE0E',n:'♞\uFE0E',b:'♝\uFE0E',r:'♜\uFE0E',q:'♛\uFE0E',k:'♚\uFE0E'};
const NAMES={p:'pawn',n:'knight',b:'bishop',r:'rook',q:'queen',k:'king'};
const FULL={p:8,n:2,b:2,r:2,q:1},VAL={p:1,n:3,b:3,r:5,q:9};
const GREEN='#22c55e',YEL='#facc15',RED='#ef4444';
const DEF={theme:'dark',bt:'blue',sound:true,haptic:true,speak:false,coords:true,legal:true,showArr:true,words:true,autoq:false,wake:false,auto:true,lines:3,level:4,elo:1800,vsHints:false,tcmin:0,tcinc:0};
let S=Object.assign({},DEF,LS.get('sfa_set',{}));
let g=new Chess(),startFen=START,SANS=[],EV=[];
let sel=null,flip=false,arrows=[],drag=null,pending=null,lastHuman=-1,flagged=null;
let vs={on:false,human:'w'},watch=false,thinking=false,trainer={on:false};
const wp=cp=>50+50*(2/(1+Math.exp(-0.00368208*cp))-1);
const cur=()=>g.history().length;
const over=()=>!!flagged||g.game_over();
const startTurn=()=>startFen.split(' ')[1]||'w';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function toast(t){const e=$('toast');e.textContent=t;e.classList.add('on');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('on'),2300);}

function words(m){
  const side=m.color==='w'?'White':'Black';let t;
  if(m.flags.includes('k'))t=side+' castles kingside';
  else if(m.flags.includes('q'))t=side+' castles queenside';
  else{
    const who=m.piece==='p'?m.from[0]+' pawn':NAMES[m.piece]+' '+m.from;
    if(m.captured)t=side+' '+who+' takes '+NAMES[m.captured]+' on '+m.to+(m.flags.includes('e')?' (en passant)':'');
    else t=side+' '+who+' to '+m.to;
    if(m.promotion)t+=' and promotes to '+NAMES[m.promotion];
  }
  if(m.san.endsWith('#'))t+=' – checkmate';else if(m.san.endsWith('+'))t+=' – check';
  return t;
}
const label=m=>S.words?words(m):(m.color==='w'?'White ':'Black ')+m.san;
function kingSq(color){
  const bd=g.board();
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){const p=bd[r][c];if(p&&p.type==='k'&&p.color===color)return FILES[c]+(8-r);}
}

/* ---------- sound ---------- */
let AC=null;
document.addEventListener('pointerdown',()=>{if(!AC){try{AC=new(window.AudioContext||window.webkitAudioContext)()}catch(e){}}if(AC&&AC.state==='suspended')AC.resume();});
function tone(f,d,ty,v,dl){
  if(!S.sound||!AC)return;
  const t=AC.currentTime+(dl||0),o=AC.createOscillator(),gn=AC.createGain();
  o.type=ty||'sine';o.frequency.value=f;
  gn.gain.setValueAtTime(v||.15,t);gn.gain.exponentialRampToValueAtTime(.001,t+d);
  o.connect(gn);gn.connect(AC.destination);o.start(t);o.stop(t+d+.02);
}
function sfx(m){
  if(S.haptic&&navigator.vibrate){try{navigator.vibrate(m.captured?28:12)}catch(e){}}
  if(S.speak&&window.speechSynthesis){try{speechSynthesis.cancel();speechSynthesis.speak(new SpeechSynthesisUtterance(words(m)))}catch(e){}}
  if(m.san.endsWith('#')){tone(520,.25,'triangle',.2);tone(660,.25,'triangle',.2,.12);tone(880,.4,'triangle',.2,.24);}
  else if(m.san.endsWith('+')){tone(700,.1,'square',.1);tone(950,.16,'square',.1,.1);}
  else if(m.captured){tone(170,.13,'square',.13);tone(110,.1,'sawtooth',.08,.03);}
  else if(m.flags.includes('k')||m.flags.includes('q')){tone(330,.06,'triangle',.2);tone(260,.08,'triangle',.2,.08);}
  else tone(300,.07,'triangle',.22);
}

/* ---------- drawing ---------- */
function draw(){
  const tg={};
  if(sel&&S.legal)g.moves({square:sel,verbose:true}).forEach(m=>{tg[m.to]=1});
  const hist=g.history({verbose:true}),last=hist[hist.length-1];
  const ck=g.in_check()?kingSq(g.turn()):null;
  let html='';
  for(let i=0;i<64;i++){
    const r=flip?7-(i>>3):(i>>3),c=flip?7-(i&7):(i&7);
    const sq=FILES[c]+(8-r),p=g.get(sq);
    const cls='sq '+((r+c)%2?'d':'l')+(last&&(sq===last.from||sq===last.to)?' last':'')+(sq===sel?' sel':'')+(sq===ck?' chk':'')+(tg[sq]?(p?' cap':' mv'):'');
    html+='<div class="'+cls+'">'+(p?'<span class="'+(p.color==='w'?'pw':'pb')+'">'+SYM[p.type]+'</span>':'')
      +((i&7)===0?'<small class="rk">'+sq[1]+'</small>':'')+((i>>3)===7?'<small class="fl">'+sq[0]+'</small>':'')+'</div>';
  }
  $('b').innerHTML=html;drawArrows();
}
function sqXY(sq){const c=FILES.indexOf(sq[0]),r=8-(+sq[1]);return [(flip?7-c:c)+.5,(flip?7-r:r)+.5];}
function drawArrows(){
  if(!S.showArr){$('ar').innerHTML='';return;}
  let s='';
  for(let i=arrows.length-1;i>=0;i--){
    const a=arrows[i],p1=sqXY(a.from),p2=sqXY(a.to),x1=p1[0],y1=p1[1],x2=p2[0],y2=p2[1];
    const dx=x2-x1,dy=y2-y1,L=Math.hypot(dx,dy);if(!L)continue;
    const ux=dx/L,uy=dy/L,px=-uy,py=ux,hl=.36,hw=.27;
    const tx=x2-ux*.1,ty=y2-uy*.1,bx=tx-ux*hl,by=ty-uy*hl,sx=x1+ux*.25,sy=y1+uy*.25;
    s+='<g opacity=".82"><line x1="'+sx+'" y1="'+sy+'" x2="'+bx+'" y2="'+by+'" stroke="'+a.col+'" stroke-width=".15" stroke-linecap="round"/>'
      +'<polygon points="'+tx+','+ty+' '+(bx+px*hw)+','+(by+py*hw)+' '+(bx-px*hw)+','+(by-py*hw)+'" fill="'+a.col+'"/></g>';
  }
  $('ar').innerHTML=s;
}

/* ---------- status / players ---------- */
function resText(){
  if(flagged)return 'Time out – '+(flagged==='w'?'Black':'White')+' wins';
  if(g.in_checkmate())return 'Checkmate – '+(g.turn()==='w'?'Black':'White')+' wins';
  if(g.in_stalemate())return 'Draw – stalemate';
  if(g.insufficient_material())return 'Draw – insufficient material';
  if(g.in_threefold_repetition())return 'Draw – threefold repetition';
  if(g.in_draw())return 'Draw – 50-move rule';
  return '';
}
function renderStatus(){
  const r=resText();
  $('tn').textContent=r||((g.turn()==='w'?'⚪ White':'⚫ Black')+' to move'+(thinking?' – thinking…':''));
  const hist=g.history({verbose:true}),l=hist[hist.length-1];
  $('last').textContent=l?'Last move: '+words(l):(SANS.length?'Start of game':'');
}
function material(){
  const c={w:{p:0,n:0,b:0,r:0,q:0},b:{p:0,n:0,b:0,r:0,q:0}};
  g.board().forEach(r=>r.forEach(p=>{if(p&&p.type!=='k')c[p.color][p.type]++;}));
  return c;
}
function renderPlayers(){
  const cnt=material();
  [['top',flip?'w':'b'],['bot',flip?'b':'w']].forEach(function(x){
    const id=x[0],c=x[1],o=c==='w'?'b':'w';
    let caps='',m1=0,m2=0;
    for(const t of ['q','r','b','n','p']){
      const miss=Math.max(0,FULL[t]-cnt[o][t]);
      if(miss)caps+='<span class="'+(o==='w'?'pw':'pb')+'">'+SYM[t].repeat(miss)+'</span>';
      m1+=VAL[t]*cnt[c][t];m2+=VAL[t]*cnt[o][t];
    }
    let nm=(c==='w'?'⚪ White':'⚫ Black');
    if(vs.on)nm+=' · '+(c===vs.human?'You':'Stockfish '+S.elo);
    else if(watch)nm+=' · Stockfish';
    $(id).className='pl'+(g.turn()===c&&!over()?' act':'');
    $(id).innerHTML='<span class="pn">'+nm+'</span><span class="cp">'+caps+(m1>m2?'<em>+'+(m1-m2)+'</em>':'')+'</span><span class="ck" id="ck_'+c+'">'+clockText(c)+'</span>';
  });
}

/* ---------- moves ---------- */
function myTurn(){
  if(thinking||watch||over())return false;
  if(vs.on&&g.turn()!==vs.human)return false;
  if(trainer.on&&g.turn()!==trainer.side)return false;
  return true;
}
const legalTo=(f,t)=>g.moves({square:f,verbose:true}).some(m=>m.to===t);
function attempt(from,to){
  const o=g.moves({square:from,verbose:true}).filter(m=>m.to===to);
  if(!o.length){sel=null;draw();return;}
  if(o[0].promotion&&!S.autoq){askPromo(from,to,o[0].color);return;}
  doMove(from,to,'q',true);
}
function askPromo(from,to,color){
  pending={from:from,to:to};
  $('promo').innerHTML=['q','r','b','n'].map(t=>'<button data-t="'+t+'" class="'+(color==='w'?'pw':'pb')+'">'+SYM[t]+'</button>').join('');
  $('promo').style.display='flex';
}
$('promo').addEventListener('click',e=>{
  const bt=e.target.closest('[data-t]');
  $('promo').style.display='none';
  if(bt&&pending){const pd=pending;pending=null;doMove(pd.from,pd.to,bt.dataset.t,true);}
  else{pending=null;sel=null;draw();}
});
function doMove(from,to,promo,human){
  const old=cur();
  const m=g.move({from:from,to:to,promotion:promo});
  if(!m){sel=null;draw();return false;}
  if(human&&trainer.on&&m.san!==trainer.line[old]){g.undo();trainerMiss(old);return false;}
  SANS.length=old;SANS.push(m.san);
  EV.length=Math.min(EV.length,old+1);
  sel=null;arrows=[];
  if(tcOn)clk[m.color]+=S.tcinc*1000;
  if(human)lastHuman=old+1;
  afterMove(m);
  return true;
}
function afterMove(m){
  sfx(m);refresh();
  if(over()){onOver();return;}
  maybeComputer();trainerStep();
}
function onOver(){
  const t=resText();if(t)toast(t);
  tone(440,.3,'triangle',.2);tone(330,.4,'triangle',.2,.2);
  watch=false;
}
function tap(s){
  if(!s)return;
  if(sel&&s!==sel&&legalTo(sel,s)){attempt(sel,s);return;}
  const p=g.get(s);
  if(p&&p.color===g.turn()&&myTurn())sel=(sel===s)?null:s;else sel=null;
  draw();
}

/* ---------- pointer: tap + drag ---------- */
const B=$('b');
function sqAt(x,y){
  const r=B.getBoundingClientRect();
  const cx=Math.floor((x-r.left)/r.width*8),cy=Math.floor((y-r.top)/r.height*8);
  if(cx<0||cx>7||cy<0||cy>7)return null;
  return FILES[flip?7-cx:cx]+(8-(flip?7-cy:cy));
}
B.addEventListener('pointerdown',e=>{
  const s=sqAt(e.clientX,e.clientY);if(!s)return;
  const p=g.get(s);
  drag={from:s,x:e.clientX,y:e.clientY,moved:false,own:!!(p&&p.color===g.turn()&&myTurn()),p:p};
  try{B.setPointerCapture(e.pointerId)}catch(_){}
});
B.addEventListener('pointermove',e=>{
  if(!drag)return;
  const gh=$('ghost');
  if(!drag.moved){
    if(!drag.own||Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<10)return;
    drag.moved=true;sel=drag.from;draw();
    gh.className=drag.p.color==='w'?'pw':'pb';gh.textContent=SYM[drag.p.type];gh.style.display='block';
  }
  gh.style.left=e.clientX+'px';gh.style.top=e.clientY+'px';
});
B.addEventListener('pointerup',e=>{
  if(!drag)return;
  const d=drag;drag=null;$('ghost').style.display='none';
  const s=sqAt(e.clientX,e.clientY);
  if(d.moved){
    if(s&&s!==d.from&&legalTo(d.from,s))attempt(d.from,s);else{sel=null;draw();}
    return;
  }
  tap(s);
});
B.addEventListener('pointercancel',()=>{drag=null;$('ghost').style.display='none';});

/* ---------- navigation ---------- */
function refresh(){
  if(over())EV[cur()]={cp:overEval()};
  draw();renderStatus();renderPlayers();renderMoves();renderGraph();updateOpening();updateBook();
  $('fen').value=g.fen();
  LS.set('sfa_cur',{start:startFen,sans:SANS,ply:cur(),flip:flip});
  analyze();
}
function overEval(){
  if(flagged)return flagged==='w'?-10000:10000;
  if(g.in_checkmate())return g.turn()==='w'?-10000:10000;
  return 0;
}
function jump(p){
  cancelCmp();
  p=Math.max(0,Math.min(SANS.length,p));
  let c=cur();
  while(c>p){g.undo();c--;}
  while(c<p){if(!g.move(SANS[c]))break;c++;}
  sel=null;arrows=[];refresh();
  if(cur()===SANS.length)maybeComputer();
}
const goFirst=()=>jump(0),goPrev=()=>jump(cur()-1),goNext=()=>jump(cur()+1),goLast=()=>jump(SANS.length);
function undo(){
  if(cur()<1)return;
  jump(cur()-1);
  if(vs.on&&g.turn()!==vs.human&&cur()>0)jump(cur()-1);
}
function flipB(){flip=!flip;draw();renderPlayers();}
function rst(){cancelCmp();watch=false;loadLine(START,[]);}
function loadLine(fen,sans,keep){
  const t=new Chess();
  if(!t.load(fen)){toast('Invalid position');return false;}
  cancelCmp();
  if(!keep){trainer={on:false};watch=false;$('trinfo').textContent='';}
  g=fen===START?new Chess():new Chess(fen);
  startFen=fen;SANS=[];EV=[];
  for(const s of sans){if(!g.move(s))break;SANS.push(s);}
  sel=null;arrows=[];lastHuman=-1;
  resetClocks();refresh();maybeComputer();
  return true;
}
