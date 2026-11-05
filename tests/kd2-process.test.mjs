// 卡 D2：加工劳动是一趟真实的生产行程——按职业的加工类别选配方，缺的投入去采或向持货人买，去获准的工位做，账本守恒。
// 玩家只等待；所有前提由真实时间推进里的人物自己产生。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadRuntimeWorld as loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {auditLedger} from '../server-plugin/ledger.mjs';
import {processingCategories,laborCategories} from '../server-plugin/npc-labor.mjs';
import {stationLicence} from '../server-plugin/workstation-services.mjs';
import {facilityView} from '../server-plugin/facility-state.mjs';

const world=await loadWorld();
const seed=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
const category=r=>r.processing??r.workstation;
async function soak(w,hours,tag){
 const engine=new WorldEngine(w);let doc=engine.createCharacter(seed,{},tag);
 for(let i=0;i<hours;i++){const out=await engine.reduce(doc,{tool:'world_act',args:{action:'core:time',slots:{minutes:60}},eventId:`${tag}-${i}`});if(out.patches?.length)doc=applyPatches(doc,out.patches);}
 return {engine,doc,trips:Object.values(doc.state.records).filter(r=>r.category==='market_trip'&&r.labor==='process')};
}
const at=doc=>({get:(...p)=>p.reduce((v,k)=>v?.[k],doc)});
// 价值决定排班：只改数据，让各门手艺的成品值钱（基价十倍），看有手艺的人会不会真去走生产行程。
// 哪些配方算手艺由职业数据的 processing 派生，不按名单。据点里就能直接拿到的东西、别的配方要用的料不加价（否则抬高的是采集或料价）。
function paying(){
 const w=structuredClone(world),cats=new Set(w.professions.flatMap(p=>p.processing??[]));
 const onSite=new Set(w.locations.flatMap(l=>(l.site?.resources??[]).map(r=>r.item)));
 const outputs=new Set(w.recipes.filter(r=>cats.has(category(r))).map(r=>r.output?.item).filter(item=>!onSite.has(item)&&!w.recipes.some(r=>r.materials?.some(m=>m.item===item))));
 for(const item of w.items)if(outputs.has(item.id)&&item.basePrice)item.basePrice*=10;
 return w;
}
let base;

test('加工行程只做本人手艺类别里的配方，只去有许可的工位，料在行程里取得；做出的成品记进制作账，钱物守恒', {timeout:900000}, async()=>{
 base=await soak(paying(),54,'kd2a');
 const {engine,doc,trips}=base;
 assert.ok(trips.length>0,'两天里应有人出门加工');
 for(const t of trips){
  const a=t.action,r=engine.byId.get(a.recipe),craft=a.stops.at(-1).acts[0];
  assert.ok(processingCategories(engine,doc.state,t.actor).has(category(r)),`${t.actor} 做了手艺之外的 ${r.id}`);
  assert.equal(craft.kind,'craft');assert.equal(craft.recipe,r.id);
  if(r.workstation){
   const s=facilityView(engine,doc.state,a.stops.at(-1).location,t.actor)?.workstations.find(s=>s.id===craft.station);
   assert.ok(s&&s.kind===r.workstation&&!s.thermalRequirement&&stationLicence(engine,at(doc),s,t.actor),`${t.actor} 去了没有许可的工位`);
  }
  // 计划的料：出发时手上的加上沿途各站要取得的，够做计划的批数；各站都在出发人的聚落之内由行程核算。
  for(const s of a.stops.slice(0,-1))for(const x of s.acts)assert.ok(['buy','gather','fell'].includes(x.kind)&&x.quantity>=1);
 }
 const crafted=Object.values(doc.state.records).filter(r=>r.category==='labor'&&r.labor==='process'&&r.recipe&&r.success);
 assert.ok(crafted.length>0,'应有加工行程真实做出成品');
 for(const row of crafted){
  assert.ok(row.consumed.length>0&&row.produced.length>0,'加工有投入也有产出');
  assert.ok(doc.ledger.crafts.some(c=>c.recipe===row.recipe&&String(c.eventId).startsWith(row.sourceEvent)&&c.eventId.includes(row.npc)),'制作账里能认出做工者');
 }
 assert.deepEqual(auditLedger(doc),[]);
});

test('加工类别是数据：把配方的类别改成从没出现过的名字，只有职业登记了这个名字的人才做它', {timeout:900000}, async()=>{
 assert.ok(base,'先跑基线');
 const t=base.trips[0],who=t.actor,recipe=t.action.recipe;
 const w=paying(),fresh='kd2_'+Math.random().toString(36).slice(2,8);
 w.recipes.find(x=>x.id===recipe).processing=fresh;
 // 手艺类别只认职业数据：给这个人换上一个新职业，劳动类别照旧，加工类别只登记这个新名字。
 const n=w.npcs.find(x=>x.id===who);
 w.professions.push({id:`profession_${fresh}`,name:fresh,kind:'life',aliases:[],labor:laborCategories(base.engine,base.doc.state,who),processing:[fresh]});
 n.professions=[`profession_${fresh}`];n.occupation=fresh;
 const mut=await soak(w,54,'kd2b');
 for(const x of mut.trips){
  if(x.action.recipe===recipe)assert.equal(x.actor,who,`${x.actor} 不登记 ${fresh} 却做了它`);
  if(x.actor===who)assert.equal(x.action.recipe,recipe,'新职业只管新类别');
 }
 assert.ok(mut.trips.some(x=>x.actor===who&&x.action.recipe===recipe),'登记了新类别的人照样排出这道配方的行程');
 assert.deepEqual(auditLedger(mut.doc),[]);
});
