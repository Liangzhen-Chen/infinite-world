import test from'node:test';
import assert from'node:assert/strict';
import fs from'node:fs/promises';
import {loadWorld}from'../tools/load-world.mjs';
import {validateWorld}from'../tools/validate-world.mjs';
import {createPlaytestServer}from'../tools/playtest-runner.mjs';
import {compatibleWorld}from'../server-plugin/world-upgrade.mjs';
import {withoutMonsterSociety}from'../tools/publish-monster-society.mjs';
import {withoutMonsterSociety2} from '../tools/publish-monster-society-2.mjs';

const candidate=JSON.parse(await fs.readFile('world/drafts/w5/social-candidate.json','utf8'));
const socialWorld=async()=>({...await loadWorld(),...structuredClone(candidate)});

test('势力历史进入正式校验，拒绝坏归属、伪造公开说明、古人复活及纪元错误',async()=>{
    const world=await socialWorld();assert.equal(validateWorld(world).ok,true);
    for(const [change,expected]of [
        [w=>w.factionPeople[0].faction=w.factions[1].id,/成员未登记或归属/],
        [w=>w.factions[0].publicDescription+=w.factions[0].privateGoal,/公开说明/],
        [w=>w.history[0].participants[0].id='npc_hw_linsui',/古代参与者/],
        [w=>w.history[0].era='era_missing',/纪年/],
        [w=>w.factionPeople[0].location='loc_missing',/名册位置/],
    ]){const broken=structuredClone(world);change(broken);assert.match(validateWorld(broken).errors.join('\n'),expected);}
});

test('HTTP目录和搜索共用公开投影，内部目标与历史真相不外泄，名册不能冒充在场商人',async t=>{
    const world=await socialWorld(),faction=world.factions[0],past=world.history[0];
    faction.privateGoal='密封赤苇暗号';faction.prose.internalLife+='密封赤苇暗号';faction.description=Object.values(faction.prose).join('\n');
    past.accounts.verified.claim='隐秘旧约原本';world.factionPeople[0].concern='密封赤苇暗号';
    const server=await createPlaytestServer({world});t.after(server.close);
    const initial=await server.api('create',{character:{}}),campaignId=initial.reference.campaignId;
    const entry=await server.api('catalog',{campaignId,entity:faction.name});
    assert.equal(entry.description,faction.publicDescription);assert.equal(entry.contactAnchor,faction.contactAnchor);
    for(const field of['privateGoal','resources','clock','leader','coreMembers','prose','relations'])assert.equal(entry[field],undefined);
    const history=await server.api('catalog',{campaignId,entity:past.id});assert.equal(history.verified,false);assert.match(history.description,/未经核实/);
    assert.ok(history.description.includes(past.accounts.received.falseClaim));assert.doesNotMatch(JSON.stringify(history),/隐秘旧约原本/);
    for(const query of[faction.name,'密封赤苇暗号',past.name,'隐秘旧约原本']){
        const response=await server.api('search',{campaignId,query});assert.doesNotMatch(JSON.stringify(response),/密封赤苇暗号|隐秘旧约原本/);
    }
    const scene=await server.api('scene',{campaignId,query:faction.name});assert.doesNotMatch(scene.scene,/密封赤苇暗号/);
    assert.equal(Object.keys(initial.document.state.npcs).length,world.npcs.length);
    for(const row of world.factionPeople)assert.equal(initial.document.state.npcs[row.id],undefined);
    await assert.rejects(server.api('catalog',{campaignId,entity:world.factionPeople[0].id}),/公开规则目录/);
    await assert.rejects(server.api('execute',{campaignId,tool:'world_trade',args:{seller:world.factionPeople[0].name,item:'item_bread',quantity:1},eventId:'phantom'}));
    assert.deepEqual((await server.api('read',{campaignId})).document,initial.document);
});

test('旧战役升级加入社会资料不实例化名册或资源，导出往返和历史编号保留',async t=>{
    const old=withoutMonsterSociety2(withoutMonsterSociety(await loadWorld())),baseline=JSON.parse(await fs.readFile('world/drafts/m2-people/baseline.json','utf8'));old.npcs=old.npcs.filter(n=>baseline.some(b=>b.id===n.id));for(const key of['factions','history','factionPeople','eras'])old[key]=[];
    old.rules.worldClock.clocks=old.rules.worldClock.clocks.filter(c=>old.factions.some(f=>f.id===c.faction));
    const original=await createPlaytestServer({world:old});t.after(original.close);
    const created=await original.api('create',{}),id=created.reference.campaignId;
    await original.api('execute',{campaignId:id,tool:'world_time',args:{minutes:10},eventId:'before-upgrade'});
    const before=(await original.api('read',{campaignId:id})).document,bundle=await original.api('export',{campaignId:id});
    const next=withoutMonsterSociety2(withoutMonsterSociety(await socialWorld())),server=await createPlaytestServer({world:next});t.after(server.close);
    const imported=await server.api('import',{bundle}),campaignId=imported.reference.campaignId;
    const after=(await server.api('read',{campaignId})).document;
    for(const key of['player','inventory','location','minute','settlements','animals'])assert.deepEqual(after.state[key],before.state[key]);
    assert.equal(Object.keys(before.state.npcs).length,18);
    for(const [id,actor]of Object.entries(before.state.npcs))assert.deepEqual(after.state.npcs[id],actor,id);
    const added=next.npcs.filter(row=>!Object.hasOwn(before.state.npcs,row.id));assert.equal(added.length,next.npcs.length-18);
    assert.deepEqual(Object.keys(after.state.npcs).sort(),next.npcs.map(row=>row.id).sort());
    for(const row of added)assert.deepEqual(after.state.npcs[row.id],{id:row.id,name:row.name,location:row.location,coins:row.coins??0,inventory:row.inventory??{},trust:row.trust??0,affection:row.affection??0,developments:[],relationships:{}},row.id);
    for(const row of [...next.factionPeople,...next.residents])assert.equal(after.state.npcs[row.id],undefined,row.id);
    assert.deepEqual(after.memories,before.memories);
    assert.equal((await server.api('catalog',{campaignId,kind:'faction'})).count,40);
    const response=await server.api('search',{campaignId,query:next.factions[0].name});assert.ok(response.results.some(row=>row.id===`lore_${next.factions[0].id}`));
    const saved=await server.api('export',{campaignId}),restored=await server.api('import',{bundle:saved});assert.deepEqual(restored.document,after);
    const removed=structuredClone(next);for(const key of['factions','history','factionPeople','eras'])removed[key]=[];
    const compatible=compatibleWorld(next,removed);for(const key of['factions','history','factionPeople','eras'])assert.deepEqual(compatible.world[key],next[key]);
    assert.equal(validateWorld(compatible.world).ok,true);
});
