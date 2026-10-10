export function planFarmPestsMigration(document,rules){
    const profiles=rules.wildlife?.farmPests?.fields;if(!profiles)return[];
    if(document.schemaVersion!==2)throw new Error('害兽迁移只支持格式2存档');
    const patches=[];
    for(const p of profiles){
        const key=`agriculture:${p.settlement}`,r=document.state.records[key];if(!r)throw new Error('农事迁移必须先于害兽迁移');
        if(r.category!=='agriculture'||r.format!==1||r.field.id!==p.fieldId)throw new Error('害兽农田记录冲突');
        const base=['state','records',key];
        if(r.field.pestFormat===undefined){
            patches.push({op:'set',path:[...base,'field','pestFormat'],value:1});
            patches.push({op:'set',path:[...base,'field','pestInitializedMinute'],value:document.state.minute});
        }else if(r.field.pestFormat!==1||!Number.isSafeInteger(r.field.pestInitializedMinute)||r.field.pestInitializedMinute<0)throw new Error('害兽农田版本或启用时间冲突');
        if(r.field.pestProtection===undefined)patches.push({op:'set',path:[...base,'field','pestProtection'],value:[]});
        else if(!Array.isArray(r.field.pestProtection)||r.field.pestProtection.some(i=>!Number.isSafeInteger(i.start)||!Number.isSafeInteger(i.until)||i.start<0||i.until<=i.start))throw new Error('巡田时间记录损坏');
        for(const[field,initial]of [['pestLost',0],['potentialHarvested',r.ledger.harvested]]){
            const value=r.ledger[field];if(value===undefined)patches.push({op:'set',path:[...base,'ledger',field],value:initial});
            else if(!Number.isSafeInteger(value)||value<0)throw new Error('害兽收成账损坏');
        }
        if(r.ledger.pestLost!==undefined&&r.ledger.potentialHarvested!==undefined&&r.ledger.potentialHarvested!==r.ledger.harvested+r.ledger.pestLost)throw new Error('害兽潜在收成账不守恒');
        for(let i=0;i<r.field.cohorts.length;i++){
            const c=r.field.cohorts[i];
            for(const[field,initial]of [['pestDamageBps',0],['potentialHarvestedFood',c.harvestedFood]]){
                const value=c[field];if(value===undefined)patches.push({op:'set',path:[...base,'field','cohorts',String(i),field],value:initial});
                else if(!Number.isSafeInteger(value)||value<0||(field==='pestDamageBps'&&value>10000))throw new Error('作物害兽记录损坏');
            }
        }
    }
    return patches;
}
