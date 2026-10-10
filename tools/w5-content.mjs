import fs from 'node:fs/promises';
import path from 'node:path';
import seeds from '../world/design/w5-cultures.mjs';
import {DeepSeekClient} from './deepseek-client.mjs';
import {runContentPipeline,readApprovedContent,defaultReviewRequest,parseModelJSON} from './content-pipeline.mjs';
export const revision='w5-culture-deity-v1';
export const root=path.resolve(import.meta.dirname,'../world/drafts/w5');
const blocked=JSON.parse(await fs.readFile(new URL('../world/meta/blocklist.json',import.meta.url),'utf8'));
const places=JSON.parse(await fs.readFile(new URL('../world/geo/locations.json',import.meta.url),'utf8'));
const people=JSON.parse(await fs.readFile(new URL('../world/people/baseline.json',import.meta.url),'utf8'));
const all=new Map([...seeds,...places,...people].map(row=>[row.id,row]));
export const contextFor=entry=>entry.references.map(id=>{const row=all.get(id);if(!row)throw new Error(`引用不存在 ${id}`);return {id,name:row.name,category:row.category??(id.startsWith('npc_')?'npc':'location'),facts:row.facts??null,domain:row.domains??null};});
export function buildDraftRequest(entry,feedback,context){return {
 temperature:0.7,max_tokens:2800,response_format:{type:'json_object'},
 messages:[{role:'system',content:'为原创中文中世纪魔法世界写一条设定说明。所有逻辑、数值和引用以骨架为准，不发明新能力、神迹效果、组织权力或地名人名。使用可观察生活细节，避免保证句、主持人口吻与泛泛赞美。输出JSON {"id":"原编号","prose":{指定字段:文字或谚语数组}}，不要重写骨架。文化proverbs字段必须是10条原创短谚语，其他字段为80至200字自然段；神祇每字段80至160字。不要补写骨架未给的价格、重量、时间数值。仪式不保证施术成功；神祇真实存在但神迹只能完成指定效果。文化的witness只是了解该文化的已知人物，不是其创始人或族属证明。中文自然克制，各条谚语要从该文化的实际营生出发，不能仅换名套同句。'},
 {role:'user',content:JSON.stringify({skeleton:entry,referenceFacts:context,fields:entry.proseFields,corrections:feedback})}],
};}
export function validateDraft(draft,entry){
 const errors=[],warnings=[];
 if(draft?.id!==entry.id)errors.push('编号与骨架不符');
 if(!draft?.prose||typeof draft.prose!=='object')return {errors:[...errors,'缺少prose'],warnings};
 if(Object.keys(draft).some(key=>!['id','prose'].includes(key)))errors.push('返回了未声明的顶层字段');
 if(Object.keys(draft.prose).some(key=>!entry.proseFields.includes(key)))errors.push('返回了未声明的说明字段');
 for(const field of entry.proseFields){const value=draft.prose[field];
  if(field==='proverbs'){if(!Array.isArray(value)||value.length<10||value.some(v=>typeof v!=='string'||v.trim().length<4)||new Set(value).size!==value.length)errors.push('谚语须至少10条不同的原创句');}
  else if(typeof value!=='string'||!value.trim())errors.push(`说明缺少${field}`);
  else if(value.length<50||value.length>400)warnings.push(`${field}长度需抽读`);
 }
 const text=JSON.stringify(draft.prose);
 for(const word of [...blocked.names,...blocked.realPeople])if(text.includes(word))errors.push(`命中原创屏蔽表:${word}`);
 if(/主持人|玩家不能|不要让|系统提示|工具调用/.test(text))warnings.push('设定文字出现规则口吻，抽读确认');
 if(/\d+\s*(铜|银|金|小时|分钟|天|日|年|斤|公斤|米|里|份|次)/.test(text))errors.push('说明新增未经骨架给出的数量');
 return {errors,warnings};
}
async function reviewManual(){
 const ledger=JSON.parse(await fs.readFile(path.join(root,'budget.json'),'utf8'));
 const client=new DeepSeekClient({budgetYuan:20,logFile:'logs/w5-usage.jsonl'});client.spent=ledger.spentYuan;
 const targets=[];
 for(const entry of seeds){const record=JSON.parse(await fs.readFile(path.join(root,`${entry.id}.json`),'utf8'));if(record.manualEditPending)targets.push({entry,record});}
 let cursor=0;
 await Promise.all(Array.from({length:Math.min(10,targets.length)},async()=>{while(cursor<targets.length){
  const {entry,record}=targets[cursor++],validation=validateDraft(record.draft,entry);
  const request=defaultReviewRequest(entry,record.draft,contextFor(entry));
  request.messages[0].content+=' 未声明的执法处分、入籍资格、强制缴费、医疗用途、扩大神迹能力均属hard，不可记soft。文化与接触锚点的地理区域不等同，不得把远方文化全部安排在锚点。';
  try{record.review=parseModelJSON(await client.generate(request,`w5-manual-review-${entry.id}`));
   if(!Array.isArray(record.review?.contradictions)||record.review.contradictions.some(r=>!['hard','soft','style'].includes(r.severity)||!['quote','field','reason'].every(k=>typeof r[k]==='string'&&r[k].trim())))throw new Error('人工修正事实审查格式无效');
   record.errors=[...validation.errors,...record.review.contradictions.filter(r=>r.severity==='hard')];
   record.warnings=[...validation.warnings,...record.review.contradictions.filter(r=>r.severity!=='hard')];
   record.status=record.errors.length?'manual':'passed';record.manualEditPending=false;
   await fs.writeFile(path.join(root,`${entry.id}.json`),JSON.stringify(record,null,2)+'\n');
  }catch(error){console.error(`${entry.id}: ${error.message}`);}
 }}));
 await fs.writeFile(path.join(root,'budget.json'),JSON.stringify({spentYuan:client.spent,limitYuan:20},null,2)+'\n');
 await draft(); // Reuses the unchanged hashes; refreshes batches without another generation.
}
export function materialize(entry,draft){
 const {proseFields,...skeleton}=entry;
 return {...skeleton,prose:draft.prose,description:Object.values(draft.prose).map(v=>Array.isArray(v)?v.join('；'):v).join('\n')};
}
async function draft(){
 const client=new DeepSeekClient({budgetYuan:20,logFile:'logs/w5-usage.jsonl'});
 const result=await runContentPipeline({entries:seeds,root,client,buildDraftRequest,validateDraft,contextFor,revision,concurrency:10,batchSize:25});
 console.log(JSON.stringify(result.summary));
}
async function publish(){
 const approved=await readApprovedContent(root,seeds,{contextFor,revision});
 const drafts=new Map(approved.map(row=>[row.id,row]));
 // References between deities form a closed group; never publish a dangling half-group.
 const rows=seeds.filter(row=>drafts.has(row.id)).map(row=>materialize(row,drafts.get(row.id)));
 const ids=new Set([...rows,...places,...people].map(row=>row.id));
 for(const row of rows)for(const ref of row.references)if(!ids.has(ref))throw new Error(`批准内容引用尚未批准 ${row.id} -> ${ref}`);
 await fs.mkdir(new URL('../world/lore',import.meta.url),{recursive:true});
 for(const [category,file]of [['culture','cultures'],['deity','deities']])await fs.writeFile(new URL(`../world/lore/${file}.json`,import.meta.url),JSON.stringify(rows.filter(row=>row.category===category),null,2)+'\n');
 console.log(`W5已发布文化 ${rows.filter(r=>r.category==='culture').length}、神祇 ${rows.filter(r=>r.category==='deity').length}`);
}
if(process.argv[1]&&path.resolve(process.argv[1])===import.meta.filename){
 if(process.argv[2]==='--draft')await draft();
 else if(process.argv[2]==='--review-manual')await reviewManual();
 else if(process.argv[2]==='--publish')await publish();
 else throw new Error('用法: node tools/w5-content.mjs --draft|--publish');
}
