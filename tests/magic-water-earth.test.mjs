import test from'node:test';
import assert from'node:assert/strict';
import fs from'node:fs/promises';
import {loadWorld}from'../tools/load-world.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {applyPatches}from'../server-plugin/storage.mjs';
import {validateMagicCatalog}from'../server-plugin/magic.mjs';
import {recordLocalContact}from'../server-plugin/environment.mjs';
import {waterEarthSpellCandidates,airSpellCandidates,mechanismMap}from'../tools/w2-mechanism-map.mjs';
import {magicStatusStats}from'../server-plugin/magic-status.mjs';
import {waterEarthMudPenalty}from'../server-plugin/magic-water-earth.mjs';

const source=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const water=(ml=20000)=>({capacityMl:100000,waterMl:ml,saltMg:ml/10,toxinUg:ml/100,turbidity:2,pathogenRisk:3,odor:'原水'});
function fixture(){
 const world=structuredClone(source),location=new WorldEngine(world).initialFromLegacy(seed,'water-earth').state.location;
 for(const n of world.npcs){n.tier='fixture';delete n.schedule;}
 delete world.rules.weather;
 const feature=(id,kind,state,extra={})=>({id,name:id,kind,owner:'player',access:'consent',position:[0,0],state,...extra});
 const rows=[
  feature('feature_pool','water',water()),feature('feature_drain','container',water(0)),feature('feature_mud_drain','container',water(0)),
  feature('feature_cup','container',{...water(10000),pressureKpa:10,leakMlPerMinute:100},{waterEarthProcess:'leak',links:{drain:'feature_drain'}}),
  feature('feature_seam','seam',{...water(10000),pressureKpa:3,leakMlPerMinute:100},{waterEarthProcess:'leak',links:{drain:'feature_mud_drain'}}),
  feature('feature_clay','soil',{texture:'clay',clayGrams:1000}),
  feature('feature_channel','channel',{lengthMeters:3,depthCm:20,velocityMetersPerSecond:1,flowLimitMl:10000,blockagePercent:0},{links:{source:'feature_pool',destination:'feature_soil'}}),
  feature('feature_soil','soil',{...water(0),baseMoisturePercent:10,moisturePercent:80,texture:'loam',compactionPercent:80,areaM2:4,reliefCm:5,soilVolumeLitres:400,radiusMeters:1,stones:5,roots:['root_a'],pipes:['pipe_a'],worked:false},{links:{channel:'feature_channel'}}),
  feature('feature_rock','rock',{integrity:200,crackMm:1,echoErrorMeters:.6,strata:[{depthMeters:1,material:'limestone',echoMs:10,gap:true},{depthMeters:2,material:'granite',echoMs:30,gap:false},{depthMeters:8,material:'deep_hidden',echoMs:80}],oreBands:[{depthMeters:.5,mineral:'iron'},{depthMeters:8,mineral:'hidden_gold'}],oreGrams:1000},{links:{structures:['feature_wall']}}),
  feature('feature_wall','structure',{integrity:200,loadKg:700,capacityKg:500,sinkMmPerMinute:2,sagMm:0},{waterEarthProcess:'sink'}),
  feature('feature_levee','levee',{earthGrams:100000,erosionGramsPerMinute:100,erodedGrams:0},{waterEarthProcess:'erosion',links:{silt:'feature_silt'}}),
  feature('feature_silt','silt_heap',{siltGrams:0}),feature('feature_stones','stones',{massGrams:100,stoneCount:10,loose:true}),
  feature('feature_light','object',{massGrams:1000,massMg:1000000,integrity:100,material:'wood'}),
  feature('feature_passage','passage',{widthMeters:1},{position:[1,0]}),feature('feature_far','object',{integrity:100},{position:[4,0]}),
  feature('feature_room','room',{}, {airModel:{capacityMg:20000,ventilationMgPerMinute:0,hearingRadiusMeters:.2},links:{exits:['feature_outside']}}),
  feature('feature_outside','room',{}, {position:[2,0],airModel:{capacityMg:20000,ventilationMgPerMinute:0,hearingRadiusMeters:.2},links:{exits:[]}}),
 ];
 world.locations.find(r=>r.id===location).features=rows;
 const candidates=waterEarthSpellCandidates(),extra=airSpellCandidates().filter(s=>['damage_wind','carry_voice','lift','deflect'].includes(s.mechanism));
 world.spells=world.spells.filter(s=>![...candidates,...extra].some(c=>c.id===s.id));world.spells.push(...candidates,...extra);
 for(const s of [...candidates,...extra])if(!world.skills.some(r=>r.id===s.skill))world.skills.push({id:s.skill,name:s.skill,attribute:'精神',profession:null});
 const engine=new WorldEngine(world),doc=engine.initialFromLegacy(seed,'water-earth');
 Object.assign(doc.state.player,{mp:10000,maxMp:10000,hp:1000,maxHp:1000,limbMassGrams:1500});doc.state.inventory.item_resin={quantity:100};
 for(const s of [...candidates,...extra]){doc.state.spells[s.id]={source:{type:'fixture'}};doc.state.skills[s.skill]={proficiency:1000,daily:{},breakthroughs:[]};}
 // Existing formal watering spells retain their data and material requirements.
 for(const s of world.spells.filter(s=>['irrigate','soil_water','condense'].includes(s.mechanism))){doc.state.spells[s.id]={source:{type:'fixture'}};doc.state.skills[s.skill]={proficiency:1000,daily:{},breakthroughs:[]};}
 // A1：引擎在自己的世界副本上工作；夹具的世界和行改指引擎世界（断言不动）
 return{world:engine.world,engine,doc,location,rows:engine.world.locations.find(r=>r.id===location).features,candidates};
}
const reader=s=>({get:(...p)=>p.reduce((v,k)=>v?.[k],s.doc)});
const row=(s,id)=>s.rows.find(r=>r.id===id);
const state=(s,id)=>s.doc.state.records[`physical_feature:${id}`]?.state??row(s,id).state;
const set=(s,id,changes)=>{s.doc.state.records[`physical_feature:${id}`]={id,category:'physical_feature',location:s.location,state:{...structuredClone(state(s,id)),...changes}};};
const reload=s=>{const world=structuredClone(s.world);return{...s,world,rows:world.locations.find(r=>r.id===s.location).features,engine:new WorldEngine(world),doc:JSON.parse(JSON.stringify(s.doc))};};
async function run(s,tool,args,id=`${tool}-${s.doc.state.minute}`){const out=await s.engine.reduce(s.doc,{tool,args,eventId:id});s.doc=applyPatches(s.doc,out.patches);return out.result;}
const wait=(s,minutes)=>run(s,'world_time',{minutes},`wait-${s.doc.state.minute}-${minutes}`);
const spell=(s,op)=>s.world.spells.find(r=>r.mechanism===op&&s.doc.state.spells[r.id]);
async function cast(s,op,target,extra={}){
 const original=s.doc;
 for(let i=0;i<100;i++){
  const out=await s.engine.reduce(original,{tool:'world_cast',args:{spell:spell(s,op).id,target,...extra},eventId:`cast-${op}-${original.state.minute}-${i}`});
  if(out.result.success){assert.ok(!out.result.effectFailed,out.result.effectFailed);s.doc=applyPatches(original,out.patches);return out.result;}
 }
 throw Error(`没有成功固定种子:${op}`);
}
async function refuse(s,op,target,pattern,extra={}){
 const before=structuredClone(s.doc);
 await assert.rejects(s.engine.reduce(s.doc,{tool:'world_cast',args:{spell:spell(s,op).id,target,...extra},eventId:`refuse-${op}`}),pattern);assert.deepEqual(s.doc,before);
}
// K6: an act that lacked only a licence happens; the norm stack names the offense under the act's own event.
const k6Offended=(doc,out,eventId,offense)=>{const after=applyPatches(doc,out.patches),all=[...out.result.offenses??[],...(out.result.receipt?.consequences??[]).filter(c=>c.type==="offense")],o=all.find(o=>o.offense===offense);assert.ok(o,`${eventId} 应命中${offense}：${JSON.stringify(all)}`);assert.equal(after.state.records[o.record].sourceEvent,eventId);assert.equal(after.state.records[o.record].offender,'player');return {after,result:out.result,offense:o};};
async function k6Cast(s,op,target,offense,extra={}){const eventId=`unlicensed-${op}`,out=await s.engine.reduce(s.doc,{tool:'world_cast',args:{spell:spell(s,op).id,target,...extra},eventId});return k6Offended(s.doc,out,eventId,offense);}
async function refuseTool(s,tool,args,pattern){const before=structuredClone(s.doc);await assert.rejects(s.engine.reduce(s.doc,{tool,args,eventId:'refuse-tool'}),pattern);assert.deepEqual(s.doc,before);}
function contact(s,target,point=[0,0]){
 const d={...reader(s),set:(p,value)=>{let n=s.doc;for(const k of p.slice(0,-1))n=n[k]??={};n[p.at(-1)]=structuredClone(value);}};
 Object.assign(s.doc.state.npcs[target],{location:s.location,scheduleTravel:null,cognitionTravel:null,limbMassGrams:1500});
 s.doc.state.records.local_player_position={location:s.location,point};recordLocalContact(d,s.engine,target,`contact-${target}`);
 s.doc.state.records.local_player_position={location:s.location,point:[0,0]};
}
async function sameAfterExpiry(s,minutes){
 const saved=reload(s),split=reload(s);await wait(saved,minutes);for(let i=0;i<minutes;i++)await wait(split,1);
 for(const f of s.rows)assert.deepEqual(state(saved,f.id),state(split,f.id),f.id);
 assert.deepEqual(saved.doc.state.effects,split.doc.state.effects);
 assert.equal(Object.values(saved.doc.state.effects).some(e=>e.kind==='water_earth'),false);return saved;
}
function totals(s){
 let ml=0,salt=0,toxin=0;
 for(const f of s.rows){const a=state(s,f.id);if(a.waterMl!==undefined){ml+=a.waterMl;salt+=a.saltMg??0;toxin+=a.toxinUg??0;}}
 for(const e of Object.values(s.doc.state.effects))if(e.held&&!e.returned){ml+=e.held.waterMl;salt+=e.held.saltMg;toxin+=e.held.toxinUg;}
 return{ml,salt,toxin};
}

test('十七个水土候选都有消费者，正式目录与已接入机制保持一致',()=>{
 const candidates=waterEarthSpellCandidates();assert.equal(candidates.length,17);
 const map=mechanismMap(source);assert.equal(map.formalSpellCount,source.spells.length);
 for(const c of candidates){assert.deepEqual(validateMagicCatalog(c,{requireHandler:true}),[]);const r=map.rows.find(r=>r.id===c.id);assert.equal(r.status,'consumer-ready');assert.deepEqual(r.validation,[]);}
 assert.equal(map.rows.find(r=>r.mechanism==='preserve').status,'consumer-ready');assert.equal(map.rows.find(r=>r.mechanism==='area_water').status,'missing-consumer');
 const c=candidates.find(c=>c.mechanism==='seal');assert.ok(validateMagicCatalog({...c,effectSpec:{...c.effectSpec,power:21}}).length);assert.ok(validateMagicCatalog({...c,duration:11}).length);
});
test('容器止漏实际停止泄漏，到期恢复泄漏，污染和水量在重载后守恒',async()=>{
 const s=fixture(),before=totals(s);set(s,'feature_cup',{pressureKpa:21});await refuse(s,'seal','feature_cup',/压力/);set(s,'feature_cup',{pressureKpa:10});
 await cast(s,'seal','feature_cup');const ml=state(s,'feature_cup').waterMl;await wait(s,2);assert.equal(state(s,'feature_cup').waterMl,ml);
 const saved=await sameAfterExpiry(s,11);assert.equal(state(saved,'feature_cup').waterMl,ml-300);assert.deepEqual(totals(saved),before);
});
test('止漏超压当场破裂，完成前压力改变不会错误创建密封',async()=>{
 const s=fixture();await cast(s,'seal','feature_cup');set(s,'feature_cup',{pressureKpa:30});const ml=state(s,'feature_cup').waterMl;await wait(s,1);assert.equal(state(s,'feature_cup').waterMl,ml-100);assert.equal(Object.values(s.doc.state.effects).some(e=>e.operation==='seal'),false);
 const t=fixture();row(t,'feature_cup').owner='npc_owner';row(t,'feature_cup').access='consent';t.doc.state.records.permit={category:'authorization',subject:'feature_cup',grantor:'npc_owner',action:'environment_use',expires:t.doc.state.minute+1};
 const original=t.doc;let found=false;
 for(let i=0;i<100;i++){const out=await t.engine.reduce(original,{tool:'world_cast',args:{spell:spell(t,'seal').id,target:'feature_cup',authorization:'permit'},eventId:`completion-${i}`});if(out.result.checkSuccess){/* K6 依据（审查 C-b/C-d，K6 卡"许可是后果"）：许可在完工前到期，施法照样完成，命中擅用 */assert.equal(out.result.effectFailed,undefined);k6Offended(original,out,`completion-${i}`,'unauthorized_use');found=true;break;}}
 assert.ok(found);
});
test('泥封消耗已有黏土，检查维持低压缝口，到期和漏检恢复泄漏',async()=>{
 const s=fixture();await refuse(s,'mud_seal','feature_seam',/真实水土对象/);set(s,'feature_clay',{clayGrams:199});await refuse(s,'mud_seal','feature_seam',/黏土/,{source:'feature_clay'});set(s,'feature_clay',{clayGrams:1000});
 await cast(s,'mud_seal','feature_seam',{source:'feature_clay'});assert.equal(state(s,'feature_clay').clayGrams,800);assert.equal(state(s,'feature_seam').sealedClayGrams,200);
 const ml=state(s,'feature_seam').waterMl;await wait(s,2);await run(s,'world_field',{operation:'environment_inspect',target:'feature_seam'});await wait(s,2);assert.equal(state(s,'feature_seam').waterMl,ml);
 const saved=await sameAfterExpiry(s,9);assert.ok(state(saved,'feature_seam').waterMl<ml);assert.equal(state(saved,'feature_clay').clayGrams+state(saved,'feature_seam').sealedClayGrams,1000);
 const t=fixture();await cast(t,'mud_seal','feature_seam',{source:'feature_clay'});const start=state(t,'feature_seam').waterMl;await wait(t,4);assert.equal(state(t,'feature_seam').waterMl,start-100);
 const over=fixture();set(over,'feature_seam',{pressureKpa:6});await refuse(over,'mud_seal','feature_seam',/压力/,{source:'feature_clay'});
});
test('测流限定实际河段，缓流改变正常引水与测量，不能阻断洪峰',async()=>{
 const s=fixture();await refuse(s,'survey_water','feature_soil',/水道/);set(s,'feature_channel',{lengthMeters:6});await refuse(s,'survey_water','feature_channel',/长度/);set(s,'feature_channel',{lengthMeters:3});
 const observation=await cast(s,'survey_water','feature_channel');assert.equal(observation.observation.flowMlPerMinute,10000);assert.equal(observation.observation.lengthMeters,3);
 set(s,'feature_channel',{floodPeak:true});await refuse(s,'slow_flow','feature_channel',/洪峰/);set(s,'feature_channel',{floodPeak:false});
 await cast(s,'slow_flow','feature_channel');const read=await cast(s,'survey_water','feature_channel');assert.equal(read.observation.flowMlPerMinute,5000);assert.equal(read.observation.velocityMetersPerSecond,.5);
 const before=totals(s),transfer=await cast(s,'irrigate','feature_channel');assert.equal(transfer.movedMl,5000);assert.deepEqual(totals(s),before);
 const saved=await sameAfterExpiry(s,6),normal=await cast(saved,'survey_water','feature_channel');assert.equal(normal.observation.flowMlPerMinute,10000);
});
test('水绳束缚单肢或两公斤轻物，水和污染预留，到期重载归还',async()=>{
 const s=fixture(),before=totals(s);await refuse(s,'bind_water','player',/水土对象/);s.doc.state.player.limbMassGrams=2001;await refuse(s,'bind_water','player',/载荷/,{source:'feature_pool'});s.doc.state.player.limbMassGrams=1500;
 const effect=await cast(s,'bind_water','player',{source:'feature_pool'});assert.equal(effect.reservedWaterMl,2000);assert.equal(state(s,'feature_pool').reservedWaterMl,2000);assert.equal(magicStatusStats(reader(s),'player').evasion,-.1);
 await refuseTool(s,'world_field',{operation:'environment_approach',target:'feature_far'},/水绳/);
 await refuseTool(s,'world_move',{destination:s.world.locations.find(r=>r.id!==s.location).id},/水绳/);
 const saved=await sameAfterExpiry(s,3);assert.equal(state(saved,'feature_pool').reservedWaterMl,0);assert.deepEqual(totals(saved),before);assert.equal(magicStatusStats(reader(saved),'player').evasion,0);
 delete saved.doc.state.player.limbMassGrams;await cast(saved,'bind_water','player',{source:'feature_pool'});await sameAfterExpiry(saved,3);
 const t=fixture();set(t,'feature_light',{massGrams:2001});await refuse(t,'bind_water','feature_light',/载荷/,{source:'feature_pool'});set(t,'feature_light',{massGrams:1000});await cast(t,'bind_water','feature_light',{source:'feature_pool'});
 await refuse(t,'lift','feature_light',/水绳/);await sameAfterExpiry(t,3);
});
test('正常风刃切断水媒介立即解除束缚，不损失水或移除其他效果',async()=>{
 const s=fixture(),before=totals(s);await cast(s,'bind_water','player',{source:'feature_pool'});const cut=await cast(s,'damage_wind','feature_pool');assert.equal(cut.severed.length,1);assert.deepEqual(totals(s),before);await run(s,'world_field',{operation:'environment_approach',target:'feature_far'});
 const t=fixture();const target=Object.keys(t.doc.state.npcs)[0];contact(t,target);await cast(t,'bind_water',target,{source:'feature_pool'});assert.equal(magicStatusStats(reader(t),target).evasion,-.1);await sameAfterExpiry(t,3);
 const dry=fixture();set(dry,'feature_pool',{waterMl:1999});await refuse(dry,'bind_water','player',/水量/,{source:'feature_pool'});
});
test('水帘阻断正常施法视线并削弱传声，水声暴露位置，过期恢复',async()=>{
 const s=fixture(),before=totals(s),npc=Object.keys(s.doc.state.npcs)[0];contact(s,npc,[2,0]);
 set(s,'feature_passage',{widthMeters:3});await refuse(s,'veil_water','feature_passage',/宽度/,{source:'feature_pool'});set(s,'feature_passage',{widthMeters:1});
 await cast(s,'veil_water','feature_passage',{source:'feature_pool'});
 await refuse(s,'damage_earth','feature_far',/视线/,{source:'feature_stones'});
 assert.deepEqual(s.doc.state.records[Object.keys(s.doc.state.records).find(k=>k.startsWith('water_heard:')&&k.endsWith(`:${npc}`))].point,[1,0]);
 const sound=await run(s,'world_field',{operation:'environment_sound',target:'feature_room',destination:'feature_outside',text:'警号'});assert.ok(sound.heard.includes(npc));assert.equal(s.doc.state.records[`air_heard:world_field-${s.doc.state.minute}:${npc}`].volume,20);
 const saved=await sameAfterExpiry(s,4);assert.deepEqual(totals(saved),before);const after=await cast(saved,'damage_earth','feature_far',{source:'feature_stones'});assert.equal(after.damage,40);
 const dry=fixture();set(dry,'feature_pool',{waterMl:999});await refuse(dry,'veil_water','feature_passage',/水量/,{source:'feature_pool'});
});
test('探土只读质地，松土接回潮调用而不排石播种，平地保留体积根系管道',async()=>{
 const s=fixture();await refuse(s,'sense_soil','feature_pool',/耕土/);const read=await cast(s,'sense_soil','feature_soil');assert.equal(read.observation.texture,'loam');assert.equal(read.observation.owner,undefined);
 await refuse(s,'soil_water','feature_soil',/处理土壤/);set(s,'feature_soil',{frozen:true});await refuse(s,'till','feature_soil',/冻结/);set(s,'feature_soil',{frozen:false});
 const tilled=await cast(s,'till','feature_soil');assert.equal(state(s,'feature_soil').worked,true);assert.equal(state(s,'feature_soil').compactionPercent,40);assert.equal(state(s,'feature_soil').stones,5);
 // The real spell works 4 m². Its progress shares the hand-work fact shape;
 // the physical feature retains compaction, not a second stored area counter.
 assert.equal(tilled.tilledAreaM2,4);assert.deepEqual(s.doc.state.records['cultivation:feature_soil'].tilledAreaM2,{numerator:'4',denominator:'1'});
 assert.equal(state(s,'feature_soil').tilledAreaM2,undefined);
 const wet=await cast(s,'soil_water','feature_soil');assert.equal(wet.movedMl,10000);assert.ok(state(s,'feature_soil').waterMl>0);
 set(s,'feature_soil',{areaM2:5});await refuse(s,'level_ground','feature_soil',/面积/);set(s,'feature_soil',{areaM2:4});await cast(s,'level_ground','feature_soil');
 const soil=state(s,'feature_soil');assert.equal(soil.reliefCm,0);assert.equal(soil.soilVolumeLitres,400);assert.deepEqual(soil.roots,['root_a']);assert.deepEqual(soil.pipes,['pipe_a']);
 const saved=await sameAfterExpiry(s,3);assert.deepEqual(state(saved,'feature_soil'),soil);await refuse(saved,'level_ground','feature_soil',/高差/);
});
test('岩层空隙与矿纹来自浅层样本，误差保留，不能凭空给矿或泄漏深层',async()=>{
 const s=fixture();await refuse(s,'survey_earth','feature_pool',/岩层/);await refuse(s,'ore','feature_soil',/岩层/);
 const survey=await cast(s,'survey_earth','feature_rock');assert.equal(survey.observation.strata.length,2);assert.equal(survey.observation.errorMeters,.6);
 const ore=await cast(s,'ore','feature_rock');assert.deepEqual(ore.observation.bands,[{depthMeters:.5,mineral:'iron'}]);assert.equal(ore.extracted,0);assert.equal(state(s,'feature_rock').oreGrams,1000);
 const saved=reload(s);const again=await cast(saved,'survey_earth','feature_rock');assert.deepEqual(again.observation,survey.observation);const minerals=await cast(saved,'ore','feature_rock');assert.deepEqual(minerals.observation,ore.observation);
 set(s,'feature_rock',{strata:null});await refuse(s,'survey_earth','feature_rock',/样本/);set(s,'feature_rock',{oreBands:[]});await refuse(s,'ore','feature_rock',/条带/);
});
test('受力测量不修复，短时支撑阻止实际下沉，超载拒绝，到期继续下沉',async()=>{
 const s=fixture();await refuse(s,'structural_sense','feature_soil',/承重/);const measured=await cast(s,'structural_sense','feature_wall');assert.equal(measured.observation.overloadKg,200);assert.equal(measured.repaired,0);
 set(s,'feature_wall',{loadKg:1001});await refuse(s,'support','feature_wall',/超载/);set(s,'feature_wall',{loadKg:700});await cast(s,'support','feature_wall');
 const sag=state(s,'feature_wall').sagMm;await wait(s,1);assert.equal(state(s,'feature_wall').sagMm,sag);
 const saved=await sameAfterExpiry(s,4);assert.equal(state(saved,'feature_wall').sagMm,sag+6);assert.ok(state(saved,'feature_wall').integrity<measured.observation.integrity);
});
test('堤岸临时减轻冲刷，土量进入实际沉积处，到期恢复原冲刷',async()=>{
 const s=fixture();await refuse(s,'levee','feature_soil',/土堤/);await cast(s,'levee','feature_levee');const earth=state(s,'feature_levee').earthGrams;await wait(s,2);assert.equal(state(s,'feature_levee').earthGrams,earth-100);
 const saved=await sameAfterExpiry(s,10);assert.equal(state(saved,'feature_levee').earthGrams+state(saved,'feature_silt').siltGrams,100000);const before=state(saved,'feature_levee').earthGrams;await wait(saved,1);assert.equal(state(saved,'feature_levee').earthGrams,before-100);
 set(s,'feature_levee',{earthGrams:0});await refuse(s,'levee','feature_levee',/土量/);
});
test('扩裂要求已有裂隙，震动伤及真实邻接结构，权限在修改前检查',async()=>{
 const s=fixture();set(s,'feature_rock',{crackMm:0});await refuse(s,'fracture','feature_rock',/裂隙/);set(s,'feature_rock',{crackMm:1});
 row(s,'feature_wall').owner='npc_owner';/* K6 依据（审查 C-b/C-d，K6 卡"许可是后果"）：波及他人墙体照样施放，命中擅用 */await k6Cast(s,'fracture','feature_rock','unauthorized_use');row(s,'feature_wall').owner='player';
 await cast(s,'fracture','feature_rock');assert.equal(state(s,'feature_rock').crackMm,6);assert.equal(state(s,'feature_rock').integrity,195);assert.equal(state(s,'feature_wall').vibrationDamage,5);
 const saved=await sameAfterExpiry(s,3);assert.equal(state(saved,'feature_rock').crackMm,6);assert.equal(state(saved,'feature_wall').vibrationDamage,5);
});
test('陷足湿土影响正常走近和区域内角色，铺板或脱离范围立即解除',async()=>{
 const s=fixture();set(s,'feature_soil',{moisturePercent:59});await refuse(s,'mud_trap','feature_soil',/湿度/);set(s,'feature_soil',{moisturePercent:80,planked:true});await refuse(s,'mud_trap','feature_soil',/铺板/);set(s,'feature_soil',{planked:false});
 await cast(s,'mud_trap','feature_soil');assert.equal(waterEarthMudPenalty(reader(s),s.engine),2);const traveled=await run(s,'world_field',{operation:'environment_approach',target:'feature_far'});assert.equal(traveled.mudMinutes,2);assert.equal(waterEarthMudPenalty(reader(s),s.engine),0);await sameAfterExpiry(s,6);
 const boards=fixture();await cast(boards,'mud_trap','feature_soil');set(boards,'feature_soil',{planked:true});assert.equal(waterEarthMudPenalty(reader(boards),boards.engine),0);const safe=await run(boards,'world_field',{operation:'environment_approach',target:'feature_far'});assert.equal(safe.mudMinutes,0);
 const all=fixture(),npc=Object.keys(all.doc.state.npcs)[0];contact(all,npc);await cast(all,'mud_trap','feature_soil');assert.equal(waterEarthMudPenalty(reader(all),all.engine,npc),2);set(all,'feature_soil',{moisturePercent:30});assert.equal(waterEarthMudPenalty(reader(all),all.engine,npc),0);await sameAfterExpiry(all,6);
});
test('石弹消耗真实小石，正常活体伤害和实体命中都有持久落地归属',async()=>{
 const s=fixture();await refuse(s,'damage_earth','player',/真实水土对象/);set(s,'feature_stones',{stoneCount:0});await refuse(s,'damage_earth','player',/数量/,{source:'feature_stones'});set(s,'feature_stones',{stoneCount:10,massGrams:501});await refuse(s,'damage_earth','player',/质量/,{source:'feature_stones'});set(s,'feature_stones',{massGrams:100});
 const result=await cast(s,'damage_earth','player',{source:'feature_stones'});assert.equal(result.damage,40);assert.equal(state(s,'feature_stones').stoneCount,9);const landing=s.doc.state.records[result.projectile];assert.equal(landing.massGrams,100);assert.equal(landing.owner,'player');assert.deepEqual(landing.point,[0,0]);
 const physical=await cast(s,'damage_earth','feature_light',{source:'feature_stones'});assert.equal(physical.integrity,60);assert.equal(state(s,'feature_stones').stoneCount,8);
 const saved=await sameAfterExpiry(s,3);assert.deepEqual(saved.doc.state.records[result.projectile],landing);assert.equal(state(saved,'feature_stones').stoneCount+Object.values(saved.doc.state.records).filter(r=>r.category==='physical_projectile').length,10);
 // S4 supplies zone visibility, but a projectile still needs an actual landing point.
 const f=fixture(),npc=Object.keys(f.doc.state.npcs).find(id=>f.doc.state.npcs[id].location===f.location);assert.ok(npc);
 await refuse(f,'damage_earth',npc,/实际目标位置/,{source:'feature_stones'});
 // Obtain contact through real melee rather than teleporting an NPC in the fixture.
 for(let i=0;i<20&&!f.doc.state.records[`local_actor_position:${npc}`];i++)await run(f,'world_combat',{target:npc,intent:'defend'},`stone-contact-${i}`);
 assert.ok(f.doc.state.records[`local_actor_position:${npc}`]);
 const aimed=await cast(f,'damage_earth',npc,{source:'feature_stones'});assert.equal(f.doc.state.records[aimed.projectile].target,npc);
});
test('私有对象撤销授权、远处或遮挡对象拒绝，水资源预留防止容器超装',async()=>{
 const s=fixture();row(s,'feature_soil').owner='npc_owner';/* K6 依据（审查 C-b/C-d，K6 卡"许可是后果"）：翻他人土地照样施放，命中擅用 */await k6Cast(s,'till','feature_soil','unauthorized_use');s.doc.state.records.permit={category:'authorization',subject:'feature_soil',action:'environment_use',grantor:'npc_owner',expires:s.doc.state.minute+100,revoked:true};/* 撤销的许可同样只是后果 */await k6Cast(s,'till','feature_soil','unauthorized_use',{authorization:'permit'});
 row(s,'feature_pool').position=[30,0];await refuse(s,'bind_water','player',/距离/,{source:'feature_pool'});
 const t=fixture();row(t,'feature_pool').kind='container';set(t,'feature_pool',{capacityMl:20000});await cast(t,'bind_water','player',{source:'feature_pool'});await refuse(t,'condense','feature_pool',/容器已满|湿度/);const saved=await sameAfterExpiry(t,3);assert.equal(state(saved,'feature_pool').waterMl,20000);
});
test('水绳作用于普通人物，作息实际推迟出发，到期重载与分步等待相同',async()=>{
 const s=fixture(),npc=Object.keys(s.doc.state.npcs)[0];contact(s,npc);delete s.doc.state.npcs[npc].limbMassGrams;
 const casted=await cast(s,'bind_water',npc,{source:'feature_pool'}),edge=s.world.routes.find(r=>[r.from,r.to].includes(s.location)&&r.modes.includes('walk'));
 assert.ok(edge);const destination=edge.from===s.location?edge.to:edge.from,definition=s.world.npcs.find(n=>n.id===npc);
 s.world.routes=[{id:'route_bind_test',from:s.location,to:destination,modes:['walk'],lengthKm:.5,speedKmh:3,toll:0,closedSeasons:[]}];
 // The fixture's only road has no connection to the real disaster network.
 delete s.world.rules.hazardClock;
 definition.schedule={default:[{start:0,end:1440,location:destination,activity:'工作',services:[]}]};s.doc.state.npcs[npc].coins=10000;
 const saved=reload(s),split=reload(s);await wait(split,1);assert.equal(split.doc.state.npcs[npc].location,s.location);assert.equal(Boolean(split.doc.state.npcs[npc].scheduleTravel),false);
 await wait(split,2);await wait(saved,3);assert.deepEqual(saved.doc.state.npcs[npc],split.doc.state.npcs[npc]);assert.equal(saved.doc.state.npcs[npc].scheduleTravel.depart,casted.expires);
});
test('环境检查不会绕过勘察深度，也不把传感结果当作修复或资源产出',async()=>{
 const s=fixture(),inspect=await run(s,'world_field',{operation:'environment_inspect',target:'feature_rock'});
 assert.equal(JSON.stringify(inspect).includes('hidden_gold'),false);assert.equal(JSON.stringify(inspect).includes('deep_hidden'),false);
 const beforeInventory=structuredClone(s.doc.state.inventory);await cast(s,'ore','feature_rock');assert.equal(s.doc.state.inventory.item_iron?.quantity,beforeInventory.item_iron?.quantity);
});
