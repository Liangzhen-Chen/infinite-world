import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {loadWorld} from '../tools/load-world.mjs';
import {validateWorld} from '../tools/validate-world.mjs';
import {withFarmPests} from '../world/design/farm-pests-foundation.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches,CampaignStorage} from '../server-plugin/storage.mjs';
import {planFarmPestsMigration} from '../server-plugin/farm-pests-migration.mjs';
import {toolResultWithClock} from '../extension/turn.mjs';
import {legacy,source,farm,pool,mouse,fox,field,wood,setup,wait,conservation,year,rodentsAtCapacity,growing} from './farm-pests-fixture.mjs';
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
test('害兽灭绝不会由藏穴保护凭空恢复，封闭巡游道路不会隔空扣猎物',async()=>{
    const absent=setup(),c=await growing(absent),p=pool(c,mouse,field);p.withdrawn+=p.count;p.count=0;
    const before=farm(c).field.cohorts[0].pestDamageBps,after=await wait(absent.run,c,30*1440,'no-mice');
    assert.equal(pool(after,mouse,field).count,0);assert.equal(farm(after).field.cohorts[0].pestDamageBps,before);conservation(after);
    const world=withFarmPests(source);world.routes.find(r=>r.id==='route_loc_hw_fields').closedSeasons=[0];
    const closed=setup('closed-forage',world),out=await wait(closed.run,closed.c,14*1440,'closed');assert.equal(pool(out,mouse,field).predated,0);
    const open=setup('closed-forage'),working=await wait(open.run,open.c,14*1440,'open');assert.ok(pool(working,mouse,field).predated>0);conservation(out);conservation(working);
});
test('田害与实际巡守在重启/导入/回滚中保留，CLI仅写独立副本',async t=>{
    const base=path.resolve(tmpRoot()),dir=await fs.mkdtemp(path.join(base,'farm-pest-store-'));assert.ok(path.resolve(dir).startsWith(base+path.sep));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
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
