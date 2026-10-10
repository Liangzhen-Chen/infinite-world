import test from 'node:test';
import assert from 'node:assert/strict';
import {loadWorld} from '../tools/load-world.mjs';
import {npcM2Foundation} from '../world/design/npc-m2.mjs';
import {validateFoundation,validateDraft} from '../tools/m2-people-content.mjs';
const world=await loadWorld(),foundation=npcM2Foundation(world);
test('18人财物服务不变，档案和全年作息可引用',()=>assert.deepEqual(validateFoundation(foundation,world),{people:18,schedules:108}));
test('旅商留足24公里双向步行时间且途中没有服务',()=>{
 const n=foundation.npcs.find(n=>n.id==='npc_hw_yanzhe');
 for(const k of ['market','rest']){const s=n.schedule[k];assert.equal(s[1].end-s[1].start,360);assert.equal(s[3].end-s[3].start,360);assert.equal(s[1].location,'loc_hw');assert.equal(s[3].location,'loc_bs');assert.deepEqual(s[1].services,[]);assert.deepEqual(s[3].services,[]);}
});
test('陈柏年龄改正有原档明确依据，其他财物无变动',()=>{assert.equal(foundation.corrections.length,1);assert.equal(foundation.corrections[0].new,62);assert.match(foundation.corrections[0].basis,/六十二岁/);});
test('L1拒绝篡改字段和未成年人恋爱，软字数不拒绝',()=>{const n=foundation.npcs.find(n=>n.id==='npc_hw_duanhe');const draft={id:n.id,description:'她在整理进货记号。',voiceSamples:['这里是桥。','我要画河边的树。','父亲的账本放在桌上。']};assert.equal(validateDraft(draft,n).errors.length,0);assert.ok(validateDraft({...draft,coins:500},n).errors.length);assert.ok(validateDraft({...draft,description:'她在向恋人调情。'},n).errors.length);});
test('时段缺口或虚构地点不可通过',()=>{const altered=structuredClone(foundation);altered.npcs[0].schedule.default[1].start++;assert.throws(()=>validateFoundation(altered,world));altered.npcs[0].schedule.default[1].start--;altered.npcs[0].schedule.default[1].location='not_registered';assert.throws(()=>validateFoundation(altered,world));});
test('L1核对正文中的数字年龄与服务价格',()=>{const n=foundation.npcs[0],draft={id:n.id,description:'林穗三十四岁。',voiceSamples:['住一晚六个铜。','一周三十五铜。','先把账说清楚。']};assert.deepEqual(validateDraft(draft,n).errors,[]);assert.ok(validateDraft({...draft,description:'林穗三十岁。'},n).errors.length);assert.ok(validateDraft({...draft,voiceSamples:['住一晚九百铜。','先谈条件。','请进。']},n).errors.length);});
