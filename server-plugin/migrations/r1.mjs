import {applyPatches,canonical}from'../storage.mjs';
import {planRuleStateMigration}from'../rule-state-migration.mjs';
import {planAgricultureMigration}from'../agriculture-migration.mjs';
import {planWildlifeMigration}from'../wildlife-migration.mjs';
import {planBossMigration}from'../boss-migration.mjs';
import {planFarmPestsMigration}from'../farm-pests-migration.mjs';

const oldIdentity='玩家是成年再生者，自由决定生活方向，没有预设救世主使命。当前职业、领地与已会法术以账本为准。';
const newIdentity='玩家是成年冒险者，自由决定生活方向，没有预设救世主使命。当前职业、领地与已会法术以账本为准。';
const same=(a,b)=>canonical(a??null)===canonical(b??null);
// Historical pre-release events used these additive initializers. Replay alone
// may retain that behavior; ordinary actions must never migrate a campaign.
export function planPreR1Partitions(document,world){
    let next=document;const patches=[];
    const apply=rows=>{next=applyPatches(next,rows);patches.push(...rows);};
    apply(planRuleStateMigration(next,world.rules));
    apply(planAgricultureMigration(next,world.rules));
    apply(planWildlifeMigration(next,world.rules,world.monsters));
    apply(planBossMigration(next,world.rules,world.bosses,world));
    apply(planFarmPestsMigration(next,world.rules));
    return patches;
}
export function planR1(document,world){
    if(document.schemaVersion!==2)throw new Error('R1 需要先完成可核实的旧版编号转换');
    if(document.releaseVersion===1)return{patches:[],report:{release:'R1',alreadyApplied:true,changedMemories:[]}};
    if(document.releaseVersion!==undefined)throw new Error('未知发布版本，拒绝降级到 R1');
    let next=document;const patches=[];
    const apply=rows=>{next=applyPatches(next,rows);patches.push(...rows);};
    apply(planPreR1Partitions(next,world));
    const convertedAgriculture=[],day=Math.floor(document.state.minute/1440);
    for(const profile of world.rules.agriculture?.settlements??[]){
        const id=`agriculture:${profile.settlement}`,record=next.state.records[id];
        if(record?.mode!=='legacy')continue;
        const food=next.state.settlements[profile.settlement].food;
        if(!Number.isFinite(food)||food<0)throw new Error('旧粮食库存无效，拒绝迁移');
        const converted=structuredClone(record);
        converted.mode='managed';converted.lastDay=day-1;converted.ledger.openingFood=food;
        converted.batches=food?[{id:`r1:${profile.settlement}`,amount:food,harvestDay:day,expiresDay:day+profile.normalStorageDays,source:'R1 保留的旧库存',kind:'grain'}]:[];
        apply([{op:'set',path:['state','records',id],value:converted}]);convertedAgriculture.push(profile.settlement);
    }
    const changedMemories=[];
    // Only the exact former built-in identity is replaced. User-written history is retained.
    for(const[key,row]of Object.entries(next.memories??{}))if(row.subject==='玩家'&&row.key==='身份'&&row.content===oldIdentity){
        apply([{op:'set',path:['memories',key,'content'],value:newIdentity}]);changedMemories.push(key);
    }
    apply([{op:'set',path:['releaseVersion'],value:1}]);
    const preserved=Object.fromEntries(['player','inventory','skills','spells','npcs','location','minute'].map(key=>[key,same(document.state[key],next.state[key])]));
    if(Object.values(preserved).some(value=>!value))throw new Error('R1 初始化改动了现有角色或财物，拒绝迁移');
    const foodPreserved=Object.entries(document.state.settlements??{}).every(([id,row])=>same(row.food,next.state.settlements?.[id]?.food));
    if(!foodPreserved)throw new Error('R1 初始化不得补写或扣除现有粮食');
    return{patches,report:{release:'R1',alreadyApplied:false,preserved,foodPreserved,changedMemories,convertedAgriculture,
        memoriesBefore:Object.keys(document.memories??{}).length,memoriesAfter:Object.keys(next.memories??{}).length,
        recordsBefore:Object.keys(document.state.records??{}).length,recordsAfter:Object.keys(next.state.records??{}).length}};
}
export const initializeR1=(document,world)=>applyPatches(document,planR1(document,world).patches);
