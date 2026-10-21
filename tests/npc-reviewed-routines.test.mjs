import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpRoot} from '../tools/tmp-root.mjs';
import {restoreReviewedNpcRoutines} from '../tools/publish-npc-depth.mjs';

const manifest=path.resolve('world/drafts/w1/existing-depth/first-review/manifest.json');
const baseline=path.resolve('world/people/baseline.json');
test('已审批作息定向恢复重放不写入，不改变正式人物字节或时间戳',async()=>{
 const bytes=await fs.readFile(baseline),stat=await fs.stat(baseline);
 const result=await restoreReviewedNpcRoutines({manifest,publish:true});
 assert.deepEqual(result.changed,[]);assert.deepEqual(result.restoredNpcIds,[]);assert.equal(result.modelCalls,0);
 assert.deepEqual(await fs.readFile(baseline),bytes);assert.equal((await fs.stat(baseline)).mtimeMs,stat.mtimeMs);
});
test('定向恢复不能绕过原审批清单指纹，拒绝时不写正式源',async t=>{
 const dir=await fs.mkdtemp(path.join(tmpRoot(),'reviewed-routine-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const plan=JSON.parse(await fs.readFile(manifest,'utf8'));plan.foundationHash='0'.repeat(64);
 const forged=path.join(dir,'manifest.json');await fs.writeFile(forged,JSON.stringify(plan));
 const bytes=await fs.readFile(baseline);
 await assert.rejects(restoreReviewedNpcRoutines({manifest:forged,worldRoot:path.resolve('world'),publish:true}),/骨架指纹已过期/);
 assert.deepEqual(await fs.readFile(baseline),bytes);
});
