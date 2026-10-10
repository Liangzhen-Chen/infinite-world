import assert from 'node:assert/strict';
import {withFarmPests} from '../world/design/farm-pests-foundation.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
export function farmPestsScenarios(sourceEngine,legacy){
    const engine=new WorldEngine(withFarmPests(sourceEngine.world)),record=c=>c.state.records['agriculture:loc_hw'];
    const run=async(c,tool,args,id)=>{const out=await engine.reduce(c,{tool,args,eventId:id});return{document:applyPatches(c,out.patches),result:out.result};};
    const prepare=async(id)=>{
        let c=engine.createCharacter(legacy,{},`quick-${id}`);c.state.location='loc_hw_northwood';c.state.minute=1200;
        c.state.player.level=30;c.state.player.hp=3000;c.state.player.maxHp=3000;
        for(let n=0;n<3;n++){
            let tracked;for(let attempt=0;attempt<60;attempt++){tracked=await run(c,'world_wildlife',{operation:'track',species:'monster_red_ear_fox'},`prepare_track${n}:${attempt}`);if(tracked.result.success)break;}
            assert.ok(tracked.result.success);c=tracked.document;const target=tracked.result.found.id;
            for(let i=0;i<60&&c.state.creatures[target].status!=='死亡';i++)c=(await run(c,'world_combat',{target},`prepare_kill${n}:${i}`)).document;
            assert.equal(c.state.creatures[target].status,'死亡');
        }
        for(let i=0;i<2;i++)c=(await run(c,'world_time',{minutes:30*1440},`prepare_month${i}`)).document;
        c.state.location='loc_hw_fields';c.state.minute=Math.floor(c.state.minute/1440)*1440+1080;return c;
    };
    const fixtureScope='候选害兽规则隔离世界，经实际追踪/交锋清除三只捕食者后推进60天；30级/3000生命为安全检定夹具，不是正常成长或在线启用证据';
    return[
        {id:'FarmPestInspect',engine,fixtureScope,input:'我在南田看看现在燕麦的实际受损状况，只观察，不劳动。',setup:()=>prepare('FarmPestInspect'),
            context:'用world_farm inspect，观察已记录的害兽啃食损伤，不读取隐藏种群或把未收获产量当仓内粮食。harvestLostToPests是当天收获前损失，不等于长势新增损伤；后者用pestDamageAddedMaxPercent。即时，0分；只能说当前损伤，不能归因于具体猎人或NPC未知道的往事。',
            assert:(c,{initial,startMinute,events})=>{assert.equal(c.state.minute,startMinute);assert.deepEqual(c,{...initial,state:{...initial.state,turns:c.state.turns}});assert.ok(events.some(e=>e.input.tool==='world_farm'&&e.input.args.operation==='inspect'));assert.ok(record(c).field.cohorts.some(r=>r.pestDamageBps>0));}},
        {id:'FarmPestGuard',engine,fixtureScope,input:'我今晚只巡田一次，驱赶啃庄稼的动物，不杀它们，也不要报酬。',setup:()=>prepare('FarmPestGuard'),
            context:'现在18:00。只一次world_farm guard，耗90分并实际检定；成功后回执protection.startLocal/untilLocal才是防护时段，从工作完成起算4小时，不从开始工作算。不能写成田鼠减少或损失恢复。失败也耗时，不另world_check/world_time，不送物品或工资。',
            assert:(c,{initial,startMinute,events,reply})=>{
                const calls=events.filter(e=>e.input.tool==='world_farm'&&e.input.args.operation==='guard');assert.equal(calls.length,1);assert.equal(c.state.minute,startMinute+90);
                assert.deepEqual(c.state.creatures,initial.state.creatures);assert.deepEqual(c.state.inventory,initial.state.inventory);assert.equal(c.state.player.coins,initial.state.player.coins);
                assert.deepEqual(record(c).field.cohorts,record(initial).field.cohorts);
                assert.equal(record(c).field.pestProtection.length-record(initial).field.pestProtection.length,calls[0].result.success?1:0);
                if(calls[0].result.success){assert.ok(!reply.includes('21:30'),'巡守又把23:30到期错写成21:30');assert.equal(calls[0].result.protection.durationMinutes,240);}
            }},
    ];
}
