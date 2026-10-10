import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {loadWorld} from '../tools/load-world.mjs';
import {validateWorld} from '../tools/validate-world.mjs';
import {withSeasonalMigration} from '../world/design/seasonal-migration-foundation.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches,CampaignStorage} from '../server-plugin/storage.mjs';
import {planWildlifeMigration} from '../server-plugin/wildlife-migration.mjs';
import {readStateSection} from '../extension/state-read.mjs';
import {wildlifePriceFactor} from '../server-plugin/wildlife.mjs';
import {initializeR1} from '../server-plugin/migrations/r1.mjs';
const legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),source=await loadWorld();
// Explicit pre-migration compatibility fixture, even after source rules publish.
delete source.rules.wildlife.migration;
const deer='monster_brown_deer',wood='habitat_hw_wood',field='habitat_hw_field';
const pool=(c,h,id=deer)=>c.state.records[`ecology:${h}`].populations[id];
const ledger=c=>c.state.records['wildlife:migration'];
function setup(world=withSeasonalMigration(source),day=269){
    const engine=new WorldEngine(world),old=engine.initialFromLegacy(legacy,'seasonal-test',{prepare:false});old.state.minute=day*1440+540;
    const c=initializeR1(applyPatches(old,planWildlifeMigration(old,world.rules,world.monsters)),world);
    const run=async(doc,tool,args,id)=>{const out=await engine.reduce(doc,{tool,args,eventId:id});return{document:applyPatches(doc,out.patches),result:out.result};};
    return{engine,world,c,run,old};
}
function conservation(c){
    for(const r of Object.values(c.state.records).filter(r=>r.category==='ecology'))for(const p of Object.values(r.populations)){
        assert.equal(p.initial+p.born+p.immigrated-p.predated-p.starved-p.withdrawn-p.emigrated,p.count);assert.ok(p.count>=0);
    }
    const m=ledger(c);assert.equal(m.departed,m.arrived+m.lost+m.transit.reduce((n,t)=>n+t.count+t.actors.length,0));
}
async function wait(run,c,minutes,id){return (await run(c,'world_time',{minutes},id)).document;}
async function tracked(run,c){
    c.state.location='loc_hw_northwood';
    for(let i=0;i<60;i++){const out=await run(c,'world_wildlife',{operation:'track',species:deer},`deer${i}`);if(out.result.success)return out;}
    throw new Error('隔离追踪夹具未取得成功检定');
}
test('迁徙骨架引用连续道路；同日冲突、未知物种、回环、非步行、零比例等拒绝',()=>{
    const world=withSeasonalMigration(source);assert.equal(validateWorld(world).ok,true);
    for(const mutate of [w=>w.rules.wildlife.migration.routes.push(structuredClone(w.rules.wildlife.migration.routes[0])),
        w=>w.rules.wildlife.migration.routes[0].species='monster_missing',w=>w.rules.wildlife.migration.routes[0].to=wood,
        w=>w.rules.wildlife.migration.routes[0].path.reverse(),w=>w.routes.find(r=>r.id==='route_loc_hw_fields').modes=['horse'],
        w=>w.rules.wildlife.migration.routes[0].fraction=0,w=>w.rules.wildlife.migration.routes[0].travelDays=0]){
        const bad=structuredClone(world);mutate(bad);assert.equal(validateWorld(bad).ok,false);
    }
});
test('已有生态迁移保留种群和旧日结，新增次生栖地为零；不补历史且幂等',()=>{
    const base=new WorldEngine(source).initialFromLegacy(legacy,'old-eco',{prepare:false});base.state.minute=500*1440;
    const old=applyPatches(base,planWildlifeMigration(base,source.rules,source.monsters));pool(old,wood).withdrawn=5;pool(old,wood).count-=5;
    const before=structuredClone(old),world=withSeasonalMigration(source),next=applyPatches(old,planWildlifeMigration(old,world.rules,world.monsters));
    assert.deepEqual(old,before);assert.equal(pool(next,wood).count,pool(old,wood).count);assert.equal(pool(next,wood).withdrawn,5);
    assert.equal(pool(next,field).count,0);assert.equal(pool(next,field).initial,0);assert.equal(ledger(next).initializedDay,500);
    assert.equal(next.state.records[`ecology:${wood}`].lastDay,499);
    for(const key of ['creatures','inventory','player','minute'])assert.deepEqual(next.state[key],old.state[key]);assert.deepEqual(next.memories,old.memories);
    assert.deepEqual(planWildlifeMigration(next,world.rules,world.monsters),[]);conservation(next);
    const corrupt=structuredClone(next);pool(corrupt,wood).emigrated=-1;
    assert.throws(()=>planWildlifeMigration(corrupt,world.rules,world.monsters),/损坏/);
});
test('冬季迁出真实扣数、途中不可追踪，次日到达后可实际接触；无图鉴召唤',async()=>{
    const{c,run}=setup();assert.equal(pool(c,field).count,0);
    c.state.location='loc_hw_fields';await assert.rejects(run(c,'world_wildlife',{operation:'track',species:deer},'early'),/活动线索/);
    const departure=await wait(run,c,1440,'winter');assert.equal(pool(departure,wood).emigrated,12);assert.equal(pool(departure,field).count,0);
    assert.equal(ledger(departure).transit.find(t=>t.species===deer).count,12);conservation(departure);
    await assert.rejects(run(departure,'world_wildlife',{operation:'track',species:deer},'travelling'),/活动线索/);
    const arrival=await wait(run,departure,1440,'arrive');assert.equal(pool(arrival,field).immigrated,12);assert.equal(pool(arrival,field).count,12);conservation(arrival);
    let found;for(let i=0;i<60;i++){found=await run(arrival,'world_wildlife',{operation:'track',species:deer},`field${i}`);if(found.result.success)break;}
    assert.equal(found.result.success,true);const actor=found.document.state.creatures[found.result.found.id];assert.equal(actor.ecology,field);assert.equal(actor.location,'loc_hw_fields');
    assert.equal(pool(found.document,field).count,11);conservation(found.document);
    assert.equal(Object.values(readStateSection(arrival.state,'记录')).some(r=>r.category==='wildlifeMigration'),false);
});
test('已有动物保持同一身份伤势和记忆；迁徙中不能交易/攻击，宠物、尸体和巢穴个体留守',async()=>{
    const world=withSeasonalMigration(source);world.rules.wildlife.migration.routes.find(r=>r.id==='migration_deer_winter').fraction=1;
    const{c,run}=setup(world),first=await tracked(run,c),start=first.document,id=first.result.found.id;
    start.state.creatures[id].hp=2;start.state.creatures[id].battleMemory={tactics:{unarmed:2}};
    for(const[other,extra]of [['owned',{owner:'player'}],['corpse',{hp:0,status:'死亡',corpse:{status:'未取材'}}],['boss',{boss:'boss_fixture'}],['lair',{lair:'lair_fixture'}]]){
        start.state.creatures[other]={...structuredClone(start.state.creatures[id]),...extra};
    }
    const exempt=Object.fromEntries(['owned','corpse','boss','lair'].map(k=>[k,structuredClone(start.state.creatures[k])]));
    const depart=await wait(run,start,270*1440+540-start.state.minute,'actual-departure');
    assert.equal(depart.state.creatures[id].location,null);assert.equal(depart.state.creatures[id].hp,2);
    assert.equal(ledger(depart).transit.find(t=>t.species===deer).actors.includes(id),true);
    await assert.rejects(run(depart,'world_combat',{target:id},'remote-fight'),/不在/);
    await assert.rejects(run(depart,'world_pet',{operation:'tame',target:id},'remote-tame'),/不在/);
    const arrive=await wait(run,depart,1440,'actual-arrival');assert.equal(arrive.state.creatures[id].location,'loc_hw_fields');assert.equal(arrive.state.creatures[id].hp,2);
    assert.deepEqual(arrive.state.creatures[id].battleMemory,{tactics:{unarmed:2}});assert.equal(arrive.state.creatures[id].migration,undefined);
    for(const[k,v]of Object.entries(exempt))assert.deepEqual(arrive.state.creatures[k],v);
    assert.deepEqual(Object.keys(arrive.state.creatures),Object.keys(start.state.creatures));conservation(arrive);
});
test('灭绝不恢复、满栖地不迁入，闭路不出发；途中死亡不复活',async()=>{
    const{c,run}=setup();pool(c,wood).withdrawn=pool(c,wood).count;pool(c,wood).count=0;
    const noDeer=await wait(run,c,2880,'extinct');assert.equal(pool(noDeer,field).count,0);assert.equal(pool(noDeer,wood).count,0);conservation(noDeer);
    const full=setup();pool(full.c,field).count=60;pool(full.c,field).initial=60;
    const blocked=await wait(full.run,full.c,1440,'capacity');assert.equal(pool(blocked,wood).emigrated,0);conservation(blocked);
    const closedWorld=withSeasonalMigration(source);closedWorld.routes.find(r=>r.id==='route_loc_hw_fields').closedSeasons=[3];
    const closed=setup(closedWorld),notDeparted=await wait(closed.run,closed.c,1440,'closed');assert.equal(ledger(notDeparted).departed,0);
    const world=withSeasonalMigration(source);world.rules.wildlife.migration.routes[0].fraction=1;
    const actual=setup(world),first=await tracked(actual.run,actual.c),id=first.result.found.id;
    const transit=await wait(actual.run,first.document,270*1440+540-first.document.state.minute,'dead-depart');
    transit.state.creatures[id].hp=0;transit.state.creatures[id].status='死亡';
    const after=await wait(actual.run,transit,1440,'dead-arrive');assert.equal(after.state.creatures[id].hp,0);assert.equal(after.state.creatures[id].location,null);assert.equal(ledger(after).lost,1);conservation(after);
});
test('次生栖地有限容量，迁移前后区域材料报价使用当前各地动物而非原图鉴地点',async()=>{
    const world=withSeasonalMigration(source);world.rules.wildlife.migration.routes[0].fraction=1;
    const{engine,c,run}=setup(world),before=wildlifePriceFactor(engine,c,'item_rawhide','loc_hw_northwood');
    const departed=await wait(run,c,1440,'price-out'),after=wildlifePriceFactor(engine,departed,'item_rawhide','loc_hw_northwood');assert.ok(after>before);
    const arrived=await wait(run,departed,1440,'price-in');assert.equal(wildlifePriceFactor(engine,arrived,'item_rawhide','loc_hw'),1);
    conservation(arrived);
});
test('两年跨季长短等待一致，单批到达不重复，包含日结守恒与旧规则兼容',async()=>{
    const{c,run}=setup();let long=c,split=c;
    for(let i=0;i<24;i++)long=await wait(run,long,30*1440,`long${i}`);
    for(let i=0;i<720;i++)split=await wait(run,split,1440,`short${i}`);
    for(const[k,v]of Object.entries(long.state.records).filter(([,r])=>['ecology','wildlifeMigration'].includes(r.category)))assert.deepEqual(v,split.state.records[k]);
    conservation(long);assert.ok(ledger(long).departed>0);assert.ok(ledger(long).arrived>0);
    const old=setup(source),out=await wait(old.run,old.c,1440,'old-rules');assert.equal(ledger(out),undefined);assert.equal(pool(out,field),undefined);
});
test('真实喂养后的动物逐小时照料与逐日迁徙按时间交错；途中死亡长短等待相同',async()=>{
    const world=withSeasonalMigration(source);world.rules.wildlife.migration.routes[0].fraction=1;
    const{c,run}=setup(world),first=await tracked(run,c),id=first.result.found.id;
    first.document.state.inventory.item_oats={quantity:1};first.document.state.creatures[id].hp=1;
    const fed=(await run(first.document,'world_pet',{operation:'feed',target:id,item:'item_oats'},'actual-feed')).document;
    const long=await wait(run,fed,2880,'care-long'),one=await wait(run,fed,1440,'care-one'),split=await wait(run,one,1440,'care-two');
    assert.deepEqual(long.state.creatures,split.state.creatures);assert.deepEqual(ledger(long),ledger(split));
    assert.equal(long.state.creatures[id].status,'死亡');assert.equal(ledger(long).lost,1);assert.equal(ledger(long).transit.length,0);conservation(long);
});
test('损坏的途中账与个体身份拒绝结算，原存档不被部分修复或重置',async()=>{
    const{c,run}=setup(),depart=await wait(run,c,1440,'corrupt-depart');
    for(const mutate of [doc=>ledger(doc).departed++,doc=>ledger(doc).transit[0].count=-1,
        doc=>ledger(doc).transit.push(structuredClone(ledger(doc).transit[0])),doc=>ledger(doc).transit[0].to='habitat_missing']){
        const bad=structuredClone(depart);mutate(bad);const before=structuredClone(bad);
        await assert.rejects(wait(run,bad,1440,'bad-ledger'));assert.deepEqual(bad,before);
    }
});
test('途中行程与到达可重启/导入/回滚；独立迁移CLI不会覆盖旧存档或密钥路径',async t=>{
    const base=path.resolve(os.tmpdir()),dir=await fs.mkdtemp(path.join(base,'seasonal-migration-'));
    assert.ok(path.resolve(dir).startsWith(base+path.sep));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
    const{engine,world,c,old}=setup(),reduce=(doc,input)=>engine.reduce(doc,input),store=new CampaignStorage(dir,{reducer:reduce});
    await store.create({id:'migration',worldVersion:world.version,document:c});
    for(const[id,anchor]of [['winter','a1'],['arrival','a2']])await store.transact('migration',{id,anchor,input:{tool:'world_time',args:{minutes:1440},eventId:id}},reduce);
    const saved=(await store.read('migration')).document;conservation(saved);
    assert.deepEqual((await new CampaignStorage(dir,{reducer:reduce}).read('migration')).document,saved);
    assert.deepEqual((await store.import(await store.export('migration'),'copy')).document,saved);
    const rolled=(await store.reconcile('migration',['a1'],null)).document;assert.ok(ledger(rolled).transit.length>0);assert.equal(pool(rolled,field).count,0);
    assert.deepEqual((await store.reconcile('migration',[],null)).document,c);
    const input=path.join(dir,'old.json'),output=path.join(dir,'new.json'),archive=path.join(dir,'world.json'),bytes=JSON.stringify(old);
    await fs.writeFile(input,bytes);await fs.writeFile(archive,JSON.stringify(world));
    const command=(a,b,archiveFile=archive)=>spawnSync(process.execPath,['tools/migrate-wildlife.mjs',a,b,'--world',archiveFile],{encoding:'utf8'});
    const result=command(input,output);assert.equal(result.status,0,result.stderr);assert.equal(await fs.readFile(input,'utf8'),bytes);
    const migrated=JSON.parse(await fs.readFile(output,'utf8'));assert.equal(pool(migrated,field).count,0);assert.deepEqual(migrated.state.creatures,old.state.creatures);assert.deepEqual(migrated.memories,old.memories);
    const savedBytes=await fs.readFile(output,'utf8');assert.notEqual(command(input,output).status,0);assert.equal(await fs.readFile(output,'utf8'),savedBytes);
    assert.notEqual(command(input,input).status,0);assert.match(command(input,path.join(dir,'x.json'),path.join(dir,'secrets.json')).stderr,/拒绝接触密钥/);
});
