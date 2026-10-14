import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from './load-world.mjs';
import {DeepSeekClient} from './deepseek-client.mjs';
import {runContentPipeline,defaultReviewRequest,hashContent,readApprovedContent} from './content-pipeline.mjs';
import {validateDraft as validateSpellDraft} from './m4-batch2-content.mjs';
import {validateDraft as validateBookDraft} from './m4-books-content.mjs';
import {validateMagicCatalog} from '../server-plugin/magic.mjs';
import {revision,spells,books,items,recipes,sources,placements,stations,mentors,routes,routeOf,spellDraft,bookDraft,itemDraft,itemProse,ritualScopes} from '../world/design/w2-s4.mjs';
export {revision};
const CARD='T104',MAX_REQUESTS=80,LIMIT_YUAN=1;
const draftOf=e=>e.category==='spell'?spellDraft(e):e.category==='book'?bookDraft(e):itemDraft(e);
// The draft hash is part of each entry so that a corrected draft is a new review.
const tag=(row,category)=>({...row,category});
const base=[...spells.map(s=>tag(s,'spell')),...books.map(b=>tag(b,'book')),...items.map(i=>tag(i,'item'))];
export const entries=base.map(e=>({...e,draftVersion:hashContent(draftOf(e)).slice(0,16)}));
export const draftRoot=path.resolve('world/drafts/w2-s4');
const budgetRoot=path.resolve('world/drafts/m4-object');
const world=await loadWorld();
const block=JSON.parse(await fs.readFile(path.resolve('world/meta/blocklist.json'),'utf8'));
const allItems=new Map([...world.items,...items,...books].map(i=>[i.id,i]));
const person=id=>{const p=world.npcs.find(n=>n.id===id);return p?{id,name:p.name,occupation:p.occupation,workplace:world.locations.find(l=>l.id===p.workplace?.location)?.name??null}:null;};
const featureRows=Object.entries(placements).flatMap(([location,rows])=>rows.map(r=>({...r,location})));
const placeName=id=>world.locations.find(l=>l.id===id)?.name??id;
const shared='开始前资格、材料、对象、权限、距离或视线不足则拒绝且不花费。开始后检定失败消耗本次mp、materials和minutes，无新效果。熟练只影响成功把握，不改变距离、固定时限、强度或材料。duration/minutes单位为分钟。登记对象若属他人（owner为人物且access为consent），须有所有者签发的有效environment_use许可；锚石须所有者签发的teleport_anchor许可。effectSpec.kind=ritual的法术（改派役灵、协役除外）施术前须持有效主持资格：玩家在对应机构实际入门、由该机构导师认证职业、守戒满一天后，当面付费取得ritual_permission，资格登记了该ritual operation才可施术；资格随破戒失效。道=芦衡观裴澄（ward、exorcise、purify_area），佛=止波寺季笙（discipline、witness_oath、ferry、consecrate），祭=灯祠苗笙（purify_area、clean_altar、witness_oath、discipline、consecrate），巫=灯祠舒绵（spirit_sense、spirit_census）。野外灵体须经追踪找到才在场，追踪找到时即近身可见约十分钟。';
const evidence={
 exorcise:'server-plugin/magic-ritual.mjs exorcise：须主持资格。目标为在场、清醒存活的非玩家个体，须射程内视线；神性、未知、高阶(rank>0)灵体拒绝。目标spirit.nature为malevolent（凶）则驱离：location置空、activity=已驱离，从此地消失，不掉落材料。目标不是凶灵（普通生物或善灵）则判为误认：其生命减1（不低于1），写入ritual_harm误伤记录，并不驱离。duration=0。',
 ward:'server-plugin/magic-ritual.mjs ward + server-plugin/wildlife.mjs：须主持资格。目标为施术者本人（他人须本人support_magic同意；本法术正文只用于本人）。效果在施术所在地持续duration=60分钟：野外遭遇结算时，施术者身在该地且护界未过期，则带spirit属性的物种（游魂、鬼火、瓦灯魅等灵体）不会作为新遭遇出现或留下踪迹；已在场的个体不受影响；施术者离开该地则不起作用。另：凶灵对受术者的精神干扰压力可被吸收至多power=3点（需目标登记精神状态）。',
 lock_space:'server-plugin/magic-mind-space.mjs lock_space：目标须是射程内登记door（门），有机械锁（locked=true、keyItem登记钥匙、lockGapMm），须门主人environment_use许可。duration=30分钟内，门仍锁着时，穿过门点(blockRadiusMeters)的移动都被拒绝（“封界或机械锁阻断通道”）；持有对应钥匙者接触门锁（1米内）可开锁，开锁后不再阻挡。经阁门钥匙item_s4_scripture_key不出售。',
 alarm:'server-plugin/magic-mind-space.mjs alarm：目标须是射程内登记door，须门主人许可。duration=120分钟内，施术者移动穿过门点或经该门户往来两地时，门框发出警号，写入door_alarm记录（时刻，identified=false），施术者可查看信号；不辨认身份。',
 block_space:'server-plugin/magic-mind-space.mjs block_space：目标须是射程内登记door且connects登记两处地点（观门连通芦衡观与东学街），须门户主人许可。duration=30分钟内，施术者经此门户在两地间移动、或在场内穿过门点，均被拒绝；对象检视显示公开标示“空间封界：此通道暂时封闭”。',
 repair_space:'server-plugin/magic-mind-space.mjs repair_space：目标须是射程内登记对象且其spaceAnomaly为非神性、半径≤0.5米、强度0<i≤1，须所在处主人许可。立即把强度减少power=1；降到0即闭合（closedAt），不再阻挡位移(blocksSpace随之取消)。duration=0。',
 calibrate_anchor:'server-plugin/magic-mind-space.mjs calibrate_anchor：目标须是射程内登记spaceAnchor锚石，anchorIntact=true且anchorOffsetMeters偏移≤0.5米，须锚石主人签发teleport_anchor许可。立即把偏移置为[0,0]。传送与锚送要求锚石偏移≤0.05米，偏移0.3米的观中锚石校正后才可用。duration=0；不新建锚点。',
 dust_servant:'server-plugin/summons.mjs + magic-ritual.mjs dust_servant：召出尘役，工序clean，持续duration=30分钟，每upkeepMinutes=5分钟扣upkeepMp=1点魔力维持，魔力不足即散。召唤时target为射程rangeMeters=10内登记积尘处（dustGrams>0），须视线与主人许可；每次作业收去min(power=100克, 现有浮尘)，计入collectedDustGrams；不处理heavyWasteGrams厚重垃圾。',
 purify_area:'server-plugin/magic-ritual.mjs purify_area：须主持资格。施术者周围rangeMeters内、视线可见、在场清醒的灵体中，筛出非神性、rank=0、nature=malevolent的低阶凶灵；没有则拒绝施术。立即驱离其中至多power个（location置空、activity=已驱离），不掉落材料。duration=0。',
 discipline:'server-plugin/magic-ritual.mjs discipline：须主持资格。目标为本人，须本人faith与资格教派/师承及戒律一致，且observedSince至少一天前、lastBreach早于observedSince（守戒满一天未破戒）。施成后给本人一层protection：duration=90分钟内吸收physical（刀剑、棍棒、拳脚）与shadow（暗影）伤害合计至多power点；多层只取最强。破戒（lastBreach改变）、离开施术地点或期满即失效。',
 ferry:'server-plugin/magic-ritual.mjs ferry（T104新接入）：须主持资格（止波寺）。目标须是在场、清醒、无主的野外生态个体，物种nature.kind为“游魂”，spirit非神性、rank=0、realm=local，须射程内视线；活人、NPC、玩家、遗体、非游魂（鬼火、瓦灯魅等）或神性/高阶灵体一律拒绝。施成后：该个体status=已超度、hp=0、location置空、spirit.realm=beyond，记入止波寺度亡牌位(feature_s4_rest_tablet的names列表)，写spirit_ferry记录(revivable=false)，所属栖地生态账该物种ferried+1；此后它不再在场、不计入当地种群在场数，不掉落材料。不复活任何人。duration=0。',
 witness_oath:'server-plugin/magic-ritual.mjs witness_oath：须主持资格。目标为本人（他人须ritual_oath同意；本正文只用于本人）；args.text为1至80字誓言。写入一份kind=oath的契约存档：当事人为本人，church为资格所属师承/教派名（止波师承或门印证契堂），custodian与witness为施术者，voluntary=true；只记录，不自动强制履行。duration=0。',
 consecrate:'server-plugin/magic-ritual.mjs consecrate + wildlife.mjs（T104新接入）：须主持资格。施术地须是登记野外栖地，且有effectSpec.group所指门类（亡灵或妖怪）、按manifest方式自行聚成的灵体物种，否则拒绝；同栖地同门类已有未过期的同类法事则拒绝。效果持续duration=10080分钟（七天）：期间每周生态结算时，该栖地该门类物种本应新聚成的数量不再加入种群（记为suppressed），已有个体与其他物种不变；期满恢复。安滩法会group=亡灵（下游雾滩游魂、鬼火）；镇窑灯礼group=妖怪（西郊废窑瓦灯魅）。',
 clean_altar:'server-plugin/magic-ritual.mjs clean_altar：须主持资格。目标须是射程内登记altar，完整(integrity>0)，deity与church属资格教派（衡檐/门印证契堂），pollutionKind=ordinary且contamination≥1，须保管人许可。立即除去min(power=40, 现有污染)点。duration=0。',
 spirit_sense:'server-plugin/magic-ritual.mjs spirit_sense：须主持资格。目标为本人（他人须mental_magic同意）。返回射程内视线可见、在场清醒的灵体列表，每个给出：是否低阶(rank=0)、是否神性、性质nature（malevolent凶/benign善）。不驱赶，不给来历。若本人登记有精神压力则减1。duration=0。',
 spirit_census:'server-plugin/magic-ritual.mjs spirit_census（T104新接入）：须主持资格。施术地须是登记野外栖地且有按manifest自行聚成的灵体物种。只读返回每个这类物种：名称、种类、性质、阶位、尚未现身数(unseen=生态账count)、在场存活数、累计新聚数(arisen)、已度亡数(ferried)、聚成季节与聚成原因。不改变状态。duration=0。',
 store:'server-plugin/magic-mind-space.mjs store：目标为施术者实际持有数量恰为1的自有物品，重量≤power=2千克。物品移出行囊进入封存（位置记为施术时所在点），duration=30分钟；期满变为“落地”，位于封存时的地点和位置，可被拾起或隔空取物。',
 retrieve:'server-plugin/magic-mind-space.mjs retrieve：目标为自有单件物品实例，状态为“落地”、在当前地点、射程rangeMeters=10内且视线可见，重量≤power=2千克；取回后进入行囊。别人持有或在容器中的取不到（自有袋内取物另有规则，本法术正文不涉及）。duration=0。',
 corrode:'server-plugin/magic-mind-space.mjs corrode：目标须是射程内登记的无生命对象（非植物、非活体），material为metal、wood或stone，有完整度与抗蚀性，须所有者许可。duration=30分钟内每分钟完整度减少power×(1-抗蚀性)（旧门闩抗蚀性0.2，即每分钟0.8），归零后不再阻挡视线与移动；写入腐蚀痕迹记录。许可失效后不再继续。',
 rubble_servant:'server-plugin/summons.mjs + magic-ritual.mjs rubble_servant：召出碎石役，工序carry_rubble，持续duration=60分钟，每5分钟扣1点魔力维持，魔力不足即散。召唤时target为射程内登记碎石堆(rubbleGrams≥1)，destination为射程内另一处有capacityGrams的堆放处，两处须视线与主人许可、彼此距离不超过射程；目的地剩余容量须够一次搬运。每次作业搬运min(power=2000克, 现有碎石)。',
 reassign:'server-plugin/magic-ritual.mjs reassign：目标(target)与source为两个不同的、施术者本人在场且有效的役灵（召唤契约履行中、未过期），各自已有登记工序；互换两者的工序，但新工序须在各自契约tasks之内，作业对象仍须视线与主人许可。不需主持资格。duration=0。',
 coordinate:'server-plugin/magic-ritual.mjs coordinate：目标与source为两个本人在场、已有工序的有效役灵；立即让两者各执行一次自己已登记的工序（清扫或搬运等，按各自契约限量），作业对象须视线与主人许可。不需主持资格。duration=0。',
 anchor_cargo:'server-plugin/magic-mind-space.mjs + magic-movement.mjs anchor_cargo：target为施术者持有数量恰为1的自有物品，重量≤power=2千克；source与destination为两块不同、完好、偏移≤0.05米且施术者已实地辨识(known_anchor)的锚石，source在当前地点射程3米内且视线无遮挡；两块锚石各须其所有者签发、未过期的teleport_anchor许可；两地步行路线≤100公里，目的地可进入。物品移出行囊，以“落地”状态出现在目的锚石位置。duration=0。',
 measure:'server-plugin/magic-mind-space.mjs measure：只读，不需许可。target与destination为当前地点两处登记对象，均在射程rangeMeters=10内且视线可见，两者之间视线不被遮挡（不隔墙）；返回两者相距米数。duration=0。',
 contract_sense:'server-plugin/magic-mind-space.mjs contract_sense：target为一份契约记录，施术者本人须在当事人(parties)之中；返回签订后与原签条款(parties、subject、quantity、deadline、cost、kind)相比的变更列表(字段、改前、改后)，legalJudgement=false，不判定对错。duration=0。',
};
const opOf=s=>s.effectSpec.operation??s.effectSpec.status??s.effectSpec.kind;
const learning=s=>{
 const m=sources.mappings.find(m=>m.spell===s.id),r=routes[routeOf[s.id]];
 return {route:routeOf[s.id],teacher:m.teacher?person(m.teacher):null,book:m.book?{id:m.book,name:books.find(b=>b.id===m.book).name,seller:person(m.sourceOwner),readingMinutes:m.readingMinutes,minimumLiteracy:100}:null,
  professionRequired:m.requiresCertification?world.professions.find(p=>p.id===m.requiresCertification).name:null,skillProfession:r.profession?world.professions.find(p=>p.id===r.profession).name:'无职业限制',
  rules:'server-plugin/learning.mjs：导师须在场、正处授课时段，付learnFee铜、花learnMinutes分钟后作智力检定；读书须持有完好书、识字≥100，花阅读时间检定，不另付学费。一阶（stage=1）法术须持有对应职业认证。失败仍花时间和学费，不退款。'};
};
const targetsByOp={lock_space:['scripture_door','scripture_shelf'],alarm:['gate'],block_space:['gate'],repair_space:['old_rift'],calibrate_anchor:['anchor_stone'],dust_servant:['scripture_shelf'],
 ferry:['rest_tablet'],clean_altar:['lintel_altar'],corrode:['iron_latch'],rubble_servant:['brick_pile','tile_pile','rubble_cart'],reassign:['brick_pile','tile_pile','rubble_cart'],coordinate:['brick_pile','tile_pile','rubble_cart'],anchor_cargo:['anchor_stone']};
const targetFacts=s=>featureRows.filter(r=>(targetsByOp[opOf(s)]??[]).includes(r.id.slice('feature_s4_'.length)))
 .map(r=>({id:r.id,name:r.name,kind:r.kind,place:placeName(r.location),owner:person(r.owner)?.name??placeName(r.owner),access:r.access,state:r.state,...(r.connects?{connects:r.connects.map(placeName)}:{}),...(r.spaceAnchor?{spaceAnchor:true}:{})}));
const habitats={ferry:['下游雾滩(苇汀村外，汀雾游魂初始3只、沼光鬼火5只)'],consecrate:['下游雾滩：汀雾游魂(亡灵,春秋冬雾夜聚成)、沼光鬼火(亡灵,春夏秋聚成)','西郊废窑：瓦灯魅(妖怪/器物精怪,四季生成)'],spirit_census:['下游雾滩','西郊废窑'],exorcise:['下游雾滩','西郊废窑'],purify_area:['下游雾滩','西郊废窑'],ward:['下游雾滩','西郊废窑'],spirit_sense:['下游雾滩','西郊废窑']};
export const reviewDraftFor=draftOf;
export function contextFor(e){
 if(e.category==='spell')return {implementation:evidence[opOf(e)],shared,learning:learning(e),
  materials:e.materials.map(m=>({...m,name:allItems.get(m.item)?.name})),exampleTargets:targetFacts(e),habitats:habitats[opOf(e)]??[],
  facts:['正文中的“主人”“保管人”指登记对象的owner：芦衡观经阁门、经阁书架、观门、观中锚石、旧阵残隙属裴澄；止波寺度亡牌位属季笙；河湾村小学堂的学塾庭前锚面与旧渡口的渡口候渡锚面属书商陆青；灯祠门印神坛属苗笙；东街学馆院角碎砖堆、檐下碎瓦堆、运渣板车、锈死的旧门闩属学馆裴绵。裴澄是芦衡观道士导师，季笙是止波寺僧侣导师，苗笙是灯祠祭司导师，舒绵是灯祠巫师导师。','游魂是溺亡后未得安葬者留下的残念在雾夜聚成；鬼火是腐苇沼气缠上残念而成；瓦灯魅是废窑旧陶灯沾残火自己游走。三者都是非神性低阶凶灵（rank=0、malevolent）。','法术law字段是合法性：public公开可用，consent须当事人同意，permit城中须许可。','示例对象、地点名、风俗与劝诫属于叙述，可出现在用途与社会后果中。']};
 if(e.category==='book')return {seller:person(SELLER_ID),stock:sources.books.find(b=>b.item.id===e.id).stock,spells:spells.filter(s=>e.book.teaches.includes(s.id)).map(s=>({id:s.id,name:s.name,stage:s.stage,profession:routes[routeOf[s.id]].profession})),rules:world.rules.books,
  learning:'识字至少100并持有完好书；每次读一种，用readingMinutes分钟；一阶法术须法师认证，零阶不限职业。失败花完整阅读时间，保留书和购书成本。陆青库存2本，售完不自动补货。'};
 return {usedBy:['锁隙符所作用的芦衡观经阁门，登记keyItem为此钥匙'],holder:person('npc_bs_077_1'),facts:['此钥匙不在任何商店出售，没有acquisition，由观中保管。','物品没有治疗或战斗数值，用途以use字段为准。','裴澄是芦衡观道士导师。','一拃约二十厘米。']};
}
const SELLER_ID='npc_hw_luqing';
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
 const errors=[],warnings=[],fields=['use','description','inspection','storage'];
 if(d?.id!==e.id||!d.prose||Object.keys(d).some(k=>!['id','prose'].includes(k))||Object.keys(d.prose).some(k=>!fields.includes(k)))errors.push('编号或正文结构错误');
 for(const k of fields)if(typeof d?.prose?.[k]!=='string'||!d.prose[k].trim())errors.push(`缺少${k}`);
 const text=JSON.stringify(d?.prose??{});if(leak.test(text))errors.push('场外信息泄漏');
 for(const word of[...block.names,...block.realPeople])if(text.includes(word))errors.push('原创屏蔽');
 if(e.shelfLifeDays&&/(\d+)天/.test(d?.prose?.storage??'')&&!d.prose.storage.includes(`${e.shelfLifeDays}天`))errors.push('保存天数与目录不符');
 return {errors,warnings};
}
export function buildReviewRequest(e,d,c){
 const r=defaultReviewRequest(e,d,c);r.max_tokens=1800;
 r.messages[0].content+='这是原创仙武世界里可学的法术、配套读本和一件钥匙物品条目。skeleton是机制与数值，publishedFacts.implementation/rules/shared是实际执行规则，以它们为准逐句核对draft；draft.source是学习来源映射。'+
  '文字动作、手势、外观、用途建议和劝诫属于叙述，只要不新增材料、数值、能力或取得途径就允许。中文数字与阿拉伯数字、勒克斯与lux、天与分钟的等值换算不算矛盾；duration=0表示即时完成；“最多N分钟”与duration一致即可。'+
  '只把与skeleton或publishedFacts实际相反、或新增没有依据的功能/数值/取得途径的句子列为hard，每条须指出不相容的两个值。核对一致的句子不输出，也不能标hard；reason里认为一致、相容或不构成矛盾的句子不得出现在数组中。若所有句子都相容，唯一正确的输出是 {"contradictions":[]}。';
 return r;
}
export async function reviewS4({retryManual=false,ids=null}={}){
 if(!process.env.DEEPSEEK_API_KEY)throw Error('DEEPSEEK_API_KEY 环境变量未配置');
 const chosen=ids?entries.filter(e=>ids.includes(e.id)):entries;
 return runContentPipeline({entries:chosen,root:draftRoot,budgetRoot,revision,contextFor,validateDraft,reviewDraftFor,reuseFrozenDrafts:true,retryManual,
  cardId:CARD,allocation:{cardId:CARD,incrementLimitYuan:LIMIT_YUAN,waveLimitYuan:25,maxRequests:MAX_REQUESTS},concurrency:1,batchSize:50,
  client:new DeepSeekClient({budgetYuan:25,logFile:path.join(draftRoot,'usage.jsonl')}),
  buildDraftRequest:()=>{throw Error('T104正文由执行会话起草，禁止模型起草');},buildReviewRequest,
  requestTransform:async({body})=>{const ledger=JSON.parse(await fs.readFile(path.join(budgetRoot,'budget.json'),'utf8'));const issued=Object.values(ledger.requests??{}).filter(r=>r.card===CARD&&['sent','settled','unknown'].includes(r.status)).length;
   if(issued>=MAX_REQUESTS)throw Object.assign(Error(`${CARD}已达${MAX_REQUESTS}次L2调用上限`),{code:'CONTENT_BUDGET_STOP'});return{body};}});
}
export function buildCandidate(rows){
 const prose=id=>rows.find(d=>d.id===id).prose;
 return {spells:spells.map(s=>({...s,...prose(s.id)})),books:books.map(b=>({...b,...prose(b.id)})),items:items.map(i=>({...i,...prose(i.id)})),
  recipes:structuredClone(recipes),sources:structuredClone(sources),placements:structuredClone(placements),stations:structuredClone(stations),mentors:structuredClone(mentors),ritualScopes:structuredClone(ritualScopes)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
 if(process.argv.includes('--l1')){const bad=[],warn=[];for(const e of entries){const v=validateDraft(reviewDraftFor(e),e);if(v.errors.length)bad.push(`${e.id}: ${v.errors.join(';')}`);if(v.warnings.length)warn.push(`${e.id}: ${v.warnings.join(';')}`);}
  if(bad.length)throw Error(bad.join('\n'));console.log(JSON.stringify({L1:'passed',entries:entries.length,spells:spells.length,warnings:warn}));}
 if(process.argv.includes('--review')){const i=process.argv.indexOf('--ids');const {summary:s}=await reviewS4({retryManual:process.argv.includes('--retry-manual'),ids:i<0?null:process.argv[i+1].split(',')});
  console.log(JSON.stringify({total:s.total,passed:s.passed,manual:s.manual,pending:s.pending,card:s.budget?.cards?.[CARD]}));}
 if(process.argv.includes('--candidate')){const rows=await readApprovedContent(draftRoot,entries,{contextFor,revision});if(rows.length!==entries.length)throw Error('本批条目未全部通过');
  await fs.writeFile(path.join(draftRoot,'candidate.json'),JSON.stringify(buildCandidate(rows),null,2)+'\n');console.log(JSON.stringify({entries:rows.length}));}
}
