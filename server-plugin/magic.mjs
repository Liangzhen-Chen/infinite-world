import {isPhysicallyDead} from './lifecycle-state.mjs';
import {nativePrimitiveTransaction} from './native-primitives.mjs';
// Effect families register their effectSpec.kind values in magic-effects.mjs;
// importing them here loads them before the first cast.
import './magic-ritual.mjs';
import './magic-care.mjs';
import './magic-mind-space.mjs';
import './magic-growth.mjs';
import './magic-message.mjs';
import './magic-movement.mjs';
import './magic-area.mjs';
import './magic-marks.mjs';
import './environment.mjs';
import './summons.mjs';
import {magicEffect}from'./magic-effects.mjs';
import {hiddenCombat}from'./hidden-passives.mjs';
import {assertSpellConsent}from'./magic-consent.mjs';
import {derivedStats,monsterStats}from'./combat.mjs';
import {recordDisciplineBreach}from'./training.mjs';
import {magicStatuses,magicStatusStats,relieveMagicStatuses,applyMagicStatus}from'./magic-status.mjs';
import {validateTargeting,assertMagicTargeting}from'./magic-targeting.mjs';
import {monsterReward}from'./progression.mjs';
import {heldUnit,trackSingleItem}from'./items.mjs';
import {resolveCreature,recordWildlifeDeath}from'./wildlife.mjs';
import {recordEntityDeath}from'./npc-life.mjs';
import {bossCounter,rememberBossTactic,defeatBoss}from'./bosses.mjs';
import {validateEffectSpec,resolveVitalityPrimitive,applyProtectionPrimitive,consumeMagicProtection}from'./magic-primitives.mjs';
import {prepareElementObject,applyElementObject,ambientHeatC,coldHeatMultiplier}from'./magic-object.mjs';
import {prepareWindObject,applyWindObject,windArmorMultiplier,projectileAirPenalty}from'./magic-air.mjs';
import {prepareStone,launchStone,waterEarthState}from'./magic-water-earth.mjs';
import {itemTraits,hasTrait}from'./traits.mjs';
import {lightDamageMultiplier}from'./magic-light.mjs';
import {declareHoldingWriter,holdingSet} from './holdings.mjs';
declareHoldingWriter('magic',{kinds:['tamed_by'],entities:['wreck'],locations:true});
export function validateMagicCatalog(catalog,{requireHandler=false}={}){
    const spec=catalog.effectSpec,errors=[];
    if(!spec){if(requireHandler||catalog.mechanism)errors.push('此法术机制尚未接入规则，不能叙述已实现');return errors;}
    const effect=magicEffect(spec.kind);
    errors.push(...(effect?.validateSpec?effect.validateSpec(catalog):validateEffectSpec(spec)));
    errors.push(...validateTargeting(catalog));
    if(['status','light','protection'].includes(spec.kind)&&(!Number.isSafeInteger(catalog.duration)||catalog.duration<1||catalog.duration>Math.min(catalog.durationLimit??43200,43200)))errors.push('持续效果的时限非法');
    if(spec.kind==='status'&&(!magicStatuses[spec.status]||spec.power>magicStatuses[spec.status].maximum))errors.push('状态效果或强度不在规则表');
    if(spec.kind==='status'&&['dazzle','camouflage','nightvision','illusion','compulsion','travel_calm'].includes(spec.status)&&!catalog.targeting)errors.push('新状态须声明实际目标边界');
    if(spec.kind==='status'&&['dazzle','illusion'].includes(spec.status)&&catalog.duration!==1)errors.push('瞬时注意力干扰须最多保留一分钟待用');
    if(spec.kind==='relief'&&(spec.power>3||catalog.duration!==0||catalog.targeting?.consent!=='mental_magic'||catalog.targeting?.permit!=='mental_magic'))errors.push('精神解除须有限强度、本人同意与施法许可');
    if(spec.kind==='status'&&magicStatuses[spec.status]?.mental&&catalog.targeting?.permit!=='mental_magic')errors.push('精神干扰须明确施法许可');
    if(effect?.validate)errors.push(...effect.validate(catalog));
    if((spec.lightDecay||spec.shadowDecay)&&(!catalog.targeting||catalog.duration!==0||!Number.isFinite(catalog.rangeMeters)||catalog.rangeMeters>40))errors.push('光束须声明实际目标边界、有限射程且为瞬时伤害');
    if(spec.stoneProjectile&&(!catalog.targeting||catalog.duration!==0||catalog.rangeMeters>20))errors.push('石弹须声明实际目标边界、有限射程且为瞬时伤害');
    if(spec.windBlade&&(!catalog.targeting||catalog.duration!==0))errors.push('风刃须声明实际目标边界且为瞬时伤害');
    if(spec.coldDecay&&(!catalog.targeting||catalog.duration!==0))errors.push('冰针须声明真实目标边界且为瞬时伤害');
    return errors;
}
export function prepareMagic(d,catalog,args,context={}){
    const errors=validateMagicCatalog(catalog);if(errors.length)throw new Error(errors.join('；'));
    const spec=catalog.effectSpec;if(!spec)return null;
    const effect=magicEffect(spec.kind);
    if(effect?.prepare)return effect.prepare.call(this,d,catalog,args,context);
    if(spec.stoneProjectile&&args.target?.startsWith('feature_'))return{stone:prepareStone.call(this,d,catalog,args),target:args.target,spec,catalog,stoneObject:true};
    if(spec.windBlade&&args.target?.startsWith('feature_'))return prepareWindObject.call(this,d,catalog,args);
    if(spec.kind==='damage'&&args.target?.startsWith('feature_'))return prepareElementObject.call(this,d,catalog,args);
    const target=['repair','dry','light'].includes(spec.kind)?this.resolve(args.target??'player'):resolveCreature(this,d,args.target??'player');
    if(['repair','dry','light'].includes(spec.kind)){
        if(!target.startsWith('item_')||this.quantity(d,'player',target)<1)throw new Error('施法需要实际持有的目标物品');
        const held=heldUnit(d,this,'player',target),definition=this.byId.get(target);
        if(held.quantity!==1)throw new Error('需要分出单件目标，不能对整叠物品施法');
        const traits=itemTraits(definition,held);
        if(spec.kind==='repair'&&!hasTrait(traits,'metal'))throw new Error('目标不是可修缮的金属器具');
        if(spec.kind==='dry'&&!hasTrait(traits,'clothing'))throw new Error('目标不是一件衣物');
        return{target,path:['state','inventory',target],held,definition,spec,catalog};
    }
    const partition=target.startsWith('npc_')?'npcs':target.startsWith('monster_')||target.startsWith('boss_')?'creatures':null;
    if(target!=='player'&&!partition)throw new Error('法术需要实际生命目标');
    const actor=target==='player'?d.get('state','player'):d.get('state',partition,target),definition=this.byId.get(target);
    if(!actor||target!=='player'&&actor.location!==(context.location??d.get('state','location')))throw new Error('法术目标不在场');
    if(isPhysicallyDead(this,d,target))throw new Error('目标已经死亡，此法术不能使死者复生');
    const targetingEngine=Object.create(this);
    if(context.targetFacts)targetingEngine.magicTargetFacts=()=>context.targetFacts;
    assertMagicTargeting(d,targetingEngine,catalog,args,target);
    if(spec.kind==='status'&&magicStatuses[spec.status]?.mental&&!catalog.targeting?.consent)assertSpellConsent(d,this,catalog,args,target,'mental_magic');
    const derived=target==='player'?{maxHp:actor.maxHp,defense:0}:partition==='npcs'
        ?derivedStats({level:actor.level??definition.level??1,attributes:definition.attributes,profession:Boolean(definition.combatProfession)},this.rules)
        :monsterStats({level:actor.level??definition.level??definition.levelRange?.[0]??1,template:definition.template??this.byId.get(definition.monster)?.template??2,bossTier:definition.tier??0},this.rules);
    if(derived.divine&&!d.get('state','divinePermissions',target))throw new Error('此法术无法越过神性屏障');
    if(spec.kind==='heal')assertSpellConsent(d,this,catalog,args,target,'healing');
    if((spec.kind==='protection'||spec.kind==='status'&&magicStatuses[spec.status].beneficial)&&target!=='player'){
        assertSpellConsent(d,this,catalog,args,target,'support_magic');
    }
    const ambientC=spec.coldDecay?ambientHeatC(d,this,context.location??d.get('state','location')):undefined;
    const stone=spec.stoneProjectile?prepareStone.call(this,d,catalog,{...args,target}):undefined;
    return{target,path:target==='player'?['state','player']:['state',partition,target],actor,derived,spec,catalog,context,completionArgs:{...args,target},ambientC,stone};
}
export function applyMagic(d,prepared,id){
    if(!prepared)return{};
    const spec=prepared.spec,target=prepared.target??prepared.id??'player';
    const primitive=['damage','heal'].includes(spec.kind)&&!prepared.elementObject&&!prepared.windObject&&!prepared.stoneObject?{op:'vital',target,delta:spec.kind==='damage'?-spec.power:spec.power,type:spec.damageType??'healing'}:
      {op:'status',target,status:spec.status??spec.kind,duration:prepared.catalog?.duration??0,magnitude:spec.power};
    const out=nativePrimitiveTransaction(d,{engine:this,family:'m4:magic',sourceEvent:id,actor:prepared.context?.source??'player',program:{spec,target,spell:prepared.catalog?.id},primitives:[primitive],
      apply:tx=>applyMagicState.call(this,tx,prepared,id),describe:(effect,result)=>effect.op==='vital'?{delta:spec.kind==='heal'?result.healed??0:-(result.damage??0)}:{}});
    return out.results[0];
}
function applyMagicState(d,prepared,id){
    let{spec,target,path,catalog}=prepared;
    const effect=magicEffect(spec.kind);
    if(effect?.apply)return effect.apply.call(this,d,prepared,id);
    if(prepared.windObject)return applyWindObject.call(this,d,prepared);
    if(prepared.elementObject)return applyElementObject.call(this,d,prepared);
    if(prepared.stoneObject){
        let stone;try{stone=prepareStone.call(this,d,catalog,prepared.stone.args);}catch(e){return{target,effectFailed:e.message};}
        const projectile=launchStone(d,stone,id),s=waterEarthState(d,stone.row),damage=Math.min(s.integrity,spec.power);
        s.integrity-=damage;d.set(['state','records',`physical_feature:${target}`],{id:target,category:'physical_feature',location:stone.row.location,state:s});return{target,damage,integrity:s.integrity,...projectile};
    }
    if(prepared.completionArgs){
        try{prepared=prepareMagic.call(this,d,catalog,prepared.completionArgs,prepared.context);}
        catch(error){return{target,effectFailed:`施法完成前条件失效：${error.message}`};}
    }
    const latest=d.get(...path);
    if(!latest||isPhysicallyDead(this,d,target))return{target,effectFailed:'施法完成前目标已离开行囊或死亡，效果未生效'};
    if(spec.kind==='protection')return applyProtectionPrimitive(d,{spec,target,spell:catalog.id,duration:catalog.duration},id);
    if(spec.kind==='relief')return relieveMagicStatuses(d,target,spec.statuses,spec.power);
    if(spec.kind==='status'||spec.kind==='light'){
        const expires=d.get('state','minute')+catalog.duration;
        if(spec.kind==='status'){
            const applied=applyMagicStatus(d,{target,status:spec.status,power:spec.power,duration:catalog.duration,source:id,spell:catalog.id},id);
            if(applied.resisted)return applied;
        }else d.set(['state','effects',id],{kind:'light',spell:catalog.id,target,power:spec.power,expires,source:id,owner:'player',targetInstance:trackSingleItem(d,this,'player',target,id)});
        if(spec.kind==='status'&&!magicStatuses[spec.status].beneficial&&target.startsWith('npc_')){
            d.set([...path,'trust'],Math.max(-100,(latest.trust??0)-10));
            d.set([...path,'developments'],[...latest.developments??[],{type:'敌意法术',status:spec.status,source:id,minute:d.get('state','minute')}]);
        }
        return{target,effect:id,expires,status:spec.status,illuminated:spec.kind==='light'};
    }
    if(spec.kind==='repair'){
        const current=heldUnit(d,this,'player',target),maximum=current.maxDurability??prepared.definition.durability;
        const repaired=Math.min(spec.power,Math.max(0,maximum-current.durability));
        d.set([...path,'durability'],current.durability+repaired);
        if(current.instance)holdingSet(d,null,['state','itemInstances',current.instance,'durability'],current.durability+repaired,'magic');
        return{target,repaired};
    }
    if(spec.kind==='dry'){
        const current=d.get(...path),dried=Math.min(spec.power,current.moisture??0);
        d.set([...path,'moisture'],Math.max(0,(current.moisture??0)-dried));return{target,dried};
    }
    const current=d.get(...path),maximum=current.maxHp??prepared.derived.maxHp,old=current.hp??maximum;
    const projectile=prepared.stone?launchStone(d,prepared.stone,id):{};
    const protection=magicStatusStats(d,target),resistance=protection[`${spec.damageType}Resistance`]??0;
    const tactic=`magic_${spec.damageType??'untyped'}`,counter=spec.kind==='damage'?bossCounter(d,this,target,tactic):{damageMultiplier:1};
    const heatMultiplier=spec.lightDecay||spec.shadowDecay?lightDamageMultiplier(d,this,target,spec):spec.coldDecay?coldHeatMultiplier(prepared.ambientC):spec.windBlade?windArmorMultiplier(current.armorMaterial??this.byId.get(target)?.armorMaterial):prepared.stone?1+projectileAirPenalty(d,target,prepared.stone.massGrams*1000):1;
    const resolved=resolveVitalityPrimitive({spec,hp:old,maxHp:maximum,defense:prepared.derived.defense+protection.defense+hiddenCombat(this,d.get('state'),target).defense,resistance,multiplier:counter.damageMultiplier*heatMultiplier});
    const shield=spec.kind==='damage'?consumeMagicProtection(d,target,resolved.rawAmount,spec.damageType??'physical'):{damage:0,absorbed:0};
    const next=spec.kind==='damage'?Math.max(0,old-shield.damage):resolved.nextHp;
    if(target==='player')this.health(d,{delta:next-old},id);
    else{
        d.set([...path,'hp'],next);d.set([...path,'maxHp'],maximum);
        if(!next)recordEntityDeath(d,this,target,d.get('state','minute'),'法术致死');
        else if(spec.kind==='heal'&&current.status==='濒死'){d.set([...path,'status'],'正常');d.set([...path,'dyingSince'],null);}
        if(spec.kind==='damage'&&target.startsWith('npc_')&&(prepared.context?.source??'player')==='player'){
            if(next<old)recordDisciplineBreach(d,this,'violence',id);
            // Full NPCs judge a wound through the relation ledger (world event 'harm').
            if(this.byId.get(target)?.tier!=='full'||this.replaying&&this.replayResult!==undefined&&this.replayResult?.worldEventVersion!==1)d.set([...path,'trust'],Math.max(-100,(current.trust??0)-10));
            d.set([...path,'developments'],[...current.developments??[],{type:'法术伤害',source:id,minute:d.get('state','minute'),damage:old-next}]);
        }
    }
    if(spec.kind==='damage')rememberBossTactic(d,this,target,tactic,id);
    const killed=spec.kind==='damage'&&!next&&['monster_','boss_'].some(prefix=>target.startsWith(prefix));
    const corpse=killed?recordWildlifeDeath(d,this,target,id):null,lair=killed?defeatBoss(d,this,target,id):null;
    if(corpse&&(prepared.context?.source??'player')!=='player')holdingSet(d,null,['state','creatures',target,'corpse','killedBy'],prepared.context.source,'magic');
    const experience=killed&&(prepared.context?.source??'player')==='player'?monsterReward(d,this,target,id):{};
    return{target,[spec.kind==='heal'?'healed':'damage']:Math.abs(next-old),targetHp:next,...experience,...projectile,...(spec.coldDecay?{ambientC:prepared.ambientC,heatMultiplier}:{}),...(spec.lightDecay||spec.shadowDecay?{lightMultiplier:heatMultiplier}:{}),...(shield.absorbed?{absorbed:shield.absorbed,protectionEffect:shield.effect}:{}),...(corpse?{corpse}:{}),...(lair?{lair}:{}),...(counter.adapted?{adaptation:{tactic,guarded:true}}:{})};
}
