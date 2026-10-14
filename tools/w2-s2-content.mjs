import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from './load-world.mjs';
import {DeepSeekClient} from './deepseek-client.mjs';
import {runContentPipeline,defaultReviewRequest,hashContent,readApprovedContent} from './content-pipeline.mjs';
import {validateDraft as validateSpellDraft} from './m4-batch2-content.mjs';
import {validateDraft as validateBookDraft} from './m4-books-content.mjs';
import {validateMagicCatalog} from '../server-plugin/magic.mjs';
import {revision,spells,books,items,recipes,sources,placements,stations,mentors,routes,routeOf,spellDraft,bookDraft,itemDraft,recipeDraft,itemProse,recipeProse} from '../world/design/w2-s2.mjs';
export {revision};
const CARD='T102',MAX_REQUESTS=80,LIMIT_YUAN=1;
const draftOf=e=>e.category==='spell'?spellDraft(e):e.category==='book'?bookDraft(e):e.category==='item'?itemDraft(e):recipeDraft(e);
// The draft hash is part of each entry so that a corrected draft is a new review.
const tag=(row,category)=>({...row,category});
const base=[...spells.map(s=>tag(s,'spell')),...books.map(b=>tag(b,'book')),...items.map(i=>tag(i,'item')),...recipes.map(r=>tag(r,'recipe'))];
export const entries=base.map(e=>({...e,draftVersion:hashContent(draftOf(e)).slice(0,16)}));
export const draftRoot=path.resolve('world/drafts/w2-s2');
const budgetRoot=path.resolve('world/drafts/m4-object');
const world=await loadWorld();
const block=JSON.parse(await fs.readFile(path.resolve('world/meta/blocklist.json'),'utf8'));
const allItems=new Map([...world.items,...items,...books].map(i=>[i.id,i]));
const person=id=>{const p=world.npcs.find(n=>n.id===id);return p?{id,name:p.name,occupation:p.occupation,workplace:world.locations.find(l=>l.id===p.workplace?.location)?.name??null}:null;};
const featureRows=Object.entries(placements).flatMap(([location,rows])=>rows.map(r=>({...r,location})));
const placeName=id=>world.locations.find(l=>l.id===id)?.name??id;
const shared='开始前资格、材料、对象、权限、距离或视线不足则拒绝且不花费。开始后检定失败消耗本次mp、materials和minutes，无新效果。熟练只影响成功把握，不改变距离、固定时限、强度或材料。所有温度单位为摄氏度，热量单位为焦耳，duration/minutes单位为分钟。登记对象若属他人（owner为人物且access为consent），须有所有者签发的有效environment_use许可；public对象无需许可。只读操作不需许可。';
const evidence={
 craft_heat:'server-plugin/magic-object.mjs craft_heat：目标须是已登记kiln温区与裂损规则的炉子，正在燃烧且有燃料，须无遮挡视线与所有者许可。效果最多duration分钟；炉中每分钟实际燃烧时，附加min(power, limitC×热容-当前热量)焦耳；同时把最高温区与最低温区各移动至少1摄氏度（max(1,floor(power/热容))），直到温区相等。不添燃料；燃尽或熄火后不再作用。炉温区差会在烘制时累计裂损，裂损导致部分成品焦裂。',
 forge_heat:'server-plugin/magic-object.mjs forge_heat：目标须正在燃烧且有燃料，须视线与许可。最多duration分钟，每分钟实际燃烧时附加至多power焦耳，热量不使炉温超过limitC摄氏度；燃料燃尽、浇灭或期满即停。不改变温区差，不添燃料。',
 fuel:'server-plugin/magic-object.mjs fuel：目标须已在燃烧。最多duration分钟，燃料燃烧量减少power‰（100即一成），热效率按比例提高，故每分钟有效热量不变。不点火、不补燃料；熄火则无作用。',
 sense_heat:'server-plugin/magic-object.mjs sense_heat surface：rangeMeters=0须直接接触，目标须登记温区；返回整体温度、各温区温度和温差，并写入可用inspect_heat复查的charcoalTrace炭线记录。须一份真实木炭；不改变温度。',
 smoke:'server-plugin/magic-air.mjs smoke：目标房间为起点，沿links.exits连通到另一房间的路径（各房间都须在射程内并取得非公共房间的许可），关闭出口或石墙阻断则拒绝；起点为封闭空间（无出口）时拒绝。duration分钟内每分钟沿路径每段转移min(power,现有烟)毫克烟，并让外侧现有氧气回流min(power,外侧现有,本侧剩余容量)；镇火符封住的房间段不流动。烟源（燃烧）照常生烟。',
 contain_fire:'server-plugin/magic-object.mjs contain_fire：目标须是登记airModel的房间，须视线与许可，施法时魔力须≥upkeepMp。最多duration分钟每分钟扣upkeepMp魔力；施术者不在该地、状态不为正常或魔力不足时效果当分钟结束。封住期间：房间不通风（不补氧气、不排烟），fireLinks相连燃物之间不蔓延，燃烧受室内氧气限制，氧气为零时火熄。',
 barrier:'server-plugin/magic-object.mjs barrier：目标须是登记fireLine两米地面路径的物件，燃料干燥、未燃且不超过min(power,点燃上限5000毫克)，须视线与许可。点燃后燃烧中的火线阻挡同地横穿该线段的移动以及exitTo所列出口；期满时熄止，燃料烧尽也熄灭；douse_fire可用真实水浇灭。',
 quiet:'server-plugin/magic-air.mjs quiet：目标房间，须许可。duration分钟内，任何经过该房间的声音（传声、sound动作、警号）声量减去power。',
 area_wind:'server-plugin/magic-air.mjs area_wind：目标为登记road且连接真实路线。duration分钟内沿该路线段的行程增加min(power,道路resistanceMinutes,剩余期限)分钟，对施术者及同行同样生效。',
 veil_water:'server-plugin/magic-water-earth.mjs veil_water：目标须是宽度0.1至2米的登记passage；source为距目标3米内的容器或水体，现有水≥power毫升，均须许可。施法从source预留power毫升（仍占原容器容量），duration分钟内阻断穿过通道点0.5米内的视线、声音减60声量，并给5米内的人留下“通道的水帘声”听闻记录。期满或被风刃切断后预留的水返回原容器。',
 levee:'server-plugin/magic-water-earth.mjs levee：目标须是有实际冲刷过程的登记levee，冲刷土量进入links.silt的淤泥处，须许可。duration分钟内每分钟冲刷量乘以(1-power/100)，power=50即减半。期满恢复，已冲走的土不返回。',
 level_ground:'server-plugin/magic-water-earth.mjs level_ground：目标为面积≤power平方米、未冻结、非基岩的登记soil，现有高差reliefCm在1至10厘米之间，有实际表土体积，须许可。立即使reliefCm=0并记录已整平面积；不增减土量，roots与pipes等地下物不变；高差为0后无从再整。',
 mud_seal:'server-plugin/magic-water-earth.mjs mud_seal：目标为有实际漏水过程、压力不高于power千帕的登记seam裂缝，links.drain为承水容器；args.source为3米内texture=clay且clayGrams≥200的土，均须许可。施法扣200克黏土封缝，duration分钟内不漏水；若距上次察看（inspect）满3分钟则提前失效。已漏到承水容器的水不回流。',
 deflect:'server-plugin/magic-air.mjs deflect：目标为本人或在场活体，他人须有本人support_magic同意且在视线和射程内。duration分钟内，射向该目标的投射物命中修正为-min(0.6,power/100)×min(1,50000/投射物毫克质量)，越重影响越小；对近战无效果。',
 slow_fall:'server-plugin/magic-air.mjs slow_fall：目标为本人或经同意的活体，携带物超过20千克拒绝。duration分钟内经fall动作从实际高差跳下时，伤害=高度×5×(100-power)%，power=80即只剩两成；携带超过20千克时不减。',
 air_bubble:'server-plugin/magic-air.mjs air_bubble：目标为本人或经同意的活体；args.source为射程内、须许可的登记房间，无烟无尘、可呼吸且氧气≥power毫克。施法从房间扣power毫克氧气形成气囊，duration分钟内供呼吸，每分钟消耗600毫克（用力时1200），用尽即失效；不新增氧气。',
 sense_air:'server-plugin/magic-air.mjs sense_air：只读，无需许可。读出目标房间airModel.windVector，并沿links.exits路径读出路径终点房间的echoDelayMs；关闭出口或石墙阻断路径。',
 warm:'server-plugin/magic-object.mjs warm：rangeMeters=0，目标为本人或直接接触的他人（须本人support_magic同意）。duration分钟内手掌热量每分钟增加至多power焦耳，掌温上限38摄氏度；warm_touch可把热传给较凉、未燃烧的登记器物；不会点燃物件。期满后掌温每分钟向32度回落。',
 fracture:'server-plugin/magic-water-earth.mjs fracture：目标须是已有裂隙0.1至100毫米、完整度≥1的登记rock，须许可。立即使crackMm+power、integrity-power；links.structures所列3米内结构各受power点完整度损伤与震损。',
 bind_water:'server-plugin/magic-water-earth.mjs bind_water：目标为视线内活体一肢（肢体质量≤power克）或未固定、质量≤power克的登记物件；args.source为目标3米内的水源，现有水≥power毫升，均须许可。施法预留power毫升水，duration分钟内目标不能移动；风刃切断水体媒介或期满后水返回原容器。',
 mud_trap:'server-plugin/magic-water-earth.mjs mud_trap：目标须是湿度≥60、未铺板、面积≤power平方米、范围半径≤2米的登记soil，须许可。duration分钟内：站在范围内的人交手时受2点泥地不利；横穿范围的移动多花min(2,剩余期限)分钟；对施术者同样生效；铺板或离开范围即免。',
 lift:'server-plugin/magic-air.mjs lift：目标为射程内未固定、质量≤power×1000毫克（2千克）的登记轻物，同一物件不能叠加风柱，须许可。施法时物件高度+1米，duration分钟后落回原高度；目标两米内其他未固定、loose且不超过同一质量的物件各被卷开1米。',
 clean_air:'server-plugin/magic-air.mjs clean_air：目标须有looseDustMg>0的松散尘土并以links.air连接登记房间，须许可。立即移走min(power,松散尘土)毫克，进入该房间空气的尘量；stainMg等牢固污渍不变，物件不受损。',
 carry_voice:'server-plugin/magic-air.mjs carry_voice：只读路径，无需许可。args.text不超过power字；沿目标房间links.exits路径传声，路径上每处hearingRadiusMeters范围内的任何人物都会听见并留下听闻记录；水帘减60、静声减其power。',
 survey_earth:'server-plugin/magic-water-earth.mjs survey_earth：只读，无需许可。目标须是有岩层回声样本的登记rock；返回depthMeters≤power的各层depth/material/gap，并给出该岩体的echoErrorMeters误差。',
 ore:'server-plugin/magic-water-earth.mjs ore：只读，无需许可。目标为登记rock；返回depthMeters≤power的矿物条带，extracted=0，不取出任何矿。',
 dry_grain:'server-plugin/magic-air.mjs dry_grain：目标须是已用turn_grain翻动摊开、未封起、moistureMg>0的登记谷堆，links.air连到有出口的房间且空气水汽未饱和，须许可。duration分钟内每分钟从谷堆移走min(power,剩余水分,空气剩余水汽容量)毫克水分进入该房间空气；出口全部关闭、谷堆封起或空气饱和时不再排湿。',
 sense_soil:'server-plugin/magic-water-earth.mjs sense_soil：只读，无需许可。目标为texture为clay/sand/loam的登记soil；返回texture、moisturePercent、compactionPercent，不提供地契归属。',
 till:'server-plugin/magic-water-earth.mjs till：目标为面积≤power平方米、未冻结、非基岩的登记soil，须许可。立即使compactionPercent减40（不低于0），worked=true；不改变石块、不播种。',
 structural_sense:'server-plugin/magic-water-earth.mjs structural_sense：只读，无需许可。目标为登记structure；返回loadKg、capacityKg、超载量、integrity，repaired=0。',
};
const learning=s=>{
 const m=sources.mappings.find(m=>m.spell===s.id),r=routes[routeOf[s.id]];
 return {route:routeOf[s.id],teacher:m.teacher?person(m.teacher):null,book:m.book?{id:m.book,name:books.find(b=>b.id===m.book).name,seller:person(m.sourceOwner),readingMinutes:m.readingMinutes,minimumLiteracy:100}:null,
  professionRequired:m.requiresCertification?world.professions.find(p=>p.id===m.requiresCertification).name:null,skillProfession:r.profession?world.professions.find(p=>p.id===r.profession).name:'无职业限制',
  rules:'server-plugin/learning.mjs：导师须在场、正处授课时段，付learnFee铜、花learnMinutes分钟后作智力检定；读书须持有完好书、识字≥100，花阅读时间检定，不另付学费。一阶（stage=1）法术须持有对应职业认证。失败仍花时间和学费，不退款。'};
};
const targetFacts=s=>{
 const op=s.effectSpec.operation;
 const matches=featureRows.filter(r=>({craft_heat:['pill_furnace'],forge_heat:['pill_furnace'],fuel:['pill_furnace'],sense_heat:['pill_furnace'],smoke:['pill_room','school_hall','school_yard'],contain_fire:['talisman_room','incense_burner','paper_rack'],barrier:['fire_strip'],quiet:['talisman_room'],area_wind:['gate_road'],veil_water:['side_passage','water_jar'],levee:['ditch_bank','bank_silt'],level_ground:['altar_ground'],mud_seal:['cracked_vat','vat_basin','clay_heap'],air_bubble:['practice_corridor'],sense_air:['practice_corridor','outer_court'],warm:[],fracture:['trial_stone'],bind_water:['rope_post','wash_trough'],mud_trap:['mud_pit'],lift:['herb_tray','loose_tags'],clean_air:['dusty_curtain','school_hall'],carry_voice:['pill_room','school_hall','school_yard'],survey_earth:['rock_ledge'],ore:['rock_ledge'],dry_grain:['grain_sieve','school_hall'],sense_soil:['trial_plot'],till:['trial_plot'],structural_sense:['school_beam'],deflect:[],slow_fall:['jump_platform']}[op]??[]).includes(r.id.slice('feature_s2_'.length)));
 return matches.map(r=>({id:r.id,name:r.name,kind:r.kind,place:placeName(r.location),owner:person(r.owner)?.name??placeName(r.owner),access:r.access,state:r.state,model:r.thermalModel??r.airModel??null,links:r.links??null,fireLine:r.fireLine??null}));
};
export const reviewDraftFor=draftOf;
export function contextFor(e){
 if(e.category==='spell')return {implementation:evidence[e.effectSpec.operation],shared,learning:learning(e),
  materials:e.materials.map(m=>({...m,name:allItems.get(m.item)?.name})),exampleTargets:targetFacts(e),
  station:e.effectSpec.operation==='craft_heat'||e.effectSpec.operation==='forge_heat'?{...stations.bld_bs_school[0],recipe:recipes.find(r=>r.id==='recipe_s2_pill').name}:undefined,
  facts:['正文中的“炉主”“房主”“主人”指登记对象的owner；舒澄、裴澄、曲澄分别是学馆炼丹课、芦衡观、量廊武馆的导师。','示例对象和地点名可以出现在正文的用途与社会后果中。','法术law字段是合法性：public公开可用，consent须当事人同意，permit城中须许可。']};
 if(e.category==='book')return {seller:person('npc_hw_luqing'),stock:sources.books.find(b=>b.item.id===e.id).stock,spells:spells.filter(s=>e.book.teaches.includes(s.id)).map(s=>({id:s.id,name:s.name,stage:s.stage,profession:routes[routeOf[s.id]].profession})),rules:world.rules.books,
  learning:'识字至少100并持有完好书；每次读一种，用readingMinutes分钟；一阶法术须法师认证，零阶不限职业。失败花完整阅读时间，保留书和购书成本。陆青库存2本，售完不自动补货。'};
 if(e.category==='item'){const used=[...spells.filter(s=>s.materials.some(m=>m.item===e.id)).map(s=>s.name),...recipes.filter(r=>r.materials.some(m=>m.item===e.id)).map(r=>`配方${r.name}`)];
  const made=recipes.find(r=>r.output.item===e.id),seller=e.acquisition?.seller?person(e.acquisition.seller):null;
  return {seller,usedBy:used,recipe:made?{name:made.name,materials:made.materials.map(m=>({name:allItems.get(m.item)?.name,amount:m.amount})),output:made.output,minutes:made.minutes,station:made.workstation?stations.bld_bs_school[0]:null,process:recipeProse[made.id]}:null,
   facts:['朱砂是含汞的硫化汞矿物，有毒，不可入口；黄精、茯苓、甘草是常见中药材，蜂蜜用来调丸；艾绒是常用引火料。','物品没有直接的治疗或战斗数值，用途以use字段为准。','炉温区不匀时烘制会按裂损规则让部分成品焦裂。']};}
 const r=e;return {materials:r.materials.map(m=>({...m,name:allItems.get(m.item)?.name})),tools:r.tools.map(id=>allItems.get(id)?.name),output:{...r.output,name:allItems.get(r.output.item)?.name},teacher:person(r.teachers[0]),place:placeName(r.location),skill:world.skills.find(s=>s.id===r.skill)?.name,
  station:r.workstation?stations.bld_bs_school[0]:null,rules:'server-plugin/manufacturing.mjs：开始前检查已学配方、技能、地点、工作台和工具；工作台有thermalRequirement时，整个工序每分钟炉温须在min/max之间且燃烧，否则拒绝不收费。检定失败按failure.recoverFraction回收材料（此处为0）。炉子登记kiln时，成功后按工序中累计的裂损逐件判定焦裂，全部焦裂算失败。'};
}
const leak=/候选|引擎|主持人|玩家|骨架|schema|JSON|effectSpec|原语|尚未接入|不宣称|此处不称/;
export function validateDraft(d,e){
 if(e.category==='spell'){
  const v=validateSpellDraft({id:d?.id,prose:d?.prose},e);
  v.errors.push(...validateMagicCatalog(e,{requireHandler:true}));
  if(Object.keys(d??{}).some(k=>!['id','prose','source'].includes(k))||hashContent(d?.source)!==hashContent(sources.mappings.find(m=>m.spell===e.id)))v.errors.push('学习映射与冻结来源不符');
  return v;
 }
 if(e.category==='book'){
  const {errors,warnings}=validateBookDraft(d,e);
  if(e.book.teaches.some(id=>!spells.some(s=>s.id===id&&s.stage<=world.rules.books.grades.indexOf(e.book.grade))))errors.push('书籍学习阶段不闭合');
  return {errors,warnings};
 }
 const errors=[],warnings=[],fields=e.category==='item'?['use','description','inspection','storage']:['process'];
 if(d?.id!==e.id||!d.prose||Object.keys(d).some(k=>!['id','prose'].includes(k))||Object.keys(d.prose).some(k=>!fields.includes(k)))errors.push('编号或正文结构错误');
 for(const k of fields)if(typeof d?.prose?.[k]!=='string'||!d.prose[k].trim())errors.push(`缺少${k}`);
 const text=JSON.stringify(d?.prose??{});if(leak.test(text))errors.push('场外信息泄漏');
 for(const word of[...block.names,...block.realPeople])if(text.includes(word))errors.push('原创屏蔽');
 if(e.category==='item'&&e.shelfLifeDays&&/(\d+)天/.test(d?.prose?.storage??'')&&!d.prose.storage.includes(`${e.shelfLifeDays}天`))errors.push('保存天数与目录不符');
 return {errors,warnings};
}
export function buildReviewRequest(e,d,c){
 const r=defaultReviewRequest(e,d,c);r.max_tokens=1800;
 r.messages[0].content+='这是原创仙武世界里可学的法术、配套读本、材料和配方条目。skeleton是机制与数值，publishedFacts.implementation/rules是实际执行规则，以它们为准逐句核对draft；draft.source是学习来源映射。'+
  '文字动作、手势、外观、用途建议和劝诫属于叙述，只要不新增材料、数值、能力或取得途径就允许。中文数字与阿拉伯数字、千克与公斤、千帕与kPa的等值转换不算矛盾；duration=0表示即时完成；“最多N分钟”与duration一致即可。'+
  '只把与skeleton或publishedFacts实际相反、或新增没有依据的功能/数值/取得途径的句子列为hard，每条须指出不相容的两个值。核对一致的句子一律不输出，也不能标hard；reason里认为一致、相容或不构成矛盾的句子不得出现在数组中。若所有句子都相容，唯一正确的输出是 {"contradictions":[]}。';
 return r;
}
export async function reviewS2({retryManual=false,ids=null}={}){
 if(!process.env.DEEPSEEK_API_KEY)throw Error('DEEPSEEK_API_KEY 环境变量未配置');
 const chosen=ids?entries.filter(e=>ids.includes(e.id)):entries;
 return runContentPipeline({entries:chosen,root:draftRoot,budgetRoot,revision,contextFor,validateDraft,reviewDraftFor,reuseFrozenDrafts:true,retryManual,
  cardId:CARD,allocation:{cardId:CARD,incrementLimitYuan:LIMIT_YUAN,waveLimitYuan:25,maxRequests:MAX_REQUESTS},concurrency:1,batchSize:50,
  client:new DeepSeekClient({budgetYuan:25,logFile:path.join(draftRoot,'usage.jsonl')}),
  buildDraftRequest:()=>{throw Error('T102正文由执行会话起草，禁止模型起草');},buildReviewRequest,
  requestTransform:async({body})=>{const ledger=JSON.parse(await fs.readFile(path.join(budgetRoot,'budget.json'),'utf8'));const issued=Object.values(ledger.requests??{}).filter(r=>r.card===CARD&&['sent','settled','unknown'].includes(r.status)).length;
   if(issued>=MAX_REQUESTS)throw Object.assign(Error(`${CARD}已达${MAX_REQUESTS}次L2调用上限`),{code:'CONTENT_BUDGET_STOP'});return{body};}});
}
export function buildCandidate(rows){
 const prose=id=>rows.find(d=>d.id===id).prose;
 return {spells:spells.map(s=>({...s,...prose(s.id)})),books:books.map(b=>({...b,...prose(b.id)})),items:items.map(i=>({...i,...prose(i.id)})),
  recipes:recipes.map(r=>({...r,...prose(r.id)})),sources:structuredClone(sources),placements:structuredClone(placements),stations:structuredClone(stations),mentors:structuredClone(mentors)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
 if(process.argv.includes('--l1')){const bad=[],warn=[];for(const e of entries){const v=validateDraft(reviewDraftFor(e),e);if(v.errors.length)bad.push(`${e.id}: ${v.errors.join(';')}`);if(v.warnings.length)warn.push(`${e.id}: ${v.warnings.join(';')}`);}
  if(bad.length)throw Error(bad.join('\n'));console.log(JSON.stringify({L1:'passed',entries:entries.length,spells:spells.length,warnings:warn}));}
 if(process.argv.includes('--review')){const i=process.argv.indexOf('--ids');const {summary:s}=await reviewS2({retryManual:process.argv.includes('--retry-manual'),ids:i<0?null:process.argv[i+1].split(',')});
  console.log(JSON.stringify({total:s.total,passed:s.passed,manual:s.manual,pending:s.pending,card:s.budget?.cards?.[CARD]}));}
 if(process.argv.includes('--candidate')){const rows=await readApprovedContent(draftRoot,entries,{contextFor,revision});if(rows.length!==entries.length)throw Error('本批条目未全部通过');
  await fs.writeFile(path.join(draftRoot,'candidate.json'),JSON.stringify(buildCandidate(rows),null,2)+'\n');console.log(JSON.stringify({entries:rows.length}));}
}
