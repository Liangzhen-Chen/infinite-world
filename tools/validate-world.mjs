import fs from 'node:fs/promises';
import Ajv from 'ajv';
import {EntityResolver,normalize}from'../server-plugin/retrieval.mjs';
import {validateMagicCatalog}from'../server-plugin/magic.mjs';
import {validateObjectWorld}from'../server-plugin/magic-object.mjs';
import {validateWeatherRules}from'../server-plugin/weather.mjs';
import {validateAgricultureRules}from'../server-plugin/agriculture.mjs';
import {validateWildlife}from'../server-plugin/wildlife.mjs';
import {validateCreatureNature}from'../server-plugin/creature-nature.mjs';
import {validateTraits}from'../server-plugin/traits.mjs';
import {validateInteractionRules}from'../server-plugin/interactions.mjs';
import {validateFarmPests}from'../server-plugin/farm-pests.mjs';
import {validateBossEcology}from'../server-plugin/bosses.mjs';
import {validateBossCognition}from'../server-plugin/boss-cognition.mjs';
import {validateBossNegotiation}from'../server-plugin/boss-negotiation.mjs';
import {catalogMinimum,professionMinimum,populationMinimum}from'./catalog-progress.mjs';
import {worldLoreCategories,validateWorldLore}from'./w5-validation.mjs';
import {socialCategories,validateSocialWorld}from'./w5-social-validation.mjs';
import {validateNpcSchedules}from'../server-plugin/npc-schedule.mjs';
import {validateNpcGrowthRules}from'../server-plugin/npc-growth.mjs';
import {validateNpcLifeRules}from'../server-plugin/npc-life.mjs';
import {validateNpcProfiles,validateNpcDepth,findNpcRuleWording}from'./npc-profile-validation.mjs';
import {validatePopulation}from'./population-validation.mjs';
import {validateFestivalRuntime}from'../server-plugin/festival.mjs';
import {validateSites}from'../server-plugin/sites.mjs';
const schema=JSON.parse(await fs.readFile(new URL('../schemas/world.schema.json',import.meta.url),'utf8'));
const blocklist=JSON.parse(await fs.readFile(new URL('../world/meta/blocklist.json',import.meta.url),'utf8'));
const validate=new Ajv({allErrors:true,strict:true,allowUnionTypes:true}).compile(schema);
const categories=['npcs','residents','locations','items','professions','skills','spells','recipes','monsters','bosses',...worldLoreCategories,...socialCategories];
export function validateWorld(world,{stage='engine'}={}){
    if(!['engine','release','rules','final'].includes(stage))throw new Error(`未知构建阶段：${stage}`);
    const errors=[],warnings=[];
    if(!validate(world))for(const row of validate.errors)errors.push(`schema${row.instancePath}: ${row.message}`);
    if(errors.length)return {ok:false,errors,warnings};
    errors.push(...validateWeatherRules(world));
    errors.push(...validateAgricultureRules(world));
    errors.push(...validateWildlife(world));
    errors.push(...validateCreatureNature(world));
    errors.push(...validateTraits(world),...validateInteractionRules());
    errors.push(...validateFarmPests(world));
    errors.push(...validateBossEcology(world));
    const cognitionLocations=new Set(world.locations.map(location=>location.id));
    for(const boss of world.bosses??[])errors.push(...validateBossCognition(boss,cognitionLocations).map(error=>`${boss.id}:${error}`));
    const negotiationItems=new Set(world.items.map(item=>item.id));
    for(const boss of world.bosses??[])errors.push(...validateBossNegotiation(boss,negotiationItems).map(error=>`${boss.id}:${error}`));
    errors.push(...validateObjectWorld(world));
    errors.push(...validateSites(world));
    errors.push(...validateNpcSchedules(world));
    errors.push(...validateNpcGrowthRules(world));
    errors.push(...validateNpcLifeRules(world));
    errors.push(...validateFestivalRuntime(world));
    errors.push(...validateNpcProfiles(world));
    if(stage==='release'||stage==='final'){
        const depth=validateNpcDepth(world);
        errors.push(...depth.errors.map(error=>`完整人物深度：${error}`));
        for(const npc of world.npcs.filter(n=>n.tier==='full'))for(const issue of findNpcRuleWording(npc)){
            const error=`完整人物深度：${issue.id}/${issue.field}: ${issue.reason}`;if(!errors.includes(error))errors.push(error);
        }
    }
    errors.push(...validatePopulation(world));
    const entities=categories.flatMap(key=>world[key]??[]),ids=new Map(),names=new Map();
    for(const row of entities){
        if(ids.has(row.id))errors.push(`重复编号：${row.id}`);ids.set(row.id,row);
        for(const name of [row.name,...row.aliases??[]]){
            const blocked=[...blocklist.names,...blocklist.realPeople].find(word=>normalize(name).includes(normalize(word)));
            if(blocked)errors.push(`名称触及屏蔽表：${row.id}/${blocked}`);
            const key=`${row.scope??'global'}:${normalize(name)}`,previous=names.get(key);
            // A spell and the skill bearing it deliberately share a display name.
            const sameSpellSkill=previous&&[row.id,previous].some(id=>id.startsWith('spell_'))&&[row.id,previous].some(id=>id.startsWith('skill_'));
            const sameBody=previous&&(row.actor===previous||ids.get(previous)?.actor===row.id);
            if(previous&&previous!==row.id&&!sameSpellSkill&&!sameBody)errors.push(`同范围称呼冲突：${name}/${previous}/${row.id}`);names.set(key,row.id);
        }
    }
    const reference=(value,label)=>{if(value&&value!=='player'&&!ids.has(value))errors.push(`引用不存在：${label} -> ${value}`);};
    const loreCheck=validateWorldLore(world,{reference,blocked:[...blocklist.names,...blocklist.realPeople]});
    errors.push(...loreCheck.errors);warnings.push(...loreCheck.warnings);
    errors.push(...validateSocialWorld(world,{reference,blocked:[...blocklist.names,...blocklist.realPeople]}));
    const jurisdictions=new Set(),lawIds=new Set();
    for(const code of world.rules.law?.codes??[]){
        if(lawIds.has(code.id))errors.push(`法典编号重复：${code.id}`);lawIds.add(code.id);
        if(!code.locations.includes(code.court))errors.push(`法院不在该法典辖区：${code.id}`);
        for(const location of code.locations){
            reference(location,`${code.id}.locations`);
            if(!/^(loc|bld|site)_/.test(location))errors.push(`法典辖区不是地点：${location}`);
            if(jurisdictions.has(location))errors.push(`法典辖区重叠：${location}`);jurisdictions.add(location);
        }
        reference(code.court,`${code.id}.court`);
        for(const actor of [...code.officers,...code.judges]){
            reference(actor,`${code.id}.authority`);
            if((ids.get(actor)?.age??0)<18)errors.push(`执法审判人员必须成年：${actor}`);
        }
    }
    if(world.rules.petCare){
        const r=world.rules.petCare;
        reference(r.tamingSkill,'petCare.tamingSkill');reference(r.medicineSkill,'petCare.medicineSkill');reference(r.treatmentItem,'petCare.treatmentItem');
        if(r.contactsPerDay!==1)errors.push('当前接触实现每天一次，规则不能声明其他次数');
        for(const key of['hungerPerHour','restPerHour','hungryThreshold','sickThreshold','loyaltyLoss','escapeLoyalty','contactTrust','groomLoyalty','maximumRideFatigue'])if(r[key]>100)errors.push(`宠物百分制数值超过100：${key}`);
        if(r.sickThreshold<r.hungryThreshold)errors.push('宠物患病阈值不能低于饥饿阈值');
    }
    for(const row of [...world.monsters??[],...world.bosses??[]])if(row.tamingRule){
        const r=row.tamingRule;
        if(row.tier&&!r.bossCondition)errors.push(`首领缺少特殊驯服条件编号：${row.id}`);
        if(!row.tier&&row.taming?.possible===false)errors.push(`不可驯服物种不应有驯服处理规则：${row.id}`);
        if(r.rideable&&r.category!=='mount')errors.push(`可骑乘动物必须占坐骑名额：${row.id}`);
        if(r.rideable&&r.carryKg<r.riderWeightKg)errors.push(`坐骑载荷小于骑者重量：${row.id}`);
        for(const food of r.food)reference(food.item,`${row.id}.tamingRule.food`);
        if(new Set(r.food.map(food=>food.item)).size!==r.food.length)errors.push(`动物食物目录重复：${row.id}`);
    }
    for(const location of world.rules.levels.initial?.openBirthplaces??[])reference(location,'rules.levels.initial.openBirthplaces');
    const revivalLocations=new Set();
    for(const point of world.rules.death?.points??[]){
        reference(point.location,'rules.death.points.location');reference(point.settlement,'rules.death.points.settlement');
        if(revivalLocations.has(point.location))errors.push(`复活点重复：${point.location}`);revivalLocations.add(point.location);
        if(ids.get(point.location)?.parent!==point.settlement)errors.push(`复活点不属于登记聚落：${point.location}`);
    }
    if(world.rules.death?.points)for(const birthplace of world.rules.levels.initial?.openBirthplaces??[])if(!world.rules.death.points.some(point=>point.settlement===birthplace&&point.minimumLevel===0))errors.push(`起始村缺少新手可登记复活点：${birthplace}`);
    for(const npc of world.npcs){
        reference(npc.location,`${npc.id}.location`);
        if(npc.flags.minor!==(npc.age<18)||npc.age<18&&npc.flags.romanceable)errors.push(`年龄与未成年标记冲突：${npc.id}`);
        for(const item of Object.keys(npc.inventory))reference(item,`${npc.id}.inventory`);
        for(const value of Array.isArray(npc.skills)?npc.skills:Object.keys(npc.skills??{}))reference(value,`${npc.id}.service/skill`);
        for(const value of npc.services??[])if(!['trade','teach'].includes(value))reference(value,`${npc.id}.service/skill`);
    }
    for(const row of world.locations)reference(row.parent,`${row.id}.parent`);
    const features=new Map();
    for(const location of world.locations)for(const row of location.features??[]){
        if(features.has(row.id)||ids.has(row.id))errors.push(`环境对象编号重复：${row.id}`);features.set(row.id,{...row,location:location.id});
        reference(row.owner,`${row.id}.owner`);
        for(const name of[row.name,...row.aliases??[]]){
            const key=`${location.id}:${normalize(name)}`;
            if(names.has(key)&&names.get(key)!==row.id)errors.push(`同场景环境称呼冲突：${name}`);names.set(key,row.id);
            if([...blocklist.names,...blocklist.realPeople].some(word=>normalize(name).includes(normalize(word))))errors.push(`环境名称触及屏蔽表：${row.id}`);
        }
        const s=row.state;
        if(['water','container','soil'].includes(row.kind)){
            if(['capacityMl','waterMl','turbidity','saltMg','toxinUg','pathogenRisk','odor'].some(field=>s[field]===undefined))errors.push(`水环境字段缺失：${row.id}`);
            if(s.waterMl>s.capacityMl||s.capacityMl<=0)errors.push(`水量与容量不符：${row.id}`);
            if(!s.waterMl&&(s.saltMg||s.toxinUg))errors.push(`空容器存在未定义污染负荷：${row.id}`);
        }
        if(row.kind==='channel'){
            if(['siltGrams','loosenedSiltGrams','initialSiltGrams','initialBlockagePercent','blockagePercent','flowLimitMl'].some(field=>s[field]===undefined)||s.loosenedSiltGrams>s.siltGrams)errors.push(`沟渠状态无效：${row.id}`);
            if(!row.links?.source||!row.links?.destination)errors.push(`沟渠缺少连通源头与田垄：${row.id}`);
        }
        if(row.kind==='soil'&&['baseMoisturePercent','moisturePercent','worked'].some(field=>s[field]===undefined))errors.push(`土壤状态缺失：${row.id}`);
        if(row.kind==='silt_heap'&&s.siltGrams===undefined)errors.push(`堆泥地状态缺失：${row.id}`);
    }
    const routeIds=new Set((world.routes??[]).map(route=>route.id));
    for(const row of features.values())for(const pair of row.fireLinks??[])for(const id of pair)if(features.get(id)?.location!==row.location||!features.get(id)?.thermalModel)errors.push(`房间火势连接缺少同地燃物：${row.id}`);
    for(const row of features.values())for(const[field,value]of Object.entries(row.links??{}))for(const id of Array.isArray(value)?value:[value]){
        // A road segment links to the travel route it slows, not to a scene object.
        if(field==='route'){if(!routeIds.has(id))errors.push(`环境连通路线不存在：${row.id}.route`);continue;}
        const other=features.get(id);if(!other)errors.push(`环境连通引用不存在：${row.id}.${field}`);
        else if(other.location!==row.location)errors.push(`本地沟渠跨场景连通未定义：${row.id}`);
        else if(field==='source'&&other.kind!=='water'||field==='destination'&&other.kind!=='soil'||field==='channel'&&other.kind!=='channel')errors.push(`环境连通类型不符：${row.id}.${field}`);
    }
    for(const row of features.values())if(row.kind==='channel'&&features.get(row.links?.destination)?.links?.channel!==row.id)errors.push(`沟渠与田垄连通不对称：${row.id}`);
    const stations=new Set();
    for(const location of world.locations)for(const station of location.workstations??[]){
        reference(station.owner,`${station.id}.owner`);
        if(stations.has(station.id))errors.push(`工作台编号重复：${station.id}`);stations.add(station.id);
    }
    const promotionIds=new Set();
    for(const row of world.professions){
        for(const value of row.skillTree??[])reference(value,`${row.id}.skillTree`);
        if(row.entry){reference(row.entry.skill,`${row.id}.entry.skill`);reference(row.entry.location,`${row.id}.entry.location`);}
        for(const value of [...row.upstream??[],...row.downstream??[]])reference(value,`${row.id}.industry`);
        if(row.promotions){
            if(JSON.stringify(row.promotions.map(step=>step.level))!==JSON.stringify([30,60,90,120,150,180]))errors.push(`升职级数缺失或重复：${row.id}`);
            for(const step of row.promotions)for(const choice of step.choices){
                reference(choice.requiredSkill,`${row.id}.promotion`);
                if(promotionIds.has(choice.id))errors.push(`升职方向编号重复：${choice.id}`);promotionIds.add(choice.id);
            }
        }
    }
    // U4 career data: variant routes, entry tasks and ultimates per profession.
    for(const [role,career]of Object.entries(world.careers??{})){
        reference(role,'careers');if(career.ultimate)reference(career.ultimate.skill,`${role}.ultimate`);
        for(const step of career.variants??[])for(const choice of step){
            reference(choice.requiredSkill,`${role}.variant`);
            if(promotionIds.has(choice.id))errors.push(`升职方向编号重复：${choice.id}`);promotionIds.add(choice.id);
        }
    }
    const checkPrerequisites=row=>{for(const requirement of row.prerequisites??[])reference(typeof requirement==='string'?requirement:requirement.skill,`${row.id}.prerequisite`);};
    for(const row of world.skills){reference(row.profession,`${row.id}.profession`);for(const role of row.learningProfessions??[])reference(role,`${row.id}.learningProfessions`);checkPrerequisites(row);}
    for(const item of world.items)if(item.checkBonus){
        for(const skill of item.checkBonus.skills??[])reference(skill,`${item.id}.checkBonus.skill`);
        for(const attribute of item.checkBonus.attributes??[])if(!world.rules.attributes.includes(attribute))errors.push(`工具检定属性非法：${item.id}/${attribute}`);
    }
    for(const row of world.items)if(row.book){
        for(const entity of row.book.teaches)reference(entity,`${row.id}.book.teaches`);
        reference(row.book.origin,`${row.id}.book.origin`);checkPrerequisites({...row.book,id:row.id});
        if(row.book.author.startsWith('npc_'))reference(row.book.author,`${row.id}.book.author`);
    }
    for(const row of [...world.spells,...world.recipes]){
        checkPrerequisites(row);
        reference(row.skill,`${row.id}.skill`);
        for(const material of [...row.materials,...row.byproducts??[]])reference(material.item,`${row.id}.material/byproduct`);
        for(const id of [...row.teachers??[],...row.tools??[]])reference(id,`${row.id}.source/tool`);
        if(row.output)reference(row.output.item,`${row.id}.output`);
    }
    for(const row of world.spells)if(world.rules.magic){
        for(const error of validateMagicCatalog(row,{requireHandler:stage!=='engine'}))errors.push(`法术处理器不完整：${row.id} ${error}`);
        const band=world.rules.magic.stageMpRanges[row.stage];
        if(!band||row.mp<band[0]||row.mp>band[1])errors.push(`法术消耗与阶段冲突：${row.id}`);
        if(row.school&&!world.rules.magic.schools.includes(row.school))errors.push(`法术门类不在规则表：${row.id}`);
    }
    for(const row of world.monsters??[])for(const drop of row.drops)reference(drop.item,`${row.id}.drop`);
    for(const row of world.bosses??[]){reference(row.monster,`${row.id}.monster`);reference(row.lair,`${row.id}.lair`);for(const drop of row.drops)reference(drop.item,`${row.id}.drop`);}
    const connected=new Set(world.locations.length?[world.locations[0].id]:[]);
    for(const route of world.routes){reference(route.from,route.id);reference(route.to,route.id);}
    for(let changed=true;changed;){changed=false;for(const route of world.routes){
        if(connected.has(route.from)&&!connected.has(route.to)){connected.add(route.to);changed=true;}
        if(connected.has(route.to)&&!connected.has(route.from)){connected.add(route.from);changed=true;}
    }}
    for(const location of world.locations)if(!connected.has(location.id))errors.push(`路线图孤立：${location.id}`);
    for(const item of world.items)if(!world.rules.equipment.qualities.includes(item.quality))errors.push(`品质不在规则表：${item.id}`);
    for(const skill of world.skills)if(!world.rules.attributes.includes(skill.attribute))errors.push(`技能属性非法：${skill.id}`);
    for(const row of world.recipes){
        if(row.workstation&&!world.locations.some(location=>location.workstations?.some(station=>station.kind===row.workstation)&&(!row.location||row.location===location.id)))errors.push(`配方缺少可用工作台：${row.id}`);
        if(row.materials.some(material=>row.tools.includes(material.item)))errors.push(`配方耗材与工具重叠：${row.id}`);
        if(new Set([row.output.item,...(row.byproducts??[]).map(product=>product.item)]).size!==1+(row.byproducts??[]).length)errors.push(`主副产品重复：${row.id}`);
        const cost=row.materials.reduce((sum,m)=>sum+(ids.get(m.item)?.basePrice??0)*m.amount,0),value=(ids.get(row.output.item)?.basePrice??0)*row.output.quantity;
        if(value<cost)errors.push(`配方售价低于材料：${row.id} ${value}<${cost}`);
    }
    const repairIds=new Set();
    for(const row of world.rules.repairs??[]){
        if(repairIds.has(row.id))errors.push(`重复维修编号：${row.id}`);repairIds.add(row.id);
        reference(row.item,`${row.id}.item`);reference(row.skill,`${row.id}.skill`);
        for(const tool of row.tools)reference(tool,`${row.id}.tool`);
        for(const material of row.materials)reference(material.item,`${row.id}.material`);
        if(row.attribute&&!world.rules.attributes.includes(row.attribute))errors.push(`维修属性非法：${row.id}`);
        if(!world.locations.some(location=>location.workstations?.some(station=>station.kind===row.workstation)))errors.push(`维修缺少可用工作台：${row.id}`);
        if(row.tools.includes(row.item)||row.materials.some(material=>material.item===row.item||row.tools.includes(material.item)))errors.push(`维修对象、工具或耗材重叠：${row.id}`);
        if((ids.get(row.item)?.durability??0)<=row.maxLoss)errors.push(`维修损耗不留可恢复空间：${row.id}`);
    }
    if(stage==='rules'||stage==='final'){
        const full=world.npcs.filter(row=>row.tier==='full').length;
        if(full<populationMinimum.full)errors.push(`目录数量不足：npcs.full ${full}<${populationMinimum.full}`);
        if((world.residents?.length??0)<populationMinimum.residents)errors.push(`目录数量不足：residents ${world.residents?.length??0}<${populationMinimum.residents}`);
        for(const [key,count]of Object.entries(catalogMinimum))if((world[key]?.length??0)<count)errors.push(`目录数量不足：${key} ${world[key]?.length??0}<${count}`);
        for(const [kind,count]of Object.entries(professionMinimum))if(world.professions.filter(row=>row.kind===kind).length<count)errors.push(`职业数量不足：${kind}`);
        for(const row of world.professions.filter(row=>row.kind==='combat'))if((row.skillTree??[]).length<15)errors.push(`技能树不足15项：${row.id}`);
    }
    try{new EntityResolver(entities);}catch(error){errors.push(error.message);}
    return {ok:!errors.length,errors,warnings,counts:Object.fromEntries(categories.map(key=>[key,world[key]?.length??0]))};
}
