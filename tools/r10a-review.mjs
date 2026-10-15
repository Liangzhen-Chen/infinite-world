// R10A: chapter-10 review and publication of the U13 notable/promotion rules and
// the U15 mining, ore and illegal-mining rules. Same toolchain as M4b
// (DeepSeekClient + parseModelJSON, persisted raw responses, budget ledger).
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomInt} from 'node:crypto';
import {DeepSeekClient} from './deepseek-client.mjs';
import {parseModelJSON,hashContent} from './content-pipeline.mjs';

const DRAFTS='world/drafts/r10a';
const io=root=>({
 read:async(p,fallback)=>{try{return JSON.parse(await fs.readFile(path.join(root,p),'utf8'));}catch(error){if(fallback!==undefined&&error.code==='ENOENT')return fallback;throw error;}},
 write:(p,v)=>fs.writeFile(path.join(root,p),JSON.stringify(v,null,2)+'\n'),
});
const textOf=value=>typeof value==='string'?value:JSON.stringify(value);
// Numbers the prose must state exactly as the structured rule does.
const NUMBER_CHECKS={
 u13_notables:v=>[v.minFame,v.removal.minFame,v.registry.decisionDays,v.registry.reviewEveryDays,v.rights.culturalQuotaD],
 u13_promotion:v=>{const r=v.steps[0].requires,o=v.steps[0].effects.offices.office_village_head;return[r.population,r.housing,r.industries,r.facilities,r.caseWindowDays,r.maxCases,v.approver.decisionDays,v.checkEveryDays,o.monthlyBudgetCopper];},
 u15_mining:v=>[v.minutes/60===1?'一小时':v.minutes,v.difficulty,v.terrain[0].minerals[0].reserve,v.terrain[0].minerals[0].recoveryDays,v.terrain[1].minerals[0].reserve,v.terrain[1].minerals[0].recoveryDays,v.locations.site_ms_ll_adit[0].reserve],
};
const CN={1:'一',2:'两'};
export function l1Entries(entries,{world,blocklist}){
 const errors=[];
 for(const e of entries){
  if(!e.id||!Array.isArray(e.target)||e.value===undefined){errors.push(`${e.id}:结构缺失`);continue;}
  const text=textOf(e.value);
  for(const word of [...blocklist.names??[],...blocklist.realPeople??[]])if(text.includes(word))errors.push(`${e.id}:命中原创屏蔽词 ${word}`);
  const prose=typeof e.value==='string'?e.value:[e.value.text,e.value.jurisdiction,e.value.description,e.value.use,...Object.values(e.value.offenses??{}).map(o=>o.text)].filter(Boolean).join('');
  if(!prose)errors.push(`${e.id}:缺少规则正文`);
  for(const n of NUMBER_CHECKS[e.id]?.(e.value)??[])if(!prose.includes(String(n)))errors.push(`${e.id}:正文未写出结构数值 ${n}`);
  if(e.kind==='custom'){
   const rule=e.value.offenses?.illegal_mining;
   if(!Number.isSafeInteger(rule?.standing)||rule.standing>=0||rule.standing<-30)errors.push(`${e.id}:立场变化须为-30到-1的整数`);
   else if(!rule.text.includes(String(-rule.standing)))errors.push(`${e.id}:正文未写出立场变化 ${-rule.standing}`);
   const fid=e.target[4];if(e.target[3]==='factions'&&!world.factions.some(f=>f.id===fid&&f.kind==='聚居地议事'))errors.push(`${e.id}:势力不是聚居地议事`);
  }
  if(e.kind==='item'&&(e.value.id!==e.target[1]||!world.locations.some(l=>l.id===e.value.origin)))errors.push(`${e.id}:物品ID或产地无效`);
 }
 const mining=entries.find(e=>e.id==='u15_mining')?.value;
 if(mining)for(const [loc,rows]of Object.entries(mining.locations??{}))for(const r of rows)if(r.owner&&!world.npcs.some(n=>n.id===r.owner))errors.push(`u15_mining:矿主不存在 ${r.owner}`);
 return{passed:!errors.length,entries:entries.length,errors};
}

const SYSTEM='你是原创游戏规则事实审查员。只核对本条规则正文与同条结构化字段、所附背景是否矛盾，不扩充设定，不要求重述全部字段。正文与结构数值不一致、把结构没有的效果写成规则、或与背景归属相反，记为硬事实；措辞含糊记软问题。核对一致的句子不输出。返回 JSON {"contradictions":[{"quote":"...","field":"...","severity":"硬事实|软问题|文风","reason":"..."}]}。';
export async function reviewR10A({root=DRAFTS,client=null,limitYuan=1}={}){
 const {read,write}=io(root);
 const {entries}=await read('entries.json');
 const budget=await read('budget.json',{card:'R10A',limitYuan,spentYuan:0,reservedYuan:0,calls:0,note:'本卡独立预算账；只记本卡真实 DeepSeek L2 调用'});
 client??=new DeepSeekClient({budgetYuan:budget.limitYuan,logFile:path.join(root,'usage.jsonl')});
 client.spent=budget.spentYuan;client.reserved=budget.reservedYuan??0;
 const reviews=await read('l2.json',{rows:[]});
 for(const entry of entries){
  const hash=hashContent(entry.value);
  let r=reviews.rows.find(x=>x.id===entry.id);
  if(!r){r={id:entry.id,attempts:[]};reviews.rows.push(r);}
  if(r.passed&&r.hash===hash)continue;
  // One review plus at most one rerun after a model veto, per entry.
  if(r.attempts.length>=2)continue;
  const attempt={hash};
  try{
   const response=await client.generate({max_tokens:900,response_format:{type:'json_object'},messages:[{role:'system',content:SYSTEM},{role:'user',content:JSON.stringify({rule:entry.value,background:entry.context??null})}]},`R10A:L2:${entry.id}:${r.attempts.length+1}`);
   budget.calls=(budget.calls??0)+1;
   await write(`response-${entry.id}-${r.attempts.length+1}.json`,response);
   const result=parseModelJSON(response);
   if(!Array.isArray(result.contradictions))throw Error('审核缺少矛盾列表');
   for(const issue of result.contradictions)if(!['硬事实','软问题','文风'].includes(issue.severity)||!['quote','field','reason'].every(k=>typeof issue[k]==='string'&&issue[k].trim()))throw Error('审核矛盾字段无效');
   Object.assign(attempt,{result,usage:response.measurement});
   r.passed=!result.contradictions.some(c=>c.severity==='硬事实');r.hash=hash;
  }catch(error){attempt.error=error.message;r.passed=false;}
  r.attempts.push(attempt);
  Object.assign(budget,{spentYuan:client.spent,reservedYuan:client.reserved});
  await write('budget.json',budget);await write('l2.json',reviews);
  if(attempt.error)throw Error(`审核执行失败，停止整批：${entry.id}：${attempt.error}`);
  console.log(JSON.stringify({id:entry.id,passed:r.passed,attempts:r.attempts.length,hard:attempt.result.contradictions.filter(c=>c.severity==='硬事实').length}));
 }
 console.log(JSON.stringify({passed:reviews.rows.filter(r=>r.passed).length,total:entries.length,spentYuan:client.spent,calls:budget.calls}));
 return reviews;
}
export async function sampleL4({root=DRAFTS,count=10}={}){
 const {read,write}=io(root),{entries}=await read('entries.json'),pool=entries.map(e=>e.id),picked=[],n=Math.min(count,pool.length);
 while(picked.length<n)picked.push(pool.splice(randomInt(pool.length),1)[0]);
 await write('l4-sample.json',{method:'node:crypto.randomInt 无放回随机抽取',ids:picked});return picked;
}

// Write reviewed values into the formal world files. Refuses unless every entry
// passes L1 and the L4 wave meets the bar; an entry whose L2 still carries a hard
// finding (both allowed calls used) is withheld, and a passed entry edited after
// review is refused.
const setAt=(obj,keys,value)=>{let o=obj;for(const k of keys.slice(0,-1))o=o[k]??={};o[keys.at(-1)]=value;};
export async function publishR10A({root='world',publish=false}={}){
 const drafts=path.join(root,'drafts/r10a'),{read}=io(drafts);
 const {entries}=await read('entries.json'),l2=await read('l2.json'),l4=await read('l4.json');
 const files={rules:path.join(root,'meta/rules.json'),items:path.join(root,'meta/items.json')};
 const world={rules:JSON.parse(await fs.readFile(files.rules,'utf8')),items:JSON.parse(await fs.readFile(files.items,'utf8'))};
 const factions=JSON.parse(await fs.readFile(path.join(root,'lore/factions.json'),'utf8'));
 const locations=JSON.parse(await fs.readFile(path.join(root,'geo/locations.json'),'utf8'));
 const npcs=JSON.parse(await fs.readFile(path.join(root,'people/baseline.json'),'utf8'));
 const blocklist=JSON.parse(await fs.readFile(path.join(root,'meta/blocklist.json'),'utf8'));
 const l1=l1Entries(entries,{world:{factions,locations:Array.isArray(locations)?locations:locations.locations,npcs},blocklist});
 if(!l1.passed)throw Error(`L1 未通过：${l1.errors.join('；')}`);
 const withheld=[],ready=[];
 for(const e of entries){const r=l2.rows.find(x=>x.id===e.id);
  if(r?.passed&&r.hash!==hashContent(e.value))throw Error(`审核后内容已改变：${e.id}`);
  if(!r?.passed){if(r?.attempts?.length>=2&&r.hash===hashContent(e.value)){withheld.push(e.id);continue;}throw Error(`L2 未完成：${e.id}`);}
  ready.push(e);}
 const scores=l4.rows.flatMap(r=>r.scores),average=scores.reduce((a,b)=>a+b,0)/scores.length;
 if(l4.rows.length<Math.min(10,entries.length)||average<4||Math.min(...scores)<3||l4.rows.some(r=>!entries.some(e=>e.id===r.id)))throw Error('L4 未达随机10条均分4、单项3');
 const before=JSON.stringify(world.rules),beforeItems=JSON.stringify(world.items);
 for(const e of ready){
  if(e.target[0]==='items'){const i=world.items.findIndex(x=>x.id===e.target[1]);if(i<0)world.items.push(e.value);else world.items[i]=e.value;}
  else setAt(world.rules,e.target.slice(1),e.value);
 }
 world.rules.law.autonomy.source='R10A 自治地盗采规矩（第10章审核）';
 // Illegal mining is sentenced by the local or polity code only; no global fallback.
 if(world.rules.law.activityPenalties)delete world.rules.law.activityPenalties.illegal_mining;
 const changed=[...(JSON.stringify(world.rules)!==before?['meta/rules.json']:[]),...(JSON.stringify(world.items)!==beforeItems?['meta/items.json']:[])];
 if(publish){
  if(changed.includes('meta/rules.json'))await fs.writeFile(files.rules,JSON.stringify(world.rules,null,2)+'\n');
  if(changed.includes('meta/items.json'))await fs.writeFile(files.items,JSON.stringify(world.items));
 }
 return{published:publish,changed,withheld,l1,l4:{average,minimum:Math.min(...scores)}};
}

if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
 const command=process.argv[2];
 if(command==='l1'){
  const {loadWorld}=await import('./load-world.mjs'),world=await loadWorld(),blocklist=JSON.parse(await fs.readFile('world/meta/blocklist.json','utf8'));
  const {entries}=await io(DRAFTS).read('entries.json'),out=l1Entries(entries,{world,blocklist});await io(DRAFTS).write('l1.json',out);console.log(JSON.stringify(out));
 }else if(command==='l2')await reviewR10A();
 else if(command==='sample')console.log(await sampleL4());
 else if(command==='publish')console.log(JSON.stringify(await publishR10A({publish:process.argv.includes('--write')})));
 else throw Error('用法：l1 | l2 | sample | publish [--write]');
}
