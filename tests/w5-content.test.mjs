import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import seeds from '../world/design/w5-cultures.mjs';
import {loadWorld} from '../tools/load-world.mjs';
import {validateWorld} from '../tools/validate-world.mjs';
import {validateDraft,materialize} from '../tools/w5-content.mjs';
import {bigramSimilarity} from '../tools/w5-validation.mjs';

const fixture=entry=>({id:entry.id,prose:Object.fromEntries(entry.proseFields.map(field=>[field,field==='proverbs'?Array.from({length:10},(_,i)=>`${entry.name}的记事谚语${i}`):`${entry.name} ${field} ${entry.focus??entry.symbol}`]))});
function addFixtures(world){
 world.cultures=seeds.filter(row=>row.category==='culture').map(row=>materialize(row,fixture(row)));
 world.deities=seeds.filter(row=>row.category==='deity').map(row=>materialize(row,fixture(row)));
 return world;
}
test('W5骨架覆盖十种文化与十二神祇，道士有具体文化和教派',()=>{
 const cultures=seeds.filter(row=>row.category==='culture'),deities=seeds.filter(row=>row.category==='deity');
 assert.equal(cultures.length,10);assert.equal(deities.length,12);
 const dao=deities.find(row=>row.church.profession==='道士');
 assert.equal(dao.culture,'culture_reed');assert.ok(cultures.find(row=>row.id===dao.culture).facts.magicAdventurers.includes('符箓'));
 for(const row of seeds)assert.equal(validateDraft(fixture(row),row).errors.length,0);
});
test('W5 L1拒绝错编号、缺谚语、额外字段、屏蔽名与未经设计的数字',()=>{
 const entry=seeds[0],draft=fixture(entry);draft.id='culture_fake';draft.prose.proverbs=['只有一句'];draft.culture_proverbs=[];
 draft.prose.voice='阿斯兰主持人收取20铜';
 const result=validateDraft(draft,entry);
 for(const word of ['编号','谚语','顶层','屏蔽','数量'])assert.ok(result.errors.some(error=>error.includes(word)),word);
});
test('W5世界校验不允许引用清单掩盖语义坏引用或正文偏离',async()=>{
 const world=addFixtures(await loadWorld());
 world.cultures[0].witness='npc_missing';world.cultures[0].references=['loc_hw','npc_hw_luowei'];
 world.deities[0].culture='loc_hw';world.deities[0].description+='被未经审查改写';
 const result=validateWorld(world);
 for(const word of ['引用不存在','见证人','类型错误','清单遗漏','检索正文'])assert.ok(result.errors.some(error=>error.includes(word)),`${word}: ${result.errors.join('\n')}`);
});
test('W5名称与正文都查屏蔽，文化不得靠重复谚语充数',async()=>{
 const world=addFixtures(await loadWorld());
 world.cultures[0].prose.proverbs[1]=world.cultures[0].prose.proverbs[0];
 assert.equal(validateWorld(world).ok,false);
 world.cultures[0].prose.proverbs[1]='新谚语';world.cultures[0].prose.voice='阿斯兰赐予神迹';
 assert.ok(validateWorld(world).errors.some(error=>error.includes('正文触及屏蔽')));
 assert.equal(bigramSimilarity('同一段说明','同一段说明'),1);
});
test('旧测试世界没有lore目录时仍能读取，不要求新内容倒灌夹具',async t=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'w5-optional-'));
 t.after(()=>fs.rm(temp,{recursive:true,force:true}));
 for(const folder of ['meta','people','geo'])await fs.cp(new URL(`../world/${folder}`,import.meta.url),path.join(temp,folder),{recursive:true});
 const old=await loadWorld(temp);assert.deepEqual(old.cultures,[]);assert.deepEqual(old.deities,[]);
 // Current full profiles require their cultural references. Historical worlds
 // predate the full-profile contract, rather than containing broken full rows.
 assert.ok(validateWorld(old).errors.some(error=>error.includes('culture')));
 for(const key of ['residents','households','settlementProfiles'])old[key]=[];
 for(const npc of old.npcs){delete npc.tier;delete npc.householdId;}
 for(const place of old.locations)if(place.access?.mode==='private')delete place.access;
 const historical=validateWorld(old);assert.equal(historical.ok,true,historical.errors.join('\n'));
});
