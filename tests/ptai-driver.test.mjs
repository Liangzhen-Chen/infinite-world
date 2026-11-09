// PT-AI 玩家驱动离线测试：全部用注入的假 fetch 与假回合接口，不联网、不调用真实模型。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {withLock,runPlayer,monthSpend,monthKey,ALLOWED_ENDPOINTS,validateConfig,costCeiling,httpApi,assertApiUrl} from '../tools/ptai/driver.mjs';

const KEY='sk-test-SECRET-1234567890';
const MANIFEST='m'.repeat(64);
const baseConfig=(over={})=>({model:'claude-test',maxTurns:3,maxSessionUsd:100,monthlyCapUsd:1000,maxTokens:256,
 prices:{inputPerMTok:3,outputPerMTok:15},retries:2,backoffMs:1,historyPairs:6,ledgerPath:'.tmp/ptai/ledger.jsonl',...over});
const tmp=()=>fs.mkdtemp(path.join(os.tmpdir(),'ptai-test-'));
const now=()=>new Date('2026-11-15T00:00:00Z');
const env={CLAUDE_API_KEY:KEY};
const nosleep=async()=>{};
const run=(over={})=>runPlayer({config:baseConfig(),env,now,sleep:nosleep,manifestHash:MANIFEST,gitHead:'g'.repeat(40),...over});

function fakeWorld(){
 const calls=[];let minute=100,sequence=1;
 const api=async(endpoint,body)=>{
  calls.push({endpoint,body});
  if(endpoint==='create')return {reference:{campaignId:'c1',sequence}};
  if(endpoint==='read')return {reference:{campaignId:'c1',sequence},document:{randomSeed:'S1',state:{minute,location:'loc_a',player:{},npcs:{}}}};
  if(endpoint==='scene')return {scene:{location:'村口',minute}};
  if(endpoint==='execute'){minute+=10;sequence++;return {result:{ok:true,note:'已执行'}};}
  return {ok:true};
 };
 return {api,calls};
}
// 脚本化假 fetch：每次调用按序返回一个响应（最后一个重复）；Error 表示网络错误；delayMs 模拟耗时。
function fakeFetch(steps,delayMs=0){
 const requests=[];
 const impl=async(url,init)=>{
  requests.push({url,init,body:JSON.parse(init.body)});
  if(delayMs)await new Promise(r=>setTimeout(r,delayMs));
  const step=steps[Math.min(requests.length-1,steps.length-1)];
  if(step instanceof Error)throw step;
  const status=step.status??200;
  return {ok:status>=200&&status<300,status,text:async()=>JSON.stringify(step.json??{})};
 };
 return {impl,requests};
}
const USAGE={input_tokens:1000,output_tokens:100};
const ACTUAL=(1000*3+100*15)/1e6;
const toolTurn=(id,name='world_move',input={destination:'loc_b'})=>({json:{content:[{type:'text',text:'我看看'},{type:'tool_use',id,name,input}],stop_reason:'tool_use',usage:USAGE}});
const readLedger=async file=>(await fs.readFile(file,'utf8')).trim().split('\n').map(l=>JSON.parse(l));

// 首个请求的花费上界 c：上限设为 c+0.005，则首个请求可预留，之后一次预留必超限。
async function ceilingOf(){
 const cwd=await tmp(),f=fakeFetch([toolTurn('t1')]),config=baseConfig({maxTurns:1});
 await run({config,api:fakeWorld().api,fetchImpl:f.impl,cwd,runId:'probe'});
 return costCeiling(f.requests[0].body,validateConfig(config));
}

test('轨迹字段齐全；只打 Anthropic 固定端点；密钥不入轨迹', async()=>{
 const cwd=await tmp(),world=fakeWorld(),f=fakeFetch([toolTurn('t1'),toolTurn('t2')]);
 const result=await run({config:baseConfig({maxTurns:2}),api:world.api,fetchImpl:f.impl,cwd,runId:'r1',seed:7});
 assert.equal(result.stop,'max-turns');
 for(const c of world.calls)assert.ok(ALLOWED_ENDPOINTS.includes(c.endpoint),c.endpoint);
 assert.equal(world.calls.filter(c=>c.endpoint==='execute').length,2);
 for(const r of f.requests){assert.equal(r.init.headers['x-api-key'],KEY);assert.ok(r.init.headers['anthropic-version']);assert.equal(r.url,'https://api.anthropic.com/v1/messages');}
 const names=f.requests[0].body.tools.map(t=>t.name);
 assert.ok(names.length>0&&names.every(n=>n.startsWith('world_')));
 const rows=(await fs.readFile(result.tracePath,'utf8')).trim().split('\n').map(l=>JSON.parse(l));
 for(const k of ['seed','worldSeed','initialStateHash','gitHead','manifestHash','driverHash','model','limits','prices'])assert.ok(rows[0][k]!==undefined,k);
 assert.equal(rows[0].manifestHash,MANIFEST);
 const turn=rows.find(r=>r.type==='turn');
 for(const k of ['request','response','usage','usd','calls'])assert.ok(turn[k]!==undefined,k);
 assert.ok(Math.abs(turn.usd-ACTUAL)<1e-12);
 assert.equal(rows.at(-1).type,'end');
 assert.equal(JSON.stringify(rows).includes(KEY),false);
});

test('非白名单回合端点被拒（httpApi 不放行）', async()=>{
 let hits=0;
 const api=httpApi('http://127.0.0.1:1',{fetchImpl:async()=>{hits++;return {ok:true,json:async()=>({})};}});
 await assert.rejects(api('shell',{}),/非回合接口/);
 await assert.rejects(api('export',{}),/非回合接口/);
 await assert.rejects(api('review/begin',{}),/非回合接口/);
 assert.equal(hits,0);
 await api('read',{});assert.equal(hits,1);
});

test('模型调用未注册工具：不触达世界，回 is_error', async()=>{
 const cwd=await tmp(),world=fakeWorld();
 const f=fakeFetch([toolTurn('t1','bash',{command:'ls'}),{json:{content:[{type:'text',text:'好'}],stop_reason:'end_turn',usage:USAGE}}]);
 await run({config:baseConfig({maxTurns:2}),api:world.api,fetchImpl:f.impl,cwd,runId:'unreg'});
 assert.equal(world.calls.filter(c=>c.endpoint==='execute').length,0);
 const result=f.requests[1].body.messages.at(-1).content[0];
 assert.equal(result.type,'tool_result');assert.equal(result.is_error,true);
 const f2=fakeFetch([toolTurn('t1','world_turn',{})]);
 const w2=fakeWorld();
 await run({config:baseConfig({maxTurns:1}),api:w2.api,fetchImpl:f2.impl,cwd,runId:'unreg2'});
 assert.equal(w2.calls.filter(c=>c.endpoint==='execute').length,0);
});

test('apiUrl 与 origin 白名单', async()=>{
 for(const bad of ['https://evil.example/v1/messages','http://api.anthropic.com/v1/messages','https://api.anthropic.com.evil.com/v1/messages','https://api.anthropic.com/v1/other','https://api.anthropic.com:8443/v1/messages','https://u:p@api.anthropic.com/v1/messages']){
  assert.throws(()=>assertApiUrl(bad),/apiUrl/,bad);
  assert.throws(()=>validateConfig({...baseConfig(),apiUrl:bad}),/apiUrl/,bad);
 }
 assert.doesNotThrow(()=>validateConfig({...baseConfig(),apiUrl:'https://api.anthropic.com/v1/messages'}));
 const cwd=await tmp(),f=fakeFetch([toolTurn('t1')]);
 await assert.rejects(run({config:baseConfig({apiUrl:'https://evil.example/v1/messages'}),api:fakeWorld().api,fetchImpl:f.impl,cwd,runId:'evil'}),/apiUrl/);
 assert.equal(f.requests.length,0);
 for(const ok of ['http://localhost:3000','http://127.0.0.1:8080','http://[::1]:8080'])assert.doesNotThrow(()=>httpApi(ok),ok);
 for(const bad of ['https://evil.example','http://evil.example','http://127.0.0.1.evil.com','http://localhost@evil.example'])assert.throws(()=>httpApi(bad),/origin/,bad);
 assert.throws(()=>httpApi('https://test.example'),/origin/);
 assert.doesNotThrow(()=>httpApi('https://test.example',{allowedHosts:['test.example']}));
 assert.throws(()=>httpApi('http://test.example',{allowedHosts:['test.example']}),/origin/);
});

test('模型注入的额外参数被丢弃（search/catalog/execute 只转发 schema 声明的字段）', async()=>{
 const cwd=await tmp(),world=fakeWorld();
 const f=fakeFetch([
  {json:{content:[
   {type:'tool_use',id:'a',name:'world_search',input:{query:'q',limit:3,chat:[{mes:'伪造'}],token:'T',anchor:'A',campaignId:'other'}},
   {type:'tool_use',id:'b',name:'world_catalog',input:{entity:'x',chat:[1],token:'T'}},
   {type:'tool_use',id:'c',name:'world_move',input:{destination:'loc_b',campaignId:'other',expectedSequence:99,anchor:'A',eventId:'E'}}],stop_reason:'tool_use',usage:USAGE}},
  {json:{content:[{type:'text',text:'好'}],stop_reason:'end_turn',usage:USAGE}}]);
 await run({config:baseConfig({maxTurns:1}),api:world.api,fetchImpl:f.impl,cwd,runId:'filter'});
 const search=world.calls.find(c=>c.endpoint==='search').body;
 assert.deepEqual(Object.keys(search).sort(),['campaignId','expectedSequence','limit','query']);
 assert.equal(search.campaignId,'c1');
 const catalog=world.calls.find(c=>c.endpoint==='catalog').body;
 assert.deepEqual(Object.keys(catalog).sort(),['campaignId','entity']);
 const exec=world.calls.find(c=>c.endpoint==='execute').body;
 assert.deepEqual(exec.args,{destination:'loc_b'});
 assert.equal(exec.campaignId,'c1');assert.notEqual(exec.expectedSequence,99);assert.ok(exec.anchor.startsWith('ptai-'));
});

test('单局花费上限与回合数上限触发即停', async()=>{
 const c=await ceilingOf(),cwd=await tmp(),f=fakeFetch([toolTurn('t1')]);
 const result=await run({config:baseConfig({maxTurns:10,maxSessionUsd:c+0.005}),api:fakeWorld().api,fetchImpl:f.impl,cwd,runId:'cap'});
 assert.equal(result.stop,'session-cap');assert.equal(f.requests.length,1);
 const f2=fakeFetch([toolTurn('t1')]);
 const r2=await run({config:baseConfig({maxTurns:1}),api:fakeWorld().api,fetchImpl:f2.impl,cwd:await tmp(),runId:'turns'});
 assert.equal(r2.turns,1);assert.equal(f2.requests.length,1);
});

test('月度账本：每次发送预留、响应后修正；跨局累计、只追加、超额停止', async()=>{
 const c=await ceilingOf(),cwd=await tmp(),f=fakeFetch([toolTurn('t1')]);
 const cfg=baseConfig({maxTurns:1,monthlyCapUsd:c+0.005});
 const ledger=path.join(cwd,'.tmp/ptai/ledger.jsonl');
 const a=await run({config:cfg,api:fakeWorld().api,fetchImpl:f.impl,cwd,runId:'a'});
 const rowsA=await readLedger(ledger);
 assert.deepEqual(rowsA.map(r=>r.kind),['reserve','adjust']);
 const spent=await monthSpend(ledger,monthKey(now()));
 assert.ok(Math.abs(spent-ACTUAL)<1e-12&&Math.abs(spent-a.sessionUsd)<1e-12);
 await fs.appendFile(ledger,JSON.stringify({month:'2026-10',usd:999})+'\n');
 assert.ok(Math.abs(await monthSpend(ledger,'2026-11')-ACTUAL)<1e-12);
 const before=f.requests.length;
 const b=await run({config:cfg,api:fakeWorld().api,fetchImpl:f.impl,cwd,runId:'b'});
 assert.equal(b.stop,'monthly-cap');assert.equal(f.requests.length,before);
 assert.deepEqual((await readLedger(ledger)).slice(0,2),rowsA);
});

test('网络错误的重试按上界计费，并在重试前复核上限', async()=>{
 const c=await ceilingOf(),cwd=await tmp(),ledger=path.join(cwd,'.tmp/ptai/ledger.jsonl');
 const f=fakeFetch([new Error('socket hang up')]);
 const r=await run({config:baseConfig({maxTurns:1,monthlyCapUsd:c+0.005}),api:fakeWorld().api,fetchImpl:f.impl,cwd,runId:'net'});
 assert.equal(r.stop,'monthly-cap');assert.equal(f.requests.length,1);
 assert.ok(Math.abs(await monthSpend(ledger,monthKey(now()))-c)<1e-12);
 const cwd2=await tmp(),ledger2=path.join(cwd2,'.tmp/ptai/ledger.jsonl'),f2=fakeFetch([new Error('timeout'),toolTurn('t1')]);
 await run({config:baseConfig({maxTurns:1}),api:fakeWorld().api,fetchImpl:f2.impl,cwd:cwd2,runId:'net2'});
 const rows=await readLedger(ledger2);
 assert.equal(rows.filter(x=>x.kind==='reserve').length,2);
 assert.ok(Math.abs(await monthSpend(ledger2,monthKey(now()))-(c+ACTUAL))<1e-9);
});

test('429 不计费（预留被冲回），重试成功后只计实际用量', async()=>{
 const cwd=await tmp(),ledger=path.join(cwd,'.tmp/ptai/ledger.jsonl'),sleeps=[];
 const f=fakeFetch([{status:429,json:{error:'rate'}},toolTurn('t1')]);
 await run({config:baseConfig({maxTurns:1}),api:fakeWorld().api,fetchImpl:f.impl,cwd,runId:'r429',sleep:async ms=>{sleeps.push(ms);}});
 assert.equal(f.requests.length,2);assert.deepEqual(sleeps,[1]);
 const rows=await readLedger(ledger);
 assert.equal(rows.filter(x=>x.kind==='reserve').length,2);
 assert.ok(Math.abs(await monthSpend(ledger,monthKey(now()))-ACTUAL)<1e-9);
});

test('并行多局共用账本：发送前加锁重读，合计不越月额', async()=>{
 const c=await ceilingOf(),cwd=await tmp(),ledger=path.join(cwd,'.tmp/ptai/ledger.jsonl');
 const cfg=baseConfig({maxTurns:1,monthlyCapUsd:c*1.5});
 const f=fakeFetch([toolTurn('t1')],80);
 const results=await Promise.all(['p1','p2','p3'].map(id=>run({config:cfg,api:fakeWorld().api,fetchImpl:f.impl,cwd,runId:id})));
 assert.equal(f.requests.length,1);
 assert.deepEqual(results.map(r=>r.stop).sort(),['max-turns','monthly-cap','monthly-cap']);
 assert.ok(await monthSpend(ledger,monthKey(now()))<=cfg.monthlyCapUsd);
});

test('密钥缺失：报错、不联网、不泄露任何密钥片段', async()=>{
 const cwd=await tmp(),f=fakeFetch([toolTurn('t1')]);
 await assert.rejects(run({env:{},api:fakeWorld().api,fetchImpl:f.impl,cwd,runId:'nokey'}),error=>{
  assert.match(error.message,/CLAUDE_API_KEY/);assert.equal(error.message.includes('sk-'),false);return true;});
 assert.equal(f.requests.length,0);
 await assert.rejects(run({env:{CLAUDE_API_KEY:''},api:fakeWorld().api,fetchImpl:f.impl,cwd,runId:'nokey2'}),/CLAUDE_API_KEY/);
});

test('缺 manifest 哈希拒绝启动', async()=>{
 const f=fakeFetch([toolTurn('t1')]);
 await assert.rejects(run({manifestHash:null,api:fakeWorld().api,fetchImpl:f.impl,cwd:await tmp(),runId:'nom'}),/manifest/);
 assert.equal(f.requests.length,0);
});

test('失败重试有上限与退避；错误信息与轨迹不含密钥；4xx 不重试', async()=>{
 const cwd=await tmp(),sleeps=[];
 const f=fakeFetch([{status:500,json:{error:`boom ${KEY}`}}]);
 await assert.rejects(run({api:fakeWorld().api,fetchImpl:f.impl,cwd,runId:'retry',sleep:async ms=>{sleeps.push(ms);}}),error=>{
  assert.equal(error.message.includes(KEY),false);return true;});
 assert.equal(f.requests.length,3);assert.deepEqual(sleeps,[1,2]);
 assert.equal((await fs.readFile(path.join(cwd,'.tmp/ptai/retry/trace.jsonl'),'utf8')).includes(KEY),false);
 const f4=fakeFetch([{status:400,json:{error:'bad'}}]);
 await assert.rejects(run({api:fakeWorld().api,fetchImpl:f4.impl,cwd,runId:'retry4'}),/400/);
 assert.equal(f4.requests.length,1);
});

test('配置缺上限或单价即拒绝（金额不写死）', ()=>{
 assert.throws(()=>validateConfig({...baseConfig(),monthlyCapUsd:undefined}),/monthlyCapUsd/);
 assert.throws(()=>validateConfig({...baseConfig(),prices:{}}),/prices/);
});

test('fetch 带 redirect:error；遇 3xx 报错不跟随（Anthropic 与回合接口）', async()=>{
 const f=fakeFetch([{status:307,json:{}}]);
 await assert.rejects(run({api:fakeWorld().api,fetchImpl:f.impl,cwd:await tmp(),runId:'redir'}),/307/);
 assert.equal(f.requests.length,1);assert.equal(f.requests[0].init.redirect,'error');
 const seen=[];
 const api=httpApi('http://127.0.0.1:1',{fetchImpl:async(url,init)=>{seen.push(init);return {ok:false,status:307,json:async()=>({})};}});
 await assert.rejects(api('read',{}),/重定向/);
 assert.equal(seen[0].redirect,'error');
});

test('ledgerPath 必填', ()=>{
 assert.throws(()=>validateConfig({...baseConfig(),ledgerPath:undefined}),/ledgerPath/);
});

test('账本锁：陈旧锁被接管、他人锁不被误删、EPERM 重试', async()=>{
 const dir=await tmp(),file=path.join(dir,'l.jsonl'),lock=file+'.lock';
 // 持有者 pid 已死：立即接管
 await fs.writeFile(lock,JSON.stringify({pid:2147483646,token:'dead',ts:Date.now()}));
 assert.equal(await withLock(file,async()=>'ok',{alive:()=>false}),'ok');
 await assert.rejects(fs.stat(lock));
 // pid 活着但锁龄超阈值：接管
 await fs.writeFile(lock,JSON.stringify({pid:process.pid,token:'old',ts:Date.now()-100000}));
 assert.equal(await withLock(file,async()=>'ok2',{alive:()=>true,staleMs:1000}),'ok2');
 // 他人新鲜锁：不接管、不删除，等待超时报错
 const other=JSON.stringify({pid:process.pid,token:'other',ts:Date.now()});
 await fs.writeFile(lock,other);
 await assert.rejects(withLock(file,async()=>'x',{alive:()=>true,staleMs:60000,waitMs:50}),/超时/);
 assert.equal(await fs.readFile(lock,'utf8'),other);
 // fn 执行期间锁被他人换掉：释放时不删别人的锁
 const swapped=JSON.stringify({pid:process.pid,token:'swapped',ts:Date.now()});
 await fs.rm(lock);
 await withLock(file,async()=>{await fs.writeFile(lock,swapped);});
 assert.equal(await fs.readFile(lock,'utf8'),swapped);
 await fs.rm(lock);
 // EPERM/EBUSY 重试
 let n=0;
 const link=async(a,b)=>{if(n++<2){const e=new Error('busy');e.code=n===1?'EPERM':'EBUSY';throw e;}return fs.link(a,b);};
 assert.equal(await withLock(file,async()=>'ok3',{link,sleep:nosleep}),'ok3');
 assert.equal(n,3);
});

test('账本半行：无换行结尾的坏末行被忽略，其余坏行拒绝', async()=>{
 const dir=await tmp(),file=path.join(dir,'l.jsonl');
 await fs.writeFile(file,JSON.stringify({month:'2026-11',usd:1})+'\n{"month":"2026-11","us');
 assert.equal(await monthSpend(file,'2026-11'),1);
 await fs.writeFile(file,'garbage\n'+JSON.stringify({month:'2026-11',usd:1})+'\n');
 await assert.rejects(monthSpend(file,'2026-11'),/损坏/);
});
