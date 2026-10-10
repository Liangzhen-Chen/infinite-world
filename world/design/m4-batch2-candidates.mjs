import {spellBlueprints}from'./spell-blueprints.mjs';
import {bossFoundation}from'./boss-foundation.mjs';
const targeting=(consent,permit)=>({lineOfSight:true,...(consent?{consent}:{}),...(permit?{permit}: {})});
export function batch2SpellCandidates(){
 const specs={
  spell_light_05:{effectSpec:{kind:'status',status:'dazzle',power:2},duration:1,targeting:targeting(),effect:'亮点只干扰睁眼目标的下一次出手，一分钟内不用则消散；不会灼伤目标'},
  spell_light_11:{effectSpec:{kind:'status',status:'camouflage',power:6},targeting:targeting('support_magic'),effect:'扰乱自愿者轮廓，移动或下雨时效果减半；不提供隐身或身份伪装'},
  spell_shadow_09:{effectSpec:{kind:'status',status:'nightvision',power:3},targeting:targeting('support_magic'),effect:'缓解微光下交锋命中的视线损失，完全无光时无效，不揭示未知目标'},
  spell_mind_01:{effectSpec:{kind:'relief',statuses:['fear'],power:1},duration:0,targeting:targeting('mental_magic','mental_magic'),effect:'减轻自愿者身上已存在的一点轻度恐惧法术强度，不消除现实危险或改变其决定'},
  spell_mind_08:{effectSpec:{kind:'status',status:'illusion',power:2},duration:1,targeting:targeting(undefined,'mental_magic'),effect:'扰乱目标下一次出手的注意力，一分钟内不用即消散，不控制行动或写入记忆'},
  spell_mind_11:{effectSpec:{kind:'relief',statuses:['compulsion'],power:1},duration:0,targeting:targeting('mental_magic','mental_magic'),effect:'经本人同意减轻一点评级已明确的轻度强迫状态，需要继续照护；不改变记忆或凭空认定已受强迫'},
  spell_faith_01:{effectSpec:{kind:'status',status:'travel_calm',power:1},targeting:targeting('support_magic'),effect:'减轻已登记轻度恐惧对命中的影响，不免除道路危险或强迫接受帮助'},
  spell_summon_03:{effectSpec:{kind:'summon_contract',operation:'inspect',power:1},duration:0,effect:'读取自己在场役灵的实际契约、剩余时限和维持条款'},
  spell_summon_12:{effectSpec:{kind:'summon_contract',operation:'dismiss',power:1},duration:0,effect:'解除自己在场且允许和平解离的役灵契约，未消耗的投影防护同时结束'},
  spell_summon_09:{effectSpec:{kind:'summon_contract',operation:'extend',power:30,offering:{item:'item_resin',amount:1}},duration:0,materials:[],effect:'以一份树脂续延在场役灵三十分钟，仍须按原间隔付魔力；不重置维持时点或补回防护额度'},
  spell_summon_05:{effectSpec:{kind:'summon',summonType:'fire_projection',power:1,upkeepMp:1,upkeepMinutes:5},duration:60,effect:'召出只提供柔光的火蜥投影，留在施法处，每五分钟需一魔力；不是燃料也不能点燃物品'},
  spell_summon_08:{effectSpec:{kind:'summon',summonType:'water_guard',power:20,upkeepMp:2,upkeepMinutes:5},duration:60,effect:'在接触的至少两升现有水体中召来守卫，提供一次有限物理防护；离水或契约结束即失效'},
  spell_summon_13:{effectSpec:{kind:'summon',summonType:'elemental_guard',power:40,upkeepMp:3,upkeepMinutes:5},duration:120,effect:'召来留在当地的契约护卫，有限防护额度由施术者熟练度约束；每五分钟仍需三魔力，不成为永久宠物'},
  spell_fire_07:{effectSpec:{kind:'mark',medium:'fire',visibility:'normal',power:40},duration:1440,rangeMeters:3,effect:'在自有单件木、纸或金属材料表面留下至多四十字火纹，最多保留一天；字迹不是身份认证'},
  spell_earth_03:{effectSpec:{kind:'mark',medium:'soil',visibility:'normal',power:40},duration:1440,rangeMeters:3,effect:'在获准使用且已松动的软土上留下至多四十字可辨印模，最多保留一天，不改变地契'},
  spell_shadow_03:{effectSpec:{kind:'mark',medium:'ink',visibility:'dim',power:40},materials:[{item:'item_charcoal',amount:1}],duration:1440,rangeMeters:3,effect:'耗一份木炭在自有单张纸上留下至多四十字暗字，只在微光中显现，最多保留一天'},
 };
 return spellBlueprints().filter(s=>specs[s.id]).map(s=>({...s,...specs[s.id],durationLimit:specs[s.id].duration??s.durationLimit,...(['water_guard','elemental_guard'].includes(specs[s.id].effectSpec.summonType)?{boundaries:'守卫防护额度为5加有效熟练度每满100点增加1，上限为power；召唤时确定，续约不补回，转为本人防护后守卫额度清零；同一击只用最强吸收层。'}:{})}));
}
export function batch2BossCandidates(){return bossFoundation().bosses.map((b,i)=>({...b,tactics:[`负伤到一半生命以下时，每第三次命中的反击附带${i<2?1:2}点恐惧，持续一分钟；改变进攻方式可绕开其已经熟悉的防备`],mechanics:{
 adaptation:{tactics:['armed','unarmed','magic_fire'],threshold:2,perStep:.1,maximum:.3},
 weaknesses:[{tactic:i%2?'unarmed':'armed',requiresStatus:'dazzle',ignoreAdaptation:true}],
 abilities:[{id:`ability_${b.id.slice(5)}_counter`,every:3,belowHpPercent:50,effectSpec:{kind:'status',status:'fear',power:i<2?1:2},duration:1}],
 },weakness:`眩光干扰时，${i%2?'近身徒手':'持械'}攻击能绕开已学会的防备；闭眼或眩光已消耗时不能触发。`,originSeed:['长期占据栎根拱洞的野猪，右侧獠牙已经磨断。','盘踞倒木狼窝的缺耳灰狼，背脊留着陈旧伤痕。','在榛枝窄隙活动的影鬃豺，靠林隙出口保住落脚处。','占据朽榛深穴的断棘熊，背部断棘与旧肩伤清晰可见。'][i]}));}
export const batch2PublicationGates={
 status:'需要主线条件事实与一次性出手消耗挂接；外部生命目标缺权威距离/视线时拒绝。精神施法许可与本人同意分别检查。',
 summon:'guard入口、保护层随实体位置/水体失效的校验，以及阶段数值和学习取得来源必须验证；续期供品独立实际扣除。',
 mark:'需要可观察痕迹检查入口与纸张标签；新增时限、媒介和数量已修改骨架，旧文案必须重审。',
 boss:'需要逐击applyBossCounterAbility挂接与已有平衡模拟；弱点是新可执行条件，旧叙述须重审；不发布或迁移原存档。',
 review:'16法术与4首领只为机制候选，未L1/L2/L4文案审核，不计正式数量。',
};
