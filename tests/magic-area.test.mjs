import {relationView} from '../server-plugin/npc-state.mjs';
// A3 causal2: read the canonical relation; preserve original trust expectations.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from 'node:path';
import {loadWorld}from'../tools/load-world.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {applyPatches,CampaignStorage}from'../server-plugin/storage.mjs';
import {validateMagicCatalog}from'../server-plugin/magic.mjs';
import {settleMagicAreas,prepareAreaMagic,applyAreaMagic,areaTargetFacts}from'../server-plugin/magic-area.mjs';
import {consumeMagicProtection}from'../server-plugin/magic-primitives.mjs';
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const damage={kind:'damage',power:4,damageType:'fire',armorFactor:0};
const shield={kind:'protection',power:12,damageTypes:['fire'],stacking:'strongest'};
const area=(effect=damage)=>({kind:'area',power:effect.power,radiusMeters:2,intervalMinutes:2,trigger:effect.kind==='protection'?'presence':'pulse',effect});
function draft(document){return{document,patches:[],get(...p){return p.reduce((v,k)=>v?.[k],this.document);},set(p,v){const patch={op:'set',path:p,value:structuredClone(v)};this.patches.push(patch);this.document=applyPatches(this.document,[patch]);},remove(p){const patch={op:'delete',path:p};this.patches.push(patch);this.document=applyPatches(this.document,[patch]);},say(){}};}
const actorId='npc_hw_linsui';
// Synthetic geometry evidence is confined to these original mathematical tests.
function position(c,target,point,location=c.state.location){
 const source=`physical_contact:fixture:${target}`,minute=c.state.minute,expires=minute+10,activity=(target.startsWith('npc_')?c.state.npcs[target]:c.state.creatures[target])?.activity??null;
 c.state.records[source]={category:'physical_contact',subject:target,point,visibleFrom:[0,0],location,event:'fixture',minute,expires,activity};
 c.state.records[`local_actor_position:${target}`]={category:'local_position',subject:target,point,location,lineOfSight:true,source,minute,expires,activity};
}
function consent(c,target=actorId,expires=c.state.minute+100,action='support_magic'){
 const key=`consent:${target}`;c.state.records[key]={category:'authorization',subject:target,grantor:target,grantee:'player',action,expires};return key;
}
async function setup(effect=damage){
 const world=await loadWorld(),base=world.spells[0],catalog={...base,id:'spell_area_fixture',name:'测试区域',skill:'skill_area_fixture',effectSpec:area(effect),mp:2,minutes:1,duration:8,rangeMeters:5,targeting:{lineOfSight:true},materials:[]};
 world.spells.push(catalog);world.skills.push({id:catalog.skill,name:'区域测试',attribute:'精神',profession:null});
 const engine=new WorldEngine(world),c=engine.initialFromLegacy(seed,'area-test');
 c.state.creatures??={};
 c.state.player.hp=100;c.state.player.maxHp=100;c.state.player.mp=100;c.state.player.maxMp=100;
 c.state.spells[catalog.id]={source:{type:'fixture'}};c.state.skills[catalog.skill]={proficiency:10,breakthroughs:[],daily:{}};
 c.state.npcs[actorId].hp=100;c.state.npcs[actorId].maxHp=100;position(c,actorId,[1,0]);
 const run=async(document,tool,args,id)=>{const out=await engine.reduce(document,{tool,args,eventId:id});return{document:applyPatches(document,out.patches),result:out.result};};
 const create=(document=c,id='area',args={})=>{const d=draft(document);engine.applyMagicArea(d,catalog,{target:'player',...args},id);return d.document;};
 // A1：引擎在自己的世界副本上工作；夹具的世界改指引擎世界（断言不动）
 return{world:engine.world,engine,c,catalog,run,create};
}
async function cast(s,c=s.c,args={}){
 for(let i=0;i<100;i++){const out=await s.run(c,'world_cast',{spell:s.catalog.id,target:'player',...args},`area-cast-${i}`);if(out.result.success)return{...out,eventId:`area-cast-${i}`};}throw Error('未取得成功施法夹具');
}
test('区域只接受有消费者的原语和触发，不能用未知参数宣告机制完成',async()=>{
 const{catalog}=await setup();assert.deepEqual(validateMagicCatalog(catalog),[]);
 for(const change of [s=>s.effectSpec.effect={kind:'light',power:4},s=>s.effectSpec.radiusMeters=Infinity,s=>s.effectSpec.intervalMinutes=0,s=>s.effectSpec.trigger='presence',s=>s.effectSpec.effect.power=5,s=>s.effectSpec.hiddenFriendlyFilter=true,s=>delete s.targeting,s=>s.duration=0]){
  const bad=structuredClone(catalog);change(bad);assert.ok(validateMagicCatalog(bad).length);
 }
});
test('施法实际多目标及友军波及，保存固定范围/来源/时限和游标',async()=>{
 const s=await setup();s.c.state.player.companions=[actorId];
 const out=await cast(s),record=out.document.state.effects[out.eventId];
 assert.equal(out.document.state.player.mp,98);assert.equal(out.document.state.player.hp,96);assert.equal(out.document.state.npcs[actorId].hp,96);
 // A3 causal2: actual area wounds have the same -10 spell relation consequence
 // as direct spells, one source per pulse; the legacy scalar remains initial.
 assert.equal(relationView(s.engine,out.document.state,actorId,'player').trust,relationView(s.engine,s.c.state,actorId,'player').trust-10);
 assert.equal(out.document.state.npcs[actorId].trust,s.c.state.npcs[actorId].trust);
 assert.ok(out.document.state.records[`world_event:${out.eventId}:trigger:${record.created}:${actorId}`]);
 assert.deepEqual(out.result.outcomes.map(x=>x.target).sort(),[actorId,'player'].sort());
 assert.equal(record.source,out.eventId);assert.equal(record.owner,'player');assert.equal(record.location,s.c.state.location);assert.deepEqual(record.center,[0,0]);assert.equal(record.radiusMeters,2);
 assert.equal(record.expires,record.created+8);assert.equal(record.nextPulse,record.created+2);assert.equal(record.members[actorId].lastTrigger,record.created);
 const tick=await s.run(out.document,'world_time',{minutes:2},'tick');assert.equal(tick.document.state.player.hp,92);assert.equal(tick.document.state.npcs[actorId].hp,92);
 assert.equal(relationView(s.engine,tick.document.state,actorId,'player').trust,relationView(s.engine,s.c.state,actorId,'player').trust-20);
});
test('没有可信坐标、被遮挡、出界、在路途或神性免疫的单位不被误命中',async()=>{
 const s=await setup(),c=s.c;
 delete c.state.records[`local_actor_position:${actorId}`];let out=s.create();assert.equal(out.state.npcs[actorId].hp,100);
 position(c,actorId,[1,0]);c.state.records[`local_actor_position:${actorId}`].lineOfSight=false;out=s.create();assert.equal(out.state.npcs[actorId].hp,100);
 position(c,actorId,[2.01,0]);out=s.create();assert.equal(out.state.npcs[actorId].hp,100);
 position(c,actorId,[1,0]);c.state.npcs[actorId].scheduleTravel={arrival:c.state.minute+5};out=s.create();assert.equal(out.state.npcs[actorId].hp,100);
 delete c.state.npcs[actorId].scheduleTravel;
 const deity={id:'monster_area_divine',name:'测试神性目标',template:10,level:1};s.engine.byId.set(deity.id,deity);c.state.creatures[deity.id]={hp:100,maxHp:100,level:1,location:c.state.location,status:'正常'};position(c,deity.id,[0,0]);
 out=s.create();assert.equal(out.state.creatures[deity.id].hp,100);assert.equal(out.state.npcs[actorId].hp,96);
});
test('保护区域逐人核验同意，出界立即解除，重入不补充已消耗吸收量',async()=>{
 const s=await setup(shield),key=consent(s.c);let c=s.create(s.c,'ward',{authorizations:[key]});
 assert.equal(c.state.effects['ward:member:player'].remaining,12);assert.equal(c.state.effects[`ward:member:${actorId}`].remaining,12);
 let d=draft(c);assert.equal(consumeMagicProtection(d,actorId,7,'fire').absorbed,7);c=d.document;
 position(c,actorId,[3,0]);d=draft(c);settleMagicAreas(d,s.engine);c=d.document;assert.equal(c.state.effects[`ward:member:${actorId}`],undefined);
 position(c,actorId,[1,0]);d=draft(c);settleMagicAreas(d,s.engine);c=d.document;assert.equal(c.state.effects[`ward:member:${actorId}`].remaining,5);
 c.state.records[key].revoked=true;d=draft(c);settleMagicAreas(d,s.engine);assert.equal(d.document.state.effects[`ward:member:${actorId}`],undefined);
 const none=s.create(s.c,'none');assert.equal(none.state.effects[`none:member:${actorId}`],undefined);
});
test('治疗区域不替友军同意，授权到期后停止，已死亡单位不能复生',async()=>{
 const s=await setup({kind:'heal',power:4});s.c.state.player.hp=50;s.c.state.npcs[actorId].hp=50;
 const key=consent(s.c,actorId,s.c.state.minute+3,'healing');let c=s.create(s.c,'healing',{authorizations:[key]});assert.equal(c.state.npcs[actorId].hp,54);
 c=(await s.run(c,'world_time',{minutes:4},'heal-time')).document;assert.equal(c.state.player.hp,62);assert.equal(c.state.npcs[actorId].hp,58);
 const invalid=structuredClone(s.c);invalid.state.records[key].grantor='player';assert.equal(s.create(invalid,'invalid',{authorizations:[key]}).state.npcs[actorId].hp,50);
 const dead=structuredClone(s.c);dead.state.npcs[actorId].status='死亡';dead.state.npcs[actorId].hp=0;assert.equal(s.create(dead,'dead',{authorizations:[key]}).state.npcs[actorId].hp,0);
});
test('保护效果在非触发分钟同意到期时解除，到期区域及其附属效果清除',async()=>{
 const s=await setup(shield),key=consent(s.c,actorId,s.c.state.minute+3);let c=s.create(s.c,'ward',{authorizations:[key]});
 c=(await s.run(c,'world_time',{minutes:3},'expiry-consent')).document;assert.equal(c.state.effects[`ward:member:${actorId}`],undefined);assert.ok(c.state.effects['ward:member:player']);
 c=(await s.run(c,'world_time',{minutes:5},'expiry-area')).document;assert.equal(c.state.effects.ward,undefined);assert.equal(c.state.effects['ward:member:player'],undefined);
});
test('大步与逐分钟结算一致，到期分钟不再伤害，重复同步和同分钟重入无双伤',async()=>{
 const s=await setup();let c=s.create(),small=c;const big=(await s.run(c,'world_time',{minutes:8},'big')).document;
 for(let i=0;i<8;i++)small=(await s.run(small,'world_time',{minutes:1},`small-${i}`)).document;
 assert.deepEqual(big.state.player,small.state.player);assert.deepEqual(big.state.npcs[actorId],small.state.npcs[actorId]);assert.deepEqual(big.state.effects,small.state.effects);assert.equal(big.state.player.hp,84);
 const d=draft(c);settleMagicAreas(d,s.engine);assert.equal(d.document.state.player.hp,96);
 position(d.document,actorId,[3,0]);settleMagicAreas(d,s.engine);position(d.document,actorId,[1,0]);settleMagicAreas(d,s.engine);assert.equal(d.document.state.npcs[actorId].hp,96);
 const original=structuredClone(s.c);assert.deepEqual(s.create(s.c),s.create(s.c));assert.deepEqual(s.c,original);
});
test('移动到有区域的地点只在到达时结算，路途中无远程伤害；局部走近能离开范围',async()=>{
 const s=await setup();s.catalog.duration=120;
 const route=s.world.routes.find(r=>r.from===s.c.state.location||r.to===s.c.state.location),destination=route.from===s.c.state.location?route.to:route.from;
 let c=s.create();const departureHp=c.state.player.hp;c=(await s.run(c,'world_move',{destination},'leave')).document;assert.equal(c.state.player.hp,departureHp);
 const savedLocation=s.c.state.location,remote=structuredClone(s.c);remote.state.location=destination;let placed=s.create(remote,'destination-area');placed.state.location=savedLocation;placed.state.player.hp=100;
 const arrived=await s.run(placed,'world_move',{destination},'arrive');assert.equal(arrived.document.state.player.hp,96);assert.equal(arrived.document.state.records.magic_area_transit,undefined);
 const place=s.world.locations.find(l=>l.id===savedLocation),feature={...place.features[0],id:'feature_area_exit_fixture',name:'测试出界目标',position:[3,0]};place.features.push(feature);
 let local=s.create();local=(await s.run(local,'world_environment',{operation:'approach',target:feature.id},'local-move')).document;assert.deepEqual(local.state.records.local_player_position.point,[3,0]);assert.equal(local.state.effects.area.members.player.inside,false);
});
test('首领来源复用相同区域消费者，敌方伤害不记为玩家施法或给玩家击杀奖励',async()=>{
 const s=await setup(),boss='boss_area_source';s.engine.byId.set(boss,{id:boss,name:'测试区域首领',level:1,template:2,tier:1});
 s.c.state.creatures[boss]={hp:100,maxHp:100,level:1,location:s.c.state.location,status:'正常'};position(s.c,boss,[0,0]);
 const d=draft(s.c);const out=s.engine.applyMagicArea(d,s.catalog,{target:boss},'boss-area',boss);
 assert.equal(out.outcomes.find(r=>r.target==='player').damage,4);assert.equal(d.document.state.effects['boss-area'].owner,boss);assert.equal(relationView(null,d.document.state,actorId,'player').trust,relationView(null,s.c.state,actorId,'player').trust);
 const victim='monster_area_victim';s.engine.byId.set(victim,{id:victim,name:'测试区域生命目标',level:1,template:2,drops:[]});
 s.c.state.creatures[victim]={hp:2,maxHp:100,level:1,location:s.c.state.location,status:'正常',ecology:'habitat_hw_wood',species:victim};position(s.c,victim,[0,0]);
 const kill=draft(s.c);s.engine.applyMagicArea(kill,s.catalog,{target:boss},'boss-kill',boss);assert.equal(kill.document.state.creatures[victim].status,'死亡');assert.equal(kill.document.state.creatures[victim].corpse.killedBy,boss);assert.equal(kill.document.state.player.xp,s.c.state.player.xp);
 d.document.state.player.hp=0;d.document.state.player.status='死亡';assert.equal(areaTargetFacts(d,s.engine,'player',s.c.state.location),null);
});
test('失败事务不改原状态，损坏游标拒绝补算；保存重放与重复请求保持一次结算',async()=>{
 const s=await setup(),c=s.create(),before=structuredClone(c),broken=structuredClone(c);broken.state.effects.area.nextPulse=broken.state.minute-1;
 await assert.rejects(s.run(broken,'world_time',{minutes:2},'broken'),/游标/);assert.deepEqual(c,before);
 const directory=await fs.mkdtemp(path.join(tmpRoot(),'dnd-area-'));
 try{
  const storage=new CampaignStorage(directory,{reducer:s.engine.reduce.bind(s.engine)});await storage.create({id:'area-save',worldVersion:s.world.version,document:c});
  const state=await storage.read('area-save');const input={tool:'world_time',args:{minutes:2},eventId:'persist-tick'};
  const request={...state.reference,id:'area-request',anchor:'tick',input};const first=await storage.transact('area-save',request,s.engine.reduce.bind(s.engine));
  const second=await storage.transact('area-save',request,s.engine.reduce.bind(s.engine));assert.equal(second.duplicate,true);assert.deepEqual(second.result,first.result);
  const loaded=await storage.load('area-save');assert.equal(loaded.document.state.player.hp,92);
  const restarted=new CampaignStorage(directory,{reducer:s.engine.reduce.bind(s.engine)});assert.deepEqual((await restarted.read('area-save')).document,loaded.document);
  await restarted.reconcile('area-save',[]);assert.equal((await restarted.read('area-save')).document.state.player.hp,96);
  await restarted.transact('area-save',{id:'retry-after-rollback',anchor:'retry',input},s.engine.reduce.bind(s.engine));assert.equal((await restarted.read('area-save')).document.state.player.hp,92);
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});

test('多区域同分钟先撤销失效防护，结算顺序不会让过期同意继续减伤',async()=>{
 const s=await setup(shield),key=consent(s.c,actorId,s.c.state.minute+2);let c=s.create(s.c,'z-ward',{authorizations:[key]});
 const d=draft(c);s.engine.applyMagicArea(d,{...s.catalog,id:'spell_pulse_fixture',effectSpec:area()},{target:'player'},'a-fire');c=d.document;
 assert.equal(c.state.npcs[actorId].hp,100);assert.equal(c.state.effects[`z-ward:member:${actorId}`].remaining,8);
 c=(await s.run(c,'world_time',{minutes:2},'overlap')).document;assert.equal(c.state.npcs[actorId].hp,96);assert.equal(c.state.player.hp,100);assert.equal(c.state.effects[`z-ward:member:${actorId}`],undefined);
});

test('单位在触发间隔内进入边界也结算，出界不受伤，重入每个分钟最多一次',async()=>{
 const s=await setup();position(s.c,actorId,[3,0]);let c=s.create();c=(await s.run(c,'world_time',{minutes:1},'first-minute')).document;assert.equal(c.state.npcs[actorId].hp,100);
 position(c,actorId,[2,0]);let d=draft(c);settleMagicAreas(d,s.engine);c=d.document;assert.equal(c.state.npcs[actorId].hp,96);
 position(c,actorId,[3,0]);c=(await s.run(c,'world_time',{minutes:1},'second-minute')).document;assert.equal(c.state.npcs[actorId].hp,96);
 position(c,actorId,[1,0]);d=draft(c);settleMagicAreas(d,s.engine);assert.equal(d.document.state.npcs[actorId].hp,92);settleMagicAreas(d,s.engine);assert.equal(d.document.state.npcs[actorId].hp,92);
});
