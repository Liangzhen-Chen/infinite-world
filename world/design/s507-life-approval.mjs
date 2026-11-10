// S5-07 numeric proposals. Nothing here is installed before the existing
// content pipeline's independent review and manual approval have passed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {DeepSeekClient} from '../../tools/deepseek-client.mjs';
import {runContentPipeline,defaultReviewRequest,readApprovedContent} from '../../tools/content-pipeline.mjs';

const root='world/drafts/s507-life',revision='s507-life-1';
export {revision};
const files={rules:'world/meta/rules.json',items:'world/meta/items.json',locations:'world/geo/locations.json'};
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const current=Object.fromEntries(await Promise.all(Object.entries(files).map(async([id,file])=>[id,await read(file)])));
const species=(await read('world/meta/monsters.json')).find(r=>r.id==='monster_tile_lamp_wraith');
let foundation;
try{foundation=await read(`${root}/foundation.json`);}catch(error){if(error.code!=='ENOENT')throw error;}
const before=foundation??{
 human:current.rules.npcLife.lifecycle??null,
 lamp:current.items.find(r=>r.id==='item_clay_oil_lamp').lifecycle??null,
 building:current.locations.find(r=>r.id==='bld_bs_temple').lifecycle??null,
};
const awaken={minimumYears:100,annualRisk:0.01,species:'monster_tile_lamp_wraith'};
export const entries=[
 {id:'s507_human_lifecycle',target:'human',row:{...(before.human??{}),agingCatchUp:1},basis:{
  source:'默认寿命继续读取population.json lifespan.human（当前62），不再抄一份；统一模型§5.5',
  calibration:'agingCatchUp=1年是待审定占位；设计只规定逐步补老，未给年数。审批前不启用。',
  boundary:'寿命走max槽，不叠加延寿；死亡仍逐日按风险掷骰，未改夭折或疾病数据。'}},
 {id:'s507_lamp_lifecycle',target:'lamp',row:{...(before.lamp??{}),awaken},basis:{
  source:'超自然与文化§13.3 年久成精；既有浅腹陶油灯与瓦灯魅模板',
  calibration:'100年起算、基准年风险.01均为待审定占位，不是已有设定或标定结果。',
  boundary:'只读真实制作事件的minute/madeAt；旧物年岁未知不补时间，不减原物或复制钱物。'}},
 {id:'s507_building_lifecycle',target:'building',row:{...(before.building??{}),awaken},basis:{
  source:'超自然与文化§13.3 器物建筑年岁与anchor；既有东街灯祠与瓦灯魅模板',
  calibration:'同器物的待审定占位；建筑没有builtAt/madeAt/foundedYear时不凭空追认年代。',
  boundary:'不补写灯祠成立年、不新设宗教权限；生灵有spirit:object来源、anchor与causes。'}},
];
const draftFor=e=>({id:e.id,row:e.row});
const population=await read('world/rules/tables/balance/population.json');
const anchorBefore=target=>{
 const row=structuredClone(target==='lamp'?current.items.find(r=>r.id==='item_clay_oil_lamp'):current.locations.find(r=>r.id==='bld_bs_temple'));
 if(before[target]===null)delete row.lifecycle;else row.lifecycle=structuredClone(before[target]);
 return row;
};
const contextFor=e=>({before:before[e.target],basis:e.basis,sourceFacts:e.target==='human'
 ?{population,health:current.rules.npcLife.health}
 :{anchor:anchorBefore(e.target),species}});
const validateDraft=(d,e)=>{try{assert.deepEqual(d,draftFor(e));return [];}catch(error){return [error.message];}};
async function approved(){
 const rows=await readApprovedContent(`${root}/review`,entries,{revision,contextFor});
 assert.equal(rows.length,entries.length,'S507 生命周期规则尚未完成独立审核和人工批准');return rows;
}
// 叠加层接口（tools/approved-revisions.mjs 的 APPROVED_OVERLAYS 经此读取）：只含物品表里的 lifecycle，即 item_clay_oil_lamp 的已批值。
// human（rules.json npcLife.lifecycle）与 building（locations.json bld_bs_temple.lifecycle）不在物品表，不属于这个物品字段叠加层。
export async function itemLifecycles(){
 const row=(await approved()).find(d=>d.id==='s507_lamp_lifecycle').row;
 return {item_clay_oil_lamp:row};
}
export async function verifyPublished(items=undefined){
 items??=await read(files.items);
 const values=await itemLifecycles();
 for(const [id,value] of Object.entries(values))assert.deepEqual(items.find(r=>r.id===id)?.lifecycle,value,`${id} 正式目录的 lifecycle 与 S507 已批值不符`);
 return {published:Object.keys(values).length};
}
// Explicit --review uses only the S507C user authorization (0.30 yuan).
export async function review({client,allocation}){
 assert.ok(client&&allocation,'须由主会话提供已授权的审核器与预算');
 return runContentPipeline({entries,root:`${root}/review`,budgetRoot:root,revision,contextFor,validateDraft,
  reviewDraftFor:async e=>draftFor(e),reuseFrozenDrafts:true,buildDraftRequest:()=>{throw Error('固定数值候选不调用模型起草');},
  buildReviewRequest:defaultReviewRequest,client,cardId:'S507',allocation,concurrency:1,batchSize:3});
}
export async function publish(){
 const drafts=await approved();
 const next=Object.fromEntries(await Promise.all(Object.entries(files).map(async([id,file])=>[id,await read(file)])));
 const targets={human:next.rules.npcLife,lamp:next.items.find(r=>r.id==='item_clay_oil_lamp'),building:next.locations.find(r=>r.id==='bld_bs_temple')};
 for(const entry of entries){
  const value=drafts.find(d=>d.id===entry.id).row,target=targets[entry.target];
  assert.ok(JSON.stringify(target.lifecycle??null)===JSON.stringify(before[entry.target])||JSON.stringify(target.lifecycle)===JSON.stringify(value),'目标已有其它会话改动，须重新审核');
  target.lifecycle=value;
 }
 // Only approved rows change; retain each file's established JSON layout.
 for(const [key,file] of Object.entries(files)){
  const text=await fs.readFile(file,'utf8');
  if(key==='items'){
   // items.json mixes compact catalog rows with later indented additions.
   // Replace this exact row, rather than reformatting the whole catalog.
   const old=(await read(file)).find(r=>r.id==='item_clay_oil_lamp'),encoded=JSON.stringify(old);
   assert.ok(text.includes(encoded),'物品行不是预期紧凑格式，拒绝整库重排');
   await fs.writeFile(file,text.replace(encoded,JSON.stringify(targets.lamp)));continue;
  }
  const indent=/\n +\S/.test(text)?2:0,newline=text.includes('\r\n')?'\r\n':'\n';
  await fs.writeFile(file,(JSON.stringify(next[key],null,indent)+'\n').replace(/\n/g,newline));
 }
 return {published:drafts.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 if(process.argv.includes('--review')){
  const allocation={cardId:'S507',incrementLimitYuan:0.3,maxRequests:3,waveLimitYuan:20,startingSpentYuan:0,startingReservedYuan:0};
  await fs.mkdir(root,{recursive:true});
  try{await fs.access(`${root}/budget.json`);}catch(error){if(error.code!=='ENOENT')throw error;
   await fs.writeFile(`${root}/budget.json`,JSON.stringify({spentYuan:0,reservedYuan:0,waveLimitYuan:0.3,cards:{S507:{limitYuan:0.3,spentYuan:0,reservedYuan:0,maxRequests:3}},requests:{}},null,2)+'\n');}
  const {summary}=await review({client:new DeepSeekClient({budgetYuan:0.3,logFile:`${root}/usage.jsonl`}),allocation});
  console.log(JSON.stringify({passed:summary.passed,manual:summary.manual,pending:summary.pending,budget:summary.budget.cards.S507}));
 }
 if(process.argv.includes('--prepare')){
  await fs.mkdir(root,{recursive:true});
  if(!foundation)await fs.writeFile(`${root}/foundation.json`,JSON.stringify(before,null,2)+'\n');
  for(const entry of entries)await fs.writeFile(`${root}/${entry.id}.json`,JSON.stringify({...draftFor(entry),basis:entry.basis},null,2)+'\n');
  console.log(JSON.stringify({drafts:entries.length,published:0,review:'pending'}));
 }
 if(process.argv.includes('--publish'))console.log(JSON.stringify(await publish()));
}
