// 能喝（drinkable）由物品属性派生：食物 ∧ 液态 ∧ 一份的水分够解渴（balance/crafting 的 nutrition.drinkable）。
// 整类不变量：物品表里带 drinkable 的物品，要么满足这条规则，要么来自已审批叠加层；不能有无来源的手贴标签。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {deriveItemAttributes,drinkableByRule,validateDrinkable} from '../server-plugin/item-class.mjs';
import {createTagSourceResolver} from '../tools/approved-revisions.mjs';
import {loadRuntimeWorld} from '../tools/load-world.mjs';

const item=(id,weight,tags,props,extra={})=>({id,weight,tags,props,...extra});
const fixture=()=>({
 items:[
  item('w',0.25,['food','water'],{moisture:1},{nutrition:{hydration:25}}),
  item('m',0.3,['food','milk'],{moisture:0.87}),
  item('v',0.05,['food','vinegar'],{moisture:0.938}),
  item('fuel',0.1,['fuel']),
  item('brew',0.25,['food']),
  item('curd',0.1,['food','milk']),
  item('stone',0.3,['mineral'],{moisture:0.9}),
  item('oil',0.2,['food'],{moisture:0.9}),
  item('bread',0.2,['food'],{moisture:0.35}),
 ],
 recipes:[
  {id:'r_brew',materials:[{item:'v',amount:1},{item:'w',amount:1},{item:'fuel',amount:1}],output:{item:'brew',quantity:1}},
  {id:'r_curd',materials:[{item:'m',amount:4},{item:'v',amount:1},{item:'fuel',amount:1}],output:{item:'curd',quantity:2}},
 ],
});
const derived=()=>{const w=fixture();deriveItemAttributes(w);return new Map(w.items.map(i=>[i.id,i]));};

test('饮品规则：液态食物按类别标签、一份水分够解渴者能喝（水、乳）', () => {
 const it=derived();
 assert.ok(it.get('w').tags.includes('drinkable'));
 assert.ok(it.get('m').tags.includes('drinkable'));
 assert.equal(it.get('m').nutrition.hydration,Math.floor(0.3*0.87*100));
});
test('饮品规则：配方产物投入全是液态且质量基本保留则能喝（兑制温饮）', () => {
 const it=derived();
 assert.ok(it.get('brew').tags.includes('drinkable'));
 assert.ok(it.get('brew').nutrition.hydration>0);
});
test('饮品规则反例：沥去液体后质量大减的凝块不是饮品', () => {
 assert.ok(!derived().get('curd').tags.includes('drinkable'));
});
test('饮品规则反例：浓缩调味液一份水分太少，不是饮品且不给水分', () => {
 const v=derived().get('v');
 assert.ok(!v.tags.includes('drinkable'));
 assert.equal(v.nutrition?.hydration,undefined);
});
test('饮品规则反例：不是食物、不是液态的含水物品都不是饮品', () => {
 const it=derived();
 for(const id of ['stone','oil','bread','fuel'])assert.ok(!it.get(id).tags.includes('drinkable'),id);
});
test('饮品规则：派生幂等，重复派生结果不变', () => {
 const w=fixture();deriveItemAttributes(w);const once=JSON.stringify(w.items);deriveItemAttributes(w);
 assert.equal(JSON.stringify(w.items),once);
});
test('validateDrinkable：手贴到不满足规则的物品上被拒；去掉规则能推出的标签不报错（由规则补回）', () => {
 const w=fixture();
 w.items.find(i=>i.id==='bread').tags.push('drinkable');
 assert.ok(validateDrinkable(w).some(e=>e.includes('不满足饮品规则')&&e.includes('bread')));
 const ok=fixture();ok.items.find(i=>i.id==='brew').tags.push('drinkable');
 assert.deepEqual(validateDrinkable(ok),[]);
 assert.deepEqual(validateDrinkable(fixture()),[]);
});

test('整类不变量：正式物品表里带 drinkable 的物品都满足规则或来自已审叠加层，规则推出的也与运行时一致', async () => {
 const raw=JSON.parse(fs.readFileSync('world/meta/items.json','utf8'));
 const w=await loadRuntimeWorld();
 const byRule=drinkableByRule(w);
 const resolve=createTagSourceResolver();
 for(const i of raw.filter(x=>(x.tags??[]).includes('drinkable'))){
  const approved=await resolve(i,'drinkable');
  assert.ok(approved||byRule.has(i.id),`无来源的手贴 drinkable：${i.id}`);
  assert.ok(byRule.has(i.id),`已审批的 drinkable 与规则不一致：${i.id}`);
 }
 const runtime=new Set(w.items.filter(i=>(i.tags??[]).includes('drinkable')).map(i=>i.id));
 assert.deepEqual([...runtime].sort(),[...byRule].sort());
 assert.deepEqual(validateDrinkable(w),[]);
});
