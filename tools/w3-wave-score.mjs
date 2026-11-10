import fs from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';
import {loadWorld} from './load-world.mjs';
import {economyW3} from '../world/design/economy-w3.mjs';
import {economyW3Trades} from '../world/design/economy-w3-trades.mjs';
import {economyW3Journey} from '../world/design/economy-w3-journey.mjs';
import {readApprovedContent,hashContent} from './content-pipeline.mjs';
import {w3Context,w3Revision,validateW3Draft} from './w3-content.mjs';
import {tradesRevision,validateTradesDraft} from './w3-trades.mjs';
import {journeyContext,journeyRevision} from './w3-journey.mjs';
export const scorePath='world/drafts/w3/wave-score.json';
export const dimensions=['具体性','独特性','内在一致性','与世界的连接','可玩性','说话方式辨识度'];
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
export function fixedSample(entries,seed,count=10){
 if(!/^[0-9a-f]{64}$/.test(seed))throw new Error('无效抽样种子');
 const rows=[...entries].sort((a,b)=>a.id.localeCompare(b.id));let counter=0;
 const draw=max=>{const limit=Math.floor(0x100000000/max)*max;for(;;){const n=createHash('sha256').update(`${seed}:${counter++}`).digest().readUInt32BE(0);if(n<limit)return n%max;}};
 for(let i=rows.length-1;i>0;i--){const j=draw(i+1);[rows[i],rows[j]]=[rows[j],rows[i]];}
 return rows.slice(0,count);
}
export async function publishedW3(world){
 const block=JSON.parse(await fs.readFile('world/meta/blocklist.json','utf8')),entries=[],batches=[];
 for(const [label,root,bones,revision,context,validate]of [
  ['家用首批','world/drafts/w3',economyW3(world),w3Revision,w3Context,validateW3Draft],
  ['行商工艺','world/drafts/w3/trades',economyW3Trades(world),tradesRevision,w3Context,validateTradesDraft],
  ['远行细作','world/drafts/w3/journey',economyW3Journey(world),journeyRevision,journeyContext,validateTradesDraft],
 ])for(const kind of ['items','recipes']){
  const approved=await readApprovedContent(`${root}/${kind}`,bones[kind],{contextFor:e=>context(world,bones,e),revision});
  if(approved.length!==bones[kind].length)throw new Error(`${label}/${kind}仍有待审`);
  const summary=JSON.parse(await fs.readFile(`${root}/${kind}/summary.json`,'utf8'));
  if(summary.manual||summary.pending||summary.passed!==bones[kind].length)throw new Error(`${label}/${kind}摘要仍有待审`);
  for(const b of summary.batches)batches.push({label,kind,index:b.index,count:b.count,fingerprint:b.fingerprint});
  for(const bone of bones[kind]){
   const draft=approved.find(x=>x.id===bone.id),official=world[kind].find(x=>x.id===bone.id);if(!official)throw new Error(`未发布 ${bone.id}`);
   const {processFacts,...mechanics}=bone,expected={...mechanics,...draft};
   for(const [key,value]of Object.entries(expected))if(JSON.stringify(official[key])!==JSON.stringify(value))throw new Error(`正式条目不同于已审骨架/文字 ${bone.id}/${key}`);
   const checks=validate(draft,bone,block,context(world,bones,bone));if(checks.errors.length)throw new Error(`${bone.id}: ${checks.errors.join('；')}`);
   entries.push({id:bone.id,kind,source:label,entity:official});
  }
 }
 entries.sort((a,b)=>a.id.localeCompare(b.id));if(new Set(entries.map(x=>x.id)).size!==entries.length)throw new Error('W3条目重复');
 if(world.items.length<400||world.recipes.length<200)throw new Error('正式目录未达到400/200');
 return{entries,audit:{publishedItems:world.items.length,publishedRecipes:world.recipes.length,w3Items:entries.filter(x=>x.kind==='items').length,w3Recipes:entries.filter(x=>x.kind==='recipes').length,approvedEntries:entries.length,pending:0,manual:0,batches:batches.length},corpusHash:hashContent(entries)};
}
export function validateScores(report,entries){
 if(report.corpusHash!==hashContent(entries))throw new Error('正式内容已改变，评分依据失效');
 const sample=fixedSample(entries,report.seed);if(JSON.stringify(report.samples.map(x=>x.id))!==JSON.stringify(sample.map(x=>x.id)))throw new Error('样本被替换或顺序不符');
 const values=[],means=[];
 for(const row of report.samples){const source=entries.find(e=>e.id===row.id);if(row.entityHash!==hashContent(source.entity))throw new Error('条目哈希改变');
  const scores=[];for(const key of dimensions){const score=row.ratings[key];if(!score||!Number.isInteger(score.score)||score.score<1||score.score>5)throw new Error(`缺少有效评分 ${row.id}/${key}`);if(typeof score.reason!=='string'||score.reason.length<8)throw new Error('缺少评分理由');if(typeof score.quote!=='string'||score.quote.length<3||!['description','inspection','storage','process','name','use'].some(field=>source.entity[field]?.includes(score.quote)))throw new Error(`引文不在正式文本 ${row.id}/${key}`);values.push(score.score);scores.push(score.score);}
  means.push({id:row.id,mean:scores.reduce((a,b)=>a+b)/6});
 }
 const mean=values.reduce((a,b)=>a+b)/values.length,minimum=Math.min(...values);
 return{passed:mean>=4&&minimum>=3,mean,minimum,count:report.samples.length,scoreCount:values.length,entryMeans:means,dimensionMeans:Object.fromEntries(dimensions.map(key=>[key,report.samples.reduce((n,s)=>n+s.ratings[key].score,0)/report.samples.length]))};
}
async function main(){
 const {entries,audit,corpusHash}=await publishedW3(await loadWorld());let report;
 try{report=JSON.parse(await fs.readFile(scorePath,'utf8'));if(report.corpusHash!==corpusHash){if(!process.argv.includes('--accept-fact-corrections'))throw new Error('已固定样本的正式内容改变，不自动重抽');report=acceptFactCorrections(report,entries);report.audit=audit;await fs.writeFile(scorePath,JSON.stringify(report,null,2)+'\n');}}
 catch(error){if(error.code!=='ENOENT')throw error;if(process.argv.includes('--check'))throw new Error(`${scorePath} 缺失：--check 只检查，不创建样本文件`);const seed=randomBytes(32).toString('hex');report={version:1,createdAt:new Date().toISOString(),seed,algorithm:'按id排序后，以SHA256(seed:counter)拒绝采样执行Fisher-Yates，取前10；创建后不重抽',corpusHash,audit,rubric:{range:'1欠缺、2明显不足、3合格但普通、4充分且有辨识、5有突出可核验细节',voiceScope:'物品配方仍评说话方式辨识度：看作者或使用者叙述视角、行业措辞、信息取舍及句式是否可辨认。没有NPC对白不免评；共同目录格式不是扣分本身，换名即可套用的通用话语不能得高分。',threshold:'60个单项平均至少4，任何单项至少3；同时列出逐条及逐维度均分，不能用总均分掩盖不足。'},samples:fixedSample(entries,seed).map(x=>({id:x.id,name:x.entity.name,kind:x.kind,source:x.source,entityHash:hashContent(x.entity),ratings:Object.fromEntries(dimensions.map(key=>[key,{score:null,quote:'',reason:''}]))}))};await fs.writeFile(scorePath,JSON.stringify(report,null,2)+'\n');}
 if(process.argv.includes('--check')){const result=validateScores(report,entries);console.log(JSON.stringify({audit,result}));if(!result.passed)process.exitCode=1;}else console.log(JSON.stringify({audit,seed:report.seed,samples:report.samples.map(row=>({id:row.id,name:row.name,entity:entries.find(x=>x.id===row.id).entity}))}));
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/w3-wave-score.mjs'))await main();
