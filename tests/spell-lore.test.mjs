import test from'node:test';
import assert from'node:assert/strict';
import {loreConstraintErrors}from'../tools/spell-lore-constraints.mjs';
import {spellBlueprints}from'../world/design/spell-blueprints.mjs';
test('草稿质量拦截已精读发现的时限、开发措辞与气囊扩权',()=>{
    assert.ok(loreConstraintErrors({theory:'火纹能保留约一个时辰。'},{duration:60}).length);
    assert.ok(loreConstraintErrors({theory:'射程仍限于骨架范围。'}).some(error=>error.includes('开发措辞')));
    assert.ok(loreConstraintErrors({theory:'持续筛选并固定空气，持续1分钟。'},{mechanism:'air_bubble',duration:1}).some(error=>error.includes('过滤')));
    assert.deepEqual(loreConstraintErrors({theory:'空气封存在两升气腔内，静息使用最多1分钟。'},{mechanism:'air_bubble',duration:1}),[]);
    assert.deepEqual(loreConstraintErrors({theory:'静息使用最多六十秒。'},{duration:1}),[]);
    assert.deepEqual(loreConstraintErrors({theory:'火纹最多维持一小时。'},{duration:60}),[]);
    assert.deepEqual(loreConstraintErrors({theory:'效果持续三十分钟。'},{duration:30}),[]);
});
test('法术时限区分瞬时结果与持续魔法，干衣、凝水和读数不自动回退',()=>{
    const rows=spellBlueprints(),byMechanism=new Map(rows.map(row=>[row.mechanism,row]));
    for(const mechanism of['dry','condense','sense_soil','measure','repair_metal'])assert.equal(byMechanism.get(mechanism).duration,0);
    assert.equal(byMechanism.get('air_bubble').duration,1);
    assert.equal(byMechanism.get('levee').duration,60);
    assert.equal(byMechanism.get('stone_skin').duration,90);
    assert.equal(byMechanism.get('mark').duration,60);
});
