// M5 rule design, derived from the four registered public granaries, not private
// NPC assets. These standing orders are separate from the player carry contracts.
export const settlementTradeRules = {
    version: 1,
    source: 'M5/T38 周度公共余粮交易规则；3.13 经济',
    cycleDays: 7,
    firstDay: 7,
    dispatchMinute: 540,
    item: 'item_oats',
    unitKg: 0.5,
    targetDays: 240,
    workersMaximum: 2,
    carryKgPerWorker: 10,
    seasonFactors: [0.9, 1, 1.1, 1.2],
    distanceFactorPerKm: 0.01,
    lanes: [
        {id:'weekly_yp_wt',seller:'loc_bs_yupo',buyer:'loc_bs_weiting',mode:'walk',maximumQuantity:40,taxBps:500,routes:['route_bs_yp','route_bs_wt']},
        {id:'weekly_wt_lq',seller:'loc_bs_weiting',buyer:'loc_bs_liquan',mode:'walk',maximumQuantity:40,taxBps:500,routes:['route_bs_wt','route_bs_lq']},
        {id:'weekly_lq_sb',seller:'loc_bs_liquan',buyer:'loc_bs_sangban',mode:'walk',maximumQuantity:40,taxBps:500,routes:['route_bs_lq','route_bs_sb']},
        {id:'weekly_sb_yp',seller:'loc_bs_sangban',buyer:'loc_bs_yupo',mode:'walk',maximumQuantity:40,taxBps:500,routes:['route_bs_sb','route_bs_yp']},
    ],
    accounting: '只扣已入公共仓的未过期谷物，保留90日储备及种粮；买方实际现金入在途预付账，到货货价转入卖方公库，其中5%分列税款。腐坏与拒收入仓的部分退预付款并记录粮损。',
    labour: '运力上限是规则分配，实际取现有人口×workerFraction扣农田、农副产、加工及公共木料劳力后的空余；无空余不发货。同一源村未返的货运仍占运力，回程也沿现有道路耗时。',
    pricing: '燕麦基础价沿既有item_oats；实际谷物与240日目标的比例确定需求系数，登记来路距离及天气行程确定运输系数，乘季节系数。当日首次公共报价落quotes及出处账，同村同日复用。',
};
