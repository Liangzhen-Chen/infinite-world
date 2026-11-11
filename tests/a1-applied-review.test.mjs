// A1 一致性审查改读引擎已应用的效果（08 §8.4：叙述 = 已应用效果）。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {deterministicConsistencyReview,consistencyReviewRequest} from '../server-plugin/consistency-review.mjs';
import {appliedEffects,playerLedger} from '../server-plugin/applied-effects.mjs';
import {createPlaytestServer} from '../tools/playtest-runner.mjs';

const entities=[{id:'npc_hw_linsui',name:'林穗'},{id:'item_bread',name:'面包'},{id:'bld_hw_qingdeng',name:'青灯酒馆'}];
const before={minute:540,location:'bld_hw_qingdeng',player:{name:'旅人',coins:180},inventory:{},npcs:{npc_hw_linsui:{name:'林穗',coins:50,location:'bld_hw_qingdeng',inventory:{item_bread:{quantity:6}}}}};
const after={...before,minute:545,player:{name:'旅人',coins:176},inventory:{item_bread:{quantity:2}},npcs:{npc_hw_linsui:{...before.npcs.npc_hw_linsui,coins:54,inventory:{item_bread:{quantity:4}}}}};
const applied=appliedEffects(before,after);
const input=(draft,extra={})=>({playerText:'买两个面包',draft,before,after,receipts:[{tool:'world_trade',args:{seller:'林穗',item:'面包',quantity:2},result:{ok:true,buyer:'player',seller:'npc_hw_linsui',cost:4,item:'item_bread',quantity:2},applied}],allowedEntities:entities,...extra});
const errors=draft=>deterministicConsistencyReview(input(draft)).issues.filter(i=>i.severity==='error');

test('已应用效果按原语列出双方钱物、时间，玩家净变化可直接读出',()=>{
 assert.deepEqual(applied,[{op:'transfer',resource:'coin',holder:'player',delta:-4},{op:'transfer',resource:'item',holder:'player',item:'item_bread',delta:2},
  {op:'transfer',resource:'coin',holder:'npc_hw_linsui',delta:4},{op:'transfer',resource:'item',holder:'npc_hw_linsui',item:'item_bread',delta:-2},{op:'time',minutes:5,minute:545}]);
 assert.deepEqual(playerLedger(applied),{coins:-4,items:{item_bread:2}});
 assert.deepEqual(appliedEffects(before,before),[]);
});

test('正文替玩家说的付款数目须等于引擎实际扣款；台词、将来、否定不算',()=>{
 assert.deepEqual(errors('你付了4文，把两个面包揣进怀里。'),[]);
 assert.match(errors('你付了5文，把两个面包揣进怀里。')[0].reason,/实际扣款为4文/);
 assert.deepEqual(errors('<q who="npc_hw_linsui">一共五文。</q>你点点头。'),[]);
 assert.deepEqual(errors('下次你付了10文也行。'),[]);
 const none=deterministicConsistencyReview(input('你付了6文住了一晚。',{receipts:[],after:before})).issues;
 assert.ok(none.some(i=>i.reason.includes('没有扣下任何铜钱')),'没有任何扣款时不能写成付了钱');
});

test('审查证据带 applied，模型请求说明以已应用效果为据；旧调用方没有 applied 时按前后差补出',()=>{
 const request=consistencyReviewRequest(input('你付了4文。'));
 const evidence=JSON.parse(request.messages[1].content).evidence,row=evidence.find(e=>e.id==='applied');
 assert.deepEqual(JSON.parse(row.text).map(({receipt,...e})=>e),applied);assert.match(request.messages[0].content,/已应用的效果（applied/);
 const legacy=input('你付了5文。');delete legacy.receipts[0].applied;
 const fromDiff=JSON.parse(consistencyReviewRequest(legacy).messages[1].content).evidence.find(e=>e.id==='applied');
 assert.deepEqual(JSON.parse(fromDiff.text),applied);assert.ok(deterministicConsistencyReview(legacy).issues.some(i=>i.reason.includes('实际扣款为4文')));
});

test('服务端审查的每条回执都带本次结算的 applied（重放逐事件计算，不用整回合差分）',async t=>{
 const server=await createPlaytestServer({aiProfile:'T0'/*no model client: local rules only*/,consistencyEnabled:true});t.after(()=>server.close());
 const {reference}=await server.api('create',{}),campaignId=reference.campaignId;
 const begun=await server.api('review/begin',{campaignId,anchor:'a1',playerText:'买面包再等一会',expectedSequence:reference.sequence,enabled:false});
 await server.api('execute',{campaignId,tool:'world_act',args:{action:'trade.buy',slots:{seller:'林穗',item:'面包',quantity:1}},eventId:'a1-buy',anchor:'a1',expectedSequence:reference.sequence});
 const view=await server.api('read',{campaignId});
 await server.api('execute',{campaignId,tool:'world_time',args:{minutes:10},eventId:'a1-wait',anchor:'a1',expectedSequence:view.reference.sequence});
 const latest=await server.api('read',{campaignId});
 await server.api('review/reply',{campaignId,token:begun.token,draft:'你付了2文。<回合 额外="0分" 地点="bld_hw_qingdeng" 在场="npc_hw_linsui"/>',expectedSequence:latest.reference.sequence,query:''});
 const dir=path.join(server.directory,'infinite-fields',campaignId);
 const files=(await fs.readdir(dir,{recursive:true})).filter(f=>/review|consistency/i.test(f)&&f.endsWith('.json'));
 let record=null;for(const f of files){const row=JSON.parse(await fs.readFile(path.join(dir,f),'utf8'));if(row.evidence?.receipts)record=row;}
 assert.ok(record,'审查记录已保存');
 const [buy,wait]=record.evidence.receipts;
 assert.equal(buy.tool,'world_trade');assert.ok(buy.applied.some(e=>e.op==='transfer'&&e.holder==='player'&&e.resource==='coin'&&e.delta<0));
 assert.ok(!buy.applied.some(e=>e.op==='time'&&e.minutes===15),'每条回执只含自己的效果');
 assert.deepEqual(wait.applied.filter(e=>e.op==='time').map(e=>e.minutes),[10]);
});
