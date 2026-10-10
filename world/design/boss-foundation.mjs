// Authored numerical bones for guide 3.8.4. No generated lore is approved here.
export function bossFoundation(){
    const rows=[
        ['mud_tusk','泥鬃裂牙','monster_bristle_boar',1,8,'loc_hw_northwood','habitat_hw_wood','栎根拱洞','monster_leaf_hare','monster_bristle_boar',7,'从下风拱开枝障，见重击前会侧肩护住旧牙','右侧断牙限制转头'],
        ['grey_scar','灰脊缺耳','monster_grey_ridge_wolf',1,10,'loc_hw_northwood','habitat_hw_wood','倒木狼窝','monster_burrow_badger','monster_grey_ridge_wolf',10,'先绕撤退路线，再从侧后扑击持械手臂','前腿旧伤使连续转弯吃力'],
        ['shadow_sentinel','影鬃守隙','monster_shadow_mane_jackal',2,26,'loc_hw_northwood','habitat_hw_wood','榛枝窄隙','monster_hook_toe_civet','monster_shadow_mane_jackal',14,'守住林隙出口，反复试探盾边后才扑近','长鬃容易缠入低枝'],
        ['broken_burrow','断棘掘穴','monster_broken_thorn_bear',2,30,'loc_hw_northwood','habitat_hw_wood','朽榛深穴','monster_red_ear_fox','monster_broken_thorn_bear',21,'以断棘背部抵住窄口，绕行者会遭落木阻挡','旧肩伤使左侧抬臂迟缓'],
    ];
    const bosses=rows.map(([suffix,name,monster,tier,level,lair,habitat,lairName,replacement,minion,vacancyDays,tactic,weakness])=>({
        id:`boss_${suffix}`,name,aliases:[],monster,tier,level,lair,territory:'北林边倒木与栎根之间',tactics:[tactic],weakness,
        drops:[{item:'item_rawhide',amount:1}],taming:'先掌握对应阶段驯兽能力，解除其领地冲突并建立持续信任；条件尚未登记前不可宣称驯服',intelligence:tier===1?0:1,
        minions:[minion],residence:{id:`lair_${suffix}`,name:lairName,location:lair,habitat,replacementSpecies:[replacement],vacancyDays,minionCount:2},
    }));
    return {bosses,rules:{version:1,hpMultiplier:5.45,approachMinutes:10,learningThreshold:2,damageReductionPerStep:.1,maximumDamageReduction:.3,escapeDifficulty:20}};
}
export function withBosses(world,bosses){const next=structuredClone(world),bones=bossFoundation();next.rules.bossEcology=bones.rules;
    const map=new Map((next.bosses??[]).map(b=>[b.id,b]));for(const b of bosses??bones.bosses)map.set(b.id,b);next.bosses=[...map.values()];return next;}
