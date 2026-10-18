import {personOffices} from '../server-plugin/entity-view.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches,digest} from '../server-plugin/storage.mjs';
import {questPublishingRights} from '../server-plugin/quest-board.mjs';
import {standing} from '../server-plugin/standing.mjs';
import {adminLevel,marketFactor,promotionConditions} from '../server-plugin/promotion.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),DAY=1440;
const village='loc_bs_yupo',authority=world.rules.governance.authority,charter=authority.superiors.auth_bs_office_charter;
const N=world.rules.governance.notables,P=world.rules.governance.promotion;
const clerk=world.npcs.find(n=>n.workplace?.location===charter.seat&&charter.registrars.occupations.includes(n.occupation)).id;
const head=world.settlementProfiles.find(p=>p.id===village).details.governance.head;
const academy='faction_stonethread',noble='faction_thresholdhouse';

function setup(){
 const w=structuredClone(world);for(const n of w.npcs)delete n.schedule;
 const engine=new WorldEngine(w),doc=engine.createCharacter(seed,{},'notables-test');
 doc.state.location=charter.seat;doc.state.minute=540;doc.state.player.coins=1000;
 Object.assign(doc.state.npcs[clerk],{location:charter.seat,activity:'公署递件'});
 const run=async(c,tool,args,eventId)=>{const out=await engine.reduce(c,{tool,args,eventId});return {document:applyPatches(c,out.patches),result:out.result};};
 const settle=(c,operation,extra={},event=operation)=>run(c,'world_settlement',{operation,settlement:village,...extra},event);
 const wait=(c,days,event='wait')=>{c=structuredClone(c);c.state.location='loc_bs';return run(c,'world_time',{minutes:days*DAY},event).then(r=>r.document);};
 const atOffice=c=>{c=structuredClone(c);c.state.location=charter.seat;c.state.minute=Math.floor(c.state.minute/DAY)*DAY+540+DAY;Object.assign(c.state.npcs[clerk],{location:charter.seat,activity:'公署递件'});return c;};
 return {engine,doc,run,settle,wait,atOffice};
}
const like=(c,holder,value)=>{c.state.records[`standing:${holder}:player`]={category:'standing',holder,target:'player',value,history:[]};};
const fame=(c,f,notoriety=0)=>{const id=`reputation:${digest(['player','settlement',village]).slice(0,24)}`;
 c.state.records[id]={category:'reputation',subject:'player',scope:'settlement',target:village,reputation:0,fame:f,notoriety,deltas:[]};};
const books=c=>{for(const i of [1,2])c.state.works[`work_b${i}`]={id:`work_b${i}`,kind:'manuscript',author:'player',title:`书${i}`,editions:[{edition:1}]};};
const quest=(extra={})=>({operation:'publish',publisher:'player',personal:false,grade:'D',reward:30,content:'抄一份族谱',objective:{type:'visit',location:'loc_bs'},...extra});

async function recognised(s){
 const c=structuredClone(s.doc);c.state.works??={};books(c);fame(c,N.minFame+1);like(c,academy,N.recommenders.organizationStanding);
 const filed=await s.settle(c,'notable_petition',{sponsor:academy},'np');
 return {filed,doc:await s.wait(filed.document,N.registry.decisionDays,'np-wait')};
}

test('名士认定：须在公署转呈、有学院或行会等举荐，成就与名望够数才由典籍署认定',async()=>{
 const s=setup();
 await assert.rejects(s.settle(s.doc,'notable_petition',{sponsor:academy}),/不肯举荐/);
 await assert.rejects(s.settle(s.doc,'notable_petition',{sponsor:'faction_lanternmerc'}),/不是学院或行会/);
 const away=structuredClone(s.doc);like(away,academy,30);away.state.location=village;
 await assert.rejects(s.settle(away,'notable_petition',{sponsor:academy}),/公署前厅/);
 // Recommended but without works or fame: filed, then refused on the record.
 const bare=structuredClone(s.doc);like(bare,academy,30);
 let c=(await s.settle(bare,'notable_petition',{sponsor:academy},'np')).document;
 c=await s.wait(c,N.registry.decisionDays);
 const refused=c.state.records['notable_petition:np'];
 assert.equal(refused.status,'未获认定');assert.match(refused.reasons.join(),/成就不够数/);assert.match(refused.reasons.join(),/名望/);
 assert.equal(c.state.records['notable:player'],undefined);
 // A village's original headman of good regard is also a valid recommender.
 const byHead=structuredClone(s.doc);like(byHead,head,N.recommenders.personStanding);
 assert.equal((await s.settle(byHead,'notable_petition',{sponsor:head},'nh')).document.state.records['notable_petition:nh'].attached.recommendation.kind,'person');
 const {doc}=await recognised(s),n=doc.state.records['notable:player'];
 assert.equal(n.status,'在册');assert.deepEqual(Object.keys(n.achievements),['学术']);assert.equal(n.recommendation.by,academy);
 assert.equal(doc.state.records['notable_petition:np'].status,'已认定');
});

test('名士权利：可与爵位并持；只收名士的学院可入、可觐见贵族、按名士额度发文化委托',async()=>{
 const s=setup();
 // Before recognition: the academy refuses, and no audience.
 await assert.rejects(s.run(s.doc,'world_settlement',{operation:'org_join',org:academy},'join0'),/只收名士/);
 const capital=structuredClone(s.doc);capital.state.location='loc_capital';
 await assert.rejects(s.settle(capital,'notable_audience',{sponsor:noble}),/名士身份或爵位/);
 let {doc}=await recognised(s);
 // A title held alongside (准爵 three-rank quota 2).
 doc=structuredClone(doc);doc.state.records['title:player']={category:'title',id:'title:player',holder:'player',title:'准爵',rank:'三等',status:'受封',fief:null,levy:{men:1,days:10,due:doc.state.minute+300*DAY,served:0},nextIncome:doc.state.minute+30*DAY,breaches:0};
 assert.equal(questPublishingRights(s.engine,doc.state).limitD,2);
 assert.equal(questPublishingRights(s.engine,doc.state,'player',{cultural:true}).limitD,N.rights.culturalQuotaD);
 doc.state.location='loc_bs';
 const posted=await s.run(doc,'world_quest',quest({cultural:true}),'q1');
 assert.equal(posted.document.state.quests[posted.result.quest].cultural,true);
 const month=questPublishingRights(s.engine,posted.document.state).month;
 assert.equal(posted.document.state.questQuota[`${month}_player`],1);
 // Joining the academy now goes to its own deliberation instead of being refused.
 const joined=await s.run(doc,'world_settlement',{operation:'org_join',org:academy},'join1');
 assert.ok(joined.result.joined||joined.result.proposal);
 const at=structuredClone(doc);at.state.location='loc_capital';
 const before=standing(s.engine,at.state,noble,'player'),met=await s.settle(at,'notable_audience',{sponsor:noble},'aud');
 assert.equal(met.document.state.records['notable_audience:aud'].house,noble);
 assert.equal(standing(s.engine,met.document.state,noble,'player'),before+N.rights.audienceStanding);
 assert.equal(met.document.state.minute,at.state.minute+N.rights.audienceMinutes);
 assert.equal(met.document.state.records['title:player'].status,'受封');
 await assert.rejects(s.settle(doc,'notable_audience',{sponsor:noble},'aud2'),/所在地/);
});

test('名士除名：复核时名望跌破门槛、受认定后谎言被揭穿或有犯罪裁定即除名，文化额度随之取消',async()=>{
 const s=setup(),{doc:recognisedDoc}=await recognised(s),since=recognisedDoc.state.records['notable:player'].since;
 assert.equal(recognisedDoc.state.records['notable:player'].nextReview,since+N.registry.reviewEveryDays*DAY);
 // Bring the next review close so each case is read on its own review day.
 const doc=structuredClone(recognisedDoc);doc.state.records['notable:player'].nextReview=doc.state.minute+DAY;
 // Still fine at the first review.
 let kept=await s.wait(doc,2,'r0');
 assert.equal(kept.state.records['notable:player'].status,'在册');assert.equal(kept.state.records['notable:player'].reviews.length,1);
 const cases={
  名望:c=>fame(c,N.minFame+1,N.minFame),
  谎言:c=>{c.state.records['lie:x']={category:'lie',liar:'player',key:'x',truth:'书是抄的',tellings:[{to:'npc_yp_shile',claim:'书是我写的'}],exposures:{npc_yp_shile:{route:'矛盾证据',minute:since+DAY}},status:'已揭穿'};},
  犯罪裁定:c=>{c.state.records['legal_case:x']={category:'legal_case',id:'legal_case:x',offender:'player',offense:'theft',judgment:{penalty:'罚款'},minute:since};},
 };
 for(const [why,make]of Object.entries(cases)){
  const c=structuredClone(doc);make(c);
  const out=await s.wait(c,2,`r-${why}`),n=out.state.records['notable:player'];
  assert.equal(n.status,'已除名',why);assert.match(n.reason,new RegExp(why));
  assert.equal(questPublishingRights(s.engine,out.state,'player',{cultural:true}).limitD,0);
 }
 // A lie exposed before recognition is not a new scandal.
 const old=structuredClone(doc);old.state.records['lie:y']={category:'lie',liar:'player',key:'y',truth:'旧事',tellings:[],exposures:{npc_yp_shile:{minute:since-DAY}},status:'已揭穿'};
  assert.equal((await s.wait(old,2,'r-old')).state.records['notable:player'].status,'在册');
});

// A sitting player head of the village (the T124 office record).
const headOffice=c=>{c.state.records[`governance_office:${village}:office_village_head:player`]={category:'governance_office',id:`governance_office:${village}:office_village_head:player`,holder:'player',settlement:village,office:'office_village_head',name:'村长',status:'在任',since:c.state.minute-100*DAY,until:c.state.minute+260*DAY,nextReview:c.state.minute+400*DAY,monthlyQuotaD:10,monthlyBudgetCopper:2000,taxBps:{min:0,max:800},powers:['public_project','quest_publish','housing','tax','steward'],appointedBy:'白石镇公署'};};
// Facts that make the village qualify: people, built houses and facilities, a running shop.
const grow=c=>{
 const q=P.steps[0].requires;c.state.settlements[village].population=q.population+20;
 c.state.created??={};
 for(let i=0;i<q.housing-30;i++)c.state.created[`bld_house_h${i}`]={id:`bld_house_h${i}`,type:'bld',scope:village,parent:'loc_yp_path',owner:'player',purpose:'私宅'};
 for(let i=0;i<q.facilities;i++)c.state.created[`bld_built_f${i}`]={id:`bld_built_f${i}`,type:'bld',name:['集市','驿站'][i],scope:village,parent:'loc_yp_path',owner:village,purpose:'公共设施'};
 c.state.records['business:x']={id:'business:x',category:'business',owner:'player',location:'loc_yp_path',status:'营业'};
};

test('聚落升格：条件有来源、在公署由在任村长递件，版籍署审定；升格后官职、税率、额度与集市随之改变',async()=>{
 const s=setup();
 assert.equal(adminLevel(s.engine,s.doc.state,village).level,'村');assert.equal(adminLevel(s.engine,s.doc.state,'loc_bs').level,'镇');
 await assert.rejects(s.settle(s.doc,'promotion_petition'),/在任村长/);
 const start=structuredClone(s.doc);headOffice(start);
 const inspect=await s.settle(start,'promotion_inspect');
 assert.equal(inspect.result.conditions.ok,false);assert.match(inspect.result.conditions.reasons.join(),/人口.*住房.*产业.*公共设施/);
 await assert.rejects(s.settle(start,'promotion_petition',{},'pp0'),/条件未齐/);
 grow(start);
 const ready=promotionConditions(s.engine,start.state,village);assert.equal(ready.ok,true,ready.reasons.join());
 // Disorder blocks it: too many recent cases.
 const unruly=structuredClone(start);for(let i=0;i<=P.steps[0].requires.maxCases;i++)unruly.state.records[`legal_case:u${i}`]={category:'legal_case',id:`legal_case:u${i}`,settlement:village,location:'loc_yp_path',minute:unruly.state.minute-DAY,offender:'npc_yp_shile'};
 assert.match(promotionConditions(s.engine,unruly.state,village).reasons.join(),/立案/);
 const filed=await s.settle(start,'promotion_petition',{},'pp');
 const p=filed.document.state.records[`promotion_petition:${village}:pp`];
 assert.equal(p.status,'待审定');assert.equal(p.applicant,'player');assert.equal(p.due,start.state.minute+P.approver.decisionDays*DAY);
 await assert.rejects(s.settle(filed.document,'promotion_petition',{},'pp2'),/待审定/);
 assert.equal(questPublishingRights(s.engine,filed.document.state).limitD,10);
 const c=await s.wait(filed.document,P.approver.decisionDays);
 assert.equal(c.state.records[`promotion_petition:${village}:pp`].status,'已批准',JSON.stringify(c.state.records[`promotion_petition:${village}:pp`].reasons));
 const rank=adminLevel(s.engine,c.state,village);assert.equal(rank.level,'镇');assert.equal(rank.superior,P.jurisdiction.loc_bs.superior);
 const office=personOffices(s.engine,c.state,'player',{settlement:village})[0].value;
 assert.equal(office.name,'镇长');assert.equal(office.monthlyQuotaD,world.rules.quests.monthlyQuotaD.townHead);
 assert.equal(office.monthlyBudgetCopper,5000);assert.deepEqual(office.taxBps,{min:0,max:1000});
 assert.equal(questPublishingRights(s.engine,c.state).limitD,world.rules.quests.monthlyQuotaD.townHead);
 assert.equal(marketFactor(s.engine,c.state,village),2);assert.equal(marketFactor(s.engine,c.state,'loc_bs_weiting'),1);
});

test('升格审批：五比一满额或审定时条件已不齐则不批',async()=>{
 const s=setup(),start=structuredClone(s.doc);headOffice(start);grow(start);
 const filed=(await s.settle(start,'promotion_petition',{},'pp')).document;
 const full=structuredClone(filed);
 for(const i of [1,2,3,4])full.state.records[`settlement_rank:loc_t${i}`]={category:'settlement_rank',id:`settlement_rank:loc_t${i}`,settlement:`loc_t${i}`,level:'镇',superior:P.jurisdiction.loc_bs.superior,since:0};
 let c=await s.wait(full,P.approver.decisionDays);
 let p=c.state.records[`promotion_petition:${village}:pp`];
 assert.equal(p.status,'未获批准');assert.match(p.reasons.join(),/五比一/);assert.equal(adminLevel(s.engine,c.state,village).level,'村');
 const shrunk=structuredClone(filed);shrunk.state.settlements[village].population=50;
 c=await s.wait(shrunk,P.approver.decisionDays);p=c.state.records[`promotion_petition:${village}:pp`];
 assert.equal(p.status,'未获批准');assert.match(p.reasons.join(),/人口/);
 assert.equal(c.state.records[`governance_office:${village}:office_village_head:player`].monthlyQuotaD,10);
});

test('离屏升格：版籍署按周期查看，条件齐备时原头人递件并审定，玩家任村长时只通知本人',async()=>{
 const s=setup(),npcLed=structuredClone(s.doc);grow(npcLed);
 let c=await s.wait(await s.wait(npcLed,P.checkEveryDays,'cycle'),1,'cycle1');
 const filed=Object.values(c.state.records).find(r=>r.category==='promotion_petition'&&r.settlement===village);
 assert.equal(filed?.applicant,head);assert.equal(filed.status,'待审定');
 assert.equal(Object.values(c.state.records).filter(r=>r.category==='promotion_petition').length,1,'其他村条件不齐不递件');
 c=await s.wait(c,P.approver.decisionDays,'cycle2');
 assert.equal(c.state.records[filed.id].status,'已批准');assert.equal(adminLevel(s.engine,c.state,village).level,'镇');
 const led=structuredClone(s.doc);headOffice(led);grow(led);
 const told=await s.wait(await s.wait(led,P.checkEveryDays,'cycle'),1,'cycle1');
 assert.ok(Object.values(told.state.records).some(r=>r.category==='promotion_notice'&&r.settlement===village));
 assert.equal(Object.values(told.state.records).some(r=>r.category==='promotion_petition'),false);
});

test('升格后的集市：有升格记录的聚落店铺补货量与货架上限按来源倍数放大，未升格的不变',async()=>{
 const s=setup(),entries=c=>(c.state.records['shop:shop_bs_yanzhe']?.entries??[]).filter(e=>e.item==='item_clay_cup');
 const plain=await s.wait(s.doc,1,'d1');
 const promoted=structuredClone(s.doc);promoted.state.records['settlement_rank:loc_bs']={category:'settlement_rank',id:'settlement_rank:loc_bs',settlement:'loc_bs',level:'镇',superior:P.jurisdiction.loc_bs.superior,since:0};
 const market=await s.wait(promoted,1,'d1');
 const base=entries(plain).reduce((n,e)=>n+e.added,0),more=entries(market).reduce((n,e)=>n+e.added,0);
 const row=s.engine.rules.economy.shops.stores.find(x=>x.id==='shop_bs_yanzhe')?.restock.find(r=>r.item==='item_clay_cup')??{amount:3};
 assert.ok(more>base,`集市补货${more}应多于平日${base}`);assert.ok(more<=row.amount*P.steps[0].effects.market.restockFactor);
});
