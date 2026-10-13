import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {digest} from '../../../server-plugin/storage.mjs';
import {hashContent} from '../../../tools/content-pipeline.mjs';
export async function yupoEvidence(world){
 const root=path.resolve(import.meta.dirname,'../../..');
 const read=async file=>JSON.parse(await fs.readFile(path.resolve(root,file),'utf8'));
 const prior=await read('docs/测试报告/M2-recheck-003/preflight.json');
 const reuse=await read('docs/测试报告/M2-recheck-004/yupo-reuse-context.json');
 assert.equal(reuse.priorCommit,prior.commit);
 assert.deepEqual(reuse.changedFiles,[],'旧审核来源发生变更，不能复用');
 assert.deepEqual(reuse.workspaceChanges,[],'旧审核来源有未提交变更，不能复用');
 assert.ok(prior.preflightReady);
 const frozen=await read('docs/测试报告/M2-recheck-003/frozen-inputs.json');
 assert.equal(digest(frozen.world),prior.worldHash);
 const evidence=prior.yupoPublished,plan=await read(evidence.manifest);
 assert.equal(digest(plan),evidence.manifestHash);
 assert.deepEqual(evidence.changed,[]);
 assert.equal(evidence.profiles.length,30);
 assert.deepEqual(plan.expectedIds.sort(),evidence.profiles.map(e=>e.id).sort());
 for(const row of evidence.profiles)assert.equal(hashContent(world.npcs.find(n=>n.id===row.id)),row.hash,`已审榆坡人物改变：${row.id}`);
 return evidence;
}
