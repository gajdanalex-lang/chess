/* ===== Compact floating mode: only the board + best moves, draggable ===== */
(function(){
const css=document.createElement('style');
css.textContent='#float{display:none;position:fixed;z-index:40;background:var(--bg2);border:1px solid var(--bd);border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.55);padding:6px;max-width:98vw}'
+'#fhd{display:flex;justify-content:space-between;align-items:center;cursor:grab;touch-action:none;padding:2px 4px 6px;font-size:12px;color:var(--mu);user-select:none;-webkit-user-select:none}'
+'#fhd button{padding:3px 9px;font-size:13px;margin-left:4px}'
+'body.compact .wrap{display:none}body.compact #float{display:block}'
+'#float #bw{max-width:none}#float .card{margin:6px 0 0}#float #out{max-height:34vh;overflow:auto}'
+'body.fill #float{left:0!important;top:0!important;width:100vw!important;max-width:100vw;height:100%;border-radius:0;border:0;overflow:auto;box-shadow:none}body.fill #fhd{cursor:default}body.fill #float #bw{width:min(100%,62vh);margin:0 auto}';
document.head.appendChild(css);

const bw=$('bw'),card=$('out').parentNode;
const ph1=document.createComment('bw'),ph2=document.createComment('out');
const fp=document.createElement('div');fp.id='float';
fp.innerHTML='<div id="fhd"><span>⠿ drag me</span><span><button id="ffl">⇅</button><button id="fsm">−</button><button id="fbg">+</button><button id="ffill">⛶</button><button id="fx">⤢</button></span></div><div id="fbody"></div>';
document.body.appendChild(fp);

let pos=LS.get('sfa_float',null)||{x:null,y:30,w:340};
const save=()=>LS.set('sfa_float',pos);
const isOn=()=>document.body.classList.contains('compact');
function place(){
  pos.w=Math.max(200,Math.min(pos.w,Math.min(520,innerWidth*.98)));
  fp.style.width=pos.w+'px';
  if(pos.x===null)pos.x=Math.max(0,(innerWidth-pos.w)/2);
  pos.x=Math.max(0,Math.min(pos.x,innerWidth-pos.w));
  pos.y=Math.max(0,Math.min(pos.y,innerHeight-80));
  fp.style.left=pos.x+'px';fp.style.top=pos.y+'px';
}
function enter(){
  if(isOn())return;
  bw.parentNode.insertBefore(ph1,bw);card.parentNode.insertBefore(ph2,card);
  $('fbody').append(bw,card);
  document.body.classList.add('compact');place();LS.set('sfa_compact',true);
}
function leave(){
  if(!isOn())return;
  ph1.parentNode.insertBefore(bw,ph1);ph2.parentNode.insertBefore(card,ph2);
  ph1.remove();ph2.remove();
  document.body.classList.remove('compact');LS.set('sfa_compact',false);
}
$('fx').onclick=leave;
$('ffl').onclick=()=>flipB();
$('fsm').onclick=()=>{pos.w-=40;place();save();};
$('fbg').onclick=()=>{pos.w+=40;place();save();};
const setFill=on=>{document.body.classList.toggle('fill',on);LS.set('sfa_fill',on);};
$('ffill').onclick=()=>setFill(!document.body.classList.contains('fill'));

let dr=null;
const hd=$('fhd');
hd.addEventListener('pointerdown',e=>{
  if(e.target.closest('button'))return;
  dr={dx:e.clientX-pos.x,dy:e.clientY-pos.y};
  try{hd.setPointerCapture(e.pointerId);}catch(_){}
  hd.style.cursor='grabbing';
});
hd.addEventListener('pointermove',e=>{
  if(!dr)return;
  pos.x=e.clientX-dr.dx;pos.y=e.clientY-dr.dy;place();
});
const end=()=>{if(dr){dr=null;hd.style.cursor='grab';save();}};
hd.addEventListener('pointerup',end);
hd.addEventListener('pointercancel',end);
addEventListener('resize',()=>{if(isOn())place();});

const fb=document.querySelector('button[onclick="flipB()"]');
if(fb){
  const b=document.createElement('button');
  b.textContent='▣ Compact';b.onclick=enter;
  fb.parentNode.appendChild(b);
}
if(LS.get('sfa_fill',false))setFill(true);
if(LS.get('sfa_compact',false))enter();
})();

/* Autopilot: engine plays my side (inside this app only) */
(function(){
const pv=[...document.querySelectorAll('details.card>summary')].find(s=>s.textContent.includes('Play vs'));
if(!pv)return;
const row=document.createElement('div');row.className='row';
row.innerHTML='<label><input type="checkbox" id="auto2"> Autopilot: engine plays my moves</label>';
pv.parentNode.appendChild(row);
let busy=false;
setInterval(async()=>{
  if(!$('auto2').checked||busy||!myTurn()||over())return;
  busy=true;
  try{await sleep(600);if($('auto2').checked&&myTurn()&&!over())await playBest();}
  finally{busy=false;}
},500);
})();
