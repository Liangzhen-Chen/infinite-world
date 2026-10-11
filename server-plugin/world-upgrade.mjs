import {digest,applyPatches} from './storage.mjs';
import {planWildlifeMigration}from'./wildlife-migration.mjs';
import {planBossMigration}from'./boss-migration.mjs';
import {initialNpcState}from'./npc-state.mjs';

const catalogs=['npcs','residents','locations','items','professions','skills','spells','recipes','monsters','bosses','cultures','deities','factions','history','factionPeople','eras','households','settlementProfiles'];
const same=(a,b)=>digest(a??null)===digest(b??null);

// A new edition can add entities, but must keep every ID referenced by history.
export function compatibleWorld(oldWorld,newWorld){
    const world=structuredClone(newWorld),retained=[];
    for(const category of catalogs){
        const incoming=new Map((world[category]??[]).map(row=>[row.id,row]));
        for(const old of oldWorld[category]??[]){
            // A person can be expanded from roster to full without keeping a
            // second entity with the same identity. Full actors never demote.
            if(category==='residents'&&world.npcs.some(row=>row.id===old.id))continue;
            const next=incoming.get(old.id);
            if(!next){incoming.set(old.id,structuredClone(old));retained.push({category,id:old.id,reason:'历史实体未删除'});}
            else if(!['eras','households','settlementProfiles'].includes(category))next.aliases=[...new Set([...(next.aliases??[]),old.name,...(old.aliases??[])])].filter(name=>name!==next.name);
        }
        world[category]=[...incoming.values()];
    }
    const fullIds=new Set(world.npcs.map(row=>row.id));world.residents=(world.residents??[]).filter(row=>!fullIds.has(row.id));
    const routeIds=new Set((world.routes??[]).map(route=>route.id));
    for(const route of oldWorld.routes??[])if(!routeIds.has(route.id))world.routes.push(structuredClone(route));
    return {world,retained};
}

export function planWorldUpgrade(document,oldWorld,newWorld,{worldHash,eventId,retained=[]}){
    const patches=[],conflicts=[],added=[],stockAdded=[];
    const before=new Map(oldWorld.npcs.map(npc=>[npc.id,npc]));
    for(const npc of newWorld.npcs){
        const current=document.state.npcs[npc.id],old=before.get(npc.id);
        if(!current){
            // Initial wealth is granted to this resident, never to the player.
            patches.push({op:'set',path:['state','npcs',npc.id],value:initialNpcState(npc)});
            added.push(npc.id);continue;
        }
        if(!old)continue;
        for(const field of ['name','location','coins','inventory','trust','affection']){
            if(!Object.hasOwn(npc,field))continue;
            if(same(old[field],npc[field]))continue;
            const path=['state','npcs',npc.id,field];
            // Frozen older editions keep their original whole-inventory merge.
            // New editions may add newly catalogued stock once without refilling
            // an existing item, even when its current quantity is zero.
            if(field==='inventory'&&newWorld.rules.npcStockUpdateVersion===1){
                const inventory=structuredClone(current.inventory??{}),newStock=[];
                for(const [item,quantity]of Object.entries(npc.inventory??{})){
                    if(Object.hasOwn(old.inventory??{},item)||Object.hasOwn(inventory,item))continue;
                    inventory[item]=structuredClone(quantity);newStock.push({npc:npc.id,item,quantity:structuredClone(quantity)});
                }
                if(newStock.length){patches.push({op:'set',path,value:inventory});stockAdded.push(...newStock);}
                if(!same(inventory,npc.inventory))conflicts.push({path,kept:inventory,proposed:npc.inventory});
                continue;
            }
            if(same(current[field],old[field]))patches.push({op:'set',path,value:npc[field]});
            else conflicts.push({path,kept:structuredClone(current[field]),proposed:npc[field]});
        }
    }
    // New habitats and lairs enter the ledger with the edition update, never during an observation.
    const updated=applyPatches(document,patches);
    patches.push(...planWildlifeMigration(updated,newWorld.rules,newWorld.monsters??[]));
    patches.push(...planBossMigration(updated,newWorld.rules,newWorld.bosses??[]));
    patches.push({op:'set',path:['worldHash'],value:worldHash},{op:'set',path:['worldVersion'],value:newWorld.version},
        {op:'set',path:['state','records',`world_update_${eventId}`],value:{category:'world_update',name:'世界更新记录',
            from:document.worldVersion,to:newWorld.version,minute:document.state.minute,added,conflicts,retained,...(newWorld.rules.npcStockUpdateVersion===1?{stockAdded}:{})}});
    return {patches,result:{ok:true,worldHash,worldVersion:newWorld.version,added,conflicts,retained,...(newWorld.rules.npcStockUpdateVersion===1?{stockAdded}:{}),
        messages:[`【系统】世界已更新为${newWorld.version}，加入${added.length}位居民，保留${conflicts.length}处已改变的事实。`]}};
}
