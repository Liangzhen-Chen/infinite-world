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
import {damageFarmCrops} from '../server-plugin/farm-pests.mjs';
import {territoryCapacityFactor} from '../server-plugin/ecology-dynamics.mjs';
import {takePopulation,addPopulation} from '../server-plugin/population-health.mjs';
import {aliveHoldings} from '../server-plugin/holdings.mjs';
import {executeProtocolPrimitive} from '../server-plugin/transition.mjs';
import {legacy,source,farm,pool,mouse,fox,field,wood,setup,wait,conservation,year,rodentsAtCapacity,growing} from './farm-pests-fixture.mjs';
test('实际追踪并击杀捕食者后田鼠增加且收成下降；击杀不给农田损失的退款',async t=>{
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
    t.diagnostic(`farm-pests-hunt: ${JSON.stringify([base,damaged].map(doc=>({mice:pool(doc,mouse,field).count,harvested:farm(doc).ledger.harvested,pestLost:farm(doc).ledger.pestLost,donated:farm(doc).ledger.donated})))}`);
    assert.ok(pool(damaged,mouse,field).count>pool(base,mouse,field).count);
    assert.ok(farm(damaged).ledger.pestLost>farm(base).ledger.pestLost);assert.ok(farm(damaged).ledger.harvested<farm(base).ledger.harvested);
    // Same seed, field and farm labor: the harvest gap must be exactly the
    // additional pest loss, with no replacement grain credited as a donation.
    assert.equal(farm(damaged).ledger.potentialHarvested,farm(base).ledger.potentialHarvested);
    assert.equal(farm(base).ledger.harvested-farm(damaged).ledger.harvested,farm(damaged).ledger.pestLost-farm(base).ledger.pestLost);
    assert.equal(farm(base).ledger.donated,0);assert.equal(farm(damaged).ledger.donated,0);
    assert.equal(pool(damaged,fox,wood).count,0);assert.ok(Object.values(damaged.state.creatures).every(a=>a.status==='死亡'));
});
test('领地压缩按剩余栖地密度计算田害；解除领地或清除害兽不退款',async()=>{
    const {engine,c,run}=setup('territorial-pest-density');
    const current=await wait(run,c,1440,'open-territory'),d=engine.primitiveDraft(current);
    const habitat=engine.rules.wildlife.habitats.find(h=>h.id===field);
    assert.equal(territoryCapacityFactor(d,engine,habitat),.6);
    // S5-06: K24 * .6 -> floor14.4=14. Full-habitat density is 14/.6;
    // round(12 * ((14/.6)-18)/(24-18)) = 11 bps/day, not zero.
    const population=structuredClone(pool(current,mouse,field));
    addPopulation(population,{S:14-population.count,I:0,R:0});population.born+=14-pool(current,mouse,field).count;
    d.set(['state','records',`ecology:${field}`,'populations',mouse],population);
    const row=()=>({field:{cohorts:[{ready:false,pestDamageBps:0}],pestProtection:[],pestInitializedMinute:0}}),damaged=row();
    assert.equal(damageFarmCrops(d,engine,damaged,'loc_hw',1).maximumAddedPercent,.11);
    assert.equal(damaged.field.cohorts[0].pestDamageBps,11);
    // Removing animals removes only future pressure, never accrued damage.
    const empty=structuredClone(population);empty.withdrawn+=empty.count;takePopulation(empty,empty.count);
    d.set(['state','records',`ecology:${field}`,'populations',mouse],empty);
    assert.equal(damageFarmCrops(d,engine,damaged,'loc_hw',2).maximumAddedPercent,0);
    assert.equal(damaged.field.cohorts[0].pestDamageBps,11);
    d.set(['state','records',`ecology:${field}`,'populations',mouse],population);
    const subjects=new Set([field,habitat.location,...engine.world.bosses.filter(b=>b.residence?.habitat===field).map(b=>b.residence.id)]);
    for(const control of aliveHoldings(d,{kind:'controls'}).filter(h=>subjects.has(h.subject)))executeProtocolPrimitive(d,engine,{op:'holding.close',id:control.id,reason:'vacated'},{eventId:`close:${control.id}`});
    // With all habitat restored, 14 < 18: no new damage and no refund.
    assert.equal(territoryCapacityFactor(d,engine,habitat),1);
    assert.equal(damageFarmCrops(d,engine,damaged,'loc_hw',3).maximumAddedPercent,0);
    assert.equal(damaged.field.cohorts[0].pestDamageBps,11);
    assert.equal(damageFarmCrops(d,engine,row(),'loc_hw',3).maximumAddedPercent,0);
});
