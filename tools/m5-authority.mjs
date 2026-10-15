// T123 governance authority sources: L1 checks, real DeepSeek L2 review with
// this card's own budget ledger, L4 record and formal publication into
// rules.governance.authority.
//   node tools/m5-authority.mjs --check | --review | --l4 | --publish
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomInt} from 'node:crypto';
import entries,{REGISTRAR_OCCUPATIONS} from '../world/design/m5-authority.mjs';
import {loadWorld} from './load-world.mjs';
import {DeepSeekClient} from './deepseek-client.mjs';
import {parseModelJSON} from './content-pipeline.mjs';
import {atomicJSON} from '../server-plugin/storage.mjs';

export const root=path.resolve(import.meta.dirname,'../world/drafts/m5-authority');
const budgetFile=path.join(root,'budget.json'),LIMIT=0.8,MAX_ATTEMPTS=2;
const rulesFile=path.resolve(import.meta.dirname,'../world/meta/rules.json');
const blocklist=JSON.parse(await fs.readFile(new URL('../world/meta/blocklist.json',import.meta.url),'utf8'));

const CN={零:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};
export function chineseNumber(s){
 let total=0,section=0,n=0;
 for(const c of s){
  if(c in CN)n=CN[c];
  else if(c==='十'){section+=(n||1)*10;n=0;}
  else if(c==='百'){section+=(n||1)*100;n=0;}
  else if(c==='千'){section+=(n||1)*1000;n=0;}
  else if(c==='万'){total+=(section+n)*10000;section=0;n=0;}
 }
 return total+section+n;
}
const numbers=value=>new Set((JSON.stringify(value).match(/\d+/g)??[]).map(Number));
const SHARE={'一成':1000,'一成半':1500,'两成':2000,'两成半':2500,'二成':2000};

export function validateEntry(entry,world){
 const errors=[],warnings=[],s=entry.skeleton,byId=new Map([...world.locations,...world.npcs].map(x=>[x.id,x]));
 const loc=id=>{if(!byId.has(id))errors.push(`${entry.id}:地点不存在 ${id}`);};
 const governed=new Set(world.settlementProfiles.filter(p=>p.details?.governance?.appointment).map(p=>p.id));
 const ids=new Set(entries.map(e=>e.id)),rules=world.rules;
 if(!/^[a-z][a-z0-9_]+$/.test(entry.id))errors.push(`${entry.id}:编号不安全`);
 for(const v of s.settlements??(s.settlement?[s.settlement]:[]))if(!governed.has(v))errors.push(`${entry.id}:聚落没有现行村级任命 ${v}`);
 if(entry.kind==='superior'){
  loc(s.seat);if(s.channel)loc(s.channel);
  if(s.registrars){
   const staff=world.npcs.filter(n=>n.workplace?.location===s.registrars.workplace&&REGISTRAR_OCCUPATIONS.includes(n.occupation));
   if(staff.length<2)errors.push(`${entry.id}:官署登记人不足`);
   for(const v of s.jurisdiction)if(!governed.has(v))errors.push(`${entry.id}:辖区缺任命 ${v}`);
  }
  for(const ref of [...(s.appoints??[]),...(s.forwards??[])])if(!ids.has(ref))errors.push(`${entry.id}:悬空引用 ${ref}`);
  const days=s.decisionDays??s.decisionAfterDays;if(!Number.isSafeInteger(days)||days<1)errors.push(`${entry.id}:审定日数`);
 }
 if(entry.kind==='office'){
  if(!ids.has(s.appointedBy))errors.push(`${entry.id}:任命来源悬空`);
  for(const k of ['termDays','monthlyQuotaD','monthlyBudgetCopper'])if(!Number.isSafeInteger(s[k])||s[k]<0)errors.push(`${entry.id}:${k}`);
  if(entry.id==='office_village_head'){
   if(s.monthlyQuotaD!==rules.quests.monthlyQuotaD.villageHead)errors.push('村长额度与任务额度表不符');
   if(s.taxBps.max>rules.governance.taxRateLimits[1]*10000||s.taxBps.min<rules.governance.taxRateLimits[0]*10000)errors.push('税率超出上级范围');
  }
 }
 if(entry.kind==='plot'){
  loc(s.location);if(byId.get(s.location)?.parent!==s.settlement)errors.push(`${entry.id}:地块不在本村`);
  for(const k of ['slots','feeCopper','annualRentCopper','buildDays'])if(!Number.isSafeInteger(s[k])||s[k]<1)errors.push(`${entry.id}:${k}`);
  if(!(s.materials.wood+s.materials.stone>0))errors.push(`${entry.id}:材料为零`);
 }
 if(entry.kind==='treasury'&&(s.reserveCopper<0||s.wagePerWorkerDayCopper!==rules.economy.wageCopperPerHalfDay[1]))errors.push(`${entry.id}:留底或工钱与经济表不符`);
 if(entry.kind==='title'){
  const i=rules.governance.titles.indexOf(entry.name);
  if(i<0||s.ranks.length!==rules.governance.titleRanks[i]||s.monthlyQuotaD.length!==s.ranks.length)errors.push(`${entry.id}:爵位等级与规则表不符`);
  if(s.monthlyQuotaD.some((q,j)=>j&&q<=s.monthlyQuotaD[j-1]))errors.push(`${entry.id}:等级额度未递增`);
  if(entry.name==='男爵'&&s.monthlyQuotaD.at(-1)!==rules.quests.monthlyQuotaD.cityHeadFirstBaron)errors.push('一等男爵额度与锚点不符');
  if(entry.name==='国王'&&s.monthlyQuotaD[0]!==rules.quests.monthlyQuotaD.king||entry.name==='皇帝'&&s.monthlyQuotaD[0]!==rules.quests.monthlyQuotaD.emperor)errors.push(`${entry.id}:王室额度不符`);
  if(s.grantor===null?!['国王','皇帝'].includes(entry.name):!ids.has(s.grantor))errors.push(`${entry.id}:授爵来源悬空`);
 }
 // Prose: every number must come from the skeleton; shares and percentages
 // are compared with their own fields.
 const allowed=numbers(s);
 for(const [field,text]of Object.entries(entry.prose)){
  if(typeof text!=='string'||!text.trim()){errors.push(`${entry.id}:缺少${field}`);continue;}
  if(field==='text'&&(text.length<80||text.length>260))warnings.push(`${entry.id}:${field}长度${text.length}`);
  for(const n of text.match(/\d+/g)??[])if(!allowed.has(Number(n)))errors.push(`${entry.id}:${field}未经设计的数字 ${n}`);
  for(const m of text.matchAll(/([零一二两三四五六七八九十百千万]+)(?=日|天|铜|名|人|块|份|年|次)/g))if(m[1]!=='一'&&!allowed.has(chineseNumber(m[1])))errors.push(`${entry.id}:${field}未经设计的中文数 ${m[0]}`);
  for(const m of text.matchAll(/(一成半|两成半|一成|两成|二成)/g)){const bps=SHARE[m[1]];if(![s.incomeBps,s.tributeBps].includes(bps))errors.push(`${entry.id}:${field}分成 ${m[1]} 与骨架不符`);}
  for(const m of text.matchAll(/百分之([零一二两三四五六七八九十]+)/g)){const bps=chineseNumber(m[1])*100;if(![s.taxBps?.min,s.taxBps?.max].includes(bps))errors.push(`${entry.id}:${field}税率 ${m[0]} 与骨架不符`);}
  if(/玩家|引擎|工具|operation|npc_|loc_|bld_|office_|title_|auth_|plot_|M5|T12|骨架|候选/.test(text))errors.push(`${entry.id}:${field}场外信息泄漏`);
  for(const word of [...blocklist.names,...blocklist.realPeople??[]])if(text.includes(word))errors.push(`${entry.id}:原创屏蔽 ${word}`);
 }
 return {errors,warnings};
}
export function validateAll(world){
 const out={errors:[],warnings:[]};
 if(new Set(entries.map(e=>e.id)).size!==entries.length)out.errors.push('编号重复');
 if(entries.length<15||entries.length>25)out.errors.push('来源条数应为15–25');
 for(const kind of ['superior','office','plot','treasury','title'])if(!entries.some(e=>e.kind===kind))out.errors.push(`缺少${kind}来源`);
 if(entries.filter(e=>e.kind==='title').map(e=>e.name).join()!==world.rules.governance.titles.join())out.errors.push('九级爵位顺序不符');
 for(const e of entries){const r=validateEntry(e,world);out.errors.push(...r.errors);out.warnings.push(...r.warnings);}
 return out;
}

export function reviewRequest(entry){
 return {thinking:{type:'disabled'},temperature:0,max_tokens:900,response_format:{type:'json_object'},messages:[
  {role:'system',content:'你是游戏规则说明的事实审查员。逐句把说明文字与骨架比对，只返回JSON {"contradictions":[{"quote":"说明原句","field":"骨架字段路径","severity":"hard|soft|style","reason":"具体原因"}]}。hard：数值、期限、费用、额度、分成、人数、地点、任命或授予主体、资格条件、权限范围与骨架相反，或新增骨架没有的权力、收费、处罚、奖励。soft：说法含糊可能误导。style：措辞问题。核对一致的句子不输出；不要为确认一致而列条目。不因没有复述全部骨架字段报错。百分之八即800万分点；一成=1000万分点，一成半=1500，两成=2000，两成半=2500。无矛盾返回空数组。'},
  {role:'user',content:JSON.stringify({id:entry.id,name:entry.name,kind:entry.kind,skeleton:entry.skeleton,prose:entry.prose})}]};
}
async function readJSON(file,fallback){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
const recordFile=id=>path.join(root,`${id}.json`);

async function review(world){
 const check=validateAll(world);if(check.errors.length)throw Error(check.errors.join('\n'));
 await fs.mkdir(root,{recursive:true});
 const ledger=await readJSON(budgetFile,{card:'T123',limitYuan:LIMIT,spentYuan:0,calls:0,entries:{}});
 const client=new DeepSeekClient({budgetYuan:LIMIT,logFile:'logs/m5-authority-usage.jsonl'});client.spent=ledger.spentYuan;
 for(const entry of entries){
  const old=await readJSON(recordFile(entry.id),null),hash=JSON.stringify({s:entry.skeleton,p:entry.prose});
  if(old?.status==='passed'&&old.hash===hash)continue;
  // An entry that failed, was fixed and failed again goes to manual L4; it is
  // never sent a third time.
  const attempts=(ledger.entries[entry.id]??0),failures=ledger.failures?.[entry.id]??0;
  if(failures>=MAX_ATTEMPTS){console.log(`${entry.id}: 已失败${failures}次，转人工`);continue;}
  let row;
  try{
   const response=await client.generate(reviewRequest(entry),`m5-authority-${entry.id}`);
   const review=parseModelJSON(response);
   if(!Array.isArray(review.contradictions))throw Error('审查缺少 contradictions');
   const hard=review.contradictions.filter(x=>x.severity==='hard');
   row={id:entry.id,hash,status:hard.length?'flagged':'passed',review,cost:response.measurement.costUpperYuan,attempt:attempts+1};
  }finally{
   ledger.spentYuan=client.spent;ledger.calls+=1;ledger.entries[entry.id]=attempts+1;
   ledger.failures??={};if(row?.status!=='passed')ledger.failures[entry.id]=failures+1;
   await atomicJSON(budgetFile,ledger);
  }
  await atomicJSON(recordFile(entry.id),row);
  console.log(`${entry.id}: ${row.status} ${row.review.contradictions.map(c=>`[${c.severity}]${c.reason}`).join('；')}`);
 }
 console.log(JSON.stringify({calls:ledger.calls,spentYuan:ledger.spentYuan}));
}

export async function reviewState(){
 const rows=await Promise.all(entries.map(e=>readJSON(recordFile(e.id),null)));
 return entries.map((e,i)=>({entry:e,record:rows[i],current:rows[i]?.hash===JSON.stringify({s:e.skeleton,p:e.prose})}));
}
async function l4(){
 const state=await reviewState(),flagged=state.filter(r=>r.record?.review?.contradictions?.length).map(r=>r.entry.id);
 const pool=state.map(r=>r.entry.id),pick=n=>{const p=[...pool];for(let i=p.length-1;i>0;i--){const j=randomInt(i+1);[p[i],p[j]]=[p[j],p[i]];}return p.slice(0,n);};
 console.log(JSON.stringify({flagged,extra:pick(5),score:pick(10)},null,1));
}

// Publication: authority sources become rules.governance.authority. Village
// head contribution threshold follows the office source.
export function authorityRules(){
 const pub=e=>({id:e.id,name:e.name,...structuredClone(e.skeleton),text:e.prose.text,counterLine:e.prose.counterLine,source:`m5-authority/${e.id}`});
 const by=kind=>Object.fromEntries(entries.filter(e=>e.kind===kind).map(e=>[e.id,pub(e)]));
 return {version:1,source:'T123 m5-authority',superiors:by('superior'),offices:by('office'),plots:by('plot'),
  treasury:pub(entries.find(e=>e.kind==='treasury')),titles:entries.filter(e=>e.kind==='title').map(pub)};
}
async function publish(world){
 const check=validateAll(world);if(check.errors.length)throw Error(check.errors.join('\n'));
 // L2-passed entries publish as reviewed. An entry that failed L2 twice
 // publishes only with a manual L4 resolution of exactly its current text.
 const l4=await readJSON(path.join(root,'l4.json'),null);
 if(!l4?.approved)throw Error('缺少L4记录');
 const state=await reviewState(),hash=e=>JSON.stringify({s:e.skeleton,p:e.prose});
 const bad=state.filter(r=>!(r.current&&r.record.status==='passed')&&l4.manual?.[r.entry.id]?.hash!==hash(r.entry));
 if(bad.length)throw Error(`未通过L2或人工L4：${bad.map(r=>r.entry.id).join(',')}`);
 const scores=Object.values(l4.scores??{});
 if(scores.length!==10||scores.flat().some(n=>n<3)||scores.flat().reduce((a,b)=>a+b,0)/(scores.length*6)<4)throw Error('L4随机10条评分未达标');
 const rules=JSON.parse(await fs.readFile(rulesFile,'utf8'));
 rules.governance.authority=authorityRules();
 rules.governance.villageHead={...rules.governance.villageHead,contribution:rules.governance.authority.offices.office_village_head.requires.contribution};
 const temp=`${rulesFile}.${process.pid}.tmp`;await fs.writeFile(temp,`${JSON.stringify(rules,null,2)}\n`);await fs.rename(temp,rulesFile);
 console.log(JSON.stringify({published:entries.length,file:'world/meta/rules.json'}));
}

if(process.argv[1]&&path.resolve(process.argv[1])===import.meta.filename){
 const world=await loadWorld(),mode=process.argv[2];
 if(mode==='--check'){const r=validateAll(world);console.log(JSON.stringify(r,null,1));if(r.errors.length)process.exitCode=1;}
 else if(mode==='--review')await review(world);
 else if(mode==='--l4')await l4();
 else if(mode==='--publish')await publish(world);
 else throw Error('使用 --check|--review|--l4|--publish');
}
