import {isPhysicallyDead} from './lifecycle-state.mjs';
import {speciesInHabitat,migrationPath} from './wildlife-range.mjs';
import {initialIn} from './wildlife-habitats.mjs';
export function planWildlifeMigration(document,rules,catalog){
    if(!rules.wildlife)return[];if(document.schemaVersion!==2)throw new Error('生态迁移只支持格式2存档');
    const patches=[],day=Math.floor(document.state.minute/1440);
    for(const habitat of rules.wildlife.habitats){
        const key=`ecology:${habitat.id}`,old=document.state.records[key];
        if(old&& (old.category!=='ecology'||old.format!==1||old.habitat!==habitat.id))throw new Error('生态记录冲突或不支持版本');
        const populations=structuredClone(old?.populations??{});let changed=!old;
        for(const species of speciesInHabitat(rules,catalog,habitat.id)){
            if(populations[species.id]){
                if(rules.wildlife.migration)for(const field of ['immigrated','emigrated']){
                    if(populations[species.id][field]===undefined){populations[species.id][field]=0;changed=true;}
                    else if(!Number.isSafeInteger(populations[species.id][field])||populations[species.id][field]<0)throw new Error('迁徙计数损坏，拒绝覆盖');
                }
                continue;
            }
            const existing=Object.entries(document.state.creatures??{}).filter(([id,a])=>a.species===species.id&&a.location===habitat.location&&!a.owner&&!isPhysicallyDead(null,document,id)).length;
            // Home and K8 derived ranges start stocked; migration-only ranges start empty.
            const count=Math.max(0,initialIn(habitat,species)-existing);
            populations[species.id]={count,initial:count,born:0,predated:0,starved:0,withdrawn:0,...(rules.wildlife.migration?{immigrated:0,emigrated:0}:{})};changed=true;
        }
        if(changed)patches.push({op:'set',path:['state','records',key],value:old?{...old,populations}:{category:'ecology',format:1,habitat:habitat.id,initializedDay:day,lastDay:day-1,populations}});
    }
    if(rules.wildlife.migration){
        const old=document.state.records['wildlife:migration'];
        if(old){if(old.category!=='wildlifeMigration'||old.format!==1)throw new Error('迁徙记录冲突或不支持版本');}
        else patches.push({op:'set',path:migrationPath(),value:{category:'wildlifeMigration',format:1,initializedDay:day,lastDay:day-1,transit:[],departed:0,arrived:0,lost:0}});
    }
    return patches;
}
