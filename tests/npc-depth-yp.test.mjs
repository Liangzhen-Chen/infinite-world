import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {auditNpcDepth} from '../tools/audit-npc-depth.mjs';
import {validateNpcDepth} from '../tools/npc-profile-validation.mjs';
import {depthEntries,validatePatchResults,verifyUnchanged,getPath,contextFor} from '../tools/npc-depth-content.mjs';
import {hashContent} from '../tools/content-pipeline.mjs';
import * as design from '../world/design/w1-yp-depth-rest.mjs';
const world=await loadWorld(),base=design.patchRows.map(r=>r.before),entries=depthEntries(base,design,world),merged=validatePatchResults(entries,world);
test('榆坡既有30人合并视图逐字段过独立深度门槛，其他村审计不变',()=>{
 assert.equal(entries.length,30);assert.equal(merged.npcs.filter(n=>n.id.startsWith('npc_yp_')).length,30);
 for(const validate of [auditNpcDepth,validateNpcDepth])assert.deepEqual(validate(merged).issues.filter(i=>i.id.startsWith('npc_yp_')),[]);
 assert.deepEqual(auditNpcDepth(merged).issues.filter(i=>!i.id.startsWith('npc_yp_')),auditNpcDepth(world).issues.filter(i=>!i.id.startsWith('npc_yp_')));
 assert.ok(auditNpcDepth(merged).legacyTraits.ok);
});
test('每个修订绑定实际审计路径和冻结原档，既有钱物与身份仍相同',()=>{
 for(const e of entries){const current=world.npcs.find(n=>n.id===e.id);assert.deepEqual(e.before,current);assert.equal(hashContent(current),e.baseHash);verifyUnchanged(current,e.facts,e);
 for(const p of e.patches){assert.notDeepEqual(getPath(current,p.path),p.value);assert.match(p.path,/^(knowledge|voice|goals|relationships|memorySeeds|opinions)\b/);}
 for(const field of ['id','age','coins','inventory','traits','personality','home','occupation','skills','proficiencies','services','secrets','schedule'])assert.deepEqual(e.facts[field],current[field]);
 assert.deepEqual(e.facts.memorySeeds.slice(0,current.memorySeeds.length),current.memorySeeds);
 }
});
test('旧十人的达标记忆没有新增，二十个缺口人物共享相同事件与知情者',()=>{
 const existing=entries.slice(0,10);for(const e of existing)assert.deepEqual(e.facts.memorySeeds,e.before.memorySeeds);
 for(const e of entries.slice(10)){assert.equal(e.facts.memorySeeds.length,e.before.memorySeeds.length+1);const m=e.facts.memorySeeds.at(-1);assert.ok(m.knownBy.includes(e.id));assert.equal(m.knownBy.length,2);const other=entries.find(x=>x.id===m.knownBy.find(id=>id!==e.id));assert.deepEqual(other.facts.memorySeeds.find(x=>x.id===m.id),m);}
});
test('L2引用上下文覆盖全部新叶子，地方当事人与作者小批有登记',async()=>{
 for(const e of entries){const context=contextFor(e,world);assert.deepEqual(context.revisions.map(r=>r.path),e.patches.map(p=>p.path));for(const p of e.patches)assert.deepEqual(context.revisions.find(r=>r.path===p.path).after,p.value);}
 const groups=JSON.parse(await fs.readFile(new URL('../world/drafts/w1/yp-depth-rest/author-batches.json',import.meta.url)));assert.deepEqual(groups.batches.flat().map(k=>'npc_yp_'+k).sort(),entries.map(e=>e.id).sort());assert.ok(groups.batches.every(b=>b.length>=3&&b.length<=5));
});

