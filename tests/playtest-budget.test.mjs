import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {openPlaytestBudget,openPlaytestTape,requestCeiling,budgetUpperProof} from '../tools/playtest-budget.mjs';

const identity={scenariosHash:'frozen',promptHash:'source'};
const body={messages:[{role:'user',content:'测试中文请求'}],max_tokens:1800};
function response(id='response',usage={prompt_tokens:100,completion_tokens:10,prompt_cache_hit_tokens:60,prompt_cache_miss_tokens:40}){
 return {id,usage,measurement:{usage,costUpperYuan:(60*.04+40*2+10*8)/1e6},choices:[{finish_reason:'stop',message:{content:'已核对。'}}]};
}
async function setup(t,client,increment=30){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'fields-budget-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const options={registryDir:path.join(directory,'registry'),runDir:path.join(directory,'reports'),runId:'T17-wave',cardId:'T17',increment,identity,client};
 const budget=await openPlaytestBudget(options);t.after(()=>budget.close());return {directory,options,budget};
}
test('完整保守上界允许历史归属未知；缺金额/hash和超限均拒绝',()=>{
 const args={oldSpentYuan:.28484248,oldReservedYuan:6.37289,legacyYuan:5.77063128,content:[{shared:true,spentYuan:14.7517424,reservedYuan:.083736,hash:'a'.repeat(64)},{spentYuan:19.5480174,reservedYuan:0,hash:'b'.repeat(64)}]};
 const proof=budgetUpperProof(args);assert.ok(proof.budgetUpperSafe);assert.ok(Math.abs(proof.roundUpperYuan-20.42836376)<1e-10);assert.ok(proof.goalUpperYuan<100);
 assert.throws(()=>budgetUpperProof({...args,legacyYuan:undefined}),/金额缺失/);
 assert.throws(()=>budgetUpperProof({...args,content:[{...args.content[0],hash:''}]}),/hash/);
 assert.throws(()=>budgetUpperProof({...args,oldReservedYuan:30}),/超限/);
 assert.throws(()=>budgetUpperProof({...args,extraYuan:100}),/超限/);
});
test('发送前预算proof拒绝时零provider调用；严格responseId缺失保留预留',async t=>{
 let calls=0;const {budget,options}=await setup(t,{async generate(){calls++;const r=response();delete r.id;return r;}});await budget.close();
 const refused=await openPlaytestBudget({...options,beforeReserve:()=>{throw Error('保守上界缺金额');}});await assert.rejects(refused.generate(body),/缺金额/);assert.equal(calls,0);assert.equal(refused.reserved,0);await refused.close();
 const strict=await openPlaytestBudget({...options,requireResponseId:true,beforeReserve:()=>({budgetUpperSafe:true})});t.after(()=>strict.close());await assert.rejects(strict.generate(body),/responseId/);assert.equal(calls,1);assert.equal(strict.reserved,requestCeiling(body));assert.equal(strict.ledger.requests[Object.keys(strict.ledger.requests)[0]].request.messages[0].content,body.messages[0].content);
});

test('缓存只有真实 usage 才结算；同请求与重复 provider response 不双计或退款',async t=>{
 let calls=0;const {budget}=await setup(t,{async generate(){calls++;return response();}});
 const first=await budget.generate(body,'host','one');assert.equal(budget.reserved,0);assert.equal(budget.spent,first.measurement.costUpperYuan);
 assert.ok(budget.spent<requestCeiling(body));assert.deepEqual(await budget.generate(body,'host','one'),first);assert.equal(calls,1);
 await assert.rejects(budget.generate(body,'host','two'),/重复 response/);
 assert.equal(budget.spent,first.measurement.costUpperYuan);assert.equal(budget.reserved,requestCeiling(body));
});

test('并行请求先持久预留，单卡增量不足不会发第二次',async t=>{
 let resolveRequest,started;const ready=new Promise(resolve=>{started=resolve;});let calls=0;
 const {budget}=await setup(t,{generate(){calls++;started();return new Promise(resolve=>{resolveRequest=resolve;});}},1);
 const large={...body,max_tokens:100000},pending=budget.generate(large,'host','one');await ready;
 const saved=JSON.parse(await fs.readFile(budget.file,'utf8'));assert.equal(saved.reservedYuan,requestCeiling(large));
 await assert.rejects(budget.generate(large,'review','two'),/增量费用不足/);assert.equal(calls,1);
 resolveRequest(response());await pending;assert.equal(budget.reserved,0);
});

test('30元波次和单卡增量均检查，各卡和各波次不混账',async t=>{
 const {budget,options}=await setup(t,{async generate(){throw Error('中断未知');}});
 const large={...body,max_tokens:2500000};await assert.rejects(budget.generate(large,'host','old'),/中断/);await budget.close();
 let calls=0;const second=await openPlaytestBudget({...options,cardId:'T32',client:{async generate(){calls++;return response();}}});t.after(()=>second.close());
 await assert.rejects(second.generate({...body,max_tokens:1500000},'review','next'),/波次或单卡/);assert.equal(calls,0);
 assert.equal(second.ledger.cards.T17.reservedYuan,requestCeiling(large));assert.equal(second.ledger.cards.T32.spentYuan,0);
 const other=await openPlaytestBudget({...options,runId:'different-wave',runDir:path.join(options.runDir,'other'),client:{async generate(){return response('other');}}});t.after(()=>other.close());
 await other.generate(body);assert.ok(other.spent>0);assert.equal(other.reserved,0);
});

test('缺用量保留上界；失败一次续跑仍缺用量后拒第三次，原失败不删',async t=>{
 let calls=0;const {budget}=await setup(t,{async generate(){calls++;return {measurement:{costUpperYuan:0},choices:[]};}});
 await assert.rejects(budget.generate(body,'review','failure'),/用量/);
 await assert.rejects(budget.generate(body,'review','failure'),/用量/);
 await assert.rejects(budget.generate(body,'review','failure'),/重跑一次/);
 assert.equal(calls,2);assert.equal(budget.spent,0);assert.equal(budget.reserved,requestCeiling(body)*2);
 assert.equal(budget.ledger.requests.failure.attempts.length,2);assert.ok(budget.ledger.requests.failure.attempts.every(a=>a.error));
});

test('run-id跨报告目录接同账，身份和额度改变拒绝，同run并发进程拒绝',async t=>{
 const {budget,options}=await setup(t,{async generate(){return response();}});await budget.generate(body,'host','one');
 await assert.rejects(openPlaytestBudget(options),/正在使用/);await budget.close();
 const moved=await openPlaytestBudget({...options,runDir:path.join(options.runDir,'moved')});const spent=moved.spent;await moved.close();
 assert.equal(spent,budget.spent);
 await assert.rejects(openPlaytestBudget({...options,increment:29}),/授权已改变/);
 await assert.rejects(openPlaytestBudget({...options,identity:{...identity,promptHash:'changed'}}),/身份/);
});

test('真实强杀时预留落盘，死锁恢复后未知请求仍占原额度',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'fields-killed-budget-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const moduleUrl=new URL('../tools/playtest-budget.mjs',import.meta.url).href;
 const script=`import {openPlaytestBudget} from ${JSON.stringify(moduleUrl)}; const budget=await openPlaytestBudget({registryDir:process.argv[1],runId:'kill-wave',cardId:'T17',increment:30,identity:{},client:{async generate(){setInterval(()=>{},1000);process.stdout.write('reserved\\n');await new Promise(()=>{});}}});await budget.generate({max_tokens:1800,messages:[{role:'user',content:'hello'}]},'host','killed');`;
 const child=spawn(process.execPath,['--input-type=module','-e',script,directory],{stdio:['ignore','pipe','pipe']});t.after(()=>child.kill());
 const chunk=await once(child.stdout,'data');assert.match(String(chunk[0]),/reserved/);const exited=once(child,'exit');child.kill('SIGKILL');await exited;
 const budget=await openPlaytestBudget({registryDir:directory,runId:'kill-wave',cardId:'T17',increment:30,identity:{},client:{async generate(){return response();}}});t.after(()=>budget.close());
 const reserved=budget.reserved;assert.ok(reserved>0);assert.equal(budget.ledger.requests.killed.status,'unknown');
 await budget.generate({max_tokens:1800,messages:[{role:'user',content:'hello'}]},'host','killed');
 assert.equal(budget.reserved,reserved,'未知旧调用不能因重跑成功退款');assert.ok(budget.spent>0);
});

test('全部模型角色进入同波次，失败恢复不重新执行已完成HTTP或成功模型',async t=>{
 let calls=0,modelCalls=0;
 const {budget,directory}=await setup(t,{async generate(_body,label){modelCalls++;if(label==='review'&&modelCalls===2)throw Error('模拟失败');return response(`response-${modelCalls}`);}});
 const file=path.join(directory,'tape.json'),options={file,identity:{task:'one'},client:budget,api:async()=>{calls++;return {ok:true,paid:6};}};
 let tape=await openPlaytestTape(options);await tape.api('execute',{eventId:'pay'});await tape.client.generate(body,'host');await assert.rejects(tape.client.generate(body,'review'),/模拟失败/);
 tape=await openPlaytestTape(options);await tape.api('execute',{eventId:'pay'});await tape.client.generate(body,'host');await tape.client.generate(body,'review');
 assert.equal(calls,1);assert.equal(modelCalls,3);assert.equal(tape.tape.failures.length,1);
 for(const label of ['consistency:x','consistency-rewrite:x','npc-autonomy:x','voice-blind'])await budget.generate(body,label);
 assert.deepEqual(new Set(Object.values(budget.ledger.requests).map(r=>r.role)),new Set(['host','review','consistency','rewrite','planning','blind']));
});

test('历史聚合费用只能显式接续且保留原件，未知请求不得用零预留迁移',async t=>{
 const {budget,options}=await setup(t,{async generate(){return response();}});await budget.close();
 const oldDir=path.join(options.runDir,'old');await fs.mkdir(oldDir,{recursive:true});
 const report={complete:true,costUpperYuan:5.77063128,limitYuan:30,results:[]};const file=path.join(oldDir,'真实试玩.json');await fs.writeFile(file,JSON.stringify(report));const before=await fs.readFile(file,'utf8');
 const legacyOptions={...options,runDir:oldDir,runId:'legacy-wave'};
 await assert.rejects(openPlaytestBudget(legacyOptions),/历史试玩/);
 await assert.rejects(openPlaytestBudget({...legacyOptions,legacyReport:{report:{...report,complete:false},reservedYuan:0}}),/上界无法核验/);
 const imported=await openPlaytestBudget({...legacyOptions,legacyReport:{report,reservedYuan:.1}});t.after(()=>imported.close());
 assert.equal(imported.spent,report.costUpperYuan);assert.equal(imported.reserved,.1);assert.equal(imported.ledger.cards.T17.spentYuan,report.costUpperYuan);assert.equal(await fs.readFile(file,'utf8'),before);
 await assert.rejects(openPlaytestBudget({...legacyOptions,runId:'renamed-legacy',legacyReport:{report,reservedYuan:.1}}),/绑定其他 run-id/);
});

test('格式错误审稿保留已花费及原response，仅失败部分允许重试一次',async t=>{
 let calls=0;const {budget}=await setup(t,{async generate(){return response(`protocol-${++calls}`);}});
 await budget.generate(body,'review','failed-part');await budget.generate(body,'review-ok','good-part');const spent=budget.spent;
 await budget.rejectResponse('failed-part','JSON 缺字段');
 await budget.generate(body,'review-ok','good-part');assert.equal(calls,2);
 await budget.generate(body,'review','failed-part');assert.equal(calls,3);assert.ok(budget.spent>spent);
 await budget.rejectResponse('failed-part','仍缺字段');await assert.rejects(budget.generate(body,'review','failed-part'),/重跑一次/);
 const attempts=budget.ledger.requests['failed-part'].attempts;assert.equal(attempts[0].response.id,'protocol-1');assert.equal(attempts[1].response.id,'protocol-3');
});

test('真实CLI明确身份，换报告目录同预算、原失败保留及最多一次resume；不足额度零provider调用',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'fields-budget-cli-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const preload=path.join(directory,'mock.mjs'),moduleUrl=new URL('../tools/deepseek-client.mjs',import.meta.url).href;
 // Redirect only git common-dir discovery into this isolated fixture. The
 // production CLI has no alternate registry switch that could reset a run.
 await fs.writeFile(preload,`
import cp from 'node:child_process';
import {syncBuiltinESMExports,registerHooks} from 'node:module';
import fs from 'node:fs/promises';
import {DeepSeekClient} from ${JSON.stringify(moduleUrl)};
const original=cp.execFile,promisified=Symbol.for('nodejs.util.promisify.custom');
cp.execFile=(command,args,options,callback)=>command==='git'&&args.join(' ')==='rev-parse --git-common-dir'?callback(null,${JSON.stringify(directory)},''):original(command,args,options,callback);
cp.execFile[promisified]=async(command,args,options)=>command==='git'&&args.join(' ')==='rev-parse --git-common-dir'?{stdout:${JSON.stringify(directory)},stderr:''}:original[promisified](command,args,options);
syncBuiltinESMExports();
registerHooks({resolve(specifier,context,next){if(specifier==='./host-prompt.mjs'&&context.parentURL.endsWith('/tools/playtests.mjs'))return {url:'data:text/javascript,'+encodeURIComponent("export async function loadHostPromptProcessor(){return {identity:{type:'budget-test-mock'},process:messages=>messages};}"),shortCircuit:true};return next(specifier,context);}});
DeepSeekClient.prototype.generate=async()=>{await fs.writeFile(${JSON.stringify(path.join(directory,'provider-called'))},'called');throw Error('禁止模型调用');};
`);
 const cli=new URL('../tools/playtests.mjs',import.meta.url),runDir=path.join(directory,'reports'),movedDir=path.join(directory,'moved');
 const base=['--import',pathToFileURL(preload).href,fileURLToPath(cli),'--run-id','cli-wave','--card','T17','--increment','.000001','--only','out_of_character','--parallel','1'];
 async function run(destination,extra=[]){try{await promisify(execFile)(process.execPath,[...base,'--run-dir',destination,...extra],{timeout:30000});assert.fail('额度不足不能验收通过');}catch(error){assert.equal(error.code,1,error.stderr??error.message);assert.match(error.stdout,/completedSessions/,error.stderr);}}
 await run(runDir);const first=JSON.parse(await fs.readFile(path.join(runDir,'真实试玩.json'),'utf8'));
 assert.equal(first.runId,'cli-wave');assert.equal(first.cardId,'T17');assert.equal(first.costUpperYuan,0);assert.equal(first.results[0].recoveryRuns,0);
 await run(movedDir,['--resume']);const restored=JSON.parse(await fs.readFile(path.join(movedDir,'真实试玩.json'),'utf8'));
 assert.equal(restored.budgetFile,first.budgetFile);assert.equal(restored.results[0].recoveryRuns,1);assert.equal(restored.results[0].originalFailures.length,1);
 await run(movedDir,['--resume']);const final=JSON.parse(await fs.readFile(path.join(movedDir,'真实试玩.json'),'utf8'));
 assert.equal(final.results[0].recoveryRuns,1);assert.equal(final.results[0].originalFailures.length,1);assert.equal(final.reservedYuan,0);
 await assert.rejects(fs.stat(path.join(directory,'provider-called')),{code:'ENOENT'});
 assert.equal(await fs.readFile(path.join(runDir,'真实试玩.json'),'utf8'),JSON.stringify(first),'迁移后原报告不覆盖');
});
