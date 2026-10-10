import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const blocklist=JSON.parse(await fs.readFile(new URL('../world/meta/blocklist.json',import.meta.url),'utf8'));
export const revision='m2-people-1';
const hanDigits={零:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};
function numeric(text){if(/^\d+$/.test(text))return Number(text);let sum=0,digit=0;for(const c of text){if(c in hanDigits)digit=hanDigits[c];else if({十:10,百:100,千:1000}[c]){sum+=(digit||1)*{十:10,百:100,千:1000}[c];digit=0;}else return NaN;}return sum+digit;}
export function validateFoundation(bones,world){
 const locations=new Set(world.locations.map(x=>x.id)),ids=new Set(world.npcs.map(x=>x.id));
 assert.equal(bones.npcs.length,18);
 for(const n of bones.npcs){
  const original=world.npcs.find(x=>x.id===n.id);assert.ok(original,n.id);
  for(const key of ['name','aliases','coins','inventory','services','skills','intelligence'])assert.deepEqual(n[key],original[key],`${n.id}.${key}`);
  assert.equal(n.age,n.id==='npc_hw_chenbai'?62:original.age);
  assert.ok(n.appearance.length>=3&&n.appearance.length<=5);assert.ok(n.personality.flaws.length);
  assert.ok(locations.has(n.home.location));assert.ok(locations.has(n.workplace.location));
  assert.ok(n.relationships.length>=3);assert.equal(new Set(n.relationships.map(x=>x.with)).size,n.relationships.length);
  for(const r of n.relationships){assert.ok(ids.has(r.with)&&r.with!==n.id);assert.ok(r.type&&r.note);assert.ok(r.trust>=-100&&r.trust<=100);assert.ok(r.affection>=-100&&r.affection<=100);}
  assert.ok(n.memorySeeds.length>=2);for(const m of n.memorySeeds)assert.ok(m.event&&m.knownBy.every(x=>ids.has(x)));
  for(const term of ['short','mid','long']){assert.ok(n.goals[term].length);for(const g of n.goals[term])assert.ok(g.content&&g.steps.length>=2&&g.resources.length&&g.resources.every(r=>r.description&&r.grantsInventory===false)&&g.deadlineDay>0&&g.progress===0);}
  assert.ok(n.secrets.length);for(const s of n.secrets)assert.ok(s.content&&s.knownBy.includes(n.id)&&s.knownBy.every(x=>ids.has(x)));
  assert.ok(n.knowledge.known.length&&n.knowledge.unknown.length);
  for(const key of Object.keys(n.proficiencies))assert.ok(world.skills.some(x=>x.id===key),key);
  for(const key of n.professions)assert.ok(world.professions.some(x=>x.id===key),key);
  assert.ok(n.schedule.restDays.every(x=>Number.isInteger(x)&&x>=1&&x<=30));
  const schedules=[...['default','market','rest'].map(k=>n.schedule[k]),...Object.values(n.schedule.seasonal).flatMap(x=>Object.values(x))];
  for(const slots of schedules){assert.equal(slots[0].start,0);assert.equal(slots.at(-1).end,1440);for(const [i,s] of slots.entries()){
   assert.ok(Number.isInteger(s.start)&&Number.isInteger(s.end)&&s.end>s.start);if(i)assert.equal(s.start,slots[i-1].end);
   assert.ok(locations.has(s.location),`${n.id}: ${s.location}`);assert.ok(s.activity);
   assert.ok(s.services.every(x=>['trade','teach'].includes(x)));if(s.services.includes('teach'))assert.ok(n.services.length);
   if(/前往|返回|沿既有/.test(s.activity))assert.deepEqual(s.services,[]);
  }}
  if(n.age<18){assert.equal(n.flags.minor,true);assert.equal(n.flags.romanceable,false);assert.ok(!n.relationships.some(x=>/恋|情人|配偶/.test(x.type)));}
 }
 return {people:bones.npcs.length,schedules:bones.npcs.length*6};
}
export function contextFor(entry){return {facts:['手工骨架是事实来源，原notes与age冲突时只陈柏采用明确六十二岁。','目标是尚未完成的愿望；秘密不能在样例台词直接泄漏。','services为实际教学白名单；serviceCatalog不增加服务。库存和现金不能由描述增减。','每月5/15/25为集市日，restDays为另一日程标签。location为时段目标地点，真实路程抵达前不可提供服务。','十八人规模未触发具名人数不少于二十的分布比例检查。'],names:entry.relationships.map(x=>x.with),proseScope:'只起草外部可观察的人物短描写和日常台词，不复述私有秘密、未发生目标、无来源世界事实。'};}
export function validateDraft(row,entry){
 const errors=[],warnings=[];
 if(!row||row.id!==entry.id)errors.push('id不符');
 if(!row||Object.keys(row).some(k=>!['id','description','voiceSamples'].includes(k)))errors.push('只许三个起草字段');
 if(typeof row?.description!=='string'||!row.description.trim())errors.push('缺少人物描写');
 else if(row.description.length<100||row.description.length>260)warnings.push('描写长度超出100至260字软范围');
 if(!Array.isArray(row?.voiceSamples)||row.voiceSamples.length!==3||row.voiceSamples.some(x=>typeof x!=='string'||!x.trim()))errors.push('需要三句非空台词');
 const text=[row?.description,...row?.voiceSamples??[]].join('。');
 for(const m of text.matchAll(/([0-9零一二两三四五六七八九十百]+)岁/g))if(numeric(m[1])!==entry.age)errors.push(`年龄与骨架不符:${m[0]}`);
 const prices=entry.serviceCatalog.flatMap(x=>[x.price.perNight,x.price.perWeek]).filter(Number.isFinite);
 for(const m of text.matchAll(/([0-9零一二两三四五六七八九十百千]+)(?:个)?铜(?:币|钱|板)?/g))if(!prices.includes(numeric(m[1])))errors.push(`没有依据的数值价格:${m[0]}`);
 for(const word of [...blocklist.names,...blocklist.realPeople])if(text.includes(word))errors.push(`原创屏蔽词:${word}`);
 if(/提示词|骨架|生成器|JSON|schema|NPC|玩家|服务白名单|系统设定/.test(text))errors.push('含世界外词语');
 if(entry.flags.minor&&/恋人|情人|亲吻|调情|爱慕/.test(text))errors.push('未成年恋爱边界');
 return {errors,warnings};
}
export function buildDraftRequest(entry,feedback,context){return {
 temperature:0.7,max_tokens:1100,thinking:{type:'disabled'},
 tools:[{type:'function',function:{name:'write_npc_prose',description:'只为一人填写短描写和三句台词',parameters:{type:'object',additionalProperties:false,required:['id','description','voiceSamples'],properties:{id:{type:'string',enum:[entry.id]},description:{type:'string'},voiceSamples:{type:'array',minItems:3,maxItems:3,items:{type:'string'}}}}}}],tool_choice:{type:'function',function:{name:'write_npc_prose'}},
 messages:[{role:'system',content:'你为原创中世纪游戏写一个已定事实的人物。只用工具输出id、description、voiceSamples。description约100至260汉字，结合已给外貌、行为和说话方式，克制具体。voiceSamples恰好三句本人日常口语，表现不同场合，不要每句都是拒绝或安全声明。不得增加事实、关系、技能、财产、价格、服务、已完成目标。台词不直接泄漏秘密，愿望不能写成已办成。已有姓名可用，编号和程序词不能进入正文。不需要复述全部字段。没有明确价格可不谈数额。'},{role:'user',content:JSON.stringify({person:entry,context,corrections:feedback})}]
};}
