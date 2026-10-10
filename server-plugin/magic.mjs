import {derivedStats,monsterStats}from'./combat.mjs';
import {magicStatuses,magicStatusStats}from'./magic-status.mjs';
import {monsterReward}from'./progression.mjs';
import {heldUnit,trackSingleItem}from'./items.mjs';
import {validateEnvironmentCatalog,prepareEnvironmentMagic,applyEnvironmentMagic}from'./environment.mjs';
import {validateSummonCatalog,prepareSummon,applySummon}from'./summons.mjs';
import {resolveCreature,recordWildlifeDeath}from'./wildlife.mjs';
import {bossCounter,rememberBossTactic,defeatBoss}from'./bosses.mjs';
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const allowedKinds=new Set(['damage','heal','repair','dry','status','light','environment','summon']);
export function validateMagicCatalog(catalog,{requireHandler=false}={}){
    const spec=catalog.effectSpec,errors=[];
    if(!spec){if(requireHandler||catalog.mechanism)errors.push('此法术机制尚未接入规则，不能叙述已实现');return errors;}
    if(!allowedKinds.has(spec.kind))errors.push('此法术效果类型尚未接入规则，不能叙述已实现');
    if(!Number.isSafeInteger(spec.power)||spec.power<1||spec.power>5000)errors.push('法术规则强度非法');
    if(['status','light'].includes(spec.kind)&&(!Number.isSafeInteger(catalog.duration)||catalog.duration<1||catalog.duration>(catalog.durationLimit??43200)))errors.push('持续效果的时限非法');
    if(spec.kind==='status'&&(!magicStatuses[spec.status]||spec.power>magicStatuses[spec.status].maximum))errors.push('状态效果或强度不在规则表');
    if(spec.damageType&&!['fire','cold','wind','earth','light','shadow','mind'].includes(spec.damageType))errors.push('伤害门类不在规则表');
    if(spec.kind==='environment')errors.push(...validateEnvironmentCatalog(catalog));
    if(spec.kind==='summon')errors.push(...validateSummonCatalog(catalog));
    return errors;
}
export function prepareMagic(d,catalog,args){
    const errors=validateMagicCatalog(catalog);if(errors.length)throw new Error(errors.join('；'));
    const spec=catalog.effectSpec;if(!spec)return null;
    if(spec.kind==='environment')return prepareEnvironmentMagic.call(this,d,catalog,args);
    if(spec.kind==='summon')return prepareSummon.call(this,d,catalog,args);
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
    if(!actor||target!=='player'&&actor.location!==d.get('state','location'))throw new Error('法术目标不在场');
    if(actor.status==='死亡')throw new Error('目标已经死亡，此法术不能使死者复生');
    const derived=target==='player'?{maxHp:actor.maxHp,defense:0}:partition==='npcs'
        ?derivedStats({level:actor.level??definition.level??1,attributes:definition.attributes,profession:Boolean(definition.combatProfession)},this.rules)
        :monsterStats({level:actor.level??definition.level??definition.levelRange?.[0]??1,template:definition.template??this.byId.get(definition.monster)?.template??2,bossTier:definition.tier??0},this.rules);
    if(derived.divine&&!d.get('state','divinePermissions',target))throw new Error('此法术无法越过神性屏障');
    if(spec.kind==='heal'&&target!=='player'&&actor.status!=='濒死'){
        const permission=d.get('state','records',args.authorization);
        if(!permission||permission.category!=='authorization'||permission.subject!==target||permission.action!=='healing'||permission.expires!==undefined&&permission.expires<=d.get('state','minute'))throw new Error('治疗需要本人同意；濒死急救除外');
    }
    if(spec.kind==='status'&&magicStatuses[spec.status].beneficial&&target!=='player'){
        const permission=d.get('state','records',args.authorization);
        if(!permission||permission.category!=='authorization'||permission.subject!==target||permission.action!=='support_magic'||permission.expires!==undefined&&permission.expires<=d.get('state','minute'))throw new Error('向他人施加防护需要本人同意');
    }
    return{target,path:target==='player'?['state','player']:['state',partition,target],actor,derived,spec,catalog};
}
export function applyMagic(d,prepared,id){
    if(!prepared)return{};
    const{spec,target,path,catalog}=prepared;
    if(spec.kind==='environment')return applyEnvironmentMagic.call(this,d,prepared,id);
    if(spec.kind==='summon')return applySummon.call(this,d,prepared,id);
    const latest=d.get(...path);
    if(!latest||latest.status==='死亡')return{target,effectFailed:'施法完成前目标已离开行囊或死亡，效果未生效'};
    if(spec.kind==='status'||spec.kind==='light'){
        const expires=d.get('state','minute')+catalog.duration;
        const effect={kind:spec.kind,spell:catalog.id,target,power:spec.power,expires,source:id,
            ...(spec.kind==='status'?{status:spec.status}:{owner:'player',targetInstance:trackSingleItem(d,this,'player',target,id)})};
        d.set(['state','effects',id],effect);
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
    const amount=spec.kind==='damage'?Math.max(1,Math.round((spec.power-(prepared.derived.defense+protection.defense)*(spec.armorFactor??0.25))*(1-resistance)*counter.damageMultiplier)):spec.power;
    const next=clamp(old+(spec.kind==='heal'?amount:-amount),0,maximum);
    if(target==='player')this.health(d,{delta:next-old},id);
    else{
        d.set([...path,'hp'],next);d.set([...path,'maxHp'],maximum);
        if(!next)d.set([...path,'status'],'死亡');
        else if(spec.kind==='heal'&&current.status==='濒死'){d.set([...path,'status'],'正常');d.set([...path,'dyingSince'],null);}
        if(spec.kind==='damage'&&target.startsWith('npc_')){
            d.set([...path,'trust'],Math.max(-100,(current.trust??0)-10));
            d.set([...path,'developments'],[...current.developments??[],{type:'法术伤害',source:id,minute:d.get('state','minute'),damage:old-next}]);
        }
    }
    if(spec.kind==='damage')rememberBossTactic(d,this,target,tactic,id);
    const killed=spec.kind==='damage'&&!next&&['monster_','boss_'].some(prefix=>target.startsWith(prefix));
    const corpse=killed?recordWildlifeDeath(d,this,target,id):null,lair=killed?defeatBoss(d,this,target,id):null;
    const experience=killed?monsterReward(d,this,target,id):{};
    return{target,[spec.kind==='heal'?'healed':'damage']:Math.abs(next-old),targetHp:next,...experience,...(corpse?{corpse}:{}),...(lair?{lair}:{}),...(counter.adapted?{adaptation:{tactic,guarded:true}}:{})};
}
