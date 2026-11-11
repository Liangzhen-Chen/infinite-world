import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import Ajv from 'ajv';
import {loadWorld} from '../tools/load-world.mjs';
import {w1HewanFoundation} from '../world/design/w1-hewan.mjs';
import {w1RegionPlan} from '../world/design/w1-region-plan.mjs';
import {validateFoundation,validateDraft,applyProse} from '../tools/w1-hewan-content.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {villagesOriginalWorld} from '../tools/publish-w1-villages.mjs';
// T159榆根里、裂炉营以四村为邻地与资源来源；删村的历史投影一并移出这批聚居地。
import {withoutMonsterSociety2} from '../tools/publish-monster-society-2.mjs';
const loaded=withoutMonsterSociety2(villagesOriginalWorld(await loadWorld())),preserved=JSON.parse(await fs.readFile('world/drafts/w1/hewan/preserved-npcs.json','utf8'));loaded.npcs=loaded.npcs.map(n=>preserved.find(p=>p.id===n.id)??n);const bones=w1HewanFoundation(loaded);
// Keep the original foundation fixture after this batch is formally published.
// 只移出河湾本批的人、户与档案；白石镇升档人物、T157怪物聚居地等后续批次连同其名册和户一并保留，免得引用断开。
const own=rows=>row=>!rows.some(item=>item.id===row.id);
const world={...loaded,npcs:loaded.npcs.filter(own(bones.npcs)),residents:loaded.residents.filter(own(bones.residents)),households:loaded.households.filter(own(bones.households)),settlementProfiles:loaded.settlementProfiles.filter(p=>p.id!=='loc_hw'),locations:loaded.locations.filter(n=>!bones.locations.some(row=>row.id===n.id)),routes:loaded.routes.filter(n=>!bones.routes.some(row=>row.id===n.id))};
test('河湾58常住22户及30full口径不含暂住和通勤，原18档保持原文',()=>{
 const before=structuredClone(world.npcs),result=validateFoundation(bones,world);assert.equal(result.residentCount,58);assert.equal(result.residentFull,30);assert.equal(result.age60Plus,13);assert.deepEqual(world.npcs,before);
 const household=key=>bones.households.find(h=>h.members.includes(`npc_hw_${key}`));
 assert.equal(household('luowei').members.length,3);assert.deepEqual(household('wushuo').members,['npc_hw_wushuo']);assert.ok(household('taozhi').members.includes('npc_hw_fanrong'));assert.equal(bones.settlement.externalRelatives.find(x=>x.relatedTo==='npc_hw_zhengshuisheng').count,2);
 const duplicate=structuredClone(bones);duplicate.households[0].members.push('npc_hw_linsui');assert.throws(()=>validateFoundation(duplicate,world));
});
test('不少于20人的分布要求逐人有事实，少一项就不能验收；亲子年龄必须成立',()=>{
 const result=validateFoundation(bones,world);assert.deepEqual(result.distribution,{vice:9,cold:6,misconduct:3,conflict:12,liar:1});
 const polite=structuredClone(bones);for(const n of polite.residents)delete n.socialProfile;assert.throws(()=>validateFoundation(polite,world));
 const age=structuredClone(bones);age.npcs.find(n=>n.id==='npc_hw_fanrong').age=40;assert.throws(()=>validateFoundation(age,world),/亲子年龄/);
});
test('完整档与轻名册分别保存；全新full的现金库存来自骨架，不因职业描述赠物',async()=>{
 const schema=JSON.parse(await fs.readFile('schemas/world.schema.json','utf8')),validate=new Ajv({strict:true,allowUnionTypes:true,allErrors:true}).compile({$ref:'#/$defs/npc',$defs:schema.$defs});
 for(const n of bones.npcs){const sample={id:n.id,description:'此人正在做日常轻活。',appearance:n.appearance,voiceSamples:['这件事我先看一看。','今日要等手头的活做完。','先把用过的地方收拾好。'],personalityDescription:'有自己的习惯，也有不肯改的缺点。',memoryNarratives:n.memorySeeds.map(m=>m.event),attitude:'初见先听来意。'};assert.equal(validate(applyProse(n,sample)),true,JSON.stringify(validate.errors));}
 for(const n of bones.residents){assert.equal(n.tier,'roster');assert.equal(n.coins,undefined);assert.equal(n.schedule,undefined);assert.equal(n.services,undefined);}
 const legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),engine=new WorldEngine({...world,npcs:[...world.npcs,...bones.npcs],locations:[...world.locations,...bones.locations],routes:[...world.routes,...bones.routes]});
 const c=engine.createCharacter(legacy,{},'w1-new-people');for(const n of bones.npcs){assert.equal(c.state.npcs[n.id].coins,n.coins);assert.deepEqual(c.state.npcs[n.id].inventory,{});}
});
test('八栋新私宅接入真实路线，不缩短河湾至白石官道，不自动成为公共服务点',()=>{
 const engine=new WorldEngine({...world,locations:[...world.locations,...bones.locations],routes:[...world.routes,...bones.routes]});
 for(const l of bones.locations){assert.equal(l.access.mode,'private');assert.equal(l.access.requiresConsent,true);assert.ok(engine.route('loc_hw',l.id,'walk',540,'w1').minutes>0);for(const w of l.workstations??[])assert.ok(w.access==='consent'&&w.fee===0&&(l.fixtures??[]).some(f=>(f.fixture??f)===w.fixture),l.id+' 工位只来自本宅自有设备且需主人同意，不开放、不收费');/* K5 711f26dc：工位由设备派生；私宅带灶则有仅经同意的工位，不是公共服务点 */}
 assert.equal(engine.route('loc_hw','loc_bs','walk',540,'w1').minutes,new WorldEngine(world).route('loc_hw','loc_bs','walk',540,'w1').minutes);
});
test('L1不允许说明篡改人物字段、泄漏编号或引入未成年恋爱',()=>{
 const n=bones.residents.find(n=>n.age<18),draft={id:n.id,currentConcern:'还在认家中的空袋记号。',visibleFeature:'描字时会把手腕抬起。'};
 assert.deepEqual(validateDraft(draft,n).errors,[]);assert.ok(validateDraft({...draft,coins:20},n).errors.length);assert.ok(validateDraft({...draft,visibleFeature:'向恋人调情'},n).errors.length);assert.ok(validateDraft({...draft,currentConcern:'想去npc_hw_linsui家'},n).errors.length);
});
test('后续区域ID与人数预留满足250full和500独立roster，不把未起草的人算作已完成',()=>{
 assert.equal(w1RegionPlan.settlements.reduce((n,s)=>n+s.full,0),250);assert.equal(w1RegionPlan.settlements.reduce((n,s)=>n+s.roster,0),500);
 assert.equal(new Set(w1RegionPlan.settlements.map(s=>s.id)).size,6);assert.ok(w1RegionPlan.settlements.slice(1).every(s=>s.status.includes('未起草')));assert.equal(bones.npcs.length,14);
});
