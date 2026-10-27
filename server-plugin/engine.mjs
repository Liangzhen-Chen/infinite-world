import {advanceHook} from './advance-hooks.mjs';
import {isPhysicallyDead} from './holdings.mjs';
import {primitiveActionRuntime,PRIMITIVE_EVENT_VERBS} from './primitives.mjs';
import {actionBoundary} from './action-boundary.mjs';
import {reject} from './action-rejection.mjs';
import {fixedUnits,fixedNumber,fixedInteger,FIXED_SCALE} from './rx.mjs';
import {facilityView,facilityRouteStates,facilityRuntime,installFacilityRuntime} from './facility-state.mjs';
import {personTeaching,personCertified} from './entity-view.mjs';
import {hiddenCheckBonus,passiveDomain} from './hidden-passives.mjs';
import { applyPatches, canonical, canonicalEqual, PatchCursor } from './storage.mjs';
import { EntityResolver, validateMemory, normalize } from './retrieval.mjs';
import {assertLocationAccess,homePermission}from'./location-access.mjs';
import {activities}from'./activities.mjs';
import {actorId,actorPath}from'./npc-state.mjs';
import {personSimulation,personConstraint}from'./entity-view.mjs';
import {validateSites}from'./sites.mjs';
import {WorldEngine as Phase1Engine}from'./compat/v2-phase1-engine.mjs';
import {learn,teachingConsent,activityTeachingConsent}from'./learning.mjs';
import {prepareMagic,applyMagic}from'./magic.mjs';
import {recordSpellViolation}from'./magic-consent.mjs';
import {recordMagicEconomy}from'./magic-economy.mjs';
import {settleMagicAreas,prepareAreaMagic,applyAreaMagic,areaTargetFacts}from'./magic-area.mjs';
import {assertFireTravel,assertFirePath}from'./magic-object.mjs';
import {adjustAirTravel}from'./magic-air.mjs';
import {assertWaterEarthMovement,waterEarthWalkMinutes}from'./magic-water-earth.mjs';
import {strainCare}from'./magic-care.mjs';
import {assertMindAwake,assertMindSpacePath}from'./magic-mind-space.mjs';
import {assertLightMovement}from'./magic-light.mjs';
import{targetFacts,statusContext}from'./magic-context.mjs';
// 区内布局由 L1 place-layout 经钩子注册（environment.mjs 引入），核心不直接向上依赖。
const placeLayout=(...a)=>advanceHook('placeLayout')(...a),zoneOf=(...a)=>advanceHook('zoneOf')(...a),zoneContactPending=(...a)=>advanceHook('zoneContactPending')(...a);
import {isDomainRejection} from './action-rejection.mjs';
import {profession,effectiveProficiency,certifiedForSkill}from'./professions.mjs';
import {xpRequired,allocateAttributes,milestone}from'./progression.mjs';
import {createCharacter}from'./character.mjs';
import {planRuleStateMigration,runtimeRuleVersion}from'./rule-state-migration.mjs';
import {registerRevival,revivePlayer}from'./revival.mjs';
import {check,npcProficiency}from'./checks.mjs';
import {changeItems,transferItems,validateItemTransfer,validatePhysicalAction,physicalCatalog}from'./items.mjs';
import {environmentCatalog,environmentFeatures,localPlayerPoint,physicalSiteAction,recordLocalContact}from'./environment.mjs';
import {advancePets,petView,preparePetTravel,movePets,mountNpcPet}from'./pets.mjs';
import {advanceSummons,summonView}from'./summons.mjs';
import {enforceLegalRestriction,advanceLaw,lawView,settleCreditCase,registerStolenPurchase,releasePrimitiveCustody}from'./law.mjs';
import {localWeather,weatherEdge,calendarDateAt}from'./weather.mjs';
import {initializeAgriculture}from'./agriculture-migration.mjs';
import {agricultureView,settleAgricultureExpiry}from'./agriculture.mjs';
import {advanceSettlementTrade,regionalTradeBase}from'./settlement-trade.mjs';
import {transportAction,transportScene} from './transport.mjs';
import {postAction} from './post.mjs';
import {tradeQuote,recordDeal,assertMarketDepth,marketExplanation,agreedTradeQuote,consumeAgreedQuote,executeAgreedRemittance}from'./shop.mjs';
import {assertLodgingCapacity,assertRestBed,selectLodgingBed} from './facility-state.mjs';
import {initializeWorldClocks}from'./world-clock.mjs';
import {initializeFactionClocks,factionClockRules,materializeFaithClocks}from'./faction-clock.mjs';
import {openSettlementLedgers}from'./quest-sources.mjs';

import {warClosedRoutes}from'./hazard-calendar.mjs';
import {validateFestivalRuntime}from'./festival.mjs';
import {wildlifePriceFactor,wildlifeEncounterAt,settleWildlifeEncounter,wildlifeEncounterView}from'./wildlife.mjs';
import {wildlifeAwakeningConsumer}from'./wildlife-awakening.mjs';
import {spiritSocietyConsumer,moveSpiritCompanions}from'./wildlife-society.mjs';
import {sceneCard}from'./scene-card.mjs';
import {promptScope}from'./prompt-scope.mjs';
import {stateNotices}from'./state-notices.mjs';
import {recordReturnVisit}from'./return-summary.mjs';
import {assertNpcService,advanceNpcSchedules,scheduleAt,withScheduleCache,advanceWithNpcParticipants}from'./npc-schedule.mjs';
import {npcAutonomyBusy,assertNpcAutonomyAction,applyNpcPlan,applyDialogue,dialogueRequest,executeRoutingProgram}from'./npc-autonomy.mjs';
import './npc-memory.mjs';// world-event subscriber (registers itself)
import {hearNpcRumor}from'./npc-rumors.mjs';
import {recordLie,exposeLieCall}from'./lies.mjs';
import {createNpcObligation,assertNpcObligationAction,npcObligationAt,advanceNpcObligations}from'./npc-obligations.mjs';
import {applyNpcRelation}from'./npc-relations.mjs';
import {assertSocietyTrade,societyNewsConsumer,societyIssueConsumer}from'./monster-society.mjs';
import {resolveToolCall}from'../extension/tools.mjs';
import {deriveWorldEvents,publishWorldEvents,SOCIAL_VERBS}from'./world-events.mjs';
import './wildlife-society.mjs';// world-event subscriber (registers itself)
import './boss-cognition.mjs';// world-event subscriber (registers itself)
import {adjustStanding,standing} from './standing.mjs';// world-event subscriber (registers itself)
import {evidenceBreakthrough,breakthroughPaths}from'./career-metrics.mjs';
import {trickKey,adaptationBonus,noteTrick}from'./npc-intelligence.mjs';
import {chargeTrade,validateTradeCharge,repayDebt}from'./contracts.mjs';
import {REFERENCE,paymentPlan,payInKind,contractTerms,contractFreeze,repaymentPlan,resourceName}from'./tender.mjs';
import {openObligation,settleObligation,closeObligation,performObligation,receiveObligationCollection,dueObligation} from './obligation-protocol.mjs';
import {claimEnforceable} from './obligation-protocol.mjs';
import {fileClosedObligation,advanceProcedure} from './obligation-protocol.mjs';
import {businessTrade,recordBusinessReceipt}from'./business.mjs';
import {CREDIT_OPERATIONS,creditTrade,isCreditDebt,repayCredit,lodgingOf,assertLodgingHost,grantLodgingAccess,releasePledge} from './credit.mjs';
import {recordFinanceSale}from'./finance-assets.mjs';
import {assessTradeTax,taxableSale}from'./finance-tax.mjs';
import {initializeR1,planR1,planPreR1Partitions}from'./migrations/r1.mjs';
import {materializeWildlifeHabitats}from'./wildlife-habitats.mjs';
import {unfoldPopulationAt,acceptPopulationProfile,settlePopulationLayers,populationPlan}from'./population.mjs';
import {remoteEngine,unfoldRemoteAt}from'./remote-generation.mjs';
import {advanceRegistry,advanceNeedsSteps,nextAdvanceMinute,nextFromScheduleHeap,runAdvance,submitContest,catchUpLocal}from'./advance-registry.mjs';
import {beginHouseholdReads}from'./npc-state.mjs';

import {smuggleTrade,inspectSmuggling}from'./smuggling.mjs';
import {withLedger,finishLedger,transfer,accountKey,declareLedgerWriter,LEDGER_COIN}from'./ledger.mjs';
import {declareHoldingWriter,holdingSet,bookHoldingsUpgrade,holdingRemove,resyncHoldings,runLifecycleProtocol} from './holdings.mjs';
import {applyConfigSet,Scheduler,schedulerConfig,schedulerWired} from './scheduler.mjs';
// S1a 账本在每次归约开头开账；S2a 持有存储在第一次双写时从事件前的文档懒开账（holdings.ensureHoldings）——
// 开账写下的是不带时刻的“开局即有”，所以开在哪个事件不改变存储内容（分段推进与重载等价），也不让即时查看改存档。
const withBooks=(engine,document)=>withLedger(engine,document);
// 引擎自己的写入（同行、客房）与旧存档分区补齐（巢穴、农事等迁移补丁的转运，可落到任何来源）。
declareHoldingWriter('engine',{kinds:['*'],entities:['*'],locations:true});
// Static load-time registration of the closed set of verbs primitive
// transactions publish; never added while executing (replay determinism).
for(const verb of PRIMITIVE_EVENT_VERBS)SOCIAL_VERBS.add(verb);
declareLedgerWriter('engine',{sinks:['sink:export','sink:consume']});
const clone = value => structuredClone(value);
// Native read projection shared by dialogue, routing and evidence. No draft
// writer is exposed, and the normal quote uses the same environmental inputs.
installFacilityRuntime({currentTradeQuote(engine,document,args){
 if(!engine.byId.has('player'))engine=engine.scoped(document);
 const d={document,get:(...path)=>path.reduce((value,key)=>value?.[key],document)},location=args.location??document.state.location;
 return tradeQuote(d,engine,{buyer:'player',quantity:1,...args,location,base:()=>regionalTradeBase(d,engine,args.item,location)*wildlifePriceFactor(engine,document,args.item,location)});
}});
const number = (value, min = 0, max = 1e9, label = '数值') => {
    if (!Number.isSafeInteger(value) || value < min || value > max) reject('E-ACTION-PRECONDITION',`${label}必须在${min}到${max}之间`);
    return value;
};
const text = (value, max = 1200) => { if (typeof value !== 'string' || !value.trim() || value.length > max) reject('E-ACTION-PRECONDITION','文字为空或过长'); return value.trim(); };
export{xpRequired};
export const skillGrade = value => `${['初级','中级','高级','特级','专家级','大师级','宗师级','圣级','神级'][Math.min(8,Math.floor(value/300))]}${Math.floor(value%300/100)+1}等`;
class Draft {
    // S2a: the engine rides along so legacy write points without an engine argument can dual-write holdings (holding-sources.holdingSet).
    constructor(document, engine = null) {
        this.original = document; this.engine = engine; this.cursor = new PatchCursor(document); this.adopted = new Map(); this.patches = []; this.messages = [];
        this.scheduler = schedulerWired(document.state) ? new Scheduler({seed:document.randomSeed,config:schedulerConfig(document.state)}) : null;
        if(this.scheduler){
            this.scheduler.seq=document.state.scheduler?.seq??0;
            for(const row of Object.values(document.state.records??{}))if(row.category==='world_event'&&Number.isSafeInteger(row.seq))this.scheduler.seq=Math.max(this.scheduler.seq,row.seq);
            this.scheduler.lastSettled=document.state.scheduler?.lastSettled??document.state.minute;
            this.schedulerBaseline={seq:this.scheduler.seq,lastSettled:this.scheduler.lastSettled};
        }
        this.contestPool = this.scheduler ? [] : null;
    }
    // P2: the cursor keeps its own copies writable until a read lets them escape.
    get document() { this.release(null); return this.cursor.expose(this.cursor.root); }
    set document(document) { this.cursor.reset(document); this.adopted.clear(); }
    get(...path) { if (this.adopted.size) this.release(path); let object = this.cursor.root; for (let i = 0; i < path.length; i++) object = object?.[path[i]]; return this.cursor.expose(object); }
    // Only for a caller that reads, copies what it keeps and drops the reference before its next write.
    peek(...path) { let object = this.cursor.root; for (let i = 0; i < path.length; i++) object = object?.[path[i]]; return object; }
    numberEvent(path,value){
        if(this.scheduler&&path.length===3&&path[0]==='state'&&value&&typeof value==='object'&&
            (['effects','obligations'].includes(path[1])||path[1]==='records'&&['contract','debt','bank','authorization','legal_detention','legal_custody'].includes(value.category))){
            value={...value,registeredSeq:this.get(...path)?.registeredSeq??value.registeredSeq??this.scheduler.nextSeq()};
        }
        if(this.scheduler&&path.length===3&&path[0]==='state'&&path[1]==='records'&&value?.category==='world_event'){
            const old=this.get(...path);
            return {...value,seq:old?.seq??value.seq??this.scheduler.nextSeq()};
        }
        return value;
    }
    set(path, value) { this.write({ op: 'set', path, value:this.numberEvent(path,value) }); }
    remove(path) { this.write({ op: 'delete', path }); }
    // P2: a fresh records row the caller hands over and never touches again.
    // The draft holds the patch's own object instead of a copy until a read
    // could reach it (release); then it holds a copy, exactly as set would.
    adopt(path, value) {
        if (!Array.isArray(path) || path.length !== 3 || path[0] !== 'state' || path[1] !== 'records' || typeof path[2] !== 'string') return this.set(path, value);
        value=this.numberEvent(path,value);
        const patch = { op: 'set', path, value },stockWrite=advanceHook('prepareStockWrite')?.(this,this.engine,path);
        this.cursor.apply(patch, false); this.adopted.set(path[2], value); this.patches.push(patch);
        stockWrite?.();
    }
    write(patch) {
        const path = patch.path, records = this.adopted.size && Array.isArray(path) && path[0] === 'state' && (path.length < 2 || path[1] === 'records');
        // Writing inside an adopted row first gives the draft its own copy.
        if (records && path.length > 3 && this.adopted.has(path[2])) this.materialize(path[2]);
        const stockWrite=path[0]==='state'&&path[1]==='records'?advanceHook('prepareStockWrite')?.(this,this.engine,path):null;
        this.cursor.apply(patch); this.patches.push(patch);
        // A write at or above an adopted row replaces it.
        if (records && path.length <= 3) { if (path.length === 3) this.adopted.delete(path[2]); else this.adopted.clear(); }
        stockWrite?.();
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
function compactNpcPatches(d,patchStart,npcsBefore){
    if(d.patches.slice(patchStart).some(p=>p.path[0]==='state'&&(p.path.length<2||p.path[1]==='npcs'&&p.path.length<3)))return;
    const changed=new Set(d.patches.slice(patchStart).filter(p=>p.path[0]==='state'&&p.path[1]==='npcs').map(p=>p.path[2]));
    const retained=d.patches.slice(patchStart).filter(p=>!(p.path[0]==='state'&&p.path[1]==='npcs'));
    d.patches.length=patchStart;
    for(const patch of retained)d.patches.push(patch);
    for(const npc of changed){
        const value=d.get('state','npcs',npc);
        if(value===undefined){if(npcsBefore?.[npc]!==undefined)d.patches.push({op:'delete',path:['state','npcs',npc]});continue;}
        if(!canonicalEqual(npcsBefore?.[npc],value))d.patches.push({op:'set',path:['state','npcs',npc],value});
    }
}
// A roster person's campaign definition is the same authored person placed in
// the simulation, not a second entity. Only its location can differ here;
// conflicting identities and all unrelated ID collisions still reach the
// resolver's ordinary duplicate check.
function campaignCatalog(engine,document,created,extra=[]){
    const overlaps=created.filter(p=>engine.byId.has(p.id)),materialized=new Map();
    if(overlaps.length){
        // Combining an authored row with its instance must not hide duplicate
        // rows inside the campaign additions themselves.
        new EntityResolver(created,{sortNames:false});
        const people=new Set([...engine.world.npcs,...engine.world.residents??[],...engine.world.factionPeople??[]].map(p=>p.id));
        for(const person of overlaps){
            const {location:_location,...identity}=person,{location:_baseLocation,...authored}=engine.byId.get(person.id);
            if(people.has(person.id)&&document.state.npcs?.[person.id]&&canonicalEqual(identity,authored))materialized.set(person.id,person);
        }
    }
    if(!materialized.size){const additions=[...created,...extra];return {entities:[...engine.entities,...additions],resolver:engine.resolver.extend(additions)};}
    const additions=[...created.filter(p=>!materialized.has(p.id)),...extra];
    const entities=[...engine.entities.map(p=>materialized.get(p.id)??p),...additions];
    return {entities,resolver:new EntityResolver(entities)};
}
export class WorldEngine {
    constructor(world) {
        this.obligationClaimEnforceable=claimEnforceable;
        this.protocolAdditionalClaimAccounts=(d,owner)=>advanceHook('counterClaimAccounts')(d,owner);
        this.protocolScheduleAt=scheduleAt;
        this.protocolLiquidatePledge=(d,row)=>{
            if(!row.pledgeRecord)return 0;
            const bank=this.rules.economy?.credit?.banks?.find(b=>b.id===row.creditor);
            const asset=releasePledge(d,this,row.pledgeRecord,row.creditor,bank);
            return Math.min(row.remaining??row.amount,asset?.value??0);
        };
        this.protocolDebtSettled=(d,row,eventId)=>{const unpaid=row.unpaid??row.badDebt??0;if(!unpaid&&row.pledgeRecord)releasePledge(d,this,row.pledgeRecord,row.debtor);if(row.defaulted?.case)settleCreditCase(d,this,row.defaulted.case,eventId,{badDebt:unpaid});};
        this.populationPlan=populationPlan;
        // K8: derived habitats join the authored ones before any consumer reads them.
        materializeWildlifeHabitats(world);
        this.world = world; this.rules = world.rules;
        // An edition may lack people or venues that sites and festivals name; those rows stay idle instead of stopping the load (tools/validate-world reports them).
        const siteErrors=validateSites(world,{edition:true});if(siteErrors.length)throw Error(siteErrors.join('；'));
        if(![1,2].includes(this.rules.engineRevision??1))throw new Error('此世界使用尚不支持的引擎版本，停止加载');
        this.entities = [...world.npcs,...world.residents??[],...world.locations,...world.items,...world.professions,...world.skills,...world.spells,...world.recipes??[],...world.monsters??[],...world.bosses??[],...world.cultures??[],...world.deities??[],...world.factions??[],...world.history??[],...world.factionPeople??[],...world.eras??[],...world.regions??[],...world.festivals??[]];
        this.resolver = new EntityResolver(this.entities);
        this.byId = this.resolver.entities;
        // RW-07: faith competition clocks are derived from the current church seats and join rules.factionClock here.
        materializeFaithClocks(this);
        const festivalErrors=validateFestivalRuntime(world,{edition:true});if(festivalErrors.length)throw Error(festivalErrors.join('；'));
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
        if (kind && !id.startsWith(kind + '_')) reject('E-ACTION-PRECONDITION',`需要${kind}类型编号`);
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
        if(this.calendarId)return calendarDateAt(this,minute,this.calendarId);
        number(minute,0,Number.MAX_SAFE_INTEGER,'分钟');
        const day=Math.floor(minute/1440),month=Math.floor(day/30)%12,year=Math.floor(day/360)+1;
        const ten=this.rules.calendar.tens?.[Math.floor(day%30/10)],market=this.rules.calendar.marketDays?.includes(day%30+1)??false;
        return {year,month:month+1,day:day%30+1,hour:Math.floor(minute%1440/60),minute:minute%60,season:Math.floor(month/3),...(ten?{ten}:{}),market,
            text:`${this.rules.calendar.epoch}${year===1?'元':year}年 ${this.rules.calendar.months[month]} ${day%30+1}日 ${String(Math.floor(minute%1440/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`};
    }
    formatCalendar(minute){return this.calendar(minute).text;}
    async reduce(document,input,options={}) {
        const out=await actionBoundary(this,document,input,()=>this.reduceAction(document,input,options));
        if(!this.compat){
            const signed=advanceHook('obligationSigningFacts')?.(document,applyPatches(document,out.patches));
            if(signed&&Object.keys(signed).length)Object.assign(out.result,{signedObligations:signed});
        }
        return out;
    }
    async reduceAction(document,input,options={}) {
        if(this.compat)return this.compat.reduce(document,input);
        // T143: a campaign with generated far counties runs over its overlay world.
        const overlay=remoteEngine(this,document,world=>new WorldEngine(world));if(overlay!==this)return overlay.reduce(document,input,options);
        // S2a: 迁移事件的补丁直接改旧字段；已开持有分区的存档随之折算持有（与世界版本更新同一入口）。
        const booked=patches=>[...patches,...bookHoldingsUpgrade(document,applyPatches(document,patches),this.world)];
        if (input.type==='schema_migration') return {patches:booked(input.patches),result:{migration:true}};
        if(input.type==='release_migration'&&input.release==='R1'){const migration=planR1(document,this.world);return{patches:booked(migration.patches),result:migration.report};}
        if(input.type==='rules_state_migration')return{patches:booked(planRuleStateMigration(document,this.rules)),result:{migration:true,runtimeRuleVersion}};
        // 14 §14.2：调度配置（反应深度上限、每刻提案上限）是输入事件 config_set{key,value}，写入存档的 state.scheduler。
        if(input.type==='config_set'){
            const d=new Draft(document,this);
            if(input.key==='openActions'){
                if(!['off','limited','full'].includes(input.value))throw Error('openActions 须为 off、limited 或 full');
                holdingSet(d,this,['state','records','action_config'],{...d.get('state','records','action_config'),category:'action_config',openActions:input.value},'engine');
                return {patches:d.patches,result:{ok:true,openActions:input.value}};
            }
            const scheduler=applyConfigSet(d.get('state'),input.key,input.value);d.set(['state','scheduler'],scheduler);return{patches:d.patches,result:{ok:true,scheduler}};
        }
        if(input.type==='population_profile'){
            if(document.releaseVersion!==1)throw new Error('按需人物需要完成战役初始化');
            const books=withBooks(this,document),d=new Draft(books.document,this),detail=acceptPopulationProfile(d,this.scoped(document),input);
            return{patches:finishLedger(d.patches,books.opening),result:{ok:true,...detail,minute:d.get('state','minute'),notices:[]}};
        }
        if(input.type==='npc_plan'){
            if(document.releaseVersion!==1)throw new Error('人物计划需要完成战役初始化');
            const books=withBooks(this,document),d=new Draft(books.document,this),session=this.scoped(document),id=text(input.eventId,120);
            session.replaying=Boolean(options.replay);session.replayResult=options.result;
            const detail=applyNpcPlan(d,session,input.plan,id);
            d.set(['state','npcPlanning'],{day:Math.floor(document.state.minute/1440),minute:document.state.minute,location:document.state.location,sourceEvent:id});
            return{patches:finishLedger(d.patches,books.opening),result:{ok:true,...detail,minute:d.get('state','minute'),notices:stateNotices(document.state,d.get('state'),key=>session.byId.get(key)?.name)}};
        }
        if(input.tool==='world_propose'){
            const books=withBooks(this,document),applied=await primitiveActionRuntime().propose(this,books.document,input,{options});
            if(applied.result?.ok===false&&applied.result.receipt?.status==='rejected')return applied;
            return {...applied,patches:finishLedger(applied.patches,books.opening)};
        }
        if(input.tool==='world_act'){
            const runtime=primitiveActionRuntime();
            if(!runtime)throw Error('Action runtime is not installed');
            if(runtime.isNativeAction(this,input)){
                if(document.releaseVersion!==1)throw Error('Primitive actions require an initialized campaign');
                const books=withBooks(this,document),session=this.scoped(document);
                session.replaying=Boolean(options.replay);session.replayResult=options.result;
                const native=runtime.nativeAction(session,books.document,input);
                const next=applyPatches(books.document,native.patches);
                return {patches:finishLedger(native.patches,books.opening),result:{ok:true,action:input.args.action,receipt:native.receipt,events:native.events,minute:next.state.minute,messages:[],notices:[]}};
            }
            const translated=runtime.resolve(this,input);
            if(!translated.effects)return this.reduce(document,{...input,tool:translated.tool,args:translated.args},{...options,legacyAction:{id:translated.action.id,slots:input.args?.slots??{}}});
            if(document.releaseVersion!==1)throw Error('Primitive actions require an initialized campaign');
            const books=withBooks(this,document),session=this.scoped(document);
            session.replaying=Boolean(options.replay);session.replayResult=options.result;
            const applied=runtime.execute(session,books.document,input,{createDraft:doc=>new Draft(doc,session),openProposal:options.openProposal});
            const next=applyPatches(books.document,applied.patches);
            return {patches:finishLedger(applied.patches,books.opening),result:{ok:true,receipt:applied.receipt,events:applied.events,minute:next.state.minute,messages:[],notices:[]}};
        }
        const resolved=resolveToolCall(input.tool,input.args??{});
        if(resolved.tool==='world_practice'&&!resolved.args.breakthroughSource&&(!options.replay||options.result?.cost)&&this.world.actionDefinitions&&primitiveActionRuntime()?.registry(this).byId.has('core:practice.session')){
            const result=await this.reduce(document,{tool:'world_act',eventId:input.eventId,args:{action:'core:practice.session',slots:{skill:this.scoped(document).resolve(resolved.args.skill,'skill'),minutes:resolved.args.minutes??120}}},options);
            const learned=result.result.receipt.applied.find(effect=>effect.op==='learn')?.result??{};
            return {...result,result:{...result.result,...learned,cost:result.result.receipt.cost}};
        }
        const legacyAction=primitiveActionRuntime()?.legacyAction(this,resolved.tool,resolved.args,options);
        const legacyContext=legacyAction?{action:legacyAction,tool:resolved.tool.replace(/^world_/,''),args:resolved.args,eventId:input.eventId,requested:options.openProposal?.proposal?.effects??[]}:null;
        if(legacyContext){const prior=primitiveActionRuntime().legacyPrior(document,legacyContext);if(prior)return prior;}
        primitiveActionRuntime()?.validateLegacy(this,document,resolved.tool,resolved.args,options);
        if(resolved.tool==='world_craft'&&resolved.args.operation==='repair'&&resolved.args.quote===true){
            const d=new Draft(document,this),detail=await this.scoped(document).craft(d,resolved.args,text(input.eventId,120));
            return {patches:[],result:{ok:true,...detail,minute:document.state.minute,messages:[],notices:[]}};
        }
        // S1a: a document without books opens them on the draft's own copy (ledger.withLedger).
        const books=withBooks(this,document),d = new Draft(books.document,this), args=resolved.args, id=text(input.eventId,120);
        const tool=resolved.tool.replace(/^world_/, '');
        const readOperations={weather:'inspect',environment:'inspect',pet:'inspect',summon:'inspect',farm:'inspect',wildlife:'observe',lair:'observe',site:'inspect'};
        const noTimeTurn=tool==='turn'&&(args.outOfCharacter||args.extraMinutes===0);
        if(noTimeTurn||(readOperations[tool]&&(args.operation??readOperations[tool])===readOperations[tool])){
            const detail=await this.scoped(document)[tool](d,args,id);
            return {patches:finishLedger(d.patches,books.opening),result:{ok:true,...detail,minute:d.get('state','minute'),messages:d.messages,notices:[]}};
        }
        if(document.releaseVersion!==1){
            if(!options.replay)throw new Error('此战役尚未完成 R1 初始化，请先在副本上显式迁移');
            for(const patch of planPreR1Partitions(document,this.world))holdingSet(d,this,patch.path,patch.value,'engine');
        }
        settleAgricultureExpiry(d,this);
        const permission=primitiveActionRuntime()?.legacyPermission(this,d.document,tool,args);
        if(permission){if(!permission.allowed)reject('E-ACTION-PRECONDITION',permission.reason);}else enforceLegalRestriction(d,tool,args,this);
        if (!['trade','time','move','turn','health','revive','revival','check','practice','cast','learn','profession','attributes','relation','promise','remember',...Object.keys(activities)].includes(tool)) throw new Error('未知工具职责');
        if(isPhysicallyDead(this,d,'player')&&!['time','turn','revive'].includes(tool))reject('E-ACTION-PRECONDITION','你已经死亡，需要在登记点醒来后行动');
        if(d.get('state','player','status')==='濒死'&&!['time','turn','health','cast'].includes(tool))reject('E-ACTION-PRECONDITION','你处于濒死状态，只能等待救治或尝试自救');
        const session=this.scoped(document);session.airDraft=d;session.replaying=Boolean(options.replay);session.replayResult=options.result;session.npcObligationAction={tool,args};
        if(!['time','turn','revive','health'].includes(tool))assertMindAwake(d);
        if(tool==='combat'){
            const target=session.resolve(args.target);
            for(const task of Object.values(d.get('state','npcAutonomy','tasks')??{}))if(task.status==='进行中'&&[task.npc,task.action.seller].includes(target))d.set(['state','npcAutonomy','tasks',task.id],{...task,status:'中断',reason:'交锋打断了正在进行的工作',interruptedAt:d.get('state','minute'),sourceEvent:id});
        }
        settleMagicAreas(d,session);
        // A.15.7 gives both sleeping and awake rest body recovery. The time
        // executor still distinguishes sleep for schedules and interruptions.
        if(tool==='time'&&['睡眠','休息'].includes(args.activity))assertRestBed(session,d.document);
        const sleep=tool==='time'&&['睡眠','休息'].includes(args.activity)?primitiveActionRuntime()?.beginSleep(d,session):null;
        validatePhysicalAction(d,session,tool,args);
        const bookedWorkstation=facilityRuntime().prepareBookedWorkstation?.(d,session,tool,args);
        session.bookedWorkstation=bookedWorkstation;
        const callArgs=bookedWorkstation&&Number.isSafeInteger(args.batches)&&args.batches>=1&&args.batches<=100000?{...args,batches:Math.min(args.batches,bookedWorkstation.maxBatches)}:args;
        const detail = executeRoutingProgram(d,session,tool,callArgs,id)??physicalSiteAction(d,session,tool,callArgs,id)??await session[tool](d,callArgs,id);
        if(bookedWorkstation&&Number.isSafeInteger(args.batches)&&detail.batches!==undefined){detail.requestedBatches=args.batches;detail.clipped=args.batches-detail.batches;}
        if(sleep){const cost=primitiveActionRuntime().finishSleep(d,session,sleep);if(cost)detail.cost=cost;}
        if(detail?.duplicate&&!d.patches.length)return {patches:[],result:{ok:true,...detail,minute:document.state.minute,messages:[],notices:[]}};
        if(document.state.location!==d.get('state','location')&&d.get('state','records','site_presence'))holdingRemove(d,null,['state','records','site_presence'],'engine');
        // 返场：记下离开各地的时间，久别回来时汇总当地变化。
        if(document.state.location!==d.get('state','location'))recordReturnVisit(d,session,document.state,id);
        // Entering an unexpanded district or lair settles its seeded roster once.
        // Older ledger events replay without it, exactly as they were recorded.
        // T143: the first arrival in a far county generates its skeleton once.
        const remote=document.state.location!==d.get('state','location')&&(!options.replay||options.result?.remote)?unfoldRemoteAt(d,session,d.get('state','location')):null;
        // S2a: 新生成的远方郡只出现在叠加世界里：用叠加世界的引擎把持有存储重同步（居民的居住、家户、官职等）。
        if(remote)resyncHoldings(d,remoteEngine(this,d.document,world=>new WorldEngine(world)));
        const population=document.state.location!==d.get('state','location')&&(!options.replay||options.result?.population)?unfoldPopulationAt(d,session,d.get('state','location')):null;
        if(document.state.location!==d.get('state','location')&&Object.keys(d.get('state','remote')??{}).length){
            const arrival=this.scoped(d.document),now=d.get('state','minute');
            arrival.replaying=session.replaying;arrival.replayResult=session.replayResult;
            advanceNpcSchedules(d,arrival,now,now,{promote:true});
        }
        settleMagicAreas(d,session);
        advancePets(d,session,d.get('state','minute'));
        advanceSummons(d,d.get('state','minute'));
        advanceLaw(d,d.get('state','minute'),session);
        const worldEvent={tool,args,detail,eventId:id,before:document.state,noop:!d.patches.length};
        // A read-only instant look (inspect, view) changes nothing and is no world event.
        const readOnly=detail?.actionScope?.kind==='instant'&&!d.patches.length;
        if(!readOnly)publishWorldEvents(d,session,deriveWorldEvents(session,document.state,d.get('state'),worldEvent),worldEvent);
        primitiveActionRuntime()?.settleRites?.(d,session);
        recordBusinessReceipt(d,document.state,{tool:resolved.tool,args,eventId:id,detail});
        settlePopulationLayers(d,session);
        // Social facts of an elapsed span (e.g. a debt falling overdue) join the
        // same single final state per person as the span's own simulation.
        if(tool==='time')compactNpcPatches(d,0,document.state.npcs);
        if(tool==='check')detail.actionScope={kind:'judgement',healthChanged:false,inventoryChanged:false,feePaid:0,
            note:'仅结算判断或对抗，并履行已引用的协助；未伤人、毁物或制造。不得从骰点虚构这些变化。'};
        // S2b：调度器序号与结算钟随推进续写回存档，保证分段推进与一次推进的 seq 连续一致。
        if(d.scheduler&&(document.state.scheduler||d.scheduler.seq!==d.schedulerBaseline.seq||d.scheduler.lastSettled!==d.schedulerBaseline.lastSettled)){
            d.set(['state','scheduler','seq'],d.scheduler.seq);d.set(['state','scheduler','lastSettled'],d.scheduler.lastSettled);
        }
        const result={ok:true,...detail,...(remote?{remote}:{}),...(population?{population}:{}),minute:d.get('state','minute'),messages:d.messages,
            notices:stateNotices(document.state,d.document.state,id=>session.byId.get(id)?.name)};
        if(legacyContext)primitiveActionRuntime().completeLegacy(session,books.document,d,{...legacyContext,result,persist:Boolean(options.legacyAction)});
        return {patches:finishLedger(d.patches,books.opening),result};
    }
    primitiveDraft(document){return new Draft(document,this);}
    primitiveNormalizeCall(tool,args){return resolveToolCall(tool,args);}
    primitiveLegacyRestriction(document,tool,args){
        // Read-only probe: the copy-on-write draft never mutates the original, so no clone.
        try{enforceLegalRestriction(new Draft(document,this),tool,args,this);return null;}catch(error){return error.message;}
    }
    primitiveCheck(d,args,eventId,actor='player'){return primitiveActionRuntime().checkActor(d,this,args,eventId,actor,{effectiveProficiency,hiddenCheckBonus,passiveDomain,trickKey,adaptationBonus,noteTrick});}
    primitiveLearnNpc(d,effect,meta){return primitiveActionRuntime().learnNpc(d,this,effect,meta,{advanceWithNpcParticipants});}
    primitiveStudySkill(d,args,id){return primitiveActionRuntime().studyPlayer(d,this,args,id);}
    // Domain queries are provided by the composition root to lower-layer callers.
    readStanding(state,holder,target){return standing(this,state,holder,target);}
    assertNpcService(d,npc,service,minutes){return assertNpcService(d,this,npc,service,minutes);}
    primitiveAssertTeachingService(d,teacher,minutes){return assertNpcService(d,this,teacher,'teach',minutes);}
    primitiveTeachingConsent(d,args){return activityTeachingConsent(d,this,args,()=>{const session=Object.create(this);session.nativeConsentRequest={from:args.teacher,to:args.student??'player',scope:'teach',purpose:args.subject,terms:{fee:args.fee??0,minutes:args.minutes}};return teachingConsent(d,session,args);});}
    primitiveOpenAction(document,input,prepared,{preview=false}={}){
        const books=withBooks(this,document),session=this.scoped(document);
        const applied=primitiveActionRuntime().executeOpen(session,books.document,input,prepared,{preview});
        if(preview)return applied;
        return {patches:finishLedger(applied.patches,books.opening),result:{ok:true,receipt:applied.receipt,events:applied.events,minute:applyPatches(books.document,applied.patches).state.minute,messages:[],notices:[]}};
    }
    primitiveRiteDaylight(document,location){return localWeather(this,document,location).daylight;}
    primitiveRiteInterruption(document,plan,options){return primitiveActionRuntime().interruptRite(this,document,plan,options);}
    primitiveApplyMark(d,effect,meta){return primitiveActionRuntime().applyMark(d,this,effect,meta);}
    primitiveMoveLocal(d,args,eventId){return primitiveActionRuntime()?.moveLocally(d,this,args,eventId,{environmentFeatures,localPlayerPoint,areaTargetFacts,recordLocalContact,assertMindAwake,assertMindSpacePath,assertWaterEarthMovement,waterEarthWalkMinutes,assertLightMovement,assertFirePath,preparePetTravel,movePets,scheduleAt})??null;}
    localPathObstruction(document,location,from,to){
        const d={document,get:(...p)=>p.reduce((v,k)=>v?.[k],document)};
        try{assertMindSpacePath(d,this,location,from,to);assertFirePath(d,this,from,to,location);return null;}
        catch(error){if(!isDomainRejection(error))throw error;return error;}
    }
    primitiveMoveNpc(d,{entity,destination,mode,mount},eventId){
        const path=['state',d.get('state','npcs',entity)?'npcs':'creatures',entity];let npc=d.get(...path),start=d.get('state','minute'),localMinutes=0;
        if(!npc||!npc.location||npc.scheduleTravel||npc.cognitionTravel)throw Error('NPC is missing or already travelling');
        if(Object.values(d.get('state','records')??{}).some(r=>r.category==='transport'&&['booked','moving','delayed','intercepted'].includes(r.status)&&r.passengers?.includes(entity)))throw Error('NPC is aboard an active transport');
        if(mount!==undefined){
            if(path[1]!=='npcs'||mode!=='horse')throw Object.assign(Error('Selecting a mount requires an NPC riding move'),{code:'E-MOVE-MOUNT'});
            try{mountNpcPet(d,this,entity,mount);}catch(error){throw Object.assign(error,{code:'E-MOVE-MOUNT'});}
        }
        const local=primitiveActionRuntime()?this.primitiveMoveLocal(d,{entity,destination,mode},eventId):null;if(local)return local;
        assertMindAwake(d,entity);assertWaterEarthMovement(d,entity);assertLightMovement(d,this,entity);
        destination=this.resolve(destination);
        if(destination===npc.location)return {destination,minutes:0,cost:0,edges:[]};
        const layout=placeLayout(this,d.document,npc.location),standing=zoneOf(this,d.document,entity,layout);
        if(primitiveActionRuntime()&&standing?.id!==layout.entry){
            const approach=this.primitiveMoveLocal(d,{entity,destination:layout.entry,mode},eventId);
            if(approach?.arrived===false)return {...approach,destination,arrived:false};
            localMinutes=approach?.minutes??0;start=d.get('state','minute');npc=d.get(...path);
        }
        const route=this.route(npc.location,destination,mode,start,d.document.randomSeed);
        if(path[1]==='creatures'&&mode!=='walk')throw Error('Creature self-movement requires walking');
        if(path[1]==='npcs')try{preparePetTravel(d,this,mode,route.movingMinutes,entity);}catch(error){throw Object.assign(error,{code:'E-MOVE-MOUNT'});}
        if(mode==='horse'){const mounted=d.get(...path,'mount');assertMindAwake(d,mounted);assertWaterEarthMovement(d,mounted);assertLightMovement(d,this,mounted);}
        let from=npc.location;
        assertFireTravel({...d,get:(...p)=>p.length===2&&p[0]==='state'&&p[1]==='location'?npc.location:d.get(...p)},this,route);
        for(const edgeId of route.edges){
            const edge=this.world.routes.find(r=>r.id===edgeId);
            const to=edge.from===from?edge.to:edge.from;
            assertMindSpacePath(d,this,from,[0,0],[0,0],{destination:to,eventId,signal:true});
            assertLocationAccess(d,this,to,{actor:entity,arrivalMinute:start+route.minutes});
            from=to;
        }
        assertNpcObligationAction(d,this,[entity],{minutes:route.minutes,location:destination,kind:'move'});
        assertNpcAutonomyAction(d.get('state'),[entity],{minutes:route.minutes});
        if((npc.coins??0)<route.cost)throw Error('Actor cannot afford this route');
        facilityRuntime().recordFurnaceDeparture?.(d,this,entity,npc.location,start);
        if(route.cost){
            transfer(d,{from:accountKey(entity,LEDGER_COIN,'purse'),to:accountKey('sink:export',LEDGER_COIN,'travel'),amount:route.cost,writer:'engine',eventId});
            d.set([...path,'coins'],npc.coins-route.cost);
        }
        if(path[1]==='npcs')movePets(d,this,npc.location,destination,route.movingMinutes,entity);
        d.set([...path,'scheduleTravel'],{from:npc.location,to:destination,depart:start,arrive:start+route.minutes,edges:route.edges});
        d.set([...path,'location'],null);
        const previous=this.npcScheduleReservations;
        this.npcScheduleReservations=new Set([...previous??[],entity]);
        try{this.advance(d,route.minutes,eventId);}finally{this.npcScheduleReservations=previous;}
        d.remove([...path,'scheduleTravel']);
        if(isPhysicallyDead(this,d,entity))return {entity,destination:d.get(...path,'location'),...route,minutes:localMinutes+route.minutes,movingMinutes:localMinutes+route.movingMinutes,interrupted:true};
        d.set([...path,'location'],destination);
        if(d.get('state','records',`local_actor_position:${entity}`))holdingRemove(d,null,['state','records',`local_actor_position:${entity}`],'engine');
        return {entity,destination,...route,minutes:localMinutes+route.minutes,movingMinutes:localMinutes+route.movingMinutes};
    }
    primitiveTargetFacts(d,actor,target){
        const carried=d.get('holdings','locations',target);
        if(target!==actor&&zoneContactPending(d,actor)&&!(carried?.mode==='carried'&&carried.at===actor)&&!(actor==='player'&&this.quantity(d,actor,target)>0)){
            const ranged=actor==='player'&&(d.get('state','npcs',target)||d.get('state','creatures',target))&&this.magicTargetFacts(d,target);
            return ranged?{...ranged,distanceMeters:Math.max(placeLayout(this,d.document).approachMetres,ranged.distanceMeters)}:{distanceMeters:Infinity,lineOfSight:false};
        }
        if(actor==='player')return this.magicTargetFacts(d,target);
        const location=d.get('state','npcs',actor,'location')??d.get('state','creatures',actor,'location');
        const origin=areaTargetFacts(d,this,actor,location);if(!origin)return null;
        const other=areaTargetFacts(d,this,target,location,origin.point);if(!other)return null;
        return {distanceMeters:Math.hypot(origin.point[0]-other.point[0],origin.point[1]-other.point[1]),lineOfSight:origin.lineOfSight&&other.lineOfSight};
    }
    primitiveMagicEffect(d,{target,spec,duration=0,source,actor},eventId){
        // Target preparation supplies existing body, divine barrier and derived
        // defense facts. Consent has already been adjudicated by the primitive
        // transaction, including the opposed path absent in the legacy adapter.
        const catalog={id:source,effectSpec:{kind:'damage',power:1,damageType:'physical'},duration:0};
        const location=actor==='player'?d.get('state','location'):d.get('state','npcs',actor,'location')??d.get('state','creatures',actor,'location');
        const prepared=prepareMagic.call(this,d,catalog,{target},{source:actor,location});
        delete prepared.completionArgs;
        prepared.spec={...spec};
        prepared.catalog={id:source,duration};
        return applyMagic.call(this,d,prepared,eventId);
    }
    primitiveAdjustStanding(d,holder,target,delta,context){return adjustStanding(d,this,holder,target,delta,context);}
    primitiveValidateScheduledAction(d,{action,rule,slots},actor){return primitiveActionRuntime().validateScheduled(this,d.document,{action,rule,slots},actor);}
    executeProtocolPrimitive(d,effect,context){
        if(!['primitive.action','primitive.rule'].includes(effect.op))throw Error(`Protocol primitive is not installed: ${effect.op}`);
        return primitiveActionRuntime().runScheduled(this,d,effect,context);
    }
    primitiveHoldingChanged(d,holding,reason,eventId){return releasePrimitiveCustody(d,this,holding,reason,eventId);}
    async previewAction(document,input,options={}){
        return actionBoundary(this,document,input,()=>this.previewActionResult(document,input,options),{preview:true});
    }
    primitiveActionDefinition(id){return primitiveActionRuntime()?.registry(this).byId.get(id);}
    async previewActionResult(document,input,options={}){
        const runtime=primitiveActionRuntime();if(!runtime)throw Error('Action runtime is not installed');
        if(input.tool==='world_propose')return runtime.propose(this,withBooks(this,document).document,input,{preview:true});
        const session=this.scoped(document),books=withBooks(this,document).document,native=runtime.nativeAction(session,books,input,{preview:true});
        if(native)return native;
        const result=runtime.execute(session,books,input,{createDraft:doc=>new Draft(doc,session),preview:true,openProposal:options.openProposal});
        if(!result.legacy)return result;
        if(result.legacy.tool==='world_propose')return runtime.propose(this,books,{...input,tool:'world_propose',args:result.legacy.args},{preview:true});
        // reduce() is copy-on-write and never mutates its input document.
        const reduced=await this.reduce(document,input,options);
        if(reduced.result?.receipt?.status==='rejected')return {receipt:reduced.result.receipt,routing:reduced.result.receipt.routing};
        return {receipt:runtime.legacyPreview(this,document,input,result.legacy,reduced)};
    }
    actionPermission(document,args){return primitiveActionRuntime().actionPermission(this.scoped(document),document,args);}
    scoped(document){
        const overlay=remoteEngine(this,document,world=>new WorldEngine(world));if(overlay!==this)return overlay.scoped(document);
        const created=Object.values(document.state.created??{});
        const player={id:'player',name:document.state.player.name,aliases:['玩家','玩家角色'],scope:document.state.location};
        const physical=physicalCatalog(this,document),session=Object.create(this);session.physicalDocument=document;
        session.calendarId=document.state.records?.['calendar:active']?.calendar??this.calendarId;
        if(physical.length)session.world=Object.defineProperties({}, {...Object.getOwnPropertyDescriptors(this.world),items:{value:[...this.world.items,...physical],enumerable:true,writable:true,configurable:true}});
        const catalog=campaignCatalog(this,document,created,[...physical,player]);
        session.entities=catalog.entities;session.resolver=catalog.resolver;session.byId=session.resolver.entities;return session;
    }
    actor(d,id) { return d.get(...this.actorPath(id)); }
    npcObligationAt(state,npcId,minute){return npcObligationAt(state,npcId,minute);}
    assertNpcObligationAction(d,actors,action){return assertNpcObligationAction(d,this,actors,action);}
    npcAutonomyBusy(state,id,minute){return npcAutonomyBusy(state,id,minute);}
    assertNpcAutonomyAction(state,actors,action){return assertNpcAutonomyAction(state,actors,action);}
    actorPath(id) { return actorPath(this.world,id); }
    bagPath(id) { if(/^(estate_|liq_)/.test(id))return ['state','records',`protocol_assets:${id}`,'inventory']; return id==='player' ? ['state','inventory'] : [...this.actorPath(id),'inventory']; }
    quantity(d,id,item) { const value=d.get(...this.bagPath(id),item); return typeof value==='number'?value:value?.quantity ?? 0; }
    itemDelta(d,id,item,delta,books) {
        return changeItems(d,this,id,item,delta,{books});
    }
    async trade(d,args,id) {
        if(args.operation==='transport')return transportAction(d,this,args,id);
        if(args.operation==='post')return postAction(d,this,args,id);
        if(['smuggle','deliver_smuggled'].includes(args.operation))return smuggleTrade.call(this,d,args,id);
        if(args.operation==='remit')return executeAgreedRemittance(d,this,args,id,(next,terms)=>creditTrade.call(this,d,next,id,terms));
        if(CREDIT_OPERATIONS.has(args.operation))return creditTrade.call(this,d,args,id);
        if(args.operation&&args.operation!=='trade')return businessTrade.call(this,d,args,id);
        if(args.service!==undefined&&args.service!=='住宿')reject('E-ACTION-PRECONDITION','未登记该服务；住宿请传 service="住宿" 与 days，购买物品请传 item 与 quantity');
        const buyer=this.resolve(args.buyer ?? 'player'),seller=this.resolve(args.seller);
        if(buyer===seller) reject('E-ACTION-PRECONDITION','交易双方不能相同');
        if(!this.actor(d,buyer)||!this.actor(d,seller)) reject('E-ACTION-PRECONDITION','交易对象不在战役中');
        for(const actor of[buyer,seller])if((isPhysicallyDead(this,d,actor)||this.actor(d,actor).status==='濒死'))reject('E-ACTION-PRECONDITION','交易一方无法清醒履约');
        const playerLocation=d.get('state','location');
        for(const actor of [buyer,seller]) if(actor!=='player' && this.actor(d,actor).location!==playerLocation) reject('E-ACTION-PRECONDITION','交易对方不在场');
        assertSocietyTrade(d,this,buyer,seller);
        if(args.payment==='repay')return isCreditDebt(d.get('state','records',args.debt))?repayCredit(d,this,{seller,debt:args.debt,coins:args.coins,payCurrency:args.payCurrency},id):repayDebt(d,this,{buyer,seller,debt:args.debt,payCurrency:args.payCurrency},id);
        // Any location registering lodging:{host,kind,rooms} rents rooms at the economy anchors.
        const place=args.service==='住宿'&&buyer==='player'?lodgingOf(this,seller,playerLocation):null;
        if(args.service==='住宿'&&!place)reject('E-ACTION-PRECONDITION','这个人没有登记住宿服务');
        for(const actor of [buyer,seller])if(actor!=='player'&&!place)assertNpcService(d,this,actor,'trade',5);
        if(place){
            if(facilityView(this,d.get('state'),place.id)?.factor===0)reject('E-ACTION-PRECONDITION','住宿建筑已停用');
            assertLodgingHost(d,this,seller,place,args.consent);
            const economy=this.rules.economy,host=this.byId.get(seller).name;
            const days=number(args.days??1,1,7,'住宿天数');
            // The service's agreed-quote resource is declared by its catalog action.
            const quoteResource=primitiveActionRuntime()?.registry(this).actions.find(a=>a.call?.tool==='world_trade'&&a.call.fixed?.service===args.service)?.signature?.quoteResource;
            const agreed=quoteResource?agreedTradeQuote(d.get('state'),{buyer,seller,item:quoteResource,quantity:days}):null;
            const cost=agreed?.totalCoins??(days===7?place.lodging.weeklyCopper??economy.rentalCopperPerWeek:days*(place.lodging.nightlyCopper??economy.rentalCopperPerNight));
            // S5-F2: where the legal tender is not coin_river the room fee freezes as that resource in whole units (same contractTerms path as a credit sale); another currency converts at payment time.
            const freeze=contractFreeze(d,this,{location:playerLocation,coppers:{cost}}),fee=freeze?{resource:freeze.resource,amount:freeze.amounts.cost}:null;
            if(fee&&(args.payment??'cash')==='cash'){const pay=repaymentPlan(d,this,{resource:fee.resource,quantity:fee.amount,payWith:args.payCurrency});if((pay.resource===REFERENCE?this.actor(d,buyer).coins:this.quantity(d,buyer,pay.item))<pay.amount)reject('E-ACTION-PRECONDITION',`房钱不足：需要${pay.amount}${pay.resource===REFERENCE?'铜':resourceName(this,pay.resource)}（房钱按${freeze.resourceName}计，可用 payCurrency 改用别的币）`);}
            else if(!fee&&(args.payment??'cash')==='cash'&&this.actor(d,buyer).coins<cost)reject('E-ACTION-PRECONDITION','房钱不足');
            const payment=chargeTrade(d,this,{buyer,seller,cost,payment:args.payment,creditMinutes:args.creditMinutes,description:`${place.name}房钱`,...(fee?{terms:fee,payCurrency:args.payCurrency}:{})},id);
            const starts=Math.max(d.get('state','minute'),...Object.values(d.get('state','records')).filter(row=>row.category==='contract'&&row.room===place.id&&row.parties?.includes('player')&&row.status==='有效').map(row=>row.expires));
            assertLodgingCapacity(this,d.document,place.id,starts,starts+days*1440);
            const bed=selectLodgingBed(this,d.document,place.id,starts,starts+days*1440);
            const contract=`contract_room_${id}`,access=grantLodgingAccess(d,this,place,seller,{starts,expires:starts+days*1440,eventId:id});
            holdingSet(d,null,['state','records',contract],{category:'contract',name:`${place.name}住宿`,parties:['player',seller],room:place.id,...(bed?{bed}:{}),
                starts,expires:starts+days*1440,paid:payment.debt?0:(fee?fee.amount:cost),...(fee?{resource:fee.resource,resourceName:freeze.resourceName,cost:fee.amount,referenceCopper:cost}:{}),...(payment.debt?{debt:payment.debt}:{}),...(access?{authorization:access}:{}),status:'有效',
                content:payment.debt?`${host}同意赊账${fee?fee.amount+freeze.resourceName:cost+'铜'}，允许旅人住${days}天。`:`${host}收到${fee?fee.amount+freeze.resourceName:cost+'铜'}，允许旅人住${days}天。`},'engine');
            consumeAgreedQuote(d,agreed,id);
            // The notice names what actually changed hands (paid in another currency: that currency), not a copper figure the bill was never in.
            const shown=payment.paidWith?`${payment.paidWith.amount}${payment.paidWith.name??'铜'}`:fee?`${fee.amount}${freeze.resourceName}`:`${cost}铜`;
            this.advance(d,10,id);d.say(`住宿${days}天，${payment.debt?'赊账':'支付'}${shown}`);return {contract,cost:fee?fee.amount:cost,days,...(fee?{resource:fee.resource,resourceName:freeze.resourceName,referenceCopper:cost}:{}),...payment};
        }
        if(!args.item)reject('E-ACTION-PRECONDITION','缺少交易项目；住宿请传 service="住宿" 与 days，购买物品请传 item 与 quantity');
        const item=this.resolve(args.item,'item');
        let quantity=number(args.quantity,1,100000,'数量');const requestedQuantity=quantity,catalog=this.byId.get(item);
        // Day list price: region/transport/season x wildlife x shop markup x regard; bargaining moves it within rules.economy.priceFactorLimits.bargain.
        let quote=tradeQuote(d,this,{buyer,seller,item,quantity,instances:args.instances??null,location:playerLocation,base:()=>regionalTradeBase(d,this,item,playerLocation)*wildlifePriceFactor(this,d.document,item,playerLocation)});
        const [bargainLow,bargainHigh]=this.rules.economy.priceFactorLimits.bargain;
        if(quote.agreed&&args.unitPrice!==undefined&&args.unitPrice*quantity!==quote.totalCoins)reject('E-ACTION-PRECONDITION','单价不符既定报价');
        const price=quote.agreed?quote.listPrice:args.unitPrice===undefined?quote.listPrice:number(args.unitPrice,Math.ceil(quote.listPrice*bargainLow),Math.ceil(quote.listPrice*bargainHigh),'单价');
        // Explicit seller consent to a smaller cash sale. Keep the normal
        // all-or-nothing path, agreed terms and selected unique units intact.
        if(args.allowPartial===true&&seller==='player'&&buyer!=='player'&&(args.payment??'cash')==='cash'&&!quote.agreed&&!args.instances){
            quantity=Math.min(quantity,Math.floor(this.actor(d,buyer).coins/price));
            if(quantity<1)reject('E-ACTION-PRECONDITION','买方余额不足，连一件也收不起');
        }
        if(quantity!==quote.quantity&&!quote.agreed)quote=tradeQuote(d,this,{buyer,seller,item,quantity,location:playerLocation,base:()=>regionalTradeBase(d,this,item,playerLocation)*wildlifePriceFactor(this,d.document,item,playerLocation)});
        const bargainFactor=quote.agreed||args.unitPrice===undefined?1:price/quote.listPrice;
        // An explicit retail unit price is already an integer coin amount.
        // Keep its exact product; a floating ratio can turn 254*3 into
        // 761.9999999999999 just before the required total truncation.
        const exactTotal=quote.retail&&args.unitPrice!==undefined&&!quote.agreed?price*quantity:quote.exactTotal*bargainFactor;
        const cost=quote.agreed?quote.totalCoins:Math.trunc(exactTotal);
        if(this.quantity(d,seller,item)<quantity) reject('E-ACTION-PRECONDITION',`对方库存不足：${catalog.name}只剩${this.quantity(d,seller,item)}`);
        // S5-F: a buyer may hand over a named resource instead of reference coins; the bill is converted at today's rate.
        const inKind=args.payCurrency!==undefined&&args.payCurrency!==REFERENCE;
        if(inKind&&(buyer!=='player'||(args.payment??'cash')!=='cash'))reject('E-ACTION-PRECONDITION','只有玩家现付时可指定付款币种');
        const plan=inKind?paymentPlan(d,this,{resource:args.payCurrency,copper:cost,location:playerLocation}):null;
        if(plan&&this.quantity(d,buyer,plan.item)<plan.amount)reject('E-ACTION-PRECONDITION',`买方${this.byId.get(plan.item)?.name??plan.resource}不足：需要${plan.amount}`);
        if(!plan&&(args.payment??'cash')==='cash'&&this.actor(d,buyer).coins<cost)reject('E-ACTION-PRECONDITION','买方余额不足');
        if(!quote.agreed)assertMarketDepth(d,this,quote);
        if(!plan)validateTradeCharge(d,this,{buyer,seller,cost,payment:args.payment,creditMinutes:args.creditMinutes},id);
        // A credit sale freezes its terms in the place's tender unit (15 §15.3): the claim is that resource and quantity.
        const terms=args.payment==='credit'&&buyer==='player'?contractTerms(d,this,{location:playerLocation,copper:cost}):null;
        validateItemTransfer(d,this,seller,buyer,item,quantity,args.instances??null);
        let payment,moved,tax,rejected,receivingCases=[];
        const execute=()=>{
        payment=plan?{paidWith:payInKind(d,this,{payer:buyer,payee:seller,plan,eventId:id})}:chargeTrade(d,this,{buyer,seller,cost,payment:args.payment,creditMinutes:args.creditMinutes,description:`${catalog.name}货款`,terms,referenceCopper:cost},id);
        moved=transferItems(d,this,seller,buyer,item,quantity,args.instances??null,{disposition:true,documentSource:true,eventId:id,authorityContext:primitiveActionRuntime()?.context?.(this,d.document)});
        receivingCases=registerStolenPurchase(d,this,{buyer,seller,item,instances:moved.instances,eventId:id,location:playerLocation});
        // Only trade owes commercial tax: resale stock or an organization's goods (finance-tax.mjs taxableSale).
        tax=payment.debt||!taxableSale(this,d.get('state'),seller,item)?{amount:0}:assessTradeTax(d,this,{seller,cost,location:playerLocation,sourceEvent:id});
        const basis=recordFinanceSale(d,this,{buyer,seller,item,quantity,cost,tax:tax.amount,eventId:id,paid:!payment.debt});
        if(payment.debt)holdingSet(d,null,['state','records',payment.debt],{...d.get('state','records',payment.debt),sale:{buyer,seller,item,quantity,cost,basis,location:playerLocation}},'engine');
        recordDeal(d,quote,cost,quantity,id,plan?{resource:plan.resource,amount:plan.amount}:terms);
        };
        if(d.scheduler){
            submitContest(d,{id,target:`goods:${seller}:${item}`,targetKind:'goods',ruleId:'trade',objectId:buyer,bid:price,quantity,capacity:this.quantity(d,seller,item),execute,reject:reason=>{rejected=reason;}});
            // An external proposal is a real tick. Due NPC proposals at this
            // minute join the same pool before either side moves money or goods.
            this.advance(d,0,id);
            if(rejected)return {ok:false,status:'rejected',reason:rejected,buyer,seller,item,quantity:0,cost:0};
        }else execute();
        this.advance(d,5,id);d.say(`${catalog.name}×${quantity}，${payment.debt?'赊账':'成交'}${plan?`${plan.amount}${payment.paidWith.name??'铜'}`:terms?`${terms.amount}${resourceName(this,terms.resource)}`:`${cost}铜`}`);
        return {buyer,seller,item,quantity,cost,...(!quote.agreed?{pricing:marketExplanation(quote,{bargainFactor,totalCoins:cost,unitPrice:args.unitPrice??quote.listPrice,exactTotal})}:{}),...(quantity<requestedQuantity?{requestedQuantity,partial:true}:{}),instances:moved.instances,...(moved.dispositions?.length?{dispositions:moved.dispositions}:{}),...(receivingCases.length?{receivingCases}:{}),...(tax.amount?{tax}:{}),...(plan||terms?{tender:quote.tender}:{}),...payment};
    }
    advance(d,minutes,id) {
        if(this.bookedWorkstation?.minutes===minutes)facilityRuntime().consumeWorkstationPrepayment(d,this.bookedWorkstation.receipt,id);
        // P2: one elapsed-time event shares each region's yearly weather
        // sequence (rules and seed cannot change inside it) across schedules.
        // Route topology (locations, routes) is likewise fixed for its duration.
        primitiveActionRuntime()?.settleRites?.(d,this);
        if(this.weatherSequences){const result=this.advanceElapsed(d,minutes,id);primitiveActionRuntime()?.settleRites?.(d,this);return result;}
        this.weatherSequences=new Map();this.advanceGraphs=new Map();this.runtimeHabitats=[];
        this.advanceHouseholds=beginHouseholdReads(this);
        this.advanceFeatures=this.world.locations.flatMap(place=>(place.features??[]).map(feature=>({...feature,location:place.id})));
        try{const result=withScheduleCache(this,d,()=>this.advanceElapsed(d,minutes,id));primitiveActionRuntime()?.settleRites?.(d,this);return result;}finally{this.weatherSequences=null;this.advanceGraphs=null;this.advanceHouseholds=null;this.advanceFeatures=null;this.runtimeHabitats=null;}
    }
    advanceElapsed(d,minutes,id) {
        minutes=number(minutes,0,43200,'耗时');
        if(['trade','learn','practice','profession','craft','repair','research','cast','pet','summon','environment','farm','wildlife','site'].includes(this.npcObligationAction?.tool))assertNpcObligationAction(d,this,['player'],{minutes});
        const now=d.get('state','minute');
        // The persisted world clock is authoritative after a save has been
        // restored or a fixture has repositioned it. Never let a scheduler
        // cursor already ahead of that clock suppress local work or charge a
        // future interval against the current minute.
        if(d.scheduler&&d.scheduler.lastSettled>now)d.scheduler.lastSettled=now;
        const localUntil=d.get('state','scheduler','localUntil');
        if(Number.isFinite(localUntil)&&localUntil>now)d.set(['state','scheduler','localUntil'],now);
        const end=now+minutes;
        if(d.scheduler)for(const system of advanceRegistry)system.currentMinute?.(this,d,now,id);
        initializeWorldClocks(d,this,d.get('state','minute'),end);
        initializeFactionClocks(d,this,d.get('state','minute'),end);
        advanceSettlementTrade(d,this,d.get('state','minute'));
        if(!d.scheduler&&!advanceNeedsSteps(this,d,d.get('state','minute')))return this.advanceInterval(d,minutes,id);
        if(!minutes){
            if(!d.scheduler)return this.advanceInterval(d,0,id);
            if(d.contestPool.length){this.advanceInterval(d,0,id,d.scheduler.lastSettled);d.scheduler.lastSettled=d.get('state','minute');}
            return;
        }
        const patchStart=d.patches?.length,npcsBefore=d.get('state','npcs');
        while(d.get('state','minute')<end){
            const now=d.get('state','minute');
            if(d.scheduler){
                const next=nextFromScheduleHeap(this,d,now,end);
                if(next===null){
                    const beforeState=d.get('state');
                    d.set(['state','minute'],end);catchUpLocal(this,d,end);
                    // A courier's continuous trip (including the return to its
                    // routine) must be current at a read even without a tick.
                    // Its own cursor leaves lastSettled and event seq alone.
                    if(Object.values(d.get('state','obligations')??{}).some(o=>o.deliveryVersion===1))
                        advanceNpcObligations(d,this,d.scheduler.lastSettled??now,end,id,{beforeState});
                    break;
                }
                // S2b：结算钟与玩家钟分离——before 取上一结算刻（跨 reduce 持久），
                // 使逐日推进与一次推进在非整日起点下也产生相同 before/after/days。
                const settledBefore=d.scheduler.lastSettled??now;
                this.advanceInterval(d,next-now,id,settledBefore);
                d.scheduler.lastSettled=next;
            }else{
                const next=nextAdvanceMinute(this,d,now,end);
                this.advanceInterval(d,next-now,id);
            }
        }
        // Intermediate clock boundaries matter to simulation, not to replay.
        // Keep one final NPC patch per changed person in this elapsed-time event.
        if(patchStart!==undefined)compactNpcPatches(d,patchStart,npcsBefore);
    }
    advanceInterval(d,minutes,id,settledBefore){
        const beforeState=d.get('state'),before=settledBefore??beforeState.minute,after=beforeState.minute+minutes;d.set(['state','minute'],after);
        if(d.scheduler)catchUpLocal(this,d,after);
        runAdvance(this,d,{before,after,id,beforeState,days:Math.floor(after/1440)-Math.floor(before/1440)});
        advanceHook('settleDemonstrations')?.(d,this);
    }
    time(d,args,id) {
        primitiveActionRuntime()?.settleRites?.(d,this);
        if(isPhysicallyDead(this,d,'player'))this.revive(d,{},id);
        if(args.minutes!==undefined&&args.until!==undefined)reject('E-ACTION-PRECONDITION','minutes 与 until 只能选一个');
        let duration=args.minutes;
        if(args.until!==undefined){
            const until=args.until;if(!until||typeof until!=='object'||Array.isArray(until))reject('E-ACTION-PRECONDITION','until 需要 dayOffset、hour 和可选 minute');
            const day=number(until.dayOffset,0,30,'相对日期'),hour=number(until.hour,0,23,'小时'),minute=number(until.minute??0,0,59,'分钟');
            const now=d.get('state','minute');duration=(Math.floor(now/1440)+day)*1440+hour*60+minute-now;
            if(duration<=0)reject('E-ACTION-PRECONDITION','目标钟点必须晚于现在，请核对 dayOffset');
        }
        const minutes=number(duration,1,43200,'耗时');
        if(['睡眠','休息'].includes(args.activity))holdingSet(d,null,['state','records','mind_rest_activity'],true,'engine');
        const sleeping=this.riteSleepingActors;
        if(args.activity==='睡眠')this.riteSleepingActors=new Set([...sleeping??[],'player']);
        try{this.advance(d,minutes,id);}finally{this.riteSleepingActors=sleeping;}
        if(d.get('state','records','mind_rest_activity'))holdingRemove(d,null,['state','records','mind_rest_activity'],'engine');
        if(args.activity==='睡眠'||args.activity==='休息') {
            const p=d.get('state','player');if(p.status==='正常'){
                d.set(['state','player','hp'],Math.min(p.maxHp,p.hp+Math.floor(minutes/30)));
                d.set(['state','player','mp'],Math.min(p.maxMp,p.mp+Math.floor(minutes/30)));
            }
        }
        return {elapsed:minutes,date:this.calendar(d.get('state','minute')).text,encounters:wildlifeEncounterView(d.document)};
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
        const {order,adjacent}=graph,settled=new Set(),oriented=graph.oriented??new Map(),airState=typeof this.airDraft?.peek==='function'?this.airDraft.peek('state'):this.airDraft?.get('state'),closedRoutes=warClosedRoutes(airState,minute),facilities=facilityRouteStates(this,airState); // R31: read-only look, so the draft is not made to recopy state and npcs on its next write
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
        if(!distances.has(to))reject('E-ACTION-PRECONDITION','没有当前季节可通行的路线，不能瞬移');
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
        if(Object.values(d.get('state','records')??{}).some(r=>r.category==='transport'&&['booked','moving','delayed','intercepted'].includes(r.status)&&r.passengers?.includes('player')))reject('E-ACTION-PRECONDITION','仍在承运班次中，须抵达或处理滞留后再自行移动');
        for(const target of ['player',...d.get('state','player','companions')??[]])assertMindAwake(d,target);
        for(const target of ['player',...d.get('state','player','companions')??[]])assertWaterEarthMovement(d,target);
        for(const target of ['player',...d.get('state','player','companions')??[]])assertLightMovement(d,this,target);
        if(primitiveActionRuntime()){
            const local=this.primitiveMoveLocal(d,{entity:'player',destination:args.destination,mode:args.mode??'walk'},id);
            if(local)return local;
        }
        let destination=this.resolve(args.destination);const requestedDestination=destination,old=d.get('state','location');
        if(old===destination)return {destination,elapsed:0};
        const layout=placeLayout(this,d.document,old),standing=zoneOf(this,d.document,'player',layout);let localMinutes=0;
        if(primitiveActionRuntime()&&standing?.id!==layout.entry){
            const approach=this.primitiveMoveLocal(d,{entity:'player',destination:layout.entry,mode:args.mode??'walk'},id);
            if(approach?.arrived===false)return {...approach,destination,arrived:false};
            localMinutes=approach?.minutes??0;
        }
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
        if(d.get('state','player','coins')<route.cost)reject('E-ACTION-PRECONDITION','路费不足');
        transfer(d,{from:accountKey('player',LEDGER_COIN,'purse'),to:accountKey('sink:export',LEDGER_COIN,'travel'),amount:route.cost,writer:'engine',eventId:id});
        d.set(['state','player','coins'],d.get('state','player','coins')-route.cost);
        d.set(['state','location'],destination);
        if(d.get('state','records','local_player_position'))holdingRemove(d,null,['state','records','local_player_position'],'engine');
        const discovered=Boolean(d.get('state','discoveries',destination));
        d.set(['state','discoveries',destination],{minute:d.get('state','minute')+route.minutes,source:'亲历'});
        for(const npc of d.get('state','player','companions')){
            d.set(['state','npcs',npc,'location'],destination);
            if(d.get('state','records',`local_actor_position:${npc}`))holdingRemove(d,null,['state','records',`local_actor_position:${npc}`],'engine');
        }
        movePets(d,this,old,destination,route.movingMinutes);moveSpiritCompanions(d,old,destination);
        for(const[key,effect]of Object.entries(d.get('state','effects')))if(effect.kind==='summon'&&effect.owner==='player'&&effect.location===old)d.set(['state','effects',key,'location'],destination);
        this.npcObligationAction.arrivalMinute=d.get('state','minute')+route.minutes;
        const areaTravel=Object.values(d.get('state','effects')??{}).some(e=>e.kind==='area');
        if(areaTravel)holdingSet(d,null,['state','records','magic_area_transit'],{category:'magic_area_transit',subjects:['player',...d.get('state','player','companions')],start:d.get('state','minute'),arrival:this.npcObligationAction.arrivalMinute,source:id},'engine');
        strainCare(d,this,'player',route.movingMinutes);
        this.advance(d,route.minutes,id);
        inspectSmuggling(d,this,route,id);
        let encounter=null;
        for(const attempt of attempts){const seen=settleWildlifeEncounter(d,this,attempt,id);if(seen)encounter=seen;}
        if(areaTravel)holdingRemove(d,null,['state','records','magic_area_transit'],'engine');
        const experience=discovered?{experience:0}:milestone(d,this,'discovery',destination,id);
        for(const [key,obligation]of Object.entries(d.get('state','obligations')))if(obligation.type==='带路'&&obligation.destination===destination&&obligation.status==='进行中'){
            d.set(['state','obligations',key,'status'],'已完成');d.say(`${this.byId.get(obligation.promisor).name}的带路约定已完成`);
            const stillGuiding=Object.values(d.get('state','obligations')).some(row=>row.type==='带路'&&row.promisor===obligation.promisor&&row.status==='进行中');
            if(!stillGuiding&&this.byId.get(obligation.promisor)?.schedule)holdingSet(d,null,['state','player','companions'],d.get('state','player','companions').filter(npc=>npc!==obligation.promisor),'engine');
        }
        // Daily ecology or migration can remove a predicted animal while travelling.
        // A vanished lead must not strand the player at an otherwise unrequested stop.
        if(encounterAttempt&&!encounter&&destination!==requestedDestination&&d.get('state','location')===destination&&d.get('state','player','status')==='正常'){
            const rest=this.move(d,{...args,destination:requestedDestination},id);
            return{...rest,minutes:localMinutes+route.minutes+rest.minutes,movingMinutes:localMinutes+route.movingMinutes+rest.movingMinutes,cost:route.cost+rest.cost,
                edges:[...route.edges,...rest.edges],experience:experience.experience+(rest.experience??0),...(route.airMinutes||rest.airMinutes?{airMinutes:(route.airMinutes??0)+(rest.airMinutes??0)}:{})};
        }
        return {destination,...route,minutes:localMinutes+route.minutes,movingMinutes:localMinutes+route.movingMinutes,...experience,companions:d.get('state','player','companions'),requestedDestination,interrupted:Boolean(encounterAttempt)&&destination!==requestedDestination,encounter};
    }
    turn(d,args,id) {
        if(args.outOfCharacter)return {outOfCharacter:true};
        if(d.get('state','turns',id))return {duplicate:true};
        const start=number(args.startMinute,0,Number.MAX_SAFE_INTEGER,'回合起始时间'),now=d.get('state','minute');
        if(start>now)reject('E-ACTION-PRECONDITION','回合起始时间晚于当前时间');
        // Old event logs keep their total-duration semantics; new tails only add extra time.
        const remaining=args.extraMinutes!==undefined?number(args.extraMinutes,0,43200,'额外时长'):
            Math.max(0,number(args.minutes??10,0,43200,'回合时长')-(now-start));
        if(args.location&&this.resolve(args.location)!==d.get('state','location'))reject('E-ACTION-PRECONDITION','尾注地点与实际账本不一致，需先沿路线移动');
        const present=(args.present??[]).map(name=>this.resolve(name,'npc'));
        if(present.some(npc=>d.get('state','npcs',npc,'location')!==d.get('state','location')))reject('E-ACTION-PRECONDITION','尾注包含不在场的人物');
        if(remaining)this.advance(d,remaining,id);d.set(['state','turns',id],{start,end:d.get('state','minute'),present});
        return {elapsed:remaining,present};
    }
    health(d,args,id) {
        const amount=number(args.delta,-1e9,1e9,'生命变化'),p=d.get('state','player');
        if(isPhysicallyDead(this,d,'player'))reject('E-ACTION-PRECONDITION','死亡后需要复活，不能直接治疗');
        d.set(['state','player','hp'],Math.max(0,Math.min(p.maxHp,p.hp+amount)));
        if(p.hp+amount<=0){d.set(['state','player','status'],'濒死');if(p.status!=='濒死')d.set(['state','player','dyingSince'],d.get('state','minute'));
            if(d.get('state','player','mount'))d.remove(['state','player','mount']);
            if(-amount>=p.maxHp*this.rules.death.immediateOverkillRatio)this.death(d);
        }else if(p.status==='濒死'){d.set(['state','player','status'],'正常');d.set(['state','player','dyingSince'],null);}
        return {hp:d.get('state','player','hp'),status:d.get('state','player','status')};
    }
    death(d) {
        const p=d.get('state','player'),loss=p.level<10?p.level*10:xpRequired(p.level);
        if(isPhysicallyDead(this,d,'player'))return;
        runLifecycleProtocol(d,this,{entity:'player',basis:'death',origin:'death_rule',location:d.get('state','location')});
        d.set(['state','player','xp'],Math.max(0,p.xp-loss));d.say(`死亡损失经验${Math.min(p.xp,loss)}`);
        holdingSet(d,null,['state','player','companions'],[],'engine');
        if(d.get('state','player','mount'))d.remove(['state','player','mount']);
    }
    revive(d,args,id) {
        const result=revivePlayer.call(this,d,args,id);
        if(d.get('state','records','local_player_position'))holdingRemove(d,null,['state','records','local_player_position'],'engine');
        return result;
    }
    revival(d,args,id){
        return registerRevival.call(this,d,args,id);
    }
    check(d,args,id) {
        return check.call(this,d,args,id);
    }
    practice(d,args,id,nativeGain=null,nativeActor='player',nativeCeiling=2699) {
        const skill=this.resolve(args.skill,'skill'),path=nativeActor==='player'?['state','skills',skill]:['state','npcs',nativeActor,'skills',skill];
        const raw=d.get(...path)??(nativeActor==='player'?null:this.byId.get(nativeActor)?.skills?.[skill]??this.byId.get(nativeActor)?.proficiencies?.[skill]);
        const old=typeof raw==='number'?{proficiency:raw,breakthroughs:[],daily:{}}:raw;
        if(nativeActor!=='player'&&(nativeGain===null||!d.get('state','npcs',nativeActor)))throw Error('NPC practice requires its native actor and gain');
        if(!old)reject('E-ACTION-PRECONDITION','尚未学会这项技能');
        const stage=Math.floor(old.proficiency/300),day=String(Math.floor(d.get('state','minute')/1440));
        if(args.breakthroughSource){
            if(nativeActor!=='player')throw Error('NPC breakthrough requires its native evidence adapter');
            // Masterpiece, completed research or a key battle recorded by career metrics.
            const evidence=evidenceBreakthrough(d,this,skill,args.breakthroughSource,old);if(evidence)return evidence;
            const teacher=this.resolve(args.breakthroughSource,'npc'),base=this.byId.get(teacher),role=this.byId.get(skill).profession;
            if(!personTeaching(this,d.get('state'),teacher,skill)||d.get('state','npcs',teacher,'location')!==d.get('state','location'))reject('E-ACTION-PRECONDITION','突破导师不具备资格或不在场');
            assertNpcService(d,this,teacher,'teach',120);
            if(old.proficiency%300!==299)reject('E-ACTION-PRECONDITION','尚未达到当前阶段上限');
            if(!certifiedForSkill(d,this,skill))reject('E-ACTION-PRECONDITION','未认证职业不能跨越初级阶段');
            const outcome=this.check(d,{attribute:this.byId.get(skill).attribute,difficulty:20},id);
            this.advance(d,120,id);
            if(outcome.success)d.set(['state','skills',skill,'breakthroughs'],[...new Set([...old.breakthroughs??[],stage+1])]);
            return {skill,breakthrough:outcome.success,...outcome};
        }
        const daily=clone(old.daily??{}),row=daily[day]??{gain:0,targets:{}},target=text(args.target??'普通练习',100),repeats=row.targets[target]??0;
        const requested=nativeGain===null?number(args.gain??3,0,100,'练习收益'):nativeGain;
        if(!Number.isFinite(requested)||requested<0||requested>100000)throw Error('原生练习收益不在允许范围');
        if(nativeGain!==null&&(!Number.isFinite(old.practiceCarry??0)||(old.practiceCarry??0)<0||(old.practiceCarry??0)>=1))throw Error('原生练习小数余量损坏');
        // The fourth argument is native-only. JSON tool arguments cannot opt
        // into fractional gains; legacy practice and its snapshots stay exact.
        const accruedUnits=nativeGain===null?null:(repeats>64?0n:fixedUnits(requested)/(2n**BigInt(repeats)))+fixedUnits(old.practiceCarry??0);
        const accrued=nativeGain===null?requested*0.5**repeats:fixedNumber(accruedUnits);
        const room=this.rules.practice.dailyCaps[stage]-row.gain;
        const gain=Math.max(0,Math.min(nativeGain===null?Math.floor(accrued):fixedInteger(accruedUnits),room));
        const role=this.byId.get(skill).profession;
        const certified=nativeActor==='player'?certifiedForSkill(d,this,skill):personCertified(this,d.get('state'),nativeActor,skill);
        if(!certified&&old.proficiency>299)return {skill,gain:0,proficiency:old.proficiency,effectiveProficiency:299,retained:true};
        const limit=Math.max(old.proficiency,Math.min(nativeCeiling,certified?2699:299,(old.breakthroughs??[]).includes(stage+1)?(stage+2)*300-1:(stage+1)*300-1));
        const proficiency=Math.min(limit,old.proficiency+gain),actual=proficiency-old.proficiency;
        row.gain+=actual;row.targets[target]=repeats+1;daily[day]=row;
        for(const key of Object.keys(daily))if(Number(key)<Number(day)-1)delete daily[key];
        const carry=nativeGain===null?{}:{practiceCarry:room<=accrued||proficiency>=limit?0:fixedNumber(accruedUnits%FIXED_SCALE)};
        d.set(path,{...old,...carry,proficiency,grade:skillGrade(proficiency),daily});d.say(`${this.byId.get(skill).name}熟练度 +${actual}`);
        const paths=nativeActor==='player'&&proficiency%300===299?breakthroughPaths(d.get('state'),skill,proficiency):[];
        return {skill,gain:actual,proficiency,needsBreakthrough:proficiency%300===299,...(paths.length?{breakthroughPaths:paths}:{})};
    }
    applyMagicArea(d,catalog,args,id,source='player'){
        return applyAreaMagic.call(this,d,prepareAreaMagic.call(this,d,catalog,args,{source}),id);
    }
    magicTargetFacts(d,target){const reader=Object.create(this);reader.airDraft=d;return targetFacts(d,reader,target);}
    magicAreaTargetFacts(d,target,location,center){return areaTargetFacts(d,this,target,location,center);}
    magicStatusContext(d,target){return statusContext(d,this,target);}
    cast(d,args,id) {
        const spell=this.resolve(args.spell,'spell'),known=d.get('state','spells',spell),catalog=this.byId.get(spell);
        if(!known)reject('E-ACTION-PRECONDITION','尚未学会这个法术');
        const band=this.rules.magic.stageMpRanges[catalog.stage];
        if(!band||catalog.mp<band[0]||catalog.mp>band[1])throw new Error('法术消耗不符合阶段规则');
        const prepared=prepareMagic.call(this,d,catalog,args);
        if(d.get('state','player','status')==='濒死'&&(!(catalog.effectSpec?.kind==='heal'||catalog.effectSpec?.kind==='care'&&['stabilize','hemostasis','clean_wound'].includes(catalog.effectSpec.operation))||prepared?.target!=='player'))reject('E-ACTION-PRECONDITION','濒死时只能尝试对自己施放救治法术');
        if(d.get('state','player','mp')<catalog.mp)reject('E-ACTION-CAST-MP','魔力不足');
        for(const material of catalog.materials)if(this.quantity(d,'player',material.item)<material.amount)reject('E-ACTION-PRECONDITION',`缺少材料${this.byId.get(material.item).name}`);
        d.set(['state','player','mp'],d.get('state','player','mp')-catalog.mp);
        for(const material of catalog.materials)this.itemDelta(d,'player',material.item,-material.amount,{flow:'sink:consume',purpose:'spell',writer:'engine',eventId:id});
        const result=this.check(d,{attribute:'精神',skill:catalog.skill,difficulty:catalog.difficulty},id);
        const legalCase=recordSpellViolation(d,this,catalog,args,prepared?.target??prepared?.id,id);
        this.advance(d,catalog.minutes,id);this.practice(d,{skill:catalog.skill,gain:3,target:args.target??'施法'},id);
        if(result.success&&catalog.duration&&!prepared)d.set(['state','effects',id],{spell,target:text(args.target??'近处物体',200),expires:d.get('state','minute')+catalog.duration});
        const effect=result.success?applyMagic.call(this,d,prepared,id):{};
        let backlash=null;
        if(!result.success&&result.degree==='大失败'&&catalog.failureDamage){
            let damage=catalog.failureDamage;
            if(catalog.stage<=1&&hiddenCheckBonus(this,d.get('state'),'player','backlash').bonus){
                const tolerance=this.check(d,{attribute:'体质',difficulty:10,passiveDomain:'backlash'},`${id}:backlash`);
                damage=Math.max(1,damage-(tolerance.success?1:0));backlash={...tolerance,damage};
            }
            this.health(d,{delta:-damage},id);
        }
        const completed=result.success&&!effect.effectFailed;
        // U10: village-scale economy of life magic (ledger, regulation).
        const economy=completed?recordMagicEconomy.call(this,d,catalog,effect,id):null;
        d.say(`${catalog.name}${completed?'施放成功':'施放失败'}，消耗${catalog.mp}魔力`);
        return {spell,...result,...effect,...(backlash?{backlash}:{}),...(legalCase?{case:legalCase}:{}),checkSuccess:result.success,success:completed,mpCost:catalog.mp,...(economy?{economy}:{})};
    }
    learn(d,args,id) {
        return learn.call(this,d,args,id);
    }
    profession(d,args,id){
        const seat=facilityRuntime().assertExaminationSeat?.(d,this,args),result=profession.call(this,d,args,id);
        facilityRuntime().consumeExaminationSeat?.(d,seat,id);return result;
    }
    attributes(d,args,id){return allocateAttributes.call(this,d,args,id);}
    relation(d,args,id) {
        return applyNpcRelation(d,this,args,id);
    }
    promise(d,args,id) {
        if(['settle','close','file_claim','receive_collection','resume_estate'].includes(args.operation)){
            if(args.actor&&args.actor!=='player')throw Error('Public settlement must be performed by the player');
            if(args.operation==='settle')return settleObligation(d,this,{id:args.obligation,payer:'player',actor:'player',...(args.coins!==undefined?{amount:args.coins}:{})},id);
            if(args.operation==='close'){
                const row=dueObligation(d.get('state'),args.obligation)?.row;
                if(!row)throw Error('Unknown obligation');
                return closeObligation(d,this,{id:args.obligation,actor:'player',party:row.creditor==='player'?'player':row.debtor},id);
            }
            if(args.operation==='receive_collection')return receiveObligationCollection(d,this,{id:args.obligation,actor:'player'},id);
            if(args.operation==='file_claim'){
                const claim=dueObligation(d.get('state'),args.obligation);
                if(claim?.row.creditor!=='player')throw Error('Only the creditor can file this claim');
                const result=fileClosedObligation(d,this,{estate:args.estate,obligation:args.obligation,eventId:id});
                advanceProcedure(d,this,args.estate);return result;
            }
            const p=d.get('holdings','protocol','procedures',args.estate);
            if(!p?.reopenedClaims?.some(oid=>{const row=dueObligation(d.get('state'),oid)?.row;return row&&[row.debtor,row.creditor].includes('player');}))throw Error('No reopened estate claim involving the player');
            advanceProcedure(d,this,args.estate);return {estate:args.estate,phase:d.get('holdings','protocol','procedures',args.estate,'phase')};
        }
        const conversation=dialogueRequest(d,this,args,id);if(conversation)return conversation;
        const permission=homePermission(d,this,args,id);if(permission)return permission;
        const reserved=createNpcObligation(d,this,args,id);if(reserved)return reserved;
        const promisor=this.resolve(args.promisor),promisee=this.resolve(args.promisee??'player'),type=args.type;
        if(!['带路','送货','付款','等候','会面','协助'].includes(type))reject('E-ACTION-PRECONDITION','义务类别不支持；type 可选：带路、送货、付款、等候、会面、协助');
        if(promisor!=='player'&&!d.get('state','npcs',promisor))reject('E-ACTION-PRECONDITION','承诺者不在战役中');
        for(const actor of[promisor,promisee])if((isPhysicallyDead(this,d,actor)||this.actor(d,actor)?.status==='濒死'))reject('E-ACTION-PRECONDITION','义务当事人无法清醒履约');
        for(const actor of[promisor,promisee])if(actor!=='player'&&personConstraint(this,d.get('state'),actor))reject('E-ACTION-PRECONDITION','义务当事人正在依法拘留，不能自由行动');
        const obligation={id:`obl_${id}`,type,promisor,promisee,content:text(args.content),status:'待履行',deadline:number(args.deadline??d.get('state','minute')+1440,0,Number.MAX_SAFE_INTEGER)};
        let routePreview;
        if(type==='带路'){
            obligation.destination=this.resolve(args.destination);
            const from=d.get('state','location'),calculatedAt=d.get('state','minute'),route=this.route(from,obligation.destination,'walk',calculatedAt,d.document.randomSeed);
            routePreview={from,destination:obligation.destination,minutes:route.minutes,movingMinutes:route.movingMinutes,cost:route.cost,calculatedAt,estimate:true};
            if(promisor==='player'||d.get('state','npcs',promisor,'location')!==d.get('state','location'))reject('E-ACTION-PRECONDITION','带路者必须在场');
            obligation.status='进行中';holdingSet(d,null,['state','player','companions'],[...new Set([...d.get('state','player','companions'),promisor])],'engine');
        }
        if(type==='送货'){obligation.item=this.resolve(args.item,'item');obligation.quantity=number(args.quantity,1,100000);}
        if(type==='付款'){
            obligation.coins=number(args.coins,1,1e9);
            if(args.obligation!==undefined){
                const claim=dueObligation(d.get('state'),args.obligation);
                if(!claim||claim.closed||claim.row.debtor!==promisor||claim.row.creditor!==promisee||claim.owed<obligation.coins)reject('E-ACTION-PRECONDITION','履约承诺须指向本人对该债权人的未清债务，金额不得超过余额');
                if(args.location!==undefined&&this.resolve(args.location)!==d.get('state','location'))reject('E-ACTION-PRECONDITION','付款承诺须在约定交付地点作出');
                obligation.location=args.location??d.get('state','location');
                obligation.terms={fulfills:claim.row.id,promisedAmount:obligation.coins,place:obligation.location};
            }
            if(!this.replaying||this.replayResult?.obligation?.recordCompletionTime===true)obligation.recordCompletionTime=true;
            if(!this.replaying){
                const existing=Object.entries(d.get('state','records')??{}).find(([,row])=>row.category==='debt'&&row.debtor===promisor&&row.creditor===promisee&&row.status!=='已还清'&&row.amount-row.paid===obligation.coins);
                if(existing&&!obligation.terms?.fulfills)reject('E-ACTION-PRECONDITION',`这笔付款已有欠款记录 ${existing[0]}，不能再登记会重复扣款的付款约定；还款请按该欠款编号办理，赊账期限应在交易时用 creditMinutes 设置`);
            }
        }
        if(type==='协助'){
            if(promisor==='player'||d.get('state','npcs',promisor,'location')!==d.get('state','location'))reject('E-ACTION-PRECONDITION','协助者必须在场');
            obligation.attribute=args.attribute??'精神';if(!this.rules.attributes.includes(obligation.attribute))reject('E-ACTION-PRECONDITION','协助属性不在规则表');
            obligation.skill=args.skill?this.resolve(args.skill,'skill'):null;
            if(obligation.skill&&npcProficiency(d,this,promisor,obligation.skill)<(this.rules.check.helperMinimumProficiency??100))reject('E-ACTION-PRECONDITION','协助者技能不足');
        }
        if(type==='付款'){
            // A performance promise is a zero-principal obligation linked to
            // the existing claim; it must never count the same debt twice.
            openObligation(d,this,{...obligation,kind:'promise',debtor:promisor,creditor:promisee,actor:promisor,amount:obligation.terms?.fulfills?0:obligation.coins},id);
            d.set(['state','obligations',obligation.id,'status'],obligation.status);
            return {obligation:d.get('state','obligations',obligation.id)};
        }
        d.set(['state','obligations',obligation.id],obligation);return {obligation,...(routePreview?{routePreview}:{})};
    }
    deliver(d,key,o,id){
        const source=this.actor(d,o.promisor),target=this.actor(d,o.promisee);if(!source||!target)reject('E-ACTION-PRECONDITION','义务当事人不存在');
        if(o.deliveryVersion===1){
            const to=o.promisee==='player'?d.get('state','location'):target.location;
            if(source.location!==o.location||source.scheduleTravel||source.cognitionTravel)reject('E-ACTION-PRECONDITION','送货者未能按时抵达约定地点');
            if(to!==o.location||target.scheduleTravel||target.cognitionTravel)throw Object.assign(new Error('收件人未在约定地点，货物仍由送货者持有'),{deliveryResponsibility:o.promisee});
            if((o.promisee==='player'||d.get('state','player','companions')?.includes(o.promisee))&&this.npcObligationAction?.tool==='move'&&d.get('state','minute')<this.npcObligationAction.arrivalMinute)throw Object.assign(new Error('收件人仍在途中，尚未到达约定地点'),{deliveryResponsibility:o.promisee});
        }
        if(o.deliveryVersion===1&&(['死亡','濒死','昏迷','患病'].includes(target.status)||/(睡眠|熟睡|睡觉)/.test(target.activity??'')||o.promisee==='player'&&this.npcObligationAction?.args?.activity==='睡眠'))throw Object.assign(new Error('收件人无法清醒接收货物'),{deliveryResponsibility:o.promisee});
        if([source,target].some(actor=>['死亡','濒死'].includes(actor.status)))reject('E-ACTION-PRECONDITION','义务当事人无法清醒履约');
        if([o.promisor,o.promisee].some(actor=>personSimulation(this,d.get('state'),actor).value)){
            const from=o.promisor==='player'?d.get('state','location'):source.location,to=o.promisee==='player'?d.get('state','location'):target.location;
            if(!from||!to||from!==to)reject('E-ACTION-PRECONDITION','双方尚未在同一地点交付，不能隔空转移钱物');
            if([source,target].some(actor=>['昏迷','患病'].includes(actor.status)||/(睡眠|熟睡|睡觉)/.test(actor.activity??'')))reject('E-ACTION-PRECONDITION','义务当事人尚不能清醒交付');
        }
        if(o.type==='送货'){
            if(this.quantity(d,o.promisor,o.item)<o.quantity)reject('E-ACTION-PRECONDITION','承诺者缺少货物');
            performObligation(d,this,{id:key,actor:o.promisor},o.deliveryVersion===1?`delivery:${key}:${o.deadline}`:`${id}:deliver:${key}`);
        }
        if(o.type==='付款'){
            if(o.runtimeVersion===1&&o.terms?.fulfills){
                const place=o.promisor==='player'?d.get('state','location'):source.location;
                if(place!==o.terms.place)reject('E-ACTION-PRECONDITION','履约者未在约定交付地点');
                const claim=dueObligation(d.get('state'),o.terms.fulfills);
                if(!claim||claim.row.debtor!==o.promisor||claim.row.creditor!==o.promisee)reject('E-ACTION-PRECONDITION','原债当事人已变化，不能按旧承诺付款');
                const amount=Math.min(o.terms.promisedAmount,claim.owed);
                if(amount)settleObligation(d,this,{id:o.terms.fulfills,payer:o.promisor,actor:o.promisor,amount},`${id}:deliver:${key}`);
            }else if(o.runtimeVersion===1)settleObligation(d,this,{id:key,payer:o.promisor,amount:dueObligation(d.get('state'),key).owed},`${id}:deliver:${key}`);
            else{if(source.coins<o.coins)reject('E-ACTION-PRECONDITION','承诺者资金不足');transfer(d,{from:accountKey(this.actorPath(o.promisor).at(-1)==='player'?'player':this.actorPath(o.promisor).at(-1),LEDGER_COIN,'purse'),to:accountKey(this.actorPath(o.promisee).at(-1)==='player'?'player':this.actorPath(o.promisee).at(-1),LEDGER_COIN,'purse'),amount:o.coins,writer:'engine'});d.set([...this.actorPath(o.promisor),'coins'],source.coins-o.coins);d.set([...this.actorPath(o.promisee),'coins'],target.coins+o.coins);}
        }
        d.set(['state','obligations',key,'status'],'已完成');if(o.deliveryVersion===1||o.recordCompletionTime)d.set(['state','obligations',key,'resolvedAt'],d.get('state','minute'));d.say(`${o.content}已履行`);
    }
    remember(d,args,id) {
        const conversation=applyDialogue(d,this,args,id);if(conversation)return conversation;
        if(args.rumor!==undefined)return hearNpcRumor(d,this,args,id);
        if(args.truth!==undefined)return recordLie(d,this,args,id);
        if(args.motive!==undefined||args.knowers!==undefined)reject('E-ACTION-PRECONDITION','motive/knowers只用于带truth的谎言登记');
        const exposed=exposeLieCall(d,this,args,id);if(exposed)return exposed;
        const subject=this.resolve(args.subject),content=validateMemory(args.content),key=text(args.key,100),memoryId=`${subject}::${key}`;
        if(d.get('memories',memoryId,'rumor'))reject('E-ACTION-PRECONDITION','登记传闻的获知记录只能由受校验的交谈生成');
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
        if(!hit||hit.location!==document.state.location||hit.npcs!==document.state.npcs){hit={location:document.state.location,npcs:document.state.npcs,...campaignCatalog(this,document,created)};this.promptResolvers.set(branch,hit);}
        const player={id:'player',name:document.state.player.name,aliases:['玩家','玩家角色'],scope:document.state.location};
        const session=Object.create(this);session.entities=[...hit.entities,player];session.resolver=hit.resolver.extend([player]);session.byId=session.resolver.entities;
        session.calendarId=document.state.records?.['calendar:active']?.calendar??this.calendarId;
        return session;
    }
    // A scene reads one fixed state: per-person schedule reads share one course derivation.
    scene(document,query,index=null){
        const transport=transportScene(this,document);if(transport!=null)return transport;
        const session=this.promptScoped(document);session.educationCourseMemo=new WeakMap();
        return sceneCard(session,document,query,index);
    }

}
Object.assign(WorldEngine.prototype,activities);
