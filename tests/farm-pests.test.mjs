import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {loadWorld} from '../tools/load-world.mjs';
import {validateWorld} from '../tools/validate-world.mjs';
import {withFarmPests} from '../world/design/farm-pests-foundation.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches,CampaignStorage} from '../server-plugin/storage.mjs';
import {planFarmPestsMigration} from '../server-plugin/farm-pests-migration.mjs';
import {toolResultWithClock} from '../extension/turn.mjs';
const legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),source=await loadWorld();
delete source.rules.wildlife.farmPests;
const farm=c=>c.state.records['agriculture:loc_hw'],pool=(c,species,habitat)=>c.state.records[`ecology:${habitat}`].populations[species];
const mouse='monster_mottled_field_mouse',fox='monster_red_ear_fox',field='habitat_hw_field',wood='habitat_hw_wood';
function setup(seed='farm-pests-test',world=withFarmPests(source)){
    const engine=new WorldEngine(world),c=engine.createCharacter(legacy,{},seed);
    const run=async(doc,tool,args,id)=>{const out=await engine.reduce(doc,{tool,args,eventId:id});return{document:applyPatches(doc,out.patches),result:out.result};};return{engine,c,run,world};
}
async function wait(run,c,minutes,id){return(await run(c,'world_time',{minutes},id)).document;}
function conservation(c){
    const r=farm(c),s=c.state.settlements.loc_hw,l=r.ledger;
    assert.equal(l.openingFood+l.openingSeed+l.freshProduced+l.harvested+l.donated,s.food+r.field.seedBank+l.eaten+l.spoiled+l.overflow+l.seedSpent+l.sold);
    assert.equal(l.potentialHarvested,l.harvested+l.pestLost);assert.equal(r.batches.reduce((n,b)=>n+b.amount,0),s.food);
    for(const r of Object.values(c.state.records).filter(r=>r.category==='ecology'))for(const p of Object.values(r.populations))assert.equal(p.initial+p.born+(p.arisen??0)+(p.immigrated??0)-p.predated-p.starved-p.withdrawn-(p.emigrated??0),p.count);
}
async function year(run,c,label){for(let i=0;i<12;i++)c=await wait(run,c,30*1440,`${label}${i}`);return c;}
function rodentsAtCapacity(c){const p=pool(c,mouse,field);p.born+=24-p.count;p.count=24;}
async function growing(set){
    let c=await wait(set.run,set.c,10*1440,'grow');c.state.location='loc_hw_fields';assert.ok(farm(c).field.cohorts.length>0);rodentsAtCapacity(c);return c;
}
test('田地、害兽、肉食捕食者、密度门槛和跨区道路均校验，未知或重复配置拒绝',()=>{
    const world=withFarmPests(source);assert.equal(validateWorld(world).ok,true);
    for(const mutate of [w=>w.rules.wildlife.farmPests.fields[0].fieldId='farm_missing',w=>w.rules.wildlife.farmPests.fields[0].habitat=wood,
        w=>w.rules.wildlife.farmPests.fields[0].pests[0].fullDamageCount=18,w=>w.rules.wildlife.farmPests.fields[0].predators[0].species=mouse,
        w=>w.rules.wildlife.farmPests.fields[0].predators[0].path.reverse(),w=>w.rules.wildlife.farmPests.fields[0].predators[0].refugeCount=99,
        w=>w.rules.wildlife.farmPests.fields[0].pests.push(structuredClone(w.rules.wildlife.farmPests.fields[0].pests[0]))]){
        const bad=structuredClone(world);mutate(bad);assert.equal(validateWorld(bad).ok,false);
    }
});
test('旧农事及已收获数据保留，启用时刻之前不追补损失，迁移幂等并拒绝坏账',async()=>{
    const oldSet=setup('old-pests',source),old=await wait(oldSet.run,oldSet.c,10*1440,'old-grow');old.state.minute=10*1440+12*60;
    const before=structuredClone(old),world=withFarmPests(source),next=applyPatches(old,planFarmPestsMigration(old,world.rules));
    assert.deepEqual(old,before);assert.equal(farm(next).field.pestInitializedMinute,old.state.minute);assert.equal(farm(next).ledger.pestLost,0);
    assert.equal(farm(next).ledger.potentialHarvested,farm(old).ledger.harvested);
    for(const key of ['player','inventory','settlements','creatures','minute'])assert.deepEqual(next.state[key],old.state[key]);assert.deepEqual(next.memories,old.memories);
    for(let i=0;i<farm(old).field.cohorts.length;i++)assert.equal(farm(next).field.cohorts[i].grownDays,farm(old).field.cohorts[i].grownDays);
    assert.deepEqual(planFarmPestsMigration(next,world.rules),[]);
    rodentsAtCapacity(next);const engine=new WorldEngine(world),out=await engine.reduce(next,{tool:'world_time',args:{minutes:1440},eventId:'half-day'}),later=applyPatches(next,out.patches);
    // Night-active mice only have six eligible hours after noon on the enable day.
    assert.equal(farm(later).field.cohorts[0].pestDamageBps,6);
    const bad=structuredClone(next);farm(bad).ledger.potentialHarvested++;assert.throws(()=>planFarmPestsMigration(bad,world.rules),/守恒/);
    farm(bad).field.pestFormat=2;assert.throws(()=>planFarmPestsMigration(bad,world.rules),/冲突/);
});
test('实际追踪并击杀捕食者后田鼠增加且收成下降；击杀不给农田损失的退款',async()=>{
    const{c,run}=setup('actual-fox-hunt');let killed=structuredClone(c);killed.state.location='loc_hw_northwood';killed.state.minute=1200;
    // Isolated level/HP fixture to prove real ecology withdrawals and deaths,
    // not evidence of the normal career or levelling route.
    killed.state.player.level=30;killed.state.player.hp=1000;killed.state.player.maxHp=1000;
    for(let n=0;n<3;n++){
        let found;for(let i=0;i<60;i++){found=await run(killed,'world_wildlife',{operation:'track',species:fox},`hunt-track${n}:${i}`);if(found.result.success)break;}
        assert.ok(found.result.success);killed=found.document;const target=found.result.found.id;
        for(let i=0;i<60&&killed.state.creatures[target].status!=='死亡';i++)killed=(await run(killed,'world_combat',{target},`hunt-kill${n}:${i}`)).document;
        assert.equal(killed.state.creatures[target].status,'死亡');
    }
    assert.equal(pool(killed,fox,wood).count,0);
    const base=await year(run,c,'safe'),damaged=await year(run,killed,'hunted');conservation(base);conservation(damaged);
    assert.ok(pool(damaged,mouse,field).count>pool(base,mouse,field).count);
    assert.ok(farm(damaged).ledger.pestLost>farm(base).ledger.pestLost);assert.ok(farm(damaged).ledger.harvested<farm(base).ledger.harvested);
    assert.equal(pool(damaged,fox,wood).count,0);assert.ok(Object.values(damaged.state.creatures).every(a=>a.status==='死亡'));
});
test('夜间非战斗巡田真实耗时，减轻后续损失但不杀动物或恢复已损伤作物',async()=>{
    const set=setup(),c=await growing(set);c.state.minute=10*1440+1080;let guarded;
    for(let i=0;i<60;i++){guarded=await set.run(c,'world_farm',{operation:'guard'},`guard${i}`);if(guarded.result.success)break;}
    assert.equal(guarded.result.success,true);assert.equal(guarded.document.state.minute,c.state.minute+90);
    assert.match(guarded.result.protection.startLocal,/19:30$/);assert.match(guarded.result.protection.untilLocal,/23:30$/);assert.equal(guarded.result.protection.durationMinutes,240);
    assert.deepEqual(guarded.document.state.creatures,c.state.creatures);assert.deepEqual(guarded.document.state.inventory,c.state.inventory);
    assert.equal(guarded.document.state.player.coins,c.state.player.coins);
    assert.equal(farm(guarded.document).field.cohorts[0].pestDamageBps,farm(c).field.cohorts[0].pestDamageBps);
    const beforeLoss=farm(c).field.cohorts[0].pestDamageBps;
    const safe=await wait(set.run,guarded.document,1440-90,'guard-day'),exposed=await wait(set.run,c,1440,'unguarded-day');
    assert.ok(farm(safe).field.cohorts[0].pestDamageBps<farm(exposed).field.cohorts[0].pestDamageBps);
    assert.ok(farm(safe).field.cohorts[0].pestDamageBps>=beforeLoss);conservation(safe);
    const remote=structuredClone(c);remote.state.location='bld_hw_qingdeng';await assert.rejects(set.run(remote,'world_farm',{operation:'guard',settlement:'loc_hw'},'remote'),/本人/);
    const empty=set.c;empty.state.location='loc_hw_fields';await assert.rejects(set.run(empty,'world_farm',{operation:'guard'},'bare'),/没有正在生长/);
});
test('本地农田只读观察回执明确即时，区分成长损伤和收获损失且不泄漏种群',async()=>{
    const set=setup(),c=await growing(set),before=structuredClone(c),out=await set.run(c,'world_farm',{operation:'inspect'},'inspect');
    assert.deepEqual(out.document,before);assert.equal(out.result.agriculture.field.damageType,'害兽啃食');
    assert.equal(out.result.actionScope.instantaneous,true);
    assert.equal(toolResultWithClock(out.result,{startMinute:c.state.minute,minute:out.document.state.minute}).turnClock.elapsedMinutes,0);
    assert.equal(out.result.agriculture.populations,undefined);assert.equal(out.result.agriculture.field.populations,undefined);
});
test('重叠巡田不叠加，白昼巡田不保护夜间田鼠；失败仍耗时，不写成功保护',async()=>{
    const set=setup(),c=await growing(set);c.state.minute=10*1440+540;
    let daytime,failed;for(let i=0;i<60&&(!daytime||!failed);i++){
        const out=await set.run(c,'world_farm',{operation:'guard'},`day-guard${i}`);if(out.result.success)daytime=out;else failed=out;
    }
    assert.ok(daytime&&failed);assert.equal(failed.document.state.minute,c.state.minute+90);assert.deepEqual(farm(failed.document).field.pestProtection,[]);
    const duplicated=structuredClone(daytime.document);farm(duplicated).field.pestProtection.push(structuredClone(farm(duplicated).field.pestProtection[0]));
    const one=await wait(set.run,daytime.document,1440-90,'day-one'),two=await wait(set.run,duplicated,1440-90,'day-two'),none=await wait(set.run,c,1440,'day-none');
    assert.equal(farm(one).field.cohorts[0].pestDamageBps,farm(two).field.cohorts[0].pestDamageBps);assert.equal(farm(one).field.cohorts[0].pestDamageBps,farm(none).field.cohorts[0].pestDamageBps);
});
test('成熟后损失冻结，分批收获不倒扣已入库粮食；潜在收成=实际收成+害兽损失',async()=>{
    const set=setup(),c=await growing(set);farm(c).field.cohorts[0].pestDamageBps=1500;
    // Boundary fixture disables NPC harvesting without skipping the real crop
    // growth clock. Restoring tools below isolates successive manual harvests.
    farm(c).tools.capacity=0;let doc=c;for(let i=0;i<7;i++)doc=await wait(set.run,doc,30*1440,`ripe${i}`);
    const ready=farm(doc).field.cohorts.filter(r=>r.ready);assert.ok(ready.length>0);
    const originalDamage=new Map(ready.map(r=>[r.id,r.pestDamageBps]));doc=await wait(set.run,doc,1440,'ripe-wait');
    for(const r of farm(doc).field.cohorts.filter(r=>r.ready))assert.equal(r.pestDamageBps,originalDamage.get(r.id));
    farm(doc).tools.capacity=8;farm(doc).tools.condition=100;
    let harvested;
    for(let i=0;i<60;i++){const out=await set.run(doc,'world_farm',{operation:'harvest'},`manual-harvest${i}`);if(out.result.success){harvested=out;break;}}
    assert.ok(harvested);doc=harvested.document;const partial=farm(doc).field.cohorts.find(r=>r.harvestedUnits>0);
    assert.ok(partial&&partial.harvestedUnits<partial.areaUnits);assert.equal(partial.pestDamageBps,originalDamage.get(partial.id));
    assert.ok(farm(doc).ledger.pestLost>0);conservation(doc);
    const oldHarvest=farm(doc).ledger.harvested,oldLoss=farm(doc).ledger.pestLost;
    doc=await wait(set.run,doc,30*1440,'later');assert.ok(farm(doc).ledger.harvested>=oldHarvest);assert.ok(farm(doc).ledger.pestLost>=oldLoss);conservation(doc);
});
test('害兽灭绝不会由藏穴保护凭空恢复，封闭巡游道路不会隔空扣猎物',async()=>{
    const absent=setup(),c=await growing(absent),p=pool(c,mouse,field);p.withdrawn+=p.count;p.count=0;
    const before=farm(c).field.cohorts[0].pestDamageBps,after=await wait(absent.run,c,30*1440,'no-mice');
    assert.equal(pool(after,mouse,field).count,0);assert.equal(farm(after).field.cohorts[0].pestDamageBps,before);conservation(after);
    const world=withFarmPests(source);world.routes.find(r=>r.id==='route_loc_hw_fields').closedSeasons=[0];
    const closed=setup('closed-forage',world),out=await wait(closed.run,closed.c,14*1440,'closed');assert.equal(pool(out,mouse,field).predated,0);
    const open=setup('closed-forage'),working=await wait(open.run,open.c,14*1440,'open');assert.ok(pool(working,mouse,field).predated>0);conservation(out);conservation(working);
});
test('两年长等待和逐日等待的农事与生态结果一致；旧规则不加害兽分区',async()=>{
    const{c,run}=setup('pest-clock');let long=c,split=c;
    for(let i=0;i<24;i++)long=await wait(run,long,30*1440,`long${i}`);
    for(let i=0;i<720;i++)split=await wait(run,split,1440,`split${i}`);
    assert.deepEqual(farm(long),farm(split));assert.deepEqual(long.state.settlements,split.state.settlements);
    for(const[k,r]of Object.entries(long.state.records).filter(([,r])=>['ecology','wildlifeMigration'].includes(r.category)))assert.deepEqual(r,split.state.records[k]);conservation(long);
    const old=setup('no-pest',source),next=await wait(old.run,old.c,1440,'old');assert.equal(farm(next).field.pestFormat,undefined);assert.equal(farm(next).ledger.pestLost,undefined);
});
test('田害与实际巡守在重启/导入/回滚中保留，CLI仅写独立副本',async t=>{
    const base=path.resolve(os.tmpdir()),dir=await fs.mkdtemp(path.join(base,'farm-pest-store-'));assert.ok(path.resolve(dir).startsWith(base+path.sep));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
    const set=setup(),c=await growing(set);c.state.minute=10*1440+1080;
    const reduce=(doc,input)=>set.engine.reduce(doc,input),store=new CampaignStorage(dir,{reducer:reduce});await store.create({id:'farm',worldVersion:set.world.version,document:c});
    let successId;for(let i=0;i<60;i++){const id=`persist-guard${i}`,out=await set.run(c,'world_farm',{operation:'guard'},id);if(out.result.success){successId=id;break;}}assert.ok(successId);
    await store.transact('farm',{id:successId,anchor:'guard-anchor',input:{tool:'world_farm',args:{operation:'guard'},eventId:successId}},reduce);
    const protectedDocument=(await store.read('farm')).document;assert.ok(farm(protectedDocument).field.pestProtection.length>0);
    assert.deepEqual((await new CampaignStorage(dir,{reducer:reduce}).read('farm')).document,protectedDocument);
    await store.transact('farm',{id:'day',anchor:'a1',input:{tool:'world_time',args:{minutes:1440},eventId:'day'}},reduce);
    const saved=(await store.read('farm')).document;assert.deepEqual((await new CampaignStorage(dir,{reducer:reduce}).read('farm')).document,saved);
    assert.deepEqual((await store.import(await store.export('farm'),'copy')).document,saved);
    assert.deepEqual((await store.reconcile('farm',['guard-anchor'],null)).document,protectedDocument);assert.deepEqual((await store.reconcile('farm',[],null)).document,c);
    const old=setup('old-cli',source).c,input=path.join(dir,'old.json'),output=path.join(dir,'new.json'),worldFile=path.join(dir,'world.json'),bytes=JSON.stringify(old);
    await fs.writeFile(input,bytes);await fs.writeFile(worldFile,JSON.stringify(set.world));
    const command=(a,b,w=worldFile)=>spawnSync(process.execPath,['tools/migrate-farm-pests.mjs',a,b,'--world',w],{encoding:'utf8'}),result=command(input,output);
    assert.equal(result.status,0,result.stderr);assert.equal(await fs.readFile(input,'utf8'),bytes);const migrated=JSON.parse(await fs.readFile(output,'utf8'));
    assert.equal(farm(migrated).ledger.pestLost,0);assert.deepEqual(migrated.state.inventory,old.state.inventory);assert.deepEqual(migrated.memories,old.memories);
    const savedBytes=await fs.readFile(output,'utf8');assert.notEqual(command(input,output).status,0);assert.equal(await fs.readFile(output,'utf8'),savedBytes);
    assert.notEqual(command(input,input).status,0);assert.match(command(input,path.join(dir,'x.json'),path.join(dir,'secrets.json')).stderr,/密钥/);
});
