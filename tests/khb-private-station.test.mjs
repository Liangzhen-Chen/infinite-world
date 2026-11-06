// 卡 HB2：他人私宅里的热工位（锻炉、窑……任何设备类派生的工位）。没有许可也做得成（物理上做得到），
// 但算擅用他人财物：经 K6 同一条违法规律记 unauthorized_use，受害人是住户，回执后果带指向该记录的 offense 项；
// 有许可、本人、公开工位不记。按设备类的属性判断，不看工位 id、物品 id、户名。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadRuntimeWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';

const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const world=await loadRuntimeWorld(),HOME='bld_khb_private_home',HOST='npc_hw_xiejin';
// 两类不同设备：锻炉（锻造）、窑（陶作）；配方各取该工位类别下的一条。
const CLASSES=[{fixture:'forge',recipe:'recipe_forge_nails'},{fixture:'kiln',recipe:'recipe_fire_cup'}];
function worldWith(extra){
 const w=structuredClone(world);
 w.locations.push({id:HOME,name:'新起的私宅',aliases:[],coordinates:[0.37,-0.41],parent:'loc_hw',scope:'loc_hw',terrain:'平地',openHours:[0,1440],owner:null,rooms:[],inventory:{},purpose:'私宅',...extra});
 w.routes.push({id:`route_${HOME}`,from:'loc_hw',to:HOME,lengthKm:0,terrainMultiplier:1,modes:['walk','horse'],closedSeasons:[],toll:0,risk:0});
 return w;
}
const priv=(fixture,residents=[HOST])=>({access:{mode:'private',residents,requiresConsent:true},fixtures:[{fixture}]});
function kit(engine,recipe){
 const doc=engine.createCharacter(seed,{},'khb-priv'),r=engine.byId.get(recipe);
 doc.state.location=HOME;doc.state.player.coins=1000;
 const give=(item,quantity)=>{const def=engine.byId.get(item);doc.state.inventory[item]={quantity,quality:def.quality,durability:def.durability,weight:def.weight};};
 for(const m of r.materials)give(m.item,m.amount*3);for(const t of r.tools??[])give(t,1);
 give('item_charcoal',40);
 doc.state.skills[r.skill]={proficiency:2100,daily:{},breakthroughs:[]};
 return doc;
}
const permit=(doc,fixtures)=>{doc.state.records.permission_khb={category:'authorization',action:'enter_home',subject:HOME,grantor:HOST,grantee:'player',guests:[],createdAt:doc.state.minute,expires:doc.state.minute+600,revoked:false,content:'借用设备',...(fixtures?{fixtures}:{})};return 'permission_khb';};
const craft=(engine,doc,recipe,args={})=>engine.reduce(doc,{tool:'world_craft',args:{recipe,...args},eventId:'khb-priv-craft'});
const unlicensed=out=>out.result.offenses?.find(o=>o.offense==='unauthorized_use');

for(const {fixture,recipe} of CLASSES){
 test(`${fixture}：私宅里无许可照样做成，但记擅用，受害人是住户，结果后果指向该记录`,async()=>{
  const engine=new WorldEngine(worldWith(priv(fixture))),doc=kit(engine,recipe),r=engine.byId.get(recipe);
  const out=await craft(engine,doc,recipe),after=applyPatches(doc,out.patches);
  assert.ok(after.state.minute>doc.state.minute,'物理上做成了，时间过去了');
  const o=unlicensed(out);assert.ok(o,'记擅用');assert.equal(o.victim,HOST);
  const rec=after.state.records[o.record];
  assert.equal(rec.category,'offense');assert.equal(rec.victim,HOST);assert.equal(rec.sourceEvent,'khb-priv-craft');
  assert.ok(JSON.stringify(rec.subject).includes(`station_${HOME}_${engine.byId.get(recipe).workstation}`),'对象指向工位');
  assert.equal(o.record,rec.id,'结果里的后果项指向该记录（旧式工具的后果通道是 result.offenses）');
  assert.ok(r.materials.length>0);
 });
 test(`${fixture}：主人写明借这件设备的许可、住户本人：不记擅用；公开地点的同类设备也不记`,async()=>{
  const engine=new WorldEngine(worldWith(priv(fixture)));
  const lent=kit(engine,recipe),auth=permit(lent,[fixture]);
  assert.equal(unlicensed(await craft(engine,lent,recipe,{authorization:auth})),undefined);
  const visit=kit(engine,recipe),vis=permit(visit);
  assert.ok(unlicensed(await craft(engine,visit,recipe,{authorization:vis})),'没写明设备的进屋许可不覆盖');
  const own=new WorldEngine(worldWith(priv(fixture,['player'])));
  assert.equal(unlicensed(await craft(own,kit(own,recipe),recipe)),undefined);
  const open=new WorldEngine(worldWith({access:{mode:'public'},fixtures:[{fixture}]}));
  assert.equal(unlicensed(await craft(open,kit(open,recipe),recipe)),undefined);
 });
}
