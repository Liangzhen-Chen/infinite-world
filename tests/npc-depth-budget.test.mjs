import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {migrateDepthBudget,openContentBudget} from '../tools/content-budget.mjs';
const legacy={spentYuan:1.10760808,reservedYuan:.083736,limitYuan:2.94801504,source:'mixed historical ledger'};
const allocation={waveLimitYuan:20,incrementLimitYuan:2,startingSpentYuan:.9480150399999996,startingReservedYuan:0,limitYuan:2.9480150399999996};
const next={waveLimitYuan:20,incrementLimitYuan:3,startingSpentYuan:1.10760808,startingReservedYuan:.083736};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
async function temporary(t,ledger=legacy){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'depth-budget-')),file=path.join(dir,'budget.json');t.after(()=>fs.rm(dir,{recursive:true,force:true}));await fs.writeFile(file,JSON.stringify(ledger));return{dir,file};}
function mock(ceiling,cost=ceiling){return{calls:0,estimateCostYuan:()=>ceiling,spent:0,reserved:0,budgetYuan:20,async generate(){this.calls++;this.spent+=cost;return{measurement:{costUpperYuan:cost}};}};}
test('精确旧账迁移保留共享和T06未知占用，不虚构历史费用归属',()=>{
 const out=migrateDepthBudget(legacy,'T06',allocation);near(out.cards.T06.spentYuan,.15959304);near(out.cards.T06.reservedYuan,.083736);near(2-out.cards.T06.spentYuan-out.cards.T06.reservedYuan,1.75667096);near(20-out.spentYuan-out.reservedYuan,18.80865592);near(out.historicalUnallocatedSpentYuan,.94801504);assert.equal(out.source,legacy.source);assert.deepEqual(migrateDepthBudget(out,'T06',allocation),out);
 for(const [ledger,a,card] of [[{...legacy,limitYuan:1,reservedYuan:0},allocation,'T06'],[legacy,{...allocation,incrementLimitYuan:3},'T06'],[legacy,allocation,'T07'],[{...legacy,spentYuan:1.2},allocation,'T06']]){if(ledger.limitYuan===1){const frozen=migrateDepthBudget(ledger,card,{...a,startingSpentYuan:ledger.spentYuan,startingReservedYuan:0});assert.equal(frozen.waveLimitYuan,1);}else assert.throws(()=>migrateDepthBudget(ledger,card,a));}
});
test('跨卡交错与换目录或revision保持单卡额度，任一费用上限前拒绝',async t=>{
 const {file}=await temporary(t);let client=mock(1,1),budget=await openContentBudget({file,client,cardId:'T06',allocation});await budget.close();
 client=mock(2.9,2.9);budget=await openContentBudget({file,client,cardId:'T07',allocation:next});await budget.request({},'different-directory-revision');await budget.close();
 client=mock(.2);budget=await openContentBudget({file,client,cardId:'T07',allocation:next});await assert.rejects(budget.request({},'new-output-directory'),/费用上限/);assert.equal(client.calls,0);await budget.close();
 client=mock(1.75667096);budget=await openContentBudget({file,client,cardId:'T06',allocation});await budget.request({},'T06-resume');near(budget.ledger.cards.T06.spentYuan+budget.ledger.cards.T06.reservedYuan,2);near(budget.ledger.reservedYuan,.083736);await budget.close();
 client=mock(.001);budget=await openContentBudget({file,client,cardId:'T06',allocation});await assert.rejects(budget.request({},'T06-again'),/费用上限/);assert.equal(client.calls,0);await budget.close();
 const value=JSON.parse(await fs.readFile(file,'utf8'));value.spentYuan=19.9;await fs.writeFile(file,JSON.stringify(value));client=mock(.05);budget=await openContentBudget({file,client,cardId:'T07',allocation:next});await assert.rejects(budget.request({},'wave-full'),/费用上限/);assert.equal(client.calls,0);await budget.close();
});
test('真实进程在预留后终止，两种账同时保留且重启不重领额度',async t=>{
 const {file,dir}=await temporary(t),marker=path.join(dir,'reserved.json'),module=path.resolve('tools/content-budget.mjs').replaceAll('\\','/');
 const script=`import fs from 'node:fs/promises';import {openContentBudget} from ${JSON.stringify('file:///'+module)};const file=${JSON.stringify(file)};const budget=await openContentBudget({file,cardId:'T06',allocation:${JSON.stringify(allocation)},client:{spent:0,reserved:0,budgetYuan:20,estimateCostYuan:()=>.4,generate:async()=>{await fs.writeFile(${JSON.stringify(marker)},await fs.readFile(file));process.exit(0)}}});await budget.request({},'killed-after-reserve');`;
 await promisify(execFile)(process.execPath,['--input-type=module','-e',script]);const after=JSON.parse(await fs.readFile(marker,'utf8'));near(after.reservedYuan,.483736);near(after.cards.T06.reservedYuan,.483736);near(after.spentYuan,legacy.spentYuan);
 const client=mock(1.4),budget=await openContentBudget({file,client,cardId:'T06',allocation});await assert.rejects(budget.request({},'restart'),/费用上限/);assert.equal(client.calls,0);near(budget.ledger.reservedYuan,.483736);await budget.close();
});
test('请求无最终用量保留占用，遗留预留只计一次，不建新空账',async t=>{
 const {file,dir}=await temporary(t),client=mock(.1);client.generate=async()=>{client.calls++;throw Error('terminated without measurement');};const budget=await openContentBudget({file,client,cardId:'T06',allocation});await assert.rejects(budget.request({},'unknown'));near(budget.ledger.spentYuan,legacy.spentYuan);near(budget.ledger.reservedYuan,.183736);near(budget.ledger.cards.T06.reservedYuan,.183736);await budget.close();
 await assert.rejects(openContentBudget({file:path.join(dir,'absent.json'),client:mock(0),cardId:'T07',allocation:next}),/拒绝初始化/);
 await assert.rejects(openContentBudget({file,client:mock(0)}),/须提供 cardId/);
});
test('稳定单卡恢复机会不因目录、revision或旧记录副本重新领取',async t=>{
 const {file}=await temporary(t);let budget=await openContentBudget({file,client:mock(0),cardId:'T06',allocation});assert.equal(await budget.claimProtocolRecovery('npc_yp_zhaofeng','original'),true);await budget.close();
 budget=await openContentBudget({file,client:mock(0),cardId:'T06',allocation:{...allocation,startingSpentYuan:99}});assert.equal(await budget.claimProtocolRecovery('npc_yp_zhaofeng','other-revision'),false);near(budget.ledger.reservedYuan,.083736);await budget.close();
 await assert.rejects(openContentBudget({file,client:mock(0),cardId:'T06',allocation:{...allocation,incrementLimitYuan:3}}),/额度已改变/);
});
