// D12 卡 A：材料属性表的继承、覆盖、具体者优先、缺项未知、L1 校验。夹具世界给类别行，不用正式世界物品 id。
import test from 'node:test';
import assert from 'node:assert/strict';
import {materialProps,validateMaterialProps,MATERIAL_DIMENSIONS} from '../server-plugin/item-class.mjs';

const dimensions={
 moisture:{unit:'质量分数',min:0,max:1},edibleFraction:{unit:'质量分数',min:0,max:1},
 energyDensity:{unit:'饱腹/kg 干物质',min:0,max:100000},heatValue:{unit:'MJ/kg 干物质',min:0,max:60},charYield:{unit:'质量分数',min:0,max:1}
};
function fixture(extra={}){
 const items=[
  {id:'item_fx_plain',tags:['plantish']},
  {id:'item_fx_specific',tags:['plantish','shelled']},
  {id:'item_fx_override',tags:['plantish','shelled'],props:{moisture:0.05,basis:'夹具覆盖'}},
  {id:'item_fx_none',tags:['unlisted']},
  ...(extra.items??[])
 ];
 const materialProps={dimensions:structuredClone(dimensions),precedence:['shelled','plantish'],
  classes:{shelled:{moisture:0.1,edibleFraction:0.4,basis:'夹具：带壳类'},plantish:{moisture:0.8,energyDensity:3000,basis:'夹具：植物类'}},...(extra.table??{})};
 const world={items,recipes:[],materialProps};
 return {world,byId:new Map(items.map(i=>[i.id,i])),items};
}

test('类别值被继承：物品只属于一个类别时取该类别的值', () => {
 const e=fixture(),p=materialProps(e,'item_fx_plain');
 assert.deepEqual(p.moisture,{known:true,value:e.world.materialProps.classes.plantish.moisture,source:'plantish'});
 assert.equal(p.energyDensity.value,e.world.materialProps.classes.plantish.energyDensity);
});

test('多类别冲突取表头顺序里更具体者，不求平均；具体者没写的维度继承一般者', () => {
 const e=fixture(),p=materialProps(e,'item_fx_specific'),c=e.world.materialProps.classes;
 assert.equal(p.moisture.value,c.shelled.moisture);assert.equal(p.moisture.source,'shelled');
 assert.equal(p.edibleFraction.value,c.shelled.edibleFraction);
 assert.equal(p.energyDensity.value,c.plantish.energyDensity);assert.equal(p.energyDensity.source,'plantish');
});

test('物品自己的 props 覆盖类别值，没覆盖的维度仍走类别', () => {
 const e=fixture(),p=materialProps(e,'item_fx_override');
 assert.deepEqual(p.moisture,{known:true,value:0.05,source:'item'});
 assert.equal(p.edibleFraction.value,e.world.materialProps.classes.shelled.edibleFraction);
});

test('缺属性返回明确的未知，而不是默认值', () => {
 const e=fixture();
 for(const dim of MATERIAL_DIMENSIONS)assert.deepEqual(materialProps(e,'item_fx_none')[dim],{known:false});
 assert.deepEqual(materialProps(e,'item_fx_plain').heatValue,{known:false});
 assert.deepEqual(materialProps({world:{items:[],recipes:[]},byId:new Map()},'item_missing').moisture,{known:false});
});

test('L1：合规夹具通过；缺 basis、越界、未知类别键、precedence 不全、缺单位都报错', () => {
 const ok=fixture();assert.deepEqual(validateMaterialProps(ok.world),[]);
 const bad=mutate=>{const e=fixture();mutate(e.world.materialProps,e.world);return validateMaterialProps(e.world);};
 assert.ok(bad(t=>{delete t.classes.shelled.basis;}).some(m=>m.includes('缺 basis')));
 assert.ok(bad(t=>{t.classes.shelled.moisture=1.2;}).some(m=>m.includes('越界')));
 assert.ok(bad(t=>{t.classes.shelled.moisture='0.1';}).some(m=>m.includes('越界')));
 assert.ok(bad(t=>{t.classes.nosuchtag={moisture:0.5,basis:'x'};t.precedence.push('nosuchtag');}).some(m=>m.includes('不是已有标签')));
 assert.ok(bad(t=>{t.precedence=['shelled'];}).some(m=>m.includes('precedence')));
 assert.ok(bad(t=>{delete t.dimensions.moisture.unit;}).some(m=>m.includes('缺单位')));
 assert.ok(bad(t=>{t.classes.shelled.dryness=0.5;}).some(m=>m.includes('未登记')));
 assert.ok(bad((t,w)=>{delete w.items[2].props.basis;}).some(m=>m.includes('item_fx_override')));
});

test('正式世界的空表合法：没有 materialProps 或类别为空都不报错', () => {
 assert.deepEqual(validateMaterialProps({items:[]}),[]);
 assert.deepEqual(validateMaterialProps({items:[],materialProps:{dimensions,precedence:[],classes:{}}}),[]);
});
