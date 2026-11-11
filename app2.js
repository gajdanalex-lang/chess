let ctl=null,timer=null,reqId=0,allRun=false;
const fmtN=n=>n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?Math.round(n/1e3)+'k':String(n);

function canAuto(){return S.auto&&!watch&&!thinking&&!trainer.on&&(!vs.on||S.vsHints);}
function analyze(force){
  clearTimeout(timer);if(ctl)ctl.abort();reqId++;
  arrows=[];drawArrows();
  if(over()){$('out').innerHTML='<div class="dim">Game over.</div>';return;}
  if(!force&&!canAuto()){$('out').innerHTML='<div class="dim">Auto-analysis is paused. Tap 💡 Hint to analyze this position.</div>';return;}
  timer=setTimeout(()=>{if(force||canAuto())run();},force?0:150);
}
async function run(){
  const id=++reqId,out=$('out');
  out.innerHTML='<div class="dim">Thinking…</div>';
  const fen=g.fen(),white=g.turn()==='w',p=cur();
  const url='/analyze?fen='+encodeURIComponent(fen)+'&n='+S.lines+'&lv='+S.level;
  for(let a=0;a<3;a++){
    if(id!==reqId)return;
    ctl=new AbortController();
    try{
      const j=await (await fetch(url,{signal:ctl.signal})).json();
      if(id!==reqId)return;
      if(j.lines&&j.lines.length&&renderLines(j.lines,fen,white,p))return;
    }catch(e){
      if(e.name==='AbortError')return;
    }
    if(id!==reqId)return;
    out.innerHTML='<div class="dim">Engine hiccup – retrying…</div>';
    if(a===1){try{await fetch('/cfg?restart=1');}catch(e){}}
    await sleep(300);
  }
  if(id===reqId)out.innerHTML='<div class="dim">Engine did not answer. Tap 💡 Hint to retry.</div>';
}
function renderLines(lines,fen,white,p){
  let html='';const arr=[];
  lines.forEach((l,i)=>{
    const t=new Chess(fen),ms=[];
    for(const u of l.pv.split(' ')){
      const m=t.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]});
      if(!m)break;ms.push(m);
    }
    if(!ms.length)return;
    const col=i===0?GREEN:(i===lines.length-1?RED:YEL);
    arr.push({from:ms[0].from,to:ms[0].to,col:col});
    const v=(white?1:-1)*l.val;
    const e=l.kind==='mate'?(v>0?'+':'−')+'M'+Math.abs(l.val):(v>0?'+':'')+(v/100).toFixed(2);
    if(i===0)topLine(l,v,e,white,p,fen);
    const rest=ms.slice(1,6).map(label).join(' › ');
    html+='<div class="ln"><i class="dot" style="background:'+col+'"></i><b class="ev" style="color:'+col+'">'+e+'</b><div><div class="first">'+h(label(ms[0]))+' <span class="san">'+h(ms[0].san)+'</span></div>'+(rest?'<div class="rest">then: '+h(rest)+'</div>':'')+'</div></div>';
  });
  if(!arr.length)return false;
  arrows=arr;
  $('out').innerHTML=html;
  drawArrows();
  return true;
}
function topLine(l,v,e,white,p,fen){
  $('ev').textContent=e;
  $('ew').style.width=(l.kind==='mate'?(v>0?100:0):100/(1+Math.exp(-v/300)))+'%';
  $('eng').textContent='depth '+l.depth+(l.nps?' · '+fmtN(l.nps)+' nodes/s':'');
  if(l.wdl){
    let w=l.wdl[0],d=l.wdl[1],lo=l.wdl[2];
    if(!white){const x=w;w=lo;lo=x;}
    $('wdl').innerHTML='<div class="wdl"><i style="width:'+w/10+'%;background:#fff"></i><i style="width:'+d/10+'%;background:#8ea0c9"></i><i style="width:'+lo/10+'%;background:#111"></i></div><div class="dim">White wins '+Math.round(w/10)+'% · draw '+Math.round(d/10)+'% · Black wins '+Math.round(lo/10)+'%</div>';
  }else $('wdl').innerHTML='';
  if(cur()===p&&g.fen()===fen){
    EV[p]={cp:l.kind==='mate'?(v>0?10000:-10000):v};
    renderGraph();renderMoves();
    if(lastHuman===p){const n=nagFor(p);if(n)toast(n.txt+(n.sym?' '+n.sym:''));lastHuman=-1;}
  }
}
function hint(){
  if(trainer.on){trainerHint();return;}
  analyze(true);
}
async function playBest(){
  if(!myTurn())return;
  const fen=g.fen();
  try{
    const j=await (await fetch('/analyze?fen='+encodeURIComponent(fen)+'&n=1&lv='+S.level)).json();
    const l=j.lines[0];if(!l||g.fen()!==fen)return;
    const u=l.pv.split(' ')[0];
    doMove(u.slice(0,2),u.slice(2,4),u[4]||'q',true);
  }catch(e){toast('Engine error');}
}

function nagFor(i){
  const a=EV[i-1],b=EV[i];if(!a||!b)return null;
  const mw=(startTurn()==='w')===(i%2===1);
  const loss=mw?wp(a.cp)-wp(b.cp):wp(b.cp)-wp(a.cp);
  let sym='',cls='',txt='Good';
  if(loss>28){sym='??';cls='n3';txt='Blunder';}
  else if(loss>16){sym='?';cls='n2';txt='Mistake';}
  else if(loss>8){sym='?!';cls='n1';txt='Inaccuracy';}
  else if(loss<=2)txt='Excellent';
  return {loss:loss,sym:sym,cls:cls,txt:txt,mw:mw};
}
function accuracy(){
  const a={w:[],b:[]};
  for(let i=1;i<=SANS.length;i++){
    const n=nagFor(i);if(!n)continue;
    a[n.mw?'w':'b'].push(Math.max(0,Math.min(100,103.1668*Math.exp(-0.04354*Math.max(0,n.loss))-3.1669)));
  }
  const avg=x=>x.length?Math.round(x.reduce((s,v)=>s+v,0)/x.length):null;
  return {w:avg(a.w),b:avg(a.b)};
}
function renderMoves(){
  const box=$('mvl');let s='';
  const c=cur(),st=startTurn(),fm=parseInt(startFen.split(' ')[5])||1;
  for(let j=0;j<SANS.length;j++){
    const w=(st==='w')===(j%2===0);
    const num=fm+Math.floor((j+(st==='b'?1:0))/2);
    if(w)s+='<b>'+num+'.</b>';else if(j===0)s+='<b>'+num+'…</b>';
    const n=nagFor(j+1);
    s+='<span class="mvs'+(j+1===c?' on':'')+(n&&n.cls?' '+n.cls:'')+'" data-p="'+(j+1)+'">'+h(SANS[j])+(n?n.sym:'')+'</span>';
  }
  box.innerHTML=s||'<span class="dim">No moves yet.</span>';
  const on=box.querySelector('.on');if(on)box.scrollTop=on.offsetTop-box.clientHeight/2;
}
$('mvl').onclick=e=>{const d=e.target.closest('[data-p]');if(d)jump(+d.dataset.p);};
function renderGraph(){
  const L=Math.max(1,SANS.length),W=300,H=80;
  let d='',pen=false;
  for(let i=0;i<=SANS.length;i++){
    const e=EV[i];if(!e){pen=false;continue;}
    d+=(pen?'L':'M')+(i/L*W).toFixed(1)+' '+(H-wp(e.cp)/100*H).toFixed(1)+' ';pen=true;
  }
  const cx=(cur()/L*W).toFixed(1);
  $('graph').innerHTML='<svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none">'
    +'<rect width="'+W+'" height="'+H/2+'" fill="rgba(255,255,255,.14)"/><rect y="'+H/2+'" width="'+W+'" height="'+H/2+'" fill="rgba(0,0,0,.3)"/>'
    +'<path d="'+d+'" fill="none" stroke="#5eead4" stroke-width="2" vector-effect="non-scaling-stroke"/>'
    +'<line x1="'+cx+'" x2="'+cx+'" y1="0" y2="'+H+'" stroke="#a78bfa" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>';
  const a=accuracy();
  $('acc').textContent=(a.w!==null||a.b!==null)?'   ⚪ '+(a.w===null?'–':a.w+'%')+'  ⚫ '+(a.b===null?'–':a.b+'%')+' accuracy':'';
}
$('graph').onclick=e=>{
  const r=e.currentTarget.getBoundingClientRect();
  jump(Math.round((e.clientX-r.left)/r.width*SANS.length));
};
async function analyzeAll(){
  const btn=$('aab');
  if(allRun){allRun=false;return;}
  allRun=true;btn.textContent='⏹ Stop';
  const snap=SANS.join(' '),t=startFen===START?new Chess():new Chess(startFen),fens=[t.fen()];
  for(const s of SANS){t.move(s);fens.push(t.fen());}
  for(let i=0;i<fens.length&&allRun&&SANS.join(' ')===snap;i++){
    const tt=new Chess(fens[i]);
    if(tt.game_over()){EV[i]={cp:tt.in_checkmate()?(tt.turn()==='w'?-10000:10000):0};continue;}
    $('aprog').textContent='Analyzing '+i+' / '+(fens.length-1);
    let l=null;
    for(let a=0;a<2&&!l&&allRun;a++){
      try{
        const j=await (await fetch('/analyze?fen='+encodeURIComponent(fens[i])+'&n=1&lv='+S.level)).json();
        l=j.lines[0]||null;
      }catch(e){}
    }
    if(l){const v=(tt.turn()==='w'?1:-1)*l.val;EV[i]={cp:l.kind==='mate'?(v>0?10000:-10000):v};}
    renderGraph();renderMoves();
  }
  allRun=false;btn.textContent='📊 Analyze whole game';$('aprog').textContent='Done';
  renderGraph();renderMoves();
}
