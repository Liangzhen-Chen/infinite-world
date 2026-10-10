// Status identifiers and their numerical consequences are authored rules.
export const magicStatuses={
    stone_skin:{maximum:15,beneficial:true},
    fire_shield:{maximum:80,beneficial:true},
    mind_guard:{maximum:80,beneficial:true},
    shadow_ward:{maximum:80,beneficial:true},
    fear:{maximum:5,beneficial:false},
};
export function magicStatusStats(d,target){
    const powers={};
    for(const effect of Object.values(d.get('state','effects')??{})){
        if(effect.kind!=='status'||effect.target!==target||effect.expires<=d.get('state','minute'))continue;
        powers[effect.status]=Math.max(powers[effect.status]??0,effect.power);
    }
    return{defense:powers.stone_skin??0,evasion:-(powers.stone_skin??0)*0.02,
        hit:-(powers.fear??0)*0.02,
        fireResistance:(powers.fire_shield??0)/100,
        mindResistance:(powers.mind_guard??0)/100,
        shadowResistance:(powers.shadow_ward??0)/100};
}
export function magicIlluminates(d){
    return Object.values(d.get('state','effects')??{}).some(effect=>effect.kind==='light'&&effect.expires>d.get('state','minute')
        &&effect.owner==='player'&&(d.get('state','inventory',effect.target,'quantity')??0)>0
        &&(!effect.targetInstance||d.get('state','itemInstances',effect.targetInstance,'owner')==='player'&&d.get('state','itemInstances',effect.targetInstance,'status')==='持有'));
}
export function withMagicStats(stats,magic){
    return{...stats,defense:stats.defense+magic.defense,hit:Math.max(0,stats.hit+magic.hit),evasion:Math.max(0,stats.evasion+magic.evasion)};
}
