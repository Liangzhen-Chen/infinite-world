import fs from 'node:fs/promises';
import {hashContent} from './content-pipeline.mjs';
const root='world/drafts/w1/yupo-depth',read=async name=>JSON.parse(await fs.readFile(`${root}/${name}.json`,'utf8'));
const notes={
 npc_yp_zhaofeng:'核对低垄水痕而未定轮次；未知保留乔端私下改沟及未查旧页，原漏行经历没有重写。',
 npc_yp_qiaoduan:'删除样例台词串入的“一指”尺寸后逐条复审；只记与赵枫核痕，不知道对方漏行原因。',
 npc_yp_wenxu:'穗袋避风与检看通道仍冲突，未替蒋弥同意挪篱；具体分袋核查步骤未宣称完成。',
 npc_yp_jiangmi:'共享木作院谈话只涉及占位，不知道温绪袋内用途；邻户同意仍未知。',
 npc_yp_hanpei:'共灶门外争执未产生换工或报酬；知情限定两人，私下补圈的旧记忆保持原状。',
 npc_yp_zhusheng:'清扫最后一段仍未分工；与母亲及秦砺的关系具体，未新增修磨能力。',
};
const summary=await read('summary');for(const batch of summary.batches){const records=await Promise.all(batch.ids.map(read));if(records.some(r=>r.status!=='passed'||r.errors.length||r.review.contradictions.some(c=>c.severity==='hard')))throw Error('存在未通过条目');if(hashContent(records.map(r=>({id:r.id,draft:r.draft,review:r.review,status:r.status})))!==batch.fingerprint)throw Error('批次内容改变');batch.l4={approved:true,reviewedAt:new Date().toISOString(),notes:records.map(r=>({id:r.id,note:notes[r.id],draftHash:hashContent(r.draft),reviewHash:hashContent(r.review)}))};await fs.writeFile(`${root}/batch-${batch.index}.json`,JSON.stringify(batch,null,2)+'\n');}await fs.writeFile(`${root}/summary.json`,JSON.stringify(summary,null,2)+'\n');
