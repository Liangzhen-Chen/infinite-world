import fs from 'node:fs/promises';
import path from 'node:path';
import factions,{factionPeople} from '../world/design/w5-factions.mjs';
import history,{eras} from '../world/design/w5-history.mjs';
import {loadWorld} from './load-world.mjs';
import {DeepSeekClient} from './deepseek-client.mjs';
import {runContentPipeline,readApprovedContent,defaultReviewRequest,parseModelJSON} from './content-pipeline.mjs';
import {bigramSimilarity} from './w5-validation.mjs';
import Ajv from 'ajv';
import candidateSchema from './w5-social-schema.mjs';
export const revision='w5-social-v1';
export const budgetRoot=path.resolve(import.meta.dirname,'../world/drafts/w5');
export const categories={factions,history};
export function readChineseInteger(value){
 if(/^\d+$/.test(value))return Number(value);
 const digits={零:0,〇:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};
 if(!/[十百千]/.test(value))return Number([...value].map(c=>digits[c]).join(''));
 let total=0,current=0;for(const c of value){if(c in digits)current=digits[c];else{total+=(current||1)*({十:10,百:100,千:1000}[c]??0);current=0;}}return total+current;
}
const world=await loadWorld();
const blocked=JSON.parse(await fs.readFile(new URL('../world/meta/blocklist.json',import.meta.url),'utf8'));
const catalog=new Map([...Object.values(world).filter(Array.isArray).flat(),...factions,...factionPeople].filter(row=>row?.id).map(row=>[row.id,row]));
export const contextFor=entry=>entry.references.map(id=>{
 const row=catalog.get(id);if(!row)throw new Error(`W5悬空引用 ${entry.id} -> ${id}`);
 return {id,name:row.name,category:row.category??null,region:row.region??null,location:row.location??null,age:row.age??null,
  publicGoal:row.publicGoal??null,privateGoal:row.privateGoal??null,contactMode:row.contactMode??null,facts:row.facts??null};
});
export function buildDraftRequest(entry,feedback,context){
 const properties=Object.fromEntries(entry.proseFields.map(field=>[field,{type:'string',description:'80至160个汉字，按骨架写具体自然段，不复述内部编号'}]));
 return {max_tokens:1800,temperature:0.65,tools:[{type:'function',function:{name:'submit_entry',description:'提交这一条设定说明，不含其他实体',parameters:{type:'object',properties:{id:{type:'string',enum:[entry.id]},prose:{type:'object',properties,required:entry.proseFields,additionalProperties:false}},required:['id','prose'],additionalProperties:false}}}],tool_choice:{type:'function',function:{name:'submit_entry'}},messages:[
  {role:'system',content:'只起草一条原创中世纪中文世界设定。骨架的日期、数字、归属、能力、权限和引用是硬事实，不添加新的法律、处罚、金钱、军力、库存、施法效果、奖励或新的具名实体。不要用主持人、玩家、工具、引擎、M5等场外措辞。组织的公开目标和私下打算要分清，不把秘密写成街上人人知道。接触锚点只是寄信询问地点，不是远方总部，不许让负责人因此到场。时钟写成尚未实现的筹划，不宣称已经有结果。历史的trueAccount写已核事实；receivedAccount明确写“流传说法”并指出其中错误，不能让假说变成真实；presentTrace说明当下在哪里可核实，不能让古代参与者活到现在。参考组织是今天保留痕迹者，不是自动当年的参与者。避免每条同样的开场、三段对称和“记录公开一切就解决”的单一解法。自然细节仅限已有材料、营生与感官。'},
  {role:'user',content:JSON.stringify({skeleton:entry,referenceFacts:context,corrections:feedback})},
 ]};
}
export function validateDraft(draft,entry){
 const errors=[],warnings=[];
 if(draft?.id!==entry.id)errors.push('编号不符');
 if(!draft?.prose||typeof draft.prose!=='object')return {errors:[...errors,'说明结构缺失'],warnings};
 if(Object.keys(draft).some(key=>!['id','prose'].includes(key))||Object.keys(draft.prose).some(key=>!entry.proseFields.includes(key)))errors.push('出现骨架未声明的字段');
 for(const field of entry.proseFields){const text=draft.prose[field];if(typeof text!=='string'||!text.trim())errors.push(`缺少${field}`);else if(text.length<45||text.length>300)warnings.push(`${field}字数需抽读`);}
 const text=JSON.stringify(draft.prose);
 for(const word of [...blocked.names,...blocked.realPeople])if(text.includes(word))errors.push(`原创屏蔽:${word}`);
 if(/主持人|玩家不能|不要让|引擎|M5|未接入|工具调用|faction_|npc_|history_/.test(text))errors.push('泄漏场外规则或编号');
 if(entry.category==='history'&&/私下.{0,8}(打算|希望|想|目标|则)/.test(text))errors.push('公开历史混入组织私下目标');
 // Prose does not need to repeat quantities. All Arabic quantities must come
 // from this entry's numeric mechanics; unstated durations cannot be added.
 const allowed=new Set(JSON.stringify(entry).match(/\d+/g)??[]);
 for(const value of text.match(/\d+/g)??[])if(!allowed.has(value))errors.push(`未经设计的数字:${value}`);
 if(entry.category==='history')for(const match of text.matchAll(/春历前([0-9〇零一二三四五六七八九十百千两]+)年/g))if(readChineseInteger(match[1])!==-entry.year)errors.push(`叙述纪年与骨架不符:${match[0]}`);
 return {errors,warnings};
}
export function buildReviewRequest(entry,draft,context){
 const request=defaultReviewRequest(entry,draft,context);
 request.messages[0].content+=' 势力新增执法处分、入籍资格、强制收费、远方负责人即时在锚点到场属于hard。不得把计划写成已实现。历史的传说段只要明确被标为误传且错误点与骨架一致，就不要把它误判成正文真实断言。现存组织是今天保存制度痕迹者，不必在古代事件时已存在。感官或修辞可容许，但不能新增可获取的能力或财物。';return request;
}
export function validateSkeletons(){
 const errors=[];const ids=new Set([...catalog.keys(),...history.map(r=>r.id)]);
 const names=new Set();
 for(const row of [...factions,...history,...factionPeople]){
  if(names.has(row.name))errors.push(`重名:${row.name}`);names.add(row.name);
  for(const word of [...blocked.names,...blocked.realPeople])if(row.name.includes(word))errors.push(`屏蔽:${row.id}/${word}`);
  for(const ref of row.references??[])if(!ids.has(ref))errors.push(`引用不存在:${row.id}/${ref}`);
 }
 for(const row of factions){
  if(!Number.isInteger(row.resources.treasuryCopper)||row.resources.treasuryCopper<0||row.resources.memberCount<row.coreMembers.length+1)errors.push(`势力资源不合法:${row.id}`);
  if(!factionPeople.some(r=>r.id===row.leader&&r.faction===row.id))errors.push(`首领未登记:${row.id}`);
  for(const member of row.coreMembers)if(!factionPeople.some(r=>r.id===member&&r.faction===row.id))errors.push(`核心成员未登记:${row.id}`);
  if(row.clock.probability<=0||row.clock.probability>1||row.clock.stageEffects.length<3||!row.clock.counterplay)errors.push(`时钟不完整:${row.id}`);
  for(const relation of row.relations)if(!factions.some(peer=>peer.id===relation.faction)||relation.score < -100||relation.score>100||!relation.reason)errors.push(`势力关系不合法:${row.id}`);
 }
 const years=history.map(r=>r.year);
 if(history.length<80||Math.max(...years)-Math.min(...years)<3000)errors.push('历史数量或时间跨度不足');
 for(const row of history){
  const era=eras.find(r=>r.id===row.era);if(!Number.isInteger(row.year)||row.year>=0||!era||row.year<era.start||row.year>era.end)errors.push(`历史纪年不合法:${row.id}`);
  if(!ids.has(row.presentTrace.entity)||!row.accounts.received.falseClaim||!row.accounts.received.correction)errors.push(`历史缺少可核遗留或传说边界:${row.id}`);
  if(row.participants.some(p=>p.id.startsWith('npc_')))errors.push(`古代参与者不能自动指向当代NPC:${row.id}`);
 }
 return errors;
}
export function materialize(entry,draft){const {proseFields,...source}=entry;return {...source,prose:draft.prose,description:Object.values(draft.prose).join('\n'),...(entry.category==='faction'?{publicDescription:`${entry.name}活动于${entry.region}，公开目标是${entry.publicGoal}。行事方式：${entry.method}。可提供${entry.offers}；${entry.demands}。`,descriptionVisibility:'gm_private'}:{})};}
async function reviewManual(){
 const ledger=JSON.parse(await fs.readFile(path.join(budgetRoot,'budget.json'),'utf8'));
 const client=new DeepSeekClient({budgetYuan:20,logFile:'logs/w5-social-usage.jsonl'});client.spent=ledger.spentYuan+(ledger.reservedYuan??0);
 const targets=[];
 for(const [key,entries]of Object.entries(categories))for(const entry of entries){const file=path.join(budgetRoot,key,`${entry.id}.json`);const record=JSON.parse(await fs.readFile(file,'utf8'));if(record.manualEditPending)targets.push({file,entry,record});}
 let cursor=0,writes=Promise.resolve();
 const saveBudget=()=>{writes=writes.then(()=>fs.writeFile(path.join(budgetRoot,'budget.json'),JSON.stringify({spentYuan:client.spent,reservedYuan:client.reserved,limitYuan:20},null,2)+'\n'));return writes;};
 await Promise.all(Array.from({length:Math.min(10,targets.length)},async()=>{while(cursor<targets.length){const {file,entry,record}=targets[cursor++];
  const pending=client.generate(buildReviewRequest(entry,record.draft,contextFor(entry)),`w5-social-manual-${entry.id}`);pending.catch(()=>{});await saveBudget();
  try{const review=parseModelJSON(await pending);if(!Array.isArray(review.contradictions)||review.contradictions.some(r=>!['hard','soft','style'].includes(r.severity)||!['quote','field','reason'].every(k=>typeof r[k]==='string'&&r[k].trim())))throw new Error('事实审查格式错误');
   const check=validateDraft(record.draft,entry);record.review=review;record.errors=[...check.errors,...review.contradictions.filter(r=>r.severity==='hard')];record.warnings=[...check.warnings,...review.contradictions.filter(r=>r.severity!=='hard')];record.status=record.errors.length?'manual':'passed';record.manualEditPending=false;await fs.writeFile(file,JSON.stringify(record,null,2)+'\n');
  }finally{await saveBudget();}
 }}));
 await run(Object.keys(categories));
}
async function run(selected){
 const errors=validateSkeletons();if(errors.length)throw new Error(errors.join('\n'));
 const client=new DeepSeekClient({budgetYuan:20,logFile:'logs/w5-social-usage.jsonl'});
 for(const key of selected){const result=await runContentPipeline({entries:categories[key],root:path.join(budgetRoot,key),budgetRoot,client,buildDraftRequest,buildReviewRequest,validateDraft,contextFor,revision,concurrency:12,batchSize:40});console.log(JSON.stringify({category:key,...result.summary}));}
}
async function candidates(){
 const out={factionPeople,eras};
 for(const [key,entries]of Object.entries(categories)){
  const drafts=await readApprovedContent(path.join(budgetRoot,key),entries,{contextFor,revision});
  const byId=new Map(drafts.map(row=>[row.id,row]));out[key]=entries.filter(row=>byId.has(row.id)).map(row=>{const draft=byId.get(row.id),check=validateDraft(draft,row);if(check.errors.length)throw new Error(`候选L1失败:${row.id}/${check.errors.join('；')}`);return materialize(row,draft);});
  if(out[key].length!==entries.length)throw new Error(`候选未齐:${key}`);
  for(let i=0;i<out[key].length;i++)for(let j=i+1;j<out[key].length;j++)if(bigramSimilarity(out[key][i].description,out[key][j].description)>=0.35)throw new Error(`候选相似度>=0.35:${out[key][i].id}/${out[key][j].id}`);
 }
 const validate=new Ajv({allErrors:true,strict:true,allowUnionTypes:true}).compile(candidateSchema);
 if(!validate(out))throw new Error(`W5候选schema拒绝:${JSON.stringify(validate.errors)}`);
 await fs.writeFile(path.join(budgetRoot,'social-candidate.json'),JSON.stringify(out,null,2)+'\n');
 console.log(JSON.stringify({factions:out.factions.length,history:out.history.length,factionPeople:out.factionPeople.length,scope:'仅候选，未发布未实例化'}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===import.meta.filename){
 const mode=process.argv[2];
 if(mode==='--check'){const errors=validateSkeletons();if(errors.length)throw new Error(errors.join('\n'));console.log('W5社会骨架引用与年代检查通过');}
 else if(mode==='--draft')await run(process.argv[3]?[process.argv[3]]:['factions','history']);
 else if(mode==='--candidate')await candidates();
 else if(mode==='--review-manual')await reviewManual();
 else throw new Error('用法: w5-social.mjs --check|--draft [factions|history]|--candidate');
}
