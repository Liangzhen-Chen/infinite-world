// PT-AI 玩家驱动离线测试：全部用注入的假 fetch 与假回合接口，不联网、不调用真实模型。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {runPlayer,monthSpend,monthKey,ALLOWED_ENDPOINTS,validateConfig,costCeiling} from '../tools/ptai/driver.mjs';

const KEY='sk-test-SECRET-1234567890';
const baseConfig=(over={})=>({model:'claude-test',maxTurns:3,maxSessionUsd:100,monthlyCapUsd:1000,maxTokens:256,
 prices:{inputPerMTok:3,outputPerMTok:15},retries:2,backoffMs:1,historyPairs:6,...over});
// 首个请求的花费上界 c：把上限设为 c+0.005，则首回合可发（实花 0.0105），下一次发送前必超限。
async function capJustAboveFirst(){
 const cwd=await tmp(),f=fakeFetch([toolTurn('t1')]),config=baseConfig({maxTurns:1});
 await runPlayer({config,api:fakeWorld().api,fetchImpl:f.impl,env:{CLAUDE_API_KEY:KEY},cwd,runId:'probe',now,sleep:async()=>{}});
 return costCeiling(f.requests[0].body,validateConfig(config))+0.005;
}
const tmp=()=>fs.mkdtemp(path.join(os.tmpdir(),'ptai-test-'));
const now=()=>new Date('2026-11-15T00:00:00Z');

function fakeWorld(){
 const calls=[];let minute=100,sequence=1;
 const api=async(endpoint,body)=>{
  calls.push({endpoint,body});
  if(endpoint==='create')return {reference:{campaignId:'c1',sequence}};
  if(endpoint==='read')return {reference:{campaignId:'c1',sequence},document:{state:{minute,location:'loc_a',player:{},npcs:{}}}};
  if(endpoint==='scene')return {scene:{location:'村口',minute}};
  if(endpoint==='execute'){minute+=10;sequence++;return {result:{ok:true,note:'已执行'}};}
  return {ok:true};
 };
 return {api,calls};
}
// 脚本化假 fetch：每次调用按序返回一个响应；记录请求。
function fakeFetch(steps){
 const requests=[];
 const impl=async(url,init)=>{
  requests.push({url,init,body:JSON.parse(init.body)});
  const step=steps[Math.min(requests.length-1,steps.length-1)];
  if(step instanceof Error)throw step;
  const status=step.status??200;
  return {ok:status>=200&&status<300,status,text:async()=>JSON.stringify(step.json??{})};
 };
 return {impl,requests};
}
const toolTurn=(id,input={operation:'inspect'},usage={input_tokens:1000,output_tokens:100})=>({json:{content:[{type:'text',text:'我看看'},{type:'tool_use',id,name:'world_move',input:{destination:'loc_b'}}],stop_reason:'tool_use',usage}});

test('只调用回合接口；轨迹字段齐全', async()=>{
 const cwd=await tmp(),world=fakeWorld(),f=fakeFetch([toolTurn('t1'),toolTurn('t2')]);
 const result=await runPlayer({config:baseConfig({maxTurns:2}),api:world.api,fetchImpl:f.impl,env:{CLAUDE_API_KEY:KEY},cwd,runId:'r1',seed:7,manifestHash:'m'.repeat(64),gitHead:'g'.repeat(40),now,sleep:async()=>{}});
 assert.equal(result.stop,'max-turns');
 for(const c of world.calls)assert.ok(ALLOWED_ENDPOINTS.includes(c.endpoint),c.endpoint);
 assert.equal(world.calls.filter(c=>c.endpoint==='execute').length,2);
 // 只打 Anthropic 接口，头部齐备
 for(const r of f.requests){assert.equal(r.init.headers['x-api-key'],KEY);assert.ok(r.init.headers['anthropic-version']);assert.match(r.url,/anthropic/);}
 // 模型看到的工具里没有仓库/文件/shell 类
 const names=f.requests[0].body.tools.map(t=>t.name);
 assert.ok(names.length>0&&!names.some(n=>!n.startsWith('world_')));
 const rows=(await fs.readFile(result.tracePath,'utf8')).trim().split('\n').map(l=>JSON.parse(l));
 const header=rows[0];
 for(const k of ['seed','initialStateHash','gitHead','manifestHash','driverHash','model','limits','prices'])assert.ok(header[k]!==undefined,k);
 const turn=rows.find(r=>r.type==='turn');
 for(const k of ['request','response','usage','usd','calls'])assert.ok(turn[k]!==undefined,k);
 assert.equal(turn.calls[0].tool,'world_move');
 assert.ok(Math.abs(turn.usd-(1000*3+100*15)/1e6)<1e-12);
 assert.equal(rows.at(-1).type,'end');
 assert.equal(JSON.stringify(rows).includes(KEY),false);
});

test('单局花费上限触发即停（不调用 API）', async()=>{
 const cwd=await tmp(),world=fakeWorld(),f=fakeFetch([toolTurn('t1')]);
  const cap=await capJustAboveFirst();
 const result=await runPlayer({config:baseConfig({maxTurns:10,maxSessionUsd:cap}),api:world.api,fetchImpl:f.impl,env:{CLAUDE_API_KEY:KEY},cwd,runId:'cap',now,sleep:async()=>{}});
 assert.equal(result.stop,'session-cap');
 assert.equal(f.requests.length,1);
 assert.ok(result.sessionUsd<=cap);
});

test('回合数上限触发即停', async()=>{
 const cwd=await tmp(),world=fakeWorld(),f=fakeFetch([toolTurn('t1')]);
 const result=await runPlayer({config:baseConfig({maxTurns:1}),api:world.api,fetchImpl:f.impl,env:{CLAUDE_API_KEY:KEY},cwd,runId:'turns',now,sleep:async()=>{}});
 assert.equal(result.turns,1);assert.equal(f.requests.length,1);
});

test('月度账本累计，跨局累加且只追加；超额停止', async()=>{
 const cwd=await tmp(),f=fakeFetch([toolTurn('t1')]);
 const cfg=baseConfig({maxTurns:1,monthlyCapUsd:await capJustAboveFirst()});
 const ledger=path.join(cwd,'.tmp/ptai/ledger.jsonl');
 const a=await runPlayer({config:cfg,api:fakeWorld().api,fetchImpl:f.impl,env:{CLAUDE_API_KEY:KEY},cwd,runId:'a',now,sleep:async()=>{}});
 const afterA=await fs.readFile(ledger,'utf8');
 assert.equal(afterA.trim().split('\n').length,1);
 const spent=await monthSpend(ledger,monthKey(now()));
 assert.ok(Math.abs(spent-a.sessionUsd)<1e-12&&spent>0);
 // 另一月的行不计入
 await fs.appendFile(ledger,JSON.stringify({month:'2026-10',usd:999})+'\n');
 assert.ok(Math.abs(await monthSpend(ledger,'2026-11')-spent)<1e-12);
 // 本月已花 0.0105，剩余不足一次调用的上界：下一局不应发出任何请求
 const before=f.requests.length;
 const b=await runPlayer({config:cfg,api:fakeWorld().api,fetchImpl:f.impl,env:{CLAUDE_API_KEY:KEY},cwd,runId:'b',now,sleep:async()=>{}});
 assert.equal(b.stop,'monthly-cap');assert.equal(f.requests.length,before);
 // 历史没被覆盖
 assert.ok((await fs.readFile(ledger,'utf8')).startsWith(afterA));
});

test('密钥缺失：报错、不联网、不泄露任何密钥片段', async()=>{
 const cwd=await tmp(),f=fakeFetch([toolTurn('t1')]);
 await assert.rejects(runPlayer({config:baseConfig(),api:fakeWorld().api,fetchImpl:f.impl,env:{},cwd,runId:'nokey',now}),error=>{
  assert.match(error.message,/CLAUDE_API_KEY/);assert.equal(error.message.includes('sk-'),false);return true;});
 assert.equal(f.requests.length,0);
 await assert.rejects(runPlayer({config:baseConfig(),api:fakeWorld().api,fetchImpl:f.impl,env:{CLAUDE_API_KEY:''},cwd,runId:'nokey2',now}),/CLAUDE_API_KEY/);
});

test('失败重试有上限与退避；错误信息不含密钥', async()=>{
 const cwd=await tmp(),sleeps=[];
 const f=fakeFetch([{status:500,json:{error:`boom ${KEY}`}}]);
 await assert.rejects(runPlayer({config:baseConfig(),api:fakeWorld().api,fetchImpl:f.impl,env:{CLAUDE_API_KEY:KEY},cwd,runId:'retry',now,sleep:async ms=>{sleeps.push(ms);}}),error=>{
  assert.equal(error.message.includes(KEY),false);return true;});
 assert.equal(f.requests.length,3);assert.deepEqual(sleeps,[1,2]);
 const trace=await fs.readFile(path.join(cwd,'.tmp/ptai/retry/trace.jsonl'),'utf8');
 assert.equal(trace.includes(KEY),false);
 const f4=fakeFetch([{status:400,json:{error:'bad'}}]);
 await assert.rejects(runPlayer({config:baseConfig(),api:fakeWorld().api,fetchImpl:f4.impl,env:{CLAUDE_API_KEY:KEY},cwd,runId:'retry4',now,sleep:async()=>{}}),/400/);
 assert.equal(f4.requests.length,1);
});

test('配置缺上限或单价即拒绝（金额不写死）', ()=>{
 assert.throws(()=>validateConfig({...baseConfig(),monthlyCapUsd:undefined}),/monthlyCapUsd/);
 assert.throws(()=>validateConfig({...baseConfig(),prices:{}}),/prices/);
});
