// 卡 F（K4）：物品属性由规律派生。营养守恒、生熟由加热派生、用途按类别、日用品磨损、家户燃料与盐。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {auditLedger} from '../server-plugin/ledger.mjs';
import {deriveItemAttributes,isItemClass,itemClasses,resolveMaterials,pickHeldOfClass} from '../server-plugin/item-class.mjs';

const world=await loadWorld();
const seed=JSON.parse(fs.readFileSync('tests/fixtures/legacy/seed.json','utf8'));
const engine=new WorldEngine(structuredClone(world));
const item=id=>engine.byId.get(id);
const authored=new Map(world.items.map(i=>[i.id,i]));

test('营养由配方投入守恒派生：没写营养的食物照样有营养，且不超过投入之和', () => {
  const crisp=item('item_oat_crisp');
  assert.equal(authored.get('item_oat_crisp').nutrition,undefined);
  assert.ok(crisp.nutrition.satiety>0);
  const r=world.recipes.find(x=>x.output.item==='item_oat_crisp');
  const sum=need=>r.materials.reduce((n,m)=>n+(item(m.item).nutrientContent?.[need]??item(m.item).nutrition?.[need]??0)*m.amount,0)/r.output.quantity;
  assert.ok(crisp.nutrition.satiety<=sum('satiety')&&crisp.nutrition.hydration<=sum('hydration'),JSON.stringify(crisp.nutrition));
  // 写了营养的照用，不被派生覆盖
  assert.deepEqual(item('item_ration').nutrition,authored.get('item_ration').nutrition);
  // 每种带营养的配方产物都不超过它的投入（营养不凭空产生）
  for(const f of engine.world.items.filter(i=>i.nutrientContent&&!authored.get(i.id).nutrition)){
    for(const rr of world.recipes.filter(x=>x.output.item===f.id)){
      const input=rr.materials.reduce((n,m)=>n+(item(m.item).nutrientContent?.satiety??item(m.item).nutrition?.satiety??0)*m.amount,0)/rr.output.quantity;
      assert.ok(f.nutrientContent.satiety<=input+1,`${f.id} ${f.nutrientContent.satiety} > ${input}`);
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
  const w=structuredClone(world);
  const base=w.items.find(i=>i.id==='item_oat_crisp');
  w.items.push({...structuredClone(base),id:'item_kf_soup',name:'试验汤',tags:['food']},{...structuredClone(base),id:'item_kf_root',name:'试验根',tags:['food'],weight:0.4});
  const tpl=w.recipes.find(r=>r.id==='recipe_w3_oat_crisp');
  w.recipes.push({...structuredClone(tpl),id:'recipe_kf_soup',materials:[{item:'item_kf_root',amount:2},{item:'item_water',amount:1},{item:'item_charcoal',amount:1}],output:{item:'item_kf_soup',quantity:1}});
  deriveItemAttributes(w);
  const soup=w.items.find(i=>i.id==='item_kf_soup'),root=w.items.find(i=>i.id==='item_kf_root');
  assert.ok(root.nutrition.satiety>0&&soup.nutrition.satiety>root.nutrition.satiety&&soup.nutrition.satiety<=2*root.nutrientContent.satiety);
  assert.ok(soup.nutrition.hydration>0&&soup.nutrition.hydration<=25);
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
