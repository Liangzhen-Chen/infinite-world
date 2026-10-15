import test from 'node:test';
import assert from 'node:assert/strict';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {deriveReputationRegistry,reputationSettlements,reputationFactions} from '../server-plugin/reputation-registry.mjs';
import {settlementAt} from '../server-plugin/reputation.mjs';
import {standingKind,collectivesOf} from '../server-plugin/standing.mjs';

const world=await loadWorld(),manual=world.rules.reputation;
const pure=w=>deriveReputationRegistry(w,{...w.rules.reputation,settlements:[],factions:[]});

test('K10：只从 world 数据派生的聚落是手填 rules.reputation.settlements 的超集（现为相等）',()=>{
    const derived=pure(world).settlements;
    for(const id of manual.settlements)assert.ok(derived.includes(id),`派生缺少手填聚落 ${id}`);
    assert.deepEqual([...derived].sort(),[...manual.settlements].sort());
});

test('K10：只从 world 数据派生的势力与成员覆盖每条手填条目（id、members、relations、source 相同）',()=>{
    const derived=new Map(pure(world).factions.map(f=>[f.id,f]));
    for(const f of manual.factions){
        const d=derived.get(f.id);assert.ok(d,`派生缺少手填势力 ${f.id}`);
        for(const m of f.members)assert.ok(d.members.includes(m),`${f.id} 派生缺成员 ${m}`);
        assert.deepEqual(d.members,f.members);assert.deepEqual(d.relations,f.relations);assert.equal(d.source,f.source);
    }
    // T142后正式势力目录多于手填条目：未手填的非魔物社会势力按设计只靠数据派生接入（手填之外不多不少）。
    const seats=new Set(world.locations.filter(l=>l.monsterSociety).map(l=>l.id));
    assert.deepEqual([...derived.keys()].sort(),[...new Set([...manual.factions.map(f=>f.id),...world.factions.filter(f=>!seats.has(f.contactAnchor)).map(f=>f.id)])].sort());
    for(const f of world.factions.filter(f=>!seats.has(f.contactAnchor)&&!manual.factions.some(m=>m.id===f.id))){
        const d=derived.get(f.id);assert.equal(d.derived,true);assert.equal(d.source,`world/lore/factions.json#${f.id}`);
        assert.deepEqual(d.relations,f.relations);assert.equal(d.members[0],f.leader);for(const m of f.coreMembers??[])assert.ok(d.members.includes(m),`${f.id} 派生缺核心成员 ${m}`);
    }
});

test('K10：引擎读到的登记 = 手填覆盖在前 + 派生；与现有手填结果逐项一致',()=>{
    const engine=new WorldEngine(world);
    assert.deepEqual(reputationSettlements(engine),manual.settlements);
    const rows=reputationFactions(engine);
    assert.deepEqual(rows.slice(0,manual.factions.length),manual.factions);
    assert.deepEqual(rows.slice(manual.factions.length),pure(world).factions.filter(f=>!manual.factions.some(m=>m.id===f.id)));
    assert.equal(settlementAt(engine,'loc_hw'),'loc_hw');
});

test('K10：新内容只写数据即接入——新聚落档案、新势力与人物归属',()=>{
    const w=structuredClone(world);
    delete w.rules.reputation.settlements;w.rules.reputation.factions=w.rules.reputation.factions.slice(1);
    const old=world.rules.reputation.factions[0];
    const person=w.npcs.find(n=>n.id==='npc_hw_ayan');person.faction='faction_k10';
    w.locations.push({id:'loc_k10_town',name:'试炼镇',aliases:[],parent:null,scope:'loc_k10_town',coordinates:[0,0],terrain:'平原'});
    w.settlementProfiles.push({...structuredClone(w.settlementProfiles.find(p=>p.id==='loc_hw')),id:'loc_k10_town',parent:null});
    w.factions.push({...structuredClone(w.factions.find(f=>f.id===old.id)),id:'faction_k10',name:'试炼会',leader:'npc_hw_linsui',coreMembers:[],relations:[{faction:old.id,score:40,reason:'测试'}]});
    const engine=new WorldEngine(w);
    assert.ok(reputationSettlements(engine).includes('loc_k10_town'));
    assert.ok(manual.settlements.every(id=>reputationSettlements(engine).includes(id)));
    const f=reputationFactions(engine).find(f=>f.id==='faction_k10');
    assert.deepEqual(f.members,['npc_hw_linsui','npc_hw_ayan']);
    assert.deepEqual(reputationFactions(engine).find(f=>f.id===old.id).members,old.members);
    assert.equal(standingKind(engine,{npcs:{}},'loc_k10_town'),'settlement');
    const rows=collectivesOf(engine,{npcs:{npc_hw_ayan:{location:'loc_hw',status:'正常'}},records:{}},'npc_hw_ayan');
    assert.ok(rows.some(r=>r.holder==='faction_k10'&&r.via==='faction:faction_k10'));
    // Monster-society seats keep their own stance and are not derived as settlements or factions.
    assert.ok(!reputationSettlements(engine).some(id=>id.startsWith('loc_ms_')));
    assert.ok(!reputationFactions(engine).some(f=>f.id.startsWith('faction_ms_')));
});

test('K10：没有 rules.reputation 时不派生',()=>{
    assert.deepEqual(deriveReputationRegistry(world,undefined),{settlements:[],factions:[]});
});
