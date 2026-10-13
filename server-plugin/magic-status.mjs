// Status identifiers and their numerical consequences are authored rules.
import {waterEarthHeldUntil}from'./magic-water-earth.mjs';
export const magicStatuses={
    stone_skin:{maximum:15,beneficial:true},
    fire_shield:{maximum:80,beneficial:true},
    mind_guard:{maximum:80,beneficial:true},
    shadow_ward:{maximum:80,beneficial:true},
    fear:{maximum:5,beneficial:false},
    dazzle:{maximum:5,beneficial:false,conditional:true},
    camouflage:{maximum:10,beneficial:true,conditional:true},
    nightvision:{maximum:5,beneficial:true,conditional:true},
    illusion:{maximum:5,beneficial:false,mental:true},
    compulsion:{maximum:3,beneficial:false,mental:true},
    travel_calm:{maximum:3,beneficial:true},
};
export function magicStatusStats(d,target,context={}){
    const powers={};
    for(const effect of Object.values(d.get('state','effects')??{})){
        if(effect.kind!=='status'||effect.target!==target||effect.expires<=d.get('state','minute'))continue;
        if(effect.remainingUses===0)continue;
        if(['dazzle','illusion'].includes(effect.status)&&effect.remainingUses!==1)throw Error('瞬时干扰剩余次数损坏');
        const rule=magicStatuses[effect.status];if(!rule||!Number.isSafeInteger(effect.power)||effect.power<0||effect.power>rule.maximum)throw Error('法术状态记录无效');
        if(effect.status==='dazzle'&&context.eyesClosed!==false)continue;
        if(effect.status==='camouflage'&&(!['lit','dim'].includes(context.illumination)||typeof context.raining!=='boolean'||typeof context.moving!=='boolean'))continue;
        if(effect.status==='nightvision'&&context.illumination!=='dim')continue;
        let power=effect.power;
        if(effect.status==='camouflage'&&(context.raining||context.moving))power=Math.floor(power/2);
        powers[effect.status]=Math.max(powers[effect.status]??0,power);
    }
    const bound=waterEarthHeldUntil(d.get('state'),target,d.get('state','minute'))>d.get('state','minute')?.1:0;
    return{defense:powers.stone_skin??0,evasion:-(powers.stone_skin??0)*0.02+(powers.camouflage??0)*0.01-bound,
        hit:-(Math.max(0,(powers.fear??0)-(powers.travel_calm??0))+(powers.dazzle??0)+(powers.illusion??0)+(powers.compulsion??0))*0.02||0,
        nightVision:(powers.nightvision??0)*0.02,
        fireResistance:(powers.fire_shield??0)/100,
        mindResistance:(powers.mind_guard??0)/100,
        shadowResistance:(powers.shadow_ward??0)/100};
}
export function magicIlluminates(d){
    return Object.values(d.get('state','effects')??{}).some(effect=>effect.kind==='summon'&&effect.summonType==='fire_projection'&&effect.owner==='player'&&effect.location===d.get('state','location')&&effect.expires>d.get('state','minute')||effect.kind==='light'&&effect.expires>d.get('state','minute')
        &&effect.owner==='player'&&(d.get('state','inventory',effect.target,'quantity')??0)>0
        &&(!effect.targetInstance||d.get('state','itemInstances',effect.targetInstance,'owner')==='player'&&d.get('state','itemInstances',effect.targetInstance,'status')==='持有'));
}
export function relieveMagicStatuses(d,target,statuses,power){
 if(!Array.isArray(statuses)||statuses.some(s=>!['fear','compulsion'].includes(s))||!Number.isSafeInteger(power)||power<1||power>3)throw Error('精神解除参数无效');
 let remaining=power;const changes=[];
 const rows=Object.entries(d.get('state','effects')??{}).filter(([,e])=>e.kind==='status'&&e.target===target&&e.expires>d.get('state','minute')&&statuses.includes(e.status)).sort(([a],[b])=>a.localeCompare(b));
 for(const[id,e]of rows){if(!remaining)break;const rule=magicStatuses[e.status];if(!rule||!Number.isSafeInteger(e.power)||e.power<0||e.power>rule.maximum)throw Error('解除目标状态记录损坏');const relieved=Math.min(remaining,e.power);remaining-=relieved;if(relieved===e.power)d.remove(['state','effects',id]);else d.set(['state','effects',id,'power'],e.power-relieved);changes.push({effect:id,relieved});}
 return{target,relieved:power-remaining,changes};
}
export function applyMagicStatus(d,{target,status,power,duration,source,spell},id){
 const rule=magicStatuses[status];
 if(!rule||!Number.isSafeInteger(power)||power<1||power>rule.maximum||!Number.isSafeInteger(duration)||duration<1||duration>43200||['dazzle','illusion'].includes(status)&&duration!==1)throw Error('状态原语参数无效');
 if(d.get('state','effects',id))throw Error('状态事件重复');
 if(['fear','illusion','compulsion'].includes(status))power=Math.max(0,Math.round(power*(1-magicStatusStats(d,target).mindResistance)));
 if(!power)return{target,resisted:true};
 const expires=d.get('state','minute')+duration;
 d.set(['state','effects',id],{kind:'status',target,status,power,expires,source,...(spell?{spell}:{}),...(['dazzle','illusion'].includes(status)?{remainingUses:1}:{})});
 return{target,effect:id,status,expires,power};
}
export function consumeTransientMagic(d,target,context={}){
 const consumed=[];
 for(const[id,e]of Object.entries(d.get('state','effects')??{})){
  if(e.kind!=='status'||e.target!==target||e.expires<=d.get('state','minute')||!['dazzle','illusion'].includes(e.status))continue;
  if(e.status==='dazzle'&&context.eyesClosed!==false)continue;
  if(e.remainingUses!==1&&e.remainingUses!==0)throw Error('瞬时干扰剩余次数损坏');
  if(e.remainingUses===1){d.set(['state','effects',id,'remainingUses'],0);consumed.push(id);}
 }
 return consumed;
}
export function withMagicStats(stats,magic){
    return{...stats,defense:stats.defense+magic.defense,hit:Math.max(0,stats.hit+magic.hit),evasion:Math.max(0,stats.evasion+magic.evasion)};
}
