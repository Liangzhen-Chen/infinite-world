import {xpRequired} from './progression.mjs';
import {skillGrade} from './engine.mjs';
import {effectiveProficiency} from './professions.mjs';
import {personName,personAge,personOccupation,personRelationships,personOffices,personView,groupView} from './entity-view.mjs';

// Project only the player's holdings and learned content, using the saved world.
export function personal(engine,document){
    const s=document.state,p=s.player??{},roles=s.professions??{};
    const professions={combat:roles.combat??'',life:roles.life??[],hidden:roles.hidden??[]};
    const reader={get:(...keys)=>keys.reduce((value,key)=>value?.[key],{state:{...s,professions}})};
    const name=(id,fallback='未知')=>engine.byId.get(id)?.name??fallback;
    const source=row=>{
        if(!row)return {type:'unknown',name:'来源未记录'};
        if(row.type==='legacy')return {type:'legacy',name:'旧档已学内容'};
        return {type:row.type??'unknown',name:row.id?name(row.id,'来源未识别'):'来源未记录',author:row.author??null,edition:row.edition??null};
    };
    const certified=new Set([professions.combat,...professions.life,...professions.hidden].filter(Boolean));
    const careers=[...certified].map(id=>{
        const definition=engine.byId.get(id)??{},career=s.careers?.[id]??{};
        return {id,name:name(id,'未识别职业'),kind:definition.kind??'unknown',certified:true,
            certification:career.certification?{teacher:name(career.certification.teacher,'导师未记录'),minute:career.certification.minute??null}:null,
            promotions:(career.promotions??[]).map(row=>({name:row.name,level:row.level,teacher:name(row.teacher,'导师未记录')})),
            nextPromotion:definition.promotions?.[(career.promotions??[]).length]?.level??null};
    });
    const maximum=engine.rules.practice.maximum,stageSize=engine.rules.practice.stageSize;
    const skills=Object.entries(s.skills??{}).map(([id,held])=>{
        const row=held??{},definition=engine.byId.get(id)??{},proficiency=row.proficiency??0;
        const stage=Math.floor(proficiency/stageSize),stageStart=stage*stageSize,stageEnd=Math.min(maximum,stageStart+stageSize-1);
        const careerRequired=Boolean(definition.profession),isCertified=!careerRequired||certified.has(definition.profession);
        const unlocked=(row.breakthroughs??[]).includes(stage+1),atLimit=proficiency===stageEnd;
        return {id,name:name(id,'未识别技能'),description:definition.description??'',attribute:definition.attribute??null,
            profession:careerRequired?name(definition.profession,'未识别职业'):null,certified:isCertified,
            proficiency,effectiveProficiency:effectiveProficiency(reader,engine,id),grade:skillGrade(proficiency),
            stageStart,stageEnd,maximum,dailyCap:engine.rules.practice.dailyCaps[stage]??null,
            needsBreakthrough:atLimit&&proficiency<maximum&&!unlocked,
            breakthroughHint:proficiency>=maximum?'已达技能上限':!isCertified?'相关职业未认证，有效熟练度上限299':unlocked?'本阶段突破已通过':atLimit?'需在场合格导师考核突破':'练习至阶段上限后可接受突破考核',
            source:source(row.source),learnedAt:row.learnedAt??null};
    });
    const spells=Object.entries(s.spells??{}).map(([id,held])=>{
        const row=held??{},definition=engine.byId.get(id)??{};
        return {id,name:name(id,'未识别法术'),skill:name(definition.skill,'关联技能未记录'),stage:definition.stage??null,
            mp:definition.mp??row.mp??null,duration:definition.duration??row.duration??null,minutes:definition.minutes??null,
            materials:(definition.materials??row.materials??[]).map(material=>typeof material==='string'?{name:name(material,material.startsWith('item_')?'未识别材料':material),quantity:null}:{name:name(material.item,'未识别材料'),quantity:material.amount??material.quantity??null}),
            effect:definition.effect??row.effect??'效果未记录',source:source(row.source),learnedAt:row.learnedAt??null};
    });
    const qualities=engine.rules.equipment.qualities;
    const inventory=Object.entries(s.inventory??{}).flatMap(([id,held])=>{
        const row=typeof held==='number'?{quantity:held}:held??{},quantity=row.quantity??0;
        if(quantity<=0)return [];
        const definition=engine.byId.get(id)??{},weight=definition.weight??row.weight??null;
        const details=unit=>{
            const quality=unit.quality??row.quality??definition.quality??'未知';
            return {quality,color:engine.rules.equipment.colors[qualities.indexOf(quality)]??null,
                durability:unit.durability??row.durability??definition.durability??null,maxDurability:unit.maxDurability??row.maxDurability??definition.durability??null,
                workmanship:unit.workmanship??null,maker:unit.maker==='player'?p.name??'本人':unit.makerName??null};
        };
        const instances=[...new Set(row.instances??[])].map(key=>s.itemInstances?.[key])
            .filter(unit=>unit?.owner==='player'&&unit.item===id&&unit.status==='持有').slice(0,quantity)
            .map(unit=>({id:unit.id,...details(unit)}));
        return [{id,name:name(id,'未识别物品'),quantity,weight,totalWeight:weight===null?null:weight*quantity,
            description:definition.use??'',...details(row),instances,untrackedQuantity:quantity-instances.length}];
    });
    const level=p.level??1,levelMaximum=engine.rules.levels.maximum;
    const identity={occupation:personOccupation(engine,s,'player').value,age:personAge(engine,s,'player').value,
        offices:personOffices(engine,s,'player').map(r=>({name:r.value.name,settlement:r.value.settlement})),
        relations:personRelationships(engine,s,'player').value.map(r=>({with:r.with,name:personName(engine,s,r.with).value??r.with,type:r.type})),
        positions:personView(engine,s,'player').organizations.filter(r=>r.value.source!=='household').map(r=>({org:r.value.id,name:groupView(engine,s,r.value.id)?.organization.value.name??r.value.id,position:r.value.position}))};
    return {minute:s.minute,player:{name:personName(engine,s,'player').value??'旅人',...identity,level,xp:p.xp??0,nextLevelXp:level<levelMaximum?xpRequired(level+1):null,
        levelMaximum,freeAttributePoints:p.freeAttributePoints??0,hp:p.hp??null,maxHp:p.maxHp??null,mp:p.mp??null,maxMp:p.maxMp??null,
        coins:p.coins??0,status:p.status??'未记录',attributes:Object.fromEntries(engine.rules.attributes.map(key=>[key,p.attributes?.[key]??null]))},
        professions:careers,skills,spells,inventory,
        load:{knownKg:inventory.reduce((sum,row)=>sum+(row.totalWeight??0),0),unknownStacks:inventory.filter(row=>row.weight===null).length}};
}

export function registerUIRoutes({post,readCampaign}){
    post('/ui/personal',async req=>{const {engine,document,reference}=await readCampaign(req);return {reference,...personal(engine,document)};});
}
