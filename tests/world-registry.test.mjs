import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {WorldRegistry}from'../server-plugin/world-registry.mjs';
import {loadWorld}from'../tools/load-world.mjs';
test('E1 世界更新不能改写旧战役的冻结规则或人设',async t=>{
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'infinite-fields-versions-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const world=await loadWorld(),registry=new WorldRegistry(root),oldHash=await registry.put(world);
    const changed=structuredClone(world);changed.npcs[0].notes='全新世界的刺客身份';changed.spells[0].mp=100;
    const newHash=await registry.put(changed);assert.notEqual(newHash,oldHash);
    const restarted=new WorldRegistry(root),original=await restarted.get(oldHash);
    assert.equal(original.world.npcs[0].notes,world.npcs[0].notes);assert.equal(original.world.spells[0].mp,1);
    assert.equal((await restarted.get(newHash)).world.spells[0].mp,100);
    await assert.rejects(restarted.get('../invalid'),/无效/);
});
