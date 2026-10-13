import {emptyBossCognition,readBossCognition}from'./boss-cognition.mjs';
import {monsterStats}from'./combat.mjs';
export function planBossMigration(document,rules,catalog,world){
    if(!rules.bossEcology)return[];if(document.schemaVersion!==2)throw new Error('巢穴迁移只支持格式2存档');
    const day=Math.floor(document.state.minute/1440),patches=[];
    for(const boss of catalog.filter(b=>b.residence)){
        const key=`lair:${boss.residence.id}`,old=document.state.records[key];
        if(old&&(old.category!=='lair'||old.format!==1||old.boss!==boss.id))throw new Error('巢穴记录冲突或不支持版本');
        if(boss.actor){
            const current=document.state.npcs?.[boss.actor],legacy=document.state.creatures?.[boss.id],path=['state','npcs',boss.actor];
            if(!current){
                if(legacy)throw Error('社会首领迁移须先加入对应完整居民');
                if(!old)patches.push({op:'set',path:['state','records',key],value:{category:'lair',format:1,lair:boss.residence.id,boss:boss.id,initializedDay:day,
                    status:'空置',occupant:null,vacantSince:day,reoccupyAfter:null,history:[],lastDay:day-1}});
                continue;
            }
            const actor=structuredClone(current);
            if(legacy){
                if(current.hp!==undefined&&['hp','maxHp','status','location'].some(field=>current[field]!==legacy[field]))throw Error('首领与居民存在冲突的身体状态，拒绝覆盖');
                for(const field of ['hp','maxHp','status','location','owner','level','battleMemory','abilityCounters','source'])if(legacy[field]!==undefined)actor[field]=structuredClone(legacy[field]);
                if(legacy.cognition!==undefined)actor.bossCognition=structuredClone(legacy.cognition);
                if(legacy.negotiation){actor.inventory=structuredClone(legacy.negotiation.inventory);actor.negotiation={...structuredClone(legacy.negotiation),inventory:{}};}
                patches.push({op:'delete',path:['state','creatures',boss.id]});
            }
            const stats=monsterStats({level:boss.level,template:world?.monsters?.find(s=>s.id===boss.monster)?.template??2,bossTier:boss.tier},rules);
            actor.boss=boss.id;actor.species=boss.monster;actor.lair=boss.residence.id;
            actor.hp??=stats.maxHp;actor.maxHp??=stats.maxHp;actor.level??=boss.level;actor.status??='正常';
            // NPC daily reflections keep their own cognition record.
            readBossCognition(actor);actor.bossCognition??=emptyBossCognition();
            actor.negotiation??={format:1,inventory:{},relation:null,history:[]};
            if(JSON.stringify(actor)!==JSON.stringify(current))patches.push({op:'set',path,value:actor});
            const present=actor.status!=='死亡'&&actor.hp>0&&actor.location===boss.residence.location;
            const record={...(old??{category:'lair',format:1,lair:boss.residence.id,boss:boss.id,initializedDay:day,history:[],lastDay:day-1}),
                status:present?'驻守':'空置',occupant:present?{kind:'boss',definition:boss.id,actor:boss.actor}:null,vacantSince:present?null:old?.vacantSince??day,reoccupyAfter:null};
            if(JSON.stringify(record)!==JSON.stringify(old))patches.push({op:'set',path:['state','records',key],value:record});
            continue;
        }
        const actor=document.state.creatures?.[boss.id];
        if(actor&&boss.intelligence>0){
            readBossCognition(actor);
            if(actor.cognition===undefined)patches.push({op:'set',path:['state','creatures',boss.id,'cognition'],value:emptyBossCognition()});
        }
        if(old){if(old.category!=='lair'||old.format!==1||old.boss!==boss.id)throw new Error('巢穴记录冲突或不支持版本');continue;}
        const dead=actor&&(actor.status==='死亡'||actor.hp===0);
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
