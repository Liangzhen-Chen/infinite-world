import fs from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';
import {loadWorld} from './load-world.mjs';
import {economyW3} from '../world/design/economy-w3.mjs';
import {economyW3Trades} from '../world/design/economy-w3-trades.mjs';
import {economyW3Journey} from '../world/design/economy-w3-journey.mjs';
import {readApprovedContent,hashContent,approvalIncomplete,reportApprovalIncomplete} from './content-pipeline.mjs';
import {getPath,setPath} from '../world/design/p1-revision-approval.mjs';
import {readApprovedSupersedes,applySupersedes,createTagSourceResolver,overlayFieldReverts,createRowReceiptResolver} from './approved-revisions.mjs';
import {w3Context,w3Revision,validateW3Draft} from './w3-content.mjs';
import {tradesRevision,validateTradesDraft} from './w3-trades.mjs';
import {journeyContext,journeyRevision} from './w3-journey.mjs';
export const scorePath='world/drafts/w3/wave-score.json';
export const dimensions=['具体性','独特性','内在一致性','与世界的连接','可玩性','说话方式辨识度'];
// 细则（SKELFACT 起）：具体性、独特性两项的每条评分除 quote 外须给 basis（该原句对应的骨架字段路径，如 physical.appearance、use、recipe.processFacts）；
// 原句里有骨架外的具体（fabricated 非空），该项最高 2 分。只约束新写入的评分；门槛不变。
export const basisDimensions=['具体性','独特性'];
export const basisRule='具体性、独特性两项的每条评分，除 quote 外必须给 basis，即该原句对应的骨架字段路径（如 physical.appearance、use、recipe.processFacts），路径必须在该样本的骨架或配方里存在；原句里有骨架外的具体，把这些原文片段列入 fabricated（须是 quote 的子串），该项最高 2 分。';
export const fabricatedCap=2;
// 样本的骨架根：物品取自身骨架并挂 recipe（以它为产出的配方）；配方条目的 recipe 就是自身。
export function skeletonRoot(bone,recipe=null){return {...bone,recipe:bone.id?.startsWith('recipe_')?bone:recipe};}
export function basisExists(root,path){
 if(typeof path!=='string'||!path.trim())return false;
 let cur=root;for(const part of path.trim().split('.')){if(cur===null||typeof cur!=='object'||!Object.hasOwn(cur,part))return false;cur=cur[part];}
 return cur!==undefined&&cur!==null&&cur!==''&&!(Array.isArray(cur)&&!cur.length);
}
export const factCorrections=[
 {id:'recipe_w3_weaving_sword',field:'process',from:'取一公斤通用木料',to:'取两公斤通用木料',reason:'一份通用木料实际为2公斤，修正工序中的用量文字。'},
 {id:'item_cheese_rye_panbread',field:'description',from:'两面烙出焦褐斑纹，再夹入硬乳酪薄片，趁热折合压实。',to:'中间夹入硬乳酪薄片，趁糊尚软折合压实，再将两面烙出焦褐斑纹。',reason:'恢复既定先夹乳酪再烙两面的工序。'},
];
export function acceptFactCorrections(report,entries,patches=factCorrections){
 const before=structuredClone(entries);
 for(const p of patches){const row=before.find(x=>x.id===p.id);if(!row?.entity[p.field]?.includes(p.to)||row.entity[p.field].includes(p.from))throw new Error('正式修正未应用 '+p.id);row.entity[p.field]=row.entity[p.field].replace(p.to,p.from);}
 if(hashContent(before)!==report.corpusHash)throw new Error('除指定事实修正外还存在内容变化');
 const ids=report.samples.map(x=>x.id);if(JSON.stringify(ids)!==JSON.stringify(fixedSample(entries,report.seed).map(x=>x.id)))throw new Error('固定样本已改变');
 const next=structuredClone(report);next.corrections=[...(next.corrections??[]),{at:new Date().toISOString(),beforeCorpusHash:report.corpusHash,afterCorpusHash:hashContent(entries),patches}];next.corpusHash=hashContent(entries);
 for(const row of next.samples)row.entityHash=hashContent(entries.find(x=>x.id===row.id).entity);
 return next;
}
// 语料哈希随正式条目变化而失效。若全部变化都来自已审批的修订回执或已审叠加层，且 10 个固定样本的 entityHash 都没变，
// 则把这些变化回退后核对评分时的语料哈希，相符才按回执重算并记录依据；回退后仍不符说明还有无法归因的变化，照旧判失效。
// explained：已指到来源的字段变化（publishedW3 给出的 tags 叠加与修订回执取代的值，加上 overlayFieldReverts 给出的叠加字段）。
export function recomputeCorpusHash(report,entries,explained,{now=new Date()}={}){
 const sample=fixedSample(entries,report.seed);
 if(JSON.stringify(report.samples.map(x=>x.id))!==JSON.stringify(sample.map(x=>x.id)))throw new Error('固定样本已改变');
 for(const row of report.samples)if(row.entityHash!==hashContent(entries.find(x=>x.id===row.id).entity))throw new Error(`固定样本 ${row.id} 的条目哈希已改变，评分依据失效`);
 if(!explained.length)throw new Error('没有可归因于已审批回执或叠加层的内容变化');
 const before=structuredClone(entries);
 for(const e of explained){
  const row=before.find(x=>x.id===e.id);if(!row)throw new Error(`回退目标不存在 ${e.id}`);
  if(e.remove){const key=e.parts.at(-1),parent=getPath(row.entity,e.parts.slice(0,-1));if(!parent||!Object.hasOwn(parent,key))throw new Error(`回退目标不存在 ${e.id}/${key}`);delete parent[key];}
  else setPath(row.entity,e.parts,e.old);
 }
 // 评分时的语料哈希：已重算过的报告，corpusHash 是上一次重算后的值；全部归因变化回退后应回到最初评分时的哈希（第一次重算记下的 beforeCorpusHash）。
 if(hashContent(before)!==(report.corpusRecomputations?.[0]?.beforeCorpusHash??report.corpusHash))throw new Error('仍有无法归因于已审批回执或已审叠加层的内容变化：回退已归因的变化后，语料哈希与评分时的不符');
 const next=structuredClone(report),afterHash=hashContent(entries);
 next.corpusRecomputations=[...(next.corpusRecomputations??[]),{at:now.toISOString(),beforeCorpusHash:report.corpusHash,afterCorpusHash:afterHash,sampleEntityHashesUnchanged:true,basis:explained.map(e=>({id:e.id,field:e.parts.map(p=>typeof p==='string'?p:`[id=${p.id}]`).join('.'),...(e.remove?{added:true}:{}),source:e.source}))}];
 next.corpusHash=afterHash;
 return next;
}
export function fixedSample(entries,seed,count=10){
 if(!/^[0-9a-f]{64}$/.test(seed))throw new Error('无效抽样种子');
 const rows=[...entries].sort((a,b)=>a.id.localeCompare(b.id));let counter=0;
 const draw=max=>{const limit=Math.floor(0x100000000/max)*max;for(;;){const n=createHash('sha256').update(`${seed}:${counter++}`).digest().readUInt32BE(0);if(n<limit)return n%max;}};
 for(let i=rows.length-1;i>0;i--){const j=draw(i+1);[rows[i],rows[j]]=[rows[j],rows[i]];}
 return rows.slice(0,count);
}
export async function publishedW3(world){
 const block=JSON.parse(await fs.readFile('world/meta/blocklist.json','utf8')),entries=[],batches=[],errors=[],explained=[],skeletons=new Map();
 const supersedes=await readApprovedSupersedes(),resolveTag=createTagSourceResolver(),resolveRow=createRowReceiptResolver(world);
 for(const [label,root,bones,revision,context,validate]of [
  ['家用首批','world/drafts/w3',economyW3(world),w3Revision,w3Context,validateW3Draft],
  ['行商工艺','world/drafts/w3/trades',economyW3Trades(world),tradesRevision,w3Context,validateTradesDraft],
  ['远行细作','world/drafts/w3/journey',economyW3Journey(world),journeyRevision,journeyContext,validateTradesDraft],
 ])for(const kind of ['items','recipes']){
  const approved=await readApprovedContent(`${root}/${kind}`,bones[kind],{contextFor:e=>context(world,bones,e),revision});
  if(approved.length!==bones[kind].length)throw approvalIncomplete(`${label}/${kind}仍有待审`);
  // 设计源骨架上被已审批修订回执取代的值，按回执更新后再比对（读取在审批指纹核验之后，核验仍用审批时的骨架）。
  const effective=structuredClone(bones[kind]);
  for(const a of applySupersedes(effective,`${root}/bones.json`,supersedes))explained.push({id:a.id,parts:a.parts,old:a.before,source:`修订回执 ${a.revision}：${a.receiptFile}#${a.id} ${a.field}`});
  const summary=JSON.parse(await fs.readFile(`${root}/${kind}/summary.json`,'utf8'));
  if(summary.manual||summary.pending||summary.passed!==bones[kind].length)throw approvalIncomplete(`${label}/${kind}摘要仍有待审`);
  for(const b of summary.batches)batches.push({label,kind,index:b.index,count:b.count,fingerprint:b.fingerprint});
  for(const bone of bones[kind]){
   const draft=approved.find(x=>x.id===bone.id),official=world[kind].find(x=>x.id===bone.id);if(!official)throw new Error(`未发布 ${bone.id}`);
   const {processFacts,physical,...mechanics}=effective.find(x=>x.id===bone.id),expected={...mechanics,...draft};
   for(const [key,value]of Object.entries(expected)){
    if(JSON.stringify(official[key])===JSON.stringify(value))continue;
    // 用途标签是后续已审叠加层写入的：正式值须包含骨架值，且多出的每个标签都能指到已审批来源；找不到来源的仍报错。
    if(key==='tags'&&Array.isArray(value)&&Array.isArray(official.tags)&&value.every(t=>official.tags.includes(t))){
     const extra=official.tags.filter(t=>!value.includes(t)),sources=[];
     for(const tag of extra){const r=await resolveTag(official,tag);if(r?.source)sources.push(`${tag}：${r.source}`);else errors.push(`正式条目 ${bone.id}/tags 多出的标签 ${tag} 找不到已审批来源${r?.error?'（'+r.error+'）':''}`);}
     if(extra.length&&sources.length===extra.length){explained.push({id:bone.id,parts:['tags'],old:value,source:sources.join('；')});continue;}
     if(extra.length)continue;
    }
    // 字段不同于 w3 草稿，但等于已审批整行回执（如 a3-world 的重审）里的值：已归因，旧值取 w3 草稿值（评分时的值）。
    const rowSource=await resolveRow(bone.id,key,official[key]);
    if(rowSource){explained.push({id:bone.id,parts:[key],old:value,source:rowSource});continue;}
    errors.push(`正式条目不同于已审骨架/文字 ${bone.id}/${key}`);
   }
   const checks=validate(draft,bone,block,context(world,bones,bone));if(checks.errors.length)errors.push(`${bone.id}: ${checks.errors.join('；')}`);
   entries.push({id:bone.id,kind,source:label,entity:official});
   skeletons.set(bone.id,skeletonRoot(bone,kind==='items'?bones.recipes.find(r=>r.output?.item===bone.id)??null:null));
  }
 }
 // 骨架是规则派生的（如成品价），上游修订后骨架本身已是新值，applySupersedes 无需更新；但正式条目现值相对评分时的旧值仍变了：
 // 回执声明的 after 等于正式现值，也算已归因（旧值取回执的 before），供语料哈希回退。
 for(const s of supersedes){
  const x=entries.find(e=>e.id===s.targetId);
  if(!x||explained.some(a=>a.id===s.targetId&&JSON.stringify(a.parts)===JSON.stringify(s.parts)))continue;
  if(hashContent(getPath(x.entity,s.parts)??null)===hashContent(s.after))explained.push({id:s.targetId,parts:s.parts,old:s.before,source:`修订回执 ${s.revision}：${s.receiptFile}#${s.targetId} ${s.label}`});
 }
 if(errors.length)throw new Error(errors.join('\n'));
 entries.sort((a,b)=>a.id.localeCompare(b.id));if(new Set(entries.map(x=>x.id)).size!==entries.length)throw new Error('W3条目重复');
 if(world.items.length<400||world.recipes.length<200)throw new Error('正式目录未达到400/200');
 return{entries,skeletons,audit:{publishedItems:world.items.length,publishedRecipes:world.recipes.length,w3Items:entries.filter(x=>x.kind==='items').length,w3Recipes:entries.filter(x=>x.kind==='recipes').length,approvedEntries:entries.length,pending:0,manual:0,batches:batches.length},corpusHash:hashContent(entries),explained};
}
export function validateScores(report,entries,skeletons=null){
 if(report.corpusHash!==hashContent(entries))throw new Error('正式内容已改变，评分依据失效');
 const sample=fixedSample(entries,report.seed);if(JSON.stringify(report.samples.map(x=>x.id))!==JSON.stringify(sample.map(x=>x.id)))throw new Error('样本被替换或顺序不符');
 const values=[],means=[];
 for(const row of report.samples){const source=entries.find(e=>e.id===row.id);if(row.entityHash!==hashContent(source.entity))throw new Error('条目哈希改变');
  const scores=[];for(const key of dimensions){const score=row.ratings[key];if(!score||!Number.isInteger(score.score)||score.score<1||score.score>5)throw new Error(`缺少有效评分 ${row.id}/${key}`);if(typeof score.reason!=='string'||score.reason.length<8)throw new Error('缺少评分理由');if(typeof score.quote!=='string'||score.quote.length<3||!['description','inspection','storage','process','name','use'].some(field=>source.entity[field]?.includes(score.quote)))throw new Error(`引文不在正式文本 ${row.id}/${key}`);if(basisDimensions.includes(key)){
   const root=skeletons?.get?.(row.id);if(!root)throw new Error(`缺少样本骨架，无法核对 basis ${row.id}/${key}`);
   if(!basisExists(root,score.basis))throw new Error(`缺少有效 basis（骨架或配方里不存在该字段路径）${row.id}/${key}`);
   const fab=score.fabricated??[];
   if(!Array.isArray(fab)||fab.some(x=>typeof x!=='string'||!x.trim()||!score.quote.includes(x)))throw new Error(`fabricated 须是 quote 内的原文片段数组 ${row.id}/${key}`);
   if(fab.length&&score.score>fabricatedCap)throw new Error(`原句含骨架外的具体，最高 ${fabricatedCap} 分 ${row.id}/${key}`);
  }
  values.push(score.score);scores.push(score.score);}
  means.push({id:row.id,mean:scores.reduce((a,b)=>a+b)/6});
 }
 const mean=values.reduce((a,b)=>a+b)/values.length,minimum=Math.min(...values);
 return{passed:mean>=4&&minimum>=3,mean,minimum,count:report.samples.length,scoreCount:values.length,entryMeans:means,dimensionMeans:Object.fromEntries(dimensions.map(key=>[key,report.samples.reduce((n,s)=>n+s.ratings[key].score,0)/report.samples.length]))};
}
async function main(){
 const {entries,skeletons,audit,corpusHash,explained}=await publishedW3(await loadWorld());let report;
 try{report=JSON.parse(await fs.readFile(scorePath,'utf8'));if(report.corpusHash!==corpusHash){
  if(process.argv.includes('--recompute-corpus-hash')){if(process.argv.includes('--check'))throw new Error('--recompute-corpus-hash 会写 wave-score.json，不能与 --check 同用');report=recomputeCorpusHash(report,entries,[...explained,...await overlayFieldReverts(entries)]);report.audit=audit;await fs.writeFile(scorePath,JSON.stringify(report,null,2)+'\n');}
  else if(process.argv.includes('--accept-fact-corrections')){report=acceptFactCorrections(report,entries);report.audit=audit;await fs.writeFile(scorePath,JSON.stringify(report,null,2)+'\n');}
  else throw new Error('已固定样本的正式内容改变，不自动重抽（变化全部来自已审批回执或叠加层时，可用 --recompute-corpus-hash 按回执重算）');}}
 catch(error){if(error.code!=='ENOENT')throw error;if(process.argv.includes('--check'))throw new Error(`${scorePath} 缺失：--check 只检查，不创建样本文件`);const seed=randomBytes(32).toString('hex');report={version:1,createdAt:new Date().toISOString(),seed,algorithm:'按id排序后，以SHA256(seed:counter)拒绝采样执行Fisher-Yates，取前10；创建后不重抽',corpusHash,audit,rubric:{range:'1欠缺、2明显不足、3合格但普通、4充分且有辨识、5有突出可核验细节',voiceScope:'物品配方仍评说话方式辨识度：看作者或使用者叙述视角、行业措辞、信息取舍及句式是否可辨认。没有NPC对白不免评；共同目录格式不是扣分本身，换名即可套用的通用话语不能得高分。',basisRule,threshold:'60个单项平均至少4，任何单项至少3；同时列出逐条及逐维度均分，不能用总均分掩盖不足。'},samples:fixedSample(entries,seed).map(x=>({id:x.id,name:x.entity.name,kind:x.kind,source:x.source,entityHash:hashContent(x.entity),ratings:Object.fromEntries(dimensions.map(key=>[key,basisDimensions.includes(key)?{score:null,quote:'',basis:'',fabricated:[],reason:''}:{score:null,quote:'',reason:''}]))}))};await fs.writeFile(scorePath,JSON.stringify(report,null,2)+'\n');}
 if(process.argv.includes('--check')){const result=validateScores(report,entries,skeletons);console.log(JSON.stringify({audit,result}));if(!result.passed)process.exitCode=1;}else console.log(JSON.stringify({audit,seed:report.seed,samples:report.samples.map(row=>({id:row.id,name:row.name,entity:entries.find(x=>x.id===row.id).entity}))}));
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/w3-wave-score.mjs'))await reportApprovalIncomplete(main);
