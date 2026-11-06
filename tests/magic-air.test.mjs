import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {recordLocalContact} from '../server-plugin/environment.mjs';
import {airSpellCandidates,mechanismMap} from '../tools/w2-mechanism-map.mjs';
import {validateMagicCatalog} from '../server-plugin/magic.mjs';
import {projectileAirPenalty} from '../server-plugin/magic-air.mjs';
import {toolDefinitions} from '../extension/tools.mjs';
const source=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const model={heatCapacityJPerC:1000,maximumC:1000,ambientC:20,passiveExchangeJPerMinute:50,burnMgPerMinute:500,fuelJPerMg:20,efficiencyPermille:900,ashPermille:50,ignitionMaximumMg:5000,ignitable:true,dryable:true,fuels:[]};
function fixture(){
 const world=structuredClone(source),location=new WorldEngine(world).initialFromLegacy(seed,'air-test').state.location;
 // These scenes use stationary actors so sound observations are controlled.
 for(const npc of world.npcs){npc.tier='fixture';delete npc.schedule;}
 delete world.rules.weather;
 // This controlled route replaces the real flood and disease network.
 delete world.rules.hazardClock;
 const feature=(id,kind,state={},extra={})=>({id,name:id,kind,owner:'player',access:'consent',position:[0,0],state,...extra});
 const room=(id,x,exits)=>feature(id,'room',{}, {position:[x,0],links:{exits},airModel:{capacityMg:20000,ventilationMgPerMinute:0,vaporCapacityMg:20000,windVector:[1,0],echoDelayMs:30,hearingRadiusMeters:.4}});
 const rooms=[room('feature_room',0,['feature_hall']),room('feature_hall',1,['feature_outside']),room('feature_outside',2,[])];
 const hearth=feature('feature_hearth','object',{}, {thermalModel:structuredClone(model),thermalInitial:{temperatureC:20,fuelMg:4000}});
 const ember=feature('feature_ember','object',{}, {thermalModel:structuredClone(model),thermalInitial:{temperatureC:20,fuelMg:0}});
 rooms[0].fireLinks=[[hearth.id,ember.id]];
 const grain=feature('feature_grain','grain',{moistureMg:9000,turned:false,exposed:false},{links:{air:rooms[0].id}});
 const cloth=feature('feature_cloth','object',{looseDustMg:2000,stainMg:500,material:'cloth',integrity:100},{links:{air:rooms[0].id}});
 const metal=feature('feature_metal','object',{material:'iron',integrity:100});
 const light=feature('feature_light','object',{massMg:1000000,heightMeters:0});
 const loose=feature('feature_loose','object',{massMg:1000,loose:true});
 const ledge=feature('feature_ledge','ledge',{fallHeightMeters:10});
 const submerged=room('feature_submerged',0,[]);submerged.airModel.breathable=false;
 const destination=world.locations.find(r=>r.id!==location).id;
 world.routes=[{id:'route_air_test',from:location,to:destination,modes:['walk','boat'],closedSeasons:[],lengthKm:.5,speedKmh:3,toll:0,bearing:[1,0]}];
 const sail=feature('feature_sail','sail',{deployed:true,torn:false},{links:{route:'route_air_test',air:rooms[0].id}});
 const road=feature('feature_road','road',{resistanceMinutes:5},{links:{route:'route_air_test'}});
 world.locations.find(r=>r.id===location).features=[...rooms,hearth,ember,grain,cloth,metal,light,loose,ledge,submerged,sail,road];
 const candidates=airSpellCandidates(),ignite={...world.spells[0],id:'spell_air_ignite',name:'air_ignite',skill:'skill_air_ignite',stage:0,mp:2,minutes:1,difficulty:10,duration:0,rangeMeters:3,materials:[],effectSpec:{kind:'object',operation:'ignite',power:5000}};
 world.spells=world.spells.filter(r=>!candidates.some(c=>c.id===r.id));world.spells.push(...candidates,ignite);
 for(const spell of [...candidates,ignite])if(!world.skills.some(r=>r.id===spell.skill))world.skills.push({id:spell.skill,name:spell.skill,attribute:'精神',profession:null});
 const arrow={...world.items.find(r=>r.id==='item_staff'),id:'item_air_bow',name:'air_bow',projectileMg:10000};world.items.push(arrow);
 const engine=new WorldEngine(world),doc=engine.initialFromLegacy(seed,'air-test');doc.state.player.mp=10000;doc.state.player.maxMp=10000;doc.state.player.hp=1000;doc.state.player.maxHp=1000;
 doc.state.inventory.item_resin={quantity:50};doc.state.inventory.item_air_bow={quantity:1,durability:100};
 for(const s of [...candidates,ignite]){doc.state.spells[s.id]={source:{type:'fixture'}};doc.state.skills[s.skill]={proficiency:1000,daily:{},breakthroughs:[]};}

 // A1：引擎在自己的世界副本上工作；夹具对象改指引擎世界里的行（断言不动）
 const bound=engine.world.locations.find(r=>r.id===location).features,b=r=>bound.find(f=>f.id===r.id);
 return{world:engine.world,engine,doc,location,destination,candidates,ignite,rooms:rooms.map(b),hearth:b(hearth),grain:b(grain),cloth:b(cloth),metal:b(metal),light:b(light),loose:b(loose),ledge:b(ledge),sail:b(sail),road:b(road),submerged:b(submerged)};
}
const dynamic=(s,row)=>s.doc.state.records[`physical_feature:${typeof row==='string'?row:row.id}`]?.state;
const air=(s,row='feature_room')=>dynamic(s,row).air;
const reload=s=>({...s,world:structuredClone(s.world),engine:new WorldEngine(structuredClone(s.world)),doc:JSON.parse(JSON.stringify(s.doc))});
async function run(s,tool,args,id){const out=await s.engine.reduce(s.doc,{tool,args,eventId:id});s.doc=applyPatches(s.doc,out.patches);return out.result;}
const wait=(s,minutes)=>run(s,'world_time',{minutes},`wait-${s.doc.state.minute}-${minutes}`);
async function cast(s,op,target,extra={}){
 const spell=op==='ignite'?s.ignite:s.candidates.find(r=>r.mechanism===op),original=s.doc;
 for(let i=0;i<100;i++){
  const out=await s.engine.reduce(original,{tool:'world_cast',args:{spell:spell.id,target,...extra},eventId:`cast-${op}-${original.state.minute}-${i}`});
  if(out.result.success){s.doc=applyPatches(original,out.patches);return out.result;}
  if(out.result.effectFailed)throw Error(out.result.effectFailed);
 }
 throw Error(`无成功固定种子:${op}`);
}
async function refuse(s,op,target,pattern,extra={}){
 const before=structuredClone(s.doc),spell=s.candidates.find(r=>r.mechanism===op);
 await assert.rejects(s.engine.reduce(s.doc,{tool:'world_cast',args:{spell:spell.id,target,...extra},eventId:`refuse-${op}`}),pattern);assert.deepEqual(s.doc,before);
}
// K6: an act that lacked only a licence happens; the norm stack names the offense under the act's own event.
const k6Offended=(doc,out,eventId,offense)=>{const after=applyPatches(doc,out.patches),all=[...out.result.offenses??[],...(out.result.receipt?.consequences??[]).filter(c=>c.type==="offense")],o=all.find(o=>o.offense===offense);assert.ok(o,`${eventId} 应命中${offense}：${JSON.stringify(all)}`);assert.equal(after.state.records[o.record].sourceEvent,eventId);assert.equal(after.state.records[o.record].offender,'player');return {after,result:out.result,offense:o};};
async function k6Cast(s,op,target,offense,extra={}){const spell=s.candidates.find(r=>r.mechanism===op),eventId=`unlicensed-${op}`,out=await s.engine.reduce(s.doc,{tool:'world_cast',args:{spell:spell.id,target,...extra},eventId});return k6Offended(s.doc,out,eventId,offense);}
function contact(s,target,x=0){
 const document=s.doc,d={get:(...p)=>p.reduce((v,k)=>v?.[k],document),set:(p,value)=>{let node=document;for(const k of p.slice(0,-1))node=node[k]??={};node[p.at(-1)]=structuredClone(value);}};
 s.doc.state.npcs[target].location=s.location;s.doc.state.npcs[target].scheduleTravel=null;s.doc.state.npcs[target].cognitionTravel=null;
 const elevationMeters=s.doc.state.records.local_player_position?.elevationMeters;
 s.doc.state.records.local_player_position={location:s.location,point:[x,0],...(elevationMeters!==undefined?{elevationMeters}:{})};recordLocalContact(d,s.engine,target,`contact-${x}`);
 s.doc.state.records.local_player_position={location:s.location,point:[0,0],...(elevationMeters!==undefined?{elevationMeters}:{})};
}
test('风族十四项候选均可用，机制图和工具参数接入而正式目录不变',()=>{
 const candidates=airSpellCandidates();assert.equal(candidates.length,14);
 for(const c of candidates)assert.deepEqual(validateMagicCatalog(c,{requireHandler:true}),[]);
 const map=mechanismMap(source);assert.equal(map.formalSpellCount,source.spells.length);
 for(const c of candidates){const r=map.rows.find(r=>r.id===c.id);assert.equal(r.status,'consumer-ready');assert.deepEqual(r.validation,[]);}
 const definitions=toolDefinitions();
 const tools=definitions.map(r=>r.function??r);
 const spell=tools.find(r=>r.name==='world_cast'),environment=tools.find(r=>r.name==='world_field');
 assert.ok(spell.parameters.properties.path);assert.ok(spell.parameters.properties.source);
 for(const op of ['turn_grain','sound','fall','breathe'])assert.ok(environment.parameters.properties.operation.enum.includes(`environment_${op}`));
});
test('招风和分烟沿真实出口转移，火源持续产烟，封闭路径拒绝且不造氧',async()=>{
 const s=fixture();await refuse(s,'airflow','feature_room',/出口/,{});
 s.rooms[0].links.exits=[];await refuse(s,'smoke','feature_room',/阻断/,{path:['feature_room','feature_hall']});s.rooms[0].links.exits=['feature_hall'];
 await cast(s,'ignite','feature_hearth');await cast(s,'airflow','feature_room',{destination:'feature_hall'});
 const before=air(s).smokeInputMg;await wait(s,2);
 assert.ok(air(s).smokeInputMg>before);assert.ok(air(s,'feature_hall').smokeMg>0);assert.ok(dynamic(s,s.hearth).thermal.burning);
 let smoke=0,oxygen=0,used=0;
 for(const r of s.rooms){const a=air(s,r);smoke+=a.smokeMg;oxygen+=a.oxygenMg;used+=a.oxygenUsedMg-a.oxygenAddedMg;assert.equal(a.smokeMg+a.ventedSmokeMg,a.smokeInputMg);}
 assert.equal(smoke,dynamic(s,s.hearth).thermal.exhaustFuelMg);assert.equal(oxygen,60000-used);
 const saved=reload(s),split=reload(s);await wait(saved,6);for(let i=0;i<6;i++)await wait(split,1);
 for(const row of s.rooms)assert.deepEqual(dynamic(saved,row),dynamic(split,row));assert.deepEqual(dynamic(saved,s.hearth),dynamic(split,s.hearth));
 assert.ok(air(saved).smokeMg>0);assert.equal(Object.values(saved.doc.state.effects).some(e=>e.operation==='airflow'),false);
 const path=fixture();await cast(path,'ignite','feature_hearth');await cast(path,'smoke','feature_room',{path:['feature_room','feature_hall','feature_outside']});await wait(path,2);assert.ok(air(path,'feature_outside').smokeMg>0);
});
test('出口关闭立即停止排烟，封焰空气隔绝不会被招风绕过',async()=>{
 const s=fixture();await cast(s,'ignite','feature_hearth');await cast(s,'smoke','feature_room',{destination:'feature_hall'});
 s.doc.state.records['physical_feature:feature_room'].state.closedExits=['feature_hall'];const before=air(s,'feature_hall').smokeMg;await wait(s,2);assert.equal(air(s,'feature_hall').smokeMg,before);assert.ok(air(s).smokeMg>0);
 const sealed=fixture();await cast(sealed,'ignite','feature_hearth');await cast(sealed,'airflow','feature_room',{destination:'feature_hall'});
 sealed.doc.state.effects.seal={kind:'heat',operation:'contain_fire',target:'feature_room',power:1,upkeepMp:1,location:sealed.location,started:sealed.doc.state.minute,expires:sealed.doc.state.minute+5};
 const oxygen=air(sealed).oxygenMg;await wait(sealed,1);assert.equal(air(sealed,'feature_hall').smokeMg,0);assert.ok(air(sealed).oxygenMg<oxygen);
});
test('拂尘把松尘送入实际空气，牢固污渍留下；空表面、远处和私有对象拒绝',async()=>{
 const s=fixture();const out=await cast(s,'clean_air',s.cloth.id);assert.equal(out.removedDustMg,1000);assert.equal(dynamic(s,s.cloth).looseDustMg,1000);assert.equal(dynamic(s,s.cloth).stainMg,500);assert.equal(air(s).dustMg,1000);
 await cast(s,'clean_air',s.cloth.id);await refuse(s,'clean_air',s.cloth.id,/松散尘土/);
 const remote=fixture();remote.cloth.position=[100,0];await refuse(remote,'clean_air',remote.cloth.id,/距离/);
 const privateObject=fixture();privateObject.cloth.owner='npc_hw_linsui';/* K6 依据（审查 C-b/C-d，K6 卡"许可是后果"）：他人之物无授权照样施放，命中擅用 */await k6Cast(privateObject,'clean_air',privateObject.cloth.id,'unauthorized_use');
 assert.equal(dynamic(reload(s),s.cloth).looseDustMg,0);
});
test('听风返回登记风向和回声，墙或缺失观测不能凭空穿透',async()=>{
 const s=fixture(),out=await cast(s,'sense_air','feature_room',{destination:'feature_hall'});assert.deepEqual(out.windVector,[1,0]);assert.equal(out.echoDelayMs,30);
 s.rooms[0].links.exits=[];await refuse(s,'sense_air','feature_room',/阻断/,{destination:'feature_hall'});
 const missing=fixture();delete missing.rooms[0].airModel.windVector;await refuse(missing,'sense_air','feature_room',/风向/,{destination:'feature_hall'});
});
test('传话沿途可听并留实际听见记录，静息幕同时削弱传话和警号，到期恢复',async()=>{
 const s=fixture();contact(s,'npc_hw_linsui',1);contact(s,'npc_hw_gucen',2);
 const first=await cast(s,'carry_voice','feature_room',{path:['feature_room','feature_hall','feature_outside'],text:'请避开烟气'});
 assert.ok(first.heard.includes('npc_hw_linsui'));assert.ok(first.heard.includes('npc_hw_gucen'));
 assert.ok(Object.values(s.doc.state.records).some(r=>r.category==='heard_sound'&&r.subject==='npc_hw_linsui'&&r.text==='请避开烟气'));
 await cast(s,'quiet','feature_hall');const quiet=reload(s);
 const muted=await cast(quiet,'carry_voice','feature_room',{path:['feature_room','feature_hall','feature_outside'],text:'警号'});assert.equal(muted.heard.includes('npc_hw_gucen'),false);
 const alarm=await run(quiet,'world_environment',{operation:'sound',target:'feature_room',path:['feature_room','feature_hall','feature_outside'],text:'警号'},'alarm');assert.equal(alarm.heard.includes('npc_hw_linsui'),false);
 await wait(quiet,6);contact(quiet,'npc_hw_linsui',1);const restored=await run(quiet,'world_environment',{operation:'sound',target:'feature_room',destination:'feature_hall',text:'警号'},'restored-alarm');assert.ok(restored.heard.includes('npc_hw_linsui'));
 await refuse(s,'carry_voice','feature_room',/限定长度/,{destination:'feature_hall',text:'字'.repeat(81)});
 const noAir=fixture();await refuse(noAir,'quiet',noAir.cloth.id,/空气容量/);
});
test('晾谷必须实际翻谷，水分转为空气水汽，封闭或饱和不能烘干',async()=>{
 const s=fixture();await refuse(s,'dry_grain',s.grain.id,/翻动/);await run(s,'world_environment',{operation:'turn_grain',target:s.grain.id},'turn');await cast(s,'dry_grain',s.grain.id);
 const saved=reload(s),split=reload(s);await wait(saved,3);for(let i=0;i<3;i++)await wait(split,1);
 assert.equal(dynamic(saved,s.grain).moistureMg,6000);assert.equal(air(saved).waterVaporMg,3000);assert.deepEqual(dynamic(saved,s.grain),dynamic(split,s.grain));
 saved.doc.state.records['physical_feature:feature_room'].state.closedExits=['feature_hall'];await wait(saved,2);assert.equal(dynamic(saved,s.grain).moistureMg,6000);
 const closed=fixture();closed.grain.state.turned=true;closed.grain.state.exposed=true;closed.rooms[0].links.exits=[];await refuse(closed,'dry_grain',closed.grain.id,/封闭/);
 const saturated=fixture();saturated.grain.state.turned=true;saturated.grain.state.exposed=true;saturated.rooms[0].airModel.vaporCapacityMg=1;await cast(saturated,'dry_grain',saturated.grain.id);await wait(saturated,2);assert.equal(dynamic(saturated,s.grain).moistureMg,8999);
});
test('缓降真实下降扣较少生命，超载及无同意拒绝，到期和重载恢复正常坠伤',async()=>{
 const s=fixture();await run(s,'world_environment',{operation:'approach',target:s.ledge.id},'climb');await cast(s,'slow_fall','player');const saved=reload(s),out=await run(saved,'world_environment',{operation:'fall',target:s.ledge.id},'fall');assert.equal(out.damage,10);assert.equal(saved.doc.state.player.hp,990);
 await assert.rejects(saved.engine.reduce(saved.doc,{tool:'world_environment',args:{operation:'fall',target:s.ledge.id},eventId:'already-grounded'}),/坠落高度/);
 const expired=reload(s);await wait(expired,3);const plain=await run(expired,'world_environment',{operation:'fall',target:s.ledge.id},'late-fall');assert.equal(plain.damage,50);
 const heavy=fixture();heavy.doc.state.inventory.item_ration.quantity=200;await refuse(heavy,'slow_fall','player',/重型/);
 const other=fixture();contact(other,'npc_hw_linsui');await refuse(other,'slow_fall','npc_hw_linsui',/自愿同意/);
 const npc=fixture();await run(npc,'world_environment',{operation:'approach',target:npc.ledge.id},'npc-climb');contact(npc,'npc_hw_linsui');npc.doc.state.npcs.npc_hw_linsui.hp=100;npc.doc.state.npcs.npc_hw_linsui.maxHp=100;
 npc.doc.state.records.support={category:'authorization',subject:'npc_hw_linsui',grantor:'npc_hw_linsui',grantee:'player',action:'support_magic',expires:npc.doc.state.minute+10};await cast(npc,'slow_fall','npc_hw_linsui',{authorization:'support'});
 const npcSaved=reload(npc),descent=await run(npcSaved,'world_environment',{operation:'fall',target:npc.ledge.id,subject:'npc_hw_linsui',authorization:'support'},'npc-fall');assert.equal(descent.damage,10);assert.equal(npcSaved.doc.state.npcs.npc_hw_linsui.hp,90);assert.equal(npcSaved.doc.state.npcs.npc_hw_linsui.elevationMeters,0);
});
test('轻物托举真实升高并卷动周边松物，超重及他人财物拒绝，到期落回支撑',async()=>{
 const s=fixture(),out=await cast(s,'lift',s.light.id);assert.equal(dynamic(s,s.light).heightMeters,1);assert.ok(out.scattered.includes(s.loose.id));assert.equal(dynamic(s,s.loose).displacementMeters,1);
 const saved=reload(s);await wait(saved,3);assert.equal(dynamic(saved,s.light).heightMeters,0);
 const heavy=fixture();heavy.light.state.massMg=3000000;await refuse(heavy,'lift',heavy.light.id,/质量|超重/);
 const privateLoose=fixture();privateLoose.loose.owner='npc_hw_linsui';/* K6 依据（审查 C-b/C-d，K6 卡"许可是后果"）：同上 */await k6Cast(privateLoose,'lift',privateLoose.light.id,'unauthorized_use');
 await refuse(s,'lift',s.light.id,/叠加/);
});
test('气囊从现有洁净空气取氧，实际呼吸最多一分钟，重载保留有限余量',async()=>{
 const s=fixture();await cast(s,'air_bubble','player',{source:'feature_room'});assert.equal(air(s).oxygenMg,19400);
 const saved=reload(s),breath=await run(saved,'world_environment',{operation:'breathe',target:s.submerged.id},'bubble-breath');assert.equal(breath.damage,0);assert.equal(breath.oxygenUsedMg,600);
 const empty=await run(saved,'world_environment',{operation:'breathe',target:s.submerged.id},'empty-breath');assert.equal(empty.damage,5);assert.equal(saved.doc.state.player.hp,995);
 const exertion=reload(s);exertion.doc.state.player.breathingExertion=true;const short=await run(exertion,'world_environment',{operation:'breathe',target:s.submerged.id},'hard-breath');assert.equal(short.damage,5);
 const smoke=fixture();await cast(smoke,'ignite','feature_hearth');await wait(smoke,1);await refuse(smoke,'air_bubble','player',/可呼吸/,{source:'feature_room'});
 const missing=fixture();await refuse(missing,'air_bubble','player',/真实空气对象/);
 const stale=reload(s);await wait(stale,2);assert.equal(Object.values(stale.doc.state.effects).some(e=>e.operation==='air_bubble'),false);
});
test('船帆只缩短实际顺风航路，破帆和缺风拒绝；逆风环延迟正常移动及同行者',async()=>{
 const s=fixture(),baseline=s.engine.route(s.location,s.destination,'boat',s.doc.state.minute,s.doc.randomSeed).minutes;await cast(s,'sail',s.sail.id);
 const saved=reload(s),moved=await run(saved,'world_move',{destination:s.destination,mode:'boat'},'sail-move');assert.ok(moved.minutes<baseline);assert.deepEqual(s.rooms[0].airModel.windVector,[1,0]);
 const broken=fixture();broken.sail.state.torn=true;await refuse(broken,'sail',broken.sail.id,/完整船帆/);
 const missing=fixture();delete missing.rooms[0].airModel.windVector;await refuse(missing,'sail',missing.sail.id,/风向/);
 const expired=fixture();await cast(expired,'sail',expired.sail.id);await wait(expired,6);assert.equal((await run(expired,'world_move',{destination:expired.destination,mode:'boat'},'expired-sail')).minutes,baseline);
 const road=fixture();road.doc.state.player.companions=['npc_hw_linsui'];road.doc.state.npcs.npc_hw_linsui.location=road.location;const normal=road.engine.route(road.location,road.destination,'walk',road.doc.state.minute,road.doc.randomSeed).minutes;
 await cast(road,'area_wind',road.road.id);const walked=await run(reload(road),'world_move',{destination:road.destination,mode:'walk'},'wind-walk');assert.equal(walked.minutes,normal+5);
 const noRoad=fixture();await refuse(noRoad,'area_wind',noRoad.cloth.id,/真实道路/);
});
test('偏箭风对轻投射影响更大，正常交锋消费命中修正，近战与到期无偏转',async()=>{
 const s=fixture();contact(s,'npc_hw_linsui');s.doc.state.records.permission={category:'authorization',subject:'npc_hw_linsui',grantor:'npc_hw_linsui',grantee:'player',action:'support_magic',expires:s.doc.state.minute+100};
 await cast(s,'deflect','npc_hw_linsui',{authorization:'permission'});
 const draft={get:(...p)=>p.reduce((v,k)=>v?.[k],s.doc)};assert.equal(projectileAirPenalty(draft,'npc_hw_linsui',10000),-.6);assert.equal(projectileAirPenalty(draft,'npc_hw_linsui',200000),-.15);assert.equal(projectileAirPenalty(draft,'npc_hw_linsui',undefined),0);
 const saved=reload(s),bare=reload(s);bare.doc.state.effects={};let misses=0;
 for(let i=0;i<30;i++){
  const args={target:'npc_hw_linsui',weapon:'item_air_bow',intent:'attack'},id=`arrow-${i}`;
  const a=await saved.engine.reduce(saved.doc,{tool:'world_combat',args,eventId:id}),b=await bare.engine.reduce(bare.doc,{tool:'world_combat',args,eventId:id});if(a.result.damage<b.result.damage)misses++;
 }
 assert.ok(misses>0);await wait(saved,3);assert.equal(projectileAirPenalty({get:(...p)=>p.reduce((v,k)=>v?.[k],saved.doc)},'npc_hw_linsui',10000),0);
 const noConsent=fixture();contact(noConsent,'npc_hw_linsui');await refuse(noConsent,'deflect','npc_hw_linsui',/自愿同意/);
});
test('风刃切软物与硬甲有材质差异，真实活体受伤，遮挡及无材质对象拒绝',async()=>{
 const s=fixture();assert.equal((await cast(s,'damage_wind',s.cloth.id)).damage,40);assert.equal((await cast(s,'damage_wind',s.metal.id)).damage,10);assert.equal(dynamic(reload(s),s.metal).integrity,90);
 contact(s,'npc_hw_linsui');s.doc.state.npcs.npc_hw_linsui.hp=100;s.doc.state.npcs.npc_hw_linsui.maxHp=100;const bare=reload(s),armored=reload(s);armored.doc.state.npcs.npc_hw_linsui.armorMaterial='iron';
 const plain=await cast(bare,'damage_wind','npc_hw_linsui'),hard=await cast(armored,'damage_wind','npc_hw_linsui');assert.ok(plain.damage>hard.damage);assert.equal(armored.doc.state.npcs.npc_hw_linsui.hp,100-hard.damage);
 const unknown=fixture();await refuse(unknown,'damage_wind',unknown.light.id,/材质/);
 const wall=fixture();wall.cloth.position=[1,0];wall.world.locations.find(r=>r.id===wall.location).features.push({id:'feature_wall',name:'wall',kind:'wall',position:[.5,0],state:{blocksSight:true,sightRadiusMeters:.1}});await refuse(wall,'damage_wind',wall.cloth.id,/遮挡/);
});
