import assert from 'node:assert/strict';
import {applyPatches} from '../server-plugin/storage.mjs';
import {planRuleStateMigration} from '../server-plugin/rule-state-migration.mjs';
import {planAgricultureMigration} from '../server-plugin/agriculture-migration.mjs';
import {planWildlifeMigration} from '../server-plugin/wildlife-migration.mjs';
export function wildlifeScenarios(engine){
    if(!engine.rules.wildlife)return [];
    const prepare=c=>{
        c.state.location='loc_hw_northwood';
        let next=applyPatches(c,planRuleStateMigration(c,engine.rules));
        next=applyPatches(next,planAgricultureMigration(next,engine.rules));
        return applyPatches(next,planWildlifeMigration(next,engine.rules,engine.world.monsters));
    };
    return [
        {id:'WildlifeObserve',input:'只看看我眼前有哪些实际动物，不追踪、不等待。',setup:prepare,
            context:'world_wildlife observe只列已接触的真实个体，不列目录或未见种群；即时观察，整回合0分。',
            assert:(c,{initial,startMinute,events})=>{
                assert.deepEqual(c,{...initial,state:{...initial.state,turns:c.state.turns}});assert.equal(c.state.minute,startMinute);
                assert.ok(events.some(e=>e.input.tool==='world_wildlife'&&e.input.args.operation==='observe'));
            }},
        {id:'WildlifeTrack',input:'沿北林边追踪一次褐背短鹿，发现后就停下来。不攻击，不驯服，不取材。',setup:prepare,
            context:'褐背短鹿为白昼活动物种。只执行一次world_wildlife track，耗60分钟；检定失败也耗时。只有found是实际接触个体，发现不等于击杀或获得材料。整回合总时长用工具回执。',
            assert:(c,{initial,startMinute,events})=>{
                const attempts=events.filter(e=>e.input.tool==='world_wildlife'&&e.input.args.operation==='track');
                assert.equal(attempts.length,1);assert.equal(c.state.minute,startMinute+engine.rules.wildlife.trackMinutes);
                assert.deepEqual(c.state.inventory,initial.state.inventory);assert.equal(c.state.player.coins,initial.state.player.coins);
                const result=attempts[0].result,stock=doc=>doc.state.records['ecology:habitat_hw_wood'].populations.monster_brown_deer;
                assert.equal(stock(c).withdrawn-stock(initial).withdrawn,result.success?1:0);
                if(result.success){assert.equal(c.state.creatures[result.found.id].species,'monster_brown_deer');assert.equal(c.state.creatures[result.found.id].status,'正常');}
            }},
    ];
}
