import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from './load-world.mjs';
import {DeepSeekClient} from './deepseek-client.mjs';
import {runContentPipeline,defaultReviewRequest,hashContent,readApprovedContent} from './content-pipeline.mjs';
import {validateDraft as validateSpellDraft} from './m4-batch2-content.mjs';
import {validateDraft as validateBookDraft} from './m4-books-content.mjs';
import {validateMagicCatalog} from '../server-plugin/magic.mjs';
import {revision,spells,books,items,recipes,sources,placements,stations,mentors,routes,routeOf,spellDraft,bookDraft,itemDraft,itemProse} from '../world/design/w2-s3.mjs';
export {revision};
const CARD='T103',MAX_REQUESTS=80,LIMIT_YUAN=1;
const draftOf=e=>e.category==='spell'?spellDraft(e):e.category==='book'?bookDraft(e):itemDraft(e);
// The draft hash is part of each entry so that a corrected draft is a new review.
const tag=(row,category)=>({...row,category});
const base=[...spells.map(s=>tag(s,'spell')),...books.map(b=>tag(b,'book')),...items.map(i=>tag(i,'item'))];
export const entries=base.map(e=>({...e,draftVersion:hashContent(draftOf(e)).slice(0,16)}));
export const draftRoot=path.resolve('world/drafts/w2-s3');
const budgetRoot=path.resolve('world/drafts/m4-object');
const world=await loadWorld();
const block=JSON.parse(await fs.readFile(path.resolve('world/meta/blocklist.json'),'utf8'));
const allItems=new Map([...world.items,...items,...books].map(i=>[i.id,i]));
const person=id=>{const p=world.npcs.find(n=>n.id===id);return p?{id,name:p.name,occupation:p.occupation,workplace:world.locations.find(l=>l.id===p.workplace?.location)?.name??null}:null;};
const featureRows=Object.entries(placements).flatMap(([location,rows])=>rows.map(r=>({...r,location})));
const placeName=id=>world.locations.find(l=>l.id===id)?.name??id;
const shared='开始前资格、材料、对象、权限、距离或视线不足则拒绝且不花费。开始后检定失败消耗本次mp、materials和minutes，无新效果。熟练只影响成功把握，不改变距离、固定时限、强度或材料。duration/minutes单位为分钟。登记对象若属他人（owner为人物且access为consent），须有所有者签发的有效environment_use许可；public对象无需许可；只读光学操作不需许可。targeting.consent为support_magic或mental_magic时，对本人以外的目标须有该本人签给施术者的同类有效同意记录；targeting.permit为mental_magic时须持当地实际颁发、仍有效的精神施法许可（止波寺由季笙、灯祠由舒绵或苗笙按法域颁发）。heal对本人以外的清醒目标须有本人healing同意，濒死者除外。';
const evidence={
 sense_mind:'server-plugin/magic-mind-space.mjs sense_mind：目标为本人或在场、未昏迷/濒死/死亡的活体，须射程内视线；他人须本人mental_magic同意。只返回interference（有无）和interferenceCount：目标登记精神干扰条目数加其身上未过期的illusion（错觉）、compulsion（强迫）状态数；fear（恐惧）不计入。不返回想法或来源。',
 memory_guard:'server-plugin/magic-mind-space.mjs memory_guard：目标为本人或经mental_magic同意的在场活体；args.source指定目标已有、发生时刻不晚于现在且未被模糊的具体记忆，否则拒绝。效果持续duration=43200分钟（三十天）：本人的这段记忆在检索时不随时间衰减；人物的这段记忆在此期间不会过期遗忘（npc-memory按护念期限延长保留）。结果truthVerified=false，不核实真假，不恢复已模糊的记忆。同意撤回或许可失效后效果不再有效。',
 record_feeling:'server-plugin/magic-mind-space.mjs record_feeling：args.target须是施术者实际持有的单件物品，args.text为施术者写下的1至80字感受。写入feeling_carrier记录，期限duration=1440分钟；之后检视此物须实际持有。不读取他人内心。',
 protection:'server-plugin/magic-primitives.mjs protection：目标为本人或在场活体，他人须本人support_magic同意。效果持续duration分钟，吸收列出门类(damageTypes)的伤害合计至多power点（remaining递减），吸收完或期满失效；同时有多层防护时每次伤害只用最强的一层（stacking=strongest）。physical=物理（刀剑、棍棒、拳脚、撞击），cold=寒冷，wind=风刃，fire=火焰。',
 heal:'server-plugin/magic.mjs heal：目标为本人或在场活体，须射程内视线（targeting）。回复power点生命，不超过生命上限；死者拒绝。对本人以外未濒死的目标须本人healing同意；目标濒死时无需同意，回复后状态变为正常、脱离濒死。',
 area:'server-plugin/magic-area.mjs area pulse+heal：中心为施术者当前位置（或接触到的登记对象），半径radiusMeters=2米，持续duration分钟。施成时及之后每intervalMinutes=10分钟结算一次：圈内视线可见的本人，以及已签healing同意的他人，各按子效果heal回复power=2点生命（不超过上限）；未同意、不可见或离圈者不受益；圈心不随施术者移动。',
 preserve:'server-plugin/magic-care.mjs preserve：目标须是登记careProcess=food、关闭且完好(closed、integrity>0)的容器，内有食物/药材批次且已剔除坏的批次，柜温1至40度，须视线与许可。持续duration=60分钟，每分钟扣维持魔力1+ceil((100-隔热率)/25)（寺中药柜隔热率100，即每分钟1点）；有魔力时柜温每分钟降0.5度、不低于1度，批次腐败速度乘(1-power/100)=一半；魔力不足当分钟停止并恢复原温，期满柜温恢复施术前温度。施法时魔力须≥mp+维持魔力。',
 dim:'server-plugin/magic-light.mjs dim：目标为射程内登记灯具（须许可）或施术者自己的术光；duration=30分钟内该光源亮度乘(1-power/100)，power=60即剩四成。不熄灭、不改燃料。',
 privacy:'server-plugin/magic-light.mjs privacy：目标须是登记aperture（缝隙），闭合(open=false)且缝宽apertureMeters≤0.1米，须许可。duration=30分钟内阻断穿过该缝隙点的视线；门开或缝宽超过0.1米时不再遮挡。不挡声音。',
 cool:'server-plugin/magic-object.mjs cool：目标为射程内（rangeMeters=1，须接触）登记热学器物，须许可。立即带走min(power, 当前热量-limitC×热容)焦耳，热量散到周边环境，不低于limitC=15摄氏度；duration=0。不结冰。湿敷帕热容400焦耳/度，室温20度。',
 relief:'server-plugin/magic-status.mjs relief：目标为本人或在场活体，须视线、本人mental_magic同意及当地精神施法许可。按效果编号顺序，从目标身上未过期的fear（恐惧）与compulsion（轻度强迫）状态中合计解去至多power=3点强度，强度归零的状态移除。duration=0；不改变记忆或喜恶。',
 travel_calm:'server-plugin/magic-status.mjs travel_calm：目标为本人或经support_magic同意的在场活体。duration分钟内，命中惩罚中的恐惧值减去travel_calm强度（max(0,恐惧-强度)），即恐惧对出手准头的影响最多抵消power=3点；不移除恐惧状态，不影响伤害。',
 shadow_ward:'server-plugin/magic-status.mjs shadow_ward：目标为本人或经support_magic同意的在场活体。duration分钟内shadowResistance=power/100=0.3，暗影伤害减少三成；对其他伤害门类无效。',
 fog_light:'server-plugin/magic-light.mjs fog_light：目标为射程内有登记半径(0.1至3米)的对象，须许可。duration=30分钟内在该处增加power×10=20勒克斯（一米处）的光源；雾中站在灯点3米内的观察者可视距离上限由10/雾密度提高到20/雾密度（一倍），仍不超过100米。',
 waymark:'server-plugin/magic-light.mjs waymark：目标为一条以当前所在地为一端、两端都已亲身到过(discoveries)且当前可通行的相邻路线。在施术者当前位置留下1勒克斯光标，duration=90分钟；inspect_light检查这条路线时可见光标。不开辟路线、不揭示新路线、不给进入许可。',
 focus_light:'server-plugin/magic-light.mjs focus_light：目标为射程内登记聚光面(focusAreaM2 0.1至1平方米)，args.source为同地实有光源（登记灯具或自己的术光），两者均须许可，光源到聚光面的光路无遮挡，同一光源已有聚光或回光时拒绝。duration=30分钟内光源直射别处的光减少power%=60%，这部分按聚光面面积投到聚光面附近；不增加总光量。',
 reflect:'server-plugin/magic-light.mjs reflect：目标为射程内登记镜面（reflectivityPercent 1至100，reflectionAreaM2 0.1至1），args.source为实有光源，args.destination为可见的登记观看点；光路均须无遮挡，光源已有聚光或回光时拒绝，镜面和光源须许可。duration=30分钟内转出的光比例为min(power,反射率)=min(40,镜面反射率)，只照到观看点1米内；光源直射别处相应减少。',
 dark_area:'server-plugin/magic-light.mjs dark_area：目标为射程内有登记半径(0.1至3米)的对象，须许可。duration=10分钟内该对象周围其登记半径内各点光照乘(1-power/100)=三成；不熄灯，半径外不变。',
 light_screen:'server-plugin/magic-light.mjs light_screen：目标为宽度0.01至2米的登记passage或aperture，须许可。duration=10分钟内，位于施术者一侧（以施术时施术者相对通道的方向为准）的观察者，视线穿过该通道点宽度一半范围时被阻断；从另一侧看来不受阻断。不阻挡移动和声音。',
 color:'server-plugin/magic-light.mjs color：只读，不需许可。目标须是登记sample，sampleType为mineral或dye，有重量与380至780纳米的光谱；目标处光照须大于0。返回sampleType、sampleGrams及各波长与反射率读数，不给名称或价值。',
 shadow_measure:'server-plugin/magic-light.mjs shadow_measure：只读。目标须是登记surface（墙面），args.source为高于被测物的实有光源，args.destination为有登记高度(0.01至10米)的被测物；光源→被测物→墙面光路无遮挡。返回被测物高度、影长与影端位置；目标处须有光。',
 reveal:'server-plugin/magic-light.mjs reveal：目标为射程内视线可见的在场活体（targeting.lineOfSight）。移除其身上未过期的camouflage（折光隐身）状态效果，写入光学观察记录；其他状态不变。',
 bind_shadow:'server-plugin/magic-light.mjs bind_shadow：目标为射程内视线可见的在场活体，其所在点照度须为微光(dim，光照大于0且小于1勒克斯)。duration=2分钟内，目标仍在原点0.5米内且该处仍为微光时，其移动被拒绝；照亮（光照≥1）或全暗即失效。',
 decoy:'server-plugin/magic-light.mjs decoy：目标为本人或经support_magic同意者；args.destination为另一名在场、睁眼、有视觉且非睡眠昏迷的观察者，观察者须在射程内且看得见目标，目标处光照大于0。duration=1分钟内，该观察者下一次出手命中修正为-power×0.02=-6%，用过一次即失效（remainingUses=0）；虚影不阻挡伤害。',
 reveal_wear:'server-plugin/magic-light.mjs reveal_wear：只读。目标须是有登记表面磨损记录的对象，目标处光照须大于0；返回表面磨痕的种类、深度(depthMm)和长度(lengthMm)，表面以下(surface=false)的不返回，不说明造成者。',
 light:'server-plugin/magic-light.mjs light：目标为施术者掌心或实际持有的一件单件物品；一米处亮度power×10=100勒克斯，持续duration分钟；可遮光、复光或熄灭；物件不再持有时光源失效。',
 dry:'server-plugin/magic-object.mjs dry：目标为射程内登记dryable热学器物，有水分且当前热量高于limitC=10摄氏度对应热量。立即蒸发min(power, 现有水分, floor((热量-limitC×热容)/3))毫克水分，每毫克用去3焦耳，器物降温；duration=0，不另生热。',
};
const opOf=s=>s.effectSpec.operation??s.effectSpec.status??s.effectSpec.kind;
const learning=s=>{
 const m=sources.mappings.find(m=>m.spell===s.id),r=routes[routeOf[s.id]];
 return {route:routeOf[s.id],teacher:m.teacher?person(m.teacher):null,book:m.book?{id:m.book,name:books.find(b=>b.id===m.book).name,seller:person(m.sourceOwner),readingMinutes:m.readingMinutes,minimumLiteracy:100}:null,
  professionRequired:m.requiresCertification?world.professions.find(p=>p.id===m.requiresCertification).name:null,skillProfession:r.profession?world.professions.find(p=>p.id===r.profession).name:'无职业限制',
  rules:'server-plugin/learning.mjs：导师须在场、正处授课时段，付learnFee铜、花learnMinutes分钟后作智力检定；读书须持有完好书、识字≥100，花阅读时间检定，不另付学费。一阶（stage=1）法术须持有对应职业认证。失败仍花时间和学费，不退款。'};
};
const targetsByOp={sense_mind:[],memory_guard:[],record_feeling:[],protection:[],heal:[],area:[],preserve:['herb_cabinet'],dim:['hall_lamp'],privacy:['chan_door'],cool:['compress_cloth'],relief:[],travel_calm:[],shadow_ward:[],fog_light:['fog_stand'],waymark:[],
 focus_light:['altar_lamp','offering_table'],reflect:['altar_lamp','bronze_mirror','side_seat'],dark_area:['rest_couch'],light_screen:['side_passage'],color:['ore_tray','porch_lamp'],shadow_measure:['porch_lamp','incense_post','screen_wall'],reveal:[],bind_shadow:['dark_corner'],decoy:[],reveal_wear:['old_mortar','porch_lamp'],light:[],dry:['drying_cloth']};
const targetFacts=s=>featureRows.filter(r=>(targetsByOp[opOf(s)]??[]).includes(r.id.slice('feature_s3_'.length)))
 .map(r=>({id:r.id,name:r.name,kind:r.kind,place:placeName(r.location),owner:person(r.owner)?.name??placeName(r.owner),access:r.access,state:r.state,model:r.thermalModel??null}));
export const reviewDraftFor=draftOf;
export function contextFor(e){
 if(e.category==='spell')return {implementation:evidence[opOf(e)],shared,learning:learning(e),
  materials:e.materials.map(m=>({...m,name:allItems.get(m.item)?.name})),exampleTargets:targetFacts(e),
  facts:['正文中的“保管人”“管灯的人”指登记对象的owner：止波寺物件属季笙，灯祠供灯、供案、铜镜、卧榻、侧廊属苗笙，雾灯台属舒绵；祠前廊灯、矿样盘、香柱、影壁、旧药臼、晾帕、祠后暗角为镇上公用。季笙是止波寺导师（僧侣），舒绵是灯祠巫师导师，苗笙是灯祠祭司导师。','示例对象和地点名可以出现在正文的用途与社会后果中；用途建议与劝诫属于叙述。','法术law字段是合法性：public公开可用，consent须当事人同意，permit城中须许可。','勒克斯是照度单位；一拃约二十厘米。']};
 if(e.category==='book')return {seller:person(SELLER_ID),stock:sources.books.find(b=>b.item.id===e.id).stock,spells:spells.filter(s=>e.book.teaches.includes(s.id)).map(s=>({id:s.id,name:s.name,stage:s.stage,profession:routes[routeOf[s.id]].profession})),rules:world.rules.books,
  learning:'识字至少100并持有完好书；每次读一种，用readingMinutes分钟；一阶法术须法师认证，零阶不限职业。失败花完整阅读时间，保留书和购书成本。陆青库存2本，售完不自动补货。'};
 const used=spells.filter(s=>s.materials.some(m=>m.item===e.id)).map(s=>s.name),seller=e.acquisition?.seller?person(e.acquisition.seller):null;
 return {seller,usedBy:used,facts:['线香常用柏木粉、榆皮粉等木粉调制；糙米带谷皮；菜籽油可作灯油。','物品没有直接的治疗或战斗数值，用途以use字段为准。','一拃约二十厘米，一刻钟为15分钟。']};
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
 r.messages[0].content+='这是原创仙武世界里可学的法术、配套读本和施法材料条目。skeleton是机制与数值，publishedFacts.implementation/rules/shared是实际执行规则，以它们为准逐句核对draft；draft.source是学习来源映射。'+
  '文字动作、手势、外观、用途建议和劝诫属于叙述，只要不新增材料、数值、能力或取得途径就允许。中文数字与阿拉伯数字、勒克斯与lux、天与分钟的等值换算不算矛盾；duration=0表示即时完成；“最多N分钟”与duration一致即可。'+
  '只把与skeleton或publishedFacts实际相反、或新增没有依据的功能/数值/取得途径的句子列为hard，每条须指出不相容的两个值。核对一致的句子不输出，也不能标hard；reason里认为一致、相容或不构成矛盾的句子不得出现在数组中。若所有句子都相容，唯一正确的输出是 {"contradictions":[]}。';
 return r;
}
export async function reviewS3({retryManual=false,ids=null}={}){
 if(!process.env.DEEPSEEK_API_KEY)throw Error('DEEPSEEK_API_KEY 环境变量未配置');
 const chosen=ids?entries.filter(e=>ids.includes(e.id)):entries;
 return runContentPipeline({entries:chosen,root:draftRoot,budgetRoot,revision,contextFor,validateDraft,reviewDraftFor,reuseFrozenDrafts:true,retryManual,
  cardId:CARD,allocation:{cardId:CARD,incrementLimitYuan:LIMIT_YUAN,waveLimitYuan:25,maxRequests:MAX_REQUESTS},concurrency:1,batchSize:50,
  client:new DeepSeekClient({budgetYuan:25,logFile:path.join(draftRoot,'usage.jsonl')}),
  buildDraftRequest:()=>{throw Error('T103正文由执行会话起草，禁止模型起草');},buildReviewRequest,
  requestTransform:async({body})=>{const ledger=JSON.parse(await fs.readFile(path.join(budgetRoot,'budget.json'),'utf8'));const issued=Object.values(ledger.requests??{}).filter(r=>r.card===CARD&&['sent','settled','unknown'].includes(r.status)).length;
   if(issued>=MAX_REQUESTS)throw Object.assign(Error(`${CARD}已达${MAX_REQUESTS}次L2调用上限`),{code:'CONTENT_BUDGET_STOP'});return{body};}});
}
export function buildCandidate(rows){
 const prose=id=>rows.find(d=>d.id===id).prose;
 return {spells:spells.map(s=>({...s,...prose(s.id)})),books:books.map(b=>({...b,...prose(b.id)})),items:items.map(i=>({...i,...prose(i.id)})),
  recipes:structuredClone(recipes),sources:structuredClone(sources),placements:structuredClone(placements),stations:structuredClone(stations),mentors:structuredClone(mentors)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
 if(process.argv.includes('--l1')){const bad=[],warn=[];for(const e of entries){const v=validateDraft(reviewDraftFor(e),e);if(v.errors.length)bad.push(`${e.id}: ${v.errors.join(';')}`);if(v.warnings.length)warn.push(`${e.id}: ${v.warnings.join(';')}`);}
  if(bad.length)throw Error(bad.join('\n'));console.log(JSON.stringify({L1:'passed',entries:entries.length,spells:spells.length,warnings:warn}));}
 if(process.argv.includes('--review')){const i=process.argv.indexOf('--ids');const {summary:s}=await reviewS3({retryManual:process.argv.includes('--retry-manual'),ids:i<0?null:process.argv[i+1].split(',')});
  console.log(JSON.stringify({total:s.total,passed:s.passed,manual:s.manual,pending:s.pending,card:s.budget?.cards?.[CARD]}));}
 if(process.argv.includes('--candidate')){const rows=await readApprovedContent(draftRoot,entries,{contextFor,revision});if(rows.length!==entries.length)throw Error('本批条目未全部通过');
  await fs.writeFile(path.join(draftRoot,'candidate.json'),JSON.stringify(buildCandidate(rows),null,2)+'\n');console.log(JSON.stringify({entries:rows.length}));}
}
