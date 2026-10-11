import fs from 'node:fs/promises';
import {hashContent} from './content-pipeline.mjs';
if(process.argv.includes('--help')){console.log('npc-depth-l4 --batch <旧batch> | --design <设计> --root <候选目录> --notes <逐条人工阅读.json>\n新 notes 为 [{id,note,draftHash,reviewHash}]；哈希必须对应实际阅读的候选与L2。');process.exit(0);}
const option=name=>{const at=process.argv.indexOf(name);return at<0?undefined:process.argv[at+1];};
const modern=!!option('--design');
const at=process.argv.indexOf('--batch'),name=at<0?'yupo-depth':process.argv[at+1];if(!modern&&!['yupo-depth','yupo-depth-next'].includes(name))throw Error('未登记人物批次');
const root=option('--root')??`world/drafts/w1/${name}`,read=async name=>JSON.parse(await fs.readFile(`${root}/${name}.json`,'utf8'));
const legacyNotes={
 npc_yp_qinli:'通读；高忻正式性别为女，已补真实引用并定点复审代词。桌位未定、旧磨架未称修好；与朱笙的关联沿既有已审核谈话补全。',
 npc_yp_gaoxin:'通读；去除同一处和整张纸等未声明细节后复审。愿谈轮换来自人工facts，不是已经定序；不知陶咨空桶归属或弟弟未说出口的心思。',
 npc_yp_taozi:'通读；去除声线习惯串入的敲空桶动作后复审。衣物归属未知，姐姐停顿与外甥女回避只作可见行为，不断言其内心。',
 npc_yp_luxia:'通读；衣物与桶件暂存未定序，家务与针线目标仍待行动；记忆只与陶咨共享，不拥有秦砺高忻桌位谈话。',
 npc_yp_zhaofeng:'核对低垄水痕而未定轮次；未知保留乔端私下改沟及未查旧页，原漏行经历没有重写。',
 npc_yp_qiaoduan:'删除样例台词串入的“一指”尺寸后逐条复审；只记与赵枫核痕，不知道对方漏行原因；后续知识句改为两人当面对过水痕，经定点L2无矛盾。',
 npc_yp_wenxu:'穗袋避风与检看通道仍冲突，未替蒋弥同意挪篱；具体分袋核查步骤未宣称完成。',
 npc_yp_jiangmi:'共享木作院谈话只涉及占位，不知道温绪袋内用途；邻户同意仍未知。',
 npc_yp_hanpei:'共灶门外争执未产生换工或报酬；知情限定两人，私下补圈的旧记忆保持原状；知识句现明确双方尚未约定换工，经定点L2无矛盾。',
 npc_yp_zhusheng:'清扫最后一段仍未分工；与母亲及秦砺的关系具体，未新增修磨能力；知识句现明确双方尚未约定清扫报酬或换工，经定点L2无矛盾。',
};
let reading;if(modern){if(!option('--notes'))throw Error('新批次需要逐条人工阅读记录 --notes');reading=JSON.parse(await fs.readFile(option('--notes'),'utf8'));if(!Array.isArray(reading))throw Error('人工记录须为数组');}
const notes=modern?Object.fromEntries(reading.map(r=>[r.id,r.note])):legacyNotes;
const summary=await read('summary');for(const batch of summary.batches){const records=await Promise.all(batch.ids.map(read));if(modern)for(const r of records){const note=reading.find(n=>n.id===r.id);if(note?.draftHash!==hashContent(r.draft)||note?.reviewHash!==hashContent(r.review)||typeof note.note!=='string'||!note.note.trim())throw Error('人工阅读记录已过期或缺失 '+r.id);}
if(records.some(r=>!notes[r.id]))throw Error('缺逐条人工阅读记录');if(records.some(r=>r.status!=='passed'||r.errors.length||r.review.contradictions.some(c=>c.severity==='hard')))throw Error('存在未通过条目');if(hashContent(records.map(r=>({id:r.id,draft:r.draft,review:r.review,status:r.status})))!==batch.fingerprint)throw Error('批次内容改变');batch.l4={approved:true,reviewedAt:new Date().toISOString(),notes:records.map(r=>({id:r.id,note:notes[r.id],draftHash:hashContent(r.draft),reviewHash:hashContent(r.review)}))};await fs.writeFile(`${root}/batch-${batch.index}.json`,JSON.stringify(batch,null,2)+'\n');}await fs.writeFile(`${root}/summary.json`,JSON.stringify(summary,null,2)+'\n');
