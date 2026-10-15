// U3 seasonal and disaster world clocks. A separate table from the reviewed
// grain monitors in rules.worldClock (whose phases and assertions are kept):
// floods, winter famine, epidemics and price swings advance in stages by
// region, season and the campaign seed. Every stage effect is a K6 effect kind
// (server-plugin/effects.mjs); seasonal-hazards.mjs registers the new kinds.
//
// Clock fields: kind flood|famine|epidemic|price; settlement (region anchor);
// seasons (contiguous, 0 spring .. 3 winter); intervalDays between stage
// checks inside the season window; stages[{id,name,probability,condition,
// effects}] reset each year. Conditions: always, weather (pure, seeded
// weather at the settlement), granary_short (food below population x days),
// hunger (people going without meals, or a declared famine), hazard_phase
// (another clock this year), epidemic_cases, epidemic_clear, all (every one of
// `conditions`). Disease householdRate is households a sick household reaches
// per day (spread over its settlement); routeRate per day along a 10 km road.
// Water-borne disease breaks out after the flood only where people already go
// hungry, so a well-fed 河湾 rides out an ordinary summer flood.
const grain=['item_oats','item_ration','item_oat_flour','item_oat_flatbread','item_pearl_barley','item_rye_flour','item_wheat_grain'];
const DAY=1440;
const famine=(settlement,carriers)=>({
 id:`famine:${settlement}`,kind:'famine',name:'冬荒',settlement,seasons:[3],intervalDays:7,
 stages:[
  {id:'tight',name:'存粮告紧',probability:1,condition:{kind:'granary_short',days:90},
   effects:[{kind:'price_shift',settlement,items:grain,factor:1.2,minutes:120*DAY,reason:'冬季存粮告紧'},
    {kind:'rumor',id:'famine_tight',claim:'今冬仓里的粮撑不到开春，粮价已经往上走了。',carriers,salience:2}]},
  {id:'famine',name:'冬荒',probability:1,condition:{kind:'granary_short',days:45},
   effects:[{kind:'price_shift',settlement,items:grain,factor:1.6,minutes:120*DAY,reason:'冬荒缺粮'},
    {kind:'famine',settlement,minutes:120*DAY},
    {kind:'rumor',id:'famine_hunger',claim:'冬荒了，有人家已经断顿，有人说要去外乡投亲，也有人盯上了别家的粮囤。',carriers,salience:3}]},
 ],
});
export const hazardClockRules={version:1,source:'U3 季节与灾害世界时钟；指南3.14季节影响农事、行路、价格，4.9世界时钟（汛期、冬荒、瘟疫、物价波动）',
 diseases:[
  {id:'disease_river_flux',name:'河泻症',route:'water',symptoms:'腹泻、发热、口渴乏力',incubationDays:[1,3],courseDays:[6,14],
   householdRate:0.12,routeRate:0.02,graveShare:0.18,fatality:{cared:0.12,alone:0.3}},
  {id:'disease_cold_cough',name:'寒咳疫',route:'air',symptoms:'咳嗽、寒热、胸闷',incubationDays:[2,4],courseDays:[8,16],
   householdRate:0.1,routeRate:0.02,graveShare:0.12,fatality:{cared:0.1,alone:0.25}},
 ],
 // Factors multiply transmission while a measure lasts (fatality and course
 // for treatment). purify acts only on water-borne disease.
 measures:{
  quarantine:{household:0.45,route:0.15},
  treatment:{fatality:0.5,course:0.7},
  purify:{routes:['water'],household:0.4,route:0.6},
  ritual:{household:0.9},
 },
 clocks:[
  {id:'flood:loc_hw',kind:'flood',name:'汛期',settlement:'loc_hw',seasons:[1],intervalDays:5,
   stages:[
    {id:'rise',name:'河水上涨',probability:0.4,condition:{kind:'weather',kinds:['rain','storm']},
     effects:[{kind:'rumor',id:'flood_rise',claim:'连着几场雨，旧渡口的水位一天比一天高。',carriers:['npc_hw_zhengshuisheng','npc_hw_linsui'],salience:2}]},
    {id:'crest',name:'洪峰过境',probability:0.5,condition:{kind:'weather',kinds:['rain','storm']},
     effects:[{kind:'route_closure',routes:['route_loc_hw_dock','route_hw_yandu'],minutes:5*DAY,reason:'洪水漫过旧渡口'},
      {kind:'flood',locations:['loc_hw_dock','loc_hw_fields'],minutes:5*DAY},
      {kind:'crop_damage',settlement:'loc_hw',percent:30,minutes:30*DAY},
      {kind:'rumor',id:'flood_crest',claim:'洪峰过了旧渡口，渡船停了，南田泡在水里。',carriers:['npc_hw_zhengshuisheng','npc_hw_luowei','npc_hw_linsui'],salience:3}]},
    {id:'recede',name:'退水',probability:0.6,condition:{kind:'always'},
     effects:[{kind:'rumor',id:'flood_recede',claim:'水退了，渡口留下一层淤泥，南田要补种。',carriers:['npc_hw_zhengshuisheng','npc_hw_luowei'],salience:1}]},
   ]},
  {id:'epidemic:loc_hw',kind:'epidemic',name:'疫病流行',settlement:'loc_hw',seasons:[1,2],intervalDays:3,disease:'disease_river_flux',
   spread:{routes:['route_hw_bs','route_bs_yp','route_bs_wt','route_bs_lq','route_bs_sb']},
   stages:[
    {id:'cases',name:'零星病例',probability:0.3,condition:{kind:'all',conditions:[{kind:'hazard_phase',clock:'flood:loc_hw',minimum:2},{kind:'hunger'}]},
     effects:[{kind:'epidemic',disease:'disease_river_flux',settlement:'loc_hw',cases:2},
      {kind:'rumor',id:'epidemic_cases',claim:'退水后河湾有人家上吐下泻发热，药草院陶芷说是喝了脏水。',carriers:['npc_hw_taozhi','npc_hw_linsui'],salience:3}]},
    {id:'spread',name:'疫病流行',probability:1,condition:{kind:'epidemic_cases',minimum:5},
     effects:[{kind:'price_shift',settlement:'loc_hw',items:['item_herb'],factor:1.5,minutes:30*DAY,reason:'疫病流行，药草紧缺'},
      {kind:'rumor',id:'epidemic_spread',claim:'河泻症在河湾挨家传开了，往白石镇去的人也有染上的。',carriers:['npc_hw_taozhi','npc_hw_chenbai','npc_hw_linsui'],salience:4}]},
    {id:'wane',name:'疫退',probability:1,condition:{kind:'epidemic_clear'},
     effects:[{kind:'rumor',id:'epidemic_wane',claim:'河湾已经好些天没有新病人，河泻症算是过去了。',carriers:['npc_hw_taozhi','npc_hw_chenbai'],salience:2}]},
   ],
   // Player measures through world_settlement faction_inspect/faction_intervene
   // (clock = this id, choice = intervention id). Stages: phases during which
   // the measure can be taken (1 = cases seen, 2 = spreading).
   interventions:[
    {id:'treat',name:'请药师治疗',measure:'treatment',phases:[1,2],location:'bld_hw_herbs',representative:'npc_hw_taozhi',cost:{coins:40},minutes:180,
     effects:[{kind:'epidemic_measure',measure:'treatment',minutes:20*DAY},{kind:'standing',holder:'loc_hw',target:'player',delta:4,reason:'出钱请药师给病家诊治'}]},
    {id:'quarantine',name:'劝村里隔离病家',measure:'quarantine',phases:[1,2],location:'bld_hw_council',representative:'npc_hw_chenbai',cost:{},minutes:120,attribute:'魅力',difficulty:12,
     effects:[{kind:'epidemic_measure',measure:'quarantine',minutes:15*DAY},{kind:'standing',holder:'loc_hw',target:'player',delta:2,reason:'帮村务屋安排病家隔离'}]},
    {id:'purify',name:'以净水术清水并煮沸分水',measure:'purify',phases:[1,2],location:'loc_hw_dock',spell:'spell_water_02',cost:{mp:6},minutes:150,
     effects:[{kind:'epidemic_measure',measure:'purify',minutes:10*DAY},{kind:'standing',holder:'loc_hw',target:'player',delta:3,reason:'清水煮沸分给各家'}]},
    {id:'ritual',name:'在河湾石坛主持祭祀',measure:'ritual',phases:[1,2],location:'bld_hw_altar',cost:{coins:15},minutes:120,
     effects:[{kind:'epidemic_measure',measure:'ritual',minutes:10*DAY},{kind:'standing',holder:'loc_hw',target:'player',delta:1,reason:'在石坛为病家祭祀'}]},
   ]},
  {id:'price:loc_bs',kind:'price',name:'青黄不接粮价波动',settlement:'loc_bs',seasons:[1],intervalDays:10,
   stages:[
    {id:'rise',name:'粮价看涨',probability:0.4,condition:{kind:'always'},
     effects:[{kind:'price_shift',settlement:'loc_bs',items:grain,factor:1.15,minutes:60*DAY,reason:'青黄不接，陈粮见少'}]},
    {id:'peak',name:'粮价高企',probability:0.3,condition:{kind:'always'},
     effects:[{kind:'price_shift',settlement:'loc_bs',items:grain,factor:1.3,minutes:60*DAY,reason:'青黄不接，粮商惜售'}]},
    {id:'ease',name:'粮价回落',probability:0.5,condition:{kind:'always'},
     effects:[{kind:'price_shift',settlement:'loc_bs',items:grain,factor:1,minutes:1,reason:'新麦将下，粮价回落'}]},
   ]},
  famine('loc_hw',['npc_hw_linsui','npc_hw_chenbai']),
 ],
};
