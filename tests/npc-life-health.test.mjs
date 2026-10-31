import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {validateNpcLifeRules,npcIllness,npcAgeAt} from '../server-plugin/npc-life.mjs';
import {npcAvailability} from '../server-plugin/npc-schedule.mjs';

const source=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const DAY=1440,start=357*DAY+600,firstNight=358*DAY;
// house_hw_20: the elder and two adult housemates.
const elder='npc_hw_zhongxiu',carer='npc_hw_baihui',other='npc_hw_jiaoyou',friend='npc_hw_hezhou',stranger='npc_yp_luxia',comatose='npc_yp_zhangyi';
const house='house_hw_20',home=source.households.find(h=>h.id===house).homeLocation;
const day=(location,activity='闲坐',services=[])=>({default:[{start:0,end:1440,location,activity,services}]});
const work={default:[{start:0,end:480,location:home,activity:'睡眠',services:[]},{start:480,end:1080,location:'loc_hw_fields',activity:'下田',services:['trade']},{start:1080,end:1440,location:home,activity:'歇息',services:[]}]};
// K15: an inheritance anchor must survive ordinary meals. Use an existing
// non-food object; food bought before death is reconciled with actual eating.
const item=source.items.find(i=>!i.nutrition).id,elderAge=npcAgeAt(new WorldEngine(source),{npcs:{}},elder,firstNight);

// Only people of the elder's age (72 that winter) fall ill in these fixtures, always gravely; the real
// parameters are checked separately.
function fixture({fatality=0,graveDays=[5,5],health={}}={}){
 const world=structuredClone(source),find=id=>world.npcs.find(n=>n.id===id),h=world.rules.npcLife.health;
 world.rules.npcLife.health={...h,bands:[{fromAge:0,illnessPerYear:0,graveShare:0,suddenDeathPerYear:0},{fromAge:elderAge,illnessPerYear:360,graveShare:1,suddenDeathPerYear:0},{fromAge:elderAge+1,illnessPerYear:0,graveShare:0,suddenDeathPerYear:0}],
  graveDays,graveFatality:{cared:fatality,alone:fatality},...health};
 for(const id of [elder,other,friend])find(id).schedule=day(home);
 find(carer).schedule=work;
 find(other).relationships=[{with:friend,type:'同村日常往来',trust:30,affection:10},...find(other).relationships.filter(r=>r.with!==friend)];
 const engine=new WorldEngine(world),doc=engine.createCharacter(seed,{name:'试'},'npc-health-test');
 doc.state.minute=start;doc.state.location='loc_hw_fields';
 for(const row of Object.values(doc.state.records))if(Number.isSafeInteger(row.lastDay))row.lastDay=Math.floor(start/DAY)-1;
 for(const row of Object.values(doc.state.settlements))row.starvation=-100;
 for(const id of [elder,carer,other,friend])Object.assign(doc.state.npcs[id],{location:home,activity:'闲坐'});
 return {world,engine,doc};
}
async function wait(s,minutes,tag='w'){const out=await s.engine.reduce(s.doc,{tool:'world_time',args:{minutes},eventId:`${tag}-${s.doc.state.minute}-${minutes}`});s.doc=applyPatches(s.doc,out.patches);return out;}
const until=(s,minute,tag)=>wait(s,minute-s.doc.state.minute,tag);
const life=s=>s.doc.state.family??{};
const npc=(s,id)=>s.doc.state.npcs[id];
const knows=(s,id,root)=>(npc(s,id).memoryStream??[]).find(m=>(m.rootMemoryId??m.id)===root);
const meeting=(s,id,at)=>{s.doc.state.obligations[id]={id,reservationVersion:1,type:'会面',promisor:elder,promisee:friend,content:'到家里看看新编的竹篮',location:home,start:at,deadline:at+60,
 departures:{[elder]:at,[friend]:at},createdAt:start,status:'待履行',attendance:{[elder]:0,[friend]:0},togetherMinutes:0};};

test('正式健康参数有效，年死亡率随年龄上升并接近中世纪乡村水平',()=>{
 assert.deepEqual(validateNpcLifeRules(source),[]);
 const h=source.rules.npcLife.health,band=age=>h.bands.filter(b=>b.fromAge<=age).at(-1);
 const yearly=age=>{const b=band(age);return b.suddenDeathPerYear+b.illnessPerYear*b.graveShare*h.graveFatality.cared;};
 assert.ok(yearly(30)>0.005&&yearly(30)<0.02,`30岁 ${yearly(30)}`);
 assert.ok(yearly(50)>yearly(30)&&yearly(65)>yearly(50)&&yearly(75)>yearly(65));
 assert.ok(yearly(75)>0.08&&yearly(75)<0.25,`75岁 ${yearly(75)}`);
 const bad=structuredClone(source);bad.rules.npcLife.health.bands[1].fromAge=0;bad.rules.npcLife.health.graveFatality={cared:0.5,alone:0.1};
 assert.ok(validateNpcLifeRules(bad).length>=2);
});

test('重病者卧床停工，同户成年人回家照护并停工；病中约定按失能违约，病愈后恢复',async()=>{
 const s=fixture();meeting(s,'obl_sick',firstNight+600);
 await until(s,firstNight+720,'a');
 const ill=npcIllness(s.doc.state,elder);
 assert.ok(ill);assert.equal(ill.severity,'重');assert.equal(npc(s,elder).status,'患病');
 assert.deepEqual(npcAvailability(s.engine,s.doc.state,elder),{activity:'患病',services:[]});
 assert.equal(npc(s,elder).medical.symptoms.find(x=>x.illness===ill.id).kind,'fever','病症登记在医疗状态，医族观察可用');
 assert.deepEqual(npc(s,carer).caring,{patient:elder,illness:ill.id,location:home,since:firstNight});
 assert.equal(npc(s,carer).location,home,'照护者本该下田的钟点留在家里');
 const a=npcAvailability(s.engine,s.doc.state,carer);assert.equal(a.activity,'照护病人');assert.deepEqual(a.services,[]);
 assert.equal(npc(s,other).caring,undefined,'一人照护即可');
 const o=s.doc.state.obligations.obl_sick;
 assert.equal(o.status,'违约');assert.deepEqual(o.breachedBy,[elder]);assert.match(o.reason,/患病卧床/);
 await until(s,ill.endsAt+720,'b');
 assert.equal(life(s).illnesses[ill.id].status,'痊愈');assert.equal(npc(s,elder).status,undefined);
 assert.equal(npc(s,elder).medical,undefined,'本病新建的医疗记录随病愈撤去');
 assert.equal(npc(s,carer).caring,undefined);
 assert.equal(npc(s,carer).location,'loc_hw_fields','照护结束后照常下田');
 assert.deepEqual(npcAvailability(s.engine,s.doc.state,carer).services,['trade']);
});

test('旧伤和其他失能状态不被疾病重置',async()=>{
 const s=fixture();
 const old={bloodMl:4600,lostBloodMl:200,pain:3,wounds:[{id:'w_old',depthMm:2,areaCm2:4,bleedingMlPerMinute:0,contamination:0,infectionRisk:0,closed:false}],symptoms:[{kind:'redness',observable:true}]};
 npc(s,elder).medical=structuredClone(old);
 Object.assign(npc(s,comatose),{status:'昏迷',activity:'昏迷'});
 await until(s,firstNight+60,'a');
 const ill=npcIllness(s.doc.state,elder),m=npc(s,elder).medical;
 assert.equal(ill.medicalCreated,false);assert.deepEqual(m.wounds,old.wounds);assert.equal(m.pain,3);assert.equal(m.bloodMl,4600);
 assert.deepEqual(m.symptoms.map(x=>x.kind),['redness','fever']);
 assert.equal(npc(s,comatose).status,'昏迷');assert.equal(npcIllness(s.doc.state,comatose),null,'已昏迷者不另生新病');
 await until(s,ill.endsAt+60,'b');
 assert.equal(life(s).illnesses[ill.id].status,'痊愈');
 assert.deepEqual(npc(s,elder).medical,old,'病愈只撤去本病发热，旧伤原样保留');
 assert.equal(npc(s,comatose).status,'昏迷');
});

test('病故后约定终止不追责，遗产整体交给同户成年继承人，人口账减一，病中照护释放',async()=>{
 const s=fixture({fatality:1});
 const eaten={},itemDelta=s.engine.itemDelta.bind(s.engine);
 s.engine.itemDelta=(d,owner,food,delta,books,options)=>{
  const result=itemDelta(d,owner,food,delta,books,options);
  if(owner===elder&&books?.writer==='npc-life'&&books.purpose==='meal'){assert.ok(delta<0);eaten[food]=(eaten[food]??0)-delta;}
  return result;
 };
 Object.assign(npc(s,elder),{coins:37,inventory:{[item]:3}});
 // F026: the carer's purse is examined to the copper (inheritance +37 only), so nobody has money to walk into the tavern and buy food meanwhile.
 for(const [id,n] of Object.entries(s.doc.state.npcs))if(id!==elder)n.coins=0;
 meeting(s,'obl_after',firstNight+3*DAY);
 const carerCoins=npc(s,carer).coins,population=s.doc.state.settlements.loc_hw.population;
 await until(s,firstNight+DAY+60,'a');
 const death=Object.values(life(s).deaths).find(r=>r.person===elder);assert.equal(death.cause,'病故');assert.equal(death.minute,firstNight+DAY);
 // 依 04 §4.4 遗产分配在阶段期限后
 await until(s,death.minute+4*DAY,'estate-phases');
 const settledDeath=life(s).deaths[death.id];
 assert.equal(npc(s,elder).status,'死亡');assert.equal(life(s).illnesses[death.illness].status,'病故');
 assert.equal(npc(s,carer).caring,undefined);
 assert.equal(settledDeath.estate.heir,carer);// The estate passes whole, but both the elder (before dying) and the carer may have walked into a shop meanwhile (F026); every such
 // purchase is on the shops' day-books, so: carer's purse + carer's purchases = carer's start + (elder's 37 - elder's purchases).
 const spentBy=id=>Object.values(s.doc.state.records).filter(r=>r.category==='customer_flow').flatMap(r=>r.visits).filter(v=>v.npc===id).reduce((n,v)=>n+(v.paid??0),0);
 assert.equal(npc(s,carer).coins+spentBy(carer),carerCoins+37-spentBy(elder));assert.equal(npc(s,elder).coins,0);
 assert.equal(s.engine.quantity({get:(...p)=>p.reduce((x,k)=>x?.[k],s.doc)},carer,item),3);// Three durable objects really reach the heir; meals cannot erase this anchor.
 const bought={};for(const v of Object.values(s.doc.state.records).filter(r=>r.category==='customer_flow').flatMap(r=>r.visits).filter(v=>v.npc===elder&&v.outcome==='bought'))bought[v.item]=(bought[v.item]??0)+v.quantity;
 const expectedItems={[item]:3};for(const [k,n] of Object.entries(bought))expectedItems[k]=(expectedItems[k]??0)+n;
 // Exact residual inheritance: opening objects + actual buys - actual meals.
 for(const [k,n] of Object.entries(eaten)){expectedItems[k]-=n;assert.ok(expectedItems[k]>=0);if(!expectedItems[k])delete expectedItems[k];}
 assert.deepEqual(settledDeath.estate.items,expectedItems);
 assert.deepEqual(death.population,{before:population,after:population-1});assert.equal(s.doc.state.settlements.loc_hw.population,population-1);
 const o=s.doc.state.obligations.obl_after;
 assert.equal(o.status,'取消');assert.equal(o.endedByDeath,death.id);assert.equal(o.breachedBy,undefined);
 assert.deepEqual(death.obligations,['obl_after']);
 assert.deepEqual(npcAvailability(s.engine,s.doc.state,elder),{activity:'死亡',services:[]},'既有服务检查按死亡处理');
 await until(s,death.minute+5*DAY,'b');
 assert.equal(s.doc.state.obligations.obl_after.status,'取消','到期也不改判违约');
 assert.equal(npc(s,elder).status,'死亡');
 assert.ok(!Object.values(npc(s,friend).relationships[elder]?.ledger??{}).some(r=>r.eventType==='违约'));
});

test('病讯和死讯只经亲历、同户在场与日常交谈传开，玩家和远方生人不会凭空得知',async()=>{
 const s=fixture({fatality:1});
 await until(s,firstNight+60,'a');
 const ill=npcIllness(s.doc.state,elder);
 assert.equal(knows(s,elder,ill.id).sourceType,'亲历');
 assert.equal(knows(s,carer,ill.id).sourceType,'目击');assert.equal(knows(s,friend,ill.id),undefined,'在场但非同户者不算目击');
 await until(s,firstNight+4*DAY,'b');
 const death=Object.values(life(s).deaths).find(r=>r.person===elder);
 assert.equal(knows(s,other,death.id).sourceType,'目击');assert.ok(death.witnesses.includes(carer));
 const heard=knows(s,friend,death.id)??knows(s,friend,ill.id);
 assert.equal(heard?.sourceType,'听说');assert.equal(heard.channel,'conversation');
 assert.equal(knows(s,stranger,death.id),undefined);assert.equal(knows(s,stranger,ill.id),undefined);
 assert.ok(!Object.values(s.doc.memories??{}).some(row=>[death.id,ill.id].includes(row.sourceEvent)),'玩家记忆不自动写入');
});

test('跨年长步与分段短步、存档重载后继续，生病与死亡结果一致',async()=>{
 const opts={fatality:0.5,graveDays:[4,6]};
 const pick=s=>JSON.stringify({family:s.doc.state.family,population:s.doc.state.settlements,minute:s.doc.state.minute,obligations:s.doc.state.obligations,
  npcs:[elder,carer,other,friend,stranger,comatose,'npc_lq_minghe'].map(id=>({id,status:npc(s,id).status,coins:npc(s,id).coins,inventory:npc(s,id).inventory,caring:npc(s,id).caring,medical:npc(s,id).medical,memories:npc(s,id).memoryStream??[]}))});
 const prep=s=>{meeting(s,'obl_x',firstNight+2*DAY);npc(s,elder).coins=11;return s;};
 const long=prep(fixture(opts));await wait(long,9*DAY,'long');
 assert.equal(Math.floor(long.doc.state.minute/DAY/360),1,'已跨入第二年');
 assert.ok(Object.values(life(long).illnesses).some(r=>r.patient===elder));
 assert.ok(Object.keys(life(long).deaths??{}).length>=1);
 const short=prep(fixture(opts));for(const minutes of [7*60,DAY-7*60,DAY,DAY+333,DAY-333,2*DAY,DAY,DAY+1,DAY-1])await wait(short,minutes,'short');
 assert.equal(pick(short),pick(long));
 const reload=prep(fixture(opts));await wait(reload,DAY+120,'r1');
 assert.ok(Object.values(life(reload).illnesses).some(r=>r.status==='患病中'),'重载点处于病中');
 const restored={world:reload.world,engine:new WorldEngine(structuredClone(reload.world)),doc:JSON.parse(JSON.stringify(reload.doc))};
 await wait(restored,8*DAY-120,'r2');
 assert.equal(pick(restored),pick(long));
});

test('正式参数下全世界离屏一个季度：有人生病痊愈，状态合法，名册与正文不改',async()=>{
 const engine=new WorldEngine(source),doc=engine.createCharacter(seed,{name:'试'},'npc-health-real');
 for(const row of Object.values(doc.state.settlements))row.starvation=-100;
 const catalog=JSON.stringify(source.npcs);let s={engine,doc};
 for(let i=0;i<3;i++)await wait(s,30*DAY,`q${i}`);
 const ill=Object.values(life(s).illnesses??{});
 assert.ok(ill.length>10,`发病${ill.length}`);assert.ok(ill.some(r=>r.status==='痊愈'));
 for(const r of ill.filter(r=>r.status==='患病中'))assert.equal(npc(s,r.patient).status,'患病');
 for(const id of Object.keys(doc.state.npcs))if(npc(s,id).caring)assert.equal(npcIllness(s.doc.state,npc(s,id).caring.patient)?.id,npc(s,id).caring.illness);
 assert.equal(JSON.stringify(source.npcs),catalog);
});
