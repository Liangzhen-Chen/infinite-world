import test from'node:test';
import assert from'node:assert/strict';
import fs from'node:fs/promises';
import os from'node:os';
import path from'node:path';
import {loadWorld}from'../tools/load-world.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {applyPatches,CampaignStorage}from'../server-plugin/storage.mjs';
import {prepareMagic,applyMagic,validateMagicCatalog}from'../server-plugin/magic.mjs';
import {careSpellCandidates,mechanismMap}from'../tools/w2-mechanism-map.mjs';
import {recordLocalContact}from'../server-plugin/environment.mjs';
import {magicStatusStats}from'../server-plugin/magic-status.mjs';
import {modelToolCall,toolDefinitions}from'../extension/tools.mjs';

const original=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const npc='npc_hw_linsui';
function medical(){return{
 bloodMl:4000,pain:4,wounds:[{id:'cut',simple:true,depthMm:2,areaCm2:5,bleedingMlPerMinute:3,contamination:20,infectionRisk:10,toxinUg:0,foreignBody:false,closed:false}],
 symptoms:[{kind:'redness',observable:true},{kind:'fever',temperatureC:38.5,observable:true},{kind:'secret_diagnosis',observable:false,pathogen:'private_pathogen'}],
 parasites:[{id:'worm',identified:true,accessible:true,sizeMm:3,count:2,hostDamage:2}],
 tendon:{ruptured:true,aligned:true,infection:false,integrity:50,maxLoadKg:2},
};}
function plant(extra={}){return{waterMl:100000,nutrientMg:100000,temperatureC:10,plant:{stage:'seedling',alive:true,health:100,frostToleranceC:0,waterMlPerMinute:1,nutrientMgPerMinute:1,rootLengthMeters:0,graftGroup:'apple',herbKnown:true,commonProperties:['常见苦味药性'],privateRecipe:'secret_recipe',...extra}};}
function food(kind='fruit'){return{closed:true,integrity:100,temperatureC:20,insulationPercent:100,foodLots:[{id:'lot',kind,amountGrams:100000,spoiledGrams:0,badGrams:0,decayGramsPerMinute:2}]};}
function fixture(){
 const world=structuredClone(original);
 for(const n of world.npcs){n.tier='fixture';delete n.schedule;}
 delete world.rules.weather;
 const location=new WorldEngine(world).initialFromLegacy(seed,'care').state.location;
 const feature=(id,kind,state,position=[0,0])=>({id,name:id,kind,owner:'player',access:'consent',position,state,careProcess:kind==='plant'?'plant':kind==='container'?'food':undefined});
 const rows=[feature('feature_herb','plant',plant()),feature('feature_seedling','plant',plant()),feature('feature_stock','plant',plant({graft:{scion:'feature_scion',cutAligned:true,attached:true,rejection:10,union:80}})),feature('feature_scion','plant',plant()),feature('feature_water','basin',{waterMl:1000},[.1,0]),feature('feature_fruit','container',food()),feature('feature_cabinet','container',food('grain'))];
 world.locations.find(r=>r.id===location).features=rows;
 const candidates=careSpellCandidates();world.spells=world.spells.filter(s=>!candidates.some(c=>c.id===s.id));world.spells.push(...candidates);
 for(const c of candidates)if(!world.skills.some(s=>s.id===c.skill))world.skills.push({id:c.skill,name:c.skill,attribute:'精神',profession:null});
 const engine=new WorldEngine(world),doc=engine.initialFromLegacy(seed,'care');
 Object.assign(doc.state.player,{mp:100000,maxMp:100000,hp:100,maxHp:100,medical:medical()});
 doc.state.inventory.item_herb={quantity:100};doc.state.inventory.item_resin={quantity:100};
 for(const c of candidates){doc.state.spells[c.id]={source:{type:'fixture'}};doc.state.skills[c.skill]={proficiency:1000,daily:{},breakthroughs:[]};}
 const gardening=world.skills.find(s=>s.name.includes('园艺'));doc.state.skills[gardening.id]={proficiency:200,daily:{},breakthroughs:[]};
 return{world,engine,doc,location,rows,candidates,serial:0};
}
const reader=s=>({document:s.doc,get:(...p)=>p.reduce((v,k)=>v?.[k],s.doc)});
function draft(s){return{...reader(s),set:(path,value)=>{let n=s.doc;for(const k of path.slice(0,-1))n=n[k]??={};n[path.at(-1)]=structuredClone(value);},remove:path=>{let n=s.doc;for(const k of path.slice(0,-1))n=n[k];delete n[path.at(-1)];}};}
const state=(s,id)=>s.doc.state.records[`physical_feature:${id}`]?.state??s.rows.find(r=>r.id===id).state;
const set=(s,id,changes)=>draft(s).set(['state','records',`physical_feature:${id}`],{id,category:'physical_feature',location:s.location,state:{...state(s,id),...changes}});
const spell=(s,op)=>s.candidates.find(c=>(c.effectSpec.operation??c.mechanism)===op);
function publicCall(tool,args){
 const call=modelToolCall(tool,args),definition=toolDefinitions().find(r=>r.function.name===call.tool);assert.ok(definition);
 const schema=definition.function.parameters;
 for(const key of schema.required??[])assert.notEqual(call.args[key],undefined,key);
 for(const [key,value]of Object.entries(call.args)){assert.ok(schema.properties[key],key);if(schema.properties[key].enum)assert.ok(schema.properties[key].enum.includes(value),key);}
 return call;
}
async function run(s,tool,args,id=`care-action-${++s.serial}`){
 const out=await s.engine.reduce(s.doc,{...publicCall(tool,args),eventId:id});s.doc=applyPatches(s.doc,out.patches);return out.result;
}
async function cast(s,op,target='player',extra={}){
 const before=s.doc,c=spell(s,op),prefix=++s.serial;
 for(let i=0;i<100;i++){
  const eventId=`care-${prefix}-${op}-${i}`,out=await s.engine.reduce(before,{...publicCall('world_cast',{spell:c.id,target,...extra}),eventId});
  if(out.result.checkSuccess&&out.result.effectFailed)assert.fail(out.result.effectFailed);
  if(out.result.success){s.doc=applyPatches(before,out.patches);return{...out.result,eventId};}
 }
 assert.fail(`没有成功种子:${op}`);
}
async function refuse(s,op,target,pattern,extra={}){
 const before=structuredClone(s.doc);
 await assert.rejects(s.engine.reduce(s.doc,{...publicCall('world_cast',{spell:spell(s,op).id,target,...extra}),eventId:`refuse-${++s.serial}`}),pattern);
 assert.deepEqual(s.doc,before);
}
const wait=(s,minutes)=>run(s,'world_time',{minutes});
const reload=s=>{const world=structuredClone(s.world);return{...s,world,engine:new WorldEngine(world),rows:world.locations.find(r=>r.id===s.location).features,doc:JSON.parse(JSON.stringify(s.doc))};};
const inspect=async(s,target,extra={})=>(await run(s,'world_environment',{operation:'inspect',target,...extra})).care;
function contact(s,point=[0,0]){
 Object.assign(s.doc.state.npcs[npc],{location:s.location,scheduleTravel:null,cognitionTravel:null,hp:100,maxHp:100,status:'正常',medical:medical()});
 s.doc.state.records.local_player_position={location:s.location,point};
 recordLocalContact(draft(s),s.engine,npc,'care-contact');
 s.doc.state.records.local_player_position={location:s.location,point:[0,0]};
 s.doc.state.records.healing={category:'authorization',subject:npc,action:'healing',grantor:npc,grantee:'player',expires:s.doc.state.minute+10000};
}

test('三族全部候选接入处理器，正式内容不变，T89补齐仪式医疗消费者',()=>{
 const s=fixture(),map=mechanismMap(original);assert.equal(s.candidates.length,15);
 for(const c of s.candidates){assert.deepEqual(validateMagicCatalog(c,{requireHandler:true}),[],c.id);const r=map.rows.find(r=>r.id===c.id);assert.equal(r.status,original.spells.some(s=>s.id===c.id)?'published':'consumer-ready');}
 assert.equal(map.formalSpellCount,31);const restore=map.rows.find(r=>r.mechanism==='restore');
 assert.equal(restore.status,'consumer-ready');assert.equal(restore.handler.kind,'ritual');assert.equal(restore.handler.operation,'restore');assert.deepEqual(restore.validation,[]);
 const c=spell(s,'pain');assert.ok(validateMagicCatalog({...c,duration:31}).length);assert.ok(validateMagicCatalog({...c,rangeMeters:4}).length);
 assert.ok(validateMagicCatalog({...c,effectSpec:{...c.effectSpec,power:4}}).length);
 assert.ok(validateMagicCatalog({...c,effectSpec:{...c.effectSpec,universalHeal:true}}).length);
 assert.ok(validateMagicCatalog({...c,effectSpec:{...c.effectSpec,operation:'unknown'}}).length);
 assert.equal(spell(s,'garden').effectSpec.kind,'growth');
});
test('浅表止血阻止实际血液继续流失，未补血未回血，重载保持止血',async()=>{
 const s=fixture(),hp=s.doc.state.player.hp;await wait(s,2);assert.equal(s.doc.state.player.medical.bloodMl,3994);
 await cast(s,'hemostasis','player',{source:'cut'});const blood=s.doc.state.player.medical.bloodMl;
 assert.equal(blood,3991);assert.equal(s.doc.state.player.medical.wounds[0].bleedingMlPerMinute,0);
 const saved=reload(s);await wait(saved,31);assert.equal(saved.doc.state.player.medical.bloodMl,blood);assert.equal(saved.doc.state.player.hp,hp);
 assert.equal((await inspect(saved,'player')).wounds[0].bleedingMlPerMinute,0);
});
test('止血拒绝深创、过量出血、未选创面、死者和缺失病理，费用不变',async()=>{
 for(const [edit,pattern]of [
  [s=>{s.doc.state.player.medical.wounds[0].depthMm=10;},/浅表/],
  [s=>{s.doc.state.player.medical.wounds[0].bleedingMlPerMinute=10;},/浅表/],
  [s=>{s.doc.state.player.status='死亡';},/死亡/],
  [s=>{delete s.doc.state.player.medical;},/伤病/],
 ]){const s=fixture();edit(s);await refuse(s,'hemostasis','player',pattern,{source:'cut'});}
 await refuse(fixture(),'hemostasis','player',/具体创面/);
});
test('清洁创面仅除常见污染，毒素异物保留，闭合拒绝异物和未止血',async()=>{
 const s=fixture(),w=s.doc.state.player.medical.wounds[0];w.foreignBody=true;w.toxinUg=7;
 const out=await cast(s,'clean_wound','player',{source:'cut'});assert.equal(out.cleaned,20);assert.equal(out.toxinUg,7);assert.equal(out.foreignBody,true);
 assert.equal(s.doc.state.player.medical.wounds[0].contamination,0);
 await refuse(s,'clean_wound','player',/没有可清洁/,{source:'cut'});
 await refuse(s,'close_wound','player',/无异物毒素/,{source:'cut'});
 const saved=reload(s);assert.equal((await inspect(saved,'player')).wounds[0].contamination,0);
});
test('简单合创保留失血，清创后安全闭合，污染未清会增加感染并出现征象',async()=>{
 const clean=fixture();await cast(clean,'hemostasis','player',{source:'cut'});await cast(clean,'clean_wound','player',{source:'cut'});
 const before=clean.doc.state.player.medical.bloodMl;await cast(clean,'close_wound','player',{source:'cut'});
 assert.equal(clean.doc.state.player.medical.wounds[0].closed,true);assert.equal(clean.doc.state.player.medical.bloodMl,before);
 assert.equal(clean.doc.state.player.medical.wounds[0].infectionRisk,10);await refuse(clean,'close_wound','player',/已经闭合/,{source:'cut'});
 const dirty=fixture(),w=dirty.doc.state.player.medical.wounds[0];w.bleedingMlPerMinute=0;w.contamination=60;
 await cast(dirty,'close_wound','player',{source:'cut'});assert.equal(dirty.doc.state.player.medical.wounds[0].infectionRisk,70);
 const saved=reload(dirty);await wait(saved,2880);assert.equal(saved.doc.state.player.medical.wounds[0].infected,true);
 const signs=await cast(saved,'disease_sense');assert.ok(signs.observation.signs.some(s=>s.kind==='swelling'));
});
test('合创拒绝非简单、大面积、未止血、深创，净创拒绝闭合创面',async()=>{
 for(const changes of [{simple:false},{areaCm2:20},{depthMm:10},{bleedingMlPerMinute:1}]){
  const s=fixture();Object.assign(s.doc.state.player.medical.wounds[0],{bleedingMlPerMinute:0},changes);await refuse(s,'close_wound','player',/简单/,{source:'cut'});
 }
 const s=fixture();s.doc.state.player.medical.wounds[0].closed=true;await refuse(s,'clean_wound','player',/已经闭合/,{source:'cut'});
});
test('病症感知返回常见可见征象，不泄露病原和私密诊断；无征象拒绝',async()=>{
 const s=fixture(),out=await cast(s,'disease_sense');assert.equal(out.observation.pathogenConfirmed,false);
 assert.deepEqual(out.observation.signs,[{kind:'redness'},{kind:'fever',temperatureC:38.5}]);assert.ok(!JSON.stringify(out).includes('private_pathogen'));
 assert.deepEqual(reload(s).doc.state.records[out.evidence].observation,out.observation);
 s.doc.state.player.medical.symptoms=[];await refuse(s,'disease_sense','player',/感染征象/);
});
test('止痛进入正常战斗修正，创面血量不变，到期与重载一致',async()=>{
 const s=fixture();s.doc.state.player.medical.wounds[0].bleedingMlPerMinute=0;
 assert.equal(magicStatusStats(reader(s),'player').hit,-.08);
 const m=structuredClone(s.doc.state.player.medical),out=await cast(s,'pain');assert.equal(magicStatusStats(reader(s),'player').hit,-.02);
 assert.deepEqual(s.doc.state.player.medical,m);assert.equal((await inspect(s,'player')).pain,1);
 const saved=reload(s);await wait(saved,30);await wait(s,30);assert.deepEqual(saved.doc,s.doc);
 assert.equal(saved.doc.state.effects[out.effect],undefined);assert.equal(magicStatusStats(reader(saved),'player').hit,-.08);
 const noPain=fixture();noPain.doc.state.player.medical.pain=0;await refuse(noPain,'pain','player',/局部疼痛/);
});
test('续息保持真实濒死而非恢复生命，准确暂停倒计时，期限后仍须救治',async()=>{
 const s=fixture();Object.assign(s.doc.state.player,{hp:0,status:'濒死',dyingSince:s.doc.state.minute});s.doc.state.player.medical.wounds[0].bleedingMlPerMinute=0;
 const out=await cast(s,'stabilize'),saved=reload(s),start=s.doc.state.player.dyingSince;
 await wait(s,30);await wait(saved,10);await wait(saved,20);
 assert.equal(s.doc.state.player.status,'濒死');assert.equal(s.doc.state.player.hp,0);assert.equal(s.doc.state.player.dyingSince,start+30);
 assert.equal(saved.doc.state.player.dyingSince,s.doc.state.player.dyingSince);assert.equal(s.doc.state.effects[out.effect],undefined);
 await wait(s,8);assert.equal(s.doc.state.player.status,'死亡');
});
test('续息拒绝健康、持续出血、无血量，已经稳定不可叠加',async()=>{
 await refuse(fixture(),'stabilize','player',/实际濒死者/);
 for(const bleeding of [true,false]){
  const s=fixture();Object.assign(s.doc.state.player,{hp:0,status:'濒死',dyingSince:s.doc.state.minute});
  if(!bleeding){s.doc.state.player.medical.bloodMl=0;s.doc.state.player.medical.wounds[0].bleedingMlPerMinute=0;}
  await refuse(s,'stabilize','player',/实际濒死者/);
 }
 const s=fixture();Object.assign(s.doc.state.player,{hp:0,status:'濒死',dyingSince:s.doc.state.minute});s.doc.state.player.medical.wounds[0].bleedingMlPerMinute=0;
 await cast(s,'stabilize');await refuse(s,'stabilize','player',/不能叠加/);
});
test('NPC医疗与检查守同意、位置和射程，急救濒死例外；完成时复核撤销',async()=>{
 const s=fixture();contact(s);delete s.doc.state.records.healing;
 await refuse(s,'pain',npc,/本人有效同意/);
 await assert.rejects(inspect(s,npc),/本人有效同意/);
 contact(s);await cast(s,'pain',npc,{authorization:'healing'});assert.equal((await inspect(s,npc,{authorization:'healing'})).pain,1);
 const prepared=prepareMagic.call(s.engine,draft(s),spell(s,'hemostasis'),{target:npc,source:'cut',authorization:'healing'});
 s.doc.state.records.healing.revoked=true;const blood=s.doc.state.npcs[npc].medical.bloodMl;
 const out=applyMagic.call(s.engine,draft(s),prepared,'completion');assert.match(out.effectFailed,/同意/);assert.equal(s.doc.state.npcs[npc].medical.bloodMl,blood);
 s.doc.state.records.healing.revoked=false;contact(s,[4,0]);
 await refuse(s,'hemostasis',npc,/射程/,{source:'cut',authorization:'healing'});
 contact(s);Object.assign(s.doc.state.npcs[npc],{status:'濒死',hp:0,dyingSince:s.doc.state.minute});delete s.doc.state.records.healing;
 await cast(s,'hemostasis',npc,{source:'cut'});await cast(s,'stabilize',npc);assert.equal(s.doc.state.npcs[npc].status,'濒死');
});
test('驱寄生物按已识别小型个体扣数量，宿主损伤进入真实生命状态',async()=>{
 const s=fixture(),hp=s.doc.state.player.hp;const out=await cast(s,'parasite','player',{source:'worm'});
 assert.equal(out.removed,1);assert.equal(out.hostDamage,2);assert.equal(s.doc.state.player.hp,hp-2);assert.equal(s.doc.state.player.medical.parasites[0].count,1);
 const saved=reload(s);await cast(saved,'parasite','player',{source:'worm'});assert.equal(saved.doc.state.player.medical.parasites[0].count,0);
 await refuse(saved,'parasite','player',/小型寄生物/,{source:'worm'});
 for(const changes of [{identified:false},{accessible:false},{sizeMm:20}]){const f=fixture();Object.assign(f.doc.state.player.medical.parasites[0],changes);await refuse(f,'parasite','player',/小型寄生物/,{source:'worm'});}
});
test('肌腱按时间有限恢复，重载和到期一致，持续负重行走破坏成果',async()=>{
 const s=fixture();s.doc.state.player.medical.wounds[0].bleedingMlPerMinute=0;const out=await cast(s,'restore_tendon');
 const saved=reload(s);await wait(s,1440);await wait(saved,720);await wait(saved,720);
 assert.equal(s.doc.state.player.medical.tendon.integrity,100);assert.equal(s.doc.state.player.medical.tendon.ruptured,false);
 assert.equal(saved.doc.state.player.medical.tendon.integrity,100);assert.equal(s.doc.state.effects[out.effect],undefined);assert.equal(s.doc.state.player.hp,100);
 const loaded=fixture();await cast(loaded,'restore_tendon');await wait(loaded,60);assert.ok(loaded.doc.state.player.medical.tendon.integrity>50);
 await run(loaded,'world_move',{destination:'loc_hw',mode:'walk'});
 const route=loaded.world.routes.find(r=>[r.from,r.to].includes('loc_hw')&&r.lengthKm>=2);assert.ok(route);
 const destination=route.from==='loc_hw'?route.to:route.from;
 await run(loaded,'world_move',{destination,mode:'walk'});assert.equal(loaded.doc.state.player.medical.tendon.integrity,50);assert.equal(loaded.doc.state.player.medical.tendon.ruptured,true);
 assert.ok(loaded.doc.state.player.medical.tendon.strainedAt!==undefined);
});
test('肌腱修复拒绝未断裂、未对齐和感染；没有病理不能当作回血',async()=>{
 for(const changes of [{ruptured:false},{aligned:false},{infection:true}]){const s=fixture();Object.assign(s.doc.state.player.medical.tendon,changes);await refuse(s,'restore_tendon','player',/实际断裂肌腱/);}
 const s=fixture();delete s.doc.state.player.medical.tendon;await refuse(s,'restore_tendon','player',/实际断裂肌腱/);
});
test('辨药草来自真实已知植株，只返回常见药性，未知植株仍需研究',async()=>{
 const s=fixture(),out=await cast(s,'herb_sense','feature_herb');assert.deepEqual(out.observation.commonProperties,['常见苦味药性']);assert.ok(!JSON.stringify(out).includes('secret_recipe'));
 assert.equal((await inspect(reload(s),'feature_herb')).observations[0].operation,'herb_sense');
 set(s,'feature_herb',{plant:{...state(s,'feature_herb').plant,herbKnown:false}});await refuse(s,'herb_sense','feature_herb',/未知药草/);
 await refuse(s,'herb_sense','feature_missing',/同地登记/);
});
test('护芽实际减少轻霜损伤，严霜缺水仍伤苗，到期不再保护',async()=>{
 const s=fixture();set(s,'feature_seedling',{temperatureC:-2});const out=await cast(s,'seedling','feature_seedling');const health=state(s,'feature_seedling').plant.health;
 const saved=reload(s);await wait(saved,60);assert.equal(state(saved,'feature_seedling').plant.health,health);
 set(saved,'feature_seedling',{temperatureC:-5});await wait(saved,60);assert.ok(state(saved,'feature_seedling').plant.health<health);
 const dry=fixture();set(dry,'feature_seedling',{waterMl:0});await cast(dry,'seedling','feature_seedling');await wait(dry,60);assert.ok(state(dry,'feature_seedling').plant.health<100);
 await wait(s,1440);assert.equal(s.doc.state.effects[out.effect],undefined);const after=state(s,'feature_seedling').plant.health;await wait(s,30);assert.ok(state(s,'feature_seedling').plant.health<after);
 const mature=fixture();set(mature,'feature_seedling',{plant:{...state(mature,'feature_seedling').plant,stage:'mature'}});await refuse(mature,'seedling','feature_seedling',/幼苗/);
});
test('幼根朝已有水源多日生长、真实耗水肥，到达后从原水源取水，重载一致',async()=>{
 const s=fixture();await cast(s,'roots','feature_seedling',{source:'feature_water'});assert.equal(state(s,'feature_seedling').plant.rootLengthMeters,0);
 const saved=reload(s);await wait(s,2880);await wait(saved,1440);await wait(saved,1440);
 assert.deepEqual(state(saved,'feature_seedling'),state(s,'feature_seedling'));assert.ok(state(s,'feature_seedling').plant.rootLengthMeters>.1);
 const root=state(s,'feature_seedling'),water=state(s,'feature_water');assert.ok(root.rootDrawnWaterMl>0);assert.equal(root.rootDrawnWaterMl,water.rootRemovedWaterMl);
 assert.equal(root.waterMl+root.careConsumedWaterMl-root.rootDrawnWaterMl,100000);assert.equal(root.nutrientMg+root.careConsumedNutrientMg,100000);
 assert.equal(water.waterMl+water.rootRemovedWaterMl,1000);
 await wait(s,1440);const length=state(s,'feature_seedling').plant.rootLengthMeters;await wait(s,60);assert.equal(state(s,'feature_seedling').plant.rootLengthMeters,length);
});
test('幼根拒绝凭空水源、远水、成熟根与无水肥，资源耗尽停止生长',async()=>{
 const s=fixture();set(s,'feature_water',{waterMl:0});await refuse(s,'roots','feature_seedling',/现有水源/,{source:'feature_water'});
 const far=fixture();far.rows.find(r=>r.id==='feature_water').position=[2,0];await refuse(far,'roots','feature_seedling',/一米内/,{source:'feature_water'});
 const dry=fixture();set(dry,'feature_seedling',{waterMl:0});await refuse(dry,'roots','feature_seedling',/水肥/,{source:'feature_water'});
 const mature=fixture();set(mature,'feature_seedling',{plant:{...state(mature,'feature_seedling').plant,stage:'mature'}});await refuse(mature,'roots','feature_seedling',/幼根/,{source:'feature_water'});
 const limited=fixture();set(limited,'feature_seedling',{waterMl:2,nutrientMg:2});await cast(limited,'roots','feature_seedling',{source:'feature_water'});await wait(limited,30);const length=state(limited,'feature_seedling').plant.rootLengthMeters;
 await wait(limited,30);assert.equal(state(limited,'feature_seedling').plant.rootLengthMeters,length);assert.equal(state(limited,'feature_seedling').waterMl,0);
});
test('嫁接降低排异并愈合真实接口，兼容植株、园艺手艺与水肥缺一拒绝',async()=>{
 const s=fixture(),out=await cast(s,'graft','feature_stock',{source:'feature_scion'});const saved=reload(s);
 await wait(saved,600);const g=state(saved,'feature_stock').plant.graft;assert.equal(g.accepted,true);assert.equal(g.union,100);assert.equal(g.rejection,0);
 assert.ok(state(saved,'feature_stock').careConsumedWaterMl>0);assert.equal(state(saved,'feature_stock').waterMl+state(saved,'feature_stock').careConsumedWaterMl,100000);
 await wait(saved,3720);assert.equal(saved.doc.state.effects[out.effect],undefined);
 for(const edit of [
  f=>{set(f,'feature_scion',{plant:{...state(f,'feature_scion').plant,graftGroup:'pear'}});},
  f=>{set(f,'feature_stock',{plant:{...state(f,'feature_stock').plant,graft:{...state(f,'feature_stock').plant.graft,cutAligned:false}}});},
  f=>{const skill=f.world.skills.find(s=>s.name.includes('园艺'));f.doc.state.skills[skill.id].proficiency=0;},
  f=>{set(f,'feature_stock',{nutrientMg:0});},
 ]){const f=fixture();edit(f);await refuse(f,'graft','feature_stock',/兼容|园艺|水肥/,{source:'feature_scion'});}
});
test('果藏与储柜冷藏减少实际腐败，重量守恒；断柜、坏果和非果实拒绝',async()=>{
 const s=fixture();await cast(s,'preserve_food','feature_fruit');const start=state(s,'feature_fruit').foodLots[0].amountGrams,saved=reload(s);
 await wait(s,60);await wait(saved,60);assert.deepEqual(state(s,'feature_fruit'),state(saved,'feature_fruit'));
 const lot=state(s,'feature_fruit').foodLots[0];assert.equal(start-lot.amountGrams,60);assert.equal(lot.amountGrams+lot.spoiledGrams,100000);
 const cold=fixture();const out=await cast(cold,'preserve','feature_cabinet');const mp=cold.doc.state.player.mp;await wait(cold,30);
 assert.equal(state(cold,'feature_cabinet').temperatureC,5);assert.equal(cold.doc.state.player.mp,mp-30);
 const savedCold=reload(cold);await wait(savedCold,30);assert.equal(savedCold.doc.state.effects[out.effect],undefined);assert.equal(state(savedCold,'feature_cabinet').temperatureC,20);
 await refuse(fixture(),'preserve_food','feature_cabinet',/果实批次/);
 for(const changes of [{closed:false},{integrity:0},{foodLots:[{...food().foodLots[0],badGrams:1}]}]){const f=fixture();set(f,'feature_fruit',changes);await refuse(f,'preserve_food','feature_fruit',/封闭|坏果/);}
});
test('果藏期限后恢复腐败速度；冷藏耗魔按隔热率，魔力不足停止而不造食物',async()=>{
 const s=fixture(),out=await cast(s,'preserve_food','feature_fruit');await wait(s,1440);assert.equal(s.doc.state.effects[out.effect],undefined);
 const amount=state(s,'feature_fruit').foodLots[0].amountGrams;await wait(s,60);assert.equal(amount-state(s,'feature_fruit').foodLots[0].amountGrams,120);
 const poor=fixture();set(poor,'feature_cabinet',{insulationPercent:0});const c=spell(poor,'preserve');poor.doc.state.player.mp=c.mp+4;
 await refuse(poor,'preserve','feature_cabinet',/维持魔力/);
 poor.doc.state.player.mp=1000;const cold=await cast(poor,'preserve','feature_cabinet');poor.doc.state.player.mp=5;
 await wait(poor,3);assert.equal(poor.doc.state.player.mp,0);assert.equal(poor.doc.state.effects[cold.effect],undefined);assert.equal(state(poor,'feature_cabinet').temperatureC,20);
 assert.equal(state(poor,'feature_cabinet').foodLots[0].amountGrams+state(poor,'feature_cabinet').foodLots[0].spoiledGrams,100000);
});
test('所有植物食物操作沿正常工具拒绝无权限、远距与遮挡，完成时再次核对',async()=>{
 const s=fixture();s.rows.find(r=>r.id==='feature_fruit').owner=npc;
 await refuse(s,'preserve_food','feature_fruit',/所有者/);
 s.doc.state.records.permission={category:'authorization',subject:'feature_fruit',action:'environment_use',grantor:npc,grantee:'player',expires:s.doc.state.minute+100};
 const p=prepareMagic.call(s.engine,draft(s),spell(s,'preserve_food'),{target:'feature_fruit',authorization:'permission'});
 s.doc.state.records.permission.revoked=true;const before=structuredClone(state(s,'feature_fruit'));
 assert.match(applyMagic.call(s.engine,draft(s),p,'lost-consent').effectFailed,/授权/);assert.deepEqual(state(s,'feature_fruit'),before);
 const far=fixture();far.rows.find(r=>r.id==='feature_herb').position=[4,0];await refuse(far,'herb_sense','feature_herb',/实际距离/);
 const blocked=fixture();blocked.rows.find(r=>r.id==='feature_seedling').position=[2,0];blocked.rows.push({id:'feature_wall',kind:'wall',owner:'player',position:[1,0],state:{blocksSight:true,sightRadiusMeters:.1}});
 await refuse(blocked,'seedling','feature_seedling',/视线/);
 await assert.rejects(inspect(blocked,'feature_seedling'),/视线/);
});
test('garden候选复用T37田块水肥与种粮账，正常推进产生有限额外生长',async()=>{
 const s=fixture(),p=s.world.rules.agriculture.settlements.find(p=>p.settlement==='loc_bs_yupo');
 s.world.rules.agriculture.crop.growthDays=10;s.world.rules.agriculture.crop.minimumTemperatureC=-100;s.world.rules.agriculture.crop.sowDays=[0,0];p.areaUnits=10;p.initialSeed=12;p.growthFeature='feature_garden';
 const row={id:'feature_garden',name:'实际园圃',kind:'plant',owner:p.settlement,access:'public',position:[0,0],growth:{field:p.fieldId,settlement:p.settlement},state:{waterMl:1000000,capacityMl:1000000,nutrientMg:100000,baseMoisturePercent:10}};
 const place=s.world.locations.find(r=>r.id===p.fieldLocation);place.features??=[];place.features.push(row);
 s.engine=new WorldEngine(s.world);s.doc=s.engine.createCharacter(seed,{},'garden');s.doc.state.location=p.fieldLocation;
 const c=spell(s,'garden');s.doc.state.spells[c.id]={source:{type:'fixture'}};s.doc.state.skills[c.skill]={proficiency:1000,daily:{},breakthroughs:[]};s.doc.state.player.mp=10000;s.doc.state.player.maxMp=10000;s.doc.state.inventory.item_herb={quantity:10};
 s.doc.state.records.growth_permission={category:'authorization',subject:p.fieldId,action:'growth_magic',grantor:p.manager,grantee:'player',expires:100000};
 await wait(s,1440);p.farmWorkers=0;const r=s.doc.state.records[`agriculture:${p.settlement}`];assert.equal(r.field.cohorts.length,1);
 await refuse(s,'garden',p.fieldId,/田主有效同意/);await cast(s,'garden',p.fieldId,{authorization:'growth_permission'});
 const saved=reload({...s,location:p.fieldLocation});await wait(saved,1440);const farm=saved.doc.state.records[`agriculture:${p.settlement}`],resource=saved.doc.state.records['physical_feature:feature_garden'].state;
 assert.ok(farm.field.cohorts[0].growthBonusTicks>0);assert.equal(resource.waterMl+resource.growthConsumedWaterMl,1000000);assert.equal(resource.nutrientMg+resource.growthConsumedNutrientMg,100000);
 assert.equal(farm.field.seedBank+farm.ledger.seedSpent,12);
 assert.equal(farm.ledger.openingFood+farm.ledger.openingSeed+farm.ledger.freshProduced+farm.ledger.harvested+farm.ledger.donated+farm.ledger.seedDonated,saved.doc.state.settlements[p.settlement].food+farm.field.seedBank+farm.ledger.eaten+farm.ledger.spoiled+farm.ledger.overflow+farm.ledger.seedSpent+farm.ledger.sold);
});
test('真实CampaignStorage重载与重复施法不重复扣材料、回血或产生保鲜批次',async()=>{
 const s=fixture();s.doc.state.player.medical.wounds[0].bleedingMlPerMinute=0;
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'magic-care-'));
 try{
  const store=new CampaignStorage(directory,{reducer:(doc,event)=>s.engine.reduce(doc,event),snapshotEvery:1});
  await store.create({id:'care-storage',worldVersion:s.world.version,document:s.doc});
  let event;
  for(let i=0;i<100;i++){
   const candidate={...publicCall('world_cast',{spell:spell(s,'pain').id,target:'player'}),eventId:`care-persist-${i}`};
   if((await s.engine.reduce(s.doc,candidate)).result.success){event=candidate;break;}
  }
  assert.ok(event);
  await store.transact('care-storage',{id:event.eventId,anchor:'care',input:event},(doc,e)=>s.engine.reduce(doc,e));
  const fresh=new CampaignStorage(directory,{reducer:(doc,e)=>new WorldEngine(structuredClone(s.world)).reduce(doc,e)}),first=await fresh.read('care-storage');
  await fresh.transact('care-storage',{id:event.eventId,anchor:'care',input:event},(doc,e)=>s.engine.reduce(doc,e));const second=await fresh.read('care-storage');assert.deepEqual(second.document,first.document);
  assert.equal(first.document.state.player.medical.bloodMl,4000);assert.equal(first.document.state.player.hp,100);
  assert.equal(magicStatusStats({get:(...p)=>p.reduce((v,k)=>v?.[k],first.document)},'player').hit,-.02);
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
