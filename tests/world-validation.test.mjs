import test from 'node:test';
import assert from 'node:assert/strict';
import {loadWorld}from'../tools/load-world.mjs';
import {validateWorld}from'../tools/validate-world.mjs';
import {buildWorld}from'../tools/build-world.mjs';
test('世界校验：兼容种子通过基础结构，全规则数量不足不能标为完成',async()=>{
    const world=await loadWorld();assert.equal(validateWorld(world).ok,true);
    const rules=validateWorld(world,{stage:'rules'});assert.equal(rules.ok,false);assert.ok(rules.errors.some(error=>error.includes('数量不足')));
    await assert.rejects(buildWorld({source:world,stage:'rules'}),/构建拒绝/);
});
test('世界校验：坏引用、同范围别名、未成年和屏蔽名称都阻止构建',async()=>{
    const world=await loadWorld();
    world.spells[0].materials=[{item:'item_missing',amount:1}];
    world.npcs[1].aliases=['老板娘'];world.npcs[1].age=16;world.npcs[1].flags.romanceable=true;
    world.items[0].name='阿斯兰木剑';
    const result=validateWorld(world);assert.equal(result.ok,false);
    for(const pattern of ['引用不存在','称呼冲突','未成年标记','屏蔽表'])assert.ok(result.errors.some(error=>error.includes(pattern)),pattern);
});
test('世界校验：孤立路线、负库存、过便宜的制造产物拒绝',async()=>{
    const world=await loadWorld();world.routes=world.routes.filter(route=>route.to!=='loc_capital'&&route.from!=='loc_capital');
    world.npcs[0].coins=-1;assert.equal(validateWorld(world).ok,false);world.npcs[0].coins=450;
    world.recipes=[{id:'recipe_bad',name:'虚亏木材',skill:'skill_light',minimumProficiency:0,materials:[{item:'item_iron',amount:10}],minutes:10,difficulty:10,output:{item:'item_wood',quantity:1},tools:[]}];
    const result=validateWorld(world);assert.ok(result.errors.some(error=>error.includes('孤立')));assert.ok(result.errors.some(error=>error.includes('低于材料')));
});

test('世界校验拒绝未接入法术与越界防护，不能用文字和数量填满目录',async()=>{
    const world=await loadWorld(),spell=world.spells[0];
    spell.effectSpec={kind:'status',status:'stone_skin',power:5000};
    assert.ok(validateWorld(world).errors.some(error=>error.includes('规则表')));
    delete spell.effectSpec;spell.mechanism='fake_city_simulation';
    assert.ok(validateWorld(world).errors.some(error=>error.includes('尚未接入')));
    delete spell.mechanism;
    assert.equal(validateWorld(world).ok,true,'旧兼容数据在引擎开发模式仍可读取');
    assert.ok(validateWorld(world,{stage:'rules'}).errors.some(error=>error.includes('法术处理器不完整')));
});
