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
import {bag,craftInput,craftOutput} from '../server-plugin/stock.mjs';

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
 // 归类（旧预期不适用）：ledger.crafts 是近期审计窗口（stock.mjs:218-227 原话“制造凭据…审计按配方核对产出不超过投入”，写入时只留最后 50 条），
 // 世界里别处的制作变多时较早的凭据会被挤出窗口，所以它不能当逐笔追溯的完整账。逐笔追溯以 transfer 实际过账为准：
 // 用账本既有的调试钩子 __LEDGER_TRACE__（ledger.mjs:217，每笔成功的 transfer 都记 from/to/amount/writer/eventId）取得本次推进里的全部过账，
 // 对每一次成功的加工制作（不限窗口）逐笔核对；窗口内的 ledger.crafts 凭据保留为附加检查，只对窗口内条目做。
 globalThis.__LEDGER_TRACE__=[];let trace;
 try{base=await soak(paying(),54,'kd2a');}finally{trace=globalThis.__LEDGER_TRACE__;delete globalThis.__LEDGER_TRACE__;}
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
 const crafted=Object.entries(doc.state.records).filter(([,r])=>r.category==='labor'&&r.labor==='process'&&r.recipe&&r.success);
 assert.ok(crafted.length>0,'应有加工行程真实做出成品');
 const crafts=doc.ledger.crafts??[],windowFull=crafts.length>=50;
 for(const [key,row] of crafted){
  assert.ok(row.consumed.length>0&&row.produced.length>0,'加工有投入也有产出');
  // 逐笔追溯（全部成功的加工制作）：本条劳动记录对应的每次制作事件编号是 `<记录键去掉 labor:>:<批序>`，
  // 在 transfer 实际过账里：做工者行囊账户进汇的投入件数合计 = 配方投入合计 × 批数；成品从源流入做工者行囊，数量在配方上限之内且等于记录里的新增成品数。
  const recipe=engine.byId.get(row.recipe),prefix=`${key.slice('labor:'.length)}:`,account=item=>bag(engine,row.npc,item);
  const mine=trace.filter(t=>String(t.eventId).startsWith(prefix)&&t.writer==='npc-autonomy');
  const sourceOf=item=>`${craftOutput('npc-autonomy',null).flow}|${item}|${craftOutput('npc-autonomy',null).purpose}`;
  const taken=mine.filter(t=>t.from.startsWith(`${row.npc}|`)&&t.to.startsWith(`${craftInput('npc-autonomy',null).flow}|`)&&t.to.endsWith(`|${craftInput('npc-autonomy',null).purpose}`)).reduce((n,t)=>n+t.amount,0);
  assert.equal(taken,recipe.materials.reduce((n,m)=>n+m.amount,0)*row.batches,`${row.npc} ${row.recipe} ${key}：投入进汇的过账件数 = 配方投入 × 批数`);
  const made=mine.filter(t=>t.from===sourceOf(recipe.output.item)&&t.to===account(recipe.output.item)).reduce((n,t)=>n+t.amount,0);
  assert.ok(made>0&&made<=recipe.output.quantity*row.batches,`${row.npc} ${row.recipe} ${key}：成品出源的过账数量在配方上限内`);
  const gained=row.produced.find(p=>p.item===recipe.output.item&&!recipe.materials.some(m=>m.item===p.item));
  if(gained)assert.equal(made,gained.quantity,`${row.npc} ${row.recipe} ${key}：成品过账数量 = 记录里新增的成品数`);
  // 精确对账：上面的 gained 断言只在“成品不同时是投入或副产品”时才能精确——成品若同时是材料，记录里的 produced/consumed 是该物品的净变化，
  // 不能和单一的成品出源数直接比。所以另外对记录追踪的每个物品（成品、材料、副产品）逐一严格对账：
  // 记录里的净变化（produced − consumed）= 过账里该物品在做工者行囊上的净变化（流入 − 流出）。
  const tracked=new Set([recipe.output.item,...recipe.materials.map(m=>m.item),...(recipe.byproducts??[]).map(p=>p.item)]),netInTrace=new Map();
  for(const t of mine){
   if(t.to.startsWith(`${row.npc}|`)){const item=t.to.split('|')[1];netInTrace.set(item,(netInTrace.get(item)??0)+t.amount);}
   if(t.from.startsWith(`${row.npc}|`)){const item=t.from.split('|')[1];netInTrace.set(item,(netInTrace.get(item)??0)-t.amount);}
  }
  for(const item of tracked){
   const recorded=(row.produced.find(p=>p.item===item)?.quantity??0)-(row.consumed.find(c=>c.item===item)?.quantity??0);
   assert.equal(netInTrace.get(item)??0,recorded,`${row.npc} ${row.recipe} ${key}：${item} 的净变化（过账）= 记录里的净变化`);
  }
  // 附加检查：只对仍在近期窗口内的记录（窗口满时早于最旧凭据的不在窗口内）。
  assert.ok(Number.isSafeInteger(row.minute),`${row.npc} ${row.recipe} ${key}：加工劳动记录必须带 minute，否则窗口检查会被静默跳过`);
  if(!windowFull||row.minute>crafts[0].minute)assert.ok(crafts.some(c=>c.recipe===row.recipe&&String(c.eventId).startsWith(row.sourceEvent)&&c.eventId.includes(row.npc)),'制作账里能认出做工者');
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
