import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import festivals,{festivalCalendar} from '../world/design/w5-festivals.mjs';
import {loadWorld} from './load-world.mjs';
import {DeepSeekClient} from './deepseek-client.mjs';
import {runContentPipeline,readApprovedContent,defaultReviewRequest,parseModelJSON} from './content-pipeline.mjs';
import {bigramSimilarity} from './w5-validation.mjs';
export const revision='w5-festivals-v1';
export const budgetRoot=path.resolve(import.meta.dirname,'../world/drafts/w5');
export const root=path.join(budgetRoot,'festivals');
const world=await loadWorld();
const catalog=new Map(Object.values(world).filter(Array.isArray).flat().filter(x=>x?.id).map(x=>[x.id,x]));
const blocklist=JSON.parse(await fs.readFile(new URL('../world/meta/blocklist.json',import.meta.url),'utf8'));
export const contextFor=entry=>entry.references.map(id=>{const r=catalog.get(id);if(!r)throw new Error(`悬空引用:${id}`);return {id,name:r.name,facts:r.facts,ritual:r.ritual,taboo:r.taboo,miracle:r.miracle,publicGoal:r.publicGoal,purpose:r.purpose,description:r.category==='item'?r.description:undefined};});
export function validateSkeletons(entries=festivals){
 const errors=[],ids=new Set(),names=new Set();
 for(const r of entries){
  if(ids.has(r.id)||names.has(r.name))errors.push('节日重名或重复编号');ids.add(r.id);names.add(r.name);
  const c=r.calendar;if(c.epoch!=='春历'||!Number.isInteger(c.month)||c.month<1||c.month>12||!Number.isInteger(c.day)||c.day<1||c.day>30||c.durationDays!==1||c.marketDay!==festivalCalendar.marketDays.includes(c.day)||c.rule!=='annual_nomination_with_conditions')errors.push(`${r.id}:历法错误`);
  if(!catalog.has(r.culture)||!catalog.has(r.deity)||!catalog.has(r.organizer)||r.references.some(id=>!catalog.has(id)))errors.push(`${r.id}:引用不存在`);
  if(r.venue.location!==null&&!world.locations.some(x=>x.id===r.venue.location))errors.push(`${r.id}:场地不存在`);
  if(r.venue.precision!==(r.venue.location?'existing_location':'regional_unmapped'))errors.push(`${r.id}:地点精度不一致`);
  if(!Number.isInteger(r.participation.minutes)||r.participation.minutes<=0||r.participation.admissionCopper!==0)errors.push(`${r.id}:未设计的收费或时长`);
  if(!r.resourceNeeds.length||r.resourceNeeds.some(x=>!world.items.some(i=>i.id===x.item)||!Number.isInteger(x.quantity)||x.quantity<1||!['consume','borrow','transfer'].includes(x.use)||!x.source))errors.push(`${r.id}:材料或所有权错误`);
  if(r.runtime.status!=='design_only'||r.runtime.scheduler!=='pending_M5'||r.runtime.effects.length)errors.push(`${r.id}:未接入效果不得生效`);
  for(const k of ['condition','custom','socialOpportunity','possibleConflict','permission'])if(typeof r[k]!=='string'||!r[k].trim())errors.push(`${r.id}:缺少${k}`);
  for(const term of [...blocklist.names,...blocklist.realPeople])if(JSON.stringify(r).includes(term))errors.push(`${r.id}:原创屏蔽词`);
 }
 return errors;
}
export function buildDraftRequest(entry,feedback,context){
 const {runtime,...proseSkeleton}=entry;
 const properties=Object.fromEntries(entry.proseFields.map(k=>[k,{type:'string',description:'60至140汉字自然段'}]));
 return {max_tokens:1600,temperature:0.65,tools:[{type:'function',function:{name:'submit_entry',description:'提交单个节日说明',parameters:{type:'object',additionalProperties:false,required:['id','prose'],properties:{id:{type:'string',enum:[entry.id]},prose:{type:'object',additionalProperties:false,properties,required:entry.proseFields}}}}}],tool_choice:{type:'function',function:{name:'submit_entry'}},messages:[
  {role:'system',content:'写一条原创中世纪节日。骨架决定日期、地点、费用、时长、材料、权限，不得新增具名人物、组织、力量、处罚、奖励。customScene写习俗的感官过程，participationScene写自愿参与和实物需求，tensionScene写可能冲突与权限边界。所有活动用习惯、条件或可能表述，不能说当下已经举办或已经扣款生效。日期是有条件的年度候选日，不保证天候、修渠、成活或许可；不要把首场雨后的习惯改成日期固定自动换罐。远方地点未定位，不虚构在白石或河湾、也不让远方负责人到场。不复述场外词语、编号、引擎、M5、候选。无需重述数值或月份，写明材料自备和当事人同意；神祇存在不代表节日自动发生神迹。保持各节日自身工艺与生活差异，避免每条三句同样句式。'},
  {role:'user',content:JSON.stringify({skeleton:proseSkeleton,referenceFacts:context,corrections:feedback})}
 ]};
}
export function validateDraft(draft,entry){
 const errors=[],warnings=[];
 if(draft?.id!==entry.id||!draft.prose||typeof draft.prose!=='object')return {errors:['编号或说明结构错误'],warnings};
 if(Object.keys(draft).some(k=>!['id','prose'].includes(k))||Object.keys(draft.prose).some(k=>!entry.proseFields.includes(k)))errors.push('未知字段');
 for(const k of entry.proseFields){const text=draft.prose[k];if(typeof text!=='string'||!text.trim())errors.push(`缺少${k}`);else if(text.length<45||text.length>260)warnings.push(`${k}长度需抽读`);}
 const text=Object.values(draft.prose).join('\n');
 if(/引擎|M5|工具调用|festival_|faction_|item_|玩家|未接入|候选|远方地点.{0,4}未定位|迁移人|发放资源|不代表.{0,8}库存/.test(text))errors.push('场外信息泄漏');
 for(const word of [...blocklist.names,...blocklist.realPeople])if(text.includes(word))errors.push(`原创屏蔽:${word}`);
 const allowed=new Set(JSON.stringify(entry).match(/\d+/g)??[]);for(const n of text.match(/\d+/g)??[])if(!allowed.has(n))errors.push(`未经设计的数字:${n}`);
 // Numeric dates and quantities must match their own fields, not just any number.
 for(const m of text.matchAll(/(\d+)月(\d+)[日号]/g))if(+m[1]!==entry.calendar.month||+m[2]!==entry.calendar.day)errors.push('日期与骨架不符');
 for(const m of text.matchAll(/(\d+)\s*分钟/g))if(+m[1]!==entry.participation.minutes)errors.push('时长与骨架不符');
 for(const m of text.matchAll(/(?:入场|门票|旁听)[^。；]{0,8}?(\d+)\s*铜/g))if(+m[1]!==entry.participation.admissionCopper)errors.push('入场费与骨架不符');
 const cn=value=>{value=value.replace('首','一').replace('廿','二十').replace('卅','三十');if(/^\d+$/.test(value))return Number(value);const d={零:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};let total=0,n=0;for(const c of value){if(c in d)n=d[c];else{total+=(n||1)*({十:10,百:100}[c]??0);n=0;}}return total+n;};
 for(const m of text.matchAll(/(?:第)?([首一二三四五六七八九十]+)月(?:第|初)?([一二三四五六七八九十廿卅]+)(?:日|前后|若)/g))if(cn(m[1])!==entry.calendar.month||cn(m[2])!==entry.calendar.day)errors.push('中文日期与骨架不符');
 for(const m of text.matchAll(/([零一二两三四五六七八九十百]+)分钟/g))if(cn(m[1])!==entry.participation.minutes)errors.push('中文时长与骨架不符');
 for(const m of text.matchAll(/(?:入场|门票|旁听)[^。；]{0,5}?([零一二两三四五六七八九十百]+)铜/g))if(cn(m[1])!==entry.participation.admissionCopper)errors.push('中文入场费与骨架不符');
 for(const monthName of festivalCalendar.months)if(text.includes(monthName)&&monthName!==festivalCalendar.months[entry.calendar.month-1])errors.push('月份与骨架不符');
 return {errors,warnings};
}
export function buildReviewRequest(entry,draft,context){const r=defaultReviewRequest(entry,draft,context);r.messages[0].content+=' 特别核对节日不是已经发生的世界事件；日期不能替代天候、验收、场地同意。材料来自自愿参加者，不是免费系统奖励。入场免费不代表物资、住宿、复活登记、交易、专业服务免费。组织只能管理获准场所，无新增立法、强制罚款或征用权。数字和中文时段、件数逐项比对。宗教节日不自动赋予神迹，私人档案不因节日公开。regional_unmapped地点不得被编成已知村镇。';return r;}
export function materialize(entry,draft){const {proseFields,...skeleton}=entry;return {...skeleton,prose:draft.prose,description:Object.values(draft.prose).join('\n')};}
export function validateCandidate(candidate){
 const errors=[];
 if(!candidate||Object.keys(candidate).sort().join(',')!=='calendar,festivals'||!Array.isArray(candidate.festivals)||candidate.festivals.length!==24)return ['候选结构或数量错误'];
 try{assert.deepEqual(candidate.calendar,festivalCalendar);}catch{errors.push('候选历法被改写');}
 errors.push(...validateSkeletons(candidate.festivals));
 for(let i=0;i<festivals.length;i++){const row=candidate.festivals[i],entry=festivals[i];if(!row){errors.push('缺条目');continue;}const draft={id:row.id,prose:row.prose};errors.push(...validateDraft(draft,entry).errors);try{assert.deepEqual(row,materialize(entry,draft));}catch{errors.push(`${entry.id}:候选有未经设计的字段或改写`);}}
 for(let i=0;i<candidate.festivals.length;i++)for(let j=i+1;j<candidate.festivals.length;j++)if(bigramSimilarity(candidate.festivals[i].description??'',candidate.festivals[j].description??'')>=0.35)errors.push('说明相似度达到0.35');
 return errors;
}
async function draft(){const errors=validateSkeletons();if(errors.length)throw new Error(errors.join('\n'));const result=await runContentPipeline({entries:festivals,root,budgetRoot,client:new DeepSeekClient({budgetYuan:20,logFile:'logs/w5-festivals-usage.jsonl'}),buildDraftRequest,buildReviewRequest,validateDraft,contextFor,revision,concurrency:12,batchSize:24});console.log(JSON.stringify(result.summary));}
async function reviewManual(){
 const ledger=JSON.parse(await fs.readFile(path.join(budgetRoot,'budget.json'),'utf8'));const client=new DeepSeekClient({budgetYuan:20,logFile:'logs/w5-festivals-usage.jsonl'});client.spent=ledger.spentYuan+(ledger.reservedYuan??0);
 const tasks=[];for(const entry of festivals){const file=path.join(root,`${entry.id}.json`),record=JSON.parse(await fs.readFile(file,'utf8'));if(record.manualEditPending)tasks.push({entry,file,record});}
 let cursor=0,writes=Promise.resolve();const save=()=>{writes=writes.then(()=>fs.writeFile(path.join(budgetRoot,'budget.json'),JSON.stringify({spentYuan:client.spent,reservedYuan:client.reserved,limitYuan:20},null,2)+'\n'));return writes;};
 await Promise.all(Array.from({length:Math.min(12,tasks.length)},async()=>{while(cursor<tasks.length){const {entry,file,record}=tasks[cursor++];const pending=client.generate(buildReviewRequest(entry,record.draft,contextFor(entry)),`festival-manual-${entry.id}`);pending.catch(()=>{});await save();try{const review=parseModelJSON(await pending);if(!Array.isArray(review.contradictions)||review.contradictions.some(x=>!['hard','soft','style'].includes(x.severity)||!['quote','field','reason'].every(k=>typeof x[k]==='string'&&x[k].trim())))throw new Error('事实审查格式无效');const check=validateDraft(record.draft,entry);record.review=review;record.errors=[...check.errors,...review.contradictions.filter(x=>x.severity==='hard')];record.warnings=[...check.warnings,...review.contradictions.filter(x=>x.severity!=='hard')];record.status=record.errors.length?'manual':'passed';record.manualEditPending=false;await fs.writeFile(file,JSON.stringify(record,null,2)+'\n');}finally{await save();}}}));await draft();
}
export async function candidate(){const drafts=await readApprovedContent(root,festivals,{contextFor,revision});const byId=new Map(drafts.map(x=>[x.id,x]));const output={calendar:festivalCalendar,festivals:festivals.map(e=>materialize(e,byId.get(e.id)))};const errors=validateCandidate(output);if(errors.length)throw new Error(errors.join('\n'));return output;}
if(process.argv[1]&&path.resolve(process.argv[1])===import.meta.filename){
 const mode=process.argv[2];if(mode==='--draft')await draft();else if(mode==='--review-manual')await reviewManual();else if(mode==='--check'){const errors=validateSkeletons();if(errors.length)throw new Error(errors.join('\n'));console.log('24节日骨架检查通过');}else if(mode==='--candidate'){const out=await candidate();await fs.writeFile(path.join(budgetRoot,'festivals-candidate.json'),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({festivals:out.festivals.length,status:'候选审核完成，未接入调度'}));}else throw new Error('使用 --draft|--review-manual|--check|--candidate');
}
