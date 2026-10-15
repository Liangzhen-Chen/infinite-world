// U10 life-magic economy (guide 3.6). The spells keep their reviewed physics;
// these are the settlement-scale consequences of casting them in a village:
//   preserve  food-keeping charms cut the granary's monthly spoilage in
//             proportion to the stock they cover, and cheapen fresh food;
//   irrigate  channel watering raises this season's standing crop and blunts
//             a drought's crop damage (crop_damage with cause 'drought');
//   growth    field growth (its acceleration is settled by magic-growth) eases
//             grain prices and draws the same reactions;
//   purify    cleaning the village water lowers the household and route
//             spread of water-borne disease (U3 epidemics).
// Price cuts follow the number of casts within windowDays and are settled at
// midnight by the advance registry, so heavy casting bends the local curve.
// Current occupations and households come from entity-view. Occupations are
// matched by substring: beneficiaries' standing rises, and
// competitors lose income, grow cold and finally complain (rumor + opinion).
// Regulation: past freeCastsPerMonth a village charges a fee, requires a
// monthly licence, or forbids casting beyond maximumCastsPerMonth; unpaid fees
// and breaches go to the local law code as cases. Regulation rows are authored
// local policy overrides. Current office holders are exempt; an empty governing
// office suspends collection. Fees enter the settlement's unified group account.
const grain=['item_oats','item_ration','item_oat_flour','item_oat_flatbread','item_pearl_barley','item_rye_flour','item_wheat_grain'];
export const magicEconomyRules={
 version:1,
 source:'指南3.6 生活魔法的经济影响；docs/PLAN.md U10',
 windowDays:30,
 kinds:{
  preserve:{name:'保鲜',spells:[{kind:'care',operation:'preserve_food'},{kind:'care',operation:'preserve'}],
   coverFoodPerCast:2000,lossCutPermille:600,
   items:['item_fresh_apple','item_pear','item_fish','item_parsnip','item_beet','item_mutton','item_butter','item_fresh_curd'],
   priceCutPermillePerCast:15,maximumPriceCutPermille:150,
   beneficiaries:['货栈','摊位','酒馆','灶房','拣菜','择菜'],competitors:['腌','冰','晒谷'],incomeLossCopperPerCast:3},
  irrigate:{name:'引水',spells:[{kind:'environment',operation:'irrigate'},{kind:'environment',operation:'soil_water'}],
   areaUnitsPerCast:20,yieldBonusPermille:60,maximumYieldBonusPermille:150,droughtReliefPermille:600,unmanagedFieldAreaUnits:1000,
   items:grain,priceCutPermillePerCast:4,maximumPriceCutPermille:80,
   beneficiaries:['田间','农','菜圃','种菜','坡田','菜地'],competitors:['挑水','担水','搬运'],incomeLossCopperPerCast:2},
  growth:{name:'助长',spells:[{kind:'growth'}],
   items:grain,priceCutPermillePerCast:4,maximumPriceCutPermille:80,
   beneficiaries:['田间','农','菜圃','种菜','坡田','菜地'],competitors:[],incomeLossCopperPerCast:0},
  purify:{name:'净水',spells:[{kind:'environment',operation:'clean_water'}],
   householdsPerCast:4,coverMinutes:1440,householdFactor:0.6,routeFactor:0.8,
   items:['item_water'],priceCutPermillePerCast:20,maximumPriceCutPermille:200,
   beneficiaries:['家务','灶房','洗晒'],competitors:['药','挑水','担水'],incomeLossCopperPerCast:2},
 },
 reactions:{beneficiaryDelta:2,maximumBeneficiaryDelta:6,competitorDelta:-3,maximumCompetitorDelta:-9,maximumPeoplePerKind:6,
  complaintCopper:10,complaintCooldownDays:30,complaintCarriers:3,settlementComplaintDelta:-2,complaintTightening:2},
 regulation:[
  {settlement:'loc_hw',mode:'fee',freeCastsPerMonth:6,feeCopper:2},
  {settlement:'loc_bs_yupo',mode:'license',freeCastsPerMonth:4,licenseCopper:20},
  {settlement:'loc_bs_weiting',mode:'restrict',freeCastsPerMonth:4,feeCopper:3,maximumCastsPerMonth:12},
 ],
 penalties:{
  magic_levy_unpaid:{baseFine:5,valueMultiplier:1},
  magic_unlicensed:{baseFine:10,valueMultiplier:1},
  magic_over_quota:{baseFine:15,valueMultiplier:0},
 },
};
