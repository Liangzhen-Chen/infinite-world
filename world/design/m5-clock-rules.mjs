// Resource monitors consume existing ledgers; they do not execute the remote
// factions' prose plans, appoint officers, or instantiate faction resources.
export const worldClockRules={version:1,clocks:[
 ...['loc_bs_yupo','loc_bs_weiting','loc_bs_liquan','loc_bs_sangban'].map(settlement=>({
  id:`grain-review:${settlement}`,name:'公共粮约阶段核对',settlement,
  culture:'culture_river',faction:'faction_saltboat',scope:'resource-monitor',
  intervalDays:7,probability:1,cycle:'year',source:'M5/T44 现有粮仓与T38实际交割账',
  stages:[
   {name:'库存已核对',condition:{kind:'managed_granary'},effect:{kind:'regional_quote',item:'item_oats'}},
   {name:'交割已核对',condition:{kind:'delivered_trade',minimum:1},effect:{kind:'regional_quote',item:'item_oats'}},
   {name:'收获已核对',condition:{kind:'harvest',minimum:1},effect:{kind:'regional_quote',item:'item_oats'}}
  ]
 }))
]};
