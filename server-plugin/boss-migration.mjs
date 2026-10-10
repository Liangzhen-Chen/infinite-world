export function planBossMigration(document,rules,catalog){
    if(!rules.bossEcology)return[];if(document.schemaVersion!==2)throw new Error('巢穴迁移只支持格式2存档');
    const day=Math.floor(document.state.minute/1440),patches=[];
    for(const boss of catalog.filter(b=>b.residence)){
        const key=`lair:${boss.residence.id}`,old=document.state.records[key];
        if(old){if(old.category!=='lair'||old.format!==1||old.boss!==boss.id)throw new Error('巢穴记录冲突或不支持版本');continue;}
        const actor=document.state.creatures?.[boss.id],dead=actor&&(actor.status==='死亡'||actor.hp===0);
        if(actor){
            const metadata={boss:boss.id,species:boss.monster,ecology:boss.residence.habitat,lair:boss.residence.id};
            for(const [field,value]of Object.entries(metadata)){
                if(actor[field]!==undefined&&actor[field]!==value)throw new Error('旧首领身份与巢穴规则冲突');
                if(actor[field]===undefined)patches.push({op:'set',path:['state','creatures',boss.id,field],value});
            }
        }
        patches.push({op:'set',path:['state','records',key],value:{category:'lair',format:1,lair:boss.residence.id,boss:boss.id,
            initializedDay:day,status:dead?'空置':'驻守',occupant:dead?null:{kind:'boss',definition:boss.id,actor:actor?boss.id:null},
            vacantSince:dead?day:null,reoccupyAfter:dead?day+boss.residence.vacancyDays:null,history:[],lastDay:day-1}});
    }
    return patches;
}
