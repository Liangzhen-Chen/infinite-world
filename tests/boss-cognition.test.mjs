import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {loadWorld}from'../tools/load-world.mjs';
import {validateWorld}from'../tools/validate-world.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {applyPatches,CampaignStorage}from'../server-plugin/storage.mjs';
import {planRuleStateMigration}from'../server-plugin/rule-state-migration.mjs';
import {planBossMigration}from'../server-plugin/boss-migration.mjs';
import {readBossCognition,rememberBossEncounter,bossPublicAttitude,validateBossCognition}from'../server-plugin/boss-cognition.mjs';
const source=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const target='boss_shadow_sentinel',lair='lair_shadow_sentinel',ordinary='boss_mud_tusk';
function setup(goal){
    const world=structuredClone(source),boss=world.bosses.find(b=>b.id===target);
    if(goal)boss.cognition={goal,territory:[boss.lair]};
    const engine=new WorldEngine(world),fresh=engine.createCharacter(legacy,{},'boss-cognition');
    const document=applyPatches(fresh,planRuleStateMigration(fresh,world.rules));
    document.state.location=boss.lair;document.state.player.level=50;document.state.player.hp=10000;document.state.player.maxHp=10000;
    const run=async(doc,tool,args,eventId)=>{const out=await engine.reduce(doc,{tool,args,eventId});return{document:applyPatches(doc,out.patches),result:out.result};};
    return{world,engine,document,run};
}
const approach=(run,doc,id='enter')=>run(doc,'world_lair',{operation:'approach',lair},id);
const observe=(run,doc,id='look')=>run(doc,'world_lair',{operation:'observe',lair},id);
const draft=document=>({document,get(...keys){return keys.reduce((o,k)=>o?.[k],this.document);},set(keys,value){this.document=applyPatches(this.document,[{op:'set',path:keys,value}]);}});
const encounters=doc=>doc.state.creatures[target].cognition.encounters;

test('正式智能首领按实际接触认人，观察不制造接触或获知未见记忆',async()=>{
    const{document,run}=setup(),before=structuredClone(document);
    const unseen=await observe(run,document);assert.equal(unseen.result.occupant,null);assert.deepEqual(unseen.document,before);
    const first=await approach(run,document),contact=first.result.contact.cognition;
    assert.equal(contact.attitude,'守界警告');assert.equal(contact.recognized,true);assert.equal(contact.contacts,1);
    assert.deepEqual(encounters(first.document),[{event:'enter',actor:'player',kind:'approach',minute:first.document.state.minute,location:document.state.location}]);
    const view=await observe(run,first.document);assert.deepEqual(view.document,first.document);assert.deepEqual(view.result.occupant.cognition,contact);
    const second=await approach(run,first.document,'visit2');assert.equal(second.result.contact.cognition.contacts,2);
    assert.deepEqual(second.document.state.inventory,document.state.inventory);
    const remote=structuredClone(second.document);remote.state.location='loc_hw_dock';
    await assert.rejects(approach(run,remote,'remote'),/没有可接触/);assert.equal(bossPublicAttitude(draft(remote),setup().engine,target),undefined);
});

test('实际交锋使守界首领敌对，和平重访不抹除攻击；不同个体记忆独立',async()=>{
    const{document,run}=setup();let doc=(await approach(run,document)).document;
    doc.state.creatures[target].hp=10000;doc.state.creatures[target].maxHp=10000;
    const fight=await run(doc,'world_combat',{target},'attack1');
    assert.equal(encounters(fight.document).length,2);assert.equal(encounters(fight.document)[1].tactic,'unarmed');
    assert.equal(encounters(fight.document)[1].event,'attack1');assert.match(fight.result.messages.join('\n'),/敌对防备/);
    const visit=await approach(run,fight.document,'visit');assert.equal(visit.result.contact.cognition.attitude,'敌对防备');
    assert.equal(visit.result.contact.cognition.clashes,1);
    const other=await run(visit.document,'world_lair',{operation:'approach',lair:'lair_broken_burrow'},'other');
    assert.equal(other.result.contact.cognition.clashes,0);assert.equal(other.result.contact.cognition.attitude,'守界警告');
    assert.deepEqual(encounters(other.document),encounters(visit.document));
});

test('目标与领地决定公开态度，防守、撤离和重伤均使用实际状态',async()=>{
    const cautious=setup('avoid_conflict');let doc=(await approach(cautious.run,cautious.document)).document;
    assert.equal((await observe(cautious.run,doc)).result.occupant.cognition.attitude,'谨慎容忍');
    doc.state.creatures[target].hp=10000;doc.state.creatures[target].maxHp=10000;
    const defended=await cautious.run(doc,'world_combat',{target,intent:'defend'},'defend');
    assert.equal((await observe(cautious.run,defended.document)).result.occupant.cognition.attitude,'谨慎容忍');
    const attacked=await cautious.run(defended.document,'world_combat',{target},'attack');
    assert.equal((await observe(cautious.run,attacked.document)).result.occupant.cognition.attitude,'回避冲突');
    const keeper=setup();let guarded=(await approach(keeper.run,keeper.document)).document;
    guarded.state.creatures[target].hp=10000;guarded.state.creatures[target].maxHp=10000;
    guarded=(await keeper.run(guarded,'world_combat',{target,intent:'flee'},'flee')).document;
    assert.equal((await observe(keeper.run,guarded)).result.occupant.cognition.attitude,'守界警告');
    const away=structuredClone(attacked.document);away.state.location='loc_hw_dock';away.state.creatures[target].location=away.state.location;
    const view=bossPublicAttitude(draft(away),keeper.engine,target);assert.equal(view.inTerritory,false);assert.equal(view.attitude,'认得来者');
    const wounded=structuredClone(attacked.document);wounded.state.creatures[target].hp=1;
    assert.equal((await observe(cautious.run,wounded)).result.occupant.cognition.attitude,'退守');
});

test('拒绝的请求与非智能个体不写认知，损坏记忆拒绝覆盖，事件去重',async()=>{
    const{document,run,engine}=setup(),entered=(await approach(run,document)).document,snapshot=structuredClone(entered);
    await assert.rejects(run(entered,'world_combat',{target,intent:'invented'},'invalid'),/交锋意图/);
    await assert.rejects(run(entered,'world_lair',{lair,operation:'invented'},'invalid'),/巢穴操作/);assert.deepEqual(entered,snapshot);
    const ordinaryVisit=await run(entered,'world_lair',{operation:'approach',lair:'lair_mud_tusk'},'boar');
    assert.equal(ordinaryVisit.result.contact.cognition,undefined);assert.equal(ordinaryVisit.document.state.creatures[ordinary].cognition,undefined);
    const d=draft(entered);rememberBossEncounter(d,engine,target,{kind:'approach',eventId:'enter'});assert.deepEqual(d.document,entered);
    assert.throws(()=>rememberBossEncounter(d,engine,target,{kind:'clash',tactic:'armed',eventId:'enter'}),/编号冲突/);
    for(const mutate of [a=>a.cognition=null,a=>a.cognition.format=9,a=>a.cognition.encounters.push(a.cognition.encounters[0]),a=>a.cognition.encounters[0].minute=-1]){
        const corrupt=structuredClone(entered);mutate(corrupt.state.creatures[target]);const before=structuredClone(corrupt);
        await assert.rejects(approach(run,corrupt,'corrupt'),/接触记忆/);assert.deepEqual(corrupt,before);
    }
});

test('旧档已有巢穴仍能补空认知，保留伤势和历史；死亡不复活且不补造交锋',async()=>{
    const{document,run,engine,world}=setup(),old=(await approach(run,document)).document;
    old.state.creatures[target].battleMemory={tactics:{armed:5},lastEvent:'historical'};delete old.state.creatures[target].cognition;
    const before=structuredClone(old),next=applyPatches(old,planBossMigration(old,engine.rules,world.bosses));assert.deepEqual(old,before);
    assert.deepEqual(readBossCognition(next.state.creatures[target]),{format:1,encounters:[]});assert.deepEqual(planBossMigration(next,engine.rules,world.bosses),[]);
    assert.deepEqual(next.state.inventory,old.state.inventory);assert.deepEqual(next.memories,old.memories);assert.deepEqual(next.state.creatures[target].battleMemory,old.state.creatures[target].battleMemory);
    const dead=structuredClone(old);dead.state.creatures[target].hp=0;dead.state.creatures[target].status='死亡';delete dead.state.records[`lair:${lair}`];
    const migrated=applyPatches(dead,planBossMigration(dead,engine.rules,world.bosses));assert.equal(migrated.state.creatures[target].hp,0);
    assert.equal(migrated.state.records[`lair:${lair}`].status,'空置');assert.deepEqual(encounters(migrated),[]);
    assert.equal((await approach(run,migrated,'dead')).result.contact,null);
});

test('认知模板拒绝未实现目标和伪领地，不改变正式世界数据',()=>{
    const{world}=setup('avoid_conflict'),locations=new Set(world.locations.map(l=>l.id));
    assert.deepEqual(validateBossCognition(world.bosses.find(b=>b.id===target),locations),[]);
    assert.deepEqual(validateWorld(world).errors,validateWorld(source).errors);
    for(const mutate of [c=>c.goal='invented',c=>c.territory=['loc_unknown'],c=>c.territory=['loc_hw_dock'],c=>c.territory.push(c.territory[0]),c=>c.fabricatedHistory=['虚构']]){
        const bad=structuredClone(world);mutate(bad.bosses.find(b=>b.id===target).cognition);
        assert.ok(validateWorld(bad).errors.some(error=>error.startsWith(`${target}:首领认知`)));
    }
    const bad=structuredClone(world);bad.bosses.find(b=>b.id===ordinary).cognition={goal:'defend_territory',territory:['loc_hw_northwood']};
    assert.ok(validateWorld(bad).errors.includes(`${ordinary}:认知模板只适用于智能首领`));
    assert.equal(source.bosses.find(b=>b.id===target).cognition,undefined);
});

test('伤害法术沿已有交锋接点留下认知，败亡保留最后经历且不再公开回应',async()=>{
    const{world,document}=setup(),spell={...world.spells[0],id:'spell_boss_cognition_fire',name:'隔离认知火束',skill:'skill_light',mp:1,duration:0,
        effectSpec:{kind:'damage',power:50,damageType:'fire'}};
    world.spells.push(spell);const engine=new WorldEngine(world);
    const run=async(doc,tool,args,eventId)=>{const out=await engine.reduce(doc,{tool,args,eventId});return{document:applyPatches(doc,out.patches),result:out.result};};
    let doc=(await approach(run,document)).document;doc.state.spells[spell.id]={learned:true};
    doc.state.skills.skill_light={proficiency:120,daily:{},breakthroughs:[]};doc.state.player.mp=100;doc.state.player.maxMp=100;
    doc.state.creatures[target].hp=1;let cast;
    for(let i=0;i<40&&doc.state.creatures[target].status!=='死亡';i++){
        cast=await run(doc,'world_cast',{spell:spell.id,target},`fire${i}`);doc=cast.document;
    }
    assert.equal(doc.state.creatures[target].status,'死亡');
    const final=encounters(doc).at(-1);assert.equal(final.event,doc.state.creatures[target].battleMemory.lastEvent);assert.equal(final.tactic,'magic_fire');
    assert.equal(bossPublicAttitude(draft(doc),engine,target),undefined);
    const before=structuredClone(doc);assert.equal((await approach(run,doc,'after-death')).result.contact,null);
    assert.deepEqual(encounters(doc),encounters(before));
});

test('存档重启、导出导入与回滚保留真实首领认知，同一请求不重复计数',async t=>{
    const{document,engine}=setup(),directory=await fs.mkdtemp(path.join(os.tmpdir(),'boss-cognition-'));
    t.after(()=>fs.rm(directory,{recursive:true,force:true}));const reducer=(doc,input)=>engine.reduce(doc,input),store=new CampaignStorage(directory,{reducer});
    await store.create({id:'boss',worldVersion:engine.world.version,document});
    const enter={id:'enter',anchor:'a1',input:{tool:'world_lair',args:{operation:'approach',lair},eventId:'enter'}};
    await store.transact('boss',enter,reducer);const first=(await store.read('boss')).document;
    const fight={id:'fight',anchor:'a2',input:{tool:'world_combat',args:{target},eventId:'fight'}};
    await store.transact('boss',fight,reducer);const fought=(await store.read('boss')).document;
    assert.equal(encounters(fought).length,2);await store.transact('boss',fight,reducer);assert.deepEqual((await store.read('boss')).document,fought);
    const reboot=new CampaignStorage(directory,{reducer});assert.deepEqual((await reboot.read('boss')).document,fought);
    assert.deepEqual((await reboot.import(await reboot.export('boss'),'copy')).document,fought);
    assert.deepEqual((await reboot.reconcile('boss',['a1'],null)).document,first);assert.equal(encounters(first).length,1);
    assert.deepEqual((await reboot.reconcile('boss',[],null)).document,document);
});
