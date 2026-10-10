import { applyPatches, canonical } from './storage.mjs';
import { EntityResolver, validateMemory } from './retrieval.mjs';
import {activities}from'./activities.mjs';
import {WorldEngine as Phase1Engine}from'./compat/v2-phase1-engine.mjs';
import {learn}from'./learning.mjs';
import {prepareMagic,applyMagic}from'./magic.mjs';
import {profession,effectiveProficiency}from'./professions.mjs';
import {xpRequired,allocateAttributes,milestone}from'./progression.mjs';
import {createCharacter}from'./character.mjs';
import {planRuleStateMigration,runtimeRuleVersion}from'./rule-state-migration.mjs';
import {registerRevival,revivePlayer}from'./revival.mjs';
import {check,npcProficiency}from'./checks.mjs';
import {changeItems,transferItems}from'./items.mjs';
import {environmentCatalog}from'./environment.mjs';
import {advancePets,petView,preparePetTravel,movePets}from'./pets.mjs';
import {advanceSummons,summonView}from'./summons.mjs';
import {enforceLegalRestriction,advanceLaw,lawView}from'./law.mjs';
import {localWeather,weatherEdge,cropProduction}from'./weather.mjs';
import {initializeAgriculture,planAgricultureMigration}from'./agriculture-migration.mjs';
import {advanceAgriculture,agricultureView,settleAgricultureExpiry}from'./agriculture.mjs';
import {planWildlifeMigration}from'./wildlife-migration.mjs';
import {advanceWildlife,wildlifePriceFactor}from'./wildlife.mjs';
import {planBossMigration}from'./boss-migration.mjs';
import {advanceBosses}from'./bosses.mjs';
import {planFarmPestsMigration}from'./farm-pests-migration.mjs';
import {sceneCard}from'./scene-card.mjs';
import {stateNotices}from'./state-notices.mjs';
const clone = value => structuredClone(value);
const number = (value, min = 0, max = 1e9, label = '数值') => {
    if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${label}必须在${min}到${max}之间`);
    return value;
};
const text = (value, max = 1200) => { if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('文字为空或过长'); return value.trim(); };
export{xpRequired};
export const skillGrade = value => `${['初级','中级','高级','特级','专家级','大师级','宗师级','圣级','神级'][Math.min(8,Math.floor(value/300))]}${Math.floor(value%300/100)+1}等`;
class Draft {
    constructor(document) { this.original = document; this.document = document; this.patches = []; this.messages = []; }
    get(...path) { return path.reduce((object, key) => object?.[key], this.document); }
    set(path, value) { const patch = { op: 'set', path, value }; this.document = applyPatches(this.document,[patch]); this.patches.push(patch); }
    remove(path) { const patch = { op: 'delete', path }; this.document=applyPatches(this.document,[patch]); this.patches.push(patch); }
    say(content) { this.messages.push(`【系统】${content}`); }
}
export class WorldEngine {
    constructor(world) {
        this.world = world; this.rules = world.rules;
        if(![1,2].includes(this.rules.engineRevision??1))throw new Error('此世界使用尚不支持的引擎版本，停止加载');
        this.entities = [...world.npcs,...world.locations,...world.items,...world.professions,...world.skills,...world.spells,...world.recipes??[],...world.monsters??[],...world.bosses??[],...world.cultures??[],...world.deities??[]];
        this.resolver = new EntityResolver(this.entities);
        this.byId = this.resolver.entities;
        if((this.rules.engineRevision??1)===1)this.compat=new Phase1Engine(world);
    }
    resolve(name, kind, scope) {
        const id = name === 'player' ? name : this.resolver.resolve(name, scope, kind);
        if (kind && !id.startsWith(kind + '_')) throw new Error(`需要${kind}类型编号`);
        return id;
    }
    initialFromLegacy(legacy, randomSeed = 'default-campaign') {
        if(this.compat)return this.compat.initialFromLegacy(legacy,randomSeed);
        const old = legacy.state, npcs = {}, inventory = {}, skills = {}, spells = {};
        for (const [name, value] of Object.entries(old.npcs)) {
            const id = this.resolve(name,'npc');
            npcs[id] = { ...clone(value), id, name, location:this.resolve(value.location), coins:this.byId.get(id).coins,
                inventory:clone(this.byId.get(id).inventory), developments:[], relationships:{} };
            delete npcs[id].notes; delete npcs[id].occupation;
        }
        for (const [name, quantity] of Object.entries(old.inventory)) {
            const id = this.resolve(name,'item'), item = this.byId.get(id);
            inventory[id] = { quantity, quality:item.quality, durability:item.durability, weight:item.weight };
        }
        for (const [name, value] of Object.entries(old.skills)) skills[this.resolve(name,'skill')] = { ...clone(value), breakthroughs:[], daily:{} };
        for (const [name, value] of Object.entries(old.spells)) spells[this.resolve(name,'spell')] = { ...clone(value), source:{type:'legacy',verified:true} };
        const combat = old.professions?.combat ? this.resolve(old.professions.combat,'profession') : '';
        const life = (old.professions?.life ?? []).map(name=>this.resolve(name,'profession'));
        const player = { ...clone(old.player), attributes:Object.fromEntries(this.rules.attributes.map(name=>[name,10])),
            status:'正常', freeAttributePoints:0, companions:[], revivalAnchor:this.resolve(old.player.revivalAnchor), dyingSince:null };
        const records = clone(old.records);
        return {schemaVersion:2,worldVersion:this.world.version,randomSeed,memories:clone(legacy.memories),manualPins:clone(legacy.manualPins ?? {}),
            state:{minute:old.minute,location:this.resolve(old.location),player,inventory,skills,spells,professions:{combat,life,hidden:clone(old.professions?.hidden ?? [])},
                npcs,records,pets:clone(old.pets ?? {}),settlements:{loc_hw:{...clone(old.settlement),starvation:0}},
                buildings:{bld_hw_qingdeng:{owner:'npc_hw_linsui',condition:70}},projects:{},effects:{},obligations:{},quests:{},quotes:{},created:{},weather:{},turns:{},checks:{},learning:{},recipes:{}}};
    }
    createCharacter(legacy,options,seed){const c=initializeAgriculture(this,createCharacter.call(this,legacy,options,seed)),wild=applyPatches(c,planWildlifeMigration(c,this.rules,this.world.monsters)),boss=applyPatches(wild,planBossMigration(wild,this.rules,this.world.bosses));return applyPatches(boss,planFarmPestsMigration(boss,this.rules));}
    calendar(minute) {
        number(minute,0,Number.MAX_SAFE_INTEGER,'分钟');
        const day=Math.floor(minute/1440),month=Math.floor(day/30)%12,year=Math.floor(day/360)+1;
        const ten=this.rules.calendar.tens?.[Math.floor(day%30/10)],market=this.rules.calendar.marketDays?.includes(day%30+1)??false;
        return {year,month:month+1,day:day%30+1,hour:Math.floor(minute%1440/60),minute:minute%60,season:Math.floor(month/3),...(ten?{ten}:{}),market,
            text:`${this.rules.calendar.epoch}${year===1?'元':year}年 ${this.rules.calendar.months[month]} ${day%30+1}日 ${String(Math.floor(minute%1440/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`};
    }
    formatCalendar(minute){return this.calendar(minute).text;}
    async reduce(document,input) {
        if(this.compat)return this.compat.reduce(document,input);
        if (input.type==='schema_migration') return {patches:input.patches,result:{migration:true}};
        if(input.type==='rules_state_migration')return{patches:planRuleStateMigration(document,this.rules),result:{migration:true,runtimeRuleVersion}};
        const d = new Draft(document), args=input.args ?? {}, id=text(input.eventId,120);
        const tool=input.tool.replace(/^world_/, '');
        const readOperations={weather:'inspect',environment:'inspect',pet:'inspect',summon:'inspect',farm:'inspect',wildlife:'observe',lair:'observe'};
        const noTimeTurn=tool==='turn'&&(args.outOfCharacter||args.extraMinutes===0);
        if(noTimeTurn||(readOperations[tool]&&(args.operation??readOperations[tool])===readOperations[tool])){
            const detail=await this.scoped(document)[tool](d,args,id);
            return {patches:d.patches,result:{ok:true,...detail,minute:d.get('state','minute'),messages:d.messages,notices:[]}};
        }
        for(const patch of planRuleStateMigration(document,this.rules))d.set(patch.path,patch.value);
        for(const patch of planAgricultureMigration(d.document,this.rules))d.set(patch.path,patch.value);
        for(const patch of planWildlifeMigration(d.document,this.rules,this.world.monsters))d.set(patch.path,patch.value);
        for(const patch of planBossMigration(d.document,this.rules,this.world.bosses))d.set(patch.path,patch.value);
        for(const patch of planFarmPestsMigration(d.document,this.rules))d.set(patch.path,patch.value);
        settleAgricultureExpiry(d,this);
        enforceLegalRestriction(d,tool,args);
        if (!['trade','time','move','turn','health','revive','revival','check','practice','cast','learn','profession','attributes','relation','promise','remember',...Object.keys(activities)].includes(tool)) throw new Error('未知工具职责');
        if(d.get('state','player','status')==='死亡'&&!['time','turn','revive'].includes(tool))throw new Error('你已经死亡，需要在登记点醒来后行动');
        if(d.get('state','player','status')==='濒死'&&!['time','turn','health','cast'].includes(tool))throw new Error('你处于濒死状态，只能等待救治或尝试自救');
        const session=this.scoped(document);
        const detail = await session[tool](d,args,id);
        advancePets(d,session,d.get('state','minute'));
        advanceSummons(d,d.get('state','minute'));
        advanceLaw(d,d.get('state','minute'));
        if(tool==='check')detail.actionScope={kind:'judgement',healthChanged:false,inventoryChanged:false,feePaid:0,
            note:'仅结算判断或对抗，并履行已引用的协助；未伤人、毁物或制造。不得从骰点虚构这些变化。'};
        return { patches:d.patches,result:{ok:true,...detail,minute:d.get('state','minute'),messages:d.messages,
            notices:stateNotices(document.state,d.document.state,id=>session.byId.get(id)?.name)} };
    }
    scoped(document){
        const created=Object.values(document.state.created??{});
        const player={id:'player',name:document.state.player.name,aliases:['玩家','玩家角色'],scope:document.state.location};
        const session=Object.create(this);session.entities=[...this.entities,...created,player];session.resolver=new EntityResolver(session.entities);session.byId=session.resolver.entities;return session;
    }
    actor(d,id) { return id==='player' ? d.get('state','player') : d.get('state','npcs',id); }
    actorPath(id) { return id==='player' ? ['state','player'] : ['state','npcs',id]; }
    bagPath(id) { return id==='player' ? ['state','inventory'] : ['state','npcs',id,'inventory']; }
    quantity(d,id,item) { const value=d.get(...this.bagPath(id),item); return typeof value==='number'?value:value?.quantity ?? 0; }
    itemDelta(d,id,item,delta) {
        return changeItems(d,this,id,item,delta);
    }
    async trade(d,args,id) {
        const buyer=this.resolve(args.buyer ?? 'player'),seller=this.resolve(args.seller);
        if(buyer===seller) throw new Error('交易双方不能相同');
        if(!this.actor(d,buyer)||!this.actor(d,seller)) throw new Error('交易对象不在战役中');
        for(const actor of[buyer,seller])if(['死亡','濒死'].includes(this.actor(d,actor).status))throw new Error('交易一方无法清醒履约');
        const playerLocation=d.get('state','location');
        for(const actor of [buyer,seller]) if(actor!=='player' && this.actor(d,actor).location!==playerLocation) throw new Error('交易对方不在场');
        if(args.service==='住宿'){
            if(buyer!=='player'||seller!=='npc_hw_linsui')throw new Error('这个人没有登记住宿服务');
            const days=number(args.days??1,1,7,'住宿天数'),cost=days===7?35:days*6;
            if(this.actor(d,buyer).coins<cost)throw new Error('房钱不足');
            d.set([...this.actorPath(buyer),'coins'],this.actor(d,buyer).coins-cost);d.set([...this.actorPath(seller),'coins'],this.actor(d,seller).coins+cost);
            const contract=`contract_room_${id}`;d.set(['state','records',contract],{category:'contract',name:'青灯酒馆住宿',parties:['player',seller],room:'bld_hw_qingdeng',
                starts:d.get('state','minute'),expires:d.get('state','minute')+days*1440,paid:cost,status:'有效',content:`林穗收到${cost}铜，允许旅人住${days}天。`});
            this.advance(d,10,id);d.say(`住宿${days}天，支付${cost}铜`);return {contract,cost,days};
        }
        const item=this.resolve(args.item,'item');
        const quantity=number(args.quantity,1,100000,'数量'), catalog=this.byId.get(item);
        const quoteKey=`${Math.floor(d.get('state','minute')/1440)}_${seller}_${buyer}_${item}`;
        const existing=d.get('state','quotes',quoteKey);
        const quoteBase=Math.ceil(catalog.basePrice*wildlifePriceFactor(this,d.document,item,playerLocation));
        const price=existing ?? number(args.unitPrice ?? quoteBase,Math.ceil(quoteBase*0.8),Math.ceil(quoteBase*1.5),'单价');
        const cost=quantity*price;
        if(this.quantity(d,seller,item)<quantity) throw new Error(`对方库存不足：${catalog.name}只剩${this.quantity(d,seller,item)}`);
        if(this.actor(d,buyer).coins<cost) throw new Error('买方余额不足');
        d.set([...this.actorPath(buyer),'coins'],this.actor(d,buyer).coins-cost);
        d.set([...this.actorPath(seller),'coins'],this.actor(d,seller).coins+cost);
        const moved=transferItems(d,this,seller,buyer,item,quantity,args.instances??null);
        d.set(['state','quotes',quoteKey],price);this.advance(d,5,id);d.say(`${catalog.name}×${quantity}，成交${cost}铜`);
        return {buyer,seller,item,quantity,cost,instances:moved.instances};
    }
    advance(d,minutes,id) {
        minutes=number(minutes,0,43200,'耗时');
        const before=d.get('state','minute'),after=before+minutes;d.set(['state','minute'],after);
        advanceSummons(d,after);
        advanceLaw(d,after);
        const days=Math.floor(after/1440)-Math.floor(before/1440);
        for(let day=Math.floor(before/1440);day<Math.floor(after/1440);day++){
          for(const [sid,source] of Object.entries(d.get('state','settlements'))) {
            const farming=advanceAgriculture(d,this,sid,source,day),s=farming?.settlement??clone(source);
            const production=farming?0:cropProduction(this,d.document.randomSeed,sid,day*1440,s.foodPerDay),available=s.food+production;
            const missing=farming?.missingMeals??Math.max(0,s.population-available);
            if(!farming)s.food=Math.max(0,available-s.population);s.unmetMeals=(s.unmetMeals??0)+missing;
            s.starvation=missing ? (s.starvation??0)+1 : Math.max(0,(s.starvation??0)-1);
            if(s.starvation>=7){s.population=Math.max(0,s.population-1);s.starvation=0;d.say(`${s.name}发生饥荒死亡`);}
            s.wood+=farming?.woodProduced??s.woodPerDay;d.set(['state','settlements',sid],s);
          }
            advancePets(d,this,(day+1)*1440);
            advanceWildlife(d,this,day);advanceBosses(d,this,day);
        }
        advancePets(d,this,after);
        settleAgricultureExpiry(d,this);
        if(days)for(const [key,project]of Object.entries(d.get('state','projects')))if(project.type==='工程'&&project.status==='施工中'){
            const remainingDays=Math.max(0,project.remainingDays-days);d.set(['state','projects',key],{...project,remainingDays,status:remainingDays?'施工中':'已完成'});
            if(!remainingDays&&project.creator==='player')milestone(d,this,'publicContribution',key,id);
        }
        for(const [key,effect] of Object.entries(d.get('state','effects'))) if(effect.expires<=after) d.remove(['state','effects',key]);
        const p=d.get('state','player');
        if(p.status==='濒死' && after-p.dyingSince>=this.rules.death.dyingMinutes) this.death(d);
        for(const [key,obligation] of Object.entries(d.get('state','obligations'))) {
            if(obligation.status==='待履行' && obligation.deadline<=after && ['送货','付款'].includes(obligation.type)) {
                try { this.deliver(d,key,obligation,id); } catch(error) { d.set(['state','obligations',key],{...obligation,status:'违约',reason:error.message}); }
            }
        }
    }
    time(d,args,id) {
        if(d.get('state','player','status')==='死亡')this.revive(d,{},id);
        const minutes=number(args.minutes,1,43200,'耗时');this.advance(d,minutes,id);
        if(args.activity==='睡眠'||args.activity==='休息') {
            const p=d.get('state','player');if(p.status==='正常'){
                d.set(['state','player','hp'],Math.min(p.maxHp,p.hp+Math.floor(minutes/30)));
                d.set(['state','player','mp'],Math.min(p.maxMp,p.mp+Math.floor(minutes/30)));
            }
        }
        return {elapsed:minutes,date:this.calendar(d.get('state','minute')).text};
    }
    route(from,to,mode,minute,seed='default-campaign') {
        const distances=new Map([[from,0]]), movingTimes=new Map([[from,0]]), previous=new Map(),costs=new Map([[from,0]]),pending=new Set(this.world.locations.map(place=>place.id));
        while(pending.size){
            const current=[...pending].sort((a,b)=>(distances.get(a)??Infinity)-(distances.get(b)??Infinity))[0];
            if(!distances.has(current))break;pending.delete(current);if(current===to)break;
            for(const edge of this.world.routes){
                if(!edge.modes.includes(mode)||edge.closedSeasons.includes(this.calendar(minute).season))continue;
                const next=edge.from===current?edge.to:edge.to===current?edge.from:null;if(!next||!pending.has(next))continue;
                const speed=edge.speedKmh??(mode==='cart'?this.rules.travel.cartKmh:this.rules.travel.walkKmh*(mode==='horse'?this.rules.travel.horseMultiplier:1))*(edge.terrainMultiplier??1);
                const travel=this.rules.weather?weatherEdge(this,seed,{...edge,from:current},mode,minute,distances.get(current),movingTimes.get(current),speed):null;
                if(this.rules.weather&&!travel)continue;
                const elapsed=Math.max(1,Math.ceil(edge.lengthKm/speed*60)),candidate=travel?.elapsed??distances.get(current)+elapsed;
                if(candidate<(distances.get(next)??Infinity)){distances.set(next,candidate);movingTimes.set(next,travel?.moving??movingTimes.get(current)+elapsed);previous.set(next,{node:current,edge});costs.set(next,costs.get(current)+edge.toll);}
            }
        }
        if(!distances.has(to))throw new Error('没有当前季节可通行的路线，不能瞬移');
        const edges=[];let cursor=to;while(cursor!==from){const step=previous.get(cursor);edges.unshift(step.edge.id);cursor=step.node;}
        const moving=movingTimes.get(to),daysRest=this.rules.weather||mode==='boat'?0:Math.floor((moving-1)/this.rules.travel.dailyTravelMinutes)*(1440-this.rules.travel.dailyTravelMinutes);
        return {minutes:distances.get(to)+daysRest,movingMinutes:moving,cost:costs.get(to),edges};
    }
    move(d,args,id) {
        const destination=this.resolve(args.destination),old=d.get('state','location');
        if(old===destination)return {destination,elapsed:0};
        const route=this.route(old,destination,args.mode??'walk',d.get('state','minute'),d.document.randomSeed);
        if(this.rules.petCare)preparePetTravel(d,this,args.mode??'walk',route.movingMinutes);
        if(d.get('state','player','coins')<route.cost)throw new Error('路费不足');
        d.set(['state','player','coins'],d.get('state','player','coins')-route.cost);
        d.set(['state','location'],destination);
        const discovered=Boolean(d.get('state','discoveries',destination));
        d.set(['state','discoveries',destination],{minute:d.get('state','minute')+route.minutes,source:'亲历'});
        for(const npc of d.get('state','player','companions'))d.set(['state','npcs',npc,'location'],destination);
        movePets(d,this,old,destination,route.movingMinutes);
        for(const[key,effect]of Object.entries(d.get('state','effects')))if(effect.kind==='summon'&&effect.owner==='player'&&effect.location===old)d.set(['state','effects',key,'location'],destination);
        this.advance(d,route.minutes,id);
        const experience=discovered?{experience:0}:milestone(d,this,'discovery',destination,id);
        for(const [key,obligation]of Object.entries(d.get('state','obligations')))if(obligation.type==='带路'&&obligation.destination===destination&&obligation.status==='进行中'){
            d.set(['state','obligations',key,'status'],'已完成');d.say(`${this.byId.get(obligation.promisor).name}的带路约定已完成`);
        }
        return {destination,...route,...experience,companions:d.get('state','player','companions')};
    }
    turn(d,args,id) {
        if(args.outOfCharacter)return {outOfCharacter:true};
        if(d.get('state','turns',id))return {duplicate:true};
        const start=number(args.startMinute,0,Number.MAX_SAFE_INTEGER,'回合起始时间'),now=d.get('state','minute');
        if(start>now)throw new Error('回合起始时间晚于当前时间');
        // Old event logs keep their total-duration semantics; new tails only add extra time.
        const remaining=args.extraMinutes!==undefined?number(args.extraMinutes,0,43200,'额外时长'):
            Math.max(0,number(args.minutes??10,0,43200,'回合时长')-(now-start));
        if(args.location&&this.resolve(args.location)!==d.get('state','location'))throw new Error('尾注地点与实际账本不一致，需先沿路线移动');
        const present=(args.present??[]).map(name=>this.resolve(name,'npc'));
        if(present.some(npc=>d.get('state','npcs',npc,'location')!==d.get('state','location')))throw new Error('尾注包含不在场的人物');
        if(remaining)this.advance(d,remaining,id);d.set(['state','turns',id],{start,end:d.get('state','minute'),present});
        return {elapsed:remaining,present};
    }
    health(d,args,id) {
        const amount=number(args.delta,-1e9,1e9,'生命变化'),p=d.get('state','player');
        if(p.status==='死亡')throw new Error('死亡后需要复活，不能直接治疗');
        d.set(['state','player','hp'],Math.max(0,Math.min(p.maxHp,p.hp+amount)));
        if(p.hp+amount<=0){d.set(['state','player','status'],'濒死');if(p.status!=='濒死')d.set(['state','player','dyingSince'],d.get('state','minute'));
            if(d.get('state','player','mount'))d.remove(['state','player','mount']);
            if(-amount>=p.maxHp*this.rules.death.immediateOverkillRatio)this.death(d);
        }else if(p.status==='濒死'){d.set(['state','player','status'],'正常');d.set(['state','player','dyingSince'],null);}
        return {hp:d.get('state','player','hp'),status:d.get('state','player','status')};
    }
    death(d) {
        const p=d.get('state','player'),loss=p.level<10?p.level*10:xpRequired(p.level);
        if(p.status==='死亡')return;
        d.set(['state','player','xp'],Math.max(0,p.xp-loss));d.set(['state','player','status'],'死亡');d.say(`死亡损失经验${Math.min(p.xp,loss)}`);
        d.set(['state','player','companions'],[]);
        if(d.get('state','player','mount'))d.remove(['state','player','mount']);
    }
    revive(d,args,id) {
        return revivePlayer.call(this,d,args,id);
    }
    revival(d,args,id){
        return registerRevival.call(this,d,args,id);
    }
    check(d,args,id) {
        return check.call(this,d,args,id);
    }
    practice(d,args,id) {
        const skill=this.resolve(args.skill,'skill'),old=d.get('state','skills',skill);
        if(!old)throw new Error('尚未学会这项技能');
        const stage=Math.floor(old.proficiency/300),day=String(Math.floor(d.get('state','minute')/1440));
        if(args.breakthroughSource){
            const teacher=this.resolve(args.breakthroughSource,'npc'),base=this.byId.get(teacher),role=this.byId.get(skill).profession;
            if(!((base.services??[]).includes(role)||(base.services??[]).includes(skill)||(base.skills??[]).includes(skill))||d.get('state','npcs',teacher,'location')!==d.get('state','location'))throw new Error('突破导师不具备资格或不在场');
            if(old.proficiency%300!==299)throw new Error('尚未达到当前阶段上限');
            if(role&&![d.get('state','professions','combat'),...d.get('state','professions','life'),...d.get('state','professions','hidden')].includes(role))throw new Error('未认证职业不能跨越初级阶段');
            const outcome=this.check(d,{attribute:this.byId.get(skill).attribute,difficulty:20},id);
            this.advance(d,120,id);
            if(outcome.success)d.set(['state','skills',skill,'breakthroughs'],[...new Set([...old.breakthroughs??[],stage+1])]);
            return {skill,breakthrough:outcome.success,...outcome};
        }
        const daily=clone(old.daily??{}),row=daily[day]??{gain:0,targets:{}},target=text(args.target??'普通练习',100),repeats=row.targets[target]??0;
        const requested=number(args.gain??3,0,100,'练习收益');
        const gain=Math.max(0,Math.min(Math.floor(requested*0.5**repeats),this.rules.practice.dailyCaps[stage]-row.gain));
        const role=this.byId.get(skill).profession;
        const certified=!role||[d.get('state','professions','combat'),...d.get('state','professions','life'),...d.get('state','professions','hidden')].includes(role);
        if(!certified&&old.proficiency>299)return {skill,gain:0,proficiency:old.proficiency,effectiveProficiency:299,retained:true};
        const limit=Math.min(certified?2699:299,(old.breakthroughs??[]).includes(stage+1)?(stage+2)*300-1:(stage+1)*300-1);
        const proficiency=Math.min(limit,old.proficiency+gain),actual=proficiency-old.proficiency;
        row.gain+=actual;row.targets[target]=repeats+1;daily[day]=row;
        for(const key of Object.keys(daily))if(Number(key)<Number(day)-1)delete daily[key];
        d.set(['state','skills',skill],{...old,proficiency,grade:skillGrade(proficiency),daily});d.say(`${this.byId.get(skill).name}熟练度 +${actual}`);
        return {skill,gain:actual,proficiency,needsBreakthrough:proficiency%300===299};
    }
    cast(d,args,id) {
        const spell=this.resolve(args.spell,'spell'),known=d.get('state','spells',spell),catalog=this.byId.get(spell);
        if(!known)throw new Error('尚未学会这个法术');
        const band=this.rules.magic.stageMpRanges[catalog.stage];
        if(!band||catalog.mp<band[0]||catalog.mp>band[1])throw new Error('法术消耗不符合阶段规则');
        const prepared=prepareMagic.call(this,d,catalog,args);
        if(d.get('state','player','status')==='濒死'&&(catalog.effectSpec?.kind!=='heal'||prepared?.target!=='player'))throw new Error('濒死时只能尝试对自己施放救治法术');
        if(d.get('state','player','mp')<catalog.mp)throw new Error('魔力不足');
        for(const material of catalog.materials)if(this.quantity(d,'player',material.item)<material.amount)throw new Error(`缺少材料${this.byId.get(material.item).name}`);
        d.set(['state','player','mp'],d.get('state','player','mp')-catalog.mp);
        for(const material of catalog.materials)this.itemDelta(d,'player',material.item,-material.amount);
        const result=this.check(d,{attribute:'精神',skill:catalog.skill,difficulty:catalog.difficulty},id);
        this.advance(d,catalog.minutes,id);this.practice(d,{skill:catalog.skill,gain:3,target:args.target??'施法'},id);
        if(result.success&&catalog.duration&&!prepared)d.set(['state','effects',id],{spell,target:text(args.target??'近处物体',200),expires:d.get('state','minute')+catalog.duration});
        const effect=result.success?applyMagic.call(this,d,prepared,id):{};
        if(!result.success&&result.degree==='大失败'&&catalog.failureDamage)this.health(d,{delta:-catalog.failureDamage},id);
        const completed=result.success&&!effect.effectFailed;
        d.say(`${catalog.name}${completed?'施放成功':'施放失败'}，消耗${catalog.mp}魔力`);
        return {spell,...result,...effect,checkSuccess:result.success,success:completed,mpCost:catalog.mp};
    }
    learn(d,args,id) {
        return learn.call(this,d,args,id);
    }
    profession(d,args,id){
        return profession.call(this,d,args,id);
    }
    attributes(d,args,id){return allocateAttributes.call(this,d,args,id);}
    relation(d,args,id) {
        const npc=this.resolve(args.npc,'npc'),base=this.byId.get(npc),row=d.get('state','npcs',npc);
        if(args.notes!==undefined)throw new Error('基础人设只读，变化应追加发展记录');
        const allowed=['信守约定','违约','帮助','欺骗','威胁','冲突','交谈'];if(!allowed.includes(args.eventType))throw new Error('关系变化需引用已知事件类型');
        if(!args.sourceEvent)throw new Error('关系变化缺少来源事件');
        if(args.romance&&base.flags.minor)throw new Error('未成年人物拒绝恋爱关系写入');
        const defaultTrust={信守约定:3,违约:-5,帮助:3,欺骗:-5,威胁:-3,冲突:-3,交谈:0}[args.eventType];
        const trust=number(args.trustDelta??defaultTrust,defaultTrust-2,defaultTrust+2,'信任变化');
        d.set(['state','npcs',npc,'trust'],Math.max(-100,Math.min(100,row.trust+trust)));
        d.set(['state','npcs',npc,'developments'],[...row.developments,{eventType:args.eventType,source:args.sourceEvent,minute:d.get('state','minute')}]);
        return {npc,trustDelta:trust};
    }
    promise(d,args,id) {
        const promisor=this.resolve(args.promisor),promisee=this.resolve(args.promisee??'player'),type=args.type;
        if(!['带路','送货','付款','等候','会面','协助'].includes(type))throw new Error('义务类别不支持');
        if(promisor!=='player'&&!d.get('state','npcs',promisor))throw new Error('承诺者不在战役中');
        for(const actor of[promisor,promisee])if(['死亡','濒死'].includes(this.actor(d,actor)?.status))throw new Error('义务当事人无法清醒履约');
        const obligation={id:`obl_${id}`,type,promisor,promisee,content:text(args.content),status:'待履行',deadline:number(args.deadline??d.get('state','minute')+1440,0,Number.MAX_SAFE_INTEGER)};
        if(type==='带路'){
            obligation.destination=this.resolve(args.destination);this.route(d.get('state','location'),obligation.destination,'walk',d.get('state','minute'),d.document.randomSeed);
            if(promisor==='player'||d.get('state','npcs',promisor,'location')!==d.get('state','location'))throw new Error('带路者必须在场');
            obligation.status='进行中';d.set(['state','player','companions'],[...new Set([...d.get('state','player','companions'),promisor])]);
        }
        if(type==='送货'){obligation.item=this.resolve(args.item,'item');obligation.quantity=number(args.quantity,1,100000);}
        if(type==='付款')obligation.coins=number(args.coins,1,1e9);
        if(type==='协助'){
            if(promisor==='player'||d.get('state','npcs',promisor,'location')!==d.get('state','location'))throw new Error('协助者必须在场');
            obligation.attribute=args.attribute??'精神';if(!this.rules.attributes.includes(obligation.attribute))throw new Error('协助属性不在规则表');
            obligation.skill=args.skill?this.resolve(args.skill,'skill'):null;
            if(obligation.skill&&npcProficiency(d,this,promisor,obligation.skill)<(this.rules.check.helperMinimumProficiency??100))throw new Error('协助者技能不足');
        }
        d.set(['state','obligations',obligation.id],obligation);return {obligation};
    }
    deliver(d,key,o,id){
        const source=this.actor(d,o.promisor),target=this.actor(d,o.promisee);if(!source||!target)throw new Error('义务当事人不存在');
        if([source,target].some(actor=>['死亡','濒死'].includes(actor.status)))throw new Error('义务当事人无法清醒履约');
        if(o.type==='送货'){if(this.quantity(d,o.promisor,o.item)<o.quantity)throw new Error('承诺者缺少货物');transferItems(d,this,o.promisor,o.promisee,o.item,o.quantity);}
        if(o.type==='付款'){if(source.coins<o.coins)throw new Error('承诺者资金不足');d.set([...this.actorPath(o.promisor),'coins'],source.coins-o.coins);d.set([...this.actorPath(o.promisee),'coins'],target.coins+o.coins);}
        d.set(['state','obligations',key,'status'],'已完成');d.say(`${o.content}已履行`);
    }
    remember(d,args,id) {
        const subject=this.resolve(args.subject),content=validateMemory(args.content),key=text(args.key,100),memoryId=`${subject}::${key}`;
        d.set(['memories',memoryId],{subject,key,content,keywords:args.keywords??[],pinned:d.get('memories',memoryId,'pinned')??false,minute:d.get('state','minute'),source:args.source??'亲历'});
        return {memoryId};
    }
    scene(document,query,index=null){return sceneCard(this.byId.has('player')?this:this.scoped(document),document,query,index);}

}
Object.assign(WorldEngine.prototype,activities);
