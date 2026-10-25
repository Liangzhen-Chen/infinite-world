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
import {localWeather} from '../server-plugin/weather.mjs';
import {legacy,source,farm,pool,mouse,fox,field,wood,setup,wait,conservation,year,rodentsAtCapacity,growing} from './farm-pests-fixture.mjs';
test('成熟后损失冻结，分批收获不倒扣已入库粮食；潜在收成=实际收成+害兽损失',async()=>{
    const set=setup(),c=await growing(set);farm(c).field.cohorts[0].pestDamageBps=1500;
    // Boundary fixture disables NPC harvesting without skipping the real crop
    // growth clock. Restoring tools below isolates successive manual harvests.
    farm(c).tools.capacity=0;let doc=c;for(let i=0;i<7;i++)doc=await wait(set.run,doc,30*1440,`ripe${i}`);
    const ready=farm(doc).field.cohorts.filter(r=>r.ready);assert.ok(ready.length>0);
    const originalDamage=new Map(ready.map(r=>[r.id,r.pestDamageBps]));doc=await wait(set.run,doc,1440,'ripe-wait');
    // S4's opening calendar changes the weather on this date. Keep NPC
    // harvesting disabled and really wait for workable weather before restoring tools.
    for(let days=0;days<7&&['storm','snow'].includes(localWeather(set.engine,doc).kind);days++)doc=await wait(set.run,doc,1440,`harvest-weather-wait-${days}`);
    assert.ok(!['storm','snow'].includes(localWeather(set.engine,doc).kind),'手动收获前须等到可工作的天气');
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
