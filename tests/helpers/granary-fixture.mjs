// 周贸易类测试的共用夹具：开局各村存粮 = 目标持有（farmTargetFood，常态 = 目标），买方需求 = 目标 − 实存 − 在途 = 0，周贸易本就不该发货。
// 要测"买方缺粮时的运输与结算"，就把四村实存压到各自目标的一个比例（默认 80%）：需求约为目标的 20%（须大于每班上限，下面断言）。
// 两条前置条件写成断言：买方缺口大于每班上限、卖方实存高于 90 日储备（目标 = 餐口 × (距收获天数 + reserveDays) ≥ 餐口 × reserveDays，按 80% 仍在储备之上）。
import assert from 'node:assert/strict';
import {farmTargetFood} from '../../server-plugin/agriculture-migration.mjs';
import {mealMouthsOf} from '../../server-plugin/primitives-body.mjs';
import {resyncBooks} from './ledger-sync.mjs';

export function setGrain(doc,id,quantity,{expiresDay=210}={}){
    const r=doc.state.records[`agriculture:${id}`],s=doc.state.settlements[id];s.food=quantity;
    r.batches=quantity?[{id:'source_opening',kind:'grain',amount:quantity,harvestDay:-150,expiresDay,source:'isolated fixture actual stock'}]:[];
    r.ledger.openingFood=quantity;r.ledger.freshProduced=0;r.ledger.eaten=0;r.ledger.spoiled=0;r.ledger.overflow=0;
}
export function thinGranaries(engine,doc,fraction=0.8){
    const laneMaximum=Math.max(...engine.rules.settlementTrade.lanes.map(l=>l.maximumQuantity));
    for(const p of engine.rules.agriculture.settlements.filter(p=>p.opening)){
        const target=farmTargetFood(engine,doc.state,p,doc.state.minute);
        setGrain(doc,p.settlement,Math.floor(fraction*target));
        const mouths=mealMouthsOf(engine,doc.state,p.settlement,doc.state.settlements[p.settlement].population);
        assert.ok(target-doc.state.settlements[p.settlement].food>laneMaximum,'买方缺口须大于每班上限（取规则里各班线上限的最大值）');
        assert.ok(doc.state.settlements[p.settlement].food>mouths*p.reserveDays,'卖方实存须高于储备');
    }
    return resyncBooks(engine,doc);
}
