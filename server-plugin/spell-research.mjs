import {preconditionFailure} from './precondition.mjs';
import {validateMagicCatalog} from './magic.mjs';

// Research produces a new formula within a working primitive's established
// envelope. Target consent, law, materials and family-specific bounds travel
// with the prototype; naming a new formula cannot remove them.
export function registerResearchSpell(d,engine,data,project,maximumStage){
    // A formula is always researched out of a working prototype; a free-standing
    // spell effect cannot be written straight into the catalogue.
    if(typeof data?.template!=='string'||!data.template.trim())throw preconditionFailure('研究法术须给出原型法术template；自创法术效果还需按规则目录审查，不能直接登记');
    const prototype=engine.resolve(data.template,'spell'),base=engine.byId.get(prototype);
    if(!project.skills.includes(base.skill))throw preconditionFailure('研究项目须包含原型法术的关联技能');
    if(!base.effectSpec)throw preconditionFailure('原型法术没有已实现的效果原语');
    if(base.stage>maximumStage)throw preconditionFailure('研究法术阶段不得超过相关技能最高阶段减一');
    for(const key of Object.keys(data))if(!['template','power','spec'].includes(key))throw preconditionFailure(`研究法术不支持覆盖参数:${key}`);
    let changes={};
    if(data.spec!==undefined){
        try{changes=JSON.parse(data.spec);}catch{throw preconditionFailure('研究规则spec须为JSON对象');}
        const fields=['stage','mp','minutes','duration','durationLimit','rangeMeters','difficulty','effectSpec','materials','targeting','mechanism'];
        if(!changes||Array.isArray(changes)||typeof changes!=='object'||Object.keys(changes).some(k=>!fields.includes(k)))throw preconditionFailure('研究规则含未实现或受保护字段');
    }
    const power=data.power??changes.effectSpec?.power??base.effectSpec.power;
    const family=changes.effectSpec?.kind??base.effectSpec.kind;
    if(family!==base.effectSpec.kind)throw preconditionFailure('研究原型须属于相同效果原语族');
    if(!Number.isSafeInteger(power)||power<1)throw preconditionFailure('研究强度非法');
    // Numerical damage and healing use the published stage envelope. Other
    // families validate their own units and operation-specific bounds.
    const stage=changes.stage??base.stage;
    if(!Number.isSafeInteger(stage)||stage<0||stage>Math.min(8,maximumStage))throw preconditionFailure('研究法术阶段不得超过相关技能最高阶段减一');
    const ceiling=['heal','damage','area','protection','light','repair','dry','status','relief','mark'].includes(family)
        ?Math.max(...engine.world.spells.filter(s=>s.stage<=stage&&s.effectSpec?.kind===family).map(s=>s.effectSpec.power),base.effectSpec.power):5000;
    if(power>ceiling)throw preconditionFailure('研究强度超过此阶段原语的已实现边界');
    const catalog=structuredClone(base);
    delete catalog.id;delete catalog.name;delete catalog.aliases;delete catalog.scope;
    delete catalog.teachers;
    Object.assign(catalog,changes);catalog.effectSpec={...catalog.effectSpec,power};
    if(changes.effectSpec?.operation&&!changes.mechanism)catalog.mechanism=changes.effectSpec.operation;
    for(const flag of ['consent','permit'])if(base.targeting?.[flag]&&catalog.targeting?.[flag]!==base.targeting[flag])throw preconditionFailure('研究不能撤除原型的同意或许可边界');
    if(!Number.isSafeInteger(catalog.minutes)||catalog.minutes<base.minutes||catalog.minutes>480||!Object.values(engine.rules.check.difficulties).includes(catalog.difficulty))throw preconditionFailure('研究施法时间或难度不符合规则');
    if(!Number.isSafeInteger(catalog.duration)||catalog.duration<0||catalog.duration>43200)throw preconditionFailure('研究持续时间非法');
    if(!Array.isArray(catalog.materials)||catalog.materials.some(m=>!engine.byId.get(m.item)?.id.startsWith('item_')||!Number.isSafeInteger(m.amount)||m.amount<1||m.amount>1000))throw preconditionFailure('研究材料须为已登记物品与实际数量');
    for(const m of base.materials)if(!catalog.materials.some(n=>n.item===m.item&&n.amount>=m.amount))throw preconditionFailure('研究不能免除原型材料消耗');
    if(catalog.effectSpec.kind==='area')catalog.effectSpec.effect.power=power;
    // Keep inherited prose factual; the concept remains a proposed description
    // rather than an extra ability. The executable spec is authoritative.
    catalog.research={prototype,concept:project.concept};
    if(data.spec!==undefined){
        // Inherited lore describes the prototype, not a newly changed effect.
        for(const key of ['theory','casting','failure','counters','socialConsequences','proficiencyEffects','boundaries'])delete catalog[key];
        catalog.effect=JSON.stringify(catalog.effectSpec);
    }
    catalog.failureDamage=Math.max(1,base.failureDamage??0);
    const band=engine.rules.magic.stageMpRanges[catalog.stage];
    if(!band||!Number.isSafeInteger(catalog.mp)||catalog.mp<band[0]||catalog.mp>band[1])throw preconditionFailure('研究法术消耗不符合阶段规则');
    const errors=validateMagicCatalog(catalog,{requireHandler:true});
    if(errors.length)throw Error(errors.join('；'));
    return catalog;
}
