// D1 系统数据铺开（docs/PLAN.md「系统底座」D1）。只写数据：公告栏主事人、聚落公账、
// 势力时钟阶段挂委托。tools/d1-system-data.mjs 把它们并入 world/meta/rules.json：
//   questSources.publishers / funds / ledgers   （U17 公告栏与公账）
//   questSources.commissions                    （T110/T111 势力阶段出 quest_post，faction-clock 按阶段取用；
//                                                 与 K6 效果表分开，效果表挂接不改原时钟结果的保证不变）
// 灾害时钟在 world/design/seasonal-hazards.mjs；群落标签在 world/geo/biomes.json；
// 远方郡的默认灾害时钟、公告栏与公账由 server-plugin/remote-generation.mjs 模板生成。
export const source='D1 系统数据铺开：五村、白石镇与四处聚居地的公告栏主事人和公账，势力时钟阶段的委托';

// 公告栏主事人：现有完整档里职务合适的人，不新造人物。
// 五村取村级任命册的头人（坡田轮水记录人、水岸议事记录人、泉槽轮用簿抄录人、
// 桑园换工记录人），河湾沿用陈柏；白石镇取公署递件的姜澄（镇务协调人）；
// 聚居地取各自组织时钟的联络代表（首领或议事人）。
// V3：任命册及组织现任首领由 entity-view 派生；这里只保留明确覆盖。
export const publishers={loc_bs:'npc_bs_031_1'};
// 聚居地没有村级公账，公事委托由各自的组织公库（T159 组织，势力资产账）托管。
export const funds={
 loc_ms_tanjie:'faction_ms_tanjie',
 loc_ms_taideng:'faction_ms_taideng',
 loc_ms_yugen:'faction_ms_yugen',
 loc_ms_lielu:'faction_ms_lielu',
};
// 聚落公账：五村已由农事开局登记（公款1200铜，河湾沿用旧档），这里只给白石镇开账。
// 初值按五村村账人均公款（1200铜／约96人，约12铜每人）乘镇上登记人口1000，取整12000铜；
// 镇上没有公仓，不登记粮食、木料与铁料，也不进入每日口粮结算（granary:false）。
export const ledgers=[
 {settlement:'loc_bs',opening:{name:'白石镇',population:1000,treasury:12000,wood:0,iron:0,granary:false},
  source:'D1：五村村账人均公款×白石镇登记人口；镇上无公仓'},
];

// 势力委托：按势力时钟阶段登记（已审核的势力正文不改）。出资默认由该势力公库托管；
// 外地势力在白石镇或河湾的联络点登记，由当地公告栏主事人代为张贴。
const BS={board:'loc_bs',publisher:'npc_bs_031_1'},HW={board:'loc_hw',publisher:'npc_hw_chenbai'};
const post=(id,grade,reward,days,content,objective,extra={})=>({kind:'quest_post',id,grade,reward,days,content,objective,...extra});
const visit=location=>({type:'visit',location}),deliver=(item,quantity)=>({type:'deliver',item,quantity});
const hook=(owner,stage,effect)=>({owner,stage,effects:[effect]});
export const factionCommissions=[
 hook('clock_saltboat','s1',post('saltboat_lease_copy','D',60,7,'{faction}委托：把泊位租约抄件送到苇汀岸口给船户过目',visit('loc_wt_bank'),BS)),
 hook('clock_saltboat','s2',post('saltboat_objections','D',80,10,'{faction}委托：去河湾旧渡口听取船户对租约的异议',visit('loc_hw_dock'),BS)),
 hook('clock_saltboat','s3',post('saltboat_contract_copy','D',50,7,'{faction}委托：把签好的泊位合同抄件送到河湾',visit('loc_hw'),BS)),
 hook('clock_lampbridge','s2',post('lampbridge_trial_fuel','C',150,10,'{faction}委托：送十袋木炭来试排炉班',deliver('item_charcoal',10),BS)),
 hook('clock_lampbridge','s3',post('lampbridge_wear_iron','C',120,10,'{faction}委托：送五份铁料补炉具损耗',deliver('item_iron',5),BS)),
 hook('clock_fieldguild','s1',post('fieldguild_read_terms','D',50,7,'{faction}委托：去榆坡找当事人对读约定原文',visit('loc_bs_yupo'),BS)),
 hook('clock_fieldguild','s3',post('fieldguild_check_work','C',120,10,'{faction}委托：去西郊废窑核看约定活计实际做到哪一步',visit('loc_wild_bs_kiln'),BS)),
 hook('clock_kilnkin','s1',post('kilnkin_old_drain','D',90,10,'{faction}委托：去砾泉旧矿道口量看旧排水道',visit('loc_wild_lq_adit'),BS)),
 hook('clock_kilnkin','s3',post('kilnkin_restore_stone','C',150,15,'{faction}委托：送十份石料来逐段补砌排水道',deliver('item_stone',10),BS)),
 hook('clock_wedgeorder','s2',post('wedgeorder_copy_marks','D',60,10,'{faction}委托：送三张羊皮纸来抄录可公开的刻痕',deliver('item_parchment',3),BS)),
 hook('clock_stonethread','s1',post('stonethread_old_marks','D',60,10,'{faction}委托：去河湾旧渡口抄下旧水痕',visit('loc_hw_dock'),BS)),
 hook('clock_stonethread','s2',post('stonethread_spring_shift','D',70,10,'{faction}委托：去砾泉槽边轮一班实测水位',visit('loc_lq_spring'),BS)),
 hook('clock_hollowcircle','s1',post('hollowcircle_register','D',50,7,'{faction}委托：去白石公署核对刻痕登记',visit('bld_bs_office'),BS)),
 hook('clock_riverhomes','s1',post('riverhomes_bank_facts','D',40,10,'{faction}委托：去旧渡口记下各家实际用岸的情形',visit('loc_hw_dock'),HW)),
 hook('clock_furroworder','s1',post('furroworder_ration_gap','C',150,10,'{faction}委托：送十份干粮来补核出的口粮缺口',deliver('item_ration',10),HW)),
 hook('clock_furroworder','alt',post('furroworder_grain_gift','C',200,15,'{faction}委托：送二十份燕麦来补足捐粮缺口',deliver('item_oats',20),HW)),
 hook('clock_returnorder','alt',post('returnorder_new_seats','D',60,10,'{faction}委托：送两张三脚凳来补入新坐席',deliver('item_three_leg_stool',2),HW)),
 // 聚居地议事落实时由联络代表在本地张贴，出资走各自组织公库（公库见底则不出）。
 hook('clock_ms_tanjie','decide',post('tanjie_grain_road','D',20,10,'{faction}委托：替地宫探明经西郊废窑到白石镇的驮路',visit('loc_wild_bs_kiln'))),
 hook('clock_ms_lielu','settle',post('lielu_first_stone','D',25,10,'{faction}委托：护送头一批石料到砾泉',visit('loc_bs_liquan'))),
];
