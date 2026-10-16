import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from 'node:path';
import {WorldRegistry}from'../server-plugin/world-registry.mjs';
import {loadWorld}from'../tools/load-world.mjs';
test('并发创建战役只写一次同版本归档，独立注册器也不会竞争覆盖Windows文件',async t=>{
    const root=await fs.mkdtemp(path.join(tmpRoot(),'fields-world-concurrent-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const world=await loadWorld(),registries=Array.from({length:16},()=>new WorldRegistry(root));
    const hashes=await Promise.all(registries.map(registry=>registry.put(world)));
    assert.equal(new Set(hashes).size,1);assert.deepEqual(await fs.readdir(root),[`${hashes[0]}.json`]);
    assert.deepEqual((await new WorldRegistry(root).get(hashes[0])).world,world);
});
test('E1 世界更新不能改写旧战役的冻结规则或人设',async t=>{
    const root=await fs.mkdtemp(path.join(tmpRoot(),'infinite-fields-versions-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const world=await loadWorld(),registry=new WorldRegistry(root),oldHash=await registry.put(world);
    const changed=structuredClone(world);changed.npcs[0].notes='全新世界的刺客身份';changed.spells[0].mp=100;
    const newHash=await registry.put(changed);assert.notEqual(newHash,oldHash);
    const restarted=new WorldRegistry(root),original=await restarted.get(oldHash);
    assert.equal(original.world.npcs[0].notes,world.npcs[0].notes);assert.equal(original.world.spells[0].mp,1);
    assert.equal((await restarted.get(newHash)).world.spells[0].mp,100);
    await assert.rejects(restarted.get('../invalid'),/无效/);
});
