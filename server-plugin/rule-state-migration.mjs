export function revivalPoint(rules,location){
    const points=rules.death.points??[];
    return points.find(point=>point.location===location)??points.find(point=>point.settlement===location);
}

// Additive migration: old money, inventory, relationships and history stay intact.
// The previously recorded anchor is grandfathered, without a new registration fee.
export const runtimeRuleVersion=2;
export function planRuleStateMigration(document,rules){
    if(!rules.death.points||document.state.runtimeRuleVersion===runtimeRuleVersion)return[];
    if(document.state.runtimeRuleVersion>runtimeRuleVersion)throw new Error('此存档使用更高规则分区版本，拒绝降级');
    if(document.schemaVersion!==2)throw new Error('规则分区迁移只支持格式2存档');
    const point=revivalPoint(rules,document.state.player.revivalAnchor);
    if(!point)throw new Error('旧复活点没有对应祭坛，需先补齐世界映射，拒绝擅改登记点');
    const patches=[];
    const add=(key,value)=>{if(document.state[key]===undefined)patches.push({op:'set',path:['state',key],value});};
    add('revivalPoints',{[point.location]:{location:point.location,registeredAt:document.state.minute,fee:0,source:'原登记点迁移'}});
    add('shrineTreasuries',{});add('experienceLedger',{});add('experienceRepeats',{});
    add('itemInstances',{});add('workshopFunds',{});
    patches.push({op:'set',path:['state','runtimeRuleVersion'],value:runtimeRuleVersion});
    return patches;
}
