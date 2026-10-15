import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,draft,A,B,HOST,SEAT,T} from './helpers/faith.mjs';
import {faithOf} from '../server-plugin/faith-state.mjs';
import {personView,groupView} from '../server-plugin/entity-view.mjs';
import {temples} from '../server-plugin/faith-catalog.mjs';
import {groupAccountView} from '../server-plugin/group-account.mjs';
import {collectivesOf,standing} from '../server-plugin/standing.mjs';
import {publishTransitionEvent} from '../server-plugin/world-events.mjs';
import {faithConflictClocks,conversionPolicy,advanceFaith} from '../server-plugin/faith.mjs';
import {initializeFactionClocks,advanceFactionClocks} from '../server-plugin/faction-clock.mjs';
import {toolDefinitions} from '../extension/tools.mjs';
import {faithRules} from '../world/design/rw07-faith.mjs';

test('信仰只读派生：文化、当前家户、师承及迁居；经历覆盖不被默认值冲掉',()=>{
 const s=fixture(),before=structuredClone(s.doc);const v=personView(s.engine,s.doc.state,A);
 assert.equal(v.faith.override,false);assert.equal(v.faith.value.deity,'deity_furrow');assert.deepEqual(s.doc,before);
 s.doc.state.npcs[A].residence={settlement:'loc_capital',home:'loc_capital'};
 assert.equal(faithOf(s.engine,s.doc.state,A).value.temple,'faction_oathkeepers');
 s.doc.state.npcs[A].relationships={[HOST]:{type:'师父'}};
 assert.equal(faithOf(s.engine,s.doc.state,A).value.temple,T);
 delete s.doc.state.npcs[A].relationships;
 const house=v.household.value,relative=house.members.find(id=>id!==A);
 assert.ok(relative);s.doc.state.npcs[relative].faith={deity:'deity_bank',temple:T};
 assert.equal(faithOf(s.engine,s.doc.state,A).value.temple,T);
 s.doc.state.npcs[A].faith={deity:null,temple:null,doubt:true,override:true};
 assert.equal(faithOf(s.engine,s.doc.state,A).override,true);assert.equal(faithOf(s.engine,s.doc.state,A).value.deity,null);
 assert.ok(temples(s.engine).some(t=>t.id===T));assert.equal(groupView(s.engine,s.doc.state,T).kind.value,'教会');
 for(const use of Object.values(s.engine.rules.faith.uses))for(const id of Object.keys(use.items))assert.ok(s.engine.byId.has(id),`寺观材料须为既有物品:${id}`);
});

test('寺观香火与救济守恒、用途能查；施药真实交付且不冒充治疗',async()=>{
 const s=fixture(),coins=s.doc.state.player.coins,food=s.engine.quantity(draft(s),'player','item_ration');
 assert.ok((await s.faith('inspect',{org:undefined})).temples.some(t=>t.id===T));
 assert.equal((await s.faith('inspect',{org:'芦衡观'})).temple.id,T);
 assert.equal((await s.run({operation:'org_inspect',org:T})).kind,'教会');
 await s.faith('give',{coins:40,item:'item_ration',quantity:4});
 await s.faith('give',{item:'item_herb',quantity:2});
 assert.equal(s.doc.state.player.coins,coins-40);assert.equal(s.engine.quantity(draft(s),'player','item_ration'),food-4);
 const old=s.doc.state.npcs[A].coins,inventory=s.engine.quantity(draft(s),A,'item_ration'),herbs=s.engine.quantity(draft(s),A,'item_herb');
 await s.faith('use',{choice:'relief',member:A,consent:true});
 assert.equal(s.doc.state.npcs[A].coins,old+3);assert.equal(s.engine.quantity(draft(s),A,'item_ration'),inventory+1);
 assert.equal(personView(s.engine,s.doc.state,A).faith.value.temple,T);
 const host=s.doc.state.npcs[HOST].coins;s.doc.state.npcs[A].status='患病';
 const hp=s.doc.state.npcs[A].hp;
 await s.faith('use',{choice:'medicine',member:A,consent:true});
 assert.equal(s.doc.state.npcs[A].status,'患病');assert.equal(s.doc.state.npcs[A].hp,hp);
 assert.equal(s.engine.quantity(draft(s),A,'item_herb'),herbs+1);assert.equal(s.doc.state.npcs[HOST].coins,host+2);
 const view=await s.faith('inspect');assert.equal(view.account.coins,35);assert.equal(view.account.items.item_herb,1);
 assert.equal(view.history.length,2);assert.ok(view.account.ledger.some(l=>l.kind==='relief'&&l.party===A));
 const before=structuredClone(s.doc);await assert.rejects(s.faith('give',{coins:2000}),/不足/);assert.deepEqual(s.doc,before);
 await assert.rejects(s.faith('use',{choice:'repair',consent:true}),/设施接口/);assert.deepEqual(s.doc,before);
});

test('义学与法会消费实际公库和主持工时；超出能力及拒绝均不留半笔支出',async()=>{
 const s=fixture();await s.faith('give',{coins:30,item:'item_ration',quantity:3});
 s.doc.state.npcs[HOST].skills={skill_literacy:200};s.doc.state.npcs[A].skills={skill_literacy:0};
 const at=s.doc.state.minute,host=s.doc.state.npcs[HOST].coins;
 await s.faith('use',{choice:'school',member:A,consent:true});
 assert.equal(s.doc.state.npcs[A].skills.skill_literacy,2);assert.equal(s.doc.state.minute,at+60);
 assert.equal(s.doc.state.npcs[HOST].coins,host+4);
 const afterLesson=structuredClone(s.doc);await assert.rejects(s.faith('use',{choice:'school',member:A,consent:true}),/隔日/);assert.deepEqual(s.doc,afterLesson);
 await s.faith('use',{choice:'assembly',member:A,consent:true});assert.equal(groupAccountView(s.engine,s.doc.state,T).coins,24);
 const before=structuredClone(s.doc);await assert.rejects(s.faith('use',{choice:'school',member:A}),/同意/);assert.deepEqual(s.doc,before);
 s.doc.state.npcs[HOST].skills.skill_literacy=1;const failed=structuredClone(s.doc);
 await assert.rejects(s.faith('use',{choice:'school',member:A,consent:true}),/未掌握/);assert.deepEqual(s.doc,failed);
});

test('入教、改宗移转成员与K4立场，按文化及现行法典派生；仪式可重放',async()=>{
 const s=fixture(),old='faction_furroworder',house=personView(s.engine,s.doc.state,A).household.value,relative=house.members.find(id=>id!==A);
 s.doc.state.npcs[A].faith={deity:'deity_furrow',temple:old,observedSince:0,lastBreach:-1};
 const orig=s.doc.state.npcs[A].coins,regard=standing(s.engine,s.doc.state,relative,A);
 await s.faith('convert',{member:A,consent:true});
 assert.equal(s.doc.state.npcs[A].coins,orig-12);assert.equal(s.doc.state.minute,600);
 assert.equal(groupView(s.engine,s.doc.state,T).members.value[A].position,'成员');
 assert.ok(!groupView(s.engine,s.doc.state,old).members.value[A]);
 assert.ok(standing(s.engine,s.doc.state,old,A)<0);assert.equal(standing(s.engine,s.doc.state,relative,A),regard-2);
 assert.ok(collectivesOf(s.engine,s.doc.state,A).some(c=>c.holder===T));
 const settled=structuredClone(s.doc);await assert.rejects(s.faith('convert',{member:A,consent:true}),/已正式/);assert.deepEqual(s.doc,settled);
 s.doc.state.npcs[A].culture='culture_reed';assert.equal(conversionPolicy(s.engine,s.doc.state,A,SEAT).formerDelta,-6);
 s.engine.rules.law={codes:[{id:'local',locations:[SEAT],conversion:{attitude:'forbidden'}}]};
 const other=temples(s.engine).find(t=>t.deity==='deity_lintel'&&t.source==='temple');s.doc.state.location=other.seat;s.doc.state.npcs[A].location=other.seat;
 s.engine.rules.law.codes[0].locations=[other.seat];await assert.rejects(s.faith('convert',{org:other.id,member:A,consent:true}),/法典禁止/);
 assert.equal(s.doc.state.npcs[A].faith.temple,T);
});

test('亲历救助、受教、揭谎和灾祸改变个人信仰，重复事件不覆盖后续选择',()=>{
 const s=fixture(),emit=e=>publishTransitionEvent(draft(s),s.engine,{id:e.id,minute:s.doc.state.minute,location:SEAT,witnesses:[],tags:[],...e});
 emit({id:'aid',verb:'help',actor:HOST,target:A,value:5});assert.equal(faithOf(s.engine,s.doc.state,A).value.temple,T);
 emit({id:'teach',verb:'learn',actor:B,target:HOST,tags:['success']});assert.equal(faithOf(s.engine,s.doc.state,B).value.temple,T);
 emit({id:'lie',verb:'deceive',actor:HOST,target:A,tags:['exposed']});assert.equal(faithOf(s.engine,s.doc.state,A).value.doubt,true);
 emit({id:'flood',verb:'harm',actor:null,target:B,tags:['disaster']});assert.equal(faithOf(s.engine,s.doc.state,B).value.observedSince,null);
 const before=structuredClone(s.doc);emit({id:'aid',verb:'help',actor:HOST,target:A,value:5});assert.deepEqual(s.doc,before);
});

test('日结新发疾病实际触发个人信仰动摇，诊断保持私密且重复推进不重算',()=>{
 const s=fixture(),beforeState=structuredClone(s.doc.state);
 s.doc.state.family??={};s.doc.state.family.illnesses??={};s.doc.state.family.illnesses['ill-faith']={patient:A,status:'患病中'};
 const d=draft(s);advanceFaith(d,s.engine,{beforeState,id:'disease-day'});
 assert.equal(faithOf(s.engine,s.doc.state,A).value.doubt,true);
 const ev=s.doc.state.records['world_event:faith_calamity:ill-faith'];assert.equal(ev.visibility,'private');assert.deepEqual(ev.witnesses,[A]);
 const once=structuredClone(s.doc);advanceFaith(d,s.engine,{beforeState,id:'disease-day'});assert.deepEqual(s.doc,once);
});

test('有限显兆要求地点、时节、供品、持续虔信及真实集体；冷却到期及效果到期由原时钟处理',async()=>{
 const s=fixture();s.doc.state.minute=3*1440+540;
 for(const id of ['player',A,B]){
  const n=id==='player'?s.doc.state.player:s.doc.state.npcs[id];n.faith={deity:'deity_bank',temple:T,observedSince:0,lastBreach:-1};
 }
 const coin=s.doc.state.player.coins,resin=s.engine.quantity(draft(s),'player','item_resin');
 const before=structuredClone(s.doc);await assert.rejects(s.faith('rite',{choice:'bank_sign',workers:[A,B]}),/参与者同意/);assert.deepEqual(s.doc,before);
 const result=await s.faith('rite',{choice:'bank_sign',workers:[A,B],consent:true});assert.equal(result.response.applied,true);
 const omen=Object.values(s.doc.state.effects).find(r=>r.kind==='faith_omen');assert.equal(omen.location,SEAT);assert.equal(omen.expires-s.doc.state.minute,30);
 assert.equal(s.doc.state.player.coins,coin-2);assert.equal(s.engine.quantity(draft(s),'player','item_resin'),resin-1);
 assert.doesNotMatch(JSON.stringify(omen),/private|secret|truth|memory/);assert.match(omen.form,/不指认/);
 const again=await s.faith('rite',{choice:'bank_sign',workers:[A,B],consent:true});assert.equal(again.response.applied,false);
 assert.ok(!Object.values(s.doc.state.effects).some(r=>r.kind==='faith_omen'));
 s.doc.state.minute=11*1440+540;assert.equal((await s.faith('rite',{choice:'bank_sign',workers:[A,B],consent:true})).response.applied,true);
});

test('缺条件只是普通祭仪；虚构参与者、异地、欠供品和私密窥探不能换取神迹',async()=>{
 for(const missing of ['season','devotion','collective','breach']){
  const s=fixture();s.doc.state.minute=3*1440+540;
  for(const id of ['player',A,B]){const n=id==='player'?s.doc.state.player:s.doc.state.npcs[id];n.faith={deity:'deity_bank',temple:T,observedSince:missing==='devotion'?s.doc.state.minute:0,lastBreach:missing==='breach'?1:-1};}
  if(missing==='season')s.doc.state.minute=95*1440+540;
  const r=await s.faith('rite',{choice:'bank_sign',workers:missing==='collective'?[A]:[A,B],consent:true});assert.equal(r.response.applied,false,missing);
 }
 const s=fixture(),before=structuredClone(s.doc);
 await assert.rejects(s.faith('rite',{choice:'bank_sign',workers:['npc_missing'],consent:true}));assert.deepEqual(s.doc,before);
 s.doc.state.inventory.item_resin.quantity=0;const noResin=structuredClone(s.doc);
 await assert.rejects(s.faith('rite',{choice:'bank_sign'}),/供品不足/);assert.deepEqual(s.doc,noResin);
 s.doc.state.location='loc_hw';await assert.rejects(s.faith('rite',{choice:'bank_sign'}),/所在地/);
 await assert.rejects(s.faith('inspect'),/所在地/);
});

test('真实信众争夺启动T110/K6时钟，钱粮不足不伪造支出，争端升级为待受理诉请',()=>{
 const s=fixture();s.engine.rules.faith.competition=true;s.engine.rules.factionClock={version:1,clocks:faithConflictClocks(s.engine)};
 const r=faithConflictClocks(s.engine).find(r=>r.settlement==='loc_hw');assert.ok(r);
 let d=draft(s);initializeFactionClocks(d,s.engine,0,30*1440);
 assert.equal(s.doc.state.records[`faction-clock:${r.id}`],undefined,'无竞争事实不初始化');
 d.set(['state','records',r.triggerRecord],{category:'faith_competition',active:true,sourceEvent:'real-conversion'});
 initializeFactionClocks(d,s.engine,0,30*1440);
 const coins=groupAccountView(s.engine,s.doc.state,r.faction).coins;
 for(const at of [7,14,21].map(n=>n*1440))advanceFactionClocks(d,s.engine,at);
 assert.equal(s.doc.state.records[`faction-clock:${r.id}`].phase,3);
 const assets=groupAccountView(s.engine,s.doc.state,r.faction);assert.equal(assets.coins,coins);
 assert.equal(assets.disputes[`${r.rival}:faith`].status,'escalated');
 assert.ok(Object.values(s.doc.state.records).some(r=>r.category==='legal_claim'&&r.status==='待受理'));
 const once=structuredClone(s.doc);advanceFactionClocks(d,s.engine,21*1440);assert.deepEqual(s.doc,once);
});

test('寺观间实际改宗触发本地竞争，现任主持移交、空缺及礼仪资格保留边界',async()=>{
 const s=fixture();s.engine.rules.faith.competition=true;s.engine.rules.factionClock={version:1,clocks:faithConflictClocks(s.engine)};
 const previous=temples(s.engine).find(t=>t.profession==='profession_monk');
 s.doc.state.npcs[A].faith={temple:previous.id,deity:null,observedSince:0,lastBreach:-1};
 await s.faith('convert',{member:A,consent:true});
 const rule=faithConflictClocks(s.engine).find(r=>[r.faction,r.rival].includes(T)&&[r.faction,r.rival].includes(previous.id));
 assert.ok(rule);assert.equal(s.doc.state.records[rule.triggerRecord].active,true);
 const d=draft(s);initializeFactionClocks(d,s.engine,s.doc.state.minute,30*1440);
 assert.ok(s.doc.state.records[`faction-clock:${rule.id}`]);
 const initial=s.doc.state.records[`faction-clock:${rule.id}`].nextAt;
 for(let i=0;i<3;i++)advanceFactionClocks(d,s.engine,initial+i*7*1440);
 assert.equal(s.doc.state.records[`faction-clock:${rule.id}`].phase,3);
 s.doc.state.records[`organization:${T}`].leader=null;const before=structuredClone(s.doc);
 await assert.rejects(s.faith('rite',{choice:'bank_sign'}),/空缺/);assert.deepEqual(s.doc,before);
});

test('玩家可从寺观查看争议时钟，未启动只读，实际争执阶段沿原干预暂停',async()=>{
 const s=fixture();s.engine.rules.faith.competition=true;s.engine.rules.factionClock={version:1,clocks:faithConflictClocks(s.engine)};
 const rule=s.engine.rules.factionClock.clocks.find(r=>r.faction===T);assert.ok(rule);
 const list=await s.faith('inspect');assert.ok(list.conflicts.some(c=>c.clock===rule.id));
 const look=await s.run({operation:'faction_inspect',clock:rule.id});assert.equal(look.dormant,true);
 assert.equal(s.doc.state.records[`faction-clock:${rule.id}`],undefined);
 s.doc.state.records[rule.triggerRecord]={active:true};const d=draft(s);
 initializeFactionClocks(d,s.engine,s.doc.state.minute,8*1440);
 const at=s.doc.state.records[`faction-clock:${rule.id}`].nextAt;advanceFactionClocks(d,s.engine,at);s.doc.state.minute=at;
 await s.run({operation:'faction_intervene',clock:rule.id,choice:'mediate'});
 assert.equal(s.doc.state.records[`faction-clock:${rule.id}`].paused,true);
});

test('朝圣复用真实移动和NPC会面行程，不迁户籍；工具数及静态提示约束保留',async()=>{
 const s=fixture();s.doc.state.location='loc_bs';
 const oldHome=personView(s.engine,s.doc.state,A).household;
 const out=await s.faith('pilgrim');assert.equal(out.purpose,'朝圣');
 assert.equal(s.doc.state.location,SEAT);assert.ok(s.doc.state.minute>540);
 assert.deepEqual(personView(s.engine,s.doc.state,A).household,oldHome);
 const p=fixture();p.engine.byId.get(A).tier='full';const at=p.doc.state.minute;
 const booked=await p.faith('pilgrim',{member:A,consent:true,start:at+30,deadline:at+60});
 assert.equal(p.doc.state.obligations[booked.obligation.id].purpose,'pilgrimage');
 await p.run({minutes:90,activity:'等待'},{tool:'world_time'});
 assert.equal(p.doc.state.obligations[booked.obligation.id].status,'已完成');
 assert.equal(toolDefinitions().length,25);assert.equal(faithRules.rites.length,2);
});
