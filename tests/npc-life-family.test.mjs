import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {validateNpcLifeRules,marriageBlocker,householdMembers,npcHousehold,npcIsMinor} from '../server-plugin/npc-life.mjs';
import {recordLifeRelation} from '../server-plugin/npc-relations.mjs';

const source=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const DAY=1440,start=357*DAY+600;
const man='npc_hw_anhuai',woman='npc_hw_jiaoyou',sister='npc_hw_baihui',away='npc_hw_zhongxiu',friend='npc_hw_hezhou',stranger='npc_yp_luxia',minor='npc_hw_duanhe';
const house='house_hw_20',home=source.households.find(h=>h.id===house).homeLocation;
const day=(location,activity='闲坐')=>({default:[{start:0,end:1440,location,activity,services:[]}]});

// Quick family rules on a cloned world; the real parameters are checked separately.
function fixture({rules={},ties=70}={}){
 const world=structuredClone(source),find=id=>world.npcs.find(n=>n.id===id);
 const life=world.rules.npcLife;
 world.rules.npcLife={...life,courtship:{...life.courtship,days:2,marriageChancePerDay:1},birth:{...life.birth,conceptionChancePerDay:1,gestationDays:3},...rules};
 for(const id of [man,woman,sister,friend,minor])find(id).schedule=day(home);
 find(away).schedule=day('loc_hw_fields');
 // Daily talk reaches the first three trusted ties; put the friend among them.
 find(woman).relationships=[{with:friend,type:'同村日常往来',trust:30,affection:10},...find(woman).relationships.filter(r=>r.with!==friend)];
 const engine=new WorldEngine(world),doc=engine.createCharacter(seed,{name:'试'},'npc-life-test');
 doc.state.minute=start;doc.state.location='loc_hw_fields';
 for(const row of Object.values(doc.state.records))if(Number.isSafeInteger(row.lastDay))row.lastDay=Math.floor(start/DAY)-1;
 // The jump to year end leaves the granary empty; keep famine out of this short window.
 for(const row of Object.values(doc.state.settlements))row.starvation=-100;
 for(const id of [man,woman,sister,friend,minor])Object.assign(doc.state.npcs[id],{location:home,activity:'闲坐'});
 Object.assign(doc.state.npcs[away],{location:'loc_hw_fields',activity:'闲坐'});
 const tie=(a,b,trust,affection)=>{doc.state.npcs[a].relationships[b]={trust,affection};};
 if(ties!==null){tie(man,woman,ties,ties);tie(woman,man,ties,ties);}
 return {world,engine,doc};
}
async function wait(s,minutes,tag='w'){const out=await s.engine.reduce(s.doc,{tool:'world_time',args:{minutes},eventId:`${tag}-${s.doc.state.minute}-${minutes}`});s.doc=applyPatches(s.doc,out.patches);return out;}
const family=s=>s.doc.state.family??{};
const marriages=s=>Object.values(family(s).marriages??{}).filter(m=>m.partners.includes(woman)&&m.since!==undefined);
const population=s=>s.doc.state.settlements.loc_hw.population;
const knows=(s,id,root)=>(s.doc.state.npcs[id].memoryStream??[]).find(m=>(m.rootMemoryId??m.id)===root);

test('世界规则登记的家庭参数有效，旧人物静态资料不改',()=>{
 assert.deepEqual(validateNpcLifeRules(source),[]);
 const bad=structuredClone(source);bad.rules.npcLife.adultAge=16;bad.rules.npcLife.birth.motherAge=[14,40];
 assert.ok(validateNpcLifeRules(bad).length>=2);
});

test('双方成年、愿意且同村，长期交往后成婚；成婚后怀孕、出生进入家户与人口',async()=>{
 const s=fixture(),before=population(s),catalog=structuredClone(s.world.npcs.find(n=>n.id===woman));
 assert.equal(marriageBlocker(s.engine,s.doc.state,man,woman),null);
 await wait(s,DAY,'a');
 assert.ok(family(s).courtships[`${man}|${woman}`],'第一夜开始交往');
 assert.equal(marriages(s).length,0,'交往未满规定天数不成婚');
 await wait(s,2*DAY,'b');
 const [m]=marriages(s);assert.ok(m);assert.deepEqual(m.partners,[man,woman]);assert.equal(m.status,'在婚');
 assert.ok(s.doc.state.npcs[man].relationships[woman].romance>0,'成婚写入关系账的恋慕维度');
 assert.ok(knows(s,man,m.id)&&knows(s,woman,m.id),'双方亲历');
 assert.equal(knows(s,sister,m.id)?.sourceType,'目击','同户在场者目击');
 const [p]=Object.values(family(s).pregnancies);assert.equal(p.mother,woman);assert.equal(p.father,man);
 await wait(s,4*DAY,'c');
 const [b]=Object.values(family(s).births),child=family(s).people[b.child];
 assert.equal(b.household,house);assert.ok(householdMembers(s.engine,s.doc.state,house).includes(b.child));
 assert.equal(npcHousehold(s.engine,s.doc.state,b.child).id,house);
 assert.equal(population(s),before+1);assert.deepEqual(b.population,{before,after:before+1});
 assert.deepEqual(child.parents,{mother:woman,father:man});assert.equal(child.flags.minor,true);assert.equal(child.location,home);
 assert.ok(npcIsMinor(s.engine,s.doc.state,b.child));assert.equal(child.name[0],s.world.npcs.find(n=>n.id===man).name[0]);
 assert.deepEqual(s.world.npcs.find(n=>n.id===woman),catalog,'正式人物目录不被改写');
 assert.ok(!s.engine.world.households.find(h=>h.id===house).members.includes(b.child),'户籍目录只在战役状态追加');
});

test('任一方不愿意或条件不足都不交往、不成婚',async()=>{
 const unwilling=fixture();unwilling.doc.state.npcs[man].relationships[woman]={trust:70,affection:10};
 assert.match(marriageBlocker(unwilling.engine,unwilling.doc.state,man,woman),/不愿意/);
 const refuses=fixture();refuses.world.npcs.find(n=>n.id===woman).flags.romanceable=false;refuses.engine=new WorldEngine(refuses.world);
 assert.match(marriageBlocker(refuses.engine,refuses.doc.state,man,woman),/不愿意/);
 const married=fixture();married.doc.state.family={marriages:{m0:{id:'m0',partners:[man,sister],status:'在婚'}}};
 assert.match(marriageBlocker(married.engine,married.doc.state,man,woman),/在婚/);
 const kin=fixture();kin.doc.state.npcs[woman].relationships[away]={trust:90,affection:90};kin.doc.state.npcs[away].relationships[woman]={trust:90,affection:90};
 assert.match(marriageBlocker(kin.engine,kin.doc.state,woman,away),/亲属/);
 const far=fixture();far.doc.state.npcs[man].relationships[stranger]={trust:90,affection:90};far.doc.state.npcs[stranger].relationships[man]={trust:90,affection:90};
 assert.match(marriageBlocker(far.engine,far.doc.state,man,stranger),/同一聚落/);
 const dead=fixture();dead.doc.state.npcs[woman].status='死亡';assert.match(marriageBlocker(dead.engine,dead.doc.state,man,woman),/死亡/);
 for(const s of [unwilling,refuses,married,dead]){
  await wait(s,5*DAY);
  assert.equal(marriages(s).length,0);assert.equal(family(s).courtships?.[`${man}|${woman}`],undefined);
 }
 const lapse=fixture();await wait(lapse,DAY);assert.ok(family(lapse).courtships[`${man}|${woman}`]);
 lapse.doc.state.npcs[woman].relationships[man]={trust:70,affection:20};await wait(lapse,3*DAY);
 assert.equal(marriages(lapse).length,0,'交往中途一方不再愿意就中断');assert.equal(family(lapse).courtships[`${man}|${woman}`],undefined);
});

test('未成年人一律不进入恋爱或婚姻流程，关系账也拒绝写入恋慕',async()=>{
 const s=fixture();
 for(const [a,b] of [[man,minor],[minor,man]])s.doc.state.npcs[a].relationships[b]={trust:95,affection:95};
 assert.match(marriageBlocker(s.engine,s.doc.state,man,minor),/未成年/);
 await wait(s,5*DAY);
 assert.ok(!Object.values(family(s).courtships??{}).some(c=>c.partners.includes(minor)));
 assert.ok(!Object.values(family(s).marriages??{}).some(m=>m.partners.includes(minor)));
 const d={document:s.doc,get(...p){return p.reduce((x,k)=>x?.[k],this.document);},set(path,value){this.document=applyPatches(this.document,[{op:'set',path,value}]);}};
 assert.throws(()=>recordLifeRelation(d,s.engine,{key:'k',sourceEvent:'e',eventType:'成婚',from:man,to:minor,minute:s.doc.state.minute,delta:{romance:10}},id=>npcIsMinor(s.engine,s.doc.state,id)),/未成年/);
 const babies=fixture();await wait(babies,8*DAY);const [b]=Object.values(family(babies).births);
 assert.equal(marriageBlocker(babies.engine,babies.doc.state,b.child,friend),'须为有独立状态的人物');
 assert.ok(npcIsMinor(babies.engine,babies.doc.state,b.child,babies.doc.state.minute+17*360*DAY));
});

test('婚讯与出生只经亲历、同户在场与人物日常交谈传开，远方生人和玩家不会凭空得知',async()=>{
 const s=fixture();await wait(s,8*DAY);
 const [b]=Object.values(family(s).births),[m]=marriages(s);
 assert.equal(knows(s,sister,b.id)?.sourceType,'目击');
 assert.equal(knows(s,away,b.id),undefined,'同户但不在场者当时不知');
 const heard=knows(s,friend,b.id)??knows(s,friend,m.id);
 assert.equal(heard?.sourceType,'听说');assert.equal(heard.channel,'conversation');assert.equal(heard.heardFrom,woman);
 assert.equal(knows(s,stranger,b.id),undefined);assert.equal(knows(s,stranger,m.id),undefined);
 assert.ok(!Object.values(s.doc.memories??{}).some(row=>row.sourceEvent===b.id||row.sourceEvent===m.id),'玩家记忆不自动写入');
});

test('跨年长步与分段短步、存档重载后继续，家庭结果一致',async()=>{
 const pick=s=>JSON.stringify({family:s.doc.state.family,population:population(s),minute:s.doc.state.minute,
  npcs:[man,woman,sister,friend,away,stranger].map(id=>({id,memories:s.doc.state.npcs[id].memoryStream??[],relations:s.doc.state.npcs[id].relationships}))});
 const long=fixture();await wait(long,9*DAY,'long');
 assert.equal(Math.floor(long.doc.state.minute/DAY/360),1,'已跨入第二年');
 const short=fixture();for(const minutes of [7*60,DAY-7*60,DAY,DAY+333,DAY-333,2*DAY,DAY,DAY+1,DAY-1])await wait(short,minutes,'short');
 assert.equal(pick(short),pick(long));
 const reload=fixture();await wait(reload,4*DAY+120,'r1');
 assert.ok(Object.values(family(reload).pregnancies??{}).some(p=>p.status==='怀孕'),'重载点处于孕期');
 const restored={world:reload.world,engine:new WorldEngine(structuredClone(reload.world)),doc:JSON.parse(JSON.stringify(reload.doc))};
 await wait(restored,5*DAY-120,'r2');
 assert.equal(pick(restored),pick(long));
 assert.equal(Object.keys(family(long).births).length,1);
});

test('正式参数下没有满足条件的旧人物，不会凭空成婚或生育',async()=>{
 const engine=new WorldEngine(source),doc=engine.createCharacter(seed,{name:'试'},'npc-life-real');
 const ids=Object.keys(doc.state.npcs);let pairs=0;
 for(const a of ids)for(const r of source.npcs.find(n=>n.id===a).relationships??[])if(doc.state.npcs[r.with]&&a<r.with){pairs++;assert.notEqual(marriageBlocker(engine,doc.state,a,r.with),null,`${a}|${r.with}`);}
 assert.ok(pairs>100);
});
