import assert from 'node:assert/strict';
import {applyPatches} from '../server-plugin/storage.mjs';
import {weatherAt} from '../server-plugin/weather.mjs';
const record=c=>c.state.records['agriculture:loc_hw'];
export function agricultureScenarios(engine,legacy){
    if(!engine.rules.agriculture)return[];
    return[
        {id:'AgricultureBuy',fixtureScope:'正式源createCharacter新战役；仅将玩家置于现有管理员柜台，没有注入谷物或铜钱',
            input:'我从公共粮仓买两份带壳燕麦，按实际价格付钱，只买这两份。',
            setup:()=>{const c=engine.createCharacter(legacy,{},'quick-AgricultureBuy');c.state.location='bld_hw_council';return c;},
            context:'使用world_farm operation buy quantity 2，公共粮仓已有实际余粮。每份item_oats半公斤、3铜，共6铜、10分钟；只完成这笔买卖。物品和铜钱以工具成功回执为准，不由陈柏私人背包出货。',
            assert:(c,{initial,startMinute,events,reply})=>{
                assert.equal(c.state.player.coins,initial.state.player.coins-6);assert.equal(c.state.inventory.item_oats.quantity,2);
                assert.equal(c.state.settlements.loc_hw.food,initial.state.settlements.loc_hw.food-2);
                assert.equal(c.state.settlements.loc_hw.treasury,initial.state.settlements.loc_hw.treasury+6);
                assert.equal(c.state.minute,startMinute+10);assert.equal(events.filter(e=>e.input.tool==='world_farm'&&e.input.args.operation==='buy').length,1);
                assert.ok(!/免费|赠送|不收钱/.test(reply));
            }},
        {id:'AgricultureSow',fixtureScope:'正式源createCharacter新战役，经真实world_time推进到首个可作业春日；置于登记农田，无赠送种粮或技能',
            input:'我在公共田帮忙播种一次，不要连续干一整天，也不要领取报酬。',
            setup:async()=>{
                let c=engine.createCharacter(legacy,{},'quick-AgricultureSow'),day;
                for(let d=5;d<=25;d++)if(!['storm','snow'].includes(weatherAt(engine,c.randomSeed,'loc_hw_fields',d*1440+540).kind)){day=d;break;}
                if(day===undefined)throw new Error('没有找到本次可作业的春日');
                const out=await engine.reduce(c,{tool:'world_time',args:{minutes:day*1440},eventId:'prepare_agri_spring'});c=applyPatches(c,out.patches);
                c.state.location='loc_hw_fields';return c;
            },
            context:'只调用一次world_farm operation sow。工具内部已检定并耗时90分钟，无需先world_check或再world_time。失败如实描述，成功要实际扣种粮和增加种植面积。公共田的志愿劳动没有私人粮食或工资，作物须经历180个实际生长日才能收获。',
            assert:(c,{initial,startMinute,events})=>{
                const calls=events.filter(e=>e.input.tool==='world_farm'&&e.input.args.operation==='sow');assert.equal(calls.length,1);
                assert.equal(c.state.minute,startMinute+90);assert.equal(c.state.player.coins,initial.state.player.coins);
                assert.deepEqual(c.state.inventory,initial.state.inventory);
                const before=record(initial),after=record(c);
                if(calls[0].result.success){assert.equal(before.field.seedBank-after.field.seedBank,calls[0].result.seed);
                    assert.equal(after.field.sownUnits-before.field.sownUnits,calls[0].result.units);}
                else{assert.equal(after.field.seedBank,before.field.seedBank);assert.equal(after.field.sownUnits,before.field.sownUnits);}
                assert.equal(after.ledger.harvested,0);
            }},
    ];
}
