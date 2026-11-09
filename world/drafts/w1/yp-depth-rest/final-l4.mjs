import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {hashContent} from '../../../../tools/content-pipeline.mjs';
const root=new URL('./',import.meta.url),read=async f=>JSON.parse(await fs.readFile(new URL(f,root),'utf8')),write=async(f,v)=>fs.writeFile(new URL(f,root),JSON.stringify(v,null,2)+'\n');
const prior=[...await read('human-notes-first10.json'),...await read('human-notes-next5.json')],details={
weichi:'复审后重读全部修订叶与L2；姓名已为卫冉，父女关系明确，职业改为卫迟本人搓绳和翻看旧股。对殷茸的解释是待问意愿；共享回忆与殷茸一致，未交接绳料或产生合作。',
genglu:'重读全部修订叶与L2；垫石回水观察沿既有经历，掀角须等屋主确认，未来复看没有保证地基已通过雨季。与席存相认不等于委托记工，约工核名仅为待询事项。',
xicun:'复审后重读全部修订叶与L2；席楚明确为儿子，去掉其替母亲办认签工事的安排。缪朴未知不再预设送过柴束；读回姓名、保留难认签均待做，没有判定物主。',
miaopu:'重读全部修订叶与L2；缪莹同戶关系及土床压实来自原档，株距插记的复看是未来步骤。包印是否走便道尚未确认，共同相认没有替对方接活。',
baoyin:'重读全部修订叶与L2；用台等待和木屑收尾从原目标派生，未把空位记成已归还，也没有把等待计成已收工资。与缪朴相认的回忆保持双方同文。',
fengya:'重读全部修订叶与L2；冯珈同户及共灶抢洗盆来自原档，相撞时段须分别询问。与石苓回忆仅为已有同村往来，没有把灶上工时自动排为夜学。',
shiling:'重读全部修订叶与L2；误听家务字与成人羞于提问对应原目标，读回和练习计划仍pending。冯雅参加读字是未知意愿，未要求儿子放弃农活。',
shaoruo:'重读全部修订叶与L2；顺逆坡、起止点与误差依原测步目标补步骤，未把估计定成准数。凌宛是否说明湿地仍待问，共同记忆没有纳入私宅门槛测量。',
lingwan:'重读全部修订叶与L2；门边湿鞋、水印和换鞋位置仍待商量，未让家人承担已承诺工事。邵若路线询问是待知事项，未将私宅门槛排入共同测步。',
kongfu:'公共复审后重读全部修订叶与L2；孔衡明确为儿子，清洗晒药布和承认未亲見沿原档。未知不再指认俞澄就是被传话惹怒的邻人；原话来源仍须问明，回忆未借工具。',
yucheng:'重读全部修订叶与L2；受潮栏门开合和物主腾空门边有原档支持，后续检看与使用者反馈未称完成。与孔馥回忆两方相同，未交付工具、新增门或能力。',
qiuyan:'重读全部修订叶与L2；含糊收货人未补成真实姓名，未知汤桓认字能力未断言已会。与汤桓回忆候选同文，但另一方L2仍因共享事件来源hard，本所属批不批准发布。',
zhangyi:'重读全部修订叶与L2；章采同户和旧具混叫依原档，拿不准的叫法仍待问。与利莎回忆没有替住户答应出工，不把年轻人听过解释说成已掌握用途。',
lisha:'重读全部修订叶与L2；工日相撞保持未解决，逐人核问时段和照护限制均为future pending。章颐叫法和利帆空闲仍待确认，没有替任何户答应工日。'
};
const tang=await read('npc_yp_tanghuan.json'),windowStart=tang.reviewRecovery.finishedAt,readAt=new Date().toISOString();assert.ok(Date.parse(readAt)-Date.parse(windowStart)<600000,'本次读稿窗口须不超过10分钟');
const notes=[];for(const r of prior){const record=await read(r.id+'.json');assert.equal(r.draftHash,hashContent(record.draft));assert.equal(r.reviewHash,hashContent(record.review));notes.push({...r,note:r.note+' 最终复审后重新阅读，修订及L2哈希未变。',readAt});}
for(const [key,note]of Object.entries(details)){const id='npc_yp_'+key,record=await read(id+'.json');assert.equal(record.status,'passed');assert.deepEqual(record.errors,[]);notes.push({id,note,draftHash:hashContent(record.draft),reviewHash:hashContent(record.review),readAt});}assert.equal(notes.length,29);await write('human-notes.json',notes);
const summary=await read('summary.json'),packets=[];for(const summaryBatch of summary.batches){const batch=await read(`batch-${summaryBatch.index}.json`),records=await Promise.all(batch.ids.map(id=>read(id+'.json')));assert.equal(batch.fingerprint,summaryBatch.fingerprint);assert.equal(batch.fingerprint,hashContent(records.map(({id,draft,review,status})=>({id,draft,review,status}))));
 const reviewed=records.filter(r=>r.status==='passed');for(const r of reviewed){const note=notes.find(n=>n.id===r.id);assert.equal(note.draftHash,hashContent(r.draft));assert.equal(note.reviewHash,hashContent(r.review));assert.deepEqual(r.errors,[]);assert.ok(!r.review.contradictions.some(c=>c.severity==='hard'));}
 const approved=reviewed.length===records.length&&!batch.needsSystemicRepair;
 batch.l4={approved,reviewedAt:readAt,readingWindowUpperBoundStart:windowStart,readingWindowUpperBoundMs:Date.parse(readAt)-Date.parse(windowStart),notes:reviewed.map(r=>notes.find(n=>n.id===r.id)),blocked:records.filter(r=>r.status!=='passed').map(r=>({id:r.id,errors:r.errors}))};await write(`batch-${batch.index}.json`,batch);summary.batches[summary.batches.findIndex(b=>b.index===batch.index)]=batch;
 packets.push({batch:batch.index,approved,readAt,records:records.map(({id,draft,review,status})=>({id,draft,review,status,draftHash:hashContent(draft),reviewHash:hashContent(review)}))});}
await write('summary.json',summary);await write('l4-reading-packets.json',packets);console.log(JSON.stringify({read:29,batches:summary.batches.map(b=>({index:b.index,approved:b.l4.approved,read:b.l4.notes.length,blocked:b.l4.blocked.map(r=>r.id)})),wholeCardApproved:false}));
