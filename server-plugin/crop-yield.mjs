// 统计产粮的季节产量倍数：引擎的每日产粮（weather.mjs cropProduction）和聚落的储备模型（supply-interval.selfSupplyDays、远郡名义产量）共用这一处，
// 保证两边永远一致。只读规则数据，不引入其它模块（避免导入环）。
//
// 倍数 g_s：
//  · 聚落在某个气候区里（rules.weather.regions[].locations 含该聚落）→ 有天气行：g_s = cropSeasonFactors[s] × 当日天气倍数（weather.states[当日天气].crop）；
//    储备模型用期望：天气逐日按"持续概率×昨日 + (1−持续概率)×季节权重"抽取（weather.mjs:69-74），稳态边缘分布就是季节权重，
//    所以 E_s = Σ(seasonalWeights[s][i] × states[kinds[i]].crop) ÷ Σ seasonalWeights[s]（权重列序 = weather.mjs:58 的 kinds = rules.weather.states 的键序；
//    数据出处 world/meta/rules.json:4836 states、:4911 seasonalWeights、:4945 cropSeasonFactors）；
//  · 聚落不在任何气候区（如生成的远方聚落，remote-generation.mjs:315 没有天气区）→ 没有天气行，引擎不缩放产量：g_s = 1。
export function hasWeather(rules,place){return !!rules.weather?.regions?.some(r=>r.locations.includes(place));}
export function expectedWeatherCrop(rules,season){
 const w=rules.weather,kinds=Object.keys(w.states),weights=w.seasonalWeights[season];
 if(weights.length!==kinds.length)throw Error('天气季节权重列数与天气状态数不符，推不出期望产量倍数');
 return weights.reduce((n,weight,i)=>n+weight*w.states[kinds[i]].crop,0)/weights.reduce((a,b)=>a+b,0);
}
// weatherCrop：引擎当日实际天气倍数；不给就取期望（储备模型用）。
export function cropYieldFactor(rules,place,season,weatherCrop){
 if(!hasWeather(rules,place))return 1;
 return rules.weather.cropSeasonFactors[season]*(weatherCrop??expectedWeatherCrop(rules,season));
}
// 一年四季的期望倍数（储备模型与名义产量用）。
export function seasonYieldFactors(rules,place){return [0,1,2,3].map(s=>cropYieldFactor(rules,place,s));}
