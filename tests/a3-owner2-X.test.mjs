import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyIntentSetup,executeIntent} from '../tools/a3-score.mjs';
import {sessionApi} from '../tools/a3-session-fixture.mjs';
import {validateSessionHistory} from '../tools/a3-setup/session.mjs';
import {tmpRoot} from '../tools/tmp-root.mjs';
import {digest} from '../server-plugin/storage.mjs';
import {reconcile} from './helpers/ledger-audit.mjs';
import {isSystemMemoryText} from '../server-plugin/retrieval-lexicon.mjs';
import {relationView} from '../server-plugin/npc-relations.mjs';

const world=await loadWorld(),engine=new WorldEngine(world);
const seed=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
const initial=engine.createCharacter(seed,{},'a3-owner2-x');
const corpus=JSON.parse(await fs.readFile(new URL('./fixtures/a3-intents-v2.json',import.meta.url),'utf8'));
const row=id=>structuredClone(corpus.find(r=>r.id===`A3V2-${id}`));
const run=id=>executeIntent(engine,initial,row(id));
const stock=(bag,id)=>typeof bag?.[id]==='number'?bag[id]:bag?.[id]?.quantity??0;
function ready(value){
 assert.deepEqual(value.setupUnmet,[]);assert.equal(value.actual.session.roundtrip,true);
 assert.deepEqual(reconcile(engine,value.document),{mismatches:[],lots:[],drift:[],audit:[]});
}

test('X1 原聊天200回合定位、摘要遗漏与四个原样同义查询均经重启后的原生检索',async()=>{
 for(const id of [151,152,153]){
  const value=await run(id);ready(value);assert.equal(value.actual.route,'core:search');assert.deepEqual(value.effects,[]);
  const session=value.actual.session;
  assert.equal(session.searches.length,id===153?4:1);
  for(const query of session.searches){
   assert.ok(query.results.some(r=>r.id===(id===151?'chat_9':'chat_0')&&r.source==='原始对话'));
   assert.equal(query.results.some(r=>isSystemMemoryText(r.text)),false);
  }
  if(id===151)assert.equal(session.operations.filter(s=>s.operation==='append_turns').reduce((n,s)=>n+s.count,0),199);
  if(id===152){assert.ok(session.operations.some(s=>s.operation==='set_summary'));assert.ok(session.searches[0].results.some(r=>r.text.includes('午时')));}
  assert.deepEqual(session.initial,session.final);assert.equal(session.events.length,0);
  assert.equal(Object.values(value.document.state.records??{}).some(r=>r.category==='access_permit'),false);
 }
});

test('X2 编辑与删除真实交易恢复双方钱货及世界钟，存档导入仍一致',async()=>{
 for(const id of [156,158]){
  const value=await run(id);ready(value);assert.equal(value.actual.route,'core:read');assert.deepEqual(value.effects,[]);
  const session=value.actual.session;
  assert.deepEqual(session.initial,session.final);assert.equal(session.final.coins,10);assert.equal(session.final.minute,600);
  assert.equal(stock(session.final.inventory,'item_bread'),0);
  assert.equal(session.events.filter(e=>e.kind==='action').length,1);
  assert.equal(session.events.filter(e=>e.kind==='reconcile').length,1);
  if(id===158)assert.equal(stock(session.final.parties.npc_hw_linsui.inventory,'item_bread'),2);
 }
});

test('X3 重生成先撤回再以原事件号执行，只有一笔有效交易',async()=>{
 const value=await run(157);ready(value);assert.equal(value.actual.route,'core:read');
 const s=value.actual.session,actions=s.events.filter(e=>e.kind==='action'),removed=new Set(s.events.flatMap(e=>e.removed??[]));
 assert.equal(s.final.coins,6);assert.equal(stock(s.final.inventory,'item_bread'),2);
 assert.equal(actions.length,2);assert.equal(actions[0].id,actions[1].id);
 assert.equal(removed.size,1);assert.ok(s.operations.some(o=>o.operation==='regenerate_turn'&&o.restored));
 assert.equal(s.final.parties.npc_hw_linsui.coins-s.initial.parties.npc_hw_linsui.coins,4);
});

test('X3 requestId重发返回原回执，世界钟与钱货均未再次改变',async()=>{
 const value=await run(126);ready(value);const s=value.actual.session;
 assert.equal(value.actual.route,'core:trade.buy');assert.equal(value.receipt.duplicate,true);assert.deepEqual(value.effects,[]);
 assert.equal(s.final.coins,16);assert.equal(stock(s.final.inventory,'item_bread'),2);
 assert.equal(s.events.filter(e=>e.input?.tool==='world_trade').length,1);assert.equal(s.events[0].id,'a3v2_126_paid_once');
 assert.equal(s.final.minute,600);
 assert.equal(s.operations.filter(o=>o.operation==='execute'&&o.duplicate).length,1);
 assert.ok(s.duplicate.result.receipt.applied.length>0,'原回执保留首次执行效果，与本次增量分开');
});

test('X4 只升级题内副本，原生备份、钱物及熟识记忆保留，可继续实际聊天',async()=>{
 const value=await run(159);ready(value);const s=value.actual.session;
 assert.equal(s.final.coins,7);assert.equal(stock(s.final.inventory,'item_staff'),1);
 assert.deepEqual(s.initial,s.final);assert.ok(s.operations.some(o=>o.operation==='upgrade_copy'&&o.backupPreserved));
 assert.equal(s.events.filter(e=>e.input?.type==='world_upgrade').length,1);
 assert.deepEqual(value.document.memories,s.relationship.memories);
 assert.deepEqual(relationView(engine,value.document.state,'npc_hw_linsui','player'),s.relationship.dimensions);
 assert.ok(s.relationship.search.results.some(r=>r.id.startsWith('memory_')&&r.text.includes('熟识')));
 // core:dialogue.greet 的原生 emit.verb 是 greet；语料的 greeting
 // 是签名别名。仍验证同一 NPC 的真实对话写入，不能用空效果代替。
 assert.ok(value.effects.some(e=>e.op==='emit'&&e.verb==='greet'&&e.target==='npc_hw_linsui'&&e.result?.after?.action==='greet'));
 assert.equal(value.actual.committed,true);
});

test('X 伪造来源、额外权限字段和非法时钟不执行会话动作',async()=>{
 const before=digest(initial);
 for(const mutate of [r=>{r.setup.history[0].source.row='other';},r=>{r.setup.history[0].source.kind='model';},r=>{r.setup.history[0].steps[0].authority='owner';},r=>{r.setup.history[0].at=-1;},r=>{r.proposal.effects=[{op:'transfer',quantity:999}];},r=>{r.input={tool:'world_trade',args:{seller:'npc_hw_linsui',quantity:999}};}]){
  const r=row(151);mutate(r);const value=await executeIntent(engine,initial,r);
  assert.ok(value.setupUnmet.length);assert.equal(value.actual.committed,false);assert.deepEqual(value.actual.session.operations,[]);
  assert.equal(digest(value.document),before);
 }
 const invalid=row(188).setup.history[0];invalid.steps[1].days=-30;
 assert.throws(()=>validateSessionHistory(invalid,'A3V2-188'),/Invalid session days/);
 const synchronous=applyIntentSetup(engine,initial,row(151).setup);
 assert.ok(synchronous.setupUnmet.some(e=>e.reason.includes('asynchronous session execution adapter')));
});

test('X 原生存储拒绝同requestId伪造不同交易，其他隔离会话不可读取此存档',async t=>{
 const root=await fs.mkdtemp(path.join(tmpRoot(),'a3-x-negative-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const api=await sessionApi(world,root),created=await api('/create',{}),campaignId=created.reference.campaignId;
 const args={seller:'npc_hw_linsui',item:'item_bread',quantity:2};
 await api('/execute',{campaignId,tool:'world_trade',args,eventId:'same-id'});
 const before=await api('/export',{campaignId});
 await assert.rejects(()=>api('/execute',{campaignId,tool:'world_trade',args:{...args,quantity:1},eventId:'same-id'}));
 assert.equal(digest(await api('/export',{campaignId})),digest(before));
 await assert.rejects(()=>api('/read',{campaignId:'../bad'}));
 const another=await sessionApi(world,path.join(root,'other-user'));
 await assert.rejects(()=>another('/read',{campaignId}));
});
