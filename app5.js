/* ===== AI system: offline coach, Claude coach + chat, opponent personalities ===== */
(function(){
const DEFAI={bot:'stockfish',aiModel:'claude-sonnet-5-5'};
for(const k in DEFAI)if(S[k]===undefined)S[k]=DEFAI[k];
const BOTS=[['stockfish','Stockfish (uses Strength)'],['aggressor','Aggressor ⚔'],['fortress','Fortress 🛡'],['human','Human-like 🙂'],['gambiteer','Gambiteer 🎲'],['chaos','Chaos 🌀']];
const COACH='You are a friendly, concise chess coach for a club-level player. Base every concrete claim about tactics and evaluation on the Stockfish lines provided. If the lines do not support a claim, say you are not sure instead of inventing variations. Plain English, short paragraphs, at most 150 words.';

const sums=[...document.querySelectorAll('details.card>summary')];
const find=t=>(sums.find(s=>s.textContent.includes(t))||{}).parentNode;
const pv=find('Play vs');
if(pv){
  const r=document.createElement('div');r.className='row';
  r.innerHTML='<label>Opponent <select data-s="bot">'+BOTS.map(b=>'<option value="'+b[0]+'">'+b[1]+'</option>').join('')+'</select></label>';
  pv.querySelector('summary').after(r);
}
const st=find('Settings');
if(st){
  const d=document.createElement('div');
  d.innerHTML='<div class="lab" style="margin-top:10px">AI coach (Claude)</div>'
    +'<input type="password" id="aikey" placeholder="Anthropic API key (sk-ant-…)" style="width:100%;margin:6px 0;background:var(--in)">'
    +'<div class="row"><button id="aikeysave">Save key</button><button id="aikeyclr">Remove key</button><span id="aikeyst" class="dim"></span></div>'
    +'<label>Model <input type="text" data-s="aiModel"></label>';
  st.appendChild(d);
}
const card=document.createElement('div');card.className='card';card.id='coach';
card.innerHTML='<div class="lab">Coach</div><div id="coachOff" class="dim">Analyze a position to get tips.</div>'
  +'<div class="row"><button id="coachAI">🧠 Explain with AI</button></div>'
  +'<div id="coachOut" class="dim" style="white-space:pre-wrap"></div>'
  +'<input type="text" id="chatIn" placeholder="Ask about this position…">'
  +'<div class="row"><button id="chatGo">Ask</button><button id="chatClr">Clear chat</button></div>';
$('out').parentNode.after(card);

async function keyStatus(){
  try{const j=await (await fetch('/aikey')).json();$('aikeyst').textContent=j.has?'Key saved ✓':'No key';}
  catch(e){$('aikeyst').textContent='Server needs the AI patch';}
}
$('aikeysave').onclick=async()=>{
  const k=$('aikey').value.trim();if(!k)return;
  try{await fetch('/aikey?k='+encodeURIComponent(k));}catch(e){}
  $('aikey').value='';keyStatus();
};
$('aikeyclr').onclick=async()=>{try{await fetch('/aikey?clear=1');}catch(e){}keyStatus();};
keyStatus();

async function askAI(system,msg,max){
  const url='/ai?model='+encodeURIComponent(S.aiModel||'claude-sonnet-5-5')+'&max='+(max||500)
    +'&sys='+encodeURIComponent(system)+'&msg='+encodeURIComponent(msg);
  const j=await (await fetch(url)).json();
  if(j.error)throw new Error(typeof j.error==='string'?j.error:(j.error.message||'API error'));
  return (j.content||[]).map(c=>c.text||'').join('').trim()||'(empty reply)';
}
async function context(){
  const fen=g.fen(),white=g.turn()==='w';
  let lines=[];
  try{lines=(await (await fetch('/analyze?fen='+encodeURIComponent(fen)+'&n=3&lv='+S.level)).json()).lines||[];}catch(e){}
  const eng=lines.map((l,i)=>{
    const t=new Chess(fen),sn=[];
    for(const u of l.pv.split(' ').slice(0,6)){
      const m=t.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]});
      if(!m)break;sn.push(m.san);
    }
    const v=(white?1:-1)*l.val;
    const e=l.kind==='mate'?'mate in '+Math.abs(l.val)+(l.val>0?' for the side to move':' against the side to move'):(v>0?'+':'')+(v/100).toFixed(2)+' (White POV)';
    return (i+1)+') '+sn.join(' ')+'  eval '+e;
  }).join('\n');
  const n=cur()?nagFor(cur()):null;
  return 'FEN: '+fen+'\nSide to move: '+(white?'White':'Black')
    +'\nMoves so far: '+(SANS.slice(0,cur()).slice(-60).join(' ')||'(none)')
    +(n?'\nLast move quality: '+n.txt:'')
    +'\nStockfish top lines:\n'+(eng||'(engine unavailable)');
}
$('coachAI').onclick=async()=>{
  const o=$('coachOut');o.textContent='Thinking…';
  try{
    o.textContent=await askAI(COACH,(await context())+'\n\nExplain the key ideas in this position and the last move, and what each side should aim for.',500);
  }catch(e){o.textContent='⚠ '+e.message;}
};
let chat=[];
$('chatGo').onclick=async()=>{
  const q=$('chatIn').value.trim();if(!q)return;
  const o=$('coachOut');
  $('chatIn').value='';
  const hist=chat.slice(-4).map(x=>'Q: '+x.q+'\nA: '+x.a).join('\n');
  o.textContent=(chat.map(x=>'You: '+x.q+'\nCoach: '+x.a).join('\n\n')+(chat.length?'\n\n':'')+'You: '+q+'\nCoach: …');
  try{
    const a=await askAI(COACH,(await context())+(hist?'\n\nEarlier conversation:\n'+hist:'')+'\n\nQuestion: '+q,500);
    chat.push({q:q,a:a});
  }catch(e){chat.push({q:q,a:'⚠ '+e.message});}
  o.textContent=chat.map(x=>'You: '+x.q+'\nCoach: '+x.a).join('\n\n');
};
$('chatClr').onclick=()=>{chat=[];$('coachOut').textContent='';};

function offline(lines,fen,white,p){
  const b=lines[0],t=new Chess(fen),u=b.pv.split(' ')[0];
  const m=t.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]});
  const v=(white?1:-1)*b.val,a=Math.abs(v),side=v>0?'White':'Black';
  const s=[];
  if(b.kind==='mate')s.push((b.val>0?(white?'White':'Black'):(white?'Black':'White'))+' has a forced mate in '+Math.abs(b.val)+'.');
  else s.push(a<30?'The position is roughly equal.':a<100?side+' is slightly better.':a<250?side+' has a clear advantage.':side+' is winning.');
  const c=material();let d=0;
  for(const k of 'pnbrq')d+=VAL[k]*(c.w[k]-c.b[k]);
  if(d)s.push((d>0?'White':'Black')+' is up '+Math.abs(d)+' point'+(Math.abs(d)>1?'s':'')+' of material.');
  const n=p?nagFor(p):null;
  if(n&&n.sym)s.push('The last move was a '+n.txt.toLowerCase()+' (about '+Math.round(n.loss)+'% winning chance lost).');
  if(m){
    const w=[];
    if(m.captured)w.push('captures a '+NAMES[m.captured]);
    if(m.san.includes('#'))w.push('delivers checkmate');else if(m.san.includes('+'))w.push('gives check');
    if(m.promotion)w.push('promotes');
    if(m.flags.includes('k')||m.flags.includes('q'))w.push('castles to safety');
    if(!w.length&&m.piece==='p'&&'de'.includes(m.to[0])&&'45'.includes(m.to[1]))w.push('fights for the centre');
    else if(!w.length&&(m.piece==='n'||m.piece==='b')&&p<=20)w.push('develops a piece');
    s.push('Best move: '+words(m)+(w.length?' – it '+w.join(' and ')+'.':'.'));
  }
  if(lines[1]&&b.kind!=='mate'&&lines[1].kind!=='mate'&&Math.abs(lines[1].val-b.val)<=30){
    const t2=new Chess(fen),u2=lines[1].pv.split(' ')[0];
    const m2=t2.move({from:u2.slice(0,2),to:u2.slice(2,4),promotion:u2[4]});
    if(m2)s.push('Also fine: '+m2.san+'.');
  }
  if(b.wdl){
    let w=b.wdl[0],l=b.wdl[2];const dr=b.wdl[1];
    if(!white){const x=w;w=l;l=x;}
    s.push('Chances: White '+Math.round(w/10)+'%, draw '+Math.round(dr/10)+'%, Black '+Math.round(l/10)+'%.');
  }
  return s.join(' ');
}
const _rl=window.renderLines;
window.renderLines=function(lines,fen,white,p){
  const ok=_rl(lines,fen,white,p);
  if(ok){try{$('coachOff').textContent=offline(lines,fen,white,p);}catch(e){}}
  return ok;
};

function pickBot(fen,lines){
  const t=new Chess(fen),legal=t.moves({verbose:true}),c=[];
  lines.forEach(l=>{
    const u=l.pv.split(' ')[0];
    const m=legal.find(x=>x.from===u.slice(0,2)&&x.to===u.slice(2,4)&&(!x.promotion||x.promotion===(u[4]||'q')));
    if(!m)return;
    c.push({m:m,sc:l.kind==='mate'?(l.val>0?10000:-10000):l.val});
  });
  if(!c.length)return null;
  const best=Math.max(...c.map(x=>x.sc)),B=S.bot;
  if(B==='stockfish'){const alt=c.filter(x=>x.sc<best&&x.sc>=best-150);const o=alt.length?alt:c.filter(x=>x.sc===best);return o[Math.floor(Math.random()*o.length)].m;}
  const tol={aggressor:90,fortress:70,human:160,gambiteer:260,chaos:450}[B]||50;
  let pool=c.filter(x=>x.sc>=best-tol);
  if(B==='human'&&Math.random()<.08)pool=c.filter(x=>x.sc>=best-300);
  const wgt=x=>{
    const m=x.m,chk=/[+#]/.test(m.san),cap=!!m.captured,castle=m.flags.includes('k')||m.flags.includes('q');
    let w=1;
    if(B==='aggressor')w+=(cap?3:0)+(chk?3:0)+(m.piece==='p'?1:0)+(m.piece==='q'||m.piece==='n'?1:0);
    else if(B==='fortress')w+=(cap||chk?0:2)+(castle?4:0)+(m.piece==='k'&&!castle?-0.5:0);
    else if(B==='human')w=Math.exp((x.sc-best)/120);
    else if(B==='gambiteer')w+=(cap&&VAL[m.captured]<VAL[m.piece]?4:0)+(m.piece==='p'&&'abgh'.includes(m.from[0])?1.5:0)+(chk?1:0);
    return Math.max(.05,w);
  };
  let tot=0;const ws=pool.map(x=>{const w=wgt(x);tot+=w;return w;});
  let r=Math.random()*tot,i=0;
  while(i<pool.length-1&&(r-=ws[i])>0)i++;
  return pool[i].m;
}
let pity=0;function pityHit(){const hit=Math.random()<1/(50-pity);if(hit)pity=0;else pity++;return hit;}
const _cm=window.computerMove;
window.computerMove=async function(){
  if(S.bot==='stockfish'||over())return _cm();
  clearTimeout(timer);if(ctl)ctl.abort();
  const tok=++cmpToken,fen=g.fen();
  thinking=true;renderStatus();
  cmpCtl=new AbortController();
  const lv=(S.bot==='human'||S.bot==='chaos')?Math.min(S.level,3):S.level;
  const url='/analyze?fen='+encodeURIComponent(fen)+'&n=5&lv='+lv;
  try{
    let j=null;
    for(let a=0;a<3&&!(j&&j.lines&&j.lines.length);a++){
      try{j=await (await fetch(url,{signal:cmpCtl.signal})).json();}
      catch(e){if(e.name==='AbortError')throw e;}
      if(tok!==cmpToken||g.fen()!==fen)break;
      if(a===1&&!(j&&j.lines&&j.lines.length)){try{await fetch('/cfg?restart=1');}catch(e){}}
    }
    const ok=(tok===cmpToken&&g.fen()===fen);
    if(tok===cmpToken)thinking=false;
    if(!ok)return false;
    const mv=pickBot(fen,(j&&j.lines)||[]);
    if(!mv){renderStatus();toast('Engine did not answer');return false;}
    return doMove(mv.from,mv.to,mv.promotion||'q',false);
  }catch(e){
    if(tok===cmpToken){thinking=false;renderStatus();if(e.name!=='AbortError')toast('Engine error');}
    return false;
  }
};
})();

/* quick lines first, then deepen to the chosen level */
window.run=async function(){
  const id=++reqId,out=$('out');
  out.innerHTML='<div class="dim">Thinking…</div>';
  const fen=g.fen(),white=g.turn()==='w',p=cur();
  const base='/analyze?fen='+encodeURIComponent(fen)+'&n='+S.lines+'&lv=';
  const quick=Math.min(S.level,2);
  const stages=S.level>quick?[quick,S.level]:[S.level];
  let shown=false;
  for(let si=0;si<stages.length;si++){
    let done=false;
    for(let a=0;a<3&&!done;a++){
      if(id!==reqId)return;
      ctl=new AbortController();
      try{
        const j=await (await fetch(base+stages[si],{signal:ctl.signal})).json();
        if(id!==reqId)return;
        if(j.lines&&j.lines.length&&renderLines(j.lines,fen,white,p))done=true;
      }catch(e){if(e.name==='AbortError')return;}
      if(done)break;
      if(id!==reqId)return;
      if(!shown)out.innerHTML='<div class="dim">Engine hiccup – retrying…</div>';
      if(a===1){try{await fetch('/cfg?restart=1');}catch(e){}}
      await sleep(300);
    }
    if(!done){
      if(!shown&&id===reqId)out.innerHTML='<div class="dim">Engine did not answer. Tap 💡 Hint to retry.</div>';
      return;
    }
    shown=true;
    if(si<stages.length-1&&id===reqId)$('eng').textContent+=' · deepening…';
  }
};
