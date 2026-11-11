// 卡 F（K4）：物品属性由规律派生。营养守恒、生熟由加热派生、用途按类别、日用品磨损、家户燃料与盐。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {auditLedger} from '../server-plugin/ledger.mjs';
import {materializeRuntimeWorld} from '../server-plugin/runtime-world.mjs';
import {deriveItemAttributes,satietyFactor,isItemClass,itemClasses,resolveMaterials,pickHeldOfClass,materialProps} from '../server-plugin/item-class.mjs';

const world=await loadWorld();
const seed=JSON.parse(fs.readFileSync('tests/fixtures/legacy/seed.json','utf8'));
const engine=new WorldEngine(structuredClone(world));
const item=id=>engine.byId.get(id);
// 水分规则（WATER-1B）：食物水分 = 重量×含水率×参照水每公斤水分（item_water：25÷(0.25×含水1)=100/kg），一份低于参照水一份的一半（12.5）记 0；缺含水率为 0。手算锚点，不读被测实现。
const hydrationOfWater=(e,kg)=>{
  const ref=e.byId.get('item_water'),h=kg*ref.nutrition.hydration/(ref.weight*materialProps(e,ref.id).moisture.value);
  return h>=0.5*ref.nutrition.hydration?Math.floor(h):0;
};
const authored=new Map(world.items.map(i=>[i.id,i]));

test('营养由配方投入守恒派生：没写营养的食物照样有营养，且不超过投入之和', () => {
  const crisp=item('item_oat_crisp');
  assert.equal(authored.get('item_oat_crisp').nutrition,undefined);
  assert.ok(crisp.nutrition.satiety>0);
  const r=world.recipes.find(x=>x.output.item==='item_oat_crisp');
  // 能量守恒在“按热量基值”（nutrientBase，未乘饱腹系数）上成立；系数只在最后乘一次。
  const sum=need=>r.materials.reduce((n,m)=>n+(item(m.item).nutrientBase?.[need]??0)*m.amount,0)/r.output.quantity;
  assert.ok(crisp.nutrientBase.satiety<=sum('satiety'),JSON.stringify(crisp.nutrition));
  // 水分按含水量规则派生（配方产物的含水量由原料推出，不再继承投入的水分值），逐件核对见 s5-law-water-derivation。
  // 写了营养的维度照用（作为按热量的基值），与推导值一样乘饱腹系数
  const ration=authored.get('item_ration').nutrition.satiety;
  assert.equal(item('item_ration').nutrition.satiety,Math.floor(ration*satietyFactor(engine.world,item('item_ration'),ration)));
  // 每种带营养的配方产物都不超过它的投入（营养不凭空产生）
  for(const f of engine.world.items.filter(i=>i.nutrientContent&&!authored.get(i.id).nutrition)){
    for(const rr of world.recipes.filter(x=>x.output.item===f.id)){
      const input=rr.materials.reduce((n,m)=>n+(item(m.item).nutrientBase?.satiety??0)*m.amount,0)/rr.output.quantity;
      assert.ok(f.nutrientBase.satiety<=input+1,`${f.id} ${f.nutrientBase.satiety} > ${input}`);
    }
  }
});

test('生熟由加热派生：生谷与只磨不烧的粉是生料，烧火炒过的才能当一餐', () => {
  assert.equal(item('item_oats').foodState,'raw');assert.equal(item('item_oats').nutrition,undefined);
  assert.equal(item('item_oat_flour').foodState,'raw');assert.equal(item('item_oat_flour').nutrition,undefined);
  assert.equal(item('item_toasted_oats').foodState,'ready');assert.ok(item('item_toasted_oats').nutrition.satiety>0);
  assert.ok(item('item_oats').nutrientContent.satiety>item('item_toasted_oats').nutrientContent.satiety,'加热有损耗');
  // 盐是 food 标签的矿物：没有营养，也不是一餐
  assert.equal(item('item_salt').nutrition,undefined);
});

test('新物品、新配方不写营养也照样派生（规律不认 id）', () => {
  // 用已装入材料属性（含各物品出处）、尚未派生的运行时世界：水等物品由出处推导为 0 饱腹，不落到默认档（未装材料属性的原始世界里水会按默认密度得到饱腹）。
  const w=materializeRuntimeWorld(structuredClone(world));
  const base=w.items.find(i=>i.id==='item_oat_crisp');
  w.items.push({...structuredClone(base),id:'item_kf_soup',name:'试验汤',tags:['food']},{...structuredClone(base),id:'item_kf_root',name:'试验根',tags:['food'],weight:0.4});
  const tpl=w.recipes.find(r=>r.id==='recipe_w3_oat_crisp');
  w.recipes.push({...structuredClone(tpl),id:'recipe_kf_soup',materials:[{item:'item_kf_root',amount:2},{item:'item_water',amount:1},{item:'item_charcoal',amount:1}],output:{item:'item_kf_soup',quantity:1}});
  deriveItemAttributes(w);
  const soup=w.items.find(i=>i.id==='item_kf_soup'),root=w.items.find(i=>i.id==='item_kf_root');
  assert.ok(root.nutrition.satiety>0&&soup.nutrition.satiety>root.nutrition.satiety&&soup.nutrition.satiety<=2*root.nutrientContent.satiety);
  // 试验汤的水分：含水量 = (2 个根的含水量 + 1 份水 0.25kg×含水1) × (1−加热损耗 0.1) ÷ 1，木炭为燃料不计；含水量×100/kg 过 12.5 门槛。根的含水率按其出处（未知则该项为 0）。
  const E={world:w,byId:new Map(w.items.map(i=>[i.id,i]))},rootM=materialProps(E,root.id).moisture;
  const kg=((rootM.known?2*root.weight*rootM.value:0)+0.25)*(1-0.1);
  assert.equal(soup.nutrition?.hydration??0,hydrationOfWater(E,kg));
});

test('用途按类别：药、粮、饵、燃料、盐、日用品都看标签，不看 id', () => {
  assert.ok(isItemClass(engine,'item_herb','medicine')&&isItemClass(engine,'item_s2_huangjing','medicine'));
  assert.ok(!isItemClass(engine,'item_salt','medicine')&&isItemClass(engine,'item_salt','salt'));
  assert.ok(isItemClass(engine,'item_wheat_grain','grain')&&isItemClass(engine,'item_oats','grain'));
  assert.ok(isItemClass(engine,'item_fishing_bait','bait')&&isItemClass(engine,'item_earthworm_bait','bait'));
  for(const f of ['item_wood_shavings','item_charcoal','item_wood'])assert.ok(isItemClass(engine,f,'fuel'),f);
  assert.ok(isItemClass(engine,'item_cooking_pot','durable')&&isItemClass(engine,'item_clothes','apparel'));
  assert.ok(!itemClasses(engine,'item_oat_crisp').includes('durable'),'食物不是日用品');
});

test('配方里的燃料行按类别落到实际持有的燃料；盐不能顶替', () => {
  const doc=engine.createCharacter(seed,{},'kf-mat'),d={get:(...p)=>p.reduce((v,k)=>v?.[k],doc)};
  doc.state.inventory.item_charcoal=2;delete doc.state.inventory.item_wood_shavings;doc.state.inventory.item_salt=3;
  const rows=resolveMaterials(d,engine,'player',[{item:'item_oat_flour',amount:1},{item:'item_wood_shavings',amount:1}]);
  assert.deepEqual(rows[1],{item:'item_charcoal',amount:1,class:'fuel',authored:'item_wood_shavings'});
  assert.deepEqual(rows[0],{item:'item_oat_flour',amount:1});
  delete doc.state.inventory.item_charcoal;
  assert.equal(resolveMaterials(d,engine,'player',[{item:'item_wood_shavings',amount:1}])[0].item,'item_wood_shavings','没有同类就照原样（由消费方报缺）');
  assert.equal(pickHeldOfClass(d,engine,'player','fuel'),null);
});

test('浸泡两天：日用品磨损、家户烧柴，账本守恒', async () => {
  let doc=engine.createCharacter(seed,{},'kf-soak');
  const before=Object.entries(doc.state.npcs).filter(([,n])=>n.inventory?.item_wood).length;
  for(let i=0;i<2;i++){
    const out=await engine.reduce(doc,{tool:'world_act',args:{action:'core:time',slots:{minutes:1440,activity:'休息'}},eventId:`kf-soak-${i}`});
    const {applyPatches}=await import('../server-plugin/storage.mjs');doc=applyPatches(doc,out.patches);
  }
  const flows=Object.entries(doc.ledger?.flows??{});
  assert.ok(flows.some(([k,v])=>k.startsWith('sink:consume|')&&k.endsWith('|fuel')&&v>0)||before===0,'有柴的家户烧掉了燃料');
  const worn=Object.values(doc.state.npcs).some(n=>Object.entries(n.inventory??{}).some(([k,v])=>typeof v==='object'&&isItemClass(engine,k,'durable')&&v.durability<item(k).durability));
  assert.ok(worn,'NPC 手里的日用品有磨损');
  assert.deepEqual(auditLedger(doc.ledger),[]);
});

test('一份超过一餐上限的食物照样能吃：身体只吸收到上限（body 表 max），整份离手，余量记为浪费', async () => {
  const w=structuredClone(world);w.items.find(i=>i.id==='item_ration').nutrition={satiety:150};
  const e=new WorldEngine(w),{applyPatches}=await import('../server-plugin/storage.mjs');
  let doc=e.createCharacter(seed,{},'kf-big');
  const max=w.primitiveTables.body.rows.find(r=>r.need==='satiety'&&r.selector==='person').max,before=doc.state.inventory.item_ration.quantity;
  const out=await e.reduce(doc,{tool:'world_act',args:{action:'core:eat.meal',slots:{item:'item_ration'}},eventId:'kf-big-1'});doc=applyPatches(doc,out.patches);
  const r=out.result;assert.notEqual(r?.receipt?.status,'rejected',JSON.stringify(r?.receipt));
  assert.equal(doc.state.player.body.satiety.value,max);
  assert.equal(doc.state.inventory.item_ration.quantity,before-1);
  // 手写 150 是按热量的基值，派生后的一份饱腹 = floor(150 × 系数)；吸收 + 浪费 = 这一份
  const portion=Math.floor(150*satietyFactor(e.world,e.byId.get('item_ration'),150));
  assert.ok(r.wasted?.satiety>0&&Math.abs(r.nutrition.satiety+r.wasted.satiety-portion)<0.01,JSON.stringify({n:r.nutrition,w:r.wasted}));
  assert.deepEqual(auditLedger(doc.ledger??{accounts:{},flows:{}}),[]);
});
