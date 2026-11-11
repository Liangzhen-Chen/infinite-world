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
// (a named stage of another clock this year), epidemic_cases, epidemic_clear, all (every one of
// `conditions`). Disease householdRate is households a sick household reaches
// per day (spread over its settlement); routeRate per day along a 10 km road.
// Water-borne disease breaks out after the flood only where people already go
// hungry, so a well-fed 河湾 rides out an ordinary summer flood.
const grain=['item_oats','item_ration','item_oat_flour','item_oat_flatbread','item_pearl_barley','item_rye_flour','item_wheat_grain'];
const DAY=1440;
// tight/short: days of food per head below which stores count as tight and
// as famine (D1: villages that lean on fish keep less, drought-prone ones more).
const famine=(settlement,carriers,{tight=90,short=45}={})=>({
 id:`famine:${settlement}`,kind:'famine',name:'冬荒',settlement,seasons:[3],intervalDays:7,
 stages:[
  {id:'tight',name:'存粮告紧',probability:1,condition:{kind:'granary_short',days:tight},
   effects:[{kind:'rumor',id:'famine_tight',claim:'今冬仓里的粮撑不到开春，粮价已经往上走了。',carriers,salience:2}]},
  {id:'famine',name:'冬荒',probability:1,condition:{kind:'granary_short',days:short},
   effects:[{kind:'famine',settlement,minutes:120*DAY},
    {kind:'rumor',id:'famine_hunger',claim:'冬荒了，有人家已经断顿，有人说要去外乡投亲，也有人盯上了别家的粮囤。',carriers,salience:3}]},
 ],
});
// ---- D1: the other core settlements and the monster settlements ------------
// Every core settlement carries flood, epidemic, famine and price clocks; the
// parameters follow its land, water, trade and stores. New clocks carry no new
// rumor text: their stages act through route, flood, crop, price, standing and
// wildlife effects only (the shared famine helper keeps its reviewed wording).
// 榆坡 loess slopes: summer storms wash the slope fields, rarely more.
// 苇汀 wetland: spring and summer high water over bank, reeds and garden.
// 砾泉 gravel spring: floods are rare and short; summer drought is the risk.
// 桑坂 mulberry slopes: storm water in the ditch fields.
// 白石镇 river port: high water over the dock street, ferries and carts stop.
const flood=(settlement,{seasons=[1],intervalDays=5,rise,crest,rain=['rain','storm'],peak=rain,low,soaked,closures,days,crop=0,price=null})=>({
 id:`flood:${settlement}`,kind:'flood',name:'汛期',settlement,seasons,intervalDays,
 stages:[
  {id:'rise',name:'水位上涨',probability:rise,condition:{kind:'weather',kinds:rain},
   effects:[{kind:'flood',locations:low,minutes:DAY}]},
  {id:'crest',name:'洪峰过境',probability:crest,condition:{kind:'weather',kinds:peak},
   effects:[{kind:'route_closure',routes:closures,minutes:days*DAY,reason:'洪水漫过道路'},
    {kind:'flood',locations:soaked,minutes:days*DAY},
    ...(crop?[{kind:'crop_damage',settlement,percent:crop,minutes:30*DAY}]:[]),
    ...(price?[{kind:'price_shift',settlement,items:grain,factor:price,minutes:20*DAY,reason:'水路车路中断，粮运受阻'}]:[])]},
  {id:'recede',name:'退水',probability:0.6,condition:{kind:'always'},
   effects:[{kind:'environment',state:'dry',locations:soaked}]},
 ],
});
// Epidemic: disease, season window, what lets the first cases appear, routes
// it travels, and the herb price where the sick buy medicine.
const epidemic=(settlement,{disease,seasons,intervalDays=3,first,probability,cases=2,minimum=5,routes=[],herbs=settlement,quarantine=null})=>({
 id:`epidemic:${settlement}`,kind:'epidemic',name:'疫病流行',settlement,seasons,intervalDays,disease,spread:{routes},
 stages:[
  {id:'cases',name:'零星病例',probability,condition:first,effects:[{kind:'epidemic',disease,settlement,cases}]},
  {id:'spread',name:'疫病流行',probability:1,condition:{kind:'epidemic_cases',minimum},
   effects:[{kind:'price_shift',settlement:herbs,items:['item_herb'],factor:1.4,minutes:30*DAY,reason:'疫病流行，药草紧缺'}]},
  {id:'wane',name:'疫退',probability:1,condition:{kind:'epidemic_clear'},
   effects:[{kind:'price_shift',settlement:herbs,items:['item_herb'],factor:1,minutes:1,reason:'疫退，药价回落'}]},
 ],
 ...(quarantine?{interventions:[{id:'quarantine',name:'劝乡里隔离病家',measure:'quarantine',phases:[1,2],location:quarantine.location,representative:quarantine.representative,cost:{},minutes:120,attribute:'魅力',difficulty:12,
  effects:[{kind:'epidemic_measure',measure:'quarantine',minutes:15*DAY},{kind:'standing',holder:settlement,target:'player',delta:2,reason:'帮乡里安排病家隔离'}]}]}:{}),
});
// Grain price swing between harvests: rise, peak, ease back.
const price=(settlement,{seasons=[1],intervalDays=10,rise,peak,up,high,name='青黄不接粮价波动'})=>({
 id:`price:${settlement}`,kind:'price',name,settlement,seasons,intervalDays,
 stages:[
  {id:'rise',name:'粮价看涨',probability:rise,condition:{kind:'always'},
   effects:[{kind:'price_shift',settlement,items:grain,factor:up,minutes:60*DAY,reason:'青黄不接，陈粮见少'}]},
  {id:'peak',name:'粮价高企',probability:peak,condition:{kind:'always'},
   effects:[{kind:'price_shift',settlement,items:grain,factor:high,minutes:60*DAY,reason:'青黄不接，粮商惜售'}]},
  {id:'ease',name:'粮价回落',probability:0.5,condition:{kind:'always'},
   effects:[{kind:'price_shift',settlement,items:grain,factor:1,minutes:1,reason:'新麦将下，粮价回落'}]},
 ],
});
const cough='disease_cold_cough',flux='disease_river_flux',cold={kind:'weather',kinds:['snow','fog']};
// Monster settlements keep no village granary: their winter hunger follows
// their own food source (bought grain, forage, forest yield, tribute grain)
// and shows as hard feelings toward the neighbour and more foraging nearby.
const lean=(settlement,faction,{tight,short,neighbour,habitat})=>({
 id:`famine:${settlement}`,kind:'famine',name:'冬荒',settlement,seasons:[3],intervalDays:7,
 stages:[
  {id:'tight',name:'存粮告紧',probability:tight.probability??1,condition:tight.condition,
   effects:[{kind:'wildlife_stir',habitat,minutes:10*DAY,factor:1.5},{kind:'standing',holder:faction,target:neighbour,delta:-3,reason:'冬季口粮告紧，换粮受阻'}]},
  {id:'famine',name:'冬荒',probability:short.probability??1,condition:short.condition,
   effects:[{kind:'wildlife_stir',habitat,minutes:20*DAY,factor:2.5},{kind:'standing',holder:faction,target:neighbour,delta:-6,reason:'冬荒断粮'}]},
 ],
});
const coreClocks=[
 price('loc_hw',{rise:0.3,peak:0.2,up:1.1,high:1.2}),
 // 榆坡
 flood('loc_bs_yupo',{intervalDays:6,rise:0.25,crest:0.3,rain:['storm'],low:['loc_yp_garden'],soaked:['loc_yp_fields','loc_yp_garden'],closures:['route_loc_yp_fields'],days:2,crop:15}),
 epidemic('loc_bs_yupo',{disease:cough,seasons:[3],intervalDays:4,first:cold,probability:0.1,routes:['route_bs_yp'],
  quarantine:{location:'bld_yp_hall',representative:'npc_yp_zhaofeng'}}),
 famine('loc_bs_yupo',['npc_yp_zhaofeng','npc_yp_lisha']),
 price('loc_bs_yupo',{rise:0.35,peak:0.25,up:1.1,high:1.25}),
 // 苇汀
 flood('loc_bs_weiting',{seasons:[0,1],intervalDays:4,rise:0.5,crest:0.5,low:['loc_wt_bank'],soaked:['loc_wt_bank','loc_wt_reeds','loc_wt_garden'],
  closures:['route_loc_wt_bank','route_loc_wt_reeds','route_loc_wild_wt_mist'],days:6,crop:35}),
 epidemic('loc_bs_weiting',{disease:flux,seasons:[1,2],first:{kind:'hazard_phase',clock:'flood:loc_bs_weiting',stage:'crest'},probability:0.25,routes:['route_bs_wt'],
  quarantine:{location:'bld_wt_hall',representative:'npc_wt_zhengxi'}}),
 famine('loc_bs_weiting',['npc_wt_zhengxi','npc_wt_xiangzhen'],{tight:75,short:35}),
 price('loc_bs_weiting',{rise:0.3,peak:0.2,up:1.08,high:1.15}),
 // 砾泉：旱多涝少
 flood('loc_bs_liquan',{intervalDays:10,rise:0.1,crest:0.15,rain:['storm'],low:['loc_lq_spring'],soaked:['loc_lq_fields'],closures:['route_loc_lq_fields'],days:1,crop:10}),
 epidemic('loc_bs_liquan',{disease:cough,seasons:[3],intervalDays:4,first:cold,probability:0.08,routes:['route_bs_lq'],
  quarantine:{location:'bld_lq_hall',representative:'npc_lq_luanpei'}}),
 famine('loc_bs_liquan',['npc_lq_luanpei','npc_lq_shaluo'],{tight:120,short:60}),
 {id:'price:loc_bs_liquan',kind:'price',name:'旱情粮价',settlement:'loc_bs_liquan',seasons:[1],intervalDays:8,
  stages:[
   {id:'dry',name:'久晴少雨',probability:0.35,condition:{kind:'weather',kinds:['clear']},
    effects:[{kind:'crop_damage',settlement:'loc_bs_liquan',percent:15,minutes:30*DAY}]},
   {id:'drought',name:'旱情',probability:0.3,condition:{kind:'weather',kinds:['clear']},
    effects:[{kind:'crop_damage',settlement:'loc_bs_liquan',percent:25,minutes:30*DAY}]},
  ]},
 // 桑坂
 flood('loc_bs_sangban',{intervalDays:6,rise:0.25,crest:0.3,peak:['storm'],low:['loc_sb_garden'],soaked:['loc_sb_fields','loc_sb_garden'],closures:['route_loc_sb_fields'],days:2,crop:20}),
 epidemic('loc_bs_sangban',{disease:cough,seasons:[3],intervalDays:4,first:cold,probability:0.1,routes:['route_bs_sb'],
  quarantine:{location:'bld_sb_hall',representative:'npc_sb_zhangluo'}}),
 famine('loc_bs_sangban',['npc_sb_zhangluo','npc_sb_shikui']),
 price('loc_bs_sangban',{rise:0.3,peak:0.2,up:1.1,high:1.2}),
 // 白石镇：河埠受淹断渡；人多疫重；镇上无公仓，冬荒随产粮村吃紧而起
 flood('loc_bs',{intervalDays:5,rise:0.35,crest:0.4,low:['bld_bs_dock'],soaked:['loc_bs_hebu','bld_bs_dock'],closures:['route_t90_bld_bs_dock_loc_bs_hebu'],days:4,price:1.1}),
 epidemic('loc_bs',{disease:cough,seasons:[3],intervalDays:3,first:cold,probability:0.15,cases:3,minimum:8,routes:['route_hw_bs','route_bs_yp','route_bs_wt','route_bs_lq','route_bs_sb'],
  quarantine:{location:'bld_bs_office',representative:'npc_bs_031_1'}}),
 {id:'famine:loc_bs',kind:'famine',name:'冬荒',settlement:'loc_bs',seasons:[3],intervalDays:7,
  stages:[
   {id:'famine',name:'冬荒',probability:1,condition:{kind:'hazard_phase',clock:'famine:loc_bs_sangban',stage:'tight'},
    effects:[{kind:'famine',settlement:'loc_bs',minutes:120*DAY}]},
  ]},
 // Monster settlements (T156/T159): 炭阶地宫 buys grain in 白石镇; 苔灯坞 forages
 // and trades fruit for salt with 河湾; 榆根里 lives off forest yield; 裂炉营
 // takes grain from 砾泉 for tribute and labour.
 lean('loc_ms_tanjie','faction_ms_tanjie',{tight:{condition:{kind:'hazard_phase',clock:'famine:loc_bs',stage:'famine'}},short:{condition:{kind:'hazard_phase',clock:'famine:loc_bs',stage:'famine'}},neighbour:'loc_bs',habitat:'habitat_bs_west_kiln'}),
 epidemic('loc_ms_tanjie',{disease:cough,seasons:[3],intervalDays:4,first:{kind:'weather',kinds:['snow','fog'],location:'loc_bs'},probability:0.15,cases:1,minimum:2,routes:['route_t157_loc_ms_tanjie'],herbs:'loc_bs'}),
 lean('loc_ms_taideng','faction_ms_taideng',{tight:{probability:0.3,condition:{kind:'weather',kinds:['snow'],location:'loc_hw'}},short:{condition:{kind:'hazard_phase',clock:'famine:loc_hw',stage:'tight'}},neighbour:'loc_hw',habitat:'habitat_hw_wood'}),
 epidemic('loc_ms_taideng',{disease:cough,seasons:[3],intervalDays:4,first:{kind:'weather',kinds:['snow'],location:'loc_hw'},probability:0.1,cases:1,minimum:2,routes:['route_t157_loc_ms_taideng'],herbs:'loc_hw'}),
 lean('loc_ms_yugen','faction_ms_yugen',{tight:{probability:0.3,condition:{kind:'weather',kinds:['snow'],location:'loc_bs_yupo'}},short:{condition:{kind:'hazard_phase',clock:'famine:loc_bs_yupo',stage:'tight'}},neighbour:'loc_bs_yupo',habitat:'habitat_yp_north_grove'}),
 epidemic('loc_ms_yugen',{disease:flux,seasons:[1],intervalDays:4,first:{kind:'weather',kinds:['rain','storm'],location:'loc_bs_yupo'},probability:0.12,cases:1,minimum:2,routes:['route_t159_loc_ms_yugen'],herbs:'loc_bs_yupo'}),
 lean('loc_ms_lielu','faction_ms_lielu',{tight:{condition:{kind:'hazard_phase',clock:'famine:loc_bs_liquan',stage:'tight'}},short:{condition:{kind:'hazard_phase',clock:'famine:loc_bs_liquan',stage:'famine'}},neighbour:'loc_bs_liquan',habitat:'habitat_lq_old_adit'}),
 epidemic('loc_ms_lielu',{disease:cough,seasons:[3],intervalDays:4,first:{kind:'weather',kinds:['snow'],location:'loc_bs_liquan'},probability:0.12,cases:1,minimum:2,routes:['route_t159_loc_ms_lielu'],herbs:'loc_bs_liquan'}),
];
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
    {id:'cases',name:'零星病例',probability:0.3,condition:{kind:'all',conditions:[{kind:'hazard_phase',clock:'flood:loc_hw',stage:'crest'},{kind:'hunger'}]},
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
  ...coreClocks,
 ],
};
