import assert from 'node:assert/strict';
// 开局存粮的期望值，按现行规律在测试里独立手算（不调 openingFood / farmTargetFood / farmTargetDays）：
//   开局存粮 = min(餐口 × (距收获天数 + reserveDays), 仓容 − 种粮)
//   距收获天数 = 收获日 − 开局日，收获日 = sowDays[1] + growthDays（rules.agriculture.crop），开局日 = 第 0 日；
//   餐口 = 开局人口（前置：该聚落居民无饱食代谢非 1 者、无待定混种结构，故餐口不加权）；
//   仓容 = p.granaryCapacity（前置：开局无已建公共粮仓设施，故无追加）；种粮 = p.initialSeed。
export function expectedOpeningFood(engine,state,p){
    const rules=engine.rules.agriculture,profile=engine.world.settlementProfiles.find(s=>s.id===p.settlement);
    for(const id of profile.residentIds??[]){const sp=engine.byId.get(engine.byId.get(id)?.species),m=sp?.nature?.metabolism?.satiety;assert.ok(m===undefined||m===1,`前置：${id} 饱食代谢非 1，餐口不等于人口`);}
    assert.equal(profile.pendingSpeciesStructure,undefined,`前置：${p.settlement} 无待定混种结构`);
    assert.ok(!Object.values(state.created??{}).some(b=>b.builtProject&&b.facilityType==='granary'),'前置：开局无已建粮仓设施');
    assert.equal(Math.floor(state.minute/1440),0,'前置：开局日为第 0 日');
    const mouths=state.settlements[p.settlement].population,days=rules.crop.sowDays[1]+rules.crop.growthDays+p.reserveDays;
    return Math.min(mouths*days,p.granaryCapacity-p.initialSeed);
}
