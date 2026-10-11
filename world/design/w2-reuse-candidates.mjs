import {spellBlueprints} from './spell-blueprints.mjs';
// These entries use existing consumers only. Targeting adds the existing trusted
// distance/visibility boundary; it does not infer facts from the model's words.
export const reuseSpellIds=['spell_fire_03','spell_fire_08','spell_fire_11','spell_fire_12','spell_water_01','spell_water_02','spell_water_03','spell_water_04','spell_water_06','spell_water_12','spell_earth_11','spell_mind_05','spell_mind_10','spell_summon_04'];
export function reuseSpellCandidates(){return spellBlueprints().filter(s=>reuseSpellIds.includes(s.id)).map(s=>{
 const targeting=s.effectSpec.kind==='damage'?{lineOfSight:true}:s.effectSpec.kind==='status'?{lineOfSight:true,...(s.mechanism!=='fear'?{consent:'support_magic'}:{}),...(s.school==='精神'?{permit:'mental_magic'}:{})}:null;
 return {...s,...(targeting?{targeting}:{}),...(s.mechanism==='mind_guard'?{effect:'降低已登记的恐惧、错觉与强迫干扰的实际强度；需要本人同意和当地精神施法许可'}:{}),...(s.mechanism==='fear'?{effect:'施加短暂恐惧造成命中损失，守心结可削弱强度；不强迫逃跑或改变决定'}:{})};
});}
export function withReuseCandidates(source){const world=structuredClone(source);for(const s of reuseSpellCandidates()){if(!world.spells.some(x=>x.id===s.id))world.spells.push(s);if(!world.skills.some(x=>x.id===s.skill))world.skills.push({id:s.skill,name:s.name,attribute:'精神',profession:'profession_mage',stage:s.stage});}const clothes=world.items.find(x=>x.id==='item_clothes');if(!clothes||clothes.name!=='普通衣服')throw Error('基础衣物目录已变化，需重新核对');clothes.tags=[...new Set([...(clothes.tags??[]),'clothing'])];return world;}
export const reuseMechanismFacts={
 dry:'只对本人持有的一件衣物减少潮湿值，最多减少100，不能负数；不能对整叠衣物、帆布或仓库施法。没有额外热伤、焦痕或染料改变。',
 repair_metal:'实际消耗一份铁料和一份树脂，恢复持有的单件金属器具至多20耐久且不超过该件上限；缺件不能凭空成物，不增加上限、品质或附魔。',
 damage_fire:'仅实际生命目标，开始和完成时均核对实际距离及无遮挡视线；无目标事实则拒绝。16基础强度参与防御、火抗和实际防护结算；不在地面留下火源，不点燃周边物品。',
 shield_fire:'一人火焰抗性增加40个百分点，相同状态取最强值不累加；不减物理伤害，不保护衣物，不造成缺氧。',
 stone_skin:'一人防御增加4，闪避减少0.08；相同状态取最强值不累加，不使人定身。',
 mind_guard:'对新施加的恐惧、错觉、轻度强迫减少35%强度，四舍五入；不追溯清除旧状态，不保护记忆，不提供测谎或免疫。',
 fear:'恐惧强度2参与命中惩罚，每点降低0.02；守心结的精神抗性降低新状态强度，旅灯抵消一点恐惧造成的命中损失；不强迫逃跑、吐露秘密或改变信任。对他人施加敌意状态实际损失信任。',
 condense:'所在地登记的水源或容器必须有剩余容量，空气湿度至少5%；实际毫升数=min(剩余容量,floor(50*湿度/100))，不补盐、毒素或病原；潮气不足就拒绝。私人容器须有效物主许可，公开水源或公用容器不需私有许可。',
 clean_water:'所在地真实水体的浊度减少40至最低0；水量、盐分、毒素与病原风险不变，不能保证安全饮用。',
 sense_water:'只读实际水体盐分、气味与浊度，不透露未经化验的毒素或病原数值；不识别契约或所有权。',
 irrigate:'通过已登记沟渠转移最多20升现有水，受源水量、容量、流量和堵塞约束；溶解盐毒随水转移，不造水、不挖新沟，目标水源与田垄必须真实对应。',
 clear_silt:'只把沟内至多2000克淤泥变为松动状态，尚未移出，也不因松动就降低堵塞；实际搬走才改善堵塞。',
 soil_water:'沿既有沟渠给已处理田垄转移至多10升现有水；未翻整土壤拒绝，污染随源水实际转移，不瞬间发芽或保证产量。',
 servant:'召唤自己的当地水盏役灵，最多30分钟，每5分钟消耗1魔力；命令实际花5分钟搬运最多250毫升同场景现有水，须源容器有水且目标有容量并获得物主许可。不净水、不战斗，不自动搬运或成为永久宠物。',
};

