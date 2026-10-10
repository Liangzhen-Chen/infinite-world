import assert from 'node:assert/strict';
import {withBosses} from '../world/design/boss-foundation.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {planRuleStateMigration} from '../server-plugin/rule-state-migration.mjs';
import {planAgricultureMigration} from '../server-plugin/agriculture-migration.mjs';
import {planWildlifeMigration} from '../server-plugin/wildlife-migration.mjs';
import {planBossMigration} from '../server-plugin/boss-migration.mjs';
export function bossScenarios(sourceEngine){
    const engine=new WorldEngine(withBosses(sourceEngine.world));
    const normalize=c=>{
        c.state.location='loc_hw_northwood';let next=applyPatches(c,planRuleStateMigration(c,engine.rules));
        next=applyPatches(next,planAgricultureMigration(next,engine.rules));next=applyPatches(next,planWildlifeMigration(next,engine.rules,engine.world.monsters));
        return applyPatches(next,planBossMigration(next,engine.rules,engine.world.bosses));
    };
    const run=async(c,tool,args,id)=>applyPatches(c,(await engine.reduce(c,{tool,args,eventId:id})).patches);
    const fixtureScope='隔离首领骨架世界：4个首领尚未审核发布；玩家30级/3000生命为安全观察夹具，不是正常成长证据';
    return[
        {id:'BossEntrance',engine,fixtureScope,input:'只观察北林边的栎根拱洞入口，不进入，也不追踪动物。',setup:normalize,
            context:'用world_lair observe，lair为lair_mud_tusk。此刻未接触占据者，入口观察不能知道里面首领或战术记忆。即时，整回合0分。',
            assert:(c,{initial,startMinute,events})=>{assert.deepEqual(c,{...initial,state:{...initial.state,turns:c.state.turns}});assert.equal(c.state.minute,startMinute);assert.ok(events.some(e=>e.input.tool==='world_lair'));}},
        {id:'BossApproach',engine,fixtureScope,input:'我进入栎根拱洞，见到占据者后停下来，不打、不驯、不拿东西。',setup:normalize,
            context:'用world_lair approach和lair_mud_tusk，只一次，耗10分，不调用交锋。回执contact与minions才是接触到的个体。',
            assert:(c,{initial,startMinute,events})=>{assert.equal(c.state.minute,startMinute+10);assert.equal(events.filter(e=>e.input.tool==='world_lair'&&e.input.args.operation==='approach').length,1);assert.equal(c.state.creatures.boss_mud_tusk.status,'正常');assert.equal(c.state.creatures.boss_mud_tusk.battleMemory.lastEvent,null);assert.deepEqual(c.state.inventory,initial.state.inventory);}},
        {id:'BossAdaptation',engine,fixtureScope,input:'我再空手向泥鬃裂牙进攻一次，不追击，也不换武器。',setup:async c=>{
                let next=normalize(c);next.state.player.level=30;next.state.player.hp=3000;next.state.player.maxHp=3000;
                next=await run(next,'world_lair',{operation:'approach',lair:'lair_mud_tusk'},'prepare_enter');
                for(let i=0;i<2;i++)next=await run(next,'world_combat',{target:'boss_mud_tusk'},`prepare_attack${i}`);return next;
            },context:'泥鬃裂牙已实际见过两次空手进攻。调用world_combat一次target boss_mud_tusk，intent attack，不自行改伤害或首领记忆。这次交锋10秒、累计未满一分钟，整回合0分；adaptation只表示本次可见防备，不透露内心独白。',
            assert:(c,{events,startMinute})=>{const fights=events.filter(e=>e.input.tool==='world_combat');assert.equal(fights.length,1);assert.equal(c.state.minute,startMinute);assert.equal(fights[0].result.adaptation.guarded,true);assert.equal(c.state.creatures.boss_mud_tusk.battleMemory.tactics.unarmed,3);}},
        {id:'BossVacatedLair',engine,fixtureScope,input:'我再进入栎根拱洞，看看现在真正占据它的是什么，不攻击。',setup:async c=>{
                let next=normalize(c);next.state.player.level=30;next.state.player.hp=3000;next.state.player.maxHp=3000;
                next=await run(next,'world_lair',{operation:'approach',lair:'lair_mud_tusk'},'prepare_enter');
                for(let i=0;i<60&&next.state.creatures.boss_mud_tusk.status!=='死亡';i++)next=await run(next,'world_combat',{target:'boss_mud_tusk'},`prepare_attack${i}`);
                assert.equal(next.state.creatures.boss_mud_tusk.status,'死亡');return run(next,'world_time',{minutes:7*1440},'prepare_wait');
            },context:'原首领已实际败亡，已等七天；占据者由当地种群迁入，没有复活原首领。用world_lair approach和lair_mud_tusk一次，耗10分。只叙述contact，不自动攻击或发材料。',
            assert:(c,{initial,startMinute,events})=>{assert.equal(c.state.minute,startMinute+10);assert.equal(c.state.creatures.boss_mud_tusk.status,'死亡');assert.equal(c.state.records['lair:lair_mud_tusk'].occupant.definition,'monster_leaf_hare');assert.deepEqual(c.state.inventory,initial.state.inventory);assert.ok(events.some(e=>e.input.tool==='world_lair'));}},
    ];
}
