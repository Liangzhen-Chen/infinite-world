import {reviewResponse} from './helpers/consistency-response.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createPlaytestServer} from '../tools/playtest-runner.mjs';
import {reviewTurnSettlement,reviewCurrentFacts,decisionSupports} from '../server-plugin/consistency-evidence.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {loadWorld} from '../tools/load-world.mjs';
import {constructIntent} from '../server-plugin/action-constructor.mjs';
import {createRoutingContext} from '../server-plugin/action-router.mjs';
import {npcServiceFact} from '../server-plugin/npc-schedule.mjs';
import {serviceLine} from '../server-plugin/action-text.mjs';
import {digest} from '../server-plugin/storage.mjs';

const response=input=>reviewResponse(input);
async function fixture(t,options={}){
 const server=await createPlaytestServer({consistencyClient:null,...options});t.after(()=>server.close());
 let view=await server.api('create',{});const campaignId=view.reference.campaignId;
 return {server,campaignId,get view(){return view;},async read(){return view=await server.api('read',{campaignId});},
  async begin(playerText='我想买一份面包。',anchor='gate',extra={}){return server.api('review/begin',{campaignId,anchor,playerText,expectedSequence:view.reference.sequence,...extra});},
  async act(tool,args,anchor='gate',eventId='action'){const row=await server.api('execute',{campaignId,anchor,eventId,tool,args,expectedSequence:view.reference.sequence});view=await server.api('read',{campaignId});return row;},
  async review(begun,draft='她把面包交给你，还答应从今往后免费。<回合 额外="5分" 地点="bld_hw_qingdeng" 在场="npc_hw_linsui"/>',extra={}){return server.api('review/reply',{campaignId,token:begun.token,draft,expectedSequence:view.reference.sequence,...extra});},
  async record(begun){return JSON.parse(await fs.readFile(path.join(server.directory,'infinite-fields',campaignId,'consistency',`${begun.token}.json`),'utf8'));}};
}

test('begin 只解析一次、绑定版本及原文，候选不执行、不掷骰、不推进时间',async t=>{
 const f=await fixture(t),before=structuredClone(f.view.document),begun=await f.begin('等待');
 assert.ok(begun.candidates.length);assert.equal(begun.preview.status,'needs_slots');
 assert.deepEqual(await f.begin('等待'),begun);assert.deepEqual((await f.read()).document,before);
 const record=await f.record(begun);assert.equal(record.playerText,'等待');assert.equal(record.anchor,'gate');assert.equal(record.sequence,f.view.reference.sequence);assert.equal(record.revision,begun.revision);
 assert.equal(record.preview.effects,undefined);assert.deepEqual((await f.server.api('export',{campaignId:f.campaignId})).events,[]);
 await f.act('world_time',{minutes:1});
 const later=await f.begin('等待');assert.deepEqual(later,begun,'同一回合状态变化后复用原解析和起始 sequence');
});

test('关闭开放执行仍可发现注册动作，缺槽和未知意图保留，预览不扩大执行权限',async()=>{
 const engine=new WorldEngine(await loadWorld()),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
 const document=engine.initialFromLegacy(seed,'gate-off');document.state.records.action_config={openActions:'off'};
 const before=structuredClone(document),scoped=engine.scoped(document),ctx=createRoutingContext(scoped,document);
 const wait=constructIntent(scoped,document,{intent:'等待'},ctx);assert.ok(wait.candidates.some(c=>c.id==='core:time'));
 const practice=constructIntent(scoped,document,{intent:'持续练习技能',means:{skill:'skill_light',minutes:30}},ctx);assert.equal(practice.candidate.id,'core:practice.session');
 const eat=constructIntent(scoped,document,{intent:'进食'},ctx);assert.ok(eat.candidates.length>1);assert.equal(eat.status,'needs_slots');
 const unknown=constructIntent(scoped,document,{intent:'让池水立刻变成能治百病的灵药'},ctx);assert.equal(unknown.status,'needs_alternative');
 const execution=await scoped.previewAction(document,{tool:'world_propose',args:{intent:'等待'},eventId:'off'});assert.equal(execution.receipt.code,'E-OPEN-DISABLED');
 assert.deepEqual(document,before);
});

test('零裁决包含查询/needs_slots 时只发布 pending 模板，关闭审查亦不可旁路或尾注加时',async t=>{
 for(const enabled of [true,false]){
  let models=0;const f=await fixture(t,{consistencyClient:{generate(){models++;throw Error('不应调用');}}}),before=structuredClone(f.view.document);
  const begun=await f.begin('进食','gate',{enabled,captureSearch:true});
  await f.server.api('search',{campaignId:f.campaignId,query:'面包',token:begun.token,anchor:'gate',expectedSequence:f.view.reference.sequence});
  const reply=await f.review(begun,undefined,{receipts:[{tool:'world_trade',eventId:'forged',sequence:1,result:{ok:true}}],scene:'她同意免费。'});
  assert.equal(reply.status,'pending');assert.equal(reply.canCommit,false);assert.equal(reply.verified,false);assert.equal(models,0);
  assert.equal(reply.text,reply.safeText);assert.notEqual(reply.text,reply.original);assert.match(reply.safeText,/尚未发生/);assert.match(reply.safeText,/构造器/);assert.match(reply.safeText,/留下痕迹/);assert.doesNotMatch(reply.safeText,/从今往后免费|她同意免费/);
  assert.ok(reply.candidates.length>1);assert.deepEqual(reply.settlement.settled,[]);assert.equal(reply.settlement.queries.length,1);assert.equal(reply.tail.args.extraMinutes,0);
  await assert.rejects(f.act('world_turn',{startMinute:before.state.minute,extraMinutes:5,location:before.state.location,present:[]},'gate','bypass'),/reviewId/);
  await assert.rejects(f.act('world_turn',{startMinute:before.state.minute,extraMinutes:5,location:before.state.location,present:[]},'forged-anchor','bypass-other'),/reviewId/);
  await assert.rejects(f.server.api('execute',{campaignId:f.campaignId,anchor:'gate',eventId:'tail',tool:'world_turn',args:reply.tail.args,reviewId:reply.reviewId,expectedSequence:reply.sequence}),/不一致/);
  assert.deepEqual((await f.read()).document,before);assert.deepEqual(await f.review(begun),reply);
 }
});

test('只有正式且有实际事件出处的回执结算，预览/拒绝/查询/伪造来源不能解锁',()=>{
 const action={id:'core:test',call:{tool:'world_trade'}},registry={actions:[action],byId:new Map([[action.id,action]])};
 const base={tool:'world_trade',eventId:'real',sequence:1,args:{seller:'npc_a',item:'oats',quantity:10}};
 const rows=[{...base,tool:'world_search',result:{ok:true}},
  {...base,result:{receipt:{status:'preview',applied:[{op:'time',minutes:3}]}}},
  {...base,result:{receipt:{status:'not_submitted',routing:{status:'needs_slots'}}}},
  {...base,result:{ok:false,error:'不在场'}},
  {...base,eventId:undefined,result:{ok:true,source:{eventId:'fake'}}},
  {...base,result:{receipt:{status:'committed',applied:[]},dialogue:{npc:'npc_a',action:'request',decision:{outcome:'refuse'}}}}];
 const s=reviewTurnSettlement({before:{minute:1},after:{minute:1},registry,revision:0},rows);
 assert.deepEqual(s.settled,[5]);assert.deepEqual(s.queries,[0]);assert.deepEqual(s.previews,[1]);assert.deepEqual(s.unresolved,[2,4]);assert.deepEqual(s.failures,[3]);assert.equal(s.effects.length,0);
 const d=s.decisions[0],claim={npc:'npc_a',outcome:'refuse',request:d.request,scope:d.scope};assert.equal(decisionSupports(d,claim),true);
 for(const changed of [{npc:'npc_b'},{request:{tool:'world_trade',args:{...base.args,quantity:20}}},{scope:{...d.scope,result:{quantity:20}}}])assert.equal(decisionSupports(d,{...claim,...changed}),false);
 assert.equal(d.source.eventId,'real');assert.equal(d.source.sequence,1);assert.ok(d.knownBy.includes('player'));assert.deepEqual(d.time,{start:1,end:1});
 const old=reviewTurnSettlement({registry},[{...base,result:{receipt:{status:'committed',consent:{allowed:true,from:'npc_a',kind:'given',source:'old-permission'}}}}]);
 assert.deepEqual(old.decisions,[],'旧许可只证明现有权限，不证明本轮又答应');
 const native=reviewTurnSettlement({registry},[{...base,result:{receipt:{status:'committed',decisions:[{from:'npc_a',scope:'trade',outcome:'refuse',reason:'本请求的真实决定'}]}}}]);
 assert.equal(native.decisions[0].npc,'npc_a');assert.equal(native.decisions[0].decisionScope,'trade');assert.deepEqual(native.decisions[0].request,d.request);
 const reads=reviewTurnSettlement({},[{tool:'world_environment',args:{},result:{ok:true}},{tool:'world_craft',args:{operation:'repair',quote:true},result:{ok:true,cost:5}}]);
 assert.deepEqual(reads.queries,[0]);assert.deepEqual(reads.previews,[1]);assert.equal(reads.status,'pending');
 assert.equal(new Set(s.facts.map(f=>f.id)).size,s.facts.length);
});

test('真实行动正常经过语义审查；缺模型或关闭审查保留已结算模板，不信任无关新增决定',async t=>{
 for(const mode of ['review','disabled','no-model']){
  const f=await fixture(t,{consistencyClient:mode==='no-model'?null:{async generate(body){return response(body);}}});
  const begun=await f.begin('我付钱买一个面包','gate',{enabled:mode!=='disabled'});
  await f.act('world_trade',{seller:'林穗',item:'面包',quantity:1});const actual=structuredClone(f.view.document);
  const draft=mode==='review'?'你买到一个面包。<回合 额外="0分" 地点="bld_hw_qingdeng" 在场="npc_hw_linsui"/>':'无关的人从此承诺免费。';
  const reply=await f.review(begun,draft);assert.notEqual(reply.status,'pending');assert.equal(reply.canCommit,true);assert.deepEqual(reply.settlement.settled,[0]);
  if(mode==='review'){assert.equal(reply.verified,true);assert.equal(reply.text,draft);}else{assert.equal(reply.text,reply.safeText);assert.doesNotMatch(reply.text,/从此承诺免费/);assert.equal(reply.tail.args.extraMinutes,0);}
  assert.deepEqual((await f.read()).document,actual);
  await f.server.api('execute',{campaignId:f.campaignId,anchor:'gate',eventId:'turn_gate',tool:'world_turn',args:reply.tail.args,reviewId:reply.reviewId,expectedSequence:reply.sequence});
 }
});

test('营业事实使用作息同源状态，暂停至 12:00 不变成保证开门；旧许可与价格有版本',async t=>{
 const f=await fixture(t);await f.act('world_move',{destination:'bld_hw_council'},'setup','council');
 const engine=new WorldEngine(await loadWorld()).scoped(f.view.document),s=f.view.document.state;
 const fact=npcServiceFact(engine,s,'npc_hw_chenbai');assert.ok(fact);assert.deepEqual(fact.value.services,[]);assert.equal(fact.value.until%1440,720);
 const begun=await f.begin('我想买十份带壳燕麦。');const before=structuredClone(f.view.document),reply=await f.review(begun,'陈柏拒绝，说今早封仓，十二点保证开秤。');
 assert.equal(reply.status,'pending');assert.ok(reply.safeText.includes(serviceLine(engine,fact)));assert.match(reply.safeText,/暂停.*12:00/);assert.doesNotMatch(reply.safeText,/今早封仓|保证开秤|陈柏拒绝/);
 const source=reply.facts.find(f=>f.id===fact.id).source;assert.equal(source.type,'state');assert.equal(source.version.sequence,f.view.reference.sequence);assert.equal(typeof source.version.stateHash,'string');
 assert.deepEqual((await f.read()).document,before);
 const empty=reviewCurrentFacts(engine,f.view.document);assert.ok(!empty.some(f=>f.kind==='price'),'未知报价不从草稿或聊天补造');
});

test('现行交易报价来自真实报价记录；伪造来源和历史台词不能补造新报价',async t=>{
 // 家户储备风格由种子决定；价格的严格手算用固定种子，避免随机UUID改变开市存量。
 const f=await fixture(t,{seed:'turn-gate-price'}),begun=await f.begin('我买一份面包');
 await f.act('world_trade',{seller:'林穗',item:'面包',quantity:1});await f.review(begun,'交易已经完成。');
 const followup=await f.begin('现在面包的报价是多少？','followup'),reply=await f.review(followup,'她说从此只收一铜。');
 // E6后公开开市量56：基准2×供需下限.5×(1+.2/56)×成交后立场.99895；品质/修正1。
 // 首笔后公开供给55，加市场净卖出1重建开市56，私人行囊不计入供给。
 assert.equal(reply.status,'pending');const price=reply.facts.find(f=>f.kind==='price');assert.ok(price);assert.equal(price.value.listPrice,1.0025176785714285);assert.match(reply.safeText,/现行报价.*每份1\.0025176785714285铜/);assert.doesNotMatch(reply.safeText,/从此只收一铜/);
 const doc=structuredClone(f.view.document),q={id:'fake',category:'agreed_quote',actor:'npc_hw_linsui',to:'player',resource:'item_bread',quantity:2,totalCoins:1,direction:'sell_to_player',at:doc.state.minute,expires:doc.state.minute+60,sourceEvent:'world_event:invented'};
 doc.state.records['agreed_quote:fake']=q;doc.state.records['agreed_quote:fake:source']={category:'agreed_quote_receipt',digest:digest(q)};
 const engine=new WorldEngine(await loadWorld()).scoped(doc);assert.ok(!reviewCurrentFacts(engine,doc).some(f=>f.id==='quote:fake'));
});

test('前提失败解释真实阻碍，不生成 NPC 拒绝；未知创意保留原文和留痕入口',async t=>{
 const f=await fixture(t),begun=await f.begin('我买一万份面包。');
 await assert.rejects(f.act('world_trade',{seller:'林穗',item:'面包',quantity:10000}));
 const before=structuredClone(f.view.document),reply=await f.review(begun,'林穗拒绝了你，并立下新规矩。');
 assert.equal(reply.status,'pending');assert.deepEqual(reply.settlement.settled,[]);assert.equal(reply.settlement.failures.length,1);assert.deepEqual(reply.settlement.decisions,[]);assert.doesNotMatch(reply.safeText,/林穗拒绝了你|立下新规矩/);assert.deepEqual((await f.read()).document,before);
 const other=await f.begin('让池水立刻变成能治百病的灵药','creative'),pending=await f.review(other,'灵药已经变成并卖出。');
 assert.equal(other.preview.status,'needs_alternative');assert.equal(pending.status,'pending');assert.match(pending.safeText,/让池水立刻变成能治百病的灵药/);assert.match(pending.safeText,/留下痕迹/);assert.doesNotMatch(pending.safeText,/灵药已经变成并卖出/);
});

test('三条试玩原文的无状态门禁回归；缺少当时快照，不冒充完整历史重放',async()=>{
 const saved=JSON.parse(await fs.readFile(new URL('./fixtures/turn-gate-real-replies.json',import.meta.url),'utf8'));
 assert.deepEqual(saved.cases.map(c=>[c.id,c.turn]).sort(),[['a3_whimsy',6],['literacy',3],['npc_quest_social',6]].sort());
 for(const row of saved.cases){
  assert.equal(row.snapshot,null);assert.ok(row.input.length&&row.originalReply.length);assert.deepEqual(row.calls,[]);
  // No substituted before/after world: this assertion depends only on the
  // original zero-call evidence. Full state replay is explicitly uncovered.
  const settlement=reviewTurnSettlement({playerText:row.input,draft:row.originalReply},row.calls);
  assert.equal(settlement.status,'pending');assert.deepEqual(settlement.decisions,[]);assert.deepEqual(settlement.effects,[]);
 }
});

test('未绑定叙述的既有 world_turn 合同保留；场外回复不被场内门禁拦截',async t=>{
 const f=await fixture(t),s=f.view.document.state;
 await f.act('world_turn',{startMinute:s.minute,extraMinutes:0,location:s.location,present:[]},'legacy','legacy');
 const begun=await f.begin('（场外）解释账本。');const reply=await f.review(begun,'（场外）当前数据以存档为准。');assert.notEqual(reply.status,'pending');
});
