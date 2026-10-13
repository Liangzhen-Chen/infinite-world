import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {validateNpcProfiles} from './npc-profile-validation.mjs';
import {validateNpcSchedules} from '../server-plugin/npc-schedule.mjs';
import {validateDraft as validatePersonDraft,buildDraftRequest as buildPersonRequest,applyProse,validateProseSimilarity} from './w1-hewan-content.mjs';
import {defaultReviewRequest} from './content-pipeline.mjs';
import {villageFacts} from '../world/design/w1-villages.mjs';
const blocklist=JSON.parse(await fs.readFile(new URL('../world/meta/blocklist.json',import.meta.url),'utf8'));
export const revision='w1-villages-1';
export {applyProse,validateProseSimilarity};
export function projectRoster(entry){const {authoredRelation,...out}=structuredClone(entry);delete out.home.ownership;if(typeof out.socialProfile?.vice==='string'){const detail=out.socialProfile.vice;out.socialProfile.vice={kind:detail.split('，')[0],detail};}return out;}
export function projectLocation(entry){const out=structuredClone(entry);if(out.access?.mode!=='private')delete out.access;out.purpose=out.purpose.replace(/；(?:本批|未登记|田亩和粮食产量尚未登记).*$/u,'');return out;}
export function validateFoundation(b,world){
 const incoming=[...b.npcs,...b.residents],existing=[...world.npcs,...(world.residents??[])],people=[...existing,...incoming],byId=new Map(people.map(n=>[n.id,n]));
 assert.equal(incoming.length,386);assert.equal(b.npcs.length,120);assert.equal(b.residents.length,266);assert.equal(b.households.length,120);assert.equal(b.settlements.length,4);
 assert.equal(byId.size,people.length,'人物ID重复');assert.equal(new Set(people.map(n=>JSON.stringify([n.settlement??n.scope,n.name]))).size,people.length,'同聚落人物重名');
 const locs=new Map([...world.locations,...b.locations].map(l=>[l.id,l]));assert.equal(locs.size,world.locations.length+b.locations.length,'地点ID重复');
 const reports=[];
 for(const s of b.settlements){const f=Object.values(villageFacts).find(f=>f.id===s.id),p=incoming.filter(n=>n.settlement===s.id),names={},h=b.households.filter(h=>h.settlement===s.id);assert.equal(s.population,f.population);assert.equal(p.length,f.population);assert.equal(p.filter(p=>p.tier==='full').length,30);assert.equal(h.length,s.householdCount);
  assert.deepEqual([...s.residentIds].sort(),p.map(p=>p.id).sort());assert.deepEqual(h.flatMap(h=>h.members).sort(),[...s.residentIds].sort());
  for(const n of p)for(const c of n.name)names[c]=(names[c]??0)+1;for(const[c,count]of Object.entries(names))assert.ok(count<=3,`${s.id} 人名用字${c}超过3次`);
  assert.equal(new Set(p.filter(n=>n.tier==='full').map(n=>n.fears[0])).size,30,'恐惧重复');assert.equal(new Set(p.filter(n=>n.tier==='full').flatMap(n=>Object.values(n.goals).flat().map(g=>g.content))).size,90,'目标重复');
  const distribution={vice:p.filter(n=>n.socialProfile?.vice).length,cold:p.filter(n=>n.socialProfile?.outsiderAttitude).length,misconduct:p.filter(n=>n.socialProfile?.pastMisconduct).length,conflict:p.filter(n=>n.socialProfile?.conflicts?.length).length,liar:p.filter(n=>n.socialProfile?.liesForBenefit).length};
  for(const[k,ratio]of Object.entries({vice:.15,cold:.1,misconduct:.05,conflict:.2}))assert.ok(distribution[k]>=Math.ceil(p.length*ratio),`${s.id} ${k}`);assert.ok(distribution.liar>=1);assert.ok(p.filter(n=>n.age<18).length&&p.some(n=>n.age>=60));assert.ok(p.filter(n=>n.tier==='full'&&!n.hooks.length).length>=9);
  reports.push({id:s.id,population:p.length,full:30,roster:p.length-30,households:h.length,distribution});
 }
 for(const n of incoming){assert.ok(n.age>=0&&n.age<=100);assert.equal(n.flags.minor,n.age<18);if(n.flags.minor)assert.equal(n.flags.romanceable,false);assert.equal(b.households.filter(h=>h.members.includes(n.id)).length,1);assert.ok(locs.has(n.home.location));for(const id of n.household)assert.ok(byId.has(id));for(const word of [...blocklist.names,...blocklist.realPeople])assert.ok(!n.name.includes(word),`屏蔽名 ${n.name}`);
  for(const c of n.socialProfile?.conflicts??[]){assert.ok(byId.has(c.with));assert.ok(byId.get(c.with).socialProfile.conflicts.some(r=>r.with===n.id&&r.issue===c.issue));}
  if(n.tier==='roster')for(const key of ['coins','inventory','services','schedule','proficiencies'])assert.ok(!(key in n));else{assert.deepEqual(n.inventory,{});assert.deepEqual(n.services,[]);assert.ok(n.relationships.length>=3);}
 }
 for(const r of b.kinship)assert.ok(byId.get(r.parent).age-byId.get(r.child).age>=15,`亲子年龄 ${r.parent}/${r.child}`);
 for(const n of b.npcs)for(const r of n.relationships){const other=byId.get(r.with);if(['姐姐','哥哥','兄长'].includes(r.type))assert.ok(other.age>n.age,`兄姐年龄 ${n.id}/${r.with}`);if(['妹妹','弟弟'].includes(r.type))assert.ok(other.age<n.age,`弟妹年龄 ${n.id}/${r.with}`);}
 const merged={...world,npcs:people,residents:[],locations:[...world.locations,...b.locations],routes:[...world.routes,...b.routes]};assert.deepEqual(validateNpcProfiles(merged),[]);assert.deepEqual(validateNpcSchedules(merged),[]);
 for(const h of b.households){const l=locs.get(h.homeLocation);assert.equal(l.purpose,'私宅');assert.deepEqual(l.access.residents,h.members);assert.equal(l.access.requiresConsent,true);}
 for(const l of b.locations)assert.deepEqual(l.inventory,{});
 const reached=new Set(['loc_bs']);while(true){const before=reached.size;for(const r of b.routes){assert.ok(locs.has(r.from)&&locs.has(r.to));const a=locs.get(r.from),z=locs.get(r.to);assert.ok(Math.abs(r.lengthKm-Math.hypot(a.coordinates[0]-z.coordinates[0],a.coordinates[1]-z.coordinates[1]))<1e-9);assert.ok(r.lengthKm>0);if(reached.has(r.from))reached.add(r.to);if(reached.has(r.to))reached.add(r.from);}if(before===reached.size)break;}assert.ok(b.locations.every(l=>reached.has(l.id)),'存在断开地点');
 return{settlements:reports,newFull:b.npcs.length,newRoster:b.residents.length,newLocations:b.locations.length,newRoutes:b.routes.length,kinship:b.kinship.length,formalWrite:false};
}
export function contextFor(entry,bones,world){const refs=new Set([...(entry.household??[]),...(entry.relationships??[]).map(r=>r.with),...(entry.access?.residents??[]),...(entry.socialProfile?.conflicts??[]).map(r=>r.with)]),people=[...world.npcs,...(world.residents??[]),...bones.npcs,...bones.residents];const s=bones.settlements.find(s=>s.id===(entry.settlement??entry.scope));
 return{settlement:{id:s.id,population:s.population,climate:s.climate,facts:s.facts},relatedPeople:people.filter(p=>refs.has(p.id)).map(p=>({id:p.id,name:p.name,age:p.age,occupation:p.occupation,home:p.home,relationship:entry.relationships?.find(r=>r.with===p.id),concern:p.currentConcern,positions:p.socialProfile?.conflicts})),places:[...world.locations,...bones.locations].filter(l=>[entry.home?.location,entry.workplace?.location,entry.location].includes(l.id)).map(l=>({id:l.id,name:l.name,purpose:l.purpose,access:l.access})),rules:['秘密只在私人字段；公开描述、台词、外貌不得泄漏。本人旧事只能润色两项种子，不新增结果。','目标没有完成；存货、价格、产量、法术、教课和收费不能由文字新增。','台词是场景示例，不写成此刻必有的人或物。','公众可以在路口招呼，私宅需居住者允许。共用工作地点的材料仍需各物主同意。','村内同户不合并财物。祖孙之外未登记的父母、生死和婚姻一律不补写。','冬季落叶乔木不产生可采鲜叶，农人冬季改做整理与休整。']};}
const cnNumber=s=>{if(/^\d+$/.test(s))return Number(s);const d={零:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};let n=0,last=0;for(const c of s){if(c in d)last=d[c];else if(c==='十'||c==='百'){n+=(last||1)*(c==='十'?10:100);last=0;}else return NaN;}return n+last;};
export function validateDraft(draft,entry,context){const result=validatePersonDraft(draft,entry);const text=JSON.stringify(draft??{});if(context){result.errors=result.errors.filter(e=>e!=='年龄数值不符');const ages=new Set([entry.age,...context.relatedPeople.map(p=>p.age)].filter(Number.isFinite));for(const m of text.matchAll(/([\d零一二两三四五六七八九十百]+)岁/g))if(!ages.has(cnNumber(m[1])))result.errors.push(`年龄未对应本人或引用人物：${m[0]}`);}
 if(context)for(const person of [entry,...context.relatedPeople].filter(p=>p.name&&Number.isFinite(p.age)))for(const m of text.matchAll(new RegExp(person.name+'(?:，|今年|现年|才|已经)?([\\d零一二两三四五六七八九十百]+)岁','gu')))if(cnNumber(m[1])!==person.age)result.errors.push(`具名年龄不符：${m[0]}`);
 if(entry.openHours){for(const m of text.matchAll(/([零一二两三四五六七八九十]+)时(?:至|到)([零一二两三四五六七八九十]+)时/gu))if(cnNumber(m[1])*60!==entry.openHours[0]||cnNumber(m[2])*60!==entry.openHours[1])result.errors.push(`开放时段不符：${m[0]}`);if(/[子丑寅卯辰巳午未申酉戌亥]时(?:至|到)[子丑寅卯辰巳午未申酉戌亥]时/u.test(text))result.errors.push('开放时间须用与骨架一致的明确小时');}
 if(entry.purpose==='私宅')for(const m of text.matchAll(/([一二两三四五六七八九十]+)间(?:屋|房)/gu))if(cnNumber(m[1])>entry.rooms.length)result.errors.push(`房间数超过骨架：${m[0]}`);
 if(/玉坡|苇庭|苇亭|苇塍|汀口韦亭|围庭|微汀四新村|桑坡四新村|桑板村|桑坡村|泉边村|泉里村/.test(text))result.errors.push('村名须使用榆坡村、苇汀村、砾泉村、桑坂村的正式名字');if(/自动补货|无限取用|免费领取|瞬间移动|包治|驱散诅咒/.test(text))result.errors.push('增加未登记机制或库存');if(!entry.tier&&text.length<40)result.warnings.push('地点说明过短');return result;}
export function buildDraftRequest(entry,feedback,context){const request=buildPersonRequest(entry,feedback,context);if(!entry.tier){request.messages[0].content='为原创河谷地点写一条description，约50至100字，只输出指定工具。按authoredFacts写可观察细节，区分公共路口、工作处、私宅；不新增物权、财物、服务、密道或地点历史。地点本身不替人物说话，不让职业名称变成可收费能力。避免每栋房都用同一开头和门口结尾。';}
 else request.messages[0].content+=' 当前是四个新村的人物，不是河湾。description尽量写当面可见的举止与日常处境。私人毛病不等于公开承认秘密；保密事实只保留在骨架私人字段。记忆可省略修辞，不推演未登记结局。';request.messages[0].content+=` 正式村名：${Object.values(villageFacts).find(f=>f.id===(entry.settlement??entry.scope)).name}。`;return request;}
export function buildReviewRequest(entry,draft,context){const r=defaultReviewRequest(entry,draft,context);r.messages[0].content+=' 对人物：公开description/voiceSamples/attitude不可直接泄漏secrets或privateFact。memoryNarratives映射本人私有memorySeeds，沿用knownBy，不是公开描述；允许对应原有本人经历，但不能把目标写成完成。职业日常劳动和讨论既有工事不等于新增引擎服务；新增保证交货、收费功能、库存取得或技能效果才按未实现功能报hard。对地点：相容感官细节可以，不能增库存/产量/进入权。';return r;}
