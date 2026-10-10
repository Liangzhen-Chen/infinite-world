import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {loadWorld} from '../tools/load-world.mjs';
import {withBosses} from '../world/design/boss-foundation.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches,CampaignStorage} from '../server-plugin/storage.mjs';
import {planBossMigration} from '../server-plugin/boss-migration.mjs';
import {planRuleStateMigration} from '../server-plugin/rule-state-migration.mjs';
import {validateWorld} from '../tools/validate-world.mjs';
import {readStateSection} from '../extension/state-read.mjs';
import {balanceReport} from '../tools/balance-combat.mjs';
import {toolResultWithClock} from '../extension/turn.mjs';
const legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const source=withBosses(await loadWorld());
test('学习防备与实际交锋共用公式后，六组各一万次、三独立种子仍达原平衡目标',()=>{
    for(const seed of [20261010,20330615,409033]){
        const report=balanceReport(source.rules,{seed});assert.equal(report.pass,true,JSON.stringify(report.results.map(r=>({id:r.id,rate:r.winRate}))));
    }
});
const lair=c=>c.state.records['lair:lair_mud_tusk'];
function setup(){
    const world=structuredClone(source),engine=new WorldEngine(world),fresh=engine.createCharacter(legacy,{},'boss-tests'),c=applyPatches(fresh,planRuleStateMigration(fresh,world.rules));
    c.state.location='loc_hw_northwood';c.state.player.level=30;c.state.player.maxHp=3000;c.state.player.hp=3000;
    const run=async(doc,tool,args,id)=>{const out=await engine.reduce(doc,{tool,args,eventId:id});return{document:applyPatches(doc,out.patches),result:out.result};};
    return{world,engine,c,run};
}
const enter=(run,c,id='enter')=>run(c,'world_lair',{operation:'approach',lair:'lair_mud_tusk'},id);
async function killed(run,c){let d=(await enter(run,c)).document;d.state.creatures.boss_mud_tusk.hp=1;
    for(let i=0;i<40&&d.state.creatures.boss_mud_tusk.status!=='死亡';i++)d=(await run(d,'world_combat',{target:'boss_mud_tusk'},`kill${i}`)).document;
    assert.equal(d.state.creatures.boss_mud_tusk.status,'死亡');return d;
}
test('首领与巢穴规则拒绝坏等级、远程部下、同种刷新和重复巢穴',()=>{
    assert.equal(validateWorld(source).ok,true);
    for(const mutate of [w=>w.bosses[0].tier=99,w=>w.bosses[0].level=201,w=>w.bosses[0].residence.location='loc_bs',
        w=>w.bosses[0].residence.replacementSpecies=['monster_bristle_boar'],w=>w.bosses[0].minions=['monster_black_fin_perch'],
        w=>w.bosses[0].monster='monster_black_fin_perch',w=>w.bosses[0].minions=[],
        w=>w.bosses[1].residence.id=w.bosses[0].residence.id,w=>w.rules.bossEcology.maximumDamageReduction=2]){
        const bad=structuredClone(source);mutate(bad);assert.equal(validateWorld(bad).ok,false);
    }
});
test('旧首领迁移保留伤势、归属和记忆；已死首领不复活，不补战术',()=>{
    const{engine}=setup(),old=engine.initialFromLegacy(legacy,'old-boss');old.state.minute=99*1440;
    old.state.creatures={boss_mud_tusk:{name:'泥鬃裂牙',hp:0,maxHp:90,status:'死亡',location:'loc_hw_northwood',owner:null}};
    const before=structuredClone(old),next=applyPatches(old,planBossMigration(old,engine.rules,engine.world.bosses));
    assert.deepEqual(old,before);assert.equal(next.state.creatures.boss_mud_tusk.hp,0);assert.equal(next.state.creatures.boss_mud_tusk.status,'死亡');
    assert.equal(next.state.creatures.boss_mud_tusk.battleMemory,undefined);assert.deepEqual(next.memories,old.memories);assert.deepEqual(next.state.inventory,old.state.inventory);
    assert.equal(lair(next).status,'空置');assert.equal(lair(next).initializedDay,99);assert.equal(lair(next).reoccupyAfter,106);
    assert.deepEqual(planBossMigration(next,engine.rules,engine.world.bosses),[]);
    lair(next).format=9;assert.throws(()=>planBossMigration(next,engine.rules,engine.world.bosses),/冲突/);
});
test('入口观察只读且不知未见首领；进入仅接触一次，部下从实际种群扣',async()=>{
    const{c,run}=setup(),before=structuredClone(c);
    const view=await run(c,'world_lair',{operation:'observe',lair:'lair_mud_tusk'},'look');assert.equal(view.result.occupant,null);assert.deepEqual(view.document,before);
    assert.ok(Object.values(readStateSection(c.state,'记录')).every(row=>row.category!=='lair'));
    const first=await enter(run,c),second=await enter(run,first.document,'again');assert.equal(second.result.contact.id,first.result.contact.id);
    assert.equal(first.document.state.minute,c.state.minute+10);assert.equal(first.result.minions.length,2);
    assert.deepEqual(first.document.state.inventory,c.state.inventory);assert.equal(first.document.state.creatures.boss_mud_tusk.battleMemory.lastEvent,null);
    const stock=doc=>doc.state.records['ecology:habitat_hw_wood'].populations.monster_bristle_boar;
    assert.equal(stock(first.document).withdrawn-stock(c).withdrawn,2);assert.equal(stock(second.document).withdrawn,stock(first.document).withdrawn);
    const remote=structuredClone(c);remote.state.location='loc_bs';await assert.rejects(enter(run,remote),/没有可接触/);
});
test('首领对实际交锋记忆加强防备，换战术有效，拒绝操作不写记忆',async()=>{
    const{c,run}=setup();let d=(await enter(run,c)).document;d.state.creatures.boss_mud_tusk.hp=10000;d.state.creatures.boss_mud_tusk.maxHp=10000;
    for(let i=0;i<2;i++)d=(await run(d,'world_combat',{target:'boss_mud_tusk'},`learn${i}`)).document;
    assert.equal(d.state.creatures.boss_mud_tusk.battleMemory.tactics.unarmed,2);
    const corrupt=structuredClone(d);corrupt.state.creatures.boss_mud_tusk.battleMemory.tactics.unarmed='伪造次数';const snapshot=structuredClone(corrupt);
    await assert.rejects(run(corrupt,'world_combat',{target:'boss_mud_tusk'},'corrupt'),/记忆数据损坏/);assert.deepEqual(corrupt,snapshot);
    const before=structuredClone(d);await assert.rejects(run(d,'world_combat',{target:'boss_mud_tusk',intent:'invented'},'bad'),/交锋意图/);assert.deepEqual(d,before);
    const naive=structuredClone(d);naive.state.creatures.boss_mud_tusk.battleMemory={tactics:{},lastEvent:null};let seen;
    for(let i=0;i<40;i++){
        const trained=await run(d,'world_combat',{target:'boss_mud_tusk'},`compare${i}`),raw=await run(naive,'world_combat',{target:'boss_mud_tusk'},`compare${i}`);
        if(raw.result.damage>1){assert.ok(trained.result.damage<raw.result.damage);assert.equal(trained.result.adaptation.guarded,true);
            const receipt=toolResultWithClock(trained.result,{startMinute:d.state.minute,minute:trained.document.state.minute});
            assert.equal(receipt.actionScope.seconds,10);assert.match(receipt.turnClock.tailRule,/尾注写0分/);seen=true;break;}
    }assert.equal(seen,true);
    const changed=await run(d,'world_combat',{target:'boss_mud_tusk',intent:'defend'},'new_tactic');assert.equal(changed.result.adaptation,undefined);
    assert.equal(changed.document.state.creatures.boss_mud_tusk.battleMemory.tactics.defend,1);
});
test('败亡空巢满七天才从当地种群迁入不同生物，长短等待结果一致',async()=>{
    const{c,run}=setup(),dead=await killed(run,c);assert.equal(lair(dead).status,'空置');assert.equal(dead.state.creatures.boss_mud_tusk.corpse.status,'未取材');
    assert.equal(dead.state.inventory.item_rawhide,undefined);
    const six=(await run(dead,'world_time',{minutes:6*1440},'six')).document;assert.equal(lair(six).occupant,null);
    const long=(await run(dead,'world_time',{minutes:7*1440},'seven')).document;let split=dead;
    for(let i=0;i<7;i++)split=(await run(split,'world_time',{minutes:1440},`day${i}`)).document;
    assert.deepEqual(lair(long),lair(split));assert.deepEqual(long.state.creatures,split.state.creatures);
    assert.equal(lair(long).occupant.kind,'monster');assert.equal(lair(long).occupant.definition,'monster_leaf_hare');
    assert.equal(long.state.creatures.boss_mud_tusk.status,'死亡');
    const entered=await enter(run,long,'after');assert.equal(entered.result.contact.id,lair(long).occupant.actor);assert.equal(entered.result.contact.name.startsWith('落叶林兔'),true);
});
test('迁入物种已灭绝就保持空置，不靠世界时钟凭空造替代者',async()=>{
    const{c,run}=setup(),dead=await killed(run,c),p=dead.state.records['ecology:habitat_hw_wood'].populations.monster_leaf_hare;
    p.withdrawn+=p.count;p.count=0;const later=(await run(dead,'world_time',{minutes:30*1440},'month')).document;
    assert.equal(lair(later).status,'空置');assert.equal(lair(later).occupant,null);assert.equal(later.state.creatures.boss_mud_tusk.status,'死亡');
});
test('离开巢穴的同一个体不能隔空接触或复制；日结保留原个体且留下空巢',async()=>{
    const{c,run}=setup(),entered=(await enter(run,c)).document;entered.state.creatures.boss_mud_tusk.location='loc_hw_dock';
    const before=structuredClone(entered.state.creatures),out=await enter(run,entered,'away');assert.equal(out.result.contact,null);assert.deepEqual(out.document.state.creatures,before);
    const next=(await run(out.document,'world_time',{minutes:1440},'next_day')).document;
    assert.equal(next.state.creatures.boss_mud_tusk.location,'loc_hw_dock');assert.equal(lair(next).status,'空置');assert.equal(lair(next).occupant,null);
});
test('实际法术杀死野生动物也留下可取材尸体，不能只给经验',async()=>{
    const{world,c}=setup(),base=world.spells[0];world.spells.push({...base,id:'spell_boss_test_fire',name:'隔离测试火束',skill:'skill_light',mp:1,duration:0,effectSpec:{kind:'damage',power:50,damageType:'fire'}});
    const engine=new WorldEngine(world),run=async(doc,tool,args,id)=>{const out=await engine.reduce(doc,{tool,args,eventId:id});return{document:applyPatches(doc,out.patches),result:out.result};};
    let d=(await enter(run,c)).document;d.state.spells.spell_boss_test_fire={learned:true};d.state.skills.skill_light={proficiency:120,daily:{},breakthroughs:[]};d.state.player.mp=100;d.state.player.maxMp=100;d.state.creatures.boss_mud_tusk.hp=1;
    let cast;for(let i=0;i<40;i++){cast=await run(d,'world_cast',{spell:'spell_boss_test_fire',target:'boss_mud_tusk'},`cast${i}`);if(cast.document.state.creatures.boss_mud_tusk.status==='死亡')break;}
    assert.equal(cast.document.state.creatures.boss_mud_tusk.status,'死亡');assert.equal(cast.result.corpse.hasMaterials,true);assert.equal(lair(cast.document).status,'空置');
    assert.equal(cast.document.state.creatures.boss_mud_tusk.battleMemory.tactics.magic_fire,1);assert.equal(cast.document.state.inventory.item_rawhide,undefined);
});
test('首领战术、败亡与巢穴更替在存储重启/导入/删除回合中一致',async t=>{
    const{c,engine}=setup(),base=path.resolve(os.tmpdir()),directory=await fs.mkdtemp(path.join(base,'boss-store-'));assert.ok(directory.startsWith(base+path.sep));
    t.after(()=>fs.rm(directory,{recursive:true,force:true}));const reducer=(doc,input)=>engine.reduce(doc,input),store=new CampaignStorage(directory,{reducer});
    await store.create({id:'boss',worldVersion:engine.world.version,document:c});
    await store.transact('boss',{id:'enter',anchor:'a1',input:{tool:'world_lair',args:{operation:'approach',lair:'lair_mud_tusk'},eventId:'enter'}},reducer);
    for(let i=0;i<2;i++)await store.transact('boss',{id:`fight${i}`,anchor:'a2',input:{tool:'world_combat',args:{target:'boss_mud_tusk'},eventId:`fight${i}`}},reducer);
    const saved=(await store.read('boss')).document;assert.equal(saved.state.creatures.boss_mud_tusk.battleMemory.tactics.unarmed,2);
    for(let i=0;i<40;i++){
        if((await store.read('boss')).document.state.creatures.boss_mud_tusk.status==='死亡')break;
        await store.transact('boss',{id:`kill${i}`,anchor:'a3',input:{tool:'world_combat',args:{target:'boss_mud_tusk'},eventId:`kill${i}`}},reducer);
    }
    const dead=(await store.read('boss')).document;assert.equal(dead.state.creatures.boss_mud_tusk.status,'死亡');assert.equal(lair(dead).status,'空置');
    await store.transact('boss',{id:'week',anchor:'a4',input:{tool:'world_time',args:{minutes:7*1440},eventId:'week'}},reducer);
    const reoccupied=(await store.read('boss')).document;assert.equal(lair(reoccupied).status,'易主');assert.equal(reoccupied.state.creatures.boss_mud_tusk.corpse.status,'未取材');
    assert.deepEqual((await new CampaignStorage(directory,{reducer}).read('boss')).document,reoccupied);assert.deepEqual((await store.import(await store.export('boss'),'copy')).document,reoccupied);
    assert.deepEqual((await store.reconcile('boss',['a1','a2'],null)).document,saved);
    const entered=(await store.reconcile('boss',['a1'],null)).document;assert.equal(entered.state.creatures.boss_mud_tusk.battleMemory.lastEvent,null);
    assert.deepEqual((await store.reconcile('boss',[],null)).document,c);
});
test('独立巢穴迁移CLI使用配套世界归档，不改原档，拒绝覆盖和密钥路径',async t=>{
    const{engine}=setup(),base=path.resolve(os.tmpdir()),directory=await fs.mkdtemp(path.join(base,'boss-cli-'));assert.ok(directory.startsWith(base+path.sep));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
    const input=path.join(directory,'old.json'),output=path.join(directory,'new.json'),archive=path.join(directory,'world.json');
    const old=engine.initialFromLegacy(legacy,'boss-cli');old.state.minute=50*1440;old.state.creatures={boss_mud_tusk:{name:'泥鬃裂牙',hp:0,maxHp:90,status:'死亡',location:'loc_hw_northwood'}};
    const bytes=JSON.stringify(old);await fs.writeFile(input,bytes);await fs.writeFile(archive,JSON.stringify(engine.world));
    const run=(a,b,w=archive)=>spawnSync(process.execPath,['tools/migrate-bosses.mjs',a,b,'--world',w],{encoding:'utf8'});
    const result=run(input,output);assert.equal(result.status,0,result.stderr);assert.equal(await fs.readFile(input,'utf8'),bytes);
    const saved=await fs.readFile(output,'utf8'),next=JSON.parse(saved);assert.equal(lair(next).status,'空置');assert.equal(next.state.creatures.boss_mud_tusk.hp,0);assert.deepEqual(next.memories,old.memories);
    assert.notEqual(run(input,output).status,0);assert.equal(await fs.readFile(output,'utf8'),saved);assert.notEqual(run(input,input).status,0);
    assert.match(run(input,path.join(directory,'forbidden.json'),path.join(directory,'secrets.json')).stderr,/拒绝接触密钥/);
});
