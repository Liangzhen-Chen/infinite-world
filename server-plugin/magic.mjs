import {movementKinds,validateMovementCatalog,prepareMovement,applyMovement}from'./magic-movement.mjs';
import {validateAreaCatalog,prepareAreaMagic,applyAreaMagic}from'./magic-area.mjs';
import {derivedStats,monsterStats}from'./combat.mjs';
import {magicStatuses,magicStatusStats,relieveMagicStatuses,applyMagicStatus}from'./magic-status.mjs';
import {validateTargeting,assertMagicTargeting}from'./magic-targeting.mjs';
import {validateMarkCatalog,prepareMark,applyMark}from'./magic-marks.mjs';
import {monsterReward}from'./progression.mjs';
import {heldUnit,trackSingleItem}from'./items.mjs';
import {validateEnvironmentCatalog,prepareEnvironmentMagic,applyEnvironmentMagic}from'./environment.mjs';
import {validateSummonCatalog,prepareSummon,applySummon}from'./summons.mjs';
import {resolveCreature,recordWildlifeDeath}from'./wildlife.mjs';
import {bossCounter,rememberBossTactic,defeatBoss}from'./bosses.mjs';
import {validateEffectSpec,resolveVitalityPrimitive,applyProtectionPrimitive,consumeMagicProtection}from'./magic-primitives.mjs';
import {validateObjectCatalog,prepareObjectMagic,applyObjectMagic}from'./magic-object.mjs';
export function validateMagicCatalog(catalog,{requireHandler=false}={}){
    const spec=catalog.effectSpec,errors=[];
    if(!spec){if(requireHandler||catalog.mechanism)errors.push('此法术机制尚未接入规则，不能叙述已实现');return errors;}
    errors.push(...(movementKinds.includes(spec.kind)?validateMovementCatalog(catalog):validateEffectSpec(spec)));
    errors.push(...validateTargeting(catalog));
    if(['status','light','protection'].includes(spec.kind)&&(!Number.isSafeInteger(catalog.duration)||catalog.duration<1||catalog.duration>Math.min(catalog.durationLimit??43200,43200)))errors.push('持续效果的时限非法');
    if(spec.kind==='status'&&(!magicStatuses[spec.status]||spec.power>magicStatuses[spec.status].maximum))errors.push('状态效果或强度不在规则表');
    if(spec.kind==='status'&&['dazzle','camouflage','nightvision','illusion','compulsion','travel_calm'].includes(spec.status)&&!catalog.targeting)errors.push('新状态须声明实际目标边界');
    if(spec.kind==='status'&&['dazzle','illusion'].includes(spec.status)&&catalog.duration!==1)errors.push('瞬时注意力干扰须最多保留一分钟待用');
    if(spec.kind==='relief'&&(spec.power>3||catalog.duration!==0||catalog.targeting?.consent!=='mental_magic'||catalog.targeting?.permit!=='mental_magic'))errors.push('精神解除须有限强度、本人同意与施法许可');
    if(spec.kind==='status'&&magicStatuses[spec.status]?.mental&&catalog.targeting?.permit!=='mental_magic')errors.push('精神干扰须明确施法许可');
    if(spec.kind==='area')errors.push(...validateAreaCatalog(catalog));
    if(spec.kind==='environment')errors.push(...validateEnvironmentCatalog(catalog));
    if(['summon','summon_contract'].includes(spec.kind))errors.push(...validateSummonCatalog(catalog));
    if(spec.kind==='mark')errors.push(...validateMarkCatalog(catalog));
    if(spec.kind==='object')errors.push(...validateObjectCatalog(catalog));
    return errors;
}
export function prepareMagic(d,catalog,args,context={}){
    const errors=validateMagicCatalog(catalog);if(errors.length)throw new Error(errors.join('；'));
    const spec=catalog.effectSpec;if(!spec)return null;
    if(movementKinds.includes(spec.kind))return prepareMovement.call(this,d,catalog,args);
    if(spec.kind==='area')return prepareAreaMagic.call(this,d,catalog,args,context);
    if(spec.kind==='environment')return prepareEnvironmentMagic.call(this,d,catalog,args);
    if(['summon','summon_contract'].includes(spec.kind))return prepareSummon.call(this,d,catalog,args);
    if(spec.kind==='mark')return prepareMark.call(this,d,catalog,args);
    if(spec.kind==='object')return prepareObjectMagic.call(this,d,catalog,args);
    const target=['repair','dry','light'].includes(spec.kind)?this.resolve(args.target??'player'):resolveCreature(this,d,args.target??'player');
    if(['repair','dry','light'].includes(spec.kind)){
        if(!target.startsWith('item_')||this.quantity(d,'player',target)<1)throw new Error('施法需要实际持有的目标物品');
        const held=heldUnit(d,this,'player',target),definition=this.byId.get(target);
        if(held.quantity!==1)throw new Error('需要分出单件目标，不能对整叠物品施法');
        if(spec.kind==='repair'&&!(definition.tags??[]).includes('metal'))throw new Error('目标不是可修缮的金属器具');
        if(spec.kind==='dry'&&!(definition.tags??[]).includes('clothing'))throw new Error('目标不是一件衣物');
        return{target,path:['state','inventory',target],held,definition,spec,catalog};
    }
    const partition=target.startsWith('npc_')?'npcs':target.startsWith('monster_')||target.startsWith('boss_')?'creatures':null;
    if(target!=='player'&&!partition)throw new Error('法术需要实际生命目标');
    const actor=target==='player'?d.get('state','player'):d.get('state',partition,target),definition=this.byId.get(target);
    if(!actor||target!=='player'&&actor.location!==(context.location??d.get('state','location')))throw new Error('法术目标不在场');
    if(actor.status==='死亡')throw new Error('目标已经死亡，此法术不能使死者复生');
    const targetingEngine=Object.create(this);
    if(context.targetFacts)targetingEngine.magicTargetFacts=()=>context.targetFacts;
    assertMagicTargeting(d,targetingEngine,catalog,args,target);
    const derived=target==='player'?{maxHp:actor.maxHp,defense:0}:partition==='npcs'
        ?derivedStats({level:actor.level??definition.level??1,attributes:definition.attributes,profession:Boolean(definition.combatProfession)},this.rules)
        :monsterStats({level:actor.level??definition.level??definition.levelRange?.[0]??1,template:definition.template??this.byId.get(definition.monster)?.template??2,bossTier:definition.tier??0},this.rules);
    if(derived.divine&&!d.get('state','divinePermissions',target))throw new Error('此法术无法越过神性屏障');
    if(spec.kind==='heal'&&target!=='player'&&actor.status!=='濒死'){
        const permission=d.get('state','records',args.authorization);
        if(!permission||permission.category!=='authorization'||permission.subject!==target||permission.action!=='healing'||permission.expires!==undefined&&permission.expires<=d.get('state','minute'))throw new Error('治疗需要本人同意；濒死急救除外');
    }
    if((spec.kind==='protection'||spec.kind==='status'&&magicStatuses[spec.status].beneficial)&&target!=='player'){
        const permission=d.get('state','records',args.authorization);
        if(!permission||permission.category!=='authorization'||permission.subject!==target||permission.action!=='support_magic'||permission.expires!==undefined&&permission.expires<=d.get('state','minute'))throw new Error('向他人施加防护需要本人同意');
    }
    return{target,path:target==='player'?['state','player']:['state',partition,target],actor,derived,spec,catalog,context,completionArgs:{...args,target}};
}
export function applyMagic(d,prepared,id){
    if(!prepared)return{};
    let{spec,target,path,catalog}=prepared;
    if(movementKinds.includes(spec.kind))return applyMovement.call(this,d,prepared,id);
    if(spec.kind==='area')return applyAreaMagic.call(this,d,prepared,id);
    if(spec.kind==='environment')return applyEnvironmentMagic.call(this,d,prepared,id);
    if(['summon','summon_contract'].includes(spec.kind))return applySummon.call(this,d,prepared,id);
    if(spec.kind==='mark')return applyMark.call(this,d,prepared,id);
    if(spec.kind==='object')return applyObjectMagic.call(this,d,prepared,id);
    if(prepared.completionArgs){
        try{prepared=prepareMagic.call(this,d,catalog,prepared.completionArgs,prepared.context);}
        catch(error){return{target,effectFailed:`施法完成前条件失效：${error.message}`};}
    }
    const latest=d.get(...path);
    if(!latest||latest.status==='死亡')return{target,effectFailed:'施法完成前目标已离开行囊或死亡，效果未生效'};
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
        if(current.instance)d.set(['state','itemInstances',current.instance,'durability'],current.durability+repaired);
        return{target,repaired};
    }
    if(spec.kind==='dry'){
        const current=d.get(...path),dried=Math.min(spec.power,current.moisture??0);
        d.set([...path,'moisture'],Math.max(0,(current.moisture??0)-dried));return{target,dried};
    }
    const current=d.get(...path),maximum=current.maxHp??prepared.derived.maxHp,old=current.hp??maximum;
    const protection=magicStatusStats(d,target),resistance=protection[`${spec.damageType}Resistance`]??0;
    const tactic=`magic_${spec.damageType??'untyped'}`,counter=spec.kind==='damage'?bossCounter(d,this,target,tactic):{damageMultiplier:1};
    const resolved=resolveVitalityPrimitive({spec,hp:old,maxHp:maximum,defense:prepared.derived.defense+protection.defense,resistance,multiplier:counter.damageMultiplier});
    const shield=spec.kind==='damage'?consumeMagicProtection(d,target,resolved.rawAmount,spec.damageType??'physical'):{damage:0,absorbed:0};
    const next=spec.kind==='damage'?Math.max(0,old-shield.damage):resolved.nextHp;
    if(target==='player')this.health(d,{delta:next-old},id);
    else{
        d.set([...path,'hp'],next);d.set([...path,'maxHp'],maximum);
        if(!next)d.set([...path,'status'],'死亡');
        else if(spec.kind==='heal'&&current.status==='濒死'){d.set([...path,'status'],'正常');d.set([...path,'dyingSince'],null);}
        if(spec.kind==='damage'&&target.startsWith('npc_')&&(prepared.context?.source??'player')==='player'){
            d.set([...path,'trust'],Math.max(-100,(current.trust??0)-10));
            d.set([...path,'developments'],[...current.developments??[],{type:'法术伤害',source:id,minute:d.get('state','minute'),damage:old-next}]);
        }
    }
    if(spec.kind==='damage')rememberBossTactic(d,this,target,tactic,id);
    const killed=spec.kind==='damage'&&!next&&['monster_','boss_'].some(prefix=>target.startsWith(prefix));
    const corpse=killed?recordWildlifeDeath(d,this,target,id):null,lair=killed?defeatBoss(d,this,target,id):null;
    if(corpse&&(prepared.context?.source??'player')!=='player')d.set(['state','creatures',target,'corpse','killedBy'],prepared.context.source);
    const experience=killed&&(prepared.context?.source??'player')==='player'?monsterReward(d,this,target,id):{};
    return{target,[spec.kind==='heal'?'healed':'damage']:Math.abs(next-old),targetHp:next,...experience,...(shield.absorbed?{absorbed:shield.absorbed,protectionEffect:shield.effect}:{}),...(corpse?{corpse}:{}),...(lair?{lair}:{}),...(counter.adapted?{adaptation:{tactic,guarded:true}}:{})};
}
