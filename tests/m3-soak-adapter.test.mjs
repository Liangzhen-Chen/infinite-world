import {withReviewClaims} from './helpers/consistency-response.mjs';
import {loadWorld} from '../tools/load-world.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import{tmpRoot}from'../tools/tmp-root.mjs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {createSoakAdapter,assessSoakTiming} from '../tools/m3-soak-adapter.mjs';
import {runSoak} from '../tools/m3-soak-runner.mjs';
import {openSoakRun,nextSoakTask,summarizeSoak} from '../tools/m3-soak.mjs';
async function temporary(t){const dir=await fs.mkdtemp(path.join(tmpRoot(),'fields-soak-adapter-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}
function fake({warning=false,waitMinutes,tailMinutes=0}={}){return {async generate(body,label){let message,finish_reason='stop';
 // This warning tests persistence, not a private-knowledge claim. Knowledge
 // findings require an identified subject and its actual cognition evidence.
 if(label.startsWith('consistency:')){finish_reason='tool_calls';message={tool_calls:[{id:'review',type:'function',function:{name:'report_consistency_issues',arguments:JSON.stringify({issues:warning?[{category:'fact',severity:'warning',quote:'你买到了一个面包。',reason:'警告需保留供叙述复核',evidence:[{id:'player',quote:'我向林穗买一个面包。'}]}]:[]})}}]};}
 else if(label.startsWith('npc'))throw Error('测试禁止模型规划');
 else if(label.endsWith('-0')){finish_reason='tool_calls';message={content:null,tool_calls:[{id:'action',type:'function',function:{name:waitMinutes===undefined?'world_trade':'world_time',arguments:JSON.stringify(waitMinutes===undefined?{seller:'林穗',item:'面包',quantity:1}:{minutes:waitMinutes})}}]};}
 else message={content:`${waitMinutes===undefined?'你买到了一个面包。':'你等了一会儿。'}${tailMinutes?'你问林穗最近好吗。':''}<回合 额外="${tailMinutes}分" 地点="bld_hw_qingdeng" 在场="npc_hw_linsui"/>`};
 return {...(label.startsWith('consistency:')?withReviewClaims({choices:[{finish_reason,message}]},body):{choices:[{finish_reason,message}]}),measurement:{costUpperYuan:.001,usage:{prompt_cache_hit_tokens:90,prompt_cache_miss_tokens:10},label}};
 }};}
const options=client=>({client,processMessages:m=>m,countTokens:()=>20,createBody:{name:'试玩者'}});
test('同一真实 HTTP 会话跨进程恢复，交易响应丢失后同编号重入不重复扣款',async t=>{
 const directory=await temporary(t);let failed=false;
 let adapter=await createSoakAdapter({directory,budgetYuan:2,...options(fake()),afterHttp(endpoint,body){if(endpoint==='execute'&&body.tool==='world_trade'&&!failed){failed=true;throw Error('模拟保存后连接断开');}}});
 const task={id:'soak-resume-trade',persona:'merchant',turn:1,kind:'turn',input:'我向林穗买一个面包。',checkpoint:null};
 await assert.rejects(adapter.execute(task),/断开/);await adapter.close();
 adapter=await createSoakAdapter({directory,budgetYuan:2,...options(fake())});t.after(()=>adapter.close());
 const result=await adapter.execute(task);assert.equal(result.completed,true);const exported=await adapter.server.api('export',{campaignId:result.checkpoint.campaignId});
 assert.equal(exported.events.filter(e=>e.input?.tool==='world_trade').length,1);assert.equal(exported.events.filter(e=>e.input?.tool==='world_turn').length,1);
 assert.equal(result.timing.elapsedMinutes,result.timing.replay.expectedMinutes);assert.equal(result.timing.status,'unknown');assert.equal(result.timing.expectedMinutes,null);assert.ok(result.facts.some(f=>f.expected==='面包'));
 assert.deepEqual(await adapter.execute(task),result);
});
test('两人格 300 轮计划完整，25/50 轮不能冒充已完成回忆测验',async t=>{
 const directory=await temporary(t),run=await openSoakRun(directory);let turns=0,probes=0;
 for(let step=0;step<330;step++){
  const task=nextSoakTask(run);if(!task)break;
  if(task.kind==='turn'){turns++;run.personas[task.persona].turns.push({turn:task.turn});}
  else {probes++;assert.equal(task.status,task.turn<=50?'notEligible':'insufficient');run.personas[task.persona].probes.push(task);}
 }
 assert.equal(turns,300);assert.equal(probes,12);assert.equal(nextSoakTask(run),null);
});
test('可执行 driver 保存两人格各三轮，重启继续原存档且完整统计角色费用',async t=>{
 // S5-02: 8 opening loaves = 4 household + 3 native purchases + 1 spare. No stock-failure retries in this cost-accounting fixture.
 const world=await loadWorld();world.npcs.find(n=>n.id==='npc_hw_linsui').inventory.item_bread=8;
 const directory=await temporary(t),config={directory,turns:3,budgetYuan:2,adapterOptions:{...options(fake()),world},inputFor:()=> '我向林穗买一个面包。'};
 const first=await runSoak({...config,maxTasks:2});assert.equal(first.status,'task-limit');
 const final=await runSoak(config);assert.equal(final.complete,true);assert.deepEqual(final.personas.map(p=>p.turns),[3,3]);assert.equal(final.pass,false);
 assert.equal(final.roles.narrator.calls,12);assert.equal(final.roles.review.calls,6);assert.equal(final.allCallsAccounted,true);
 const run=JSON.parse(await fs.readFile(path.join(directory,'run.json'),'utf8'));assert.equal(new Set(Object.values(run.personas).map(p=>p.checkpoint.campaignId)).size,2);
 assert.equal(run.personas.merchant.checkpoint.chat.filter(m=>m.is_user).length,3);
 // Each native bill trunc(2*.5*depth)=1; three purchases leave 180-3=177.
 const inspector=await createSoakAdapter({directory,budgetYuan:2,...config.adapterOptions});t.after(()=>inspector.close());
 for(const p of Object.values(run.personas))assert.equal((await inspector.server.api('read',{campaignId:p.checkpoint.campaignId})).document.state.player.coins,177);
});

test('真实 CLI 能启动执行器并在零任务预算处退出，不发生顶层 await 环形导入',async t=>{
 const directory=await temporary(t);
 const {stdout,stderr}=await promisify(execFile)(process.execPath,[fileURLToPath(new URL('../tools/m3-soak.mjs',import.meta.url)),'--run','--directory',directory,'--turns','3','--budget','2','--max-tasks','0'],{timeout:30000});
 assert.equal(stderr,'');const report=JSON.parse(stdout);assert.equal(report.status,'task-limit');assert.equal(report.calls,0);assert.equal(report.complete,false);
});

test('时间验收缺语义计划时不借回放和回执冒充整轮通过，对话保留允许区间',()=>{
 const replay={source:'replay',expectedMinutes:15,elapsedMinutes:15,actionMinutes:5,tailMinutes:10,actionCount:1};
 const measured=assessSoakTiming(replay,{input:'我买一个面包。',reply:'你买了面包。'});
 assert.equal(measured.covered,false);assert.equal(measured.expectedMinutes,null);assert.equal(measured.elapsedMinutes,15);
 const mixed=assessSoakTiming(replay,{input:'买了面包后聊聊。',reply:'<q who="npc_hw_linsui">聊些什么？</q>'});
 assert.equal(mixed.covered,false);assert.equal(mixed.expectedMinutes,null);
 const chat=assessSoakTiming({...replay,actionCount:0,actionMinutes:0,elapsedMinutes:2},{input:'你好。',reply:'<q who="npc_hw_linsui">你好。</q>'});
 assert.equal(chat.expectedMinutes,null);assert.deepEqual(chat.expectedRange,[5,20]);assert.equal(chat.elapsedMinutes,2);assert.equal(chat.deviation,.6);
});

test('真实HTTP要求等60却只执行13或36分钟，回放相等仍暴露语义偏差',async t=>{
 for(const minutes of [13,36]){
  const directory=await temporary(t),adapter=await createSoakAdapter({directory,budgetYuan:2,...options(fake({waitMinutes:minutes}))});t.after(()=>adapter.close());
  const result=await adapter.execute({id:`soak-short-wait-${minutes}`,persona:'merchant',turn:1,kind:'turn',input:'我原地等一小时，不做其他事情。',checkpoint:null});
  assert.equal(result.timing.replay.expectedMinutes,minutes);assert.equal(result.timing.elapsedMinutes,minutes);assert.equal(result.timing.expectedMinutes,60);
  assert.equal(result.timing.deviation,(60-minutes)/60);assert.equal(result.timing.evidence.quote,'我原地等一小时，不做其他事情。');
  assert.equal(result.timing.receiptTiming.evidence[0].declaredMinutes,minutes);assert.equal(result.timing.receiptTiming.deviation,0);
 }
});

test('真实HTTP合法等待后明确交谈计入尾注，恢复不重复测量或模型费用',async t=>{
 const directory=await temporary(t);let disconnected=false;
 let adapter=await createSoakAdapter({directory,budgetYuan:2,...options(fake({waitMinutes:60,tailMinutes:10})),afterHttp(endpoint,body){
  if(endpoint==='execute'&&body.tool==='world_time'&&!disconnected){disconnected=true;throw Error('等待已保存后断开');}
 }});
 const task={id:'soak-wait-chat-resume',persona:'merchant',turn:1,kind:'turn',input:'我等60分钟，然后我问林穗：“最近好吗？”',checkpoint:null};
 await assert.rejects(adapter.execute(task),/已保存后断开/);await adapter.close();
 adapter=await createSoakAdapter({directory,budgetYuan:2,...options(fake({waitMinutes:60,tailMinutes:10}))});t.after(()=>adapter.close());
 const result=await adapter.execute(task);assert.equal(result.timing.status,'bounded');assert.equal(result.timing.deviation,0);
 assert.equal(result.timing.elapsedMinutes,70);assert.equal(result.timing.components.wait.elapsedMinutes,60);assert.equal(result.timing.components.dialogue.elapsedMinutes,10);
 const calls=adapter.client.ledger.calls.length,cost=adapter.client.ledger.spentYuan;
 assert.deepEqual(await adapter.execute(task),result);assert.equal(adapter.client.ledger.calls.length,calls);assert.equal(adapter.client.ledger.spentYuan,cost);
 const tapeFile=path.join(directory,'tasks',(await fs.readdir(path.join(directory,'tasks'))).find(name=>name.endsWith('.json'))),tape=JSON.parse(await fs.readFile(tapeFile,'utf8'));
 delete tape.result;await fs.writeFile(tapeFile,JSON.stringify(tape));
 assert.deepEqual(await adapter.execute(task),result);assert.equal(adapter.client.ledger.calls.length,calls);assert.equal(adapter.client.ledger.spentYuan,cost);
 const exported=await adapter.server.api('export',{campaignId:result.checkpoint.campaignId});
 assert.equal(exported.events.filter(e=>e.input?.tool==='world_time').length,1);assert.equal(exported.events.filter(e=>e.input?.tool==='world_turn').length,1);
 assert.equal(result.timing.receiptTiming.total,1);
});

test('连续会话保留警告，并可只读恢复旧 HTTP verified 标记而不再调用模型',async t=>{
 const directory=await temporary(t),adapter=await createSoakAdapter({directory,budgetYuan:2,...options(fake({warning:true}))});t.after(()=>adapter.close());
 const task={id:'soak-warning-recovery',persona:'merchant',turn:1,kind:'turn',input:'我向林穗买一个面包。',checkpoint:null};
 const first=await adapter.execute(task);assert.equal(first.completed,true);assert.equal(first.consistency.verified,true);assert.equal(first.consistency.status,'issues');
 assert.equal(first.consistency.originalWarnings,1);assert.equal(first.consistency.residualWarnings,1);assert.equal(first.consistency.originalErrors,0);
 assert.equal(first.consistency.residualIssues[0].severity,'warning');
 const tapeFile=path.join(directory,'tasks',(await fs.readdir(path.join(directory,'tasks'))).find(name=>name.endsWith('.json'))),tape=JSON.parse(await fs.readFile(tapeFile,'utf8'));
 delete tape.result;delete tape.reviewOutcome;tape.calls.find(row=>row.endpoint==='review/reply').response.verified=false;
 await fs.writeFile(tapeFile,JSON.stringify(tape));const callCount=adapter.client.ledger.calls.length;
 const recovered=await adapter.execute(task);assert.deepEqual(recovered,first);assert.equal(adapter.client.ledger.calls.length,callCount);
 const preserved=JSON.parse(await fs.readFile(tapeFile,'utf8'));assert.equal(preserved.calls.find(row=>row.endpoint==='review/reply').response.verified,false);assert.equal(preserved.reviewOutcome.verified,true);
 const run=await openSoakRun(path.join(directory,'summary'),{turns:3});run.personas.merchant.turns.push({turn:1,latencyMs:5,result:first});
 const report=summarizeSoak(run);assert.deepEqual(report.personas[0].warnings,{original:1,residual:1,reviewRequired:true});assert.equal(report.pass,false);
 const exported=await adapter.server.api('export',{campaignId:first.checkpoint.campaignId});assert.equal(exported.events.filter(e=>e.input?.tool==='world_trade').length,1);assert.equal(exported.events.filter(e=>e.input?.tool==='world_turn').length,1);
});
