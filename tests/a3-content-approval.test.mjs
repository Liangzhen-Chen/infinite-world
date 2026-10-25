import test from 'node:test';
import assert from 'node:assert/strict';
import {loadWorld} from '../tools/load-world.mjs';
import {readFiles,contentEntries,checkEntry,verifyPublished} from '../world/design/a3-content-approval-content.mjs';

// Gate for the A3 content written outside the publication pipeline (examiners, Huancheng
// officials/facility rows, 28 examiner offices, four hand-added location fields): every
// such row must carry L1/L2/L4 receipts bound to its exact bytes. A later hand edit of
// any of these rows breaks the receipt and fails here.
const world=await loadWorld(),files=await readFiles();

test('A3 补审条目：每一行都有 L1/L2/L4 回执且与正式文件逐字相同',async()=>{
 const result=await verifyPublished(world,files);
 assert.equal(result.entries,52);
});

test('手改已审批的行会使回执失效：考官席位、人物年龄、地点字段',async()=>{
 const seat=structuredClone(files);
 seat.factions.find(f=>f.id==='faction_lampbridge').offices.find(o=>o.id==='office_exam_life_6').seat='bld_bs_guild';
 await assert.rejects(()=>verifyPublished(world,seat));
 const person=structuredClone(files);
 person.baseline.find(n=>n.id==='npc_hc_yicen').age=51;
 await assert.rejects(()=>verifyPublished(world,person),/发布骨架或引用事实已改变|正式文件/);
 const site=structuredClone(files);
 site.locations.find(l=>l.id==='loc_hw_northwood').site.resources[0].quantity=21;
 await assert.rejects(()=>verifyPublished(world,site),/发布骨架或引用事实已改变|正式文件/);
});

test('L1：考官席位必须与考官住处同一聚落，来源写的数字必须与职业和持有人相符',()=>{
 const entry=structuredClone(contentEntries(files).find(e=>e.id==='office_exam_life_6'));
 assert.deepEqual(checkEntry(world,entry),[]);
 entry.row.seat='bld_bs_guild';
 assert.match(checkEntry(world,entry).join(';'),/不在同一聚落/);
 const source=structuredClone(contentEntries(files).find(e=>e.id==='office_exam_life_5'));
 source.row.source=source.row.source.replace('现有熟练度220','现有熟练度999');
 assert.match(checkEntry(world,source).join(';'),/现有熟练度/);
});
