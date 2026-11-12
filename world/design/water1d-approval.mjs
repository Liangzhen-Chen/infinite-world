// WATER-1D 修订批，NOT loaded by the game。
// 牛乳（item_milk）手写 nutrition.hydration=25 没有出处；水分由规则派生：重量 × 含水率 × 参照水系数（item-class.mjs deriveItemAttributes）。
// 本批只改这一个已审字段：删除 item_milk.nutrition（该行 nutrition 只有 hydration 一项），让规则接管。
// 流程与 P1 相同（冻结候选 -> L1 -> L2 -> L4 -> 发布 -> 回执 supersedes），共用 p1-revision-approval.mjs 的 runRevision；
// 删除用通用的 REMOVE 标记（after），不是 {} 之类的凑数。
// 它取代 a3-world-approval 对 nutrition_item_milk 的已审回执；a3w-props 对 item_milk 的整行指纹经 revertedRows 回退到删除前的行，不需要整批重审。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {REMOVE,rowOf,runRevision,draftFor,contextFor,validateDraft,applyCandidate,isPublished} from './p1-revision-approval.mjs';

export const revision='water1d-1',root='world/drafts/water1d',CARD='WATER1D';
// 本批的预算与次数上限（硬上限，到上限流水线自动停）；各批自定，runRevision 不再写死。
export const LIMIT_YUAN=0.5,MAX_REQUESTS=60;
export {draftFor,contextFor,validateDraft,applyCandidate,isPublished};

export async function buildEntries(world){
 const {loadRuntimeWorld}=await import('../../tools/load-world.mjs');
 const rw=await loadRuntimeWorld();
 const milk=rw.items.find(i=>i.id==='item_milk'),ref=rw.items.find(i=>(i.tags??[]).includes('water')&&i.nutrition?.hydration>0&&i.weight>0);
 assert.ok(milk&&ref,'缺少牛乳或参照水');
 const row=rowOf(world,'world/meta/items.json','item_milk');
 assert.deepEqual(Object.keys(row.nutrition??{}),['hydration'],'牛乳 nutrition 应只有手写 hydration');
 // 系数不另编：参照水的水分 ÷ 参照水含水量（kg）；牛乳水分 = 牛乳含水量（kg）× 系数，取整。
 const k=ref.nutrition.hydration/ref.nutrientBase.water,derived=Math.floor(milk.nutrientBase.water*k);
 return [{id:'item_milk-nutrition',target:'item_milk',file:'world/meta/items.json',path:['nutrition'],field:'nutrition',before:row.nutrition,after:REMOVE,
  basis:[
   `WATER-1D：item_milk.nutrition.hydration 手写 ${row.nutrition.hydration}，没有出处；食物水分统一按规则派生：水分 = 重量(kg) × 含水率 × 参照水系数（item-class.mjs）。`,
   `牛乳重量 ${milk.weight} kg，含水率出处 FDC 171265：含水 0.881（world/meta/mechanics/verified-sources.json），含水量 ${milk.nutrientBase.water} kg；参照水 ${ref.id} 重 ${ref.weight} kg、手写水分 ${ref.nutrition.hydration}，系数 ${k}/kg。`,
   `规则推出牛乳一份水分 ${derived}（取整），达到解渴门槛，drinkable 标签保留。手写 ${row.nutrition.hydration} 与物性不一致，故删除手写值，由规则接管。`],
  facts:{item:{id:milk.id,name:milk.name,weight:milk.weight,tags:milk.tags},referenceWater:{id:ref.id,weight:ref.weight,hydration:ref.nutrition.hydration,waterKg:ref.nutrientBase.water},coefficientPerKg:k,derivedHydration:derived,handwritten:row.nutrition},
  supersedes:[{receipt:'world/drafts/a3-world-approval/nutrition_item_milk.json#item_milk',field:'nutrition'}],
  boundary:'只删这一个字段（item_milk.nutrition）；同一行的其余字段、说明文字与其它物品一律不动。不新增常数：系数由参照水推出，含水率来自已核对的出处。'}];
}

let frozen;
try{frozen=JSON.parse(await fs.readFile(`${root}/candidate.json`,'utf8'));assert.equal(frozen.revision,revision);}catch(error){if(error.code!=='ENOENT')throw error;}
export const frozenEntries=()=>frozen?.entries;
export const run=(args=process.argv.slice(2))=>runRevision({revision,root,CARD,limitYuan:LIMIT_YUAN,maxRequests:MAX_REQUESTS,frozen,buildEntries,draftFor,contextFor,validateDraft,applyCandidate,isPublished,
 note:'WATER-1D：删除牛乳手写水分，单卡上限 0.5 元、60 次（李白批准；--review 须两轮审查后由主会话决定何时跑）。'},args);
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await run();
