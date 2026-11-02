import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {convertGrade,gradeUnitsD,rewardRange,validateQuestSources,questGenerators,registerQuestGenerator} from '../server-plugin/quest-sources.mjs';
import {standing} from '../server-plugin/standing.mjs';
import {advanceRegistry} from '../server-plugin/advance-registry.mjs';
import {sceneCard} from '../server-plugin/scene-card.mjs';
import {npcRumors} from '../server-plugin/npc-rumors.mjs';
import {reconcile} from './helpers/ledger-audit.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),DAY=1440;
const board='loc_hw',owner='npc_hw_linsui',witness='npc_hw_ayan',clerk='npc_hw_chenbai';
function setup(mutate=()=>{}){
 const w=structuredClone(world);w.rules.questSources.wildlife=[];mutate(w);
 const engine=new WorldEngine(w),document=engine.initialFromLegacy(seed,'quest-sources-test');
 document.state.minute=540;document.state.location=board;
 for(const id of [owner,witness,clerk]){
  w.npcs.find(n=>n.id===id).schedule={default:[{start:0,end:1440,location:board,activity:'日常工作',services:['trade']}]};
  Object.assign(document.state.npcs[id],{location:board,activity:'日常工作',status:'正常'});
 }
 const run=async(c,tool,args,eventId)=>{const out=await engine.reduce(c,{tool,args,eventId});return {document:applyPatches(c,out.patches),result:out.result};};
 const wait=async(c,minutes,event='wait')=>(await run(c,'world_time',{minutes},event)).document;
 const midnight=c=>wait(c,DAY-c.state.minute%DAY,`wait-${c.state.minute}`);
 return {w,engine,document,run,wait,midnight};
}
const generated=c=>Object.values(c.state.quests).filter(q=>q.source);
// W8-E8 restocking transfers private money to the source settlement (sickle:
// 1 * base 10 * scarcity 2 = 20). Public purses belong in conservation totals.
const money=c=>c.state.player.coins+Object.values(c.state.npcs).reduce((n,x)=>n+(x.coins??0),0)+Object.values(c.state.settlements).reduce((n,s)=>n+(s.treasury??0),0)+Object.values(c.state.quests).reduce((n,q)=>n+q.escrow,0)+Object.values(c.state.records).filter(r=>r.category==='money_account').reduce((n,r)=>n+r.coins,0);

test('生成器登记：三种来源都以生成器登记，推进注册表在势力时钟之后跑',()=>{
 // U11 族群觉醒以第四个生成器登记，排在世界事件与效果表之间。
 assert.deepEqual(questGenerators().map(g=>g.id),['npc_needs','world_events','tribal_awakening','village_wildlife','effect_table']);
 assert.throws(()=>registerQuestGenerator({id:'npc_needs',order:1}),/重复/);
 const order=id=>advanceRegistry.find(s=>s.id===id).order;
 assert.ok(order('quest_sources')>order('faction_clock')&&order('quest_sources')>order('hazard_clock'));
});

test('NPC按短缺出任务：报酬从本人钱里托管，告示带来源，只有在场的人看见并能转告',async()=>{
 const {engine,document,midnight}=setup();document.state.buildings.bld_hw_qingdeng.condition=20;
 const next=await midnight(document),[q]=generated(next);
 const far=Object.keys(next.state.npcs).find(id=>next.state.npcs[id].location!==board);
 assert.equal(generated(next).length,1);
 assert.equal(q.publisher,owner);assert.equal(q.source.generator,'npc_needs');assert.equal(q.source.need,'repair');assert.equal(q.location,board);
 assert.deepEqual(q.objective,{type:'deliver',item:'item_wood',quantity:6,location:board});
 // K08 正午原生店成交18铜，午夜补回6面包×1+4燕饼×1.5=12铜；净入6后托管50。
 assert.equal(q.escrow,50);assert.equal(next.state.npcs[owner].coins,document.state.npcs[owner].coins+6-50);assert.equal(money(next),money(document));
 assert.match(q.sourceLabel,/林穗的私人求助/);
 const seen=next.state.npcs[witness].memoryStream.find(m=>m.id===`${q.id}:posted`);
 assert.ok(seen?.eventRumor&&seen.rumor.startsWith('rumor_event:'));assert.match(seen.content,/私人求助/);
 assert.ok(!(next.state.npcs[far].memoryStream??[]).some(m=>m.id===`${q.id}:posted`));
 assert.ok(npcRumors(engine,witness,next).some(r=>r.id===seen.rumor&&r.claim.includes('木料')),'看见告示的人能把它当传闻转告');
 assert.ok(!npcRumors(engine,far,next).some(r=>r.id===seen.rumor));
 assert.match(sceneCard(engine,next),/〔林穗的私人求助〕/);
 // 次日不重复出单；NPC冒险者离屏只接玩家告示，规则不变。
 const later=await midnight(await midnight(next));
 assert.equal(generated(later).length,1);assert.equal(later.state.quests[q.id].status,'公开');
});

test('出不起就不出：手头一半余钱不够等级下限时不发布、不扣钱',async()=>{
 const {document,midnight}=setup();document.state.buildings.bld_hw_qingdeng.condition=20;document.state.npcs[owner].coins=30;
 const next=await midnight(document);
 // 同一正午收入18−补货12=6；余钱36的一半18仍低于D级下限20，不扣任务钱。
 assert.equal(generated(next).length,0);assert.equal(next.state.npcs[owner].coins,36);
});

test('数量节流：每日上限、每人按灵智等级上限，守常者只为迫在眉睫的缺口出单',async()=>{
 const {document,midnight}=setup(),ids=['npc_hw_duanyan','npc_hw_wushuo','npc_hw_taozhi','npc_hw_luowei','npc_hw_sulan'];
 for(const [i,id] of ids.entries())document.state.buildings[`bld_test_${i}`]={owner:id,condition:20};
 document.state.buildings.bld_test_extra={owner:'npc_hw_duanyan',condition:10};
 const steady='npc_hw_meiling';document.state.npcs[steady].intelligence={level:1,growth:0};
 document.state.buildings.bld_test_lv1={owner:steady,condition:40};
 const day1=await midnight(document);
 assert.equal(generated(day1).length,3);
 assert.equal(new Set(generated(day1).map(q=>q.publisher)).size,3);
 const day2=await midnight(day1);
 const all=generated(day2);assert.equal(all.length,5);
 assert.equal(all.filter(q=>q.publisher==='npc_hw_duanyan').length,1);
 assert.ok(!all.some(q=>q.publisher===steady),'守常者不为缓和缺口出单');
 day2.state.buildings.bld_test_lv1.condition=20;
 const day3=await midnight(day2);assert.ok(generated(day3).some(q=>q.publisher===steady));
});

test('灾害事件任务：疫病求医、汛期修堤从公账托管，冬荒运粮动用后低于留底则不出，C级折10个D',async()=>{
 const {document,midnight,engine}=setup(w=>{w.rules.questSources.npcNeeds=[];});
 // K08预算：510 + 铁镰20 + 食品补货12 − 疫病150 − 修堤80 = 312。
 // 疫病后再拨饥荒200会降至192，低于留底300，故不能发布。
 document.state.settlements.loc_hw.treasury=510;
 Object.assign(document.state.records,{
  'hazard-famine:loc_hw':{category:'hazard_famine',settlement:board,since:540,until:540+60*DAY,sourceEvent:'hazard:famine:test'},
  'hazard-flood:loc_hw_dock':{category:'hazard_flood',location:'loc_hw_dock',since:540,until:540+5*DAY,soaked:[],sourceEvent:'hazard:flood:test'},
  'epidemic:test:1':{category:'epidemic',id:'epidemic:test:1',disease:'x',origin:board,since:540,status:'流行',settlements:[board],households:{},measures:[],sourceEvent:'hazard:epi:test'},
 });
 const before=document.state.settlements.loc_hw.treasury,next=await midnight(document),qs=generated(next);
 const epidemic=qs.find(q=>q.source.cause==='epidemic:test:1'),flood=qs.find(q=>q.source.cause==='hazard-flood:loc_hw_dock');
 assert.equal(epidemic.grade,'C');assert.equal(epidemic.unitsD,10);assert.equal(epidemic.publisher,clerk);assert.equal(epidemic.fundedBy.treasury,board);assert.match(epidemic.content,/药草/);
 assert.equal(flood.location,board,'受淹地点向上找到公告栏');assert.match(flood.content,/修堤/);assert.match(flood.sourceLabel,/汛情/);
 assert.ok(!qs.some(q=>q.source.cause==='hazard-famine:loc_hw'),'动用后低于公账留底则不出');
 assert.equal(next.state.records['shop:shop_hw_forge'].entries.find(e=>e.item==='item_sickle').paidCopper,20);
 // K08：铁镰20不变；正午售出的6面包、4燕饼在午夜补货，再入公库6+6=12。
 // Household-crafts law: ayan holds 4 flour and the household can bake it (pooled stock, home hearth), so the
 // buy-or-process comparison leaves him out of the bread queue. Noon then sells 4 breads (chenbai) + 4 flatbreads
 // (luowei) instead of 6 + 4: breads 4*1 + flatbreads 4 paid 6 = 10 returned, not 12.
 assert.ok(!Object.values(next.state.records).filter(r=>r.category==='customer_flow').flatMap(r=>r.visits).some(v=>v.npc==='npc_hw_ayan'&&v.outcome==='bought'&&v.item==='item_bread'));
 assert.deepEqual(next.state.records['shop:shop_hw_qingdeng'].entries.filter(e=>e.added).map(e=>[e.item,e.added,e.paidCopper]),[['item_bread',4,4],['item_oat_flatbread',4,6]]);
 assert.ok(next.state.settlements.loc_hw.treasury>=engine.rules.governance.authority.treasury.reserveCopper);
 for(const q of qs){const [lo,hi]=rewardRange(engine,q.grade);assert.ok(q.reward>=lo&&q.reward<=hi);}
 assert.equal(generated(await midnight(next)).length,qs.length,'同一事件不重复出单');
});

test('等级折算与报酬区间：1S=10A=100B=1000C=10000D；区间外的数据被拒绝；月度D单位额度节流',async()=>{
 const {engine}=setup();
 assert.equal(convertGrade(engine,1,'S','D'),10000);assert.equal(convertGrade(engine,1,'S','A'),10);assert.equal(convertGrade(engine,10,'C','B'),1);assert.equal(gradeUnitsD(engine,'B'),100);
 const bad=structuredClone(world);bad.rules.questSources.events[0].reward=99;
 assert.match(validateQuestSources(bad).join(),/规格区间/);
 const tooBig=structuredClone(world);tooBig.rules.questSources.npcNeeds[0].reward=101;
 assert.match(validateQuestSources(tooBig).join(),/规格区间/);
 assert.deepEqual(validateQuestSources(world),[]);
 const s=setup(w=>{w.rules.questSources.npcNeeds=[];w.rules.questSources.limits.monthlyUnitsDPerBoard=10;});
 Object.assign(s.document.state.records,{
  'hazard-famine:loc_hw':{category:'hazard_famine',settlement:board,since:540,until:540+60*DAY,sourceEvent:'f'},
  'hazard-flood:loc_hw_dock':{category:'hazard_flood',location:'loc_hw_dock',since:540,until:540+5*DAY,soaked:[],sourceEvent:'l'},
 });
 const qs=generated(await s.midnight(s.document));
 assert.equal(qs.length,1);assert.equal(qs[0].grade,'C');
});

test('过期没人接的任务撤下：人物托管退回本人，公账托管退回公账',async()=>{
 const {engine,document,midnight,wait}=setup();document.state.buildings.bld_hw_qingdeng.condition=20;
 document.state.records['hazard-flood:loc_hw_dock']={category:'hazard_flood',location:'loc_hw_dock',since:540,until:540+3*DAY,soaked:[],sourceEvent:'l'};
 const coins=document.state.npcs[owner].coins,treasury=document.state.settlements.loc_hw.treasury;
 const posted=await midnight(document),npcQuest=generated(posted).find(q=>q.publisher===owner),floodQuest=generated(posted).find(q=>q.source.generator==='world_events');
 assert.ok(npcQuest&&floodQuest);
 const done=await wait(posted,10*DAY,'expire');
 for(const q of [npcQuest,floodQuest]){const row=done.state.quests[q.id];assert.equal(row.status,'超期');assert.equal(row.escrow,0);assert.equal(row.refund,q.reward);}
 // Two weekly forge cycles (days 1 and 8) buy one sickle each, then the
 // ceiling of two stops replenishment: 2 * (10 * scarcity 2) = 40 received.
 assert.deepEqual(done.state.records['shop:shop_hw_forge'].entries.filter(e=>e.item==='item_sickle').map(e=>[e.day,e.added,e.paidCopper]),[[1,1,20],[8,1,20]]);
 // K15 hand calculation (K08 market bills still truncate the complete bill):
 // Meals consume milk/water and Hezhou's own provisions; retained physical
 // stock and repeat visits change. Quotes still use available supply S and
 // retained demand D. Other food shelves: 5 salt + 2 porridge + 2 curd + 9*4=45.
 // Add unretained bread/flatbread to get S for bread on days1..11:
 // 45,45,45,45,45,45,49,53,51,45,48. Day7 has four unsold flatbreads;
 // day8 also has four breads; day9 has 4+4 on shelf with two breads retained;
 // day10's two breads are retained; day11's four flatbreads retain one.
 // D starts at player2 + Ayan4 + Chenbai2 + Luowei(2+4)=14. Changes:
 // d2 +Taozhi4+Sulan6=24; d3 +Sulan2+Gucen4+Zheng4-Sulan2=32;
 // d4 +Shendu6=38; d5 +Duanyan4+Luqing4=46;
 // d6 +Luowei6-Luowei4+Meiling4=52; d7 +Xuling2+Meiling2=56;
 // d8 +Hezhou2-Hezhou meal2=56; d9 +Wushuo2=58;
 // d10 Duanyan's reserve falls by2; Hezhou/Yanzhe eat their purchases:56.
 // d11 after reduced public ration, physical retained shares total:
 // player2 + Linsui/Ayan4 + Chenbai2 + Xuling1 + Duanyan3 + Wushuo1
 // + Taozhi3 + Zheng3 + Luowei8 + Sulan6 + Gucen3 + Meiling5
 // + Luqing3 + Shendu6 = 50.
 // Base prices bread=2, flatbread=3; scarcity limits [.5,2]. Six breads
 // are wholesale: floor(2*integral[D/x] from S-6 to S). Day1 clamps at .5
 // =>6; days2..6 use 2*D*ln(45/39) with D=24,32,38,46,52:
 // floor(6.8688,9.1585,10.8757,13.1653,14.8825)=6,9,10,13,14.
 // d7:floor(112*ln(49/43))=14; d11:floor(100*ln(48/42))=13.
 // Small retail bills use floor(base*q*max(.5,D/S)). Flatbread d1..6:
 // floor(12*max(.5,D/51))=6,6,7,8,10,12; d10:floor(12*56/49)=13.
 // Bread d8/d9/d10:floor(4*56/53,4*58/51,8*56/45)=4,4,9.
 // q=min(daily6/4,ceiling6/4-current shelf); bread shelves d7..11:
 // 0,4,4,2,0 => q=6,2,2,4,6. Flatbread stays at ceiling4 on d7..9,
 // sells out on d9, refills4 on d10, and has no sale on d10.
 // The late shelves also include real labor-market restocking: on day8 Wu
 // brings two breads from Ayan, and on day9 Ayan brings two from Duanyan.
 // Thus day9 shelf=4+2-4+2=4; day10 shelf=4+2-6+2=2. These are
 // person-to-person transfers, distinct from the shop's local imports above.
 const innEntries=done.state.records['shop:shop_hw_qingdeng'].entries.filter(e=>e.added);
 assert.deepEqual(innEntries.map(e=>[e.day,e.item,e.added,e.paidCopper]),[
  [1,'item_bread',6,6],[1,'item_oat_flatbread',4,6],[2,'item_bread',6,6],[2,'item_oat_flatbread',4,6],
  [3,'item_bread',6,9],[3,'item_oat_flatbread',4,7],[4,'item_bread',6,10],[4,'item_oat_flatbread',4,8],
  [5,'item_bread',6,13],[5,'item_oat_flatbread',4,10],[6,'item_bread',6,14],[6,'item_oat_flatbread',4,12],
  [7,'item_bread',6,14],[8,'item_bread',2,4],[9,'item_bread',2,4],
  [10,'item_bread',4,9],[10,'item_oat_flatbread',4,13],[11,'item_bread',6,13]
 ]);
 assert.equal(done.state.settlements.loc_hw.treasury,treasury+40+164);
 const reposts=generated(done).filter(q=>q.publisher===owner&&q.id!==npcQuest.id&&['公开','进行中'].includes(q.status));
 const sales=Object.values(done.state.records).filter(r=>r.category==='customer_flow'&&r.keeper===owner).flatMap(r=>r.visits).reduce((n,v)=>n+(v.paid??0),0);
 // Daily sales:18+12+13+15+19+22+12+4+8+15+13=151.
 // Restock:12+12+16+18+23+26+14+4+4+22+13=164.
 assert.equal(sales,151);assert.equal(innEntries.reduce((n,e)=>n+e.paidCopper,0),164);
 const counter=Object.values(done.state.records).find(r=>r.category==='money_account'&&r.owner===owner&&r.purpose==='counter');
 // First-day18 enters the purse before the counter opens; subsequent sales
 // bring 151-18=133 to the counter. Two real hired restock shifts also pay
 // goods4+5 and wages ceil(30*12/480)+ceil(30*22/480)=1+2: total12.
 // Counter funding34 + sales133 - restock164 - wages3=0; the purse
 // separately pays the goods9. Total personal funding/spending is43.
 const hired=Object.values(done.state.records).filter(r=>r.kind==='workshop'&&r.owner===owner&&r.demandSource==='shop:shop_hw_qingdeng:item_bread');
 assert.deepEqual(hired.map(r=>[r.worker,r.produced,r.workedMinutes,r.paid,r.shifts[0].production.cost]),[['npc_hw_wushuo',2,12,1,4],[witness,2,22,2,5]]);
 assert.equal(counter.coins,0);
 assert.equal(done.state.npcs[owner].coins,coins+151-164-12-reposts.reduce((n,q)=>n+q.escrow,0));
 assert.deepEqual(reconcile(engine,done),{mismatches:[],lots:[],drift:[],audit:[]});
});

test('势力委托：时钟阶段经效果表出委托，势力公库托管；完成后改阶段并影响立场',async()=>{
 const f0=world.factions.find(f=>f.id==='faction_saltboat');
 const commission={kind:'quest_post',id:'stop_smuggling',grade:'C',reward:120,days:10,content:'{faction}委托：查清旧渡口的私货',objective:{type:'visit',location:board},
  onComplete:{clock:'test_plan',effect:'pause',standing:[{holder:'faction_saltboat',delta:8}]}};
 const {document,run,wait,engine}=setup(w=>{
  for(const n of w.npcs){delete n.tier;delete n.schedule;}
  for(const f of w.factions)if(f.clock?.stages){const {settlement,source,cycle,stages,contact,interventions,...plan}=f.clock;f.clock=plan;}
  const f=w.factions.find(f=>f.id==='faction_saltboat');f.resources.treasuryCopper=500;
  w.rules.factionClock={version:1,clocks:[{id:'test_plan',faction:f.id,settlement:board,source:'test',intervalDays:1,probability:1,
   stages:[{id:'post',name:'贴出委托',condition:{kind:'always'},effects:[commission]},{id:'act',name:'动手',condition:{kind:'always'},effect:{kind:'relation',target:'faction_riverhomes',delta:5}}]}]};
 });
 document.state.npcs[f0.leader]??={name:f0.leader,location:board,status:'正常',coins:0,hp:10,maxHp:10,activity:'登记',trust:0,developments:[]};
 const posted=await wait(document,DAY-540,'clock'),q=generated(posted)[0];
 assert.equal(q.source.generator,'effect_table');assert.equal(q.fundedBy.faction,'faction_saltboat');assert.equal(q.publisher,f0.leader);
 assert.match(q.sourceLabel,/委托/);assert.match(q.content,/查清旧渡口/);
 const assets=posted.state.records['faction-assets:faction_saltboat'];assert.equal(assets.coins,500-120);
 const phase=posted.state.records['faction-clock:test_plan'].phase,before=standing(engine,posted.state,'faction_saltboat','player');
 const taken=(await run(posted,'world_quest',{operation:'accept',quest:q.id},'take')).document;
 (taken.state.discoveries??={})[board]={minute:taken.state.minute,source:'亲历'};
 const done=await run(taken,'world_quest',{operation:'complete',quest:q.id},'finish');
 assert.equal(done.result.reward,120);
 const clock=done.document.state.records['faction-clock:test_plan'];assert.equal(clock.paused,true);assert.equal(clock.phase,phase);
 assert.equal(done.document.state.records[`${q.id}:outcome`].applied,true);
 assert.ok(standing(engine,done.document.state,'faction_saltboat','player')>before);
 const after=await wait(done.document,3*DAY,'paused');
 assert.equal(after.state.records['faction-clock:test_plan'].phase,phase,'被阻止的阶段不再推进');
});
