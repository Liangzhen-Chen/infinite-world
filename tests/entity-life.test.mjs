import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {recordEntityDeath,recordMilitaryDeath} from '../server-plugin/npc-life.mjs';
import {advanceProcedure} from '../server-plugin/transition.mjs';
import {personView,personSimulation,personConstraint,homeResidents,groupView,personHousehold} from '../server-plugin/entity-view.mjs';
import {npcAvailability,assertNpcService,advanceNpcSchedules} from '../server-plugin/npc-schedule.mjs';
import {npcServices,npcHousehold} from '../server-plugin/npc-state.mjs';
import {advanceNpcObligations} from '../server-plugin/npc-obligations.mjs';
import {deliverFugitive} from '../server-plugin/bounty.mjs';
import {homePermission,assertLocationAccess} from '../server-plugin/location-access.mjs';
import {advanceLaw} from '../server-plugin/law.mjs';
import {unfoldPopulationAt,profileBrief,rosterLifeState} from '../server-plugin/population.mjs';
import {npcPlanningContext} from '../server-plugin/npc-autonomy.mjs';
import {unfoldRemoteAt,remoteEngine} from '../server-plugin/remote-generation.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const A='npc_hw_zhongxiu',B='npc_hw_baihui',HOME=world.households.find(h=>h.members.includes(A)).homeLocation;
const ITEM=world.items[0].id,DAY=1440,YEAR=360*DAY;
function distributeEstate(d,e,death,minute){
 // 依 04 §4.4 遗产分配在阶段期限后
 advanceProcedure(d,e,death.estate.id,minute+4*DAY);
}
function draft(document){return {document,patches:[],get(...p){return p.reduce((o,k)=>o?.[k],this.document);},
 set(path,value){const patch={op:'set',path,value};this.document=applyPatches(this.document,[patch]);this.patches.push(patch);},
 remove(path){const patch={op:'delete',path};this.document=applyPatches(this.document,[patch]);this.patches.push(patch);},say(){}};}
function setup(){
 const w=structuredClone(world);for(const n of w.npcs){delete n.schedule;delete n.tier;}
 const a=w.npcs.find(n=>n.id===A);a.tier='full';a.schedule={default:[{start:0,end:1440,location:HOME,activity:'营业',services:['trade','teach']}]};
 const e=new WorldEngine(w),doc=e.createCharacter(seed,{},'entity-life');doc.state.minute=600;doc.state.location=HOME;
 Object.assign(doc.state.npcs[A],{location:HOME,coins:37,inventory:{[ITEM]:3}});doc.state.npcs[B].location=HOME;
 return {e,doc,d:draft(doc),w};
}
const profile=brief=>({personality:{traits:['细心','话少'],values:['做完手头活'],flaws:['容易担心']},
 voice:{register:'语速平稳',accent:'本地口音',habits:['先听完'],samples:['你先说，我听着。','这活我做惯了。']},
 background:`${brief.identity.name}住在本区，以${brief.identity.occupation}为生，和同户的人分担家务。`,
 currentConcern:'担心雨水耽误手上的活。',goals:['把手上的活做好'],fears:['家里有人生病'],knowledge:{unknown:['外乡的新消息']},
 relationships:brief.identity.household.map(h=>({with:h.id,relation:h.relation,note:'同住一户'})),visibleFeature:'袖口挽着'});

test('押到案者受同一法律约束：日程、赴约、携信和服务不能把他送回店铺，届满恢复',()=>{
 const {e,d}=setup(),court='bld_hw_council',minute=600,law=e.rules.law.codes.find(c=>c.court===court);
 const w={id:'legal_wanted:v2',subject:A,law:law.id,case:'legal_case:v2',scope:[law.id],status:'生效',bounty:0,pledge:{coins:0},silenced:[],history:[]};
 d.set(['state','records',w.case],{category:'legal_case',id:w.case,offender:A,status:'已报案'});
 d.set(['state','records',w.id],w);d.set(['state','player','companions'],[A]);
 d.set(['state','npcs',A,'cognitionTravel'],{to:HOME,arrive:601});
 deliverFugitive(d,e,w,'player',minute);
 const key=`legal_detention:${w.id}`,hold=d.get('state','records',key),end=hold.expires;
 assert.equal(personConstraint(e,d.get('state'),A).source,`state.records.${key}`);
 assert.equal(d.get('state','npcs',A,'cognitionTravel'),undefined);
 d.set(['state','obligations','v2_meet'],{id:'v2_meet',reservationVersion:1,type:'会面',promisor:A,promisee:B,location:HOME,start:610,deadline:630,departures:{[A]:600,[B]:600},status:'待履行',attendance:{[A]:0,[B]:0},togetherMinutes:0});
 advanceNpcObligations(d,e,minute,602,'hold');d.set(['state','minute'],602);
 assert.equal(d.get('state','npcs',A,'location'),court);assert.deepEqual(npcAvailability(e,d.get('state'),A),{activity:'依法拘留',services:[]});
 assert.deepEqual(npcServices(e,d.get('state'),A),[]);
 d.set(['state','location'],court);assert.throws(()=>assertNpcService(d,e,A,'trade',5),/拘留/);
 advanceLaw(d,end,e);d.set(['state','minute'],end);
 assert.equal(d.get('state','records',key,'status'),'已释放');assert.equal(personConstraint(e,d.get('state'),A),null);
 advanceNpcSchedules(d,e,end,end+DAY);d.set(['state','minute'],end+DAY);
 assert.equal(d.get('state','npcs',A,'location'),HOME);assert.deepEqual(npcAvailability(e,d.get('state'),A).services,['trade','teach']);
});

for(const cause of ['战斗身亡','法术致死','寿终','处决','战死'])test(`${cause}结算一次：人口、遗产、义务、组织空缺、宠物与契约保留守恒`,()=>{
 const {e,d}=setup(),s=d.get('state'),population=s.settlements.loc_hw.population,coins=s.npcs[B].coins;
 d.set(['state','obligations','v2_obl'],{id:'v2_obl',type:'付款',promisor:A,promisee:B,status:'待履行',deadline:900});
 const contract={id:'v2_contract',category:'contract',version:1,business:'v2_shop',kind:'hire',parties:['player',A],subject:ITEM,quantity:1,deadline:900,cost:11,escrow:11,paid:0,fulfilled:0,status:'待履行',performance:[],breaches:[],signedTerms:{parties:['player',A],subject:ITEM,quantity:1,deadline:900,cost:11,kind:'hire'}};
 d.set(['state','records',contract.id],contract);const playerCoins=d.get('state','player','coins');
 d.set(['state','records','v2_debt'],{category:'debt',debtor:A,creditor:B,amount:12,paid:2,status:'待偿还'});
 const debt=structuredClone(d.get('state','records','v2_debt'));
 d.set(['state','records','organization:v2_org'],{category:'organization',id:'v2_org',source:'created',name:'会',kind:'行会',members:{[A]:{position:'会长'}},leader:A});
 d.set(['state','creatures','monster_v2_pet'],{hp:12,status:'正常',owner:A,location:HOME});
 const initialDeath=cause==='战死'?recordMilitaryDeath(d,e,A,600):recordEntityDeath(d,e,A,600,cause);
 distributeEstate(d,e,initialDeath,600);const death=d.get('state','family','deaths',initialDeath.id);
 assert.equal(death.estate.heir,B);assert.equal(d.get('state','npcs',B,'coins'),coins+37);assert.equal(d.get('state','npcs',A,'coins'),0);
 assert.equal(e.quantity(d,B,ITEM),3);assert.equal(e.quantity(d,A,ITEM),0);assert.equal(d.get('state','settlements','loc_hw','population'),population-1);
 assert.equal(d.get('state','obligations','v2_obl','status'),'取消');assert.equal(groupView(e,d.get('state'),'v2_org').leader.value,null);
 assert.equal(d.get('state','creatures','monster_v2_pet','owner'),B);
 assert.equal(d.get('state','records',contract.id,'status'),'已取消');assert.deepEqual(d.get('state','records',contract.id,'signedTerms'),contract.signedTerms);
 assert.equal(d.get('state','player','coins'),playerCoins+11);assert.deepEqual(d.get('state','records','v2_debt'),debt);
 const frozen=structuredClone(d.document),patches=d.patches.length;
 assert.deepEqual(recordEntityDeath(d,e,A,900,'重复死因'),death);assert.equal(d.patches.length,patches);assert.deepEqual(d.document,frozen);
});

test('实际交锋与伤害法术调用共同死亡入口，居民首领别名保持同一身体',async()=>{
 const {w,doc}=setup(),light=w.spells[0];w.skills.push({id:'skill_v2_damage',name:'伤害',attribute:'精神',profession:null});
 w.spells.push({...light,id:'spell_v2_damage',name:'试验焰矢',skill:'skill_v2_damage',mp:2,duration:0,materials:[],effectSpec:{kind:'damage',power:100}});
 const e=new WorldEngine(w);doc.state.spells.spell_v2_damage={source:{type:'fixture'}};doc.state.skills.skill_v2_damage={proficiency:100,daily:{},breakthroughs:[]};
 doc.state.npcs[A].hp=1;doc.state.npcs[A].maxHp=10;doc.state.player.hp=5000;doc.state.player.maxHp=5000;
 for(const [tool,args,cause] of [['world_combat',{target:A},'战斗身亡'],['world_cast',{spell:'spell_v2_damage',target:A},'法术致死']]){
  let result;
  for(let i=0;i<30;i++){const out=await e.reduce(doc,{tool,args,eventId:`${tool}_${i}`});const next=applyPatches(doc,out.patches);if(next.state.npcs[A].status==='死亡'){result=next;break;}}
  assert.ok(result,tool);assert.equal(Object.values(result.state.family.deaths).find(r=>r.person===A)?.cause,cause);assert.equal(result.state.npcs[A].coins,0);
 }
 const boss=w.bosses.find(b=>b.actor);assert.ok(boss);const d=draft(e.createCharacter(seed,{},'alias'));
 recordEntityDeath(d,e,boss.id,600,'处决');assert.equal(d.get('state','npcs',boss.actor,'status'),'死亡');assert.equal(d.get('state','creatures',boss.id),undefined);
 const before=structuredClone(d.document);recordEntityDeath(d,e,boss.actor,700,'战死');assert.deepEqual(d.document,before);
});

test('迁入住户可邀请，迁出者的旧宅许可失效；产权覆盖与成年年龄即时读取',()=>{
 const {e,d}=setup(),guest='npc_hw_duanhe',old=npcHousehold(e,d.get('state'),guest),house=npcHousehold(e,d.get('state'),A),place=e.byId.get(HOME);
 assert.equal(place.access.mode,'private');
 d.set(['state','family','households',old.id],{left:[guest]});d.set(['state','family','households',house.id],{members:[guest]});
 d.set(['state','npcs',guest,'location'],HOME);d.set(['state','npcs',guest,'activity'],'闲坐');
 // Authored minor flag stays historical; actual calendar age grants adulthood.
 const local=e.byId.get(guest),changed={...local,tier:'full',age:17,birth:undefined};const s=Object.create(e);s.byId=new Map(e.byId);s.byId.set(guest,changed);
 d.set(['state','minute'],0);
 const args={operation:'grant_access',promisor:guest,location:HOME,content:'进屋拜访',minutes:60};
 assert.throws(()=>homePermission(d,s,args,'minor'),/成年/);
 d.set(['state','minute'],YEAR);assert.equal(personView(s,d.get('state'),guest).age.value,18);
 const permit=homePermission(d,s,args,'adult');assert.ok(homeResidents(s,d.get('state'),HOME).value.includes(guest));
 assertLocationAccess(d,s,HOME,{authorization:permit.authorization});
 d.set(['state','family','households',house.id],{left:[guest],members:[]});d.set(['state','family','households',old.id],{members:[guest],left:[]});
 assert.throws(()=>assertLocationAccess(d,s,HOME,{authorization:permit.authorization}),/有效许可/);
 d.set(['state','buildings',HOME],{owner:guest});
 assert.ok(homeResidents(s,d.get('state'),HOME).value.includes(guest));
 homePermission(d,s,args,'owner');assert.equal(s.byId.get(guest).age,17,'不改目录年龄');
});

test('名册先继承后补档保留完整 actor；full 状态立即获得成长与规划模拟资格',async()=>{
 const {e,d}=setup();unfoldPopulationAt(d,e,'loc_bs_hebu');
 const people=Object.values(d.get('state','created')).filter(p=>p.generated==='population'&&p.age>=18),person=people.sort((a,b)=>a.id.localeCompare(b.id))[0];
 const session=e.scoped(d.document),row=rosterLifeState(session,d.get('state'),person.id,600,'家事');assert.ok(row);
 d.set(['state','npcs',person.id],{...row,coins:5,trust:9,caring:{patient:B,location:HOME},medical:{bloodMl:5000,lostBloodMl:0,pain:2,wounds:[],symptoms:[]},skills:{skill_mining:20}});
 const donor=e.world.npcs.find(n=>!(n.relationships??[]).some(r=>['配偶','子女','女儿','儿子'].includes(r.type))&&n.id!==person.id),prior=npcHousehold(session,d.get('state'),donor.id);
 if(prior)d.set(['state','family','households',prior.id],{left:[donor.id]});
 d.set(['state','family','households',person.householdId],{members:[donor.id]});
 d.set(['state','npcs',donor.id,'coins'],19);d.set(['state','npcs',donor.id,'inventory'],{[ITEM]:2});
 const initialDeath=recordEntityDeath(d,session,donor.id,600,'战死');distributeEstate(d,session,initialDeath,600);
 const death=d.get('state','family','deaths',initialDeath.id);assert.equal(death.estate.heir,person.id);
 assert.equal(personHousehold(session,d.get('state'),person.id).value.id,person.householdId);
 const actor=structuredClone(d.get('state','npcs',person.id));assert.equal(actor.coins,24);assert.equal(personSimulation(session,d.get('state'),person.id).value,false);
 const out=await e.reduce(d.document,{type:'population_profile',person:person.id,profile:profile(profileBrief(d.document,person.id))});
 const accepted=applyPatches(d.document,out.patches),full=e.scoped(accepted);
 assert.deepEqual(accepted.state.npcs[person.id],actor);assert.equal(accepted.state.created[person.id].tier,'roster');assert.equal(personSimulation(full,accepted.state,person.id).value,true);
 // Rank the newly complete resident into the finite planning context.
 accepted.state.npcs[person.id].trust=1000;
 assert.ok(npcPlanningContext(full,accepted).people.some(p=>p.id===person.id));
 accepted.state.location=accepted.state.npcs[person.id].location;accepted.state.player.companions=[person.id];
 delete accepted.state.npcs[person.id].caring;
 accepted.state.skills.skill_life_6_core={proficiency:900,grade:'中级1等',breakthroughs:[],daily:{}};
 accepted.state.professions.life=['profession_life_6'];
 const learned=await e.reduce(accepted,{tool:'world_learn',args:{entity:'skill_life_6_core',source:'player',student:person.id},eventId:'v2_profile_lesson'});
 assert.ok(learned.result.gained>0);assert.ok(applyPatches(accepted,learned.patches).state.npcs[person.id].skills.skill_life_6_core>0);
});

test('非人物个体死亡同样结算一次，并清除有效宠物与骑乘关系',()=>{
 const {e,d}=setup(),id='monster_v2_pet';
 d.set(['state','creatures',id],{id,hp:12,maxHp:12,status:'正常',owner:'player',location:HOME});
 d.set(['state','pets',id],{petFormat:1,status:'活跃',following:true});d.set(['state','player','mount'],id);
 const population=d.get('state','settlements','loc_hw','population'),death=recordEntityDeath(d,e,id,600,'法术致死');
 assert.equal(d.get('state','creatures',id,'hp'),0);assert.equal(d.get('state','creatures',id,'owner'),null);
 assert.equal(d.get('state','pets',id,'status'),'死亡');assert.equal(d.get('state','player','mount'),undefined);
 assert.equal(d.get('state','settlements','loc_hw','population'),population);
 const before=structuredClone(d.document);assert.deepEqual(recordEntityDeath(d,e,id,900,'重放'),death);assert.deepEqual(d.document,before);
});

test('患病者被杀保留实际死因，疾病中止并释放照护者，不记为病故',()=>{
 const {e,d}=setup(),id='v2_illness';
 d.set(['state','family','illnesses',id],{id,patient:A,status:'患病中',caregivers:[B]});
 d.set(['state','npcs',A,'status'],'患病');d.set(['state','npcs',B,'caring'],{patient:A,illness:id,location:HOME});
 const death=recordEntityDeath(d,e,A,600,'法术致死');assert.equal(death.cause,'法术致死');
 assert.equal(d.get('state','family','illnesses',id,'status'),'中止');assert.equal(d.get('state','npcs',B,'caring'),undefined);
});

test('远方名册补档同样保留 actor 并按 full 状态参加模拟',async()=>{
 const {e,d}=setup();assert.ok(unfoldRemoteAt(d,e,'loc_far_duanqi'));
 const overlay=remoteEngine(e,d.document,w=>new WorldEngine(w)),person=[...overlay.world.npcs,...overlay.world.residents].find(p=>p.generated==='remote'&&p.age>=18&&!p.keyPerson);assert.ok(person);
 d.set(['state','npcs',person.id],{id:person.id,coins:73,inventory:{[ITEM]:2},location:person.location,relationships:{},life:{kind:'roster'},residence:{settlement:person.settlement,home:person.location}});
 const actor=structuredClone(d.get('state','npcs',person.id));
 const brief={identity:{...person,household:(person.kin??[]).map(k=>({...k,id:k.with}))}},out=await e.reduce(d.document,{type:'population_profile',person:person.id,profile:profile(brief)});
 const accepted=applyPatches(d.document,out.patches),current=remoteEngine(e,accepted,w=>new WorldEngine(w));
 assert.deepEqual(accepted.state.npcs[person.id],actor);assert.equal(personSimulation(current,accepted.state,person.id).value,true);
});
