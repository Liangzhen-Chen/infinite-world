import {relationView} from '../server-plugin/npc-state.mjs';
// A3 causal2: assert the canonical relation view, retaining all numeric expectations.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import fc from 'fast-check';
import {loadWorld}from'../tools/load-world.mjs';
import {derivedStats,monsterStats,strike,seededRandom,simulateFight}from'../server-plugin/combat.mjs';
import {balanceReport}from'../tools/balance-combat.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {WorldEngine as Phase1Engine}from'../server-plugin/compat/v2-phase1-engine.mjs';
import {applyPatches}from'../server-plugin/storage.mjs';
test('战斗平衡：六组每组10000次，独立种子复核全部目标',async()=>{
    const {rules}=await loadWorld();for(const seed of [20261010,20330615,409033]){
        const report=balanceReport(rules,{seed});assert.equal(report.pass,true,JSON.stringify(report.results.map(row=>({id:row.id,rate:row.winRate}))));
    }
});
test('战斗性质：推导生命为正，命中伤害有限非负；确定种子重放相同',async()=>{
    const {rules}=await loadWorld();
    fc.assert(fc.property(fc.integer({min:0,max:200}),fc.integer({min:1,max:100}),fc.integer(),(level,attribute,seed)=>{
        const stats=derivedStats({level,attributes:Object.fromEntries(rules.attributes.map(name=>[name,attribute]))},rules),enemy=monsterStats({level:Math.max(1,level)},rules);
        assert.ok(stats.maxHp>=1&&stats.maxMp>=0&&stats.carryKg>0);
        const a=strike(stats,enemy,seededRandom(seed),rules),b=strike(stats,enemy,seededRandom(seed),rules);
        assert.deepEqual(a,b);assert.ok(Number.isFinite(a.damage)&&a.damage>=0);
    }),{numRuns:200,seed:20261010});
    const high=derivedStats({level:199,attributes:{力量:410,敏捷:8,体质:8,智力:8,精神:8,魅力:8}},rules);
    assert.equal(simulateFight([high],monsterStats({level:220,template:10},rules),rules,seededRandom(77)).won,false);
});
test('旧版战斗重放：已归档世界继续使用阶段1语义，不被新伤害公式改写',async()=>{
    const world=await loadWorld();world.rules=JSON.parse(await fs.readFile('tests/fixtures/native-v2/rules.json','utf8'));world.version=world.rules.version;
    const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),frozen=new Phase1Engine(world),current=new WorldEngine(world);
    const initial=frozen.initialFromLegacy(seed,'old-combat'),input={tool:'world_combat',args:{target:'林穗'},eventId:'historical_hit'};
    const oldResult=await frozen.reduce(initial,input),newResult=await current.reduce(initial,input);
    assert.deepEqual(newResult,oldResult);assert.deepEqual(applyPatches(initial,newResult.patches),applyPatches(initial,oldResult.patches));
    assert.equal(oldResult.result.minute,541);
    assert.equal(current.initialFromLegacy(seed,'old-combat').worldVersion,'engine-baseline-2');
});
test('实际交锋：按 A3 combat.bout 每回合一分钟，坏武器和过级装备拒绝，推搡留下后果',async()=>{
    const engine=new WorldEngine(await loadWorld()),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
    let document=engine.initialFromLegacy(seed,'seconds-test');document.state.player.hp=1000;document.state.player.maxHp=1000;document.state.npcs.npc_hw_linsui.hp=1000;document.state.npcs.npc_hw_linsui.maxHp=1000;
    const startMinute=document.state.minute;
    for(let i=0;i<6;i++){const out=await engine.reduce(document,{tool:'world_combat',args:{target:'林穗',intent:'shove'},eventId:`shove_${i}`});document=applyPatches(document,out.patches);}
    // D31.4 / action-costs combat.bout replaces ten seconds with one minute.
    // Keep exact elapsed time, sub-minute remainder and every social consequence.
    assert.equal(document.state.minute,startMinute+6);assert.equal(document.state.subMinuteSeconds,0);assert.equal(document.state.npcs.npc_hw_linsui.developments.filter(row=>row.type==='被推搡').length,6);assert.equal(relationView(null,document.state,'npc_hw_linsui','player').trust,-30);
    document.state.inventory.item_staff.durability=0;await assert.rejects(engine.reduce(document,{tool:'world_combat',args:{target:'林穗',weapon:'木杖'},eventId:'broken'}),/损坏/);
    document.state.inventory.item_staff.durability=100;document.state.inventory.item_staff.quality='神';await assert.rejects(engine.reduce(document,{tool:'world_combat',args:{target:'林穗',weapon:'木杖'},eventId:'high'}),/160级/);
});
