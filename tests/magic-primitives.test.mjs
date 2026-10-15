import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {validateEffectSpec,resolveVitalityPrimitive,applyProtectionPrimitive,consumeMagicProtection} from '../server-plugin/magic-primitives.mjs';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const protection=(power=10,damageTypes=['fire'])=>({kind:'protection',power,damageTypes,stacking:'strongest'});
function draft(){const document={state:{minute:0,effects:{}}};return{document,get:(...p)=>p.reduce((v,k)=>v?.[k],document),set:(p,v)=>{let o=document;for(const k of p.slice(0,-1))o=o[k]??=( {} );o[p.at(-1)]=structuredClone(v);}};}
test('原语拒绝未知参数、负护甲系数、非有限值与虚构防护门类',()=>{
 for(const spec of [{kind:'heal',power:1,revive:true},{kind:'damage',power:10,armorFactor:-1},{kind:'damage',power:10,armorFactor:NaN},protection(10,['universal']),{...protection(),stacking:'add'}])assert.ok(validateEffectSpec(spec).length);
 assert.deepEqual(validateEffectSpec({kind:'damage',power:12,armorFactor:0}),[]);
 assert.throws(()=>resolveVitalityPrimitive({spec:{kind:'heal',power:3},hp:NaN,maxHp:10}),/当前生命/);
});
test('伤害原语保留过量伤害供吸收层计算，治疗钳制生命上限',()=>{
 const damage=resolveVitalityPrimitive({spec:{kind:'damage',power:50,armorFactor:0},hp:10,maxHp:10});assert.equal(damage.rawAmount,50);assert.equal(damage.amount,10);assert.equal(damage.nextHp,0);
 assert.equal(resolveVitalityPrimitive({spec:{kind:'heal',power:20},hp:8,maxHp:10}).amount,2);
 assert.equal(resolveVitalityPrimitive({spec:{kind:'damage',power:20,armorFactor:0},hp:50,maxHp:50,resistance:.4,multiplier:.5}).amount,6);
});
test('防护按门类消耗且允许完全抵消，过期不减伤，不重复叠加',()=>{
 const d=draft();applyProtectionPrimitive(d,{spec:protection(10),target:'player',spell:'test',duration:5},'shield');
 assert.deepEqual(consumeMagicProtection(d,'player',6,'cold'),{damage:6,absorbed:0});assert.equal(d.get('state','effects','shield','remaining'),10);
 assert.equal(consumeMagicProtection(d,'player',6,'fire').damage,0);assert.equal(d.get('state','effects','shield','remaining'),4);
 applyProtectionPrimitive(d,{spec:protection(8),target:'player',spell:'test',duration:5},'second');const hit=consumeMagicProtection(d,'player',10,'fire');assert.equal(hit.damage,2);assert.equal(hit.absorbed,8);assert.equal(d.get('state','effects','shield','remaining'),4);
 d.set(['state','minute'],5);assert.equal(consumeMagicProtection(d,'player',10,'fire').damage,10);
});
test('相同强度按稳定编号处理，损坏防护记录拒绝改账',()=>{
 const d=draft();for(const id of ['b','a'])applyProtectionPrimitive(d,{spec:protection(),target:'player',spell:'test',duration:5},id);
 assert.equal(consumeMagicProtection(d,'player',1,'fire').effect,'a');assert.throws(()=>applyProtectionPrimitive(d,{spec:protection(),target:'player',spell:'test',duration:5},'a'),/编号已存在/);
 d.set(['state','effects','b','remaining'],11);const before=structuredClone(d.document);assert.throws(()=>consumeMagicProtection(d,'player',2,'fire'),/损坏/);assert.deepEqual(d.document,before);
});
async function setup(){const world=await loadWorld(),base=world.spells[0];for(const [id,spec]of [['shield',protection(10)],['fire',{kind:'damage',power:50,damageType:'fire',armorFactor:0}],['heal',{kind:'heal',power:5}]]){world.skills.push({id:`skill_m4_${id}`,name:id,attribute:'精神',profession:null});world.spells.push({...base,id:`spell_m4_${id}`,name:`测试${id}`,skill:`skill_m4_${id}`,mp:2,minutes:1,duration:id==='shield'?5:0,effectSpec:spec});}const engine=new WorldEngine(world),document=engine.initialFromLegacy(seed,'m4-primitives');document.state.player.mp=100;document.state.player.maxMp=100;for(const s of world.spells){document.state.spells[s.id]={source:{type:'fixture'}};document.state.skills[s.skill]={proficiency:10,breakthroughs:[],daily:{}};}const run=async(doc,args,id)=>{const out=await engine.reduce(doc,{tool:'world_cast',args,eventId:id});return{result:out.result,document:applyPatches(doc,out.patches)};};return{world,engine,document,run};}
async function success(run,doc,args){for(let i=0;i<100;i++){const out=await run(doc,args,`m4-cast-${i}`);if(out.result.success)return{...out,eventId:`m4-cast-${i}`};}throw new Error('缺少成功检定');}
test('真实施法写吸收余量并扣魔力，过量伤害不会因低生命值漏扣',async()=>{
 const {document,run}=await setup();document.state.player.hp=10;document.state.player.maxHp=10;
 const shield=await success(run,document,{spell:'spell_m4_shield',target:'player'});assert.equal(shield.document.state.player.mp,98);assert.equal(shield.result.absorption,10);
 const hit=await success(run,shield.document,{spell:'spell_m4_fire',target:'player'});assert.equal(hit.result.absorbed,10);assert.equal(hit.result.damage,10);assert.equal(hit.document.state.player.hp,0);assert.equal(hit.document.state.effects[shield.eventId].remaining,0);
 assert.deepEqual(await run(document,{spell:'spell_m4_shield',target:'player'},shield.eventId),{result:shield.result,document:shield.document});
});
test('治疗同意在耗时期间到期时仍扣施法成本，但不治疗目标',async()=>{
 const {document,run}=await setup();document.state.npcs.npc_hw_linsui.hp=1;document.state.records.consent={category:'authorization',subject:'npc_hw_linsui',grantor:'npc_hw_linsui',grantee:'player',action:'healing',expires:document.state.minute+1};
 let found;for(let i=0;i<100;i++){const out=await run(document,{spell:'spell_m4_heal',target:'林穗',authorization:'consent'},`m4-expire-${i}`);if(out.result.checkSuccess){found=out;break;}}
 assert.ok(found);assert.equal(found.result.success,false);assert.match(found.result.effectFailed,/同意/);assert.equal(found.document.state.npcs.npc_hw_linsui.hp,1);assert.equal(found.document.state.player.mp,98);
});
test('施法期间目标离场不能被远程命中',async()=>{
 const {engine,document,run}=await setup(),advance=engine.advance;engine.advance=function(d,minutes,id){advance.call(this,d,minutes,id);d.set(['state','npcs','npc_hw_linsui','location'],'loc_hw_gate');};
 let found;for(let i=0;i<100;i++){const out=await run(document,{spell:'spell_m4_fire',target:'林穗'},`m4-move-${i}`);if(out.result.checkSuccess){found=out;break;}}
 assert.ok(found);assert.equal(found.result.success,false);assert.match(found.result.effectFailed,/不在场/);assert.equal(found.document.state.npcs.npc_hw_linsui.hp,document.state.npcs.npc_hw_linsui.hp);
});
