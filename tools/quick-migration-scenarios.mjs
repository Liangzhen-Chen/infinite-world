import assert from 'node:assert/strict';
import {withSeasonalMigration} from '../world/design/seasonal-migration-foundation.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {planRuleStateMigration} from '../server-plugin/rule-state-migration.mjs';
import {planAgricultureMigration} from '../server-plugin/agriculture-migration.mjs';
import {planWildlifeMigration} from '../server-plugin/wildlife-migration.mjs';
export function migrationScenarios(sourceEngine){
    const engine=new WorldEngine(withSeasonalMigration(sourceEngine.world));
    const prepare=async(c,days)=>{
        c.state.minute=269*1440+540;c.state.location='loc_hw_fields';
        let next=applyPatches(c,planRuleStateMigration(c,engine.rules));
        next=applyPatches(next,planAgricultureMigration(next,engine.rules));
        next=applyPatches(next,planWildlifeMigration(next,engine.rules,engine.world.monsters));
        return applyPatches(next,(await engine.reduce(next,{tool:'world_time',args:{minutes:days*1440},eventId:`prepare_winter${days}`})).patches);
    };
    const fixtureScope='迁徙开发规则：两种动物四条季节路线，经真实世界时钟出发/到达；尚未在玩家酒馆启用';
    return [
        {id:'MigrationTravelling',engine,fixtureScope,input:'我只看看南田眼前有没有实际的褐背短鹿。不追踪，不等它们。',setup:c=>prepare(c,1),
            context:'用world_wildlife observe，只叙述眼前actual animals；未接触动物不能凭图鉴描写看见鹿。即时观察，整回合0分，不能读取私有迁徙总账或预告鹿何时出现。',
            assert:(c,{initial,startMinute,events})=>{assert.equal(c.state.minute,startMinute);assert.deepEqual(c,{...initial,state:{...initial.state,turns:c.state.turns}});
                const rows=events.filter(e=>e.input.tool==='world_wildlife'&&e.input.args.operation==='observe');assert.ok(rows.length>0);assert.deepEqual(rows[0].result.animals,[]);}},
        {id:'MigrationArrival',engine,fixtureScope,input:'我在南田追踪一次褐背短鹿，找到就停。别攻击，也别取材。',setup:c=>prepare(c,2),
            context:'目前是09:00，褐背短鹿可在南田活动。world_wildlife track species monster_brown_deer只执行一次，60分；成功才描写found，失败也耗60分，不能通过画面编出动物或送生皮。',
            assert:(c,{initial,startMinute,events})=>{assert.equal(c.state.minute,startMinute+60);assert.deepEqual(c.state.inventory,initial.state.inventory);
                const rows=events.filter(e=>e.input.tool==='world_wildlife'&&e.input.args.operation==='track');assert.equal(rows.length,1);
                const stock=doc=>doc.state.records['ecology:habitat_hw_field'].populations.monster_brown_deer;
                assert.equal(stock(c).withdrawn-stock(initial).withdrawn,rows[0].result.success?1:0);
                if(rows[0].result.success)assert.equal(c.state.creatures[rows[0].result.found.id].ecology,'habitat_hw_field');}},
    ];
}
