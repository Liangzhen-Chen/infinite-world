import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {scheduleAt} from '../server-plugin/npc-schedule.mjs';
import {applyMagicStatus,magicStatusStats} from '../server-plugin/magic-status.mjs';

const source=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
function setup(){
 const engine=new WorldEngine(structuredClone(source)),document=engine.initialFromLegacy(seed,'old-npc');
 document.state.minute=600;document.state.player.hp=document.state.player.maxHp=5000;
 document.state.creatures??={};
 const run=async(doc,target,id)=>{const out=await engine.reduce(doc,{tool:'world_combat',args:{target},eventId:id});return {...out,document:applyPatches(doc,out.patches)};};
 return {engine,document,run};
}
const reader=document=>({document,get:(...path)=>path.reduce((value,key)=>value?.[key],document)});
function writer(document){return {...reader(document),set(path,value){let row=document;for(const key of path.slice(0,-1))row=row[key]??={};row[path.at(-1)]=value;}};}

test('目录身份和已创建模板可交锋，自有可处分；仍拒绝不在场、死亡、他人所有及伪实体',async()=>{
 const {engine,document,run}=setup(),catalog=engine.world.monsters.find(row=>row.template===1).id,created='creature_old_npc';
 document.state.created[created]={id:created,name:'回归野兽',aliases:[],template:1,levelRange:[1,1]};
 for(const target of [catalog,created]){
  document.state.creatures[target]={location:document.state.location,hp:5000,maxHp:5000,level:1};
  assert.equal((await run(document,target,`valid_${target}`)).result.target,target);
  // K7 owner's disposition: the owner may strike its own beast; someone else's
  // beast is refused as theirs (not as "not an exchange target").
  const own=structuredClone(document);own.state.creatures[target].owner='player';
  assert.equal((await run(own,target,`own_${target}`)).result.target,target);
  for(const [change,reason] of [[{location:'loc_capital'},/不在场/],[{hp:0,status:'死亡'},/死亡/],[{owner:'npc_hw_linsui'},/没有处分别人牲畜的权利/]]){
   const invalid=structuredClone(document);Object.assign(invalid.state.creatures[target],change);
   await assert.rejects(run(invalid,target,`invalid_${target}`),reason);
  }
 }
 const fake=engine.world.items[0].id;document.state.creatures[fake]={location:document.state.location,hp:100,species:fake};
 await assert.rejects(run(document,fake,'fake'),/不是交锋对象/);
});

test('NPC物种不覆盖本人档案与当前等级属性',async()=>{
 const {engine,document,run}=setup(),target='npc_hw_linsui';
 Object.assign(engine.byId.get(target),{level:3});
 Object.assign(document.state.npcs[target],{location:document.state.location,hp:5000,maxHp:5000});
 const plain=await run(document,target,'same_profile');
 const species=engine.world.monsters.find(row=>row.levelRange?.[0]>=18).id;
 engine.byId.get(target).species=species;document.state.npcs[target].species=species;
 const changed=await run(document,target,'same_profile');
 assert.equal(changed.result.damage,plain.result.damage);assert.equal(changed.result.received,plain.result.received);
 const current=structuredClone(document);current.state.npcs[target].level=20;
 let stronger=false;for(let i=0;i<12;i++){
  const a=await run(document,target,`level_${i}`),b=await run(current,target,`level_${i}`);
  if(b.result.received>a.result.received){stronger=true;break;}
 }
 assert.equal(stronger,true);
});

test('考官无交易服务的劳动段仍接待，同地点休息、用餐、睡眠不被覆盖',()=>{
 const {engine,document}=setup(),id='npc_hw_duanyan',person=engine.byId.get(id),location=person.workplace.location;
 const slot=(start,end,activity)=>({start,end,location,activity,services:[]});
 person.schedule={default:[slot(0,540,'睡眠'),slot(540,600,'打铁'),slot(600,620,'休息'),slot(620,650,'打铁'),slot(650,680,'吃饭'),slot(680,720,'睡眠'),slot(720,1440,'休息')]};
 for(const minute of [560,630])assert.ok(scheduleAt(engine,id,minute,document.state).services.includes('teach'));
 for(const [minute,activity]of [[610,'休息'],[660,'吃饭'],[690,'睡眠']]){
  const actual=scheduleAt(engine,id,minute,document.state);assert.equal(actual.activity,activity);assert.deepEqual(actual.services,[]);
 }
 // Existing non-merchant examiners must continue receiving during real work.
 const office=engine.world.factions.flatMap(f=>f.offices??[]).find(o=>o.authority?.operations?.includes('certify')&&o.holder==='npc_hw_ranmo');
 assert.ok(office);assert.ok(scheduleAt(engine,office.holder,600,document.state).services.includes('teach'));
});

test('一次性干扰实际改变交锋攻防，消费一次后到期且不再加成',async()=>{
 for(const target of ['player','npc_hw_linsui']){
  const {engine,document,run}=setup(),foe='npc_hw_linsui';
  engine.byId.get(foe).schedule={default:[{start:0,end:1440,location:document.state.location,activity:'交锋',services:[]}]};
  Object.assign(document.state.npcs[foe],{location:document.state.location,hp:5000,maxHp:5000});
  const affected=structuredClone(document),status=target==='player'?'illusion':'dazzle';
  applyMagicStatus(writer(affected),{target,status,power:2,duration:1,source:'regression'},'transient');
  const context=engine.magicStatusContext(reader(affected),target);
  assert.equal(magicStatusStats(reader(affected),target,context).hit,-.04);
  let changed;
  for(let i=0;i<100;i++){
   const a=await run(document,foe,`transient_${i}`),b=await run(affected,foe,`transient_${i}`);
   if(target==='player'?a.result.damage>b.result.damage:a.result.received>b.result.received){changed=b;break;}
  }
  assert.ok(changed,`${status} must change actual damage`);
  const consumption=changed.patches.filter(p=>p.path.join('.')==='state.effects.transient.remainingUses');
  assert.deepEqual(consumption.map(p=>p.value),[0]);assert.equal(changed.document.state.effects.transient,undefined);
  assert.equal(magicStatusStats(reader(changed.document),target,context).hit,0);
  const again=await run(changed.document,foe,'transient_again');
  assert.equal(again.patches.some(p=>p.path[1]==='effects'&&p.path[2]==='transient'),false);
 }
});
