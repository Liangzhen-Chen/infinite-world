export function hearthCandidate(charcoalWeight){return{
 id:'feature_hw_hearth',name:'青灯备料火盆',aliases:['备料火盆'],kind:'object',owner:'npc_hw_linsui',access:'consent',position:[0,0],state:{},
 thermalModel:{heatCapacityJPerC:1000,maximumC:350,ambientC:20,passiveExchangeJPerMinute:50,burnMgPerMinute:1000,fuelJPerMg:20,efficiencyPermille:900,ashPermille:50,ignitionMaximumMg:5000,ignitable:true,dryable:false,fuels:[{item:'item_charcoal',milligramsPerUnit:Math.round(charcoalWeight*1000000)}]},
 thermalInitial:{temperatureC:20,fuelMg:4000,moistureMg:0},
};}
export const hearthPlacement={location:'bld_hw_qingdeng',proposal:'位于青灯后厨，4克已有干火绒为一次初始量；使用须林穗授权，之后添加自有木炭，不能凭空补满。',workstation:'station_hw_kitchen',gate:'候选未发布；先核对既有烹饪配方的耗材和时间，决定热需求，避免同一燃料重复收费或扣料。'};
