import {campaignReducer}from'./campaign-reducer.mjs';
import {compatibleWorld,planWorldUpgrade}from'./world-upgrade.mjs';

// Server operations and standalone migration must replay the same archived
// schema and world-upgrade events, not only today's ordinary commands.
export function archivedReducer(registry,fallbackEngine=null){
    return async(document,input,options={})=>{
        const hash=input.type==='schema_migration'?input.worldHash:document.worldHash;
        const selected=hash?await registry.get(hash):fallbackEngine;
        if(!selected)throw new Error('存档没有可核实的世界版本，拒绝迁移');
        if(input.type==='world_upgrade'){
            const incoming=await registry.get(input.worldHash);
            const{world:merged,retained}=compatibleWorld(selected.world,incoming.world);
            const worldHash=await registry.put(merged);
            const result=planWorldUpgrade(document,selected.world,merged,{worldHash,eventId:input.eventId,retained});
            result.patches.push({op:'set',path:['worldSourceHash'],value:input.worldHash});return result;
        }
        const output=await campaignReducer(selected)(document,input,options);
        if(input.type==='schema_migration')output.patches.push({op:'set',path:['worldHash'],value:hash});
        return output;
    };
}
