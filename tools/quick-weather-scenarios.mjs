import assert from 'node:assert/strict';
import {localWeather,weatherAt}from'../server-plugin/weather.mjs';
import {applyPatches}from'../server-plugin/storage.mjs';
import {planRuleStateMigration}from'../server-plugin/rule-state-migration.mjs';
import {planAgricultureMigration}from'../server-plugin/agriculture-migration.mjs';
import {planWildlifeMigration}from'../server-plugin/wildlife-migration.mjs';
export function weatherScenarios(engine){
    if(!engine.rules.weather)return[];
    const normalize=c=>{const migrated=applyPatches(c,planRuleStateMigration(c,engine.rules)),farm=applyPatches(migrated,planAgricultureMigration(migrated,engine.rules));return applyPatches(farm,planWildlifeMigration(farm,engine.rules,engine.world.monsters));};
    return[
        {id:'WeatherObservation',input:'看看今天这里的天气和日出日落时间，只看一下，不要等待或做别的。',
            setup:c=>{c.state.location='loc_hw_dock';return normalize(c);},
            context:'用world_weather inspect观察已存在的天气，观察即时，整回合0分。日出日落使用回执sunrise/sunset，不虚构温度、雨雪或远处天气。',
            assert:(c,{initial,startMinute,events,reply})=>{
                // Finalising a response records its turn anchor even at zero elapsed
                // time. All gameplay state must remain equal; only that marker differs.
                assert.deepEqual(c,{...initial,state:{...initial.state,turns:c.state.turns}});assert.equal(c.state.minute,startMinute);
                assert.ok(events.some(e=>e.input.tool==='world_weather'));
                const w=localWeather(engine,initial);assert.ok(reply.includes(w.name));assert.ok(reply.includes(w.sunrise)&&reply.includes(w.sunset));
            }},
        {id:'WeatherTravel',fixtureScope:'隔离日期夹具：使用源天气选取一个雨日的旅程，不代表玩家已经自然经历这些日期',
            input:'我现在步行去村北林地，只走这段路，不做别的。',setup:c=>{
                c.state.location='loc_hw';
                for(let day=0;day<90;day++)if(weatherAt(engine,c.randomSeed,'loc_hw',day*1440+540)?.kind==='rain'){c.state.minute=day*1440+540;return normalize(c);}
                throw new Error('本隔离场景未找到源天气雨日');
            },context:'当前实际有雨。用world_move destination loc_hw_northwood mode walk，路程由引擎实际结算，不能另加world_time默认10分钟或再走回来。',
            assert:(c,{initial,startMinute,events})=>{
                const route=engine.route('loc_hw','loc_hw_northwood','walk',startMinute,initial.randomSeed);
                assert.equal(c.state.location,'loc_hw_northwood');assert.equal(c.state.minute,startMinute+route.minutes);
                assert.equal(c.state.player.coins,initial.state.player.coins-route.cost);
                assert.equal(events.filter(e=>e.input.tool==='world_move').length,1);
            }},
    ];
}
