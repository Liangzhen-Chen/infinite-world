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
