import test from'node:test';
import assert from'node:assert/strict';
import fs from'node:fs/promises';
import {loadWorld}from'../tools/load-world.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {applyPatches}from'../server-plugin/storage.mjs';
import {prepareMagic,applyMagic,validateMagicCatalog}from'../server-plugin/magic.mjs';
import {lightSpellCandidates,mechanismMap}from'../tools/w2-mechanism-map.mjs';
import {recordLocalContact,localSightClear}from'../server-plugin/environment.mjs';
import {lightAt,shadowBound}from'../server-plugin/magic-light.mjs';
import {magicStatusStats}from'../server-plugin/magic-status.mjs';
import {modelToolCall,toolDefinitions}from'../extension/tools.mjs';

const original=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
function fixture(){
 const world=structuredClone(original),location=new WorldEngine(world).initialFromLegacy(seed,'light').state.location;
 for(const n of world.npcs){n.tier='fixture';delete n.schedule;}
 delete world.rules.weather;
 const feature=(id,kind,state,position=[0,0],extra={})=>({id,name:id,kind,owner:'player',access:'consent',position,state,...extra});
 const rows=[
  feature('feature_lamp','lamp',{emissionLuxAt1m:100,heightMeters:2,lit:true,oxygenMg:10000,fuelGrams:100,temperatureC:100},[0,0]),
  feature('feature_surface','surface',{focusAreaM2:.1,reflectionAreaM2:.1,reflectivityPercent:80,temperatureC:20,wear:[{kind:'scratch',depthMm:.2,lengthMm:5,actor:'private_name'},{kind:'hidden',surface:false}],traces:[{kind:'mud',minute:seed.state?.minute??0,areaCm2:2,actor:'private_actor'}]},[2,0]),
  feature('feature_sample','sample',{sampleType:'mineral',sampleGrams:10,heightMeters:1,spectrum:[{wavelengthNm:450,reflectance:.2,secret:'private_formula'},{wavelengthNm:650,reflectance:.7}]},[1,0]),
  feature('feature_observer','surface',{},[2,2]),
  feature('feature_passage','passage',{widthMeters:1},[1,0]),
  feature('feature_slit','aperture',{widthMeters:.1,apertureMeters:.05,open:false},[1,0]),
  feature('feature_fog','room',{radiusMeters:3},[0,0]),
  feature('feature_near','surface',{},[8,0]),feature('feature_far','surface',{},[18,0]),
  feature('feature_outside','surface',{},[4,0]),
 ];
 const place=world.locations.find(r=>r.id===location);place.features=rows;place.lighting={ambientLux:.2,fogDensity:0};
 const candidates=lightSpellCandidates();world.spells=world.spells.filter(s=>!candidates.some(c=>c.id===s.id));world.spells.push(...candidates);
 for(const s of candidates)if(!world.skills.some(r=>r.id===s.skill))world.skills.push({id:s.skill,name:s.skill,attribute:'精神',profession:null});
 const engine=new WorldEngine(world),doc=engine.initialFromLegacy(seed,'light');
 Object.assign(doc.state.player,{mp:10000,maxMp:10000,hp:1000,maxHp:1000});doc.state.inventory.item_resin={quantity:100};
 for(const s of candidates){doc.state.spells[s.id]={source:{type:'fixture'}};doc.state.skills[s.skill]={proficiency:1000,daily:{},breakthroughs:[]};}
 for(const row of engine.world.locations.find(r=>r.id===location).features)if(row.state.traces)row.state.traces[0].minute=doc.state.minute;
 // A1：引擎在自己的世界副本上工作；夹具的世界和行改指引擎世界（断言不动）
 return{world:engine.world,engine,doc,location,rows:engine.world.locations.find(r=>r.id===location).features,candidates};
}
const reader=s=>({document:s.doc,get:(...p)=>p.reduce((v,k)=>v?.[k],s.doc)});
function draft(s){return{...reader(s),set:(path,value)=>{let n=s.doc;for(const k of path.slice(0,-1))n=n[k]??={};n[path.at(-1)]=structuredClone(value);},remove:path=>{let n=s.doc;for(const k of path.slice(0,-1))n=n[k];delete n[path.at(-1)];}};}
const state=(s,id)=>s.doc.state.records[`physical_feature:${id}`]?.state??s.rows.find(r=>r.id===id).state;
const set=(s,id,changes)=>draft(s).set(['state','records',`physical_feature:${id}`],{id,category:'physical_feature',location:s.location,state:{...state(s,id),...changes}});
const lux=(s,point=[0,0])=>lightAt(reader(s),s.engine,s.location,point).lux;
const dark=s=>{s.engine.byId.get(s.location).lighting.ambientLux=0;set(s,'feature_lamp',{lit:false});};
const reload=s=>{const world=structuredClone(s.world);return{...s,world,engine:new WorldEngine(world),rows:world.locations.find(r=>r.id===s.location).features,doc:JSON.parse(JSON.stringify(s.doc))};};
const spell=(s,op)=>s.candidates.find(r=>r.mechanism===op);
function publicCall(tool,args){
 const call=modelToolCall(tool,args),definition=toolDefinitions().find(r=>r.function.name===call.tool);assert.ok(definition,call.tool);
 const schema=definition.function.parameters;
 for(const key of schema.required??[])assert.ok(call.args[key]!==undefined,key);
 for(const [key,value]of Object.entries(call.args)){assert.ok(schema.properties[key],key);if(schema.properties[key].enum)assert.ok(schema.properties[key].enum.includes(value),`${key}:${value}`);}
 return call;
}
async function run(s,tool,args,id=`${tool}-${s.doc.state.minute}`){const out=await s.engine.reduce(s.doc,{...publicCall(tool,args),eventId:id});s.doc=applyPatches(s.doc,out.patches);return out.result;}
async function cast(s,op,target,extra={}){
 const before=s.doc;
 for(let i=0;i<100;i++){
  const out=await s.engine.reduce(before,{...publicCall('world_cast',{spell:spell(s,op).id,target,...extra}),eventId:`${op}-${before.state.minute}-${i}`});
  if(out.result.success){assert.ok(!out.result.effectFailed,out.result.effectFailed);s.doc=applyPatches(before,out.patches);return out.result;}
 }
 throw Error(`没有成功种子:${op}`);
}
async function refuse(s,tool,args,pattern){const before=structuredClone(s.doc);await assert.rejects(s.engine.reduce(s.doc,{tool,args,eventId:'refuse'}),pattern);assert.deepEqual(s.doc,before);}
const refuseCast=(s,op,target,pattern,extra={})=>refuse(s,'world_cast',{spell:spell(s,op).id,target,...extra},pattern);
// K6: an act that lacked only a licence happens; the norm stack names the offense under the act's own event.
const k6Offended=(doc,out,eventId,offense)=>{const after=applyPatches(doc,out.patches),all=[...out.result.offenses??[],...(out.result.receipt?.consequences??[]).filter(c=>c.type==="offense")],o=all.find(o=>o.offense===offense);assert.ok(o,`${eventId} 应命中${offense}：${JSON.stringify(all)}`);assert.equal(after.state.records[o.record].sourceEvent,eventId);assert.equal(after.state.records[o.record].offender,'player');return {after,result:out.result,offense:o};};
async function k6Cast(s,op,target,offense,extra={},eventId=`unlicensed-${op}`){const out=await s.engine.reduce(s.doc,{tool:'world_cast',args:{spell:spell(s,op).id,target,...extra},eventId});return k6Offended(s.doc,out,eventId,offense);}
const wait=(s,minutes)=>run(s,'world_time',{minutes});
const inspect=async(s,target)=>{const out=await run(s,'world_environment',{operation:'inspect',target});return out.light??out;};
function contact(s,target,point=[0,0]){
 Object.assign(s.doc.state.npcs[target],{location:s.location,scheduleTravel:null,cognitionTravel:null,hp:1000,maxHp:1000});
 s.doc.state.records.local_player_position={location:s.location,point};recordLocalContact(draft(s),s.engine,target,`contact-${target}`);
 s.doc.state.records.local_player_position={location:s.location,point:[0,0]};
}
const npc='npc_hw_linsui';

test('光族候选有完整处理器，正式内容与已接入的腐蚀和契约反制消费者保持一致',()=>{
 const s=fixture(),map=mechanismMap(original);assert.equal(s.candidates.length,20);
 for(const c of s.candidates){assert.deepEqual(validateMagicCatalog(c,{requireHandler:true}),[],c.id);const r=map.rows.find(r=>r.id===c.id);assert.equal(r.status,original.spells.some(s=>s.id===c.id)?'published':'consumer-ready',c.id);assert.deepEqual(r.validation,[]);}
 assert.ok(map.formalSpellCount>=31);assert.equal(map.rows.find(r=>r.mechanism==='corrode').status,'consumer-ready');assert.equal(map.rows.find(r=>r.mechanism==='counter_contract').status,'consumer-ready');
 const c=spell(s,'focus_light');assert.ok(validateMagicCatalog({...c,effectSpec:{...c.effectSpec,power:81}}).length);assert.ok(validateMagicCatalog({...c,duration:31}).length);
 const beam=spell(s,'beam');assert.ok(validateMagicCatalog({...beam,duration:1}).length);assert.ok(validateMagicCatalog({...beam,effectSpec:{...beam.effectSpec,lightDecay:false}}).length);
});
test('掌心柔光跟随实际位置，可以遮挡、恢复和熄灭，距离平方衰减',async()=>{
 const s=fixture();dark(s);const out=await cast(s,'light','player');
 assert.equal(out.illuminated,true);assert.equal(lux(s),20);assert.equal(lux(s,[2,0]),4);
 for(const call of out.controls)assert.deepEqual(publicCall(call.tool,call.args),call);
 s.doc.state.records.local_player_position={location:s.location,point:[2,0]};assert.equal(lux(s,[2,0]),20);
 await run(s,'world_environment',{operation:'inspect',text:'遮光',target:out.effect});assert.equal(lux(s),0);
 const saved=reload(s);await run(saved,'world_environment',{operation:'inspect',text:'复光',target:out.effect});assert.equal(lux(saved,[2,0]),20);
 await run(saved,'world_environment',{operation:'inspect',text:'熄灭',target:out.effect});assert.equal(lux(saved,[2,0]),0);assert.equal(saved.doc.state.effects[out.effect],undefined);
});
test('旧单件照明继续绑定实例，移交后不再照亮玩家',async()=>{
 const s=fixture();dark(s);const before=s.doc;
 for(let i=0;i<100;i++){
  const out=await s.engine.reduce(before,{tool:'world_cast',args:{spell:'spell_light',target:'item_staff'},eventId:`legacy-light-${i}`});
  if(out.result.success){s.doc=applyPatches(before,out.patches);break;}
 }
 const e=Object.values(s.doc.state.effects).find(e=>e.kind==='light');assert.ok(e.targetInstance);assert.ok(lux(s)>0);
 s.doc.state.itemInstances[e.targetInstance].owner=npc;assert.equal(lux(s),0);
});
test('实体遮挡隔绝光线，正常环境读取不会暴露不可见表面证据',async()=>{
 const s=fixture();dark(s);await cast(s,'light','player');
 const out=await cast(s,'reveal_wear','feature_surface');assert.equal(out.observation.wear.length,1);
 s.rows.push({id:'feature_wall',name:'wall',kind:'wall',location:s.location,position:[1,0],owner:'player',state:{blocksSight:true,sightRadiusMeters:.3}});
 // World features, rather than model coordinates, supply this barrier.
 const seen=await run(s,'world_environment',{operation:'inspect',target:'feature_surface'});
 assert.equal(seen.light.visible,false);assert.deepEqual(seen.light.observations,[]);assert.equal(lux(s,[2,0]),0);
});
test('聚光从现有光源取光，只增强有限表面，既不升温也不复制光源',async()=>{
 const s=fixture(),before=lux(s,[2,0]),near=lux(s,[0,0]),heat=state(s,'feature_surface').temperatureC;
 await cast(s,'focus_light','feature_surface',{source:'feature_lamp'});
 assert.ok(lux(s,[2,0])>before);assert.ok(lux(s,[0,0])<near);assert.equal(state(s,'feature_surface').temperatureC,heat);
 await refuseCast(s,'focus_light','feature_surface',/已有分光/,{source:'feature_lamp'});
 set(s,'feature_lamp',{covered:true});assert.equal(lux(s,[2,0]),.2);
 await wait(s,31);assert.equal(Object.values(s.doc.state.effects).some(e=>e.operation==='focus_light'),false);
});
test('聚光拒绝无光源、超距、实体遮挡，失败不扣材料魔力；无授权或授权撤销照样聚光并命中擅用',async()=>{
 const s=fixture();await refuseCast(s,'focus_light','feature_surface',/真实光学/,{source:'feature_missing'});
 set(s,'feature_lamp',{lit:false});await refuseCast(s,'focus_light','feature_surface',/熄灭/,{source:'feature_lamp'});set(s,'feature_lamp',{lit:true});
 s.rows.find(r=>r.id==='feature_lamp').owner=npc;
 /* K6 依据（审查 C-b/C-d，K6 卡"许可是后果"）：他人灯源无授权照样聚光，命中擅用 */await k6Cast(s,'focus_light','feature_surface','unauthorized_use',{source:'feature_lamp'},'k6-no-permit');
 s.doc.state.records.optic_permit={category:'authorization',subject:'feature_lamp',action:'environment_use',grantor:npc,expires:s.doc.state.minute+30,revoked:true};
 await k6Cast(s,'focus_light','feature_surface','unauthorized_use',{source:'feature_lamp',authorization:'optic_permit'},'k6-revoked');
 s.doc.state.records.optic_permit.revoked=false;await cast(s,'focus_light','feature_surface',{source:'feature_lamp',authorization:'optic_permit'});
});
test('反照限定真实反射率和指定观察方向，遮住光源即失去反光',async()=>{
 const s=fixture(),before=lux(s,[2,2]);await cast(s,'reflect','feature_surface',{source:'feature_lamp',destination:'feature_observer'});
 assert.ok(lux(s,[2,2])>before);assert.ok(lux(s,[2,-2])<before);
 set(s,'feature_lamp',{lit:false});assert.equal(lux(s,[2,2]),.2);
});
test('投影按已有光源高度和物件高度测量；样品辨色只返回光谱',async()=>{
 const s=fixture();const measured=await cast(s,'shadow_measure','feature_surface',{source:'feature_lamp',destination:'feature_sample'});
 assert.equal(measured.observation.shadowLengthMeters,1);assert.equal(measured.observation.heightMeters,1);assert.deepEqual(measured.observation.edgePoint,[2,0]);
 const color=await cast(s,'color','feature_sample');assert.deepEqual(color.observation.spectrum,[{wavelengthNm:450,reflectance:.2},{wavelengthNm:650,reflectance:.7}]);assert.ok(!JSON.stringify(color).includes('private_formula'));
 const seen=await inspect(s,'feature_sample');assert.equal(seen.observations[0].operation,'color');
 set(s,'feature_sample',{sampleGrams:0});await refuseCast(s,'color','feature_sample',/样品/);
});
test('磨损与近日痕迹来自实际表面，不输出行为者或隐藏内层',async()=>{
 const s=fixture();set(s,'feature_surface',{traces:[{kind:'mud',minute:s.doc.state.minute,areaCm2:2,actor:'secret_person'},{kind:'old',minute:s.doc.state.minute-2000},{kind:'inside',minute:s.doc.state.minute,surface:false}]});
 const wear=await cast(s,'reveal_wear','feature_surface');const trace=await cast(s,'trace','feature_surface');
 assert.deepEqual(wear.observation.wear,[{kind:'scratch',depthMm:.2,lengthMm:5}]);assert.equal(trace.observation.traces.length,1);assert.equal(trace.observation.traces[0].kind,'mud');
 assert.ok(!JSON.stringify([wear,trace]).includes('private_name'));assert.ok(!JSON.stringify(trace).includes('secret_person'));
 const saved=reload(s);assert.equal((await inspect(saved,'feature_surface')).observations.length,2);
 dark(saved);await refuseCast(saved,'trace','feature_surface',/完全无光/);
});
test('压暗改变实际照度，保持燃料耗氧温度，期限后恢复',async()=>{
 const s=fixture(),before=structuredClone(state(s,'feature_lamp'));await cast(s,'dim','feature_lamp');
 assert.ok(Math.abs(lux(s)-10.2)<1e-9);assert.deepEqual(state(s,'feature_lamp'),before);
 await wait(s,31);assert.equal(lux(s),100.2);assert.deepEqual(state(s,'feature_lamp'),before);
 const hand=await cast(s,'light','player');await cast(s,'dim',hand.effect);assert.equal(lux(s),102.2);
});
test('已亲历路线留下可读光标，未知终点拒绝，过期和旧档零补发',async()=>{
 const s=fixture(),route=s.world.routes.find(r=>[r.from,r.to].includes(s.location));assert.ok(route);
 s.doc.state.discoveries??={};delete s.doc.state.discoveries[route.from===s.location?route.to:route.from];await refuseCast(s,'waymark',route.id,/亲历/);
 s.doc.state.discoveries[route.from]={minute:s.doc.state.minute,source:'亲历'};s.doc.state.discoveries[route.to]={minute:s.doc.state.minute,source:'亲历'};
 const before=lux(s);await cast(s,'waymark',route.id);const seen=await inspect(s,route.id);assert.equal(seen.markers[0].route.id,route.id);assert.deepEqual(seen.markers[0].point,[0,0]);assert.equal(lux(s),before+1);
 const saved=reload(s);await wait(saved,91);assert.deepEqual((await inspect(saved,route.id)).markers,[]);
 const untouched=fixture();assert.equal(Object.values(untouched.doc.state.effects).some(e=>e.operation==='waymark'),false);
});
test('薄雾光改善有限可见距离，浓雾仍限距且不清除雾',async()=>{
 const s=fixture();s.engine.byId.get(s.location).lighting.fogDensity=1;
 assert.equal(localSightClear(reader(s),s.engine,s.location,[0,0],[18,0]),false);
 await cast(s,'fog_light','feature_fog');assert.equal(localSightClear(reader(s),s.engine,s.location,[0,0],[18,0]),true);
 s.engine.byId.get(s.location).lighting.fogDensity=4;assert.equal(localSightClear(reader(s),s.engine,s.location,[0,0],[8,0]),false);assert.equal(s.engine.byId.get(s.location).lighting.fogDensity,4);
 await wait(s,31);assert.equal(localSightClear(reader(s),s.engine,s.location,[0,0],[8,0]),false);
});
test('只读环境接点仍使用实际天气雾限距，与完整Draft一致',()=>{
 const s=fixture();s.world.rules.weather=structuredClone(original.rules.weather);
 const weather=s.world.rules.weather,region=weather.regions.find(r=>r.locations.includes(s.location));assert.ok(region);
 region.indoor=region.indoor.filter(id=>id!==s.location);
 weather.seasonalWeights=weather.seasonalWeights.map(()=>[0,0,0,0,0,1]);weather.persistence=0;
 delete s.engine.byId.get(s.location).lighting;
 const view={get:(...p)=>p.reduce((v,k)=>v?.[k],s.doc)};
 assert.equal(localSightClear(view,s.engine,s.location,[0,0],[8,0]),true);
 assert.equal(localSightClear(view,s.engine,s.location,[0,0],[18,0]),false);
 assert.equal(localSightClear(draft(s),s.engine,s.location,[0,0],[18,0]),false);
});
test('单侧光幕遮蔽视线，另一侧仍可看，声音和空气状态不受改变',async()=>{
 const s=fixture();await cast(s,'light_screen','feature_passage');
 assert.equal(localSightClear(reader(s),s.engine,s.location,[0,0],[2,0]),false);assert.equal(localSightClear(reader(s),s.engine,s.location,[2,0],[0,0]),true);
 assert.equal(state(s,'feature_passage').blocksSound,undefined);
 await wait(s,11);assert.equal(localSightClear(reader(s),s.engine,s.location,[0,0],[2,0]),true);
});
test('私密效果只遮小缝，正常开门动作恢复视线，不能替代实体权限',async()=>{
 const s=fixture();await cast(s,'privacy','feature_slit');assert.equal(localSightClear(reader(s),s.engine,s.location,[0,0],[2,0]),false);
 await run(s,'world_environment',{operation:'inspect',text:'开门',target:'feature_slit'});assert.equal(localSightClear(reader(s),s.engine,s.location,[0,0],[2,0]),true);
 await refuseCast(s,'privacy','feature_slit',/闭合/);
 await run(s,'world_environment',{operation:'inspect',text:'关门',target:'feature_slit'});assert.equal(localSightClear(reader(s),s.engine,s.location,[0,0],[2,0]),false);
 s.rows.find(r=>r.id==='feature_slit').owner=npc;/* K6 依据（审查 C-b/C-d，K6 卡"许可是后果"）：开别人的门照样开，命中擅用 */{const out=await s.engine.reduce(s.doc,{tool:'world_environment',args:{operation:'inspect',text:'开门',target:'feature_slit'},eventId:'k6-door'});k6Offended(s.doc,out,'k6-door','unauthorized_use');}
});
test('阴影束缚接普通接近、跨地移动和逃跑，强光解除且不永久改变位置',async()=>{
 const s=fixture();set(s,'feature_lamp',{lit:false});contact(s,npc);await cast(s,'bind_shadow','player');
 assert.equal(shadowBound(reader(s),s.engine),true);assert.equal(magicStatusStats(reader(s),'player',s.engine.magicStatusContext(reader(s),'player')).evasion,-.1);
 await refuse(s,'world_environment',{operation:'approach',target:'feature_surface'},/阴影/);
 const destination=s.world.routes.find(r=>r.from===s.location||r.to===s.location);await refuse(s,'world_move',{destination:destination.from===s.location?destination.to:destination.from},/阴影/);
 await refuse(s,'world_combat',{target:npc,intent:'flee'},/阴影/);
 await cast(s,'light','player');assert.equal(shadowBound(reader(s),s.engine),false);
 const moved=await run(s,'world_environment',{operation:'approach',target:'feature_surface'});assert.deepEqual(moved.position,[2,0]);
});
test('阴影束缚出界、到期、完全无光均无效，存档跳步与分步一致',async()=>{
 const s=fixture();set(s,'feature_lamp',{lit:false});await cast(s,'bind_shadow','player');
 const saved=reload(s),split=reload(s);await wait(saved,3);for(let i=0;i<3;i++)await wait(split,1);assert.deepEqual(saved.doc.state.effects,split.doc.state.effects);assert.equal(shadowBound(reader(saved),saved.engine),false);
 s.doc.state.records.local_player_position={location:s.location,point:[1,0]};assert.equal(shadowBound(reader(s),s.engine),false);
 dark(saved);await refuseCast(saved,'bind_shadow','player',/微光/);
});
test('遮暗空间只影响有限范围，施法者也承受光照下降，到期不遗留状态',async()=>{
 const s=fixture();set(s,'feature_lamp',{lit:false});const before=lux(s),outside=lux(s,[4,0]);
 await cast(s,'dark_area','feature_fog');assert.ok(Math.abs(lux(s)-before*.1)<1e-9);assert.equal(lux(s,[4,0]),outside);
 const saved=reload(s);assert.equal(lux(saved),lux(s));await wait(saved,11);assert.equal(lux(saved),before);
});
test('眩点和分影影响实际下一次交锋；闭眼者不受影响，分影没有实体物资',async()=>{
 const s=fixture();contact(s,npc);await cast(s,'dazzle',npc);assert.equal(magicStatusStats(reader(s),npc,s.engine.magicStatusContext(reader(s),npc)).hit,-.06);await cast(s,'decoy','player',{destination:npc});
 const ctx=s.engine.magicStatusContext(reader(s),npc);assert.equal(magicStatusStats(reader(s),npc,ctx).hit,-.06);
 assert.equal(magicStatusStats(reader(s),npc,{...ctx,eyesClosed:true}).hit,0);
 const inventory=structuredClone(s.doc.state.inventory),hp=s.doc.state.npcs[npc].hp;
 await run(s,'world_combat',{target:npc,intent:'defend'},'decoy-fight');
 assert.equal(Object.values(s.doc.state.effects).filter(e=>e.operation==='decoy').every(e=>e.remainingUses===0),true);assert.deepEqual(s.doc.state.inventory,inventory);assert.ok(s.doc.state.npcs[npc].hp<=hp);
 const closed=fixture();contact(closed,npc);closed.doc.state.npcs[npc].eyesClosed=true;await refuseCast(closed,'decoy','player',/闭眼/,{destination:npc});
});
test('折光衣进入战斗轮廓判定；显形只清光学伪装并保留精神效果',async()=>{
 const s=fixture();contact(s,npc);s.doc.state.records.support={category:'authorization',subject:npc,action:'support_magic',grantor:npc,grantee:'player',expires:s.doc.state.minute+100};
 await cast(s,'camouflage',npc,{authorization:'support'});
 let ctx=s.engine.magicStatusContext(reader(s),npc);assert.equal(magicStatusStats(reader(s),npc,ctx).evasion,.05);assert.equal(magicStatusStats(reader(s),npc,{...ctx,raining:true}).evasion,.02);
 s.doc.state.effects.mental={kind:'status',target:npc,status:'fear',power:2,expires:s.doc.state.minute+10,source:'mental'};
 const out=await cast(s,'reveal',npc);assert.equal(out.revealed.length,1);assert.ok(s.doc.state.effects.mental);assert.equal(magicStatusStats(reader(s),npc,s.engine.magicStatusContext(reader(s),npc)).evasion,0);
});
test('昼辉束真实扣生命且随距离减弱，无视觉目标减弱，实际射程仍拒绝',async()=>{
 async function beam(point,blind=false){const s=fixture();contact(s,npc,point);s.doc.state.npcs[npc].hasVision=!blind;return(await cast(s,'beam',npc)).damage;}
 const near=await beam([0,0]),far=await beam([10,0]),blind=await beam([0,0],true);assert.ok(near>far);assert.ok(near>blind);
 const s=fixture();contact(s,npc,[41,0]);await refuseCast(s,'beam',npc,/射程/);
});
test('暗影伤害沿途强光实际衰减，端点暗仍会被中段灯光削弱',async()=>{
 async function hit(lit){const s=fixture();s.engine.byId.get(s.location).lighting.ambientLux=0;set(s,'feature_lamp',{lit});s.rows.find(r=>r.id==='feature_lamp').position=[5,0];contact(s,npc,[10,0]);return(await cast(s,'damage_shadow',npc)).damage;}
 assert.ok(await hit(false)>await hit(true));
});
test('施法完成前条件失效不写效果，事件重放与保存重载保持状态',async()=>{
 const s=fixture(),d=draft(s),c=spell(s,'focus_light');const p=prepareMagic.call(s.engine,d,c,{target:'feature_surface',source:'feature_lamp'});
 set(s,'feature_lamp',{lit:false});const result=applyMagic.call(s.engine,d,p,'completion');assert.match(result.effectFailed,/熄灭/);assert.equal(s.doc.state.effects.completion,undefined);
 set(s,'feature_lamp',{lit:true});const action={tool:'world_cast',args:{spell:spell(s,'light').id,target:'player'},eventId:'deterministic'};
 const one=await s.engine.reduce(s.doc,action),two=await s.engine.reduce(s.doc,action);assert.deepEqual(one,two);
 const changed=applyPatches(s.doc,one.patches);assert.deepEqual(JSON.parse(JSON.stringify(changed)).state.effects,changed.state.effects);
});
