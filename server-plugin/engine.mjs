import {facilityView,facilityRouteStates} from './facility-state.mjs';
import {NPC_CRIME_VERSION} from './npc-crime.mjs';
import {personTeaching} from './entity-view.mjs';
import { applyPatches, canonical, PatchCursor } from './storage.mjs';
import { EntityResolver, validateMemory, normalize } from './retrieval.mjs';
import {assertLocationAccess,homePermission}from'./location-access.mjs';
import {activities}from'./activities.mjs';
import {actorId,actorPath}from'./npc-state.mjs';
import {personSimulation,personConstraint}from'./entity-view.mjs';
import {validateSites}from'./sites.mjs';
import {WorldEngine as Phase1Engine}from'./compat/v2-phase1-engine.mjs';
import {learn}from'./learning.mjs';
import {prepareMagic,applyMagic}from'./magic.mjs';
import {recordSpellViolation}from'./magic-consent.mjs';
import {recordMagicEconomy}from'./magic-economy.mjs';
import {settleMagicAreas,prepareAreaMagic,applyAreaMagic,areaTargetFacts}from'./magic-area.mjs';
import {assertFireTravel}from'./magic-object.mjs';
import {adjustAirTravel}from'./magic-air.mjs';
import {assertWaterEarthMovement,waterEarthWalkMinutes}from'./magic-water-earth.mjs';
import {strainCare}from'./magic-care.mjs';
import {assertMindAwake,assertMindSpacePath}from'./magic-mind-space.mjs';
import {assertLightMovement}from'./magic-light.mjs';
import{targetFacts,statusContext}from'./magic-context.mjs';
import {profession,effectiveProficiency,certifiedForSkill}from'./professions.mjs';
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
import {localWeather,weatherEdge}from'./weather.mjs';
import {initializeAgriculture}from'./agriculture-migration.mjs';
import {agricultureView,settleAgricultureExpiry}from'./agriculture.mjs';
import {advanceSettlementTrade,regionalTradePrice}from'./settlement-trade.mjs';
import {transportAction,transportScene} from './transport.mjs';
import {postAction} from './post.mjs';
import {tradeQuote,recordDeal}from'./shop.mjs';
import {initializeWorldClocks}from'./world-clock.mjs';
import {initializeFactionClocks,factionClockRules}from'./faction-clock.mjs';
import {QUEST_SOURCES_VERSION,openSettlementLedgers}from'./quest-sources.mjs';
import {villageWildlifeFresh}from'./quest-wildlife.mjs';
import {TRIBAL_AWAKENING_VERSION}from'./tribal-awakening.mjs';
import {MILITARY_VERSION}from'./military.mjs';
import {WAR_VERSION}from'./war-diplomacy.mjs';
import {warClosedRoutes}from'./hazard-calendar.mjs';
import {validateFestivalRuntime}from'./festival.mjs';
import {wildlifePriceFactor,wildlifeEncounterAt,settleWildlifeEncounter,wildlifeEncounterView}from'./wildlife.mjs';
import {wildlifeAwakeningConsumer}from'./wildlife-awakening.mjs';
import {spiritSocietyConsumer,moveSpiritCompanions}from'./wildlife-society.mjs';
import {sceneCard}from'./scene-card.mjs';
import {promptScope}from'./prompt-scope.mjs';
import {stateNotices}from'./state-notices.mjs';
import {recordReturnVisit}from'./return-summary.mjs';
import {assertNpcService,advanceNpcSchedules}from'./npc-schedule.mjs';
import {npcAutonomyBusy,assertNpcAutonomyAction,applyNpcPlan}from'./npc-autonomy.mjs';
import './npc-memory.mjs';// world-event subscriber (registers itself)
import {hearNpcRumor}from'./npc-rumors.mjs';
import {recordLie,exposeLieCall}from'./lies.mjs';
import {createNpcObligation,assertNpcObligationAction,npcObligationAt}from'./npc-obligations.mjs';
import {applyNpcRelation}from'./npc-relations.mjs';
import {assertSocietyTrade,societyNewsConsumer,societyIssueConsumer}from'./monster-society.mjs';
import {resolveToolCall}from'../extension/tools.mjs';
import {deriveWorldEvents,publishWorldEvents,WORLD_EVENT_VERSION}from'./world-events.mjs';
import './wildlife-society.mjs';// world-event subscriber (registers itself)
import './boss-cognition.mjs';// world-event subscriber (registers itself)
import './standing.mjs';// world-event subscriber (registers itself)
import {evidenceBreakthrough,breakthroughPaths}from'./career-metrics.mjs';
import {INTELLIGENCE_VERSION,intelligenceFresh}from'./npc-intelligence.mjs';
import {chargeTrade,repayDebt}from'./contracts.mjs';
import {businessTrade,recordBusinessReceipt}from'./business.mjs';
import {CREDIT_OPERATIONS,creditTrade,isCreditDebt,repayCredit,lodgingOf,assertLodgingHost,grantLodgingAccess}from'./credit.mjs';
import {recordFinanceSale}from'./finance-assets.mjs';
import {assessTradeTax}from'./finance-tax.mjs';
import {initializeR1,planR1,planPreR1Partitions}from'./migrations/r1.mjs';
import {materializeWildlifeHabitats}from'./wildlife-habitats.mjs';
import {unfoldPopulationAt,acceptPopulationProfile,settlePopulationLayers,populationLayersFresh,populationPlan}from'./population.mjs';
import {remoteEngine,unfoldRemoteAt}from'./remote-generation.mjs';
import {advanceNeedsSteps,nextAdvanceMinute,runAdvance}from'./advance-registry.mjs';
import {beginHouseholdReads}from'./npc-state.mjs';
import {advanceLayersFresh}from'./advance-layers.mjs';
import {smuggleTrade,inspectSmuggling}from'./smuggling.mjs';
const clone = value => structuredClone(value);
const number = (value, min = 0, max = 1e9, label = '数值') => {
    if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${label}必须在${min}到${max}之间`);
    return value;
};
const text = (value, max = 1200) => { if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('文字为空或过长'); return value.trim(); };
export{xpRequired};
export const skillGrade = value => `${['初级','中级','高级','特级','专家级','大师级','宗师级','圣级','神级'][Math.min(8,Math.floor(value/300))]}${Math.floor(value%300/100)+1}等`;
class Draft {
    constructor(document) { this.original = document; this.cursor = new PatchCursor(document); this.adopted = new Map(); this.patches = []; this.messages = []; }
    // P2: the cursor keeps its own copies writable until a read lets them escape.
    get document() { this.release(null); return this.cursor.expose(this.cursor.root); }
    set document(document) { this.cursor.reset(document); this.adopted.clear(); }
    get(...path) { if (this.adopted.size) this.release(path); let object = this.cursor.root; for (let i = 0; i < path.length; i++) object = object?.[path[i]]; return this.cursor.expose(object); }
    // Only for a caller that reads, copies what it keeps and drops the reference before its next write.
    peek(...path) { let object = this.cursor.root; for (let i = 0; i < path.length; i++) object = object?.[path[i]]; return object; }
    set(path, value) { this.write({ op: 'set', path, value }); }
    remove(path) { this.write({ op: 'delete', path }); }
    // P2: a fresh records row the caller hands over and never touches again.
    // The draft holds the patch's own object instead of a copy until a read
    // could reach it (release); then it holds a copy, exactly as set would.
    adopt(path, value) {
        if (!Array.isArray(path) || path.length !== 3 || path[0] !== 'state' || path[1] !== 'records' || typeof path[2] !== 'string') return this.set(path, value);
        const patch = { op: 'set', path, value };
        this.cursor.apply(patch, false); this.adopted.set(path[2], value); this.patches.push(patch);
    }
    write(patch) {
        const path = patch.path, records = this.adopted.size && Array.isArray(path) && path[0] === 'state' && (path.length < 2 || path[1] === 'records');
        // Writing inside an adopted row first gives the draft its own copy.
        if (records && path.length > 3 && this.adopted.has(path[2])) this.materialize(path[2]);
        this.cursor.apply(patch); this.patches.push(patch);
        // A write at or above an adopted row replaces it.
        if (records && path.length <= 3) { if (path.length === 3) this.adopted.delete(path[2]); else this.adopted.clear(); }
    }
    release(path) {
        if (!this.adopted.size) return;
        if (path && (path.length && path[0] !== 'state' || path.length > 1 && path[1] !== 'records')) return;
        if (path && path.length > 2) { if (this.adopted.has(path[2])) this.materialize(path[2]); return; }
        for (const key of [...this.adopted.keys()]) this.materialize(key);
    }
    materialize(key) {
        const value = this.adopted.get(key); this.adopted.delete(key);
        this.cursor.apply({ op: 'set', path: ['state', 'records', key], value });
    }
    say(content) { this.messages.push(`【系统】${content}`); }
}
export class WorldEngine {
    constructor(world) {
        this.populationPlan=populationPlan;
        // K8: derived habitats join the authored ones before any consumer reads them.
        materializeWildlifeHabitats(world);
        this.world = world; this.rules = world.rules;
        const siteErrors=validateSites(world);if(siteErrors.length)throw Error(siteErrors.join('；'));
        if(![1,2].includes(this.rules.engineRevision??1))throw new Error('此世界使用尚不支持的引擎版本，停止加载');
        this.entities = [...world.npcs,...world.residents??[],...world.locations,...world.items,...world.professions,...world.skills,...world.spells,...world.recipes??[],...world.monsters??[],...world.bosses??[],...world.cultures??[],...world.deities??[],...world.factions??[],...world.history??[],...world.factionPeople??[],...world.eras??[],...world.regions??[],...world.festivals??[]];
        this.resolver = new EntityResolver(this.entities);
        this.byId = this.resolver.entities;
        const festivalErrors=validateFestivalRuntime(world);if(festivalErrors.length)throw Error(festivalErrors.join('；'));
        if((this.rules.engineRevision??1)===1)this.compat=new Phase1Engine(world);
        this.factionEffectConsumers={society_news:societyNewsConsumer,society_issue:societyIssueConsumer,spirit_society:spiritSocietyConsumer};this.wildlifeAwakening=wildlifeAwakeningConsumer;
    }
    resolve(name, kind, scope) {
        if(!kind||kind==='npc'){
            const candidates=[...new Set([...this.resolver.aliases.get(normalize(name))??[]].map(id=>actorId(this.world,id)))].filter(id=>!kind||id.startsWith('npc_'));
            const scoped=scope?candidates.filter(id=>this.byId.get(id)?.scope===scope||this.byId.get(id)?.location===scope):candidates;
            if(scoped.length===1)return scoped[0];
            if(!scoped.length&&candidates.length===1)return candidates[0];
        }
        const id = name === 'player' ? name : this.resolver.resolve(name, scope, kind);
        if (kind && !id.startsWith(kind + '_')) throw new Error(`需要${kind}类型编号`);
        return !kind?actorId(this.world,id):id;
    }
    initialFromLegacy(legacy, randomSeed = 'default-campaign', {prepare=true}={}) {
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
        const document={schemaVersion:2,worldVersion:this.world.version,randomSeed,memories:clone(legacy.memories),manualPins:clone(legacy.manualPins ?? {}),
            state:{minute:old.minute,location:this.resolve(old.location),player,inventory,skills,spells,professions:{combat,life,hidden:clone(old.professions?.hidden ?? [])},
                npcs,records,pets:clone(old.pets ?? {}),settlements:{loc_hw:{...clone(old.settlement),starvation:0}},
                buildings:{bld_hw_qingdeng:{owner:'npc_hw_linsui',condition:70}},projects:{},effects:{},obligations:{},quests:{},quotes:{},created:{},weather:{},turns:{},checks:{},learning:{},recipes:{}}};
        return prepare?initializeR1(document,this.world):document;
    }
    createCharacter(legacy,options,seed){return initializeR1(openSettlementLedgers(this,initializeAgriculture(this,createCharacter.call(this,legacy,options,seed))),this.world);}
    calendar(minute) {
        number(minute,0,Number.MAX_SAFE_INTEGER,'分钟');
        const day=Math.floor(minute/1440),month=Math.floor(day/30)%12,year=Math.floor(day/360)+1;
        const ten=this.rules.calendar.tens?.[Math.floor(day%30/10)],market=this.rules.calendar.marketDays?.includes(day%30+1)??false;
        return {year,month:month+1,day:day%30+1,hour:Math.floor(minute%1440/60),minute:minute%60,season:Math.floor(month/3),...(ten?{ten}:{}),market,
            text:`${this.rules.calendar.epoch}${year===1?'元':year}年 ${this.rules.calendar.months[month]} ${day%30+1}日 ${String(Math.floor(minute%1440/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`};
    }
    formatCalendar(minute){return this.calendar(minute).text;}
    async reduce(document,input,options={}) {
        if(this.compat)return this.compat.reduce(document,input);
        // T143: a campaign with generated far counties runs over its overlay world.
        const overlay=remoteEngine(this,document,world=>new WorldEngine(world));if(overlay!==this)return overlay.reduce(document,input,options);
        if (input.type==='schema_migration') return {patches:input.patches,result:{migration:true}};
        if(input.type==='release_migration'&&input.release==='R1'){const migration=planR1(document,this.world);return{patches:migration.patches,result:migration.report};}
        if(input.type==='rules_state_migration')return{patches:planRuleStateMigration(document,this.rules),result:{migration:true,runtimeRuleVersion}};
        if(input.type==='population_profile'){
            if(document.releaseVersion!==1)throw new Error('按需人物需要完成战役初始化');
            const d=new Draft(document),detail=acceptPopulationProfile(d,this.scoped(document),input);
            return{patches:d.patches,result:{ok:true,...detail,minute:d.get('state','minute'),notices:[]}};
        }
        if(input.type==='npc_plan'){
            if(document.releaseVersion!==1)throw new Error('人物计划需要完成战役初始化');
            const d=new Draft(document),session=this.scoped(document),id=text(input.eventId,120);
            session.replaying=Boolean(options.replay);session.replayResult=options.result;
            const detail=applyNpcPlan(d,session,input.plan,id);
            d.set(['state','npcPlanning'],{day:Math.floor(document.state.minute/1440),minute:document.state.minute,location:document.state.location,sourceEvent:id});
            return{patches:d.patches,result:{ok:true,...detail,...(intelligenceFresh(session)?{npcIntelligenceVersion:INTELLIGENCE_VERSION}:{}),minute:d.get('state','minute'),notices:stateNotices(document.state,d.get('state'),key=>session.byId.get(key)?.name)}};
        }
        const resolved=resolveToolCall(input.tool,input.args??{});
        const d = new Draft(document), args=resolved.args, id=text(input.eventId,120);
        const tool=resolved.tool.replace(/^world_/, '');
        const readOperations={weather:'inspect',environment:'inspect',pet:'inspect',summon:'inspect',farm:'inspect',wildlife:'observe',lair:'observe',site:'inspect'};
        const noTimeTurn=tool==='turn'&&(args.outOfCharacter||args.extraMinutes===0);
        if(noTimeTurn||(readOperations[tool]&&(args.operation??readOperations[tool])===readOperations[tool])){
            const detail=await this.scoped(document)[tool](d,args,id);
            return {patches:d.patches,result:{ok:true,...detail,minute:d.get('state','minute'),messages:d.messages,notices:[]}};
        }
        if(document.releaseVersion!==1){
            if(!options.replay)throw new Error('此战役尚未完成 R1 初始化，请先在副本上显式迁移');
            for(const patch of planPreR1Partitions(document,this.world))d.set(patch.path,patch.value);
        }
        settleAgricultureExpiry(d,this);
        enforceLegalRestriction(d,tool,args);
        if (!['trade','time','move','turn','health','revive','revival','check','practice','cast','learn','profession','attributes','relation','promise','remember',...Object.keys(activities)].includes(tool)) throw new Error('未知工具职责');
        if(d.get('state','player','status')==='死亡'&&!['time','turn','revive'].includes(tool))throw new Error('你已经死亡，需要在登记点醒来后行动');
        if(d.get('state','player','status')==='濒死'&&!['time','turn','health','cast'].includes(tool))throw new Error('你处于濒死状态，只能等待救治或尝试自救');
        const session=this.scoped(document);session.airDraft=d;session.replaying=Boolean(options.replay);session.replayResult=options.result;session.npcObligationAction={tool,args};
        if(!['time','turn','revive','health'].includes(tool))assertMindAwake(d);
        if(tool==='combat'){
            const target=session.resolve(args.target);
            for(const task of Object.values(d.get('state','npcAutonomy','tasks')??{}))if(task.status==='进行中'&&[task.npc,task.action.seller].includes(target))d.set(['state','npcAutonomy','tasks',task.id],{...task,status:'中断',reason:'交锋打断了正在进行的工作',interruptedAt:d.get('state','minute'),sourceEvent:id});
        }
        settleMagicAreas(d,session);
        const detail = await session[tool](d,args,id);
        if(document.state.location!==d.get('state','location')&&d.get('state','records','site_presence'))d.remove(['state','records','site_presence']);
        // 返场：记下离开各地的时间，久别回来时汇总当地变化。
        if(document.state.location!==d.get('state','location'))recordReturnVisit(d,session,document.state,id);
        // Entering an unexpanded district or lair settles its seeded roster once.
        // Older ledger events replay without it, exactly as they were recorded.
        // T143: the first arrival in a far county generates its skeleton once.
        const remote=document.state.location!==d.get('state','location')&&(!options.replay||options.result?.remote)?unfoldRemoteAt(d,session,d.get('state','location')):null;
        const population=document.state.location!==d.get('state','location')&&(!options.replay||options.result?.population)?unfoldPopulationAt(d,session,d.get('state','location')):null;
        if(document.state.location!==d.get('state','location')&&Object.keys(d.get('state','remote')??{}).length&&advanceLayersFresh(session)){
            const arrival=this.scoped(d.document),now=d.get('state','minute');
            arrival.replaying=session.replaying;arrival.replayResult=session.replayResult;
            advanceNpcSchedules(d,arrival,now,now,{promote:true});
        }
        settleMagicAreas(d,session);
        advancePets(d,session,d.get('state','minute'));
        advanceSummons(d,d.get('state','minute'));
        advanceLaw(d,d.get('state','minute'),session);
        const worldEvent={tool,args,detail,eventId:id,before:document.state,legacy:Boolean(options.replay)&&options.result!==undefined&&options.result?.worldEventVersion!==WORLD_EVENT_VERSION,noop:!d.patches.length};
        // A read-only instant look (inspect, view) changes nothing and is no world event.
        const readOnly=detail?.actionScope?.kind==='instant'&&!d.patches.length;
        if(!readOnly)publishWorldEvents(d,session,deriveWorldEvents(session,document.state,d.get('state'),worldEvent),worldEvent);
        recordBusinessReceipt(d,document.state,{tool:resolved.tool,args,eventId:id,detail});
        settlePopulationLayers(d,session);
        if(tool==='check')detail.actionScope={kind:'judgement',healthChanged:false,inventoryChanged:false,feePaid:0,
            note:'仅结算判断或对抗，并履行已引用的协助；未伤人、毁物或制造。不得从骰点虚构这些变化。'};
        return { patches:d.patches,result:{ok:true,...detail,...(remote?{remote}:{}),...(population?{population}:{}),legalProcedureVersion:1,...(!session.replaying||session.replayResult?.educationVersion===1?{educationVersion:1}:{}),...(!session.replaying||session.replayResult?.npcCrimeVersion===NPC_CRIME_VERSION?{npcCrimeVersion:NPC_CRIME_VERSION}:{}),worldEventVersion:WORLD_EVENT_VERSION,...(intelligenceFresh(session)?{npcIntelligenceVersion:INTELLIGENCE_VERSION}:{}),...(factionClockRules(session).length?{factionClockVersion:1}:{}),...(session.rules.questSources?{questSourcesVersion:QUEST_SOURCES_VERSION}:{}),...(session.rules.tribalAwakening?{tribalAwakeningVersion:TRIBAL_AWAKENING_VERSION}:{}),...(session.rules.military?{militaryVersion:MILITARY_VERSION}:{}),...(session.rules.warDiplomacy?{warVersion:WAR_VERSION}:{}),minute:d.get('state','minute'),messages:d.messages,
            ...(session.rules.questSources?.wildlife?.length&&villageWildlifeFresh(session)?{villageWildlifeVersion:1}:{}),
            ...(!session.replaying||session.replayResult?.sovereigntyVersion===1?{sovereigntyVersion:1}:{}),
            ...(!session.replaying||session.replayResult?.laborMarketVersion===1?{laborMarketVersion:1}:{}),
            ...(Object.keys(d.get('state','remote')??{}).length&&advanceLayersFresh(session)?{advanceLayerVersion:1}:{}),
            ...(Object.keys(d.get('state','remote')??{}).length&&populationLayersFresh(session)?{populationLayerVersion:1}:{}),
            notices:stateNotices(document.state,d.document.state,id=>session.byId.get(id)?.name)} };
    }
    scoped(document){
        const overlay=remoteEngine(this,document,world=>new WorldEngine(world));if(overlay!==this)return overlay.scoped(document);
        const created=Object.values(document.state.created??{});
        const player={id:'player',name:document.state.player.name,aliases:['玩家','玩家角色'],scope:document.state.location};
        const session=Object.create(this);session.entities=[...this.entities,...created,player];session.resolver=this.resolver.extend([...created,player]);session.byId=session.resolver.entities;return session;
    }
    actor(d,id) { return d.get(...this.actorPath(id)); }
    npcObligationAt(state,npcId,minute){return npcObligationAt(state,npcId,minute);}
    assertNpcObligationAction(d,actors,action){return assertNpcObligationAction(d,this,actors,action);}
    npcAutonomyBusy(state,id,minute){return npcAutonomyBusy(state,id,minute);}
    assertNpcAutonomyAction(state,actors,action){return assertNpcAutonomyAction(state,actors,action);}
    actorPath(id) { return actorPath(this.world,id); }
    bagPath(id) { return id==='player' ? ['state','inventory'] : [...this.actorPath(id),'inventory']; }
    quantity(d,id,item) { const value=d.get(...this.bagPath(id),item); return typeof value==='number'?value:value?.quantity ?? 0; }
    itemDelta(d,id,item,delta) {
        return changeItems(d,this,id,item,delta);
    }
    async trade(d,args,id) {
        if(args.operation==='transport')return transportAction(d,this,args,id);
        if(args.operation==='post')return postAction(d,this,args,id);
        if(['smuggle','deliver_smuggled'].includes(args.operation))return smuggleTrade.call(this,d,args,id);
        if(CREDIT_OPERATIONS.has(args.operation))return creditTrade.call(this,d,args,id);
        if(args.operation&&args.operation!=='trade')return businessTrade.call(this,d,args,id);
        if(args.service!==undefined&&args.service!=='住宿')throw new Error('未登记该服务；住宿请传 service="住宿" 与 days，购买物品请传 item 与 quantity');
        const buyer=this.resolve(args.buyer ?? 'player'),seller=this.resolve(args.seller);
        if(buyer===seller) throw new Error('交易双方不能相同');
        if(!this.actor(d,buyer)||!this.actor(d,seller)) throw new Error('交易对象不在战役中');
        for(const actor of[buyer,seller])if(['死亡','濒死'].includes(this.actor(d,actor).status))throw new Error('交易一方无法清醒履约');
        const playerLocation=d.get('state','location');
        for(const actor of [buyer,seller]) if(actor!=='player' && this.actor(d,actor).location!==playerLocation) throw new Error('交易对方不在场');
        assertSocietyTrade(d,this,buyer,seller);
        if(args.payment==='repay')return isCreditDebt(d.get('state','records',args.debt))?repayCredit(d,this,{seller,debt:args.debt,coins:args.coins},id):repayDebt(d,this,{buyer,seller,debt:args.debt},id);
        // Any location registering lodging:{host,kind,rooms} rents rooms at the economy anchors.
        const place=args.service==='住宿'&&buyer==='player'?lodgingOf(this,seller,playerLocation):null;
        if(args.service==='住宿'&&!place)throw new Error('这个人没有登记住宿服务');
        for(const actor of [buyer,seller])if(actor!=='player'&&!place)assertNpcService(d,this,actor,'trade',5);
        if(place){
            if(facilityView(this,d.get('state'),place.id)?.factor===0)throw Error('住宿建筑已停用');
            assertLodgingHost(d,this,seller,place,args.consent);
            const economy=this.rules.economy,host=this.byId.get(seller).name;
            const days=number(args.days??1,1,7,'住宿天数'),cost=days===7?place.lodging.weeklyCopper??economy.rentalCopperPerWeek:days*(place.lodging.nightlyCopper??economy.rentalCopperPerNight);
            if((args.payment??'cash')==='cash'&&this.actor(d,buyer).coins<cost)throw new Error('房钱不足');
            const payment=chargeTrade(d,this,{buyer,seller,cost,payment:args.payment,creditMinutes:args.creditMinutes,description:`${place.name}房钱`},id);
            const starts=Math.max(d.get('state','minute'),...Object.values(d.get('state','records')).filter(row=>row.category==='contract'&&row.room===place.id&&row.parties?.includes('player')&&row.status==='有效').map(row=>row.expires));
            const contract=`contract_room_${id}`,access=grantLodgingAccess(d,this,place,seller,{starts,expires:starts+days*1440,eventId:id});
            d.set(['state','records',contract],{category:'contract',name:`${place.name}住宿`,parties:['player',seller],room:place.id,
                starts,expires:starts+days*1440,paid:payment.debt?0:cost,...(payment.debt?{debt:payment.debt}:{}),...(access?{authorization:access}:{}),status:'有效',content:payment.debt?`${host}同意赊账${cost}铜，允许旅人住${days}天。`:`${host}收到${cost}铜，允许旅人住${days}天。`});
            this.advance(d,10,id);d.say(`住宿${days}天，${payment.debt?'赊账':'支付'}${cost}铜`);return {contract,cost,days,...payment};
        }
        if(!args.item)throw new Error('缺少交易项目；住宿请传 service="住宿" 与 days，购买物品请传 item 与 quantity');
        const item=this.resolve(args.item,'item');
        const quantity=number(args.quantity,1,100000,'数量'), catalog=this.byId.get(item);
        const quoteKey=`${Math.floor(d.get('state','minute')/1440)}_${seller}_${buyer}_${item}`;
        const existing=d.get('state','quotes',quoteKey);
        // Day list price: region/transport/season x wildlife x shop markup x regard; bargaining moves it within rules.economy.priceFactorLimits.bargain.
        const quote=tradeQuote(d,this,{buyer,seller,item,location:playerLocation,base:()=>Math.ceil(regionalTradePrice(d,this,item,playerLocation)*wildlifePriceFactor(this,d.document,item,playerLocation))});
        const [bargainLow,bargainHigh]=this.rules.economy.priceFactorLimits.bargain;
        const price=existing ?? number(args.unitPrice ?? quote.listPrice,Math.ceil(quote.listPrice*bargainLow),Math.ceil(quote.listPrice*bargainHigh),'单价');
        const cost=quantity*price;
        if(this.quantity(d,seller,item)<quantity) throw new Error(`对方库存不足：${catalog.name}只剩${this.quantity(d,seller,item)}`);
        const payment=chargeTrade(d,this,{buyer,seller,cost,payment:args.payment,creditMinutes:args.creditMinutes,description:`${catalog.name}货款`},id);
        const moved=transferItems(d,this,seller,buyer,item,quantity,args.instances??null);
        const tax=payment.debt?{amount:0}:assessTradeTax(d,this,{seller,cost,location:playerLocation,sourceEvent:id});
        const basis=recordFinanceSale(d,this,{buyer,seller,item,quantity,cost,tax:tax.amount,eventId:id,paid:!payment.debt});
        if(payment.debt)d.set(['state','records',payment.debt],{...d.get('state','records',payment.debt),sale:{buyer,seller,item,quantity,cost,basis,location:playerLocation}});
        d.set(['state','quotes',quoteKey],price);recordDeal(d,quote,price,quantity,id);this.advance(d,5,id);d.say(`${catalog.name}×${quantity}，${payment.debt?'赊账':'成交'}${cost}铜`);
        return {buyer,seller,item,quantity,cost,instances:moved.instances,...(tax.amount?{tax}:{}),...payment};
    }
    advance(d,minutes,id) {
        // P2: one elapsed-time event shares each region's yearly weather
        // sequence (rules and seed cannot change inside it) across schedules.
        // Route topology (locations, routes) is likewise fixed for its duration.
        if(this.weatherSequences)return this.advanceElapsed(d,minutes,id);
        this.weatherSequences=new Map();this.advanceGraphs=new Map();
        this.advanceHouseholds=beginHouseholdReads(this);
        this.advanceFeatures=this.world.locations.flatMap(place=>(place.features??[]).map(feature=>({...feature,location:place.id})));
        try{return this.advanceElapsed(d,minutes,id);}finally{this.weatherSequences=null;this.advanceGraphs=null;this.advanceHouseholds=null;this.advanceFeatures=null;}
    }
    advanceElapsed(d,minutes,id) {
        minutes=number(minutes,0,43200,'耗时');
        if(['trade','learn','practice','profession','craft','repair','research','cast','pet','summon','environment','farm','wildlife','site'].includes(this.npcObligationAction?.tool))assertNpcObligationAction(d,this,['player'],{minutes});
        const end=d.get('state','minute')+minutes;
        initializeWorldClocks(d,this,d.get('state','minute'),end);
        initializeFactionClocks(d,this,d.get('state','minute'),end);
        advanceSettlementTrade(d,this,d.get('state','minute'));
        if(!advanceNeedsSteps(this,d,d.get('state','minute')))return this.advanceInterval(d,minutes,id);
        if(!minutes)return this.advanceInterval(d,0,id);
        const patchStart=d.patches.length,npcsBefore=d.get('state','npcs');
        while(d.get('state','minute')<end){
            const now=d.get('state','minute');
            const next=nextAdvanceMinute(this,d,now,end);
            this.advanceInterval(d,next-now,id);
        }
        // Intermediate clock boundaries matter to simulation, not to replay.
        // Keep one final NPC patch per changed person in this elapsed-time event.
        const changed=new Set(d.patches.slice(patchStart).filter(p=>p.path[0]==='state'&&p.path[1]==='npcs').map(p=>p.path[2]));
        const retained=d.patches.slice(patchStart).filter(p=>!(p.path[0]==='state'&&p.path[1]==='npcs'));
        d.patches.length=patchStart;
        for(const patch of retained)d.patches.push(patch);
        for(const npc of changed)if(canonical(npcsBefore[npc])!==canonical(d.get('state','npcs',npc)))d.patches.push({op:'set',path:['state','npcs',npc],value:d.get('state','npcs',npc)});
    }
    advanceInterval(d,minutes,id){
        const beforeState=d.get('state'),before=beforeState.minute,after=before+minutes;d.set(['state','minute'],after);
        runAdvance(this,d,{before,after,id,beforeState,days:Math.floor(after/1440)-Math.floor(before/1440)});
    }
    time(d,args,id) {
        if(d.get('state','player','status')==='死亡')this.revive(d,{},id);
        if(args.minutes!==undefined&&args.until!==undefined)throw new Error('minutes 与 until 只能选一个');
        let duration=args.minutes;
        if(args.until!==undefined){
            const until=args.until;if(!until||typeof until!=='object'||Array.isArray(until))throw new Error('until 需要 dayOffset、hour 和可选 minute');
            const day=number(until.dayOffset,0,30,'相对日期'),hour=number(until.hour,0,23,'小时'),minute=number(until.minute??0,0,59,'分钟');
            const now=d.get('state','minute');duration=(Math.floor(now/1440)+day)*1440+hour*60+minute-now;
            if(duration<=0)throw new Error('目标钟点必须晚于现在，请核对 dayOffset');
        }
        const minutes=number(duration,1,43200,'耗时');
        if(['睡眠','休息'].includes(args.activity))d.set(['state','records','mind_rest_activity'],true);
        this.advance(d,minutes,id);
        if(d.get('state','records','mind_rest_activity'))d.remove(['state','records','mind_rest_activity']);
        if(args.activity==='睡眠'||args.activity==='休息') {
            const p=d.get('state','player');if(p.status==='正常'){
                d.set(['state','player','hp'],Math.min(p.maxHp,p.hp+Math.floor(minutes/30)));
                d.set(['state','player','mp'],Math.min(p.maxMp,p.mp+Math.floor(minutes/30)));
            }
        }
        return {elapsed:minutes,date:this.calendar(d.get('state','minute')).text,...(!this.replaying||this.replayResult?.wildlifeEncounterVersion===1?{wildlifeEncounterVersion:1,encounters:wildlifeEncounterView(d.document)}:{})};
    }
    route(from,to,mode,minute,seed='default-campaign',weatherCache=null,graphCache=null) {
        // A facility completed by a public project stands inside its site: reach the site, then step in.
        const built=id=>this.world.locations.some(l=>l.id===id)?null:this.byId?.get(id)?.builtProject?this.byId.get(id).parent:null;
        if(built(to)||built(from)){
            const r=this.route(built(from)??from,built(to)??to,mode,minute,seed,weatherCache,graphCache),step=(built(to)?2:0)+(built(from)?2:0);
            r.minutes+=step;r.movingMinutes+=step;return r;
        }
        const distances=new Map([[from,0]]), movingTimes=new Map([[from,0]]), previous=new Map(),costs=new Map([[from,0]]);
        const season=this.calendar(minute).season,key=`${mode}:${season}`;
        // Callers may reuse topology only within one synchronous schedule
        // advance; weather and per-person departure times are never cached here.
        graphCache=graphCache??this.advanceGraphs??null;
        let graph=graphCache?.get(key);
        if(!graph){
            const order=new Map(this.world.locations.map((place,index)=>[place.id,index])),adjacent=new Map();
            for(const edge of this.world.routes){
                if(!edge.modes.includes(mode)||edge.closedSeasons.includes(season))continue;
                for(const node of [edge.from,edge.to]){if(!adjacent.has(node))adjacent.set(node,[]);adjacent.get(node).push(edge);}
            }
            graph={order,adjacent,oriented:new Map()};graphCache?.set(key,graph);
        }
        const {order,adjacent}=graph,settled=new Set(),oriented=graph.oriented??new Map(),closedRoutes=warClosedRoutes(this.airDraft?.get('state'),minute),facilities=facilityRouteStates(this,this.airDraft?.get('state'));
        // P2: each edge as seen from one end, built once per topology (read-only).
        const from_=(edge,node)=>{let ends=oriented.get(edge);if(!ends){ends=new Map();oriented.set(edge,ends);}let row=ends.get(node);if(!row){row={...edge,from:node};ends.set(node,row);}return row;};
        // P2: a binary heap of discovered nodes ordered by (distance, world
        // location order). Equal distances retain the original world-location
        // order, including its chosen path and toll total; an entry whose node
        // has since been settled or improved is skipped.
        const heap=[],before=(a,b)=>a[0]<b[0]||a[0]===b[0]&&a[1]<b[1];
        const push=node=>{
            const entry=[distances.get(node),order.get(node),node];let i=heap.push(entry)-1;
            while(i>0){const parent=(i-1)>>1;if(!before(entry,heap[parent]))break;heap[i]=heap[parent];i=parent;}heap[i]=entry;
        };
        const pop=()=>{
            const top=heap[0],last=heap.pop();if(!heap.length)return top;
            let i=0;for(;;){const l=2*i+1,r=l+1;let next=i,best=last;
                if(l<heap.length&&before(heap[l],best)){next=l;best=heap[l];}
                if(r<heap.length&&before(heap[r],best)){next=r;}
                if(next===i)break;heap[i]=heap[next];i=next;}
            heap[i]=last;return top;
        };
        if(order.has(from))push(from);
        while(heap.length){
            const [nearest,,current]=pop();
            if(settled.has(current)||nearest!==distances.get(current))continue;
            settled.add(current);if(current===to)break;
            for(const edge of adjacent.get(current)??[]){
                if(closedRoutes.has(edge.id))continue;
                if(facilities.get(edge.id)?.factor===0)continue;
                const next=edge.from===current?edge.to:edge.to===current?edge.from:null;if(!next||!order.has(next)||settled.has(next))continue;
                const speed=(edge.speedKmh??(mode==='cart'?this.rules.travel.cartKmh:this.rules.travel.walkKmh*(mode==='horse'?this.rules.travel.horseMultiplier:1))*(edge.terrainMultiplier??1))*(facilities.has(edge.id)?1.25*facilities.get(edge.id).factor:1);
                const travel=this.rules.weather?weatherEdge(this,seed,from_(edge,current),mode,minute,distances.get(current),movingTimes.get(current),speed,weatherCache):null;
                if(this.rules.weather&&!travel)continue;
                const elapsed=Math.max(1,Math.ceil(edge.lengthKm/speed*60)),candidate=travel?.elapsed??distances.get(current)+elapsed;
                if(candidate<(distances.get(next)??Infinity)){distances.set(next,candidate);movingTimes.set(next,travel?.moving??movingTimes.get(current)+elapsed);previous.set(next,{node:current,edge});costs.set(next,costs.get(current)+edge.toll);push(next);}
            }
        }
        if(!distances.has(to))throw new Error('没有当前季节可通行的路线，不能瞬移');
        const edges=[],segments=[];let cursor=to;while(cursor!==from){const step=previous.get(cursor);edges.unshift(step.edge.id);segments.unshift({id:step.edge.id,from:step.node,to:cursor,minutes:movingTimes.get(cursor)-movingTimes.get(step.node),elapsed:distances.get(cursor),moving:movingTimes.get(cursor),cost:costs.get(cursor)});cursor=step.node;}
        const moving=movingTimes.get(to),daysRest=this.rules.weather||mode==='boat'?0:Math.floor((moving-1)/this.rules.travel.dailyTravelMinutes)*(1440-this.rules.travel.dailyTravelMinutes);
        const result={minutes:distances.get(to)+daysRest,movingMinutes:moving,cost:costs.get(to),edges};
        const adjusted=this.airDraft?adjustAirTravel(this.airDraft,this,result,mode,{minute,from,segments,sail:this.npcObligationAction?.tool==='move'}):result;
        if(this.npcObligationAction?.tool==='move')Object.defineProperty(adjusted,'checkpoints',{value:segments.map((segment,index)=>{
            const rest=this.rules.weather||mode==='boat'?0:Math.floor((segment.moving-1)/this.rules.travel.dailyTravelMinutes)*(1440-this.rules.travel.dailyTravelMinutes);
            const prefix={minutes:segment.elapsed+rest,movingMinutes:segment.moving,cost:segment.cost,edges:edges.slice(0,index+1)};
            return{location:segment.to,route:this.airDraft?adjustAirTravel(this.airDraft,this,prefix,mode,{minute,from,segments:segments.slice(0,index+1),sail:this.npcObligationAction?.tool==='move'}):prefix};
        })});
        return adjusted;
    }
    move(d,args,id) {
        if(Object.values(d.get('state','records')??{}).some(r=>r.category==='transport'&&['booked','moving','delayed','intercepted'].includes(r.status)&&r.passengers?.includes('player')))throw Error('仍在承运班次中，须抵达或处理滞留后再自行移动');
        for(const target of ['player',...d.get('state','player','companions')??[]])assertMindAwake(d,target);
        for(const target of ['player',...d.get('state','player','companions')??[]])assertWaterEarthMovement(d,target);
        for(const target of ['player',...d.get('state','player','companions')??[]])assertLightMovement(d,this,target);
        let destination=this.resolve(args.destination);const requestedDestination=destination,old=d.get('state','location');
        if(old===destination)return {destination,elapsed:0};
        let route=this.route(old,destination,args.mode??'walk',d.get('state','minute'),d.document.randomSeed);
        const local=d.get('state','records','local_player_position'),mudMinutes=waterEarthWalkMinutes(d,this,local?.location===old?local.point:[0,0],local?.location===old?local.point:[0,0]);
        const attempts=[];let encounterAttempt=null;
        for(const checkpoint of route.checkpoints){
            const attempt=wildlifeEncounterAt(d,this,checkpoint.location,d.get('state','minute')+checkpoint.route.minutes+mudMinutes);
            if(attempt)attempts.push(attempt);
            if(attempt?.kind){encounterAttempt=attempt;destination=checkpoint.location;route=checkpoint.route;break;}
        }
        route.minutes+=mudMinutes;
        for(const edgeId of route.edges){const edge=this.world.routes.find(r=>r.id===edgeId);assertMindSpacePath(d,this,edge.from,[0,0],[0,0],{destination:edge.to,eventId:id,signal:true});}
        assertFireTravel(d,this,route);
        const entered=new Set(route.edges.flatMap(edgeId=>{const edge=this.world.routes.find(row=>row.id===edgeId);return[edge.from,edge.to];}));entered.delete(old);
        for(const place of entered)assertLocationAccess(d,this,place,{authorization:args.authorization,companions:d.get('state','player','companions')??[],arrivalMinute:d.get('state','minute')+route.minutes});
        assertNpcObligationAction(d,this,['player',...d.get('state','player','companions')??[]],{minutes:route.minutes,location:destination,kind:'move'});
        if(this.rules.petCare)preparePetTravel(d,this,args.mode??'walk',route.movingMinutes);
        if(d.get('state','player','coins')<route.cost)throw new Error('路费不足');
        d.set(['state','player','coins'],d.get('state','player','coins')-route.cost);
        d.set(['state','location'],destination);
        if(d.get('state','records','local_player_position'))d.remove(['state','records','local_player_position']);
        const discovered=Boolean(d.get('state','discoveries',destination));
        d.set(['state','discoveries',destination],{minute:d.get('state','minute')+route.minutes,source:'亲历'});
        for(const npc of d.get('state','player','companions')){
            d.set(['state','npcs',npc,'location'],destination);
            if(d.get('state','records',`local_actor_position:${npc}`))d.remove(['state','records',`local_actor_position:${npc}`]);
        }
        movePets(d,this,old,destination,route.movingMinutes);moveSpiritCompanions(d,old,destination);
        for(const[key,effect]of Object.entries(d.get('state','effects')))if(effect.kind==='summon'&&effect.owner==='player'&&effect.location===old)d.set(['state','effects',key,'location'],destination);
        this.npcObligationAction.arrivalMinute=d.get('state','minute')+route.minutes;
        const areaTravel=Object.values(d.get('state','effects')??{}).some(e=>e.kind==='area');
        if(areaTravel)d.set(['state','records','magic_area_transit'],{category:'magic_area_transit',subjects:['player',...d.get('state','player','companions')],start:d.get('state','minute'),arrival:this.npcObligationAction.arrivalMinute,source:id});
        strainCare(d,this,'player',route.movingMinutes);
        this.advance(d,route.minutes,id);
        inspectSmuggling(d,this,route,id);
        let encounter=null;
        for(const attempt of attempts){const seen=settleWildlifeEncounter(d,this,attempt,id);if(seen)encounter=seen;}
        if(areaTravel)d.remove(['state','records','magic_area_transit']);
        const experience=discovered?{experience:0}:milestone(d,this,'discovery',destination,id);
        for(const [key,obligation]of Object.entries(d.get('state','obligations')))if(obligation.type==='带路'&&obligation.destination===destination&&obligation.status==='进行中'){
            d.set(['state','obligations',key,'status'],'已完成');d.say(`${this.byId.get(obligation.promisor).name}的带路约定已完成`);
            const stillGuiding=Object.values(d.get('state','obligations')).some(row=>row.type==='带路'&&row.promisor===obligation.promisor&&row.status==='进行中');
            if(!stillGuiding&&this.byId.get(obligation.promisor)?.schedule)d.set(['state','player','companions'],d.get('state','player','companions').filter(npc=>npc!==obligation.promisor));
        }
        // Daily ecology or migration can remove a predicted animal while travelling.
        // A vanished lead must not strand the player at an otherwise unrequested stop.
        if(encounterAttempt&&!encounter&&destination!==requestedDestination&&d.get('state','location')===destination&&d.get('state','player','status')==='正常'){
            const rest=this.move(d,{...args,destination:requestedDestination},id);
            return{...rest,minutes:route.minutes+rest.minutes,movingMinutes:route.movingMinutes+rest.movingMinutes,cost:route.cost+rest.cost,
                edges:[...route.edges,...rest.edges],experience:experience.experience+(rest.experience??0),...(route.airMinutes||rest.airMinutes?{airMinutes:(route.airMinutes??0)+(rest.airMinutes??0)}:{})};
        }
        return {destination,...route,...experience,companions:d.get('state','player','companions'),...(!this.replaying||this.replayResult?.wildlifeEncounterVersion===1?{wildlifeEncounterVersion:1,requestedDestination,interrupted:Boolean(encounterAttempt)&&destination!==requestedDestination,encounter}: {})};
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
        const result=revivePlayer.call(this,d,args,id);
        if(d.get('state','records','local_player_position'))d.remove(['state','records','local_player_position']);
        return result;
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
            // Masterpiece, completed research or a key battle recorded by career metrics.
            const evidence=evidenceBreakthrough(d,this,skill,args.breakthroughSource,old);if(evidence)return evidence;
            const teacher=this.resolve(args.breakthroughSource,'npc'),base=this.byId.get(teacher),role=this.byId.get(skill).profession;
            if(!personTeaching(this,d.get('state'),teacher,skill)||d.get('state','npcs',teacher,'location')!==d.get('state','location'))throw new Error('突破导师不具备资格或不在场');
            assertNpcService(d,this,teacher,'teach',120);
            if(old.proficiency%300!==299)throw new Error('尚未达到当前阶段上限');
            if(!certifiedForSkill(d,this,skill))throw new Error('未认证职业不能跨越初级阶段');
            const outcome=this.check(d,{attribute:this.byId.get(skill).attribute,difficulty:20},id);
            this.advance(d,120,id);
            if(outcome.success)d.set(['state','skills',skill,'breakthroughs'],[...new Set([...old.breakthroughs??[],stage+1])]);
            return {skill,breakthrough:outcome.success,...outcome};
        }
        const daily=clone(old.daily??{}),row=daily[day]??{gain:0,targets:{}},target=text(args.target??'普通练习',100),repeats=row.targets[target]??0;
        const requested=number(args.gain??3,0,100,'练习收益');
        const gain=Math.max(0,Math.min(Math.floor(requested*0.5**repeats),this.rules.practice.dailyCaps[stage]-row.gain));
        const role=this.byId.get(skill).profession;
        const certified=certifiedForSkill(d,this,skill);
        if(!certified&&old.proficiency>299)return {skill,gain:0,proficiency:old.proficiency,effectiveProficiency:299,retained:true};
        const limit=Math.min(certified?2699:299,(old.breakthroughs??[]).includes(stage+1)?(stage+2)*300-1:(stage+1)*300-1);
        const proficiency=Math.min(limit,old.proficiency+gain),actual=proficiency-old.proficiency;
        row.gain+=actual;row.targets[target]=repeats+1;daily[day]=row;
        for(const key of Object.keys(daily))if(Number(key)<Number(day)-1)delete daily[key];
        d.set(['state','skills',skill],{...old,proficiency,grade:skillGrade(proficiency),daily});d.say(`${this.byId.get(skill).name}熟练度 +${actual}`);
        const paths=proficiency%300===299?breakthroughPaths(d.get('state'),skill,proficiency):[];
        return {skill,gain:actual,proficiency,needsBreakthrough:proficiency%300===299,...(paths.length?{breakthroughPaths:paths}:{})};
    }
    applyMagicArea(d,catalog,args,id,source='player'){
        return applyAreaMagic.call(this,d,prepareAreaMagic.call(this,d,catalog,args,{source}),id);
    }
    magicTargetFacts(d,target){return targetFacts(d,this,target);}
    magicAreaTargetFacts(d,target,location,center){return areaTargetFacts(d,this,target,location,center);}
    magicStatusContext(d,target){return statusContext(d,this,target);}
    cast(d,args,id) {
        const spell=this.resolve(args.spell,'spell'),known=d.get('state','spells',spell),catalog=this.byId.get(spell);
        if(!known)throw new Error('尚未学会这个法术');
        const band=this.rules.magic.stageMpRanges[catalog.stage];
        if(!band||catalog.mp<band[0]||catalog.mp>band[1])throw new Error('法术消耗不符合阶段规则');
        const prepared=prepareMagic.call(this,d,catalog,args);
        if(d.get('state','player','status')==='濒死'&&(!(catalog.effectSpec?.kind==='heal'||catalog.effectSpec?.kind==='care'&&['stabilize','hemostasis','clean_wound'].includes(catalog.effectSpec.operation))||prepared?.target!=='player'))throw new Error('濒死时只能尝试对自己施放救治法术');
        if(d.get('state','player','mp')<catalog.mp)throw new Error('魔力不足');
        for(const material of catalog.materials)if(this.quantity(d,'player',material.item)<material.amount)throw new Error(`缺少材料${this.byId.get(material.item).name}`);
        d.set(['state','player','mp'],d.get('state','player','mp')-catalog.mp);
        for(const material of catalog.materials)this.itemDelta(d,'player',material.item,-material.amount);
        const result=this.check(d,{attribute:'精神',skill:catalog.skill,difficulty:catalog.difficulty},id);
        const legalCase=recordSpellViolation(d,this,catalog,args,prepared?.target??prepared?.id,id);
        this.advance(d,catalog.minutes,id);this.practice(d,{skill:catalog.skill,gain:3,target:args.target??'施法'},id);
        if(result.success&&catalog.duration&&!prepared)d.set(['state','effects',id],{spell,target:text(args.target??'近处物体',200),expires:d.get('state','minute')+catalog.duration});
        const effect=result.success?applyMagic.call(this,d,prepared,id):{};
        if(!result.success&&result.degree==='大失败'&&catalog.failureDamage)this.health(d,{delta:-catalog.failureDamage},id);
        const completed=result.success&&!effect.effectFailed;
        // U10: village-scale economy of life magic (ledger, regulation).
        const economy=completed?recordMagicEconomy.call(this,d,catalog,effect,id):null;
        d.say(`${catalog.name}${completed?'施放成功':'施放失败'}，消耗${catalog.mp}魔力`);
        return {spell,...result,...effect,...(legalCase?{case:legalCase}:{}),checkSuccess:result.success,success:completed,mpCost:catalog.mp,...(economy?{economy}:{})};
    }
    learn(d,args,id) {
        return learn.call(this,d,args,id);
    }
    profession(d,args,id){
        return profession.call(this,d,args,id);
    }
    attributes(d,args,id){return allocateAttributes.call(this,d,args,id);}
    relation(d,args,id) {
        const recorded=applyNpcRelation(d,this,args,id);if(recorded)return recorded;
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
        const permission=homePermission(d,this,args,id);if(permission)return permission;
        const reserved=createNpcObligation(d,this,args,id);if(reserved)return reserved;
        const promisor=this.resolve(args.promisor),promisee=this.resolve(args.promisee??'player'),type=args.type;
        if(!['带路','送货','付款','等候','会面','协助'].includes(type))throw new Error('义务类别不支持；type 可选：带路、送货、付款、等候、会面、协助');
        if(promisor!=='player'&&!d.get('state','npcs',promisor))throw new Error('承诺者不在战役中');
        for(const actor of[promisor,promisee])if(['死亡','濒死'].includes(this.actor(d,actor)?.status))throw new Error('义务当事人无法清醒履约');
        for(const actor of[promisor,promisee])if(actor!=='player'&&personConstraint(this,d.get('state'),actor))throw new Error('义务当事人正在依法拘留，不能自由行动');
        const obligation={id:`obl_${id}`,type,promisor,promisee,content:text(args.content),status:'待履行',deadline:number(args.deadline??d.get('state','minute')+1440,0,Number.MAX_SAFE_INTEGER)};
        let routePreview;
        if(type==='带路'){
            obligation.destination=this.resolve(args.destination);
            const from=d.get('state','location'),calculatedAt=d.get('state','minute'),route=this.route(from,obligation.destination,'walk',calculatedAt,d.document.randomSeed);
            routePreview={from,destination:obligation.destination,minutes:route.minutes,movingMinutes:route.movingMinutes,cost:route.cost,calculatedAt,estimate:true};
            if(promisor==='player'||d.get('state','npcs',promisor,'location')!==d.get('state','location'))throw new Error('带路者必须在场');
            obligation.status='进行中';d.set(['state','player','companions'],[...new Set([...d.get('state','player','companions'),promisor])]);
        }
        if(type==='送货'){obligation.item=this.resolve(args.item,'item');obligation.quantity=number(args.quantity,1,100000);}
        if(type==='付款'){
            obligation.coins=number(args.coins,1,1e9);
            if(!this.replaying){
                const existing=Object.entries(d.get('state','records')??{}).find(([,row])=>row.category==='debt'&&row.debtor===promisor&&row.creditor===promisee&&row.status!=='已还清'&&row.amount-row.paid===obligation.coins);
                if(existing)throw new Error(`这笔付款已有欠款记录 ${existing[0]}，不能再登记会重复扣款的付款约定；还款请按该欠款编号办理，赊账期限应在交易时用 creditMinutes 设置`);
            }
        }
        if(type==='协助'){
            if(promisor==='player'||d.get('state','npcs',promisor,'location')!==d.get('state','location'))throw new Error('协助者必须在场');
            obligation.attribute=args.attribute??'精神';if(!this.rules.attributes.includes(obligation.attribute))throw new Error('协助属性不在规则表');
            obligation.skill=args.skill?this.resolve(args.skill,'skill'):null;
            if(obligation.skill&&npcProficiency(d,this,promisor,obligation.skill)<(this.rules.check.helperMinimumProficiency??100))throw new Error('协助者技能不足');
        }
        d.set(['state','obligations',obligation.id],obligation);return {obligation,...(routePreview?{routePreview}:{})};
    }
    deliver(d,key,o,id){
        const source=this.actor(d,o.promisor),target=this.actor(d,o.promisee);if(!source||!target)throw new Error('义务当事人不存在');
        if(o.deliveryVersion===1){
            const to=o.promisee==='player'?d.get('state','location'):target.location;
            if(source.location!==o.location||source.scheduleTravel||source.cognitionTravel)throw new Error('送货者未能按时抵达约定地点');
            if(to!==o.location||target.scheduleTravel||target.cognitionTravel)throw Object.assign(new Error('收件人未在约定地点，货物仍由送货者持有'),{deliveryResponsibility:o.promisee});
            if((o.promisee==='player'||d.get('state','player','companions')?.includes(o.promisee))&&this.npcObligationAction?.tool==='move'&&d.get('state','minute')<this.npcObligationAction.arrivalMinute)throw Object.assign(new Error('收件人仍在途中，尚未到达约定地点'),{deliveryResponsibility:o.promisee});
        }
        if(o.deliveryVersion===1&&(['死亡','濒死','昏迷','患病'].includes(target.status)||/(睡眠|熟睡|睡觉)/.test(target.activity??'')||o.promisee==='player'&&this.npcObligationAction?.args?.activity==='睡眠'))throw Object.assign(new Error('收件人无法清醒接收货物'),{deliveryResponsibility:o.promisee});
        if([source,target].some(actor=>['死亡','濒死'].includes(actor.status)))throw new Error('义务当事人无法清醒履约');
        if([o.promisor,o.promisee].some(actor=>personSimulation(this,d.get('state'),actor).value)){
            const from=o.promisor==='player'?d.get('state','location'):source.location,to=o.promisee==='player'?d.get('state','location'):target.location;
            if(!from||!to||from!==to)throw new Error('双方尚未在同一地点交付，不能隔空转移钱物');
            if([source,target].some(actor=>['昏迷','患病'].includes(actor.status)||/(睡眠|熟睡|睡觉)/.test(actor.activity??'')))throw new Error('义务当事人尚不能清醒交付');
        }
        if(o.type==='送货'){if(this.quantity(d,o.promisor,o.item)<o.quantity)throw new Error('承诺者缺少货物');transferItems(d,this,o.promisor,o.promisee,o.item,o.quantity);}
        if(o.type==='付款'){if(source.coins<o.coins)throw new Error('承诺者资金不足');d.set([...this.actorPath(o.promisor),'coins'],source.coins-o.coins);d.set([...this.actorPath(o.promisee),'coins'],target.coins+o.coins);}
        d.set(['state','obligations',key,'status'],'已完成');if(o.deliveryVersion===1)d.set(['state','obligations',key,'resolvedAt'],d.get('state','minute'));d.say(`${o.content}已履行`);
    }
    remember(d,args,id) {
        if(args.rumor!==undefined)return hearNpcRumor(d,this,args,id);
        if(args.truth!==undefined)return recordLie(d,this,args,id);
        if(args.motive!==undefined||args.knowers!==undefined)throw new Error('motive/knowers只用于带truth的谎言登记');
        const exposed=exposeLieCall(d,this,args,id);if(exposed)return exposed;
        const subject=this.resolve(args.subject),content=validateMemory(args.content),key=text(args.key,100),memoryId=`${subject}::${key}`;
        if(d.get('memories',memoryId,'rumor'))throw new Error('登记传闻的获知记录只能由受校验的交谈生成');
        d.set(['memories',memoryId],{subject,key,content,keywords:args.keywords??[],pinned:d.get('memories',memoryId,'pinned')??false,minute:d.get('state','minute'),source:args.source??'亲历'});
        return {memoryId};
    }
    promptScoped(document){
        if(Object.hasOwn(this,'byId')&&this.byId.has('player'))return Object.getPrototypeOf(this).promptScoped(document);
        const overlay=remoteEngine(this,document,world=>new WorldEngine(world));if(overlay!==this)return overlay.promptScoped(document);
        const {nearby}=promptScope(this,document.state),created=Object.values(document.state.created??{}).filter(p=>p.generated!=='population'||document.state.npcs[p.id]||nearby(p.home?.district??p.location));
        // Cache only the catalog extension. Current names/age/office always
        // come from the supplied state; the player's scope is added afresh.
        this.promptResolvers??=new WeakMap();
        const branch=document.state.created??document.state;
        let hit=this.promptResolvers.get(branch);
        if(!hit||hit.location!==document.state.location||hit.npcs!==document.state.npcs){hit={location:document.state.location,npcs:document.state.npcs,created,resolver:this.resolver.extend(created)};this.promptResolvers.set(branch,hit);}
        const player={id:'player',name:document.state.player.name,aliases:['玩家','玩家角色'],scope:document.state.location};
        const session=Object.create(this);session.entities=[...this.entities,...hit.created,player];session.resolver=hit.resolver.extend([player]);session.byId=session.resolver.entities;
        return session;
    }
    scene(document,query,index=null){return transportScene(this,document)??sceneCard(this.promptScoped(document),document,query,index);}

}
Object.assign(WorldEngine.prototype,activities);
