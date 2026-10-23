import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import '../server-plugin/primitives-runtime.mjs';
import {applyPatches,CampaignStorage} from '../server-plugin/storage.mjs';
import {auditLedger} from '../server-plugin/ledger.mjs';
import {containerUnits,physicalLocation} from '../server-plugin/items.mjs';
import {environmentFeatures} from '../server-plugin/environment.mjs';
import {reconcile} from './helpers/ledger-audit.mjs';
import {tmpRoot} from '../tools/tmp-root.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
// Mechanism specimen: these existing pots have a measured one-litre capacity.
// The real-world intent acceptance test separately requires published item data;
// it does not receive these specimen overrides.
const measured=structuredClone(world),pot=measured.items.find(i=>i.id==='item_clay_pot');
pot.tags=[...new Set([...pot.tags,'liquid_container'])];pot.capacityMl=1000;
const pool=measured.locations.find(l=>l.id==='loc_hw_dock').features.find(f=>f.id==='feature_hw_pool');
pool.state.toxinUg=1200;
const reader=document=>({get:(...p)=>p.reduce((v,k)=>v?.[k],document)});
const state=(document,id)=>document.state.records[`physical_feature:${id}`]?.state??pool.state;
const input=(slots,eventId='draw-test',action='core:environment.draw_water')=>({tool:'world_act',eventId,args:{action,slots}});
async function act(engine,document,tool,args,eventId){
 const result=await engine.reduce(document,{tool,args,eventId});
 assert.notEqual(result.result?.ok,false,JSON.stringify(result.result?.receipt));
 return applyPatches(document,result.patches);
}
async function acquire(){
 const engine=new WorldEngine(structuredClone(measured));let document=engine.initialFromLegacy(seed,'water-mechanism');
 document=await act(engine,document,'world_move',{destination:'河湾村',mode:'walk'},'water-village');
 document=await act(engine,document,'world_move',{destination:'白石镇',mode:'walk'},'water-town');
 for(let i=0;i<48;i++){
  const seller=document.state.npcs.npc_hw_yanzhe;
  if(seller.location===document.state.location&&seller.services?.includes('trade'))break;
  document=await act(engine,document,'world_time',{minutes:30},`water-market-${i}`);
 }
 document=await act(engine,document,'world_trade',{seller:'严辙',item:'素面陶罐',quantity:1},'water-pot');
 assert.ok(document.state.inventory.item_clay_pot.quantity>0);
 document=await act(engine,document,'world_move',{destination:'河湾村',mode:'walk'},'water-return');
 document=await act(engine,document,'world_move',{destination:'旧渡口',mode:'walk'},'water-dock');
 return document;
}
const acquired=await acquire();
const fixture=()=>({engine:new WorldEngine(structuredClone(measured)),document:structuredClone(acquired)});
const slots={source:'feature_hw_pool',container:'item_clay_pot'};
function refused(receipt){
 assert.equal(receipt.status,'rejected');assert.deepEqual(receipt.applied,[]);
 assert.ok(receipt.reason);assert.ok(receipt.missing.length);assert.ok(receipt.alternatives.length);
}
function clean(engine,document){
 assert.deepEqual(auditLedger(document.ledger),[]);
 assert.deepEqual(reconcile(engine,document),{mismatches:[],lots:[],drift:[],audit:[]});
}
async function draw(f,more={}){
 const result=await f.engine.reduce(f.document,input({...slots,...more}));
 assert.equal(result.result.receipt.status,'committed',JSON.stringify(result.result.receipt));
 return {result,document:applyPatches(f.document,result.patches),id:result.result.destination};
}

test('真实买罐后按容量裁剪取水；污染随水守恒、内容物可取出、预览只读且重放不重取',async()=>{
 const f=fixture(),before=structuredClone(f.document),src=structuredClone(state(before,'feature_hw_pool'));
 const preview=await f.engine.previewAction(f.document,input({...slots,millilitres:100000}));
 assert.equal(preview.receipt.status,'preview');assert.deepEqual(f.document,before);
 const result=await f.engine.reduce(f.document,input({...slots,millilitres:100000}));
 assert.equal(result.result.receipt.status,'committed');
 const after=applyPatches(f.document,result.patches),id=result.result.destination,dst=state(after,id),left=state(after,'feature_hw_pool');
 assert.equal(dst.waterMl,1000);assert.equal(left.waterMl,src.waterMl-1000);
 for(const field of ['saltMg','toxinUg'])assert.equal(left[field]+dst[field],src[field],field);
 for(const field of ['turbidity','pathogenRisk','odor'])assert.equal(dst[field],src[field],field);
 assert.equal(after.state.minute,before.state.minute+f.engine.world.openActionRules.generic.transferMinutes);
 const units=containerUnits(reader(after),id);assert.equal(units.length,4);clean(f.engine,after);
 const taken=await f.engine.reduce(after,input({target:id,instance:units[0].id},'water-take','core:environment.take_contents'));
 assert.equal(taken.result.receipt.status,'committed');const out=applyPatches(after,taken.patches),portion=out.state.itemInstances[units[0].id].liquid;
 assert.equal(portion.waterMl,250);assert.equal(state(out,id).waterMl,750);
 for(const field of ['saltMg','toxinUg'])assert.equal(state(out,id)[field]+portion[field],dst[field]);
 clean(f.engine,out);
 const repeat=await f.engine.reduce(after,input({...slots,millilitres:100000}));assert.equal(repeat.result.receipt.duplicate,true);assert.deepEqual(repeat.patches,[]);
 const full=await f.engine.reduce(after,input(slots,'water-full'));refused(full.result.receipt);assert.deepEqual(full.patches,[]);
});

test('原水不足按实际存量装入，不制造多余水或整份物品；零头仍可倒出',async()=>{
 const f=fixture();
 // A measured source specimen, not a seeded successful action or new waterbody.
 f.document.state.records['physical_feature:feature_hw_pool']={id:'feature_hw_pool',category:'physical_feature',location:'loc_hw_dock',state:{...pool.state,waterMl:600,saltMg:12,toxinUg:6}};
 const {document,id}=await draw(f),dst=state(document,id);
 assert.equal(dst.waterMl,600);assert.equal(state(document,'feature_hw_pool').waterMl,0);assert.equal(dst.saltMg,12);assert.equal(dst.toxinUg,6);
 assert.equal(containerUnits(reader(document),id).length,2);clean(f.engine,document);
 const poured=await f.engine.reduce(document,input({target:id,millilitres:351},'water-pour','core:environment.pour_water'));
 assert.equal(poured.result.receipt.status,'committed');const after=applyPatches(document,poured.patches);
 assert.equal(state(after,id).waterMl,249);assert.equal(containerUnits(reader(after),id).length,0);
 assert.equal(poured.result.discarded.saltMg+state(after,id).saltMg,12);clean(f.engine,after);
});

test('目录形式推导的装水意图与等价显式效果走同一真实动作和回执',async()=>{
 const f=fixture(),args={intent:'把渡口池水装进陶罐'},eventId='water-intent-parity';
 const explicit={...args,effects:[{op:'transfer',resource:'water',from:'feature_hw_pool',to:'item_clay_pot',qty:1}]};
 const a=await f.engine.previewAction(f.document,{tool:'world_propose',args,eventId});
 const b=await f.engine.previewAction(f.document,{tool:'world_propose',args:explicit,eventId});
 assert.equal(a.receipt.status,'preview');assert.equal(b.receipt.status,'preview');
 assert.equal(a.receipt.routing.routed,'core:environment.draw_water');
 for(const field of ['applied','cost','check','consent'])assert.deepEqual(a.receipt[field],b.receipt[field],field);
 const x=await f.engine.reduce(f.document,{tool:'world_propose',args,eventId});
 const y=await f.engine.reduce(f.document,{tool:'world_propose',args:explicit,eventId});
 assert.equal(x.result.receipt.status,'committed');assert.equal(y.result.receipt.status,'committed');
 for(const field of ['applied','cost','check','consent'])assert.deepEqual(x.result.receipt[field],y.result.receipt[field],field);
 clean(f.engine,applyPatches(f.document,x.patches));clean(f.engine,applyPatches(f.document,y.patches));
});

test('无容器、非液体容器、远处水源和遮挡均给替代且零写入',async()=>{
 const f=fixture();
 for(const args of [{source:'feature_hw_pool'},{...slots,container:'item_bread'},{...slots,source:'feature_hw_kitchen_bucket'}]){
  const before=structuredClone(f.document),result=await f.engine.reduce(f.document,input(args));
  refused(result.result.receipt);assert.deepEqual(result.patches,[]);assert.deepEqual(f.document,before);
 }
 const far=structuredClone(f.document);far.state.records.local_player_position={category:'local_position',location:'loc_hw_dock',point:[10,0]};
 const result=await f.engine.reduce(far,input(slots));refused(result.result.receipt);assert.deepEqual(result.patches,[]);
 const unknown=fixture();delete unknown.engine.byId.get('item_clay_pot').capacityMl;
 const missingCapacity=await unknown.engine.reduce(unknown.document,input(slots));
 refused(missingCapacity.result.receipt);assert.match(missingCapacity.result.receipt.reason,/容量/);assert.deepEqual(missingCapacity.patches,[]);
});

test('私人水源仍需真实授权，不能把同处一地当成许可',async()=>{
 const f=fixture(),source=f.engine.world.locations.find(l=>l.id==='loc_hw_dock').features.find(r=>r.id==='feature_hw_pool');
 source.access='consent';source.owner='npc_hw_linsui';
 const before=structuredClone(f.document),result=await f.engine.reduce(f.document,input(slots));
 refused(result.result.receipt);assert.match(result.result.receipt.reason,/授权/);assert.deepEqual(result.patches,[]);assert.deepEqual(f.document,before);
});

test('容器里的干净原水可饮用、取出并真实出售，污水仍不能伪装成可饮用清水',async()=>{
 const f=fixture(),raw={...pool.state,turbidity:0,pathogenRisk:0,toxinUg:0,odor:'无明显气味'};
 f.document.state.records['physical_feature:feature_hw_pool']={id:'feature_hw_pool',category:'physical_feature',location:'loc_hw_dock',state:raw};
 let {document,id}=await draw(f);
 const drink=await f.engine.reduce(document,input({target:id,quantity:1},'water-drink','core:environment.drink_contents'));
 assert.equal(drink.result.receipt.status,'committed');document=applyPatches(document,drink.patches);
 assert.equal(state(document,id).waterMl,750);assert.ok(drink.result.nutrition.hydration>=0);clean(f.engine,document);
 const portion=containerUnits(reader(document),id)[0];
 const take=await f.engine.reduce(document,input({target:id,instance:portion.id},'water-sale-take','core:environment.take_contents'));
 document=applyPatches(document,take.patches);assert.equal(document.state.itemInstances[portion.id].liquid.waterMl,250);
 document=await act(f.engine,document,'world_move',{destination:'河湾村',mode:'walk'},'water-sale-village');
 document=await act(f.engine,document,'world_move',{destination:'青灯酒馆',mode:'walk'},'water-sale-inn');
 for(let i=0;i<48;i++){
  const buyer=document.state.npcs.npc_hw_linsui;
  if(buyer.location===document.state.location&&buyer.services?.includes('trade'))break;
  document=await act(f.engine,document,'world_time',{minutes:30},`water-sale-wait-${i}`);
 }
 const sale=await f.engine.reduce(document,input({buyer:'npc_hw_linsui',item:'item_water',quantity:1},'water-sale','core:trade.sell_to'));
 assert.equal(sale.result.receipt.status,'committed',JSON.stringify(sale.result.receipt));
 const sold=applyPatches(document,sale.patches);assert.equal(sold.state.itemInstances[portion.id].owner,'npc_hw_linsui');
 assert.equal(sold.state.itemInstances[portion.id].liquid.waterMl,250);assert.equal(state(sold,id).waterMl,500);clean(f.engine,sold);
 const dirty=fixture(),filled=await draw(dirty),before=structuredClone(filled.document);
 const refusedDrink=await dirty.engine.reduce(filled.document,input({target:filled.id,quantity:1},'water-unsafe-drink','core:environment.drink_contents'));
 refused(refusedDrink.result.receipt);assert.deepEqual(refusedDrink.patches,[]);assert.deepEqual(filled.document,before);
});

test('公用水盏也可作水源；不足一份的真实余水仍能饮用且不凭空生成整份水',async()=>{
 const f=fixture(),cup=f.engine.world.locations.find(l=>l.id==='loc_hw_dock').features.find(r=>r.id==='feature_hw_cup');
 // Measured clean contents in the existing public cup, not a new source.
 f.document.state.records['physical_feature:feature_hw_cup']={id:cup.id,category:'physical_feature',location:'loc_hw_dock',state:{...cup.state,waterMl:100}};
 const {document,id}=await draw(f,{source:cup.id});
 assert.equal(state(document,cup.id).waterMl,0);assert.equal(state(document,id).waterMl,100);
 assert.equal(containerUnits(reader(document),id).length,0);clean(f.engine,document);
 const drink=await f.engine.reduce(document,input({target:id},'water-last-sip','core:environment.drink_contents'));
 assert.equal(drink.result.receipt.status,'committed');const after=applyPatches(document,drink.patches);
 assert.equal(state(after,id).waterMl,0);assert.equal(drink.result.quantity,.4);assert.ok(drink.result.nutrition.hydration<=10);clean(f.engine,after);
});

test('装好的水与容器位置、内容物和账本一起存档往返',async t=>{
 const f=fixture(),directory=await fs.mkdtemp(path.join(tmpRoot(),'draw-water-'));
 t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const reducer=(doc,call)=>f.engine.reduce(doc,call),store=new CampaignStorage(directory,{reducer});
 await store.create({id:'draw-water',worldVersion:f.engine.world.version,document:f.document});
 await store.transact('draw-water',{id:'draw-event',anchor:'filled',input:input(slots)},reducer);
 const saved=(await store.read('draw-water')).document;
 assert.deepEqual((await new CampaignStorage(directory,{reducer}).read('draw-water')).document,saved);
 assert.deepEqual((await store.import(await store.export('draw-water'),'draw-copy')).document,saved);
 const container=Object.values(saved.state.records).find(r=>r.containerItem==='item_clay_pot');
 assert.ok(container);assert.equal(state(saved,container.id).waterMl,1000);
 assert.equal(physicalLocation(reader(saved),f.engine,container.id),'loc_hw_dock');
 assert.ok(environmentFeatures(f.engine,saved).some(r=>r.id===container.id));clean(f.engine,saved);
});

test('跨日取水仍以真实源水结算，日常水循环不会被当成此次额外取水',async()=>{
 const f=fixture(),minutes=(1439-f.document.state.minute%1440+1440)%1440;
 if(minutes)f.document=await act(f.engine,f.document,'world_time',{minutes},'water-midnight-wait');
 const result=await f.engine.reduce(f.document,input({...slots,millilitres:100}));
 assert.equal(result.result.receipt.status,'committed',JSON.stringify({code:result.result.receipt.code,reason:result.result.receipt.reason}));
 const after=applyPatches(f.document,result.patches),water=result.result.receipt.applied.find(e=>e.op==='transfer'&&e.resource==='water');
 assert.ok(water);assert.equal(water.qty,.1);assert.equal(state(after,result.result.destination).waterMl,100);clean(f.engine,after);
});
