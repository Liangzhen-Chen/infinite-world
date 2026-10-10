import {derivedStats,monsterStats,strike,combatRandom}from'./combat.mjs';
import {careerEquipment,effectiveProficiency}from'./professions.mjs';
import {magicStatusStats,withMagicStats,magicIlluminates,consumeTransientMagic}from'./magic-status.mjs';
import{visibilityPenalty}from'./magic-context.mjs';
import{applyBossCounterAbility}from'./boss-abilities.mjs';
import {consumeMagicProtection}from'./magic-primitives.mjs';
import {milestone,monsterReward,awardExperience}from'./progression.mjs';
import {manufacture}from'./manufacturing.mjs';
import {repair}from'./repair.mjs';
import {interactEnvironment}from'./environment.mjs';
import {petAction}from'./pets.mjs';
import {summonAction}from'./summons.mjs';
import {crimeAction,lawAction,recordViolence}from'./law.mjs';
import {transferItems,heldUnit,wearItem}from'./items.mjs';
import {localWeather}from'./weather.mjs';
import {agricultureAction}from'./agriculture.mjs';
import {wildlifeAction,resolveCreature,recordWildlifeDeath}from'./wildlife.mjs';
import {lairAction,bossCounter,rememberBossTactic,defeatBoss}from'./bosses.mjs';
const integer=(value,min=0,max=1e9)=>{if(!Number.isSafeInteger(value)||value<min||value>max)throw new Error(`数值需在${min}到${max}之间`);return value;};
const requiredText=value=>{if(typeof value!=='string'||!value.trim()||value.length>1200)throw new Error('记录文字无效');return value.trim();};
export const activities={
    lair(d,args,id){return lairAction.call(this,d,args,id);},
    wildlife(d,args,id){return wildlifeAction.call(this,d,args,id);},
    farm(d,args,id){return agricultureAction.call(this,d,args,id);},
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
        const target=resolveCreature(this,d,args.target),isNpc=target.startsWith('npc_'),partition=isNpc?'npcs':'creatures',npc=d.get('state',partition,target),base=this.byId.get(target);
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
        const opponentBase=isNpc?derivedStats({level,attributes:base.attributes,profession:Boolean(base.combatProfession)},this.rules)
            :monsterStats({level,template:base.template??this.byId.get(base.monster)?.template??2,bossTier:base.tier??0},this.rules);
        const opponentContext=this.magicStatusContext(d,target),opponent=withMagicStats(opponentBase,magicStatusStats(d,target,opponentContext));
        if(opponent.divine&&!d.get('state','divinePermissions',target))throw new Error('神性屏障阻止普通攻击，需要交涉、逃离或取得特殊条件');
        const rawWeaponStats=weapon?this.byId.get(weapon).combat??{}:{},held=weapon?heldUnit(d,this,'player',weapon):null;
        const workmanshipFactor=this.rules.equipment.workmanship?.find(row=>row.name===held?.workmanship)?.multiplier??1;
        const weaponStats=Object.fromEntries(Object.entries(rawWeaponStats).map(([key,value])=>[key,value*workmanshipFactor])),careerStats=careerEquipment(d.get('state'));
        const equipment=Object.fromEntries([...new Set([...Object.keys(weaponStats),...Object.keys(careerStats)])].map(key=>[key,(weaponStats[key]??0)+(careerStats[key]??0)]));
        const playerBase=derivedStats({level:p.level,attributes:p.attributes,profession:Boolean(d.get('state','professions','combat')),equipment},this.rules),playerContext=this.magicStatusContext(d,'player');
        playerContext.moving=['flee','shove'].includes(args.intent);
        const stats=withMagicStats(playerBase,magicStatusStats(d,'player',playerContext));
        const maxHp=npc.maxHp??opponent.maxHp,hp=npc.hp??maxHp,rng=combatRandom(d.document,id),intent=args.intent??'attack';
        if(!['attack','defend','flee','shove'].includes(intent))throw new Error('交锋意图需为attack、defend、flee或shove');
        const tactic=intent==='attack'?(weapon?'armed':'unarmed'):intent,counter=bossCounter(d,this,target,tactic);
        const location=this.byId.get(d.get('state','location')),terrain=location.combatTags??[];
        const weather=localWeather(this,d.document),night=weather&&!weather.indoors&&!weather.daylight&&!terrain.includes('dark')&&!magicIlluminates(d)?this.rules.combat.terrain.dark.hit:0;
        const hitModifier=terrain.reduce((sum,tag)=>sum+(tag==='dark'&&magicIlluminates(d)?0:this.rules.combat.terrain[tag]?.hit??0),0)+(weather?.hitModifier??0)+night;
        const playerHit=visibilityPenalty(hitModifier,magicStatusStats(d,'player',playerContext),playerContext);
        const attack=intent==='flee'?{damage:0,hit:false}:strike(stats,opponent,rng,this.rules,{hitModifier:intent==='shove'?playerHit-(1-counter.damageMultiplier):playerHit,damageMultiplier:(intent==='defend'?0.65:intent==='shove'?0:1)*counter.damageMultiplier});
        if(intent!=='flee')consumeTransientMagic(d,'player',playerContext);
        const protection=consumeMagicProtection(d,target,intent==='shove'?(attack.hit?1:0):attack.damage,'physical');
        const damage=protection.damage,remaining=Math.max(0,hp-damage);
        let escaped=false;if(intent==='flee')escaped=this.check(d,{attribute:'敏捷',difficulty:counter.escapeDifficulty??15},`${id}_escape`).success;
        let received=0,absorbed=0;const bossAbilities=[];for(let i=0;i<(opponent.attacks??1);i++)if(remaining>0&&!escaped&&received<p.hp){
            const currentOpponent=withMagicStats(opponentBase,magicStatusStats(d,target,opponentContext)),currentPlayer=withMagicStats(playerBase,magicStatusStats(d,'player',playerContext));
            const opponentHit=visibilityPenalty(hitModifier,magicStatusStats(d,target,opponentContext),opponentContext);
            const hit=strike(currentOpponent,currentPlayer,rng,this.rules,{hitModifier:opponentHit,damageMultiplier:intent==='defend'?0.5:1});
            consumeTransientMagic(d,target,opponentContext);
            const ability=isNpc?null:applyBossCounterAbility(d,this,target,{eventId:id,attackIndex:i,hit:hit.hit,defense:currentPlayer.defense,remainingHp:remaining});
            if(ability)bossAbilities.push(ability);
            const abilityDamage=ability?.damage!==undefined?Math.max(0,Math.round(ability.damage*(intent==='defend'?.5:1))):hit.damage;
            const protectedHit=consumeMagicProtection(d,'player',abilityDamage,ability?.damageType??'physical');received+=protectedHit.damage;absorbed+=protectedHit.absorbed;
        }
        d.set(['state',partition,target,'hp'],remaining);d.set(['state',partition,target,'maxHp'],maxHp);
        if(!remaining)d.set(['state',partition,target,'status'],'死亡');
        else if(remaining<maxHp*0.25)d.set(['state',partition,target,'activity'],'退让并呼救');
        if(!isNpc)rememberBossTactic(d,this,target,tactic,id);
        if(received)this.health(d,{delta:-received},id);
        const seconds=(d.get('state','subMinuteSeconds')??0)+this.rules.combat.exchangeSeconds;
        this.advance(d,Math.floor(seconds/60),id);d.set(['state','subMinuteSeconds'],seconds%60);
        if(isNpc&&base.tier!=='full')d.set(['state','npcs',target,'trust'],Math.max(-100,npc.trust-5));
        if(weapon)wearItem(d,this,'player',weapon,1);
        if(intent==='shove')d.set(['state',partition,target,'developments'],[...npc.developments??[],{type:'被推搡',source:id,minute:d.get('state','minute'),reaction:remaining<maxHp*0.25?'呼救':'还手'}]);
        if(escaped)d.set(['state','combatDisengaged',target],{minute:d.get('state','minute'),source:id});
        const corpse=!isNpc&&!remaining?recordWildlifeDeath(d,this,target,id):null;
        const lair=!isNpc&&!remaining?defeatBoss(d,this,target,id):null;
        const experience=!isNpc&&!remaining?monsterReward(d,this,target,id):{experience:0};
        const incident=isNpc?recordViolence(d,this,{victim:target,damage,killed:!remaining,intent,eventId:id}):null;
        d.say(`交锋结束，对方受伤${damage}，你受伤${received}`);return {target,damage,received,...(bossAbilities.length?{abilities:bossAbilities}:{}),...(protection.absorbed||absorbed?{absorption:{target:protection.absorbed,player:absorbed}}:{}),targetHp:remaining,actionScope:{kind:'combat_exchange',clockManaged:true,seconds:this.rules.combat.exchangeSeconds},...experience,...(corpse?{corpse}:{}),...(lair?{lair}:{}),...(counter.adapted?{adaptation:{tactic,guarded:true,note:'对手对已见过的进攻加强防备'}}:{}),morale:remaining<maxHp*0.25?'撤退':'交战',...(weather?{weather:{name:weather.name,daylight:weather.daylight,hitModifier:weather.hitModifier,nightModifier:night}}:{}),...(incident?{case:incident}:{})};
    },
    craft(d,args,id){
        if(args.operation==='repair')return repair.call(this,d,args,id);
        if(args.operation!==undefined&&args.operation!=='manufacture')throw new Error('制造操作需为manufacture或repair');
        return manufacture.call(this,d,args,id);
    },
    research(d,args,id){
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
        const settlement=this.resolve(args.settlement,'loc'),row=d.get('state','settlements',settlement);
        if(!row)throw new Error('没有该聚落公共账目');
        const authorization=d.get('state','records',args.authorization);
        if(!authorization||authorization.category!=='authorization'||authorization.settlement!==settlement)throw new Error('公共物资需要已成立的授权');
        if(args.operation==='start_project'){
            const wood=integer(args.wood,1,10000),stone=integer(args.stone??0,0,10000),days=integer(args.days,1,365);
            if(row.wood<wood||row.stone<stone)throw new Error('公共工程材料不足');
            d.set(['state','settlements',settlement,'wood'],row.wood-wood);d.set(['state','settlements',settlement,'stone'],row.stone-stone);
            const project=`project_${id}`;d.set(['state','projects',project],{id:project,type:'工程',creator:'player',name:requiredText(args.name),settlement,remainingDays:days,wood,stone,status:'施工中',beneficiaries:args.beneficiaries??[]});
            return {project};
        }
        throw new Error('未知聚落事务');
    },
    quest(d,args,id){
        if(args.operation==='publish'){
            const publisher=this.resolve(args.publisher,'npc'),npc=d.get('state','npcs',publisher),grade=args.grade;
            if(!npc||['死亡','濒死'].includes(npc.status))throw new Error('任务发布者无法清醒履约');
            if(!(grade in this.rules.quests.quotaUnits))throw new Error('任务等级无效');
            const unit=this.rules.quests.quotaUnits[grade],month=Math.floor(d.get('state','minute')/(1440*30));
            const personal=args.personal===true,quota=this.byId.get(publisher).monthlyQuotaD??0,used=d.get('state','questQuota',`${month}_${publisher}`)??0;
            if(!personal&&used+unit>quota)throw new Error('身份或本月任务发布额度不足');
            if(personal&&grade!=='D')throw new Error('未登记官职的私人任务只能发布D级');
            const reward=integer(args.reward,20,1e6);if(npc.coins<reward)throw new Error('发布者无法托管报酬');
            const objective=args.objective;if(!objective||!['deliver','visit','build'].includes(objective.type))throw new Error('任务完成条件必须可验证');
            const verifiedObjective=objective.type==='deliver'?{type:'deliver',item:this.resolve(objective.item,'item'),quantity:integer(objective.quantity,1,100000)}
                :objective.type==='visit'?{type:'visit',location:this.resolve(objective.location,'loc')}:{type:'build',project:requiredText(objective.project)};
            if(verifiedObjective.type==='build'&&!d.get('state','projects',verifiedObjective.project))throw new Error('任务工程未登记');
            const quest=`quest_${id}`;d.set(['state','npcs',publisher,'coins'],npc.coins-reward);
            d.set(['state','quests',quest],{id:quest,publisher,grade,reward,escrow:reward,objective:verifiedObjective,content:requiredText(args.content),status:'公开',taker:null});
            if(!personal)d.set(['state','questQuota',`${month}_${publisher}`],used+unit);return {quest};
        }
        const quest=d.get('state','quests',args.quest);if(!quest)throw new Error('不存在这个任务');
        if(args.operation==='accept'){
            if(quest.status!=='公开')throw new Error('任务当前不能接受');d.set(['state','quests',quest.id],{...quest,status:'进行中',taker:'player'});return {quest:quest.id,status:'进行中'};
        }
        if(args.operation!=='complete'||quest.status!=='进行中'||quest.taker!=='player')throw new Error('任务不在可结算状态');
        const objective=quest.objective;let done=false;
        if(objective.type==='visit')done=Boolean(d.get('state','discoveries',this.resolve(objective.location)));
        if(objective.type==='build')done=d.get('state','projects',objective.project,'status')==='已完成';
        if(objective.type==='deliver'){
            const item=this.resolve(objective.item,'item'),amount=integer(objective.quantity,1,100000);
            if(['死亡','濒死'].includes(d.get('state','npcs',quest.publisher,'status')))throw new Error('委托人无法接收交付，需先处理委托变更');
            if(d.get('state','location')!==d.get('state','npcs',quest.publisher,'location'))throw new Error('委托人不在场，不能交付');
            if(this.quantity(d,'player',item)<amount)throw new Error('任务交付物品不足');transferItems(d,this,'player',quest.publisher,item,amount);done=true;
        }
        if(!done)throw new Error('没有可验证的完成证据');
        d.set(['state','player','coins'],d.get('state','player','coins')+quest.escrow);d.set(['state','quests',quest.id],{...quest,status:'已完成',escrow:0});d.say(`任务完成，获得${quest.reward}铜`);
        const subject=`${quest.publisher}:${objective.type}:${objective.item??objective.location??objective.project}`;
        const experience=awardExperience(d,this,{kind:'quest',subject,source:`quest:${quest.id}`,base:this.rules.quests.experienceRanges[quest.grade][0],repeat:true},id);
        return {quest:quest.id,reward:quest.reward,...experience};
    },
    create(d,args,id){
        const type=args.type,name=requiredText(args.name);
        if(!['npc','bld','org','item','skill','spell'].includes(type))throw new Error('实体类型无效');
        try{this.resolve(name);throw new Error('名称已存在，请沿用现有编号');}catch(error){if(!error.message.includes('未登记'))throw error;}
        const entity={id:`${type}_created_${id.replace(/[^a-zA-Z0-9_-]/g,'_')}`,name,aliases:[],scope:d.get('state','location'),...args.data};
        if(entity.id!==`${type}_created_${id.replace(/[^a-zA-Z0-9_-]/g,'_')}`||entity.name!==name)throw new Error('不能覆盖系统分配的编号或名称');
        if(['skill','spell'].includes(type)){
            const project=d.get('state','projects',args.project);if(!project||project.stage!=='打磨')throw new Error('新技能或法术需要完成多日研究');
            if(type==='spell')throw new Error('自创法术效果还需按规则目录审查，当前不能直接登记');
            entity.attribute='智力';entity.profession=null;entity.source=args.project;
        }
        if(type==='npc'){
            integer(entity.age,0,150);requiredText(entity.occupation);requiredText(entity.notes);
            entity.location=d.get('state','location');entity.flags={minor:entity.age<18,romanceable:entity.age>=18};entity.coins=0;entity.inventory={};entity.services=[];
            d.set(['state','npcs',entity.id],{id:entity.id,name,location:entity.location,coins:0,inventory:{},trust:0,affection:0,developments:[]});
        }
        if(type==='item')throw new Error('物品只允许由受限配方制造，不能凭空创建');
        if(type==='bld')throw new Error('建筑需要工程完工证明，不能凭空创建');
        if(type==='org'){entity.founder='player';entity.notes=requiredText(entity.notes);}
        d.set(['state','created',entity.id],entity);return {entity:entity.id};
    },
};
