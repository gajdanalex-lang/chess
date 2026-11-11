let clk={w:0,b:0},tcOn=false,lastTick=0,cmpToken=0,cmpCtl=null;

function resetClocks(){flagged=null;tcOn=S.tcmin>0;clk.w=clk.b=S.tcmin*60000;lastTick=0;}
function clockText(c){
  if(!tcOn)return '';
  const ms=Math.max(0,clk[c]);
  if(ms<10000)return (ms/1000).toFixed(1);
  const m=Math.floor(ms/60000),s=Math.floor(ms/1000)%60;
  return m+':'+(s<10?'0':'')+s;
}
function renderClocks(){['w','b'].forEach(c=>{const e=$('ck_'+c);if(e)e.textContent=clockText(c);});}
setInterval(()=>{
  if(!tcOn||flagged||cur()<1||cur()!==SANS.length||g.game_over()){lastTick=0;return;}
  const now=Date.now(),t=g.turn();
  if(lastTick)clk[t]-=now-lastTick;
  lastTick=now;
  if(clk[t]<=0){clk[t]=0;flagged=t;cancelCmp();onOver();renderStatus();renderPlayers();return;}
  renderClocks();
},200);

function cancelCmp(){cmpToken++;thinking=false;if(cmpCtl)cmpCtl.abort();}
async function computerMove(){
  if(over())return false;
  clearTimeout(timer);if(ctl)ctl.abort();
  const tok=++cmpToken,fen=g.fen();
  thinking=true;renderStatus();
  cmpCtl=new AbortController();
  const url='/play?fen='+encodeURIComponent(fen)+'&elo='+S.elo+'&lv='+S.level;
  try{
    let mv=null;
    for(let a=0;a<3&&!mv;a++){
      let j=null;
      try{j=await (await fetch(url,{signal:cmpCtl.signal})).json();}
      catch(e){if(e.name==='AbortError')throw e;}
      if(tok!==cmpToken||g.fen()!==fen)break;
      if(j&&j.move)mv=j.move;
      else if(a===1){try{await fetch('/cfg?restart=1');}catch(e){}}
    }
    const ok=(tok===cmpToken&&g.fen()===fen);
    if(tok===cmpToken)thinking=false;
    if(!ok)return false;
    if(!mv){renderStatus();toast('Engine did not answer');return false;}
    return doMove(mv.slice(0,2),mv.slice(2,4),mv[4]||'q',false);
  }catch(e){
    if(tok===cmpToken){thinking=false;renderStatus();if(e.name!=='AbortError')toast('Engine error');}
    return false;
  }
}
function maybeComputer(){
  if(vs.on&&!over()&&!thinking&&g.turn()!==vs.human&&cur()===SANS.length)computerMove();
}
function startVs(side){
  if(side==='r')side=Math.random()<.5?'w':'b';
  trainer={on:false};$('trinfo').textContent='';
  vs={on:true,human:side};flip=side==='b';
  rst();
  toast('You are '+(side==='w'?'White':'Black')+' vs Stockfish '+S.elo);
}
function stopVs(){vs.on=false;watch=false;cancelCmp();refresh();}
async function watchLoop(){
  while(watch&&!over()){
    const ok=await computerMove();
    if(!ok)break;
    await sleep(350);
  }
  watch=false;renderPlayers();renderStatus();
}
function startWatch(){
  vs.on=false;rst();
  watch=true;watchLoop();
}

function startTrainer(){
  if(!OPEN.length){toast('Openings not loaded yet');return;}
  const q=$('tq').value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const pool=OPEN.filter(o=>o.m.length>=4&&o.m.length<=16&&q.every(t=>o.l.includes(t)));
  if(!pool.length){toast('No opening matches');return;}
  const o=pool[Math.floor(Math.random()*pool.length)];
  vs.on=false;
  loadLine(START,[]);
  trainer={on:true,line:o.m,side:Math.random()<.5?'w':'b',o:o,fails:0};
  flip=trainer.side==='b';
  $('trinfo').innerHTML='Play the <b>'+h(o.e)+' '+h(o.n)+'</b> as '+(trainer.side==='w'?'White':'Black')+'. I answer for the other side.';
  refresh();trainerStep();
}
function stopTrainer(){trainer={on:false};$('trinfo').textContent='';arrows=[];refresh();}
function hintArrowFor(k){
  const m=g.moves({verbose:true}).find(x=>x.san===trainer.line[k]);
  return m?[{from:m.from,to:m.to,col:GREEN}]:[];
}
function trainerHint(){if(!trainer.on){toast('Start the trainer first');return;}arrows=hintArrowFor(cur());drawArrows();}
function trainerMiss(old){
  trainer.fails++;sel=null;
  toast('Not the book move'+(trainer.fails>=2?' – hint shown':''));
  arrows=trainer.fails>=2?hintArrowFor(old):[];
  draw();
}
function trainerStep(){
  if(!trainer.on)return;
  const k=cur();
  if(k>=trainer.line.length){
    trainer.on=false;toast('✅ Line complete!');
    $('trinfo').innerHTML='✅ Finished: <b>'+h(trainer.o.e)+' '+h(trainer.o.n)+'</b>';
    refresh();return;
  }
  if(g.turn()!==trainer.side){
    setTimeout(()=>{
      if(!trainer.on||cur()!==k)return;
      const m=g.moves({verbose:true}).find(x=>x.san===trainer.line[k]);
      if(m)doMove(m.from,m.to,m.promotion||'q',false);
    },450);
  }
}

let OPEN=[],KEY=new Map(),NEXT=new Map();
function updateOpening(){
  const el=$('opn'),hs=g.history();
  if(startFen!==START){el.innerHTML='<div class="lab">Opening</div><div class="nm">Custom position</div>';return;}
  if(!OPEN.length){el.innerHTML='<div class="lab">Opening</div><div class="dim">Openings not loaded.</div>';return;}
  if(!hs.length){el.innerHTML='<div class="lab">Opening</div><div class="nm">Starting position</div>';return;}
  for(let k=hs.length;k>=1;k--){
    const o=KEY.get(hs.slice(0,k).join(' '));
    if(o){
      el.innerHTML='<div class="lab">'+(k===hs.length?'Opening':'Left the book after move '+Math.ceil(k/2))+'</div><div class="nm"><span class="eco">'+h(o.e)+'</span> '+h(o.n)+'</div>';
      return;
    }
  }
  el.innerHTML='<div class="lab">Opening</div><div class="nm">Out of book</div>';
}
function updateBook(){
  const el=$('book');
  if(!OPEN.length||startFen!==START||trainer.on){el.innerHTML=trainer.on?'<div class="dim">Hidden while training.</div>':'';return;}
  const m=NEXT.get(g.history().join(' '));
  if(!m){el.innerHTML='<div class="dim">No known opening continues from here.</div>';return;}
  const legal=g.moves({verbose:true});
  const arr=[...m.entries()].sort((a,b)=>b[1].n-a[1].n).slice(0,8);
  let s='';
  for(const e of arr){
    const san=e[0],v=e[1],mv=legal.find(x=>x.san===san);if(!mv)continue;
    s+='<div class="bk" data-san="'+h(san)+'"><span><b>'+h(words(mv))+'</b></span><small>'+h(v.nm||v.alt)+'<br>'+v.n+' lines</small></div>';
  }
  el.innerHTML=s||'<div class="dim">No book moves.</div>';
}
$('book').onclick=e=>{
  const d=e.target.closest('[data-san]');
  if(!d||!myTurn())return;
  const m=g.moves({verbose:true}).find(x=>x.san===d.dataset.san);
  if(m)doMove(m.from,m.to,m.promotion||'q',true);
};
function loadOpening(i){
  loadLine(START,OPEN[i].m);
  window.scrollTo({top:0,behavior:'smooth'});
}
function rnd(){if(OPEN.length)loadOpening(Math.floor(Math.random()*OPEN.length));}
function search(){
  const q=$('q').value.trim().toLowerCase(),res=$('res');
  if(!OPEN.length){res.innerHTML='<div class="dim">Openings not loaded.</div>';return;}
  if(!q){res.innerHTML='<div class="dim">Type a name or ECO code.</div>';return;}
  const terms=q.split(/\s+/),hits=[];
  for(let i=0;i<OPEN.length&&hits.length<60;i++){if(terms.every(t=>OPEN[i].l.includes(t)))hits.push(i);}
  res.innerHTML=hits.map(i=>'<div class="op" data-i="'+i+'"><b>'+h(OPEN[i].e)+'</b>'+h(OPEN[i].n)+'</div>').join('')||'<div class="dim">Nothing found.</div>';
}
$('res').onclick=e=>{const d=e.target.closest('[data-i]');if(d)loadOpening(+d.dataset.i);};
['Sicilian','Italian','Ruy Lopez',"Queen's Gambit",'French','Caro-Kann',"King's Indian",'London','Scandinavian','English','Dutch','Pirc','Gambit'].forEach(n=>{
  const b=document.createElement('button');b.textContent=n;
  b.onclick=()=>{$('q').value=n;search();};$('chips').appendChild(b);
});
function loadOpenings(){
  fetch('/openings.json').then(r=>r.json()).then(a=>{
    OPEN=a.map(x=>({e:x[0],n:x[1],m:x[2].split(' '),l:(x[1]+' '+x[0]).toLowerCase()}));
    OPEN.forEach(o=>{
      const key=o.m.join(' ');if(!KEY.has(key))KEY.set(key,o);
      for(let i=0;i<o.m.length;i++){
        const pk=o.m.slice(0,i).join(' ');
        let mm=NEXT.get(pk);if(!mm){mm=new Map();NEXT.set(pk,mm);}
        let en=mm.get(o.m[i]);if(!en){en={n:0,nm:null,alt:o.n};mm.set(o.m[i],en);}
        en.n++;if(i===o.m.length-1)en.nm=o.n;
      }
    });
    $('osum').textContent='Browse '+OPEN.length+' openings';
    updateOpening();updateBook();search();
  }).catch(()=>{});
}
