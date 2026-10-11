import fs from'node:fs/promises';import path from'node:path';
import{loadWorld}from'./load-world.mjs';import{DeepSeekClient}from'./deepseek-client.mjs';
import{runContentPipeline,readApprovedContent,defaultReviewRequest,parseModelJSON,hashContent}from'./content-pipeline.mjs';
import{loreConstraintErrors}from'./spell-lore-constraints.mjs';
import{batch2SpellCandidates,batch2BossCandidates}from'../world/design/m4-batch2-candidates.mjs';
const world=await loadWorld(),root=path.resolve('world/drafts/m4-batch2'),budgetRoot=path.resolve('world/drafts/m4-object'),revision='m4-batch2-v1';
const block=JSON.parse(await fs.readFile('world/meta/blocklist.json','utf8'));
const entries=[...batch2SpellCandidates().map(e=>({...e,category:'spell'})),...batch2BossCandidates().map(e=>({...e,category:'boss'}))];
const spellFields=['theory','casting','failure','counters','socialConsequences','proficiencyEffects'],bossFields=['origin','lairDescription','behavior'];
const fields=e=>e.category==='spell'?spellFields:bossFields;
export {entries,contextFor,revision,validateDraft};
const contextFor=e=>({items:[...new Set([...(e.materials??[]).map(r=>r.item),...e.drops?.map(r=>r.item)??[],...e.effectSpec?.offering?[e.effectSpec.offering.item]:[]])].map(id=>{const r=world.items.find(i=>i.id===id);return{id,name:r?.name,weight:r?.weight};}),location:e.lair?{id:e.lair,name:world.locations.find(l=>l.id===e.lair)?.name}:null,species:e.monster?{id:e.monster,name:world.monsters.find(m=>m.id===e.monster)?.name}:null,
 actualRules:implementationFacts(e)});
function implementationFacts(e){
 if(e.category==='boss')return ['只按originSeed写来历；感觉性巢穴细节允许，不增加追击、移位、阻路能力。','掉落留在尸体，实际取材成功才进背包；原个体不复生，空穴迁入种类以residence.replacementSpecies为准。','眩光弱点只在睁眼且该次干扰尚未消耗时存在；闭眼不能触发。旧伤仅外貌。','反击计数仅计算实际命中；生命不高于一半时，累计每第三次命中反击附加指定强度恐惧一分钟。','适应仅分持械、徒手、火焰法术三类；更换武器、节奏或距离本身不清除同类适应。'];
 const s=e.effectSpec;return {
 timeUnit:'duration/durationLimit/minutes均为分钟，不能把90分钟换成1.5分钟。成功效果期限固定，不随熟练度提前结束。',
 costs:'开始前资格、材料或权限不合会拒绝而不收费；开始后施法检定失败消耗本次mp/materials/minutes，但不产生残缺效果。offering独立于materials，续约成功时才耗供品。',
 targeting:e.targeting?{...e.targeting,rangeMeters:e.rangeMeters,timing:'开始与完成时检查；成功后不因离开施术者射程或视线中断。本人无需额外同意记录。permit有值才需要当地精神许可。'}:'无生命目标射程规则：召唤与契约操作使用本人当前位置/在场契约；刻记使用自有单件物品或3米内获准环境对象，不凭空加精神许可或同意。',
 scope:s.kind==='summon_contract'?'只能读取、续约或解离自己的在场有效役灵；不能因获得同意而操作他人役灵。续约三十分钟且不能突破模板剩余时限，实际完成才耗一份树脂；不补防护、不重置付魔力时间。':s.kind==='summon'?'只在施术者当前位置召唤。水卫须至少两升现有水并在一米内，使用私有水须物主授权；少于两升或离开一米则防护不工作但不自动销毁契约。守卫成形后还须命其防护，才转移额度给本人；额度耗尽不自动消灭守卫。额度=min(power,5+floor(有效熟练度/100))，用尽不恢复；期限、解离或维持失败清除防护。物理防护不防法术类伤害。火投影只照明，均无实体物品或永久宠物。':s.kind==='mark'?'火纹写自有单件木纸金属，暗字写自有单张纸并耗木炭，土印写三米内获准且已松土对象。至多四十字，成功后可检查；失败不产生残字。普通刻记不需要精神许可；暗字仅微光可见。没有已实现的擦洗/翻地清除刻记规则，勿承诺这类反制。':'状态只改变已声明交锋属性，不能改写记忆或替目标作决定。眩光只在睁眼出手时消耗，一分钟内未用消散；幻觉无闭眼/强光免疫，仅下一次出手或一分钟结束，精神抗性可减弱。夜视仅抵消微光交锋命中损失，完全黑暗无效，不揭示未知目标。折光衣只在有光/微光时提高闪避，雨或移动减半，不是隐身。旅灯只抵消一点恐惧强度的命中惩罚，无需实物灯。',
 prose:'不写场外指令、代码术语或未经设计的确定社会反应；熟练只影响成功机会与已给守卫额度，不能改变施法速度、固定时长或产生残缺/部分效果。'};
}
function validateDraft(d,e){
 const errors=[],warnings=[];if(d?.id!==e.id||!d.prose)return{errors:['编号或正文结构错误'],warnings};
 if(Object.keys(d).some(k=>!['id','prose'].includes(k))||Object.keys(d.prose).some(k=>!fields(e).includes(k)))errors.push('未声明字段');
 for(const field of fields(e)){
  const value=d.prose[field];if(['counters','proficiencyEffects'].includes(field)){if(!Array.isArray(value)||value.length!==(field==='counters'?2:4)||value.some(x=>typeof x!=='string'||!x.trim()))errors.push(`${field}结构错误`);}
  else if(typeof value!=='string'||!value.trim())errors.push(`缺少${field}`);
 }
 const text=JSON.stringify(d.prose);if(/候选|引擎|主持人|玩家|骨架|schema|JSON|effectSpec|原语|尚未接入|不宣称|此处不称/.test(text))errors.push('场外信息泄漏');
 for(const word of[...block.names,...block.realPeople])if(text.includes(word))errors.push('原创屏蔽');
 if(e.category==='spell')errors.push(...loreConstraintErrors(d.prose,e));
 if(text.length>2000)warnings.push('正文偏长需抽读');return{errors,warnings};
}
function request(e,feedback,context){
 const props=Object.fromEntries(fields(e).map(k=>[k,['counters','proficiencyEffects'].includes(k)?{type:'array',items:{type:'string'},minItems:k==='counters'?2:4,maxItems:k==='counters'?2:4}:{type:'string'}]));
 return{max_tokens:1900,temperature:.5,tools:[{type:'function',function:{name:'entry',description:'提交当前单条原创说明',parameters:{type:'object',properties:{id:{type:'string',enum:[e.id]},prose:{type:'object',properties:props,required:fields(e),additionalProperties:false}},required:['id','prose'],additionalProperties:false}}}],tool_choice:{type:'function',function:{name:'entry'}},messages:[{role:'system',content:'根据所给单条设计写自然中文，事实与数量以设计和引用事实为准。不增添能力、具名实体、历史事件、惩罚规则或确定的社会反应。不要抄场外指令。法术：theory写原理与用途，casting写具体施法动作，failure只写已给的失败代价，counters两条确实可行限制，socialConsequences写现实使用中的关系边界，proficiencyEffects四条写从初学到熟练的可靠性变化；熟练不能改变固定距离、时间或新创能力，守卫额度仅依给定公式。法术持续大于0时，theory必须明确“最多X分钟”，用duration的实际数值；其他数值无需全重述。每个文字段约40到80字，数组每项15到35字。首领：origin使用originSeed来历，不额外杜撰人物事件；lairDescription写已有栖地巢穴，behavior写已声明的反击、适应与弱点，每段60到110字。世界内口吻，不写候选、引擎、原语、骨架或写作指令。'},{role:'user',content:JSON.stringify({skeleton:e,referenceFacts:context,corrections:feedback})}]};
}
function review(e,d,c){const r=defaultReviewRequest(e,d,c);r.messages[0].content+=' 比较同一条的机制与引用事实。解释性的咒文、动作、外观允许，但不能变成新增材料要求或能力。duration为0是操作即时完成，不意味着召唤续约新增的时长为0。中文与阿拉伯数字的等值单位转换不算矛盾。无需重述全部字段。';return r;}
if(process.argv[2]==='--review-manual'){
 const client=new DeepSeekClient({budgetYuan:20,logFile:'logs/m4-batch2-usage.jsonl'}),ledgerPath=path.join(budgetRoot,'budget.json'),ledger=JSON.parse(await fs.readFile(ledgerPath,'utf8'));client.spent=ledger.spentYuan+(ledger.reservedYuan??0);let saves=Promise.resolve();const save=()=>saves=saves.then(()=>fs.writeFile(ledgerPath,JSON.stringify({spentYuan:client.spent,reservedYuan:client.reserved,limitYuan:20},null,2)+'\n'));let cursor=0;
 await Promise.all(Array.from({length:8},async()=>{for(;;){const i=cursor++;if(i>=entries.length)return;const e=entries[i],p=path.join(root,`${e.id}.json`),r=JSON.parse(await fs.readFile(p,'utf8'));if(!r.manualEditPending)continue;const context=contextFor(e);r.fingerprint=hashContent({entry:e,context,revision});const pending=client.generate(review(e,r.draft,context),`m4-batch2-manual-${e.id}`);pending.catch(()=>{});await save();try{const checked=parseModelJSON(await pending);if(!Array.isArray(checked.contradictions)||checked.contradictions.some(x=>!['hard','soft','style'].includes(x.severity)||!['quote','field','reason'].every(k=>typeof x[k]==='string'&&x[k].trim())))throw Error('审查结构错误');const v=validateDraft(r.draft,e);r.errors=[...v.errors,...checked.contradictions.filter(x=>x.severity==='hard')];r.warnings=[...v.warnings,...checked.contradictions.filter(x=>x.severity!=='hard')];r.review=checked;r.status=r.errors.length?'manual':'passed';r.manualEditPending=false;r.feedback=r.errors.length?r.errors:null;await fs.writeFile(p,JSON.stringify(r,null,2)+'\n');}finally{await save();}}}));
}
if(['--draft','--review-manual'].includes(process.argv[2])){
 const r=await runContentPipeline({entries,root,budgetRoot,revision,contextFor,client:new DeepSeekClient({budgetYuan:20,logFile:'logs/m4-batch2-usage.jsonl'}),buildDraftRequest:request,buildReviewRequest:review,validateDraft,concurrency:8,batchSize:20});console.log(JSON.stringify(r.summary));
}
if(process.argv[2]==='--candidate'){
 const rows=await readApprovedContent(root,entries,{contextFor,revision});if(rows.length!==entries.length)throw Error('候选仍有未通过条目');
 const byId=new Map(rows.map(r=>[r.id,r.prose]));for(const e of entries)if(validateDraft({id:e.id,prose:byId.get(e.id)},e).errors.length)throw Error('候选L1复核失败');
 const merged=entries.map(({category,...e})=>({...e,...byId.get(e.id)}));
 await fs.writeFile(path.join(root,'candidate.json'),JSON.stringify({status:'逐条L1/L2/L4通过；发布候选，未写正式目录',spells:merged.filter(e=>e.id.startsWith('spell_')),bosses:merged.filter(e=>e.id.startsWith('boss_'))},null,2)+'\n');console.log(JSON.stringify({spells:16,bosses:4}));
}
