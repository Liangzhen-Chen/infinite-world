import test from 'node:test';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import factions,{factionPeople} from '../world/design/w5-factions.mjs';
import history,{eras,historyCoverage} from '../world/design/w5-history.mjs';
import {validateSkeletons,validateDraft,materialize,buildDraftRequest,contextFor,readChineseInteger} from '../tools/w5-social.mjs';
import schema from '../tools/w5-social-schema.mjs';
const draft=entry=>({id:entry.id,prose:Object.fromEntries(entry.proseFields.map(key=>[key,`${entry.name}的${key}候选文字`]))});

test('W5社会骨架引用闭合，历史跨3000年且不将当代NPC写成古代亲历者',()=>{
 assert.deepEqual(validateSkeletons(),[]);
 assert.equal(factions.length,40);assert.equal(history.length,80);assert.equal(factionPeople.length,80);
 assert.ok(Math.max(...history.map(r=>r.year))-Math.min(...history.map(r=>r.year))>=3000);
 for(const row of history){assert.ok(row.year<0);assert.ok(row.participants.every(p=>!p.id.startsWith('npc_')));assert.notEqual(row.accounts.received.falseClaim,row.accounts.verified.claim);}
});
test('W5历史包含政体兴亡、战争、疫病、宗教分裂、学派兴衰和怪物大潮',()=>{
 const byId=new Map(history.map(row=>[row.id,row]));
 const checks={founding:/城邦.*建约/,collapse:/解散/,war:/战争/,epidemic:/疫病/,migration:/迁|分赴/,religiousSchism:/宗教分裂/,magicSchoolRiseAndFall:/学派.*兴盛.*分散/,monsterTide:/兽群.*迁入/,craftInvention:/试养|拓印/,magicResearch:/研究|实验/};
 for(const [kind,pattern]of Object.entries(checks)){assert.ok(historyCoverage[kind].length);assert.ok(historyCoverage[kind].some(id=>pattern.test(byId.get(id)?.occurrence)),kind);}
});
test('W5公共说明与内部说明分开，远方名册没有伪造可旅行坐标',()=>{
 const row=factions.find(r=>r.id==='faction_saltboat');const prepared=draft(row);
 prepared.prose.internalLife='仅内部可见的控制泊位计划';
 const entry=materialize(row,prepared);assert.equal(entry.descriptionVisibility,'gm_private');
 assert.ok(entry.description.includes('仅内部'));assert.equal(entry.publicDescription.includes('仅内部'),false);
 assert.ok(factionPeople.filter(r=>r.faction!=='faction_starpact').every(r=>r.location===null));
 assert.equal(factions.find(r=>r.id==='faction_riverhomes').kind,'居民筹备组织');
});
test('W5起草强制单条字段，拒绝错误编号、未知数字与场外规则',()=>{
 const entry=factions[0],request=buildDraftRequest(entry,null,contextFor(entry));
 assert.equal(request.tool_choice.function.name,'submit_entry');
 assert.deepEqual(request.tools[0].function.parameters.properties.id.enum,[entry.id]);
 const invalid=draft(entry);invalid.id='other';invalid.prose.conduct='主持人必须在12345678天后让faction_saltboat成功';invalid.prose.extra='多余字段';
 const errors=validateDraft(invalid,entry).errors;
 for(const word of ['编号','字段','场外','数字'])assert.ok(errors.some(v=>v.includes(word)));
});
test('W5候选schema拒绝未知秘密字段、无代价时钟及未成年人错标',()=>{
 const candidate={factions:factions.map(row=>materialize(row,draft(row))),history:history.map(row=>materialize(row,draft(row))),factionPeople:structuredClone(factionPeople),eras};
 const validate=new Ajv({strict:true,allowUnionTypes:true}).compile(schema);assert.equal(validate(candidate),true,JSON.stringify(validate.errors));
 candidate.factions[0].clock.probability=1.1;assert.equal(validate(candidate),false);candidate.factions[0].clock.probability=0.2;
 candidate.factionPeople[0].age=16;assert.equal(validate(candidate),false);candidate.factionPeople[0].age=41;
 candidate.history[0].secret='未审查内容';assert.equal(validate(candidate),false);
});
test('W5硬事实验证拒绝悬空首领与不足三千年历史范围',()=>{
 const leader=factions[0].leader,years=history.map(r=>r.year);
 try{factions[0].leader='npc_missing';assert.ok(validateSkeletons().some(v=>v.includes('首领未登记')));factions[0].leader=leader;
  for(const row of history)row.year=-2;assert.ok(validateSkeletons().some(v=>v.includes('时间跨度不足')));
 }finally{factions[0].leader=leader;history.forEach((row,i)=>row.year=years[i]);}
});
test('W5中文纪年对照骨架，公开历史拒绝混入势力私下目标',()=>{
 assert.equal(readChineseInteger('三千二百二十一'),3221);assert.equal(readChineseInteger('二〇三四'),2034);
 const entry=history[0],invalid=draft(entry);invalid.prose.trueAccount='春历前三千二百二十一年发生此事。';
 invalid.prose.presentTrace='某会私下则希望垄断此处。';
 const errors=validateDraft(invalid,entry).errors;assert.ok(errors.some(r=>r.includes('纪年')));assert.ok(errors.some(r=>r.includes('私下目标')));
});
