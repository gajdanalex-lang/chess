(function(){
const LEVELS=[{d:1,ms:150,name:'Beginner'},{d:4,ms:300,name:'Easy'},{d:8,ms:600,name:'Casual'},{d:12,ms:1500,name:'Fast'},{d:16,ms:3000,name:'Strong'},{d:20,ms:6000,name:'Expert'},{d:24,ms:10000,name:'Master'},{d:40,ms:20000,name:'Max'}];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const _fetch=window.fetch.bind(window);
const E={w:null,ls:[],ready:null,searching:false,hash:32,err:null};
const cache=new Map();
const send=c=>{try{E.w.postMessage(c);}catch(e){}};

function wait(prefix,ms){
  return new Promise(res=>{
    const got=[];let done=false;
    const fin=ok=>{if(done)return;done=true;clearTimeout(t);E.ls=E.ls.filter(x=>x!==f);res({got:got,ok:ok});};
    const f=l=>{got.push(l);if(l.startsWith(prefix))fin(true);};
    const t=setTimeout(()=>fin(false),ms);
    E.ls.push(f);
  });
}
function boot(){
  E.err=null;
  if(E.w){try{E.w.terminate();}catch(e){}}
  E.ls=[];E.searching=false;
  E.ready=(async()=>{
    try{
      const js=new URL('stockfish-18-lite-single.js',location.href).href;
      const wasm=new URL('stockfish-18-lite-single.wasm',location.href).href;
      E.w=new Worker(js+'#'+wasm);
      E.w.onmessage=e=>{const l=String(e.data);E.ls.slice().forEach(f=>f(l));};
      E.w.onerror=()=>{E.err='engine files failed to load';E.ls.slice().forEach(f=>f('uciok'));};
      const p=wait('uciok',20000);send('uci');
      const r=await p;
      if(!r.ok||E.err)throw new Error(E.err||'engine did not start');
      send('setoption name Hash value '+E.hash);
      send('setoption name UCI_ShowWDL value true');
      const q=wait('readyok',10000);send('isready');
      if(!(await q).ok)throw new Error('engine not ready');
      return true;
    }catch(e){E.err=String(e.message||e);return false;}
  })();
  return E.ready;
}

let chain=Promise.resolve();
function job(fn,signal){
  return new Promise((res,rej)=>{
    const abortErr=()=>new DOMException('Aborted','AbortError');
    const run=async()=>{
      if(signal&&signal.aborted){rej(abortErr());return;}
      const ctx={cancelled:false};
      const onAbort=()=>{ctx.cancelled=true;if(E.searching)send('stop');};
      if(signal)signal.addEventListener('abort',onAbort,{once:true});
      try{const r=await fn(ctx);if(ctx.cancelled)rej(abortErr());else res(r);}
      catch(e){rej(e);}
      finally{if(signal)signal.removeEventListener('abort',onAbort);}
    };
    chain=chain.then(run,run);
  });
}
function runGo(go,ms){
  return new Promise(res=>{
    const got=[];let done=false;
    const fin=()=>{if(done)return;done=true;clearTimeout(t1);clearTimeout(t2);E.ls=E.ls.filter(x=>x!==f);E.searching=false;res(got);};
    const f=l=>{got.push(l);if(l.startsWith('bestmove'))fin();};
    const t1=setTimeout(()=>send('stop'),ms+3000);
    const t2=setTimeout(()=>{boot();fin();},ms+9000);
    E.ls.push(f);E.searching=true;send(go);
  });
}
async function search(ctx,fen,n,go,elo,ms){
  await E.ready;
  if(ctx.cancelled||!E.w||E.err)return [];
  send('setoption name UCI_LimitStrength value '+(elo?'true':'false'));
  if(elo){send('setoption name UCI_Elo value '+clamp(Math.floor(elo),1320,3190));send('setoption name MultiPV value 1');}
  else send('setoption name MultiPV value '+n);
  send('position fen '+fen);
  return runGo(go,ms);
}
function parse(got,n){
  const res={};let none=false;
  for(const l of got){
    if(l.startsWith('bestmove (none)'))none=true;
    const mpv=l.match(/ multipv (\d+)/),pv=l.match(/ pv ([\w ]+)/),sc=l.match(/ score (\w+) (-?\d+)/),dp=l.match(/ depth (\d+)/);
    if(mpv&&pv&&sc&&dp&&!/ (lowerbound|upperbound)/.test(l)){
      const w=l.match(/ wdl (\d+) (\d+) (\d+)/),nps=l.match(/ nps (\d+)/);
      res[+mpv[1]]={kind:sc[1],val:+sc[2],depth:+dp[1],nps:nps?+nps[1]:0,wdl:w?[+w[1],+w[2],+w[3]]:null,pv:pv[1].trim()};
    }
  }
  const out=[];for(let i=1;i<=n;i++)if(res[i])out.push(res[i]);
  return {out:out,none:none};
}
const okFen=f=>/^[\w\/\- ]+$/.test(f||'');
function levelOf(q){let li=Math.floor(+q.lv||4);if(!LEVELS[li-1])li=4;return [li,LEVELS[li-1]];}

function analyze(q,signal){
  const fen=q.fen||'';if(!okFen(fen))return {lines:[]};
  const n=clamp(Math.floor(+q.n||3),1,5),L=levelOf(q),li=L[0],lv=L[1];
  const ck=fen+'|'+n+'|'+li;
  if(cache.has(ck))return cache.get(ck);
  return job(async ctx=>{
    for(let a=0;a<2;a++){
      const got=await search(ctx,fen,n,'go depth '+lv.d+' movetime '+lv.ms,null,lv.ms);
      if(ctx.cancelled)return null;
      const p=parse(got,n);
      if(p.out.length||p.none){
        const body={lines:p.out};
        if(p.out.length){if(cache.size>500)cache.clear();cache.set(ck,body);}
        return body;
      }
      await boot();
    }
    return {lines:[]};
  },signal);
}
function play(q,signal){
  const fen=q.fen||'';if(!okFen(fen))return {move:null};
  const lv=levelOf(q)[1],elo=+q.elo||1800;
  return job(async ctx=>{
    for(let a=0;a<2;a++){
      const got=await search(ctx,fen,1,'go movetime '+lv.ms,elo,lv.ms);
      if(ctx.cancelled)return null;
      for(const l of got){
        const m=l.match(/^bestmove (\S+)/);
        if(m)return {move:m[1]==='(none)'?null:m[1]};
      }
      await boot();
    }
    return {move:null};
  },signal);
}
function info(){
  return {levels:LEVELS.map(l=>({d:l.d,ms:l.ms,name:l.name})),threads:1,maxthreads:1,hash:E.hash,engine:E.err?('⚠ '+E.err):'Stockfish 18 (in your browser)'};
}
let openP=null;
function openings(){
  if(!openP)openP=(async()=>{
    const out=[];
    for(const x of 'abcde'){
      try{
        const t=await (await _fetch('op-'+x+'.tsv')).text();
        for(const line of t.split('\n')){
          const p=line.split('\t');
          if(p.length<3||p[0]==='eco')continue;
          const mv=p[2].replace(/\d+\.+\s*/g,'').replace(/\s+/g,' ').trim();
          if(mv)out.push([p[0],p[1],mv]);
        }
      }catch(e){}
    }
    return out;
  })();
  return openP;
}
async function ai(q){
  let key=null;try{key=localStorage.getItem('sfa_key');}catch(e){}
  if(!key)return {error:'No API key set. Add it in Settings > AI coach.'};
  try{
    const r=await _fetch('https://api.anthropic.com/v1/messages',{method:'POST',
      headers:{'content-type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
      body:JSON.stringify({model:q.model||'claude-sonnet-5-5',max_tokens:clamp(+q.max||500,100,1500),system:q.sys||'',messages:[{role:'user',content:(q.msg||'').slice(0,6000)}]})});
    return await r.json();
  }catch(e){return {error:'Could not reach the API (check your internet)'};}
}
function aikey(q){
  try{
    if(q.clear)localStorage.removeItem('sfa_key');
    if(q.k&&q.k.length>10)localStorage.setItem('sfa_key',q.k);
    return {has:!!localStorage.getItem('sfa_key')};
  }catch(e){return {has:false};}
}
async function route(path,q,signal){
  switch(path){
    case 'info':return info();
    case 'cfg':
      if(q.restart)await boot();
      if(q.hash){E.hash=clamp(Math.floor(+q.hash)||32,16,128);await E.ready;send('setoption name Hash value '+E.hash);}
      if(q.clear){await E.ready;send('ucinewgame');}
      cache.clear();return info();
    case 'analyze':return analyze(q,signal);
    case 'play':return play(q,signal);
    case 'openings.json':return openings();
    case 'aikey':return aikey(q);
    case 'ai':return ai(q);
    default:return {ok:true};
  }
}
window.fetch=function(input,init){
  const u=typeof input==='string'?input:((input&&input.url)||'');
  const m=u.match(/^\/(analyze|play|info|cfg|openings\.json|aikey|ai|quit)(?:\?(.*))?$/);
  if(!m)return _fetch(input,init);
  const q=Object.fromEntries(new URLSearchParams(m[2]||''));
  return Promise.resolve(route(m[1],q,init&&init.signal)).then(o=>new Response(JSON.stringify(o),{headers:{'content-type':'application/json'}}));
};
[...document.querySelectorAll('button')].forEach(b=>{if(b.textContent.includes('Stop server'))b.remove();});
boot();
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
})();
