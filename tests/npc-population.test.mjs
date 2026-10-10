import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld}from'../tools/load-world.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {planWorldUpgrade}from'../server-plugin/world-upgrade.mjs';
import {applyPatches}from'../server-plugin/storage.mjs';
const legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
async function fixture(){
    const original=await loadWorld(),world=structuredClone(original);
    const source=world.npcs.find(npc=>npc.id==='npc_hw_linsui');
    const resident={...structuredClone(source),id:'npc_population_new',name:'新增居民测试',aliases:[],coins:37,inventory:{item_bread:2},trust:12,affection:9};
    world.npcs.push(resident);return{original,world,resident};
}
test('新角色包含新目录居民，名册不会变成在场人物，初始财富只来自实际目录',async()=>{
    const {world,resident}=await fixture(),engine=new WorldEngine(world),before=structuredClone(world);
    const fresh=engine.createCharacter(legacy,{},'population'),npc=fresh.state.npcs[resident.id];
    assert.equal(Object.keys(fresh.state.npcs).length,world.npcs.length);
    assert.equal(npc.coins,37);assert.deepEqual(npc.inventory,{item_bread:2});assert.equal(npc.location,resident.location);
    assert.equal(npc.trust,0);assert.equal(npc.affection,0);assert.equal(npc.goals,undefined);assert.equal(npc.secrets,undefined);assert.equal(npc.wealth,undefined);
    assert.ok(world.factionPeople.length>0);assert.ok(world.factionPeople.every(row=>!fresh.state.npcs[row.id]));
    assert.equal(fresh.state.player.coins,legacy.state.player.coins);
    npc.coins=1;npc.inventory.item_bread=0;assert.deepEqual(world,before);
});
test('旧聊天读取不补居民；显式世界升级才新增一次且不重置其他人的财物',async()=>{
    const {original,world,resident}=await fixture(),old=new WorldEngine(original).initialFromLegacy(legacy,'population-old');
    old.state.npcs.npc_hw_linsui.coins=13;
    const read=new WorldEngine(world).initialFromLegacy(legacy,'population-old');assert.equal(read.state.npcs[resident.id],undefined);
    const first=planWorldUpgrade(old,original,world,{worldHash:'population',eventId:'one'}),upgraded=applyPatches(old,first.patches);
    assert.equal(upgraded.state.npcs[resident.id].coins,37);assert.equal(upgraded.state.npcs.npc_hw_linsui.coins,13);
    upgraded.state.npcs[resident.id].coins=7;
    const second=planWorldUpgrade(upgraded,world,world,{worldHash:'population',eventId:'two'});
    assert.equal(applyPatches(upgraded,second.patches).state.npcs[resident.id].coins,7);
    assert.deepEqual(second.result.added,[]);
});
