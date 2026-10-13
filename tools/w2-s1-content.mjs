import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from './load-world.mjs';
import {DeepSeekClient} from './deepseek-client.mjs';
import {runContentPipeline,defaultReviewRequest,hashContent,readApprovedContent} from './content-pipeline.mjs';
import {validateDraft as validateSpellDraft} from './m4-batch2-content.mjs';
import {validateDraft as validateBookDraft} from './m4-books-content.mjs';
import {validateMagicCatalog} from '../server-plugin/magic.mjs';
import {revision,spells,books,sources,spellDraft,bookDraft,placements,channelFacts} from '../world/design/w2-s1.mjs';
export {revision};
export const entries=[...spells.map(s=>({...s,category:'spell'})),...books.map(b=>({...b,category:'book'}))];
export const draftRoot=path.resolve('world/drafts/w2-s1');
const budgetRoot=path.resolve('world/drafts/m4-object');
const world=await loadWorld();
const evidence={
 area:'server-plugin/magic-area.mjs: 已知实际位置与无遮挡视线限定中心和成员。damage对所有有效生命目标，包括本人，无敌我筛选。入场立即触发；留场按intervalMinutes脉冲。防护逐人本人同意，每人独立有限余量，同一击最强层，离开撤去，再入只取余量；不提供抗性。魔力和材料一次施法扣除，区域没有另设upkeep。',
 movement:'server-plugin/magic-movement.mjs: anchor_sense记录完整实地锚点所属/位置，不给许可。blink使用同地真实落点与视线，墙和封锁拒绝。blink若row.owner不是player且row.access不是public，须environment_use所有者有效许可并覆盖同行客人/到达时间，这是短移本身已实现的条件。teleport两端须已实地辨识并有所有者许可，许可覆盖同行和到达；距离沿实际walk路线。身体按riderWeightKg计入载荷。实际同行名单已同意且清醒、有真实近端接触位置；坐骑/宠物/役灵不支持。开始及完成复核，完成抛错会回滚整次动作。',
 message:'server-plugin/magic-message.mjs: message与mind_message主动发文字，实际距离同地靠接触、跨地沿路线。本人mental_message自愿许可覆盖到达时刻，清醒、非途中；撤回/睡眠/失距不会送达。mind_message须持有已成功刻记且文本匹配的有效单件物，失效/转手/破损拒绝。consent_link只主动四情，team_link仅五种节奏，每人独立许可覆盖其他成员，两两限距；链接人数包含本人。链接定期upkeep魔力，单条消息无维持费。主动断开或撤回，不读心、不共享视线。',
 utility:'server-plugin/magic-object.mjs: ignite只干燥未燃的真实有限火绒，不另增燃料；extinguish停止燃烧不清热；heat至多power焦耳/limitC，热容量决定温升，不作为液态水热过程；sense_heat直接接触读取整体温度。物主许可与实际射程。server-plugin/magic-water-earth.mjs: seal对实际漏桶有限压力、10分钟减漏，水保留，到期恢复；survey_water只读小段长度/水深/有效流量/流速；slow_flow限≤5米非洪峰≤20000毫升每分钟小段，以power百分比降低有效流量和速度，期限5分钟，不改水质。',
 growth:'server-plugin/magic-care.mjs: herb_sense已识活草只读known commonProperties；seedling仅现有幼苗，最多3摄氏度轻霜缓护；roots仅幼根，需一米内可达现有水源与两方许可，按每分钟生理水肥消耗，根向不加整田生长；graft要求园艺100与兼容已对齐接合接口、水肥，power/1440每分钟改善愈合/排异；preserve_food封闭完好且先剔坏的真实果批，只减少未来腐败，不恢复已坏。server-plugin/magic-growth.mjs: 已播批次、资源绑定、田主growth_magic同意；按日扣额外真实水和营养，不能追补不足，低温停止；同田不叠加，冷却10080分钟，每批最高20%额外生长，不直接产粮。',
};
const group=e=>spells.indexOf(spells.find(s=>s.id===e.id))<9?'area':spells.findIndex(s=>s.id===e.id)<13?'movement':spells.findIndex(s=>s.id===e.id)<17?'message':spells.findIndex(s=>s.id===e.id)<24?'utility':'growth';
export const reviewDraftFor=e=>e.category==='spell'?spellDraft(e):bookDraft(e);
export function contextFor(e){
 const seller=world.npcs.find(n=>n.id==='npc_hw_luqing');
 const common={seller:{id:seller.id,name:seller.name,services:seller.services,serviceCatalog:seller.serviceCatalog,schedule:seller.schedule},rules:world.rules.books,
 learning:'server-plugin/learning.mjs: 买书按正常作息和实际报价付钱，有限库存2本，不自动补货。识字至少100并持有完好书；每次读一种法术，book.grade满足spell.stage；一阶须法师认证。智力检定，不是施法技能attribute。成功只登记法术和0熟练技能，不附魔力材料或精神许可。失败花完整阅读时间，保留书和购书成本，不另扣learnFee教学费。'};
 if(e.category==='book')return {...common,spells:spells.filter(s=>e.book.teaches.includes(s.id)),stock:sources.books.find(b=>b.item.id===e.id).stock};
 const b=books.find(b=>b.book.teaches.includes(e.id));
 return {...common,book:b,implementation:evidence[group(e)],materials:e.materials.map(m=>({...m,name:world.items.find(i=>i.id===m.item)?.name})),
  shared:'开始前资格、材料、对象、权限不足则拒绝且不花费。开始后检定失败消耗mp、materials和minutes，无新效果。熟练只影响成功把握，不改变距离、固定时限或材料。成功后已存在的持续效果按自己的边界处理；材料施法每次一份木炭，不算目标已有燃料。',
  targetSources:{placements,channelFacts},growthRules:e.effectSpec.kind==='growth'?world.rules.magicGrowth:undefined};
}
export function validateDraft(d,e){
 if(e.category==='spell'){
  const v=validateSpellDraft({id:d?.id,prose:d?.prose},e);
  v.errors.push(...validateMagicCatalog(e,{requireHandler:true}));
  if(Object.keys(d??{}).some(k=>!['id','prose','source'].includes(k))||hashContent(d?.source)!==hashContent(sources.mappings.find(m=>m.spell===e.id)))v.errors.push('学习映射与冻结来源不符');
  return v;
 }
 const {errors,warnings}=validateBookDraft(d,e);
 if(e.book.teaches.some(id=>!spells.some(s=>s.id===id&&s.stage<=world.rules.books.grades.indexOf(e.book.grade))))errors.push('书籍学习阶段不闭合');
 return {errors,warnings};
}
export async function reviewS1({retryManual=false}={}){
 if(!process.env.DEEPSEEK_API_KEY)throw Error('DEEPSEEK_API_KEY 环境变量未配置');
 return runContentPipeline({entries,root:draftRoot,budgetRoot,revision,contextFor,validateDraft,reviewDraftFor,reuseFrozenDrafts:true,retryManual,
  cardId:'T69',allocation:{cardId:'T69',incrementLimitYuan:12,waveLimitYuan:25},concurrency:1,batchSize:36,
  client:new DeepSeekClient({budgetYuan:25,logFile:path.join(draftRoot,'usage.jsonl')}),
  buildDraftRequest:()=>{throw Error('T69正文由Sol起草，禁止模型起草');},
  requestTransform:async({body})=>{const ledger=JSON.parse(await fs.readFile(path.join(budgetRoot,'budget.json'),'utf8'));const issued=Object.values(ledger.requests??{}).filter(r=>r.card==='T69'&&['sent','settled','unknown'].includes(r.status)).length;if(issued>=216)throw Object.assign(Error('T69已达216次调用上限'),{code:'CONTENT_BUDGET_STOP'});return {body};},
  buildReviewRequest:(e,d,c)=>{const r=defaultReviewRequest(e,d,c);r.messages[0].content+='本次包括法术正文及draft.source学习来源，或书籍正文。以implementation实际消费者和book/spell/learning外部证据为准逐字段审，不将draft.source本身当作权威。文字动作允许，无新增效果的相容表达允许。数字等值转换允许，duration=0为即时操作，不否认现有热量或位移结果留存。只把实际矛盾列入contradictions；一致、相容或无矛盾的核对结果不要列入数组。';return r;}});
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
 if(process.argv.includes('--l1')){for(const e of entries){const v=validateDraft(reviewDraftFor(e),e);if(v.errors.length)throw Error(`${e.id}: ${v.errors.join(';')}`);}console.log(JSON.stringify({L1:'passed',spells:30,books:6}));}
 if(process.argv.includes('--review')){const {summary:s}=await reviewS1({retryManual:process.argv.includes('--retry-manual')});console.log(JSON.stringify({total:s.total,passed:s.passed,manual:s.manual,pending:s.pending,card:s.budget.cards.T69}));}
 if(process.argv.includes('--candidate')){
  const rows=await readApprovedContent(draftRoot,entries,{contextFor,revision});if(rows.length!==36)throw Error('30法术与6本书未全部通过');
  const candidate={spells:spells.map(s=>({...s,...rows.find(d=>d.id===s.id).prose})),items:books.map(b=>({...b,...rows.find(d=>d.id===b.id).prose})),sources};
  await fs.writeFile(path.join(draftRoot,'candidate.json'),JSON.stringify(candidate,null,2)+'\n');console.log(JSON.stringify({spells:30,books:6}));
 }
}
