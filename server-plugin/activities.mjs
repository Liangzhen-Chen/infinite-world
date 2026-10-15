import {derivedStats,monsterStats,strike,combatRandom}from'./combat.mjs';
import {careerEquipment,effectiveProficiency}from'./professions.mjs';
import {magicStatusStats,withMagicStats,consumeTransientMagic}from'./magic-status.mjs';
import{visibilityPenalty}from'./magic-context.mjs';
import{applyBossCounterAbility}from'./boss-abilities.mjs';
import {consumeMagicProtection}from'./magic-primitives.mjs';
import {projectileAirPenalty}from'./magic-air.mjs';
import {waterEarthMudPenalty,assertWaterEarthMovement}from'./magic-water-earth.mjs';
import {assertLightMovement}from'./magic-light.mjs';
import {milestone,monsterReward}from'./progression.mjs';
import {manufacture,registerRecipe}from'./manufacturing.mjs';
import {repair}from'./repair.mjs';
import {interactEnvironment,recordLocalContact}from'./environment.mjs';
import {petAction}from'./pets.mjs';
import {summonAction}from'./summons.mjs';
import {crimeAction,lawAction,recordViolence}from'./law.mjs';
import {transferItems,heldUnit,wearItem}from'./items.mjs';
import {localWeather}from'./weather.mjs';
import {agricultureAction}from'./agriculture.mjs';
import {wildlifeAction,resolveCreature,recordWildlifeDeath}from'./wildlife.mjs';
import {lairAction,bossCounter,rememberBossTactic,defeatBoss}from'./bosses.mjs';
import {civicAction,recordDonationContribution,publicProjectApproval,donationReceipt,saveDonationReceipt}from'./civic.mjs';
import {governanceAction,assertGovernedProject,playerOffices}from'./governance.mjs';
import {startPublicProject,abortPublicProject,startHouse}from'./public-projects.mjs';
import {titleAction}from'./titles.mjs';
import {militaryAction}from'./military.mjs';
import {warAction,warCombatResult}from'./war-diplomacy.mjs';
import {notableAction}from'./notables.mjs';
import {promotionAction}from'./promotion.mjs';
import {questBoardAction}from'./quest-board.mjs';
import {businessAction}from'./business.mjs';
import {festivalAction}from'./festival.mjs';
import {factionClockAction}from'./faction-clock.mjs';
import {isHazardClock,hazardClockAction}from'./seasonal-hazards.mjs';
import {siteAction}from'./sites.mjs';
import {organizationAction,foundOrganization}from'./organizations.mjs';
import {workAction,isWorkOperation}from'./works.mjs';
const integer=(value,min=0,max=1e9)=>{if(!Number.isSafeInteger(value)||value<min||value>max)throw new Error(`数值需在${min}到${max}之间`);return value;};
const requiredText=value=>{if(typeof value!=='string'||!value.trim()||value.length>1200)throw new Error('记录文字无效');return value.trim();};
export const activities={
    site(d,args,id){return siteAction.call(this,d,args,id);},
    lair(d,args,id){return lairAction.call(this,d,args,id);},
    wildlife(d,args,id){return wildlifeAction.call(this,d,args,id);},
    farm(d,args,id){
        const old=donationReceipt(d,this,args,id);if(old)return old;
        const result=agricultureAction.call(this,d,args,id),contribution=recordDonationContribution(d,this,result,id),receipt={...result,...(contribution?{contribution}:{})};
        saveDonationReceipt(d,receipt,id);return receipt;
    },
    weather(d,args){
        if(args.operation&&args.operation!=='inspect')throw new Error('天气只允许观察，不能由模型直接改天');
        if(args.location&&this.resolve(args.location)!==d.get('state','location'))throw new Error('只能观察本人所在地天气，不远程得知异地情况');
        const row=localWeather(this,d.document);
        return{available:Boolean(row),weather:row,calendar:this.calendar(d.get('state','minute')),actionScope:{kind:'instant',note:'观察天气不推进时间，不操纵天气。'}};
    },
    crime(d,args,id){return crimeAction.call(this,d,args,id);},
    law(d,args,id){return lawAction.call(this,d,args,id);},
    summon(d,args,id){return summonAction.call(this,d,args,id);},
    pet(d,args,id){return petAction.call(this,d,args,id);},
    environment(d,args,id){return interactEnvironment.call(this,d,args,id);},
    combat(d,args,id){
        const target=resolveCreature(this,d,args.target),isNpc=target.startsWith('npc_'),partition=isNpc?'npcs':'creatures',npc=d.get('state',partition,target),base=this.byId.get(npc?.boss??target),isBoss=Boolean(npc?.boss);
        if(!isNpc&&!['monster_','boss_'].some(prefix=>target.startsWith(prefix)))throw new Error('这个实体不是交锋对象');
        if(!npc||npc.location!==d.get('state','location'))throw new Error('对手不在场');
        if(npc.status==='死亡')throw new Error('对手已经死亡');
        const weapon=args.weapon?this.resolve(args.weapon,'item'):null;
        if(weapon&&this.quantity(d,'player',weapon)<1)throw new Error('没有这件武器');
        if(weapon){const held=heldUnit(d,this,'player',weapon),definition=this.byId.get(weapon);
            if(held.durability<=0)throw new Error('武器已损坏，需要修理');
            const gate=this.rules.equipment.requiredLevels[this.rules.equipment.qualities.indexOf(held.quality??definition.quality)];
            if(d.get('state','player','level')<gate)throw new Error(`这件装备需要${gate}级`);
        }
        const p=d.get('state','player'),level=npc.level??base.level??base.levelRange?.[0]??1;
        const opponentBase=isNpc&&!isBoss?derivedStats({level,attributes:base.attributes,profession:Boolean(base.combatProfession)},this.rules)
            :monsterStats({level,template:base.template??this.byId.get(base.monster)?.template??2,bossTier:base.tier??0},this.rules);
        const opponentContext=this.magicStatusContext(d,target),opponent=withMagicStats(opponentBase,magicStatusStats(d,target,opponentContext));
        opponent.evasion=Math.max(0,opponent.evasion-waterEarthMudPenalty(d,this,target)*.05);
        if(opponent.divine&&!d.get('state','divinePermissions',target))throw new Error('神性屏障阻止普通攻击，需要交涉、逃离或取得特殊条件');
        const rawWeaponStats=weapon?this.byId.get(weapon).combat??{}:{},held=weapon?heldUnit(d,this,'player',weapon):null;
        const workmanshipFactor=this.rules.equipment.workmanship?.find(row=>row.name===held?.workmanship)?.multiplier??1;
        const weaponStats=Object.fromEntries(Object.entries(rawWeaponStats).map(([key,value])=>[key,value*workmanshipFactor])),careerStats=careerEquipment(d.get('state'));
        const equipment=Object.fromEntries([...new Set([...Object.keys(weaponStats),...Object.keys(careerStats)])].map(key=>[key,(weaponStats[key]??0)+(careerStats[key]??0)]));
        const playerBase=derivedStats({level:p.level,attributes:p.attributes,profession:Boolean(d.get('state','professions','combat')),equipment},this.rules),playerContext=this.magicStatusContext(d,'player');
        playerContext.moving=['flee','shove'].includes(args.intent);
        const stats=withMagicStats(playerBase,magicStatusStats(d,'player',playerContext));
        stats.evasion=Math.max(0,stats.evasion-waterEarthMudPenalty(d,this)*.05);
        const maxHp=npc.maxHp??opponent.maxHp,hp=npc.hp??maxHp,rng=combatRandom(d.document,id),intent=args.intent??'attack';
        if(!['attack','defend','flee','shove'].includes(intent))throw new Error('交锋意图需为attack、defend、flee或shove');
        if(intent==='flee')assertWaterEarthMovement(d);
        if(intent==='flee')assertLightMovement(d,this);
        const tactic=intent==='attack'?(weapon?'armed':'unarmed'):intent,counter=bossCounter(d,this,target,tactic);
        const location=this.byId.get(d.get('state','location')),terrain=location.combatTags??[];
        const weather=localWeather(this,d.document),night=weather&&!weather.indoors&&!weather.daylight&&!terrain.includes('dark')&&playerContext.illumination!=='lit'?this.rules.combat.terrain.dark.hit:0;
        const hitModifier=terrain.reduce((sum,tag)=>sum+(tag==='dark'&&playerContext.illumination==='lit'?0:this.rules.combat.terrain[tag]?.hit??0),0)+(weather?.hitModifier??0)+night;
        const playerHit=visibilityPenalty(hitModifier,magicStatusStats(d,'player',playerContext),playerContext);
        const arrowPenalty=projectileAirPenalty(d,target,intent==='attack'?this.byId.get(weapon)?.projectileMg:undefined);
        const attack=intent==='flee'?{damage:0,hit:false}:strike(stats,opponent,rng,this.rules,{hitModifier:(intent==='shove'?playerHit-(1-counter.damageMultiplier):playerHit)+arrowPenalty,damageMultiplier:(intent==='defend'?0.65:intent==='shove'?0:1)*counter.damageMultiplier});
        if(attack.hit)recordLocalContact(d,this,target,id);
        if(intent!=='flee')consumeTransientMagic(d,'player',playerContext);
        const protection=consumeMagicProtection(d,target,intent==='shove'?(attack.hit?1:0):attack.damage,'physical');
        const damage=protection.damage,remaining=Math.max(0,hp-damage);
        let escaped=false;if(intent==='flee')escaped=this.check(d,{attribute:'敏捷',difficulty:counter.escapeDifficulty??15},`${id}_escape`).success;
        let received=0,absorbed=0;const bossAbilities=[];for(let i=0;i<(opponent.attacks??1);i++)if(remaining>0&&!escaped&&received<p.hp){
            const currentOpponent=withMagicStats(opponentBase,magicStatusStats(d,target,opponentContext)),currentPlayer=withMagicStats(playerBase,magicStatusStats(d,'player',playerContext));
            currentPlayer.evasion=Math.max(0,currentPlayer.evasion-waterEarthMudPenalty(d,this)*.05);
            const opponentDark=opponentContext.illumination==='lit'?0:terrain.includes('dark')||night?this.rules.combat.terrain.dark.hit:0;
            const opponentHit=visibilityPenalty(hitModifier-(playerContext.illumination==='lit'?0:terrain.includes('dark')||night?this.rules.combat.terrain.dark.hit:0)+opponentDark,magicStatusStats(d,target,opponentContext),opponentContext);
            const hit=strike(currentOpponent,currentPlayer,rng,this.rules,{hitModifier:opponentHit+projectileAirPenalty(d,'player',base.projectileMg),damageMultiplier:intent==='defend'?0.5:1});
            if(hit.hit)recordLocalContact(d,this,target,id);
            consumeTransientMagic(d,target,opponentContext);
            const ability=isNpc&&!isBoss?null:applyBossCounterAbility(d,this,target,{eventId:id,attackIndex:i,hit:hit.hit,defense:currentPlayer.defense,remainingHp:remaining});
            if(ability)bossAbilities.push(ability);
            const abilityDamage=ability?.damage!==undefined?Math.max(0,Math.round(ability.damage*(intent==='defend'?.5:1))):hit.damage;
            const protectedHit=consumeMagicProtection(d,'player',abilityDamage,ability?.damageType??'physical');received+=protectedHit.damage;absorbed+=protectedHit.absorbed;
        }
        d.set(['state',partition,target,'hp'],remaining);d.set(['state',partition,target,'maxHp'],maxHp);
        if(!remaining)d.set(['state',partition,target,'status'],'死亡');
        else if(remaining<maxHp*0.25)d.set(['state',partition,target,'activity'],'退让并呼救');
        if(!isNpc||isBoss)rememberBossTactic(d,this,target,tactic,id);
        if(received)this.health(d,{delta:-received},id);
        const seconds=(d.get('state','subMinuteSeconds')??0)+this.rules.combat.exchangeSeconds;
        this.advance(d,Math.floor(seconds/60),id);d.set(['state','subMinuteSeconds'],seconds%60);
        if(isNpc&&base.tier!=='full')d.set(['state','npcs',target,'trust'],Math.max(-100,npc.trust-5));
        if(weapon)wearItem(d,this,'player',weapon,1);
        if(intent==='shove')d.set(['state',partition,target,'developments'],[...npc.developments??[],{type:'被推搡',source:id,minute:d.get('state','minute'),reaction:remaining<maxHp*0.25?'呼救':'还手'}]);
        if(escaped){
            d.set(['state','combatDisengaged',target],{minute:d.get('state','minute'),source:id});
            if(d.get('state','records',`local_actor_position:${target}`))d.remove(['state','records',`local_actor_position:${target}`]);
        }
        const corpse=!isNpc&&!remaining?recordWildlifeDeath(d,this,target,id):null;
        const lair=!remaining?defeatBoss(d,this,target,id):null;
        const experience=!isNpc&&!remaining?monsterReward(d,this,target,id):{experience:0};
        const incident=isNpc?recordViolence(d,this,{victim:target,damage,killed:!remaining,intent,eventId:id}):null;
        for(let i=0;i<bossAbilities.length;i++)if(bossAbilities[i].pendingArea){
            const {catalog,id:areaId,source}=bossAbilities[i].pendingArea;
            bossAbilities[i]={ability:bossAbilities[i].ability,...this.applyMagicArea(d,catalog,{target:source},areaId,source)};
        }
        const war=warCombatResult(d,this,{target,damage,received,killed:!remaining,retreated:remaining>0&&remaining<maxHp*0.25},id);
        d.say(`交锋结束，对方受伤${damage}，你受伤${received}`);return {target,damage,received,...(war?{war}:{}),...(bossAbilities.length?{abilities:bossAbilities}:{}),...(protection.absorbed||absorbed?{absorption:{target:protection.absorbed,player:absorbed}}:{}),targetHp:d.get('state',partition,target,'hp'),actionScope:{kind:'combat_exchange',clockManaged:true,seconds:this.rules.combat.exchangeSeconds},...experience,...(corpse?{corpse}:{}),...(lair?{lair}:{}),...(counter.adapted?{adaptation:{tactic,guarded:true,note:'对手对已见过的进攻加强防备'}}:{}),...(counter.nature?{affinity:{...counter.nature,note:counter.nature.effect==='weak'?'此种对这类进攻格外怕':'此种对这类进攻抗性高，伤害减半'}}:{}),morale:remaining<maxHp*0.25?'撤退':'交战',...(weather?{weather:{name:weather.name,daylight:weather.daylight,hitModifier:weather.hitModifier,nightModifier:night}}:{}),...(incident?{case:incident}:{})};
    },
    craft(d,args,id){
        if(args.operation==='repair')return repair.call(this,d,args,id);
        if(args.operation!==undefined&&args.operation!=='manufacture')throw new Error('制造操作需为manufacture或repair');
        return manufacture.call(this,d,args,id);
    },
    research(d,args,id){
        if(isWorkOperation(args.operation))return workAction.call(this,d,args,id);
        if(args.operation==='start'){
            const skills=(args.skills??[]).map(name=>this.resolve(name,'skill'));if(!skills.length)throw new Error('研究缺少相关知识');
            if(skills.some(skill=>!d.get('state','skills',skill)))throw new Error('没有掌握相关技能');
            const key=`research_${id}`;d.set(['state','projects',key],{id:key,type:'研究',name:requiredText(args.name),concept:requiredText(args.concept),skills,stage:'构想',progress:0,investment:0,days:[],result:null});
            return {project:key,stage:'构想'};
        }
        const key=args.project,project=d.get('state','projects',key);if(!project||project.type!=='研究')throw new Error('没有这个研究项目');
        const cost=integer(args.coins??5,1,1000),minutes=integer(args.minutes??120,30,480);
        if(d.get('state','player','coins')<cost)throw new Error('研究资金不足');
        d.set(['state','player','coins'],d.get('state','player','coins')-cost);this.advance(d,minutes,id);
        const outcome=this.check(d,{attribute:'智力',skill:project.skills[0],difficulty:20},id);
        const progress=project.progress+(outcome.success?1:0),days=[...new Set([...project.days,Math.floor(d.get('state','minute')/1440)])];
        const maximum=Math.max(...project.skills.map(skill=>effectiveProficiency(d,this,skill)));
        const stage=progress>=3&&days.length>=3&&maximum>=300?'打磨':progress>=1?'原型':'构想';
        d.set(['state','projects',key],{...project,progress,days,investment:project.investment+cost,stage});
        if(stage==='打磨'&&project.stage!=='打磨')Object.assign(outcome,milestone(d,this,'research',[...project.skills].sort().join('+'),id));
        return {project:key,stage,...outcome,note:stage==='打磨'?'研究成果需进入受限实体登记，才能获得规则认可':'原型未被系统承认，不能宣称已学会新法术'};
    },
    settlement(d,args,id){
        if(args.operation?.startsWith('faction_'))return (isHazardClock(this,args.clock)?hazardClockAction:factionClockAction).call(this,d,args,id);
        if(args.operation?.startsWith('festival_'))return festivalAction.call(this,d,args,id);
        if(args.operation?.startsWith('business_'))return businessAction.call(this,d,args,id);
        if(args.operation?.startsWith('civic_'))return civicAction.call(this,d,args,id);
        if(args.operation?.startsWith('governance_'))return governanceAction.call(this,d,args,id);
        if(args.operation?.startsWith('org_'))return organizationAction.call(this,d,args,id);
        if(args.operation?.startsWith('title_'))return titleAction.call(this,d,args,id);
        if(args.operation==='diplomacy'||args.operation?.startsWith('war_'))return warAction.call(this,d,args,id);
        if(args.operation?.startsWith('army_'))return militaryAction.call(this,d,args,id);
        if(args.operation?.startsWith('notable_'))return notableAction.call(this,d,args,id);
        if(args.operation?.startsWith('promotion_'))return promotionAction.call(this,d,args,id);
        const settlement=this.resolve(args.settlement,'loc'),row=d.get('state','settlements',settlement);
        if(!row)throw new Error('没有该聚落公共账目');
        // T125: a sitting official's own power replaces a delegated authorization.
        if(args.operation==='project_abort')return abortPublicProject(d,this,args);
        if(args.operation==='start_project'&&d.get('state','records',args.authorization)?.category==='housing_permit')return startHouse(d,this,args,id,args.authorization);
        if(args.operation==='start_project'&&!args.authorization&&playerOffices(d.get('state'),{settlement,power:'public_project'}).length)return startPublicProject(d,this,args,id,settlement);
        const authorization=d.get('state','records',args.authorization);
        if(!authorization||authorization.category!=='authorization'||authorization.settlement!==settlement)throw new Error('公共物资需要已成立的授权');
        if(args.operation==='start_project'){
            assertGovernedProject(d,this,settlement,args);
            if(authorization.revoked||authorization.expires!==undefined&&authorization.expires<=d.get('state','minute'))throw new Error('公共工程授权已撤销或到期');
            const wood=integer(args.wood,1,10000),stone=integer(args.stone??0,0,10000),days=integer(args.days,1,365);
            if(row.wood<wood||row.stone<stone)throw new Error('公共工程材料不足');
            d.set(['state','settlements',settlement,'wood'],row.wood-wood);d.set(['state','settlements',settlement,'stone'],row.stone-stone);
            const civicApproval=publicProjectApproval(d,this,settlement,args.authorization,args.beneficiaries);
            const project=`project_${id}`;d.set(['state','projects',project],{id:project,type:'工程',creator:'player',name:requiredText(args.name),settlement,remainingDays:days,wood,stone,status:'施工中',beneficiaries:args.beneficiaries??[],sourceEvent:id,...(civicApproval?{civicApproval}:{})});
            return {project};
        }
        throw new Error('未知聚落事务');
    },
    quest(d,args,id){return questBoardAction(d,this,args,id);},
    create(d,args,id){
        const type=args.type,name=requiredText(args.name);
        if(!['npc','bld','org','item','skill','spell','recipe'].includes(type))throw new Error('实体类型无效');
        try{this.resolve(name);throw new Error('名称已存在，请沿用现有编号');}catch(error){if(!error.message.includes('未登记'))throw error;}
        let entity={id:`${type}_created_${id.replace(/[^a-zA-Z0-9_-]/g,'_')}`,name,aliases:[],scope:d.get('state','location'),...args.data};
        if(entity.id!==`${type}_created_${id.replace(/[^a-zA-Z0-9_-]/g,'_')}`||entity.name!==name)throw new Error('不能覆盖系统分配的编号或名称');
        if(['skill','spell','recipe'].includes(type)){
            const project=d.get('state','projects',args.project);if(!project||project.type!=='研究'||project.stage!=='打磨')throw new Error('新技能、法术或配方需要完成多日研究');
            if(type==='spell')throw new Error('自创法术效果还需按规则目录审查，当前不能直接登记');
            if(project.result)throw new Error('这个研究项目已经登记成果');
            const maximum=Math.max(...project.skills.map(skill=>effectiveProficiency(d,this,skill))),stage=Math.floor(maximum/300)-1;
            if(stage<0)throw new Error('研究相关技能不足以承认成果');
            entity={id:entity.id,name,aliases:[],scope:d.get('state','location')};
            if(type==='skill'){
                Object.assign(entity,{attribute:'智力',profession:null,stage,prerequisites:project.skills,notes:project.concept});
            }else Object.assign(entity,registerRecipe(d,this,args.data,project,stage));
            entity.source=args.project;
            d.set(['state','projects',args.project,'result'],entity.id);
        }
        if(type==='npc'){
            integer(entity.age,0,150);requiredText(entity.occupation);requiredText(entity.notes);
            entity.location=d.get('state','location');entity.flags={minor:entity.age<18,romanceable:entity.age>=18};entity.coins=0;entity.inventory={};entity.services=[];
            d.set(['state','npcs',entity.id],{id:entity.id,name,location:entity.location,coins:0,inventory:{},trust:0,affection:0,developments:[]});
        }
        if(type==='item')throw new Error('物品只允许由受限配方制造，不能凭空创建');
        if(type==='bld')throw new Error('建筑需要工程完工证明，不能凭空创建');
        let founded=null;
        if(type==='org'){entity.founder='player';entity.notes=requiredText(entity.notes);founded=foundOrganization(d,this,entity,id);}
        d.set(['state','created',entity.id],entity);return {entity:entity.id,...founded};
    },
};
