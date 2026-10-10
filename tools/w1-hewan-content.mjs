import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {validateNpcProfiles} from './npc-profile-validation.mjs';
import {validateNpcSchedules} from '../server-plugin/npc-schedule.mjs';
const blocklist=JSON.parse(await fs.readFile(new URL('../world/meta/blocklist.json',import.meta.url),'utf8'));
const chineseNumber=text=>{if(/^\d+$/.test(text))return Number(text);const digits={零:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};let value=0,last=0;for(const char of text){if(char in digits)last=digits[char];else if(char==='十'||char==='百'){value+=(last||1)*(char==='十'?10:100);last=0;}else return NaN;}return value+last;};
export const revision='w1-hewan-1';
export function hewanOriginalWorld(world,bones){
 const remove=(rows,added)=>rows.filter(row=>!added.some(n=>n.id===row.id));
 return {...world,npcs:remove(world.npcs,bones.npcs),residents:remove(world.residents??[],bones.residents),locations:remove(world.locations,bones.locations),routes:remove(world.routes,bones.routes)};
}
export function validateFoundation(bones,world){
 world=hewanOriginalWorld(world,bones);
 const people=[...world.npcs,...bones.npcs,...bones.residents],byId=new Map(people.map(n=>[n.id,n]));
 assert.equal(byId.size,people.length,'人物ID重复');assert.equal(bones.npcs.length,14);assert.equal(bones.residents.length,28);assert.equal(bones.households.length,22);
 const ids=bones.households.flatMap(h=>h.members);assert.equal(ids.length,58);assert.equal(new Set(ids).size,58);assert.equal(ids.filter(id=>byId.get(id)?.tier==='full').length,30);
 assert.ok(!ids.includes('npc_hw_yanzhe')&&!ids.includes('npc_hw_hezhou'));
 const counts=new Map();for(const id of ids){assert.ok(byId.has(id),id);for(const char of byId.get(id).name)counts.set(char,(counts.get(char)??0)+1);}
 for(const [char,count]of counts)assert.ok(count<=3,`人名用字${char}超过3次`);
 assert.equal(new Set(people.map(n=>n.name)).size,people.length,'具名人物同名');
 for(const h of bones.households)assert.ok(h.members.length>0);
 for(const relation of bones.kinship)assert.ok(byId.get(relation.parent).age-byId.get(relation.child).age>=15,`亲子年龄 ${relation.parent}/${relation.child}`);
 for(const n of [...bones.npcs,...bones.residents]){
  assert.equal(n.flags.minor,n.age<18);if(n.flags.minor)assert.equal(n.flags.romanceable,false);
  assert.equal(bones.households.filter(h=>h.members.includes(n.id)).length,1);assert.ok(n.household.every(id=>byId.has(id)));
  for(const word of [...blocklist.names,...blocklist.realPeople])assert.ok(!n.name.includes(word),`屏蔽名 ${n.name}`);
 }
 for(const n of bones.npcs){assert.deepEqual(n.inventory,{});assert.deepEqual(n.services,[]);assert.deepEqual(n.serviceCatalog,[]);assert.ok(n.relationships.length>=3);}
 const social=bones.residents.filter(n=>n.age>=18);
 const distribution={vice:social.filter(n=>n.socialProfile?.vice).length,cold:social.filter(n=>n.socialProfile?.outsiderAttitude).length,misconduct:social.filter(n=>n.socialProfile?.pastMisconduct).length,conflict:social.filter(n=>n.socialProfile?.conflicts?.length).length,liar:social.filter(n=>n.socialProfile?.liesForBenefit).length};
 assert.ok(distribution.vice>=Math.ceil(58*.15));assert.ok(distribution.cold>=Math.ceil(58*.1));assert.ok(distribution.misconduct>=Math.ceil(58*.05));assert.ok(distribution.conflict>=Math.ceil(58*.2));assert.ok(distribution.liar>=1);
 for(const n of social)for(const c of n.socialProfile?.conflicts??[])assert.ok(byId.has(c.with)&&c.with!==n.id&&c.issue&&c.position);
 const candidate={...world,npcs:people,locations:[...world.locations,...bones.locations],routes:[...world.routes,...bones.routes]};
 assert.deepEqual(validateNpcProfiles(candidate),[]);assert.deepEqual(validateNpcSchedules(candidate),[]);
 for(const location of bones.locations){assert.ok(location.access.requiresConsent);assert.deepEqual(location.inventory,{});assert.ok(bones.routes.some(r=>r.to===location.id));}
 for(const route of bones.routes){const location=bones.locations.find(l=>l.id===route.to);assert.ok(Math.abs(route.lengthKm-Math.hypot(...location.coordinates))<.00001);assert.equal(route.toll,0);}
 return{residentCount:58,households:22,residentFull:30,newFull:14,newRoster:28,newHomes:8,age60Plus:ids.filter(id=>byId.get(id).age>=60).length,noHookFull:bones.npcs.filter(n=>!n.hooks.length).length,distribution};
}
export function contextFor(entry,bones,world){
 world=hewanOriginalWorld(world,bones);
 const people=[...world.npcs,...bones.npcs,...bones.residents],related=new Set([...(entry.household??[]),...(entry.relationships??[]).map(r=>r.with)]);
 return{population:'河湾58常住、22户；贺舟暂住，严辙驻白石并来访，均不计58人。',people:people.filter(n=>related.has(n.id)).map(n=>({id:n.id,name:n.name,age:n.age,occupation:n.occupation,notes:n.notes??n.currentConcern?.split('；眼下')[0]})),places:[...world.locations,...bones.locations].filter(l=>[entry.home?.location,entry.workplace?.location,entry.location].includes(l.id)).map(l=>({id:l.id,name:l.name,purpose:l.purpose})),rules:['目标均未完成；想做的事不可写成已经发生。','人物没有新增可售库存或收费教学。帮工只能在物主允许时接触材料，不代表持有材料。','祖孙及外出亲属不自行补写婚姻、死亡或父母身份。','说明不新增价格、年龄、亲属、施法能力、产权或医疗效果。','住户共享地点不代表共享财物。']};
}
const fieldsFor=e=>e.tier==='full'?['id','description','appearance','voiceSamples','personalityDescription','memoryNarratives','attitude']:e.tier==='roster'?['id','currentConcern','visibleFeature']:['id','description'];
export function validateDraft(row,entry){
 const errors=[],warnings=[],fields=fieldsFor(entry);
 if(!row||row.id!==entry.id)errors.push('id不符');
 if(!row||Object.keys(row).some(k=>!fields.includes(k))||fields.some(k=>!(k in row)))errors.push('起草字段不符');
 if(entry.tier==='full'){
  for(const [key,count]of [['appearance',3],['voiceSamples',3],['memoryNarratives',2]])if(!Array.isArray(row?.[key])||row[key].length!==count||row[key].some(x=>typeof x!=='string'||!x.trim()))errors.push(`${key}需${count}个非空字符串`);
  for(const key of ['description','personalityDescription','attitude'])if(typeof row?.[key]!=='string'||!row[key].trim())errors.push(`${key}缺失`);
 }else for(const key of fields.filter(k=>k!=='id'))if(typeof row?.[key]!=='string'||!row[key].trim())errors.push(`${key}缺失`);
 const text=Object.entries(row??{}).filter(([key])=>key!=='id').flatMap(([,value])=>Array.isArray(value)?value:[value]).join('。');
 if(/npc_|bld_|loc_|house_|提示词|骨架|生成器|JSON|schema|NPC|玩家|白名单|系统设定/.test(text))errors.push('含内部编号或世界外词语');
 for(const word of [...blocklist.names,...blocklist.realPeople])if(text.includes(word))errors.push(`屏蔽词${word}`);
 for(const match of text.matchAll(/([\d零一二两三四五六七八九十百]+)岁/g))if(chineseNumber(match[1])!==entry.age)errors.push('年龄数值不符');
 if(/\d+\s*(?:铜|金|银|公斤|千克|分钟|小时)/.test(text))errors.push('说明不得新增数值价格、重量或时间');
 if(entry.flags?.minor&&/恋人|情人|亲吻|调情|爱慕/.test(text))errors.push('未成年恋爱边界');
 if(text.length>1600)warnings.push('说明过长，后续应压缩');
 return{errors,warnings};
}
export function buildDraftRequest(entry,feedback,context){
 const fields=fieldsFor(entry),properties=Object.fromEntries(fields.map(key=>[key,['appearance','voiceSamples','memoryNarratives'].includes(key)?{type:'array',items:{type:'string'}}:{type:'string'}]));properties.id.enum=[entry.id];
 const task=entry.tier==='full'?'description约100至180字；appearance恰好3条，仅润色已定外貌；voiceSamples恰好3句日常口语，场合不同，不全是拒绝；personalityDescription约40至80字，含缺点；memoryNarratives恰好2条，严格按记忆种子次序润色；attitude一句初见态度。':entry.tier==='roster'?'只润色currentConcern当前烦恼与visibleFeature可见特征，各约25至60字，不新增身份与亲属。':'仅写description约50至100字，依据私宅住户及结构，给出门口能观察的日常细节；不新增财物、密道、历史或公开进入权。';
 return{thinking:{type:'disabled'},temperature:.7,max_tokens:entry.tier==='full'?1800:650,tools:[{type:'function',function:{name:'write_w1_entry',description:'只为一个人物或住处填写已限定说明',parameters:{type:'object',additionalProperties:false,required:fields,properties}}}],tool_choice:{type:'function',function:{name:'write_w1_entry'}},messages:[{role:'system',content:`为原创河谷生活写一条内容。${task} 只用指定工具输出。事实以本条及引用为准，不把愿望写成履历；不抄原文整段，不机械套相同开头结尾，不虚构能提供的服务。不要直接泄漏秘密。`},{role:'user',content:JSON.stringify({entry,context,corrections:feedback})}]};
}
export function applyProse(entry,draft){
 if(entry.tier==='full')return{...entry,description:draft.description,appearance:draft.appearance,voice:{...entry.voice,samples:draft.voiceSamples},personality:{...entry.personality,description:draft.personalityDescription},memorySeeds:entry.memorySeeds.map((m,i)=>({...m,event:draft.memoryNarratives[i]})),towardPlayer:{...entry.towardPlayer,attitude:draft.attitude}};
 return{...entry,...draft};
}
export function validateProseSimilarity(candidate,world){
 world=hewanOriginalWorld(world,candidate);
 const gram=value=>{const t=value.replace(/[^\p{Script=Han}\p{L}\p{N}]/gu,'');return new Set(Array.from({length:Math.max(0,t.length-1)},(_,i)=>t.slice(i,i+2)));},report={};
 for(const kind of ['npcs','residents','locations']){
  const source=kind==='npcs'?[...world.npcs,...candidate.npcs]:candidate[kind],rows=source.map(n=>({id:n.id,g:gram(n.description??`${n.currentConcern??''}${n.visibleFeature??''}`)}));let worst={score:0};
  for(let i=0;i<rows.length;i++)for(let j=0;j<i;j++){const a=rows[i],b=rows[j],both=[...a.g].filter(x=>b.g.has(x)).length,union=a.g.size+b.g.size-both,score=union?both/union:0;if(score>worst.score)worst={score,a:a.id,b:b.id};}
  assert.ok(worst.score<.35,`${kind}说明二元相似度超限 ${JSON.stringify(worst)}`);report[kind]=worst;
 }
 return report;
}
