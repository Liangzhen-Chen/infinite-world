import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld}from'../tools/load-world.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {catalogDefinition}from'../server-plugin/catalog.mjs';
import {lookupToolResult}from'../extension/turn.mjs';
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));

test('目录区分法术定义与真实学会状态，技能栏存在不能代替法术登记',async()=>{
    const engine=new WorldEngine(await loadWorld()),document=engine.initialFromLegacy(seed,'spell-learning-status'),before=structuredClone(document);
    const found=catalogDefinition(engine,document,{entity:'spell_light'});assert.equal(found.learned,true);assert.match(found.learningStatus,/已经学会/);
    assert.ok(engine.scene(document,'照明术').includes('【已学法术】共1'));assert.ok(engine.scene(document,'照明术').includes('spell_light'));
    assert.deepEqual(document,before);
    delete document.state.spells.spell_light;
    assert.ok(document.state.skills.skill_light);assert.equal(catalogDefinition(engine,document,{entity:'spell_light'}).learned,false);
    assert.ok(engine.scene(document,'照明术').includes('【已学法术】共0'));assert.equal(document.state.spells.spell_light,undefined);
});

test('同名技能法术查询返回可纠正的歧义反馈，按类型重查成功，存档故障仍抛出',async()=>{
    const engine=new WorldEngine(await loadWorld()),document=engine.initialFromLegacy(seed,'lookup-recovery'),before=structuredClone(document);
    const rejected=await lookupToolResult(()=>catalogDefinition(engine,document,{entity:'照明术'}));
    assert.equal(rejected.ok,false);assert.equal(rejected.lookupRejected,true);assert.match(rejected.error,/有歧义/);
    const found=await lookupToolResult(()=>catalogDefinition(engine,document,{entity:'照明术',kind:'spell'}));assert.equal(found.id,'spell_light');
    assert.deepEqual(document,before);await assert.rejects(lookupToolResult(()=>{throw new Error('存档校验和错误');}),/校验和/);
});
test('规则目录只读，公开列表限制大小，不暴露人物私有档案',async()=>{
    const engine=new WorldEngine(await loadWorld()),document=engine.initialFromLegacy(seed,'catalog-test'),before=structuredClone(document);
    const listing=catalogDefinition(engine,document,{kind:'skill'});
    assert.ok(listing.count>40);assert.equal(listing.entries.length,40);assert.equal(listing.truncated,true);
    const definition=catalogDefinition(engine,document,{entity:'skill_light',kind:'skill'});
    definition.description='改变返回值';assert.notEqual(engine.byId.get('skill_light').description,definition.description);
    assert.throws(()=>catalogDefinition(engine,document,{entity:'npc_hw_linsui'}),/公开规则目录/);
    assert.throws(()=>catalogDefinition(engine,document,{kind:'npc'}),/指定/);
    assert.deepEqual(document,before);
});

test('公开地点可查询，目录分页可找到后续物品，错误候选不创建或替换实体',async()=>{
    const engine=new WorldEngine(await loadWorld()),document=engine.initialFromLegacy(seed,'location-catalog');
    const places=catalogDefinition(engine,document,{kind:'location'});
    assert.ok(places.entries.some(row=>row.id==='bld_hw_riverhome'));
    assert.equal(catalogDefinition(engine,document,{entity:'河边小屋',kind:'location'}).id,'bld_hw_riverhome');
    const first=catalogDefinition(engine,document,{kind:'item'}),next=catalogDefinition(engine,document,{kind:'item',offset:first.nextOffset});
    assert.ok(next.entries.length);assert.ok(next.entries.every(row=>!first.entries.some(old=>old.id===row.id)));
    assert.equal(engine.resolve('铁铰链','item'),'item_iron_hinge');
    assert.throws(()=>engine.resolve('木楔','recipe'),/recipe_wooden_pegs/);
    assert.throws(()=>engine.resolve('loc_hw_nonexistent'),/已登记中文名称/);
    const scene=engine.scene(document,'去河边小屋');assert.match(scene,/河边小屋（bld_hw_riverhome）/);assert.ok(scene.length<=6000);
});
test('未取得的隐藏身份不泄露触发条件，取得后仅返回已知能力和代价',async()=>{
    const engine=new WorldEngine(await loadWorld()),document=engine.initialFromLegacy(seed,'hidden-catalog');
    const hidden=engine.world.professions.find(row=>row.kind==='hidden');
    const denied=catalogDefinition(engine,document,{entity:hidden.id});
    assert.equal(denied.available,false);assert.equal(denied.trigger,undefined);assert.equal(denied.name,undefined);
    assert.ok(catalogDefinition(engine,document,{kind:'profession'}).entries.every(row=>!engine.byId.get(row.id).trigger));
    document.state.professions.hidden.push(hidden.id);
    assert.deepEqual(Object.keys(catalogDefinition(engine,document,{entity:hidden.id})).sort(),['ability','cost','id','name']);
});
