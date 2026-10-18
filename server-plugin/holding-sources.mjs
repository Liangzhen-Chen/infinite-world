// S2a 持有适配器（L1）：把旧状态里表达结构性关系、职位 / 遗产 / 案件 / 议案 / 残骸与物品位置的字段
// 映射为持有、实体与位置事实（01 §1.3、§1.2），并给旧写入点一个同时写新存储的入口（绞杀式双写：
// 旧字段照写，读取暂不改）。
//
// 每类旧来源是一个 source：
//   units(engine, state)          → 旧状态里这一类的全部单元（一个单元 = 一个旧记录、一个组织、一个职位……）
//   extract(engine, state, unit)  → 该单元按旧字段应有的 {holdings, entities, locations}
// 提取只读“存下的事实”（记录字段、作者数据），不读时刻与生死：到期不写状态的、人死了旧读者在读取时滤掉的，
// 都不算旧字段的变化（那是 S2b 协议与读取派生的事）。开账（holdings.registerHoldingsOpening）与对账都只经这里取数。
//
// syncHoldings(d, engine, source, unit, {writer, reason, eventId}) 是旧写入点的双写入口：读写入后的旧字段，
// 与存储里该单元的存活持有比对，按差关闭（reason）与开立（经 L0 唯一写入点，受注册形状校验）。
// 旧写入点漏调它，对账（tests/helpers/holdings-audit.mjs）即报出差异。
import {ensureHoldings,holdingsActive,aliveHoldings,openHolding,closeHolding,createEntity,updateEntity,endEntity,entityRow,
    setLocation,clearLocation,locationOf,holdingsOfSource,declareHoldingWriter,recordHoldingDrift,HoldingRejected,registerHoldingsOpening,registerEntityResolver,registerCapacityResolver,registerHoldingObserver,holdingSet,holdingRemove,registerHoldingsUpgrade,ENTITY_KINDS} from './holdings.mjs';
import './holding-kinds.mjs';
import {holdingKind} from './holdings.mjs';
import {appendFileSync as fsAppend} from 'node:fs';
import {storedOrganization,storedOrganizationIds} from './organization-state.mjs';
import {actorId} from './npc-state.mjs';
import {snapshotContractTerms} from './contract-state.mjs';
import {snapshotObligationTerms} from './obligation-kinds.mjs';
import {isGone} from './lifecycle-state.mjs';
import {runHoldingProtocol} from './holdings.mjs';
import {legalCodeById} from './law-codes.mjs';
import {openingTransportAssets} from '../world/design/transport-rules.mjs';

const read=(d,...p)=>typeof d.peek==='function'?d.peek(...p):d.get(...p);
// 调试与审计：HOLDINGS_DEBUG 打印、HOLDINGS_AUDIT_LOG 追加双写时抛出的错误（游戏代码可能吞掉异常、改变结算，审计要看得见）。
const debugLog=process.env.HOLDINGS_AUDIT_LOG,debug=process.env.HOLDINGS_DEBUG||debugLog;
let depth=0;
function guarded(writer,path,fn){
    if(!debug)return fn();
    depth++;try{return fn();}catch(e){if(depth===1)reportError(e,writer,path);throw e;}finally{depth--;}
}
function reportError(e,writer,path){
    if(e.holdingsReported)return;e.holdingsReported=true;
    const line=JSON.stringify({holdingError:e.message,code:e.code??null,writer,path,stack:String(e.stack).split(/\r?\n/).slice(1,6).join(' | ')});
    if(debugLog)fsAppend(debugLog,line+'\n');else console.error('HOLDINGS',line);
}
const sources=new Map();
export function defineHoldingSource(name,spec){
    if(!/^[a-z][a-z0-9_-]*$/.test(name))throw Error(`持有来源名无效：${name}`);
    if(sources.has(name))throw Error(`持有来源重复：${name}`);
    sources.set(name,spec);
}
export const holdingSources=()=>[...sources.keys()].sort();

defineHoldingSource('transition',{
    recordCategories:['transition','transition_procedure'],unitOfRecord:(state,key)=>state.records?.[key]?.entity,
    units:(engine,state)=>Object.values(state.records??{}).filter(r=>r.category==='transition').map(r=>r.entity),
    extract(engine,state,id){
        const r=state.records?.[`transition:${id}`];if(!r)return null;
        const entities=[],locations=[];
        const procedures=Object.values(state.records??{}).filter(p=>p.category==='transition_procedure'&&p.entity===id);
        if(r.successor&&!procedures.some(p=>p.id===r.successor))procedures.push({id:r.successor,phase:'notice'});
        for(const p of procedures)entities.push({id:p.id,kind:p.id.startsWith('liq_')?'liquidation':'estate',facts:{of:id,phase:p.phase}});
        if(r.wreck&&r.gone){entities.push({id:r.wreck,kind:'wreck',facts:{of:id,body:r.body,yields:r.yields}});
            if(r.location)locations.push({entity:r.wreck,at:r.location,mode:'place'});}
        return {entities,locations};
    },
});
const sourceKey=(name,unit)=>`${name}:${unit}`;
const parseSource=key=>{const i=String(key).indexOf(':');return i<0?null:{name:key.slice(0,i),unit:key.slice(i+1)};};

// 某类记录的列表。ctx 是一次提取（开账、对账、一次双写）共用的缓存：同一次提取里 state 不变，
// 跨次不复用（草稿里的 records 会被原地改写，不能按对象身份缓存）。
export function byCategory(state,category,ctx={}){
    if(!ctx.byCategory){const m=new Map();for(const r of Object.values(state?.records??{}))if(r?.category){let l=m.get(r.category);if(!l)m.set(r.category,l=[]);l.push(r);}ctx.byCategory=m;}
    return ctx.byCategory.get(category)??[];
}
// ---- 实体模板解析（登记给 L0）：实体 id → 可能的模板 --------------------------------------
const worldSets=new WeakMap();
function sets(engine){
    let s=worldSets.get(engine.world);if(s)return s;
    const w=engine.world;
    s={factions:new Set((w.factions??[]).map(f=>f.id)),households:new Set((w.households??[]).map(h=>h.id)),
        settlements:new Set([...(w.settlementProfiles??[]).map(p=>p.id),...(engine.rules?.agriculture?.settlements??[]).map(p=>p.settlement),...(w.regions??[]).map(r=>r.id)]),
        people:new Set([...(w.npcs??[]),...(w.residents??[]),...(w.factionPeople??[])].map(p=>p.id)),
        creatures:new Set([...(w.monsters??[]),...(w.bosses??[])].map(m=>m.id)),
        polities:new Set((engine.rules?.military?.polities??[]).map(p=>p.id)),banks:new Set((engine.rules?.economy?.credit?.banks??[]).map(b=>b.id)),
        lairs:new Set((w.bosses??[]).map(b=>b.residence?.id).filter(Boolean)),
        societies:new Set((w.locations??[]).filter(l=>l.monsterSociety).map(l=>l.id))};
    worldSets.set(engine.world,s);return s;
}
const COLLECTIVE_PREFIX=/^(faction_|house_|org_|temple:|family:|clinic:|school:|polity:|guild:|nation_|army_|society_)/;
export function entityTemplates(engine,state,id){
    if(typeof id!=='string'||!id)return null;
    const w=sets(engine),records=state?.records??{};
    if(id==='player')return ['agent'];
    const out=new Set();
    if(records[`protocol_assets:${id}`])out.add('interim');
    if(state?.npcs?.[id]||state?.created?.[id]&&state.created[id].kind!=='building'||state?.family?.people?.[id]||w.people.has(id)||state?.creatures?.[id]||w.creatures.has(id)||/^npc_/.test(id))out.add('agent');
    if(w.settlements.has(id)||state?.settlements?.[id]){out.add('collective');out.add('place');}
    if(w.factions.has(id)||w.households.has(id)||w.polities.has(id)||w.banks.has(id)||records[id]?.category==='bank'||w.societies.has(id)||records[`organization:${id}`]||state?.family?.households?.[id]||COLLECTIVE_PREFIX.test(id))out.add('collective');
    if(/^(loc_|site_|lair_)/.test(id)||w.lairs.has(id)||engine.byId?.get(id)?.type==='loc')out.add('place');
    if(/^bld_/.test(id)||state?.created?.[id]?.kind==='building'){out.add('thing');out.add('place');}
    if(state?.itemInstances?.[id]||records[id]?.category==='transport_asset'||/^transport_asset:/.test(id)||state?.buildings?.[id])out.add('thing');
    if(records[id]?.category==='business')out.add('thing');
    if(state?.obligations?.[id]||['debt','contract','pledge'].includes(records[id]?.category))out.add('instrument');
    return out.size?[...out]:null;
}
registerEntityResolver((d,id,engine)=>engine?entityTemplates(engine,read(d,'state'),id):null);
// 容量（lodges）：节点事实 capacity，读作者数据或运行期创建的地点。
registerCapacityResolver((d,id,field,engine)=>engine?.byId?.get(id)?.[field]??read(d,'state','created',id)?.[field]??null);

// ---- 提取、开账与双写 -----------------------------------------------------------------
const canon=v=>v===undefined||v===null?'':JSON.stringify(v,Object.keys(v).sort());
const holdingKey=h=>`${h.kind}|${h.variant??''}|${h.holder}|${h.subject}|${canon(h.terms)}`;
// 一个单元按旧字段应有的内容；缺省三项为空。
function desired(engine,state,name,unit,ctx={}){
    const out=sources.get(name).extract(engine,state,unit,ctx)??{};
    // Old fields retain history. A legal disappearance closes their current
    // edges; the compatibility projection independently reads the declaration.
    const gone=id=>isGone(engine,state,id)&&state.records?.[`transition:${id}`]?.gone?state.records[`transition:${id}`]:null;
    const holdings=(out.holdings??[]).flatMap(h=>{
        let row={...h};const a=gone(h.holder),b=gone(h.subject);
        if(a){const hook=holdingKind(h.kind)?.handover.gone;
            const target=hook==='estate'?a.successor:hook==='succeed'?a.successors?.[0]:hook==='revert'?h.grantedBy:null;
            if(!target)return [];row.holder=target;
        }
        if(b){const hook=holdingKind(h.kind)?.onSubjectGone;if(hook==='close')return [];
            if(hook==='estate')row.subject=b.successor??b.wreck;
            if(hook==='reparent')row.subject=b.location;
        }
        return row.subject?[row]:[];
    });
    return {holdings,entities:(out.entities??[]).filter(e=>!gone(e.id)),locations:(out.locations??[]).filter(l=>!gone(l.entity)).map(l=>{
        const t=gone(l.at);return t?{...l,at:t.wreck??t.location,mode:t.wreck?'container':'place'}:l;
    })};
}
function* allUnits(engine,state){
    for(const name of holdingSources())for(const unit of new Set(sources.get(name).units(engine,state)))yield [name,String(unit)];
}
// 开账（genesis）：全部来源的全部单元。来源名带进 source 字段，对账与双写按它找回单元。
export function legacyHoldings(engine,state){
    const holdings=[],entities=[],locations=[],seen=new Set(),ctx={};
    for(const [name,unit] of allUnits(engine,state)){
        const out=desired(engine,state,name,unit,ctx),source=sourceKey(name,unit);
        for(const h of out.holdings)holdings.push({...h,source});
        // 同一实体可被几个单元提到（职位既是任职的标的，又是任命的持有人）：首个提到它的单元是它的来源。
        for(const e of out.entities)if(!seen.has(e.id)){seen.add(e.id);entities.push({...e,source});}
        for(const l of out.locations)locations.push({...l,source});
    }
    return {holdings,entities,locations};
}
registerHoldingsOpening(legacyHoldings);

declareHoldingWriter('holding-sources',{kinds:['*'],entities:['*'],locations:true});
// 双写入口：writer 为旧写入点所在模块（须声明持有写入者），reason 为关闭旧边的原因。
export function syncHoldings(d,engine,name,unit,opts={}){return guarded(opts.writer,[name,unit],()=>syncHoldingsUnguarded(d,engine,name,unit,opts));}
function syncHoldingsUnguarded(d,engine,name,unit,{writer,reason='vacated',eventId=null}={}){
    engine??=d.engine;if(!engine)return false;// 演算用的工作草稿（无引擎）不双写：回放到正式草稿时再写
    if(!sources.has(name))throw Error(`未登记的持有来源：${name}`);
    if(!writer)throw Error('双写须给出写入者');
    if(!ensureHoldings(d,engine))return false;
    applyUnit(d,engine,name,String(unit),{writer,reason,eventId});
    return true;
}
// 旧记录（state.records 的一行）的双写：按记录类别找到受影响的来源与单元（写入前后两版记录都算，
// 改了持有人、换了聚落或删掉记录都能找回原单元）。来源以 recordCategories / unitOfRecord 声明它读哪些记录。
export function syncHoldingRecord(d,engine,key,opts={}){return guarded(opts.writer,['records',key],()=>syncHoldingRecordUnguarded(d,engine,key,opts));}
function syncHoldingRecordUnguarded(d,engine,key,opts){
    engine??=d.engine;if(!engine)return false;// 演算用的工作草稿（无引擎）不双写：回放到正式草稿时再写
    if(!ensureHoldings(d,engine))return false;
    const state=read(d,'state'),units=new Set();
    for(const [state0,row] of [[state,state?.records?.[key]],[d.original?.state,d.original?.state?.records?.[key]]]){
        if(!row?.category)continue;
        for(const [name,spec] of sources)if(spec.recordCategories?.includes(row.category))for(const u of [].concat(spec.unitOfRecord(state0,key,row)??[]))units.add(`${name}#${u}`);
    }
    for(const x of [...units].sort()){const i=x.indexOf('#');applyUnit(d,engine,x.slice(0,i),x.slice(i+1),opts);}
    return units.size>0;
}
// 同一来源的全部单元（写入点一次改动多条旧记录、或不便算出单元时）。
export function syncHoldingSource(d,engine,name,opts={}){return guarded(opts.writer,[name],()=>syncHoldingSourceUnguarded(d,engine,name,opts));}
function syncHoldingSourceUnguarded(d,engine,name,opts){
    engine??=d.engine;if(!engine)return false;// 演算用的工作草稿（无引擎）不双写：回放到正式草稿时再写
    if(!sources.has(name))throw Error(`未登记的持有来源：${name}`);
    if(!ensureHoldings(d,engine))return false;
    const state=read(d,'state'),units=new Set([...sources.get(name).units(engine,state)].map(String));
    for(const r of aliveHoldings(d))if(r.source?.startsWith(`${name}:`))units.add(parseSource(r.source).unit);
    for(const e of Object.values(read(d,'holdings','entities')??{}))if(e.goneAt===undefined&&e.source?.startsWith(`${name}:`))units.add(parseSource(e.source).unit);
    for(const [,l] of Object.entries(read(d,'holdings','locations')??{}))if(l.source?.startsWith(`${name}:`))units.add(parseSource(l.source).unit);
    for(const unit of [...units].sort())applyUnit(d,engine,name,unit,opts);
    return true;
}
// 一条写入被注册形状拒绝（HoldingRejected）时记漂移、跳过这一条；其余错误（程序错误）照常抛出。
function attempt(d,info,fn){
    try{return fn();}catch(e){if(!(e instanceof HoldingRejected))throw e;recordHoldingDrift(d,{...info,code:e.code,reason:e.message});return null;}
}
function applyUnit(d,engine,name,unit,{writer,reason='vacated',eventId=null}){
    const want=desired(engine,read(d,'state'),name,unit),source=sourceKey(name,unit);
    if(!want.holdings.length&&!want.entities.length&&!want.locations.length){const s0=holdingsOfSource(d,source);if(!s0.holdings.length&&!s0.entities.length&&!s0.locations.length)return;}
    // 实体先于持有：新职位、案件等要先存在才能被持有。
    for(const e of want.entities){
        const have=entityRow(d,e.id);
        const info={source,writer,eventId,entity:e.id};
        if(!have)attempt(d,info,()=>createEntity(d,{id:e.id,kind:e.kind,facts:e.facts??{},source,writer,eventId,origin:'runtime'}));
        else if(have.goneAt===undefined&&canon(have.facts)!==canon(e.facts??{}))attempt(d,info,()=>updateEntity(d,{id:e.id,facts:e.facts??{},writer,eventId}));
    }
    const stored=holdingsOfSource(d,source),current=stored.holdings,wanted=new Map(want.holdings.map(h=>[holdingKey(h),h]));
    const keep=new Set();
    for(const r of current){const k=holdingKey(r);if(wanted.has(k)&&!keep.has(k))keep.add(k);else attempt(d,{source,writer,eventId,kind:r.kind,holder:r.holder,subject:r.subject},()=>runHoldingProtocol(d,engine,{op:'close',id:r.id,reason,eventId})??closeHolding(d,{id:r.id,reason,writer,eventId}));}
    for(const [k,h] of wanted)if(!keep.has(k))attempt(d,{source,writer,eventId,kind:h.kind,variant:h.variant??null,holder:h.holder,subject:h.subject},()=>runHoldingProtocol(d,engine,{...h,op:'open',source,eventId})??openHolding(d,{...h,source,writer,eventId,engine}));
    for(const l of want.locations)attempt(d,{source,writer,eventId,entity:l.entity},()=>setLocation(d,{entity:l.entity,at:l.at,mode:l.mode,writer,source,engine}));
    for(const entity of stored.locations)if(!want.locations.some(x=>x.entity===entity))attempt(d,{source,writer,eventId,entity},()=>clearLocation(d,{entity,writer}));
    // 旧字段里已不存在的实体：记墓碑（basis 由来源声明，缺省 destruction）。
    for(const id of stored.entities)if(!want.entities.some(x=>x.id===id))
        attempt(d,{source,writer,eventId,entity:id},()=>endEntity(d,{id,basis:sources.get(name).goneBasis??'destruction',writer,eventId}));
}

// ---- 对账（测试与审计用）：旧字段应有 vs 存储存活，逐条 ---------------------------------
export function reconcileHoldings(engine,document){
    const out={missing:[],extra:[],entities:[],locations:[]};
    const d={peek:(...p)=>p.reduce((v,k)=>v?.[k],document)};
    if(document?.holdings?.version===undefined)return out;
    const want=legacyHoldings(engine,document.state);
    const have=new Map();for(const r of aliveHoldings(d))have.set(`${r.source}#${holdingKey(r)}`,(have.get(`${r.source}#${holdingKey(r)}`)??0)+1);
    for(const h of want.holdings){const k=`${h.source}#${holdingKey(h)}`;if(have.get(k))have.set(k,have.get(k)-1);else out.missing.push(k);}
    for(const [k,n] of have)if(n>0)out.extra.push(k);
    const ents=document.holdings.entities??{};
    for(const e of want.entities){const x=ents[e.id];if(!x||x.goneAt!==undefined)out.entities.push(`missing ${e.id}`);else if(x.kind!==e.kind||canon(x.facts)!==canon(e.facts??{}))out.entities.push(`facts ${e.id}: ${canon(x.facts)} ≠ ${canon(e.facts??{})}`);}
    const wantIds=new Set(want.entities.map(e=>e.id));
    for(const x of Object.values(ents))if(x.goneAt===undefined&&!wantIds.has(x.id))out.entities.push(`extra ${x.id}`);
    const locs=document.holdings.locations??{},wantLoc=new Map(want.locations.map(l=>[l.entity,l]));
    for(const [entity,l] of wantLoc){const x=locs[entity];if(!x||x.at!==l.at||x.mode!==l.mode)out.locations.push(`${entity}: ${x?`${x.mode}@${x.at}`:'无'} ≠ ${l.mode}@${l.at}`);}
    for(const entity of Object.keys(locs))if(!wantLoc.has(entity))out.locations.push(`extra ${entity}`);
    out.missing.sort();out.extra.sort();out.drift=document.holdings.drift??[];
    return out;
}
export const reconciled=r=>!r.missing.length&&!r.extra.length&&!r.entities.length&&!r.locations.length&&!(r.drift?.length);

// ---- 世界版本更新：作者数据改动带来的持有差异按 pack_converted / pack_removed 折算 ----------------
registerHoldingsUpgrade('sources',(d,engine)=>{
    for(const name of holdingSources())syncHoldingSource(d,engine,name,{writer:'holding-sources',reason:'pack_removed'});
});
export {ENTITY_KINDS,locationOf,holdingsActive};

// =====================================================================================
// 来源（每类旧字段一个）。单元键是旧状态里的稳定编号；职位等实体的编号由单元派生，永不复用。
// =====================================================================================

// ---- org：组织会籍与首领职位（作者数据 world.factions / 怪物社会 / 教会 + 本局 organization:* 记录） ----
// 会籍 member_of{rank}；首领是职位实体 office_org:<组织>:leader，由 holds_office 持有（职权属于职位）。
export const orgLeaderOffice=id=>`office_org:${id}:leader`;
defineHoldingSource('org',{
    recordCategories:['organization'],unitOfRecord:(state,key,row)=>row.id,
    units:(engine,state)=>storedOrganizationIds(engine,state),
    extract(engine,state,id){
        const o=storedOrganization(engine,state,id);if(!o)return null;
        const office=orgLeaderOffice(id);
        return {entities:[{id:office,kind:'office',facts:{org:id,role:'leader'}}],
            holdings:[...Object.entries(o.members).map(([m,rank])=>({kind:'member_of',holder:m,subject:id,terms:{rank}})),
                ...(o.leader?[{kind:'holds_office',holder:o.leader,subject:office}]:[])]};
    },
});

// ---- office：聚落的官职（作者数据的村长 / 农事管事、远方郡骨架的官职 + 本局 governance_office 记录） ----
// 一个单元 = 一个职位实体（聚落 × 职位定义）：office_gov:<聚落>:<职位>；远方骨架的职位沿用它自己的编号 office_rg_*。
// 持有人按旧读法取该职位最晚的一条任命（since 序，同 since 按记录次序）：在任即持有，否则空缺；
// 没有任何任命记录时取作者数据的原任（与 entity-view.settlementGovernment 的“最晚任命优先、空缺不回退”一致）。
// 议会制聚落的首脑是议会组织的首领，走 org 来源。
const VILLAGE_HEAD='office_village_head';
function remoteOffices(state){
    const out=[];for(const r of Object.values(state.remote??{}))for(const o of r.skeleton?.offices??[])out.push(o);return out;
}
function remoteHead(state,settlement){return remoteOffices(state).find(o=>o.settlement===settlement&&o.source==='generated')??null;}
export const officeEntity=(settlement,office)=>String(office).startsWith('office_rg_')?office:`office_gov:${settlement}:${office}`;
const officeUnitOf=(state,row)=>`${row.settlement}|${row.office===VILLAGE_HEAD?remoteHead(state,row.settlement)?.id??VILLAGE_HEAD:row.office}`;
function catalogHead(engine,state,settlement,office){
    if(office===VILLAGE_HEAD){
        const profile=engine.world.settlementProfiles?.find(p=>p.id===settlement);if(profile?.council)return null;
        return profile?.details?.governance?.head??engine.rules.agriculture?.settlements?.find(p=>p.settlement===settlement)?.manager??null;
    }
    const o=remoteOffices(state).find(o=>o.id===office&&o.settlement===settlement);
    return o&&!String(o.holder).startsWith('key:')?o.holder:null;
}
defineHoldingSource('office',{
    recordCategories:['governance_office'],unitOfRecord:(state,key,row)=>row.settlement&&row.office?officeUnitOf(state,row):null,
    units(engine,state){
        const out=new Set();
        for(const p of engine.world.settlementProfiles??[])if(!p.council&&catalogHead(engine,state,p.id,VILLAGE_HEAD))out.add(`${p.id}|${VILLAGE_HEAD}`);
        for(const a of engine.rules.agriculture?.settlements??[])if(a.manager&&!engine.world.settlementProfiles?.find(p=>p.id===a.settlement)?.council)out.add(`${a.settlement}|${VILLAGE_HEAD}`);
        for(const o of remoteOffices(state))out.add(`${o.settlement}|${o.id}`);
        for(const r of Object.values(state.records??{}))if(r?.category==='governance_office'&&r.settlement&&r.office)out.add(officeUnitOf(state,r));
        return out;
    },
    extract(engine,state,unit){
        const i=unit.indexOf('|'),settlement=unit.slice(0,i),office=unit.slice(i+1),id=officeEntity(settlement,office);
        const rows=Object.values(state.records??{}).filter(r=>r?.category==='governance_office'&&r.settlement===settlement&&r.office&&officeUnitOf(state,r)===unit);
        let latest=null;for(const r of rows)if(!latest||(r.since??r.appointedAt??0)>=(latest.since??latest.appointedAt??0))latest=r;
        let holder=latest?(latest.status==='在任'?latest.holder:null):catalogHead(engine,state,settlement,office);
        const t=state.records?.[`transition:${holder}`];
        if(t?.restoredAt!==undefined&&(!latest||t.officeFacts?.some(o=>o.id===latest.id&&o.since===latest.since&&o.sourceEvent===latest.sourceEvent)))holder=null;
        return {entities:[{id,kind:'office',facts:{settlement,office}}],holdings:holder?[{kind:'holds_office',holder:actorId(engine.world,holder),subject:id}]:[]};
    },
});
// ---- steward：村长委托的住房管事（housing_steward 记录）= 任命 appointed（授予者是村长职位，01 §1.3） ----
defineHoldingSource('steward',{
    recordCategories:['housing_steward'],unitOfRecord:(state,key)=>key,
    units:(engine,state)=>Object.entries(state.records??{}).filter(([,r])=>r?.category==='housing_steward').map(([k])=>k),
    extract(engine,state,key){
        const r=state.records?.[key];if(!r||r.revoked||!r.steward||!r.settlement)return null;
        const head=officeEntity(r.settlement,remoteHead(state,r.settlement)?.id??VILLAGE_HEAD);
        return {entities:[{id:head,kind:'office',facts:{settlement:r.settlement,office:remoteHead(state,r.settlement)?.id??VILLAGE_HEAD}}],
            holdings:[{kind:'appointed',holder:head,subject:actorId(engine.world,r.steward),terms:{role:'housing_steward'}}]};
    },
});

// ---- title：爵位（title 记录）= 爵位职位实体 office_title:<记录键> 的任职 + 封地 fief（持有人 → 每个封域） ----
// 记录除爵（已除爵）即两者关闭；继承时记录换持有人。作者数据推出的远方郡爵（noble-state.nobleLords 的 T142 行）
// 依赖本局有无除爵与领地记录，是读取派生，不在此列。
const titleAlive=r=>r?.category==='title'&&r.holder&&r.status!=='已除爵';
defineHoldingSource('title',{
    recordCategories:['title'],unitOfRecord:(state,key)=>key,
    units:(engine,state)=>Object.entries(state.records??{}).filter(([,r])=>r?.category==='title').map(([k])=>k),
    extract(engine,state,key){
        const r=state.records?.[key];if(r?.category!=='title')return null;
        const office=`office_title:${key}`,holder=r.holder?actorId(engine.world,r.holder):null;
        return {entities:[{id:office,kind:'office',facts:{title:r.title??null,rank:r.rank??null}}],
            holdings:titleAlive(r)?[{kind:'holds_office',holder,subject:office},
                ...[...new Set(r.domains??[r.fief].filter(Boolean))].map(domain=>({kind:'fief',holder,subject:domain,grantedBy:office}))]:[]};
    },
});

// ---- sovereignty：本局建国与领地记录（nation / territory）→ 统治 governs（政体 → 封域）或实控 controls（个人 → 封域） ----
// 一个单元 = 一个封域：有领地记录时按最晚一条的统治者，否则按存续中的、封域列表含它的国家（最晚建国者）。
// 作者数据的主权（regions.polity 只是名称，没有政体实体）不在此列，见 S2a 报告。
const LIVE_NATION=['独立待定','独立','谈判中','内乱'];
defineHoldingSource('sovereignty',{
    recordCategories:['nation','territory'],
    unitOfRecord:(state,key,row)=>row.category==='nation'?(row.domains??[]):row.county,
    units(engine,state){
        const out=new Set();
        for(const r of Object.values(state.records??{})){if(r?.category==='nation')for(const x of r.domains??[])out.add(x);if(r?.category==='territory'&&r.county)out.add(r.county);}
        return out;
    },
    extract(engine,state,domain){
        const rows=Object.values(state.records??{});
        let territory=null;for(const r of rows)if(r?.category==='territory'&&r.county===domain&&(!territory||(r.minute??0)>=(territory.minute??0)))territory=r;
        let nation=null;for(const r of rows)if(r?.category==='nation'&&LIVE_NATION.includes(r.status)&&(r.domains??[]).includes(domain)&&(!nation||(r.foundedAt??0)>=(nation.foundedAt??0)))nation=r;
        const ruler=territory?territory.ruler:nation?.id;if(!ruler)return null;
        const id=actorId(engine.world,ruler),t=entityTemplates(engine,state,id)??[];
        const sovereign=territory?.sovereign;
        return {holdings:[{kind:t.includes('collective')?'governs':'controls',holder:id,subject:domain},
            ...(!t.includes('collective')&&sovereign&&(entityTemplates(engine,state,sovereign)??[]).includes('collective')?[{kind:'governs',holder:sovereign,subject:domain}]:[])]};
    },
});

// ---- diplomacy：结盟记录 → allied_with 双向两条（条款记盟约记录键）；“待条件 / 已解除 / 承认独立”都不是同盟 ----
// 设计上两端都是群体；旧数据里个人与势力的盟约（无群体一端）不能表达为持有，不进存储（见 S2a 报告）。
defineHoldingSource('diplomacy',{
    recordCategories:['diplomacy'],unitOfRecord:(state,key)=>key,
    units:(engine,state)=>Object.entries(state.records??{}).filter(([,r])=>r?.category==='diplomacy').map(([k])=>k),
    extract(engine,state,key){
        const r=state.records?.[key];if(r?.category!=='diplomacy'||r.status!=='结盟'||(r.parties?.length??0)!==2)return null;
        const [a,b]=r.parties.map(p=>actorId(engine.world,p));
        if(a===b||![a,b].every(p=>(entityTemplates(engine,state,p)??[]).includes('collective')))return null;
        return {holdings:[{kind:'allied_with',holder:a,subject:b,terms:{treaty:key}},{kind:'allied_with',holder:b,subject:a,terms:{treaty:key}}]};
    },
});

// ---- 旧记录写入的包装：d.set 之后按记录类别双写（写入点用它代替 d.set，见 tests/holdings-writers.test.mjs） ----
const recordCategories=()=>{const out=new Set();for(const spec of sources.values())for(const c of spec.recordCategories??[])out.add(c);return out;};
let categoryCache=null;
export function holdingRecordCategories(){return categoryCache??=recordCategories();}
// 旧状态里不是 records 行的来源（家庭、居住、宠物、同行、建筑、物品个体……）以 paths 声明它读哪些路径：
// [{prefix: ['state','family','households','*'], at: 3}]：'*' 是任意键，at 是单元键在路径里的位置（缺省单元 all）。
// 写入路径够得着单元键时同步该单元；写入路径是更上级（整块替换）时同步该来源的全部单元。
function pathUnits(path){
    const out=[];
    for(const [name,spec] of sources)for(const rule of spec.paths??[]){
        const p=rule.prefix,n=Math.min(p.length,path.length);let same=true;for(let i=0;i<n;i++)if(p[i]!=='*'&&p[i]!==path[i]){same=false;break;}
        if(!same)continue;
        if(rule.at!==undefined)out.push([name,path.length>rule.at?String(path[rule.at]):null]);
        else out.push([name,path.length<p.length&&rule.unit===undefined?null:String(rule.unit??'all')]);
    }
    return out;
}
function afterWrite(d,engine,path,writer,eventId){
    engine??=d.engine;if(!engine||path[0]!=='state')return;
    if(path[1]==='records'&&path.length>=3){
        const key=path[2],cats=holdingRecordCategories();
        const row=read(d,'state','records',key);
        // Only a new signed record is snapshotted. Loading and amending legacy
        // records without clauses keeps their explicit compatibility behavior.
        if(path.length===3&&!d.original?.state?.records?.[key]&&row&&!row.clauses){
            if(row.category==='contract')d.set(path,snapshotContractTerms(row));
            if(row.category==='debt'){
                const terms=snapshotObligationTerms(row).terms;
                d.set(path,{...row,clauses:{onDebtorGone:terms.onDebtorGone,onCreditorGone:terms.onCreditorGone}});
            }
        }
        if(row?.category==='debt'&&row.obligation&&read(d,'state','obligations',row.obligation)){
            const o=read(d,'state','obligations',row.obligation);
            d.set(['state','obligations',row.obligation],{...o,debtor:row.debtor,creditor:row.creditor,amount:row.contractualAmount??row.amount,paid:row.paid??0,remaining:row.status==='坏账'?0:Math.max(0,row.amount-(row.paid??0)),status:row.status==='已还清'?'settled':row.status==='坏账'?'bad_debt':row.status==='已取消'?'cancelled':o.status});
        }
        if(cats.has(read(d,'state','records',key)?.category)||cats.has(d.original?.state?.records?.[key]?.category))syncHoldingRecord(d,engine,key,{writer,eventId});
        return;
    }
    if(path.length<2){for(const name of holdingSources())syncHoldingSource(d,engine,name,{writer,eventId});return;}
    const units=pathUnits(path);if(!units.length)return;
    if(!ensureHoldings(d,engine))return;
    const all=new Set(units.filter(([,u])=>u===null).map(([n])=>n));
    for(const name of all)syncHoldingSource(d,engine,name,{writer,eventId});
    for(const [name,unit] of units)if(unit!==null&&!all.has(name))applyUnit(d,engine,name,unit,{writer,eventId});
}
registerHoldingObserver(debug?(d,engine,path,writer,eventId)=>guarded(writer,path,()=>afterWrite(d,engine,path,writer,eventId)):afterWrite);
export {holdingSet,holdingRemove};
// 一次归约的补丁触及的来源单元（审计只比对受影响的单元：旧字段的持有只住在登记过的路径与记录类别里，
// 本事件没写到的单元不会变）。值为单元集合，null 表示整源（写入的是上级整块）。
export function touchedUnits(patches,before,after){
    const out=new Map(),add=(name,unit)=>{if(unit===null){out.set(name,null);return;}const set=out.get(name);if(set===null)return;if(set)set.add(unit);else out.set(name,new Set([unit]));};
    for(const p of patches){
        const path=p.path;if(path?.[0]!=='state')continue;
        if(path.length<2){for(const name of sources.keys())add(name,null);continue;}
        if(path[1]==='records'){
            if(path.length<3){for(const [name,spec] of sources)if(spec.recordCategories)add(name,null);continue;}
            for(const st of [before?.state,after?.state]){
                const row=st?.records?.[path[2]];if(!row?.category)continue;
                for(const [name,spec] of sources)if(spec.recordCategories?.includes(row.category))for(const u of [].concat(spec.unitOfRecord(st,path[2],row)??[]))add(name,String(u));
            }
            continue;
        }
        for(const [name,unit] of pathUnits(path))add(name,unit);
    }
    return out;
}
// 审计用：某来源某单元按旧字段应有的内容（带来源键），与该来源的全部单元。
export function legacyOfUnit(engine,state,name,unit,ctx={}){const out=desired(engine,state,name,unit,ctx),source=sourceKey(name,unit);return {holdings:out.holdings.map(h=>({...h,source})),entities:out.entities,locations:out.locations};}
export const unitsOfSource=(engine,state,name)=>[...new Set(sources.get(name).units(engine,state))].map(String);

// 写入点是否落在某个来源上（静态扫描测试与审计用）。
export const holdingPathWatched=path=>path[0]==='state'&&(path[1]==='records'||pathUnits(path).length>0);

// ---- legal：案件实体、羁押 / 收押 / 服刑（legal_custody、legal_detention）与通缉（legal_wanted） ----
// 案件 = interim 实体 case_<旧记录键>，慢变事实 phase 取旧状态；被羁押者对东道开 guest_of{detained}（受限），
// 东道是案件所属的政体或聚落治理（官府组织，不是某个狱吏，01 §1.3）；通缉 = wanted（发出通缉的政体 → 被通缉者）。
export const caseEntity=key=>`case_${key}`;
const collectiveOr=(engine,state,...ids)=>ids.find(id=>id&&(entityTemplates(engine,state,id)??[]).includes('collective'))??null;
function caseHost(engine,state,caseKey){
    const c=state.records?.[caseKey];if(!c)return null;
    // 旧回放立的案件不带所属聚落 / 势力：按案件所依法典的所属取（law-codes 是 L1 本体）。
    const code=c.faction||c.settlement?null:legalCodeById(engine,c.law,state);
    // 法典也不写所属时，取法庭（或案发地）所在的聚落：沿地点树向上第一个群体。
    const up=at=>{const out=[];const seen=new Set();while(at&&!seen.has(at)){seen.add(at);out.push(at);at=engine.byId?.get(at)?.parent;}return out;};
    return collectiveOr(engine,state,c.faction,c.settlement,code?.faction,code?.settlement,...up(code?.court??c.location));
}
defineHoldingSource('case',{
    recordCategories:['legal_case'],unitOfRecord:(state,key)=>key,goneBasis:'dissolution',
    units:(engine,state)=>Object.entries(state.records??{}).filter(([,r])=>r?.category==='legal_case').map(([k])=>k),
    extract(engine,state,key){
        const r=state.records?.[key];if(r?.category!=='legal_case')return null;
        return {entities:[{id:caseEntity(key),kind:'case',facts:{law:r.law??null,offense:r.offense??null,offender:r.offender??null,phase:r.status??null}}]};
    },
});
const CUSTODY=['legal_custody','legal_detention'];
defineHoldingSource('custody',{
    recordCategories:CUSTODY,unitOfRecord:(state,key)=>key,
    units:(engine,state)=>Object.entries(state.records??{}).filter(([,r])=>CUSTODY.includes(r?.category)).map(([k])=>k),
    extract(engine,state,key){
        const r=state.records?.[key];if(!CUSTODY.includes(r?.category)||r.status!=='生效')return null;
        const wanted=r.wanted?state.records?.[r.wanted]:null,caseKey=r.case??wanted?.case;
        const subject=r.subject??wanted?.subject??state.records?.[caseKey]?.offender??'player';
        const host=caseHost(engine,state,caseKey);if(!host)return null;
        return {holdings:[{kind:'guest_of',variant:'detained',holder:actorId(engine.world,subject),subject:host,terms:{mode:'detained',reason:r.reason??'收押',case:caseKey?caseEntity(caseKey):null}}]};
    },
});
defineHoldingSource('wanted',{
    recordCategories:['legal_wanted'],unitOfRecord:(state,key)=>key,
    units:(engine,state)=>Object.entries(state.records??{}).filter(([,r])=>r?.category==='legal_wanted').map(([k])=>k),
    extract(engine,state,key){
        const r=state.records?.[key];if(r?.category!=='legal_wanted'||r.status!=='生效'||!r.subject)return null;
        const host=caseHost(engine,state,r.case);if(!host)return null;
        return {holdings:[{kind:'wanted',holder:host,subject:actorId(engine.world,r.subject),terms:{case:r.case?caseEntity(r.case):null}}]};
    },
});

// ---- kin：亲属（作者数据的亲属关系与父母、本局出生 family.people、收养 family.adoptions、婚姻 family.marriages） ----
// 与 family-state.familyEdges 同一读法，但不含人口层按需物化的 state.created（那是聚合层的借出，S7 的骨架物化处理），
// 也不按时刻过滤。婚姻：作者数据的配偶在 family.marriages 里有该对的记录时，按记录（有“在婚”即存续）；
// 父母子女一条（父母 → 子女）；配偶、兄弟姐妹各双向两条；其他亲属一条带称谓。单元只有一个（all）。
const CHILD=new Set(['子女','儿子','女儿']),PARENT=new Set(['父亲','母亲','父母']),SIBLING=new Set(['兄弟','姐妹','兄妹','姐弟','兄长','姐姐','弟弟','妹妹']);
const EXTENDED=new Set(['父女','孙女','孙子','孙辈','外孙','外孙女','外甥','外甥女','外祖父','儿媳','女婿','岳父','同户小辈','同户长者','同户晚辈']),AFFINAL=new Set(['儿媳','女婿','岳父']);
function kinHoldings(engine,state){
    const people=new Map([...engine.world.npcs??[],...engine.world.residents??[],...Object.values(state.family?.people??{})].map(p=>[p.id,p]));
    const out=new Map(),add=(variant,holder,subject,terms)=>{if(holder===subject||!people.has(holder)||!people.has(subject))return;const k=`${variant}|${holder}|${subject}`;if(!out.has(k))out.set(k,{kind:'kin',variant,holder,subject,...(terms?{terms}:{})});};
    const spouse=new Map();
    const relate=(id,p,r)=>{
        const fatherDaughter=r.type==='父女'&&[p.sex,people.get(r.with)?.sex].sort().join('')==='女男';
        if(CHILD.has(r.type)||PARENT.has(r.type)||fatherDaughter){const reverse=PARENT.has(r.type)||fatherDaughter&&p.sex==='女';add('parent',reverse?r.with:id,reverse?id:r.with);}
        else if(r.type==='配偶'){const pair=[id,r.with].sort().join('|');if(!spouse.has(pair))spouse.set(pair,{catalog:true});}
        else if(SIBLING.has(r.type)){add('sibling',id,r.with);add('sibling',r.with,id);}
        else if(EXTENDED.has(r.type))add('other',id,r.with,{type:r.type,...(AFFINAL.has(r.type)?{affinal:true}:{})});
    };
    for(const [id,p] of people){for(const r of p.relationships??[])relate(id,p,r);for(const parent of Object.values(p.parents??{}))add('parent',parent,id);}
    for(const r of Object.values(state.family?.adoptions??{}))add('parent',r.parent,r.child,{adoptive:r.kind??true});
    for(const m of Object.values(state.family?.marriages??{})){
        if((m.partners?.length??0)!==2)continue;const pair=[...m.partners].sort().join('|'),row=spouse.get(pair)??{};
        spouse.set(pair,{...row,records:true,married:Boolean(row.married||m.status==='在婚')});
    }
    for(const [pair,s] of spouse)if(s.records?s.married:s.catalog){const [a,b]=pair.split('|');add('spouse',a,b);add('spouse',b,a);}
    return [...out.values()];
}
defineHoldingSource('kin',{
    paths:[{prefix:['state','family','marriages']},{prefix:['state','family','adoptions']},{prefix:['state','family','people']}],
    units:()=>['all'],
    extract:(engine,state)=>({holdings:kinHoldings(engine,state)}),
});

// ---- household：家户成员（作者数据的家户 − 离户 + 本局入户，family.households） ----
// 户主按年龄派生，不是存下的事实，不在此列；人口层按需物化的家户（只在 state.created 里）同样不在此列。
defineHoldingSource('household',{
    paths:[{prefix:['state','family','households','*'],at:3}],
    units:(engine,state)=>[...new Set([...(engine.world.households??[]).map(h=>h.id),...Object.keys(state.family?.households??{})])].sort(),
    extract(engine,state,house){
        const authored=engine.world.households?.find(h=>h.id===house),row=state.family?.households?.[house];
        if(!authored&&!row?.homeLocation)return null;
        const left=new Set(row?.left??[]),members=[...new Set([...(authored?.members??[]).filter(m=>!left.has(m)),...row?.members??[]])];
        return {holdings:members.map(m=>({kind:'household_member',holder:actorId(engine.world,m),subject:house}))};
    },
});

// ---- resides：居住与居留（作者数据的 home、本局迁居 state.npcs.<id>.residence；玩家的居住登记 civic_residence） ----
// 居住 resides（人 → 住处），居留 resident_of（人 → 所在聚落）。作者数据转换为持有时按 home 开立（01 §1.2）。
function authoredSettlement(engine,p){return p?.settlement??(p?.household?engine.world.households?.find(h=>h.id===p.household)?.settlement:null)??null;}
defineHoldingSource('resides',{
    paths:[{prefix:['state','npcs','*','residence'],at:2},{prefix:['state','family','people','*'],at:3}],
    recordCategories:['civic_residence'],unitOfRecord:(state,key,row)=>row.subject??'player',
    units:(engine,state)=>[...new Set([...(engine.world.npcs??[]),...(engine.world.residents??[])].map(p=>p.id).concat(Object.keys(state.family?.people??{}),Object.values(state.records??{}).filter(r=>r?.category==='civic_residence').map(r=>r.subject??'player')))].sort(),
    extract(engine,state,id,ctx){
        const born=state.family?.people?.[id],p=engine.byId?.get(id)??born??null,moved=state.npcs?.[id]?.residence;
        const home=moved?.home??p?.home?.location??(born?born.location:null)??null;
        const civic=byCategory(state,'civic_residence',ctx).filter(r=>(r.subject??'player')===id).at(-1);
        const settlement=civic?.settlement??moved?.settlement??authoredSettlement(engine,p);
        const out=[];
        if(home)out.push({kind:'resides',holder:id,subject:home});
        if(settlement&&(entityTemplates(engine,state,settlement)??[]).includes('collective'))out.push({kind:'resident_of',holder:id,subject:settlement});
        return {holdings:out};
    },
});

// ---- contract：合同里的结构性关系（契约本身的钱与日程是义务，S3 统一；这里只取它开立的持有） ----
// workshop（雇工，有效 / 要求加薪 / 罢工）→ employed_by（雇员 → 雇主）；employment（玩家受雇，履行中）→ employed_by；
// asset_lease（租房，有效）→ leases（承租人 → 房屋）；商号租约 version 1 kind lease（待履行 / 有效）→ leases；
// 客房（room，有效）→ lodges（住客 → 房间）：同一住客同一房间的续住合并为一条（一个单元 = 住客 × 房间）。
const WORKSHOP_ALIVE=['有效','要求加薪','罢工'];
function contractUnit(state,key,row){
    if(row?.category!=='contract'||row.kind==='equity')return null;
    if(row.room)return `room|${row.parties?.[0]??'player'}|${row.room}`;
    return `row|${key}`;
}
defineHoldingSource('contract',{
    recordCategories:['contract'],unitOfRecord:contractUnit,
    units(engine,state){const out=new Set();for(const [k,r] of Object.entries(state.records??{})){const u=contractUnit(state,k,r);if(u)out.add(u);}return out;},
    extract(engine,state,unit){
        const [type,a,b]=unit.split('|');
        if(type==='room'){
            const alive=Object.values(state.records??{}).some(r=>r?.category==='contract'&&r.room===b&&(r.parties?.[0]??'player')===a&&r.status==='有效');
            return {holdings:alive?[{kind:'lodges',holder:actorId(engine.world,a),subject:b}]:[]};
        }
        const key=unit.slice(4),r=state.records?.[key];if(r?.category!=='contract')return null;
        const out=[];
        if(r.kind==='workshop'&&WORKSHOP_ALIVE.includes(r.status)&&r.worker&&r.owner)out.push({kind:'employed_by',holder:actorId(engine.world,r.worker),subject:actorId(engine.world,r.owner),terms:{contract:key}});
        if(r.kind==='employment'&&r.status==='履行中'&&r.employer)out.push({kind:'employed_by',holder:'player',subject:actorId(engine.world,r.employer),terms:{contract:key}});
        if(r.kind==='asset_lease'&&r.status==='有效'&&r.tenant&&r.subject)out.push({kind:'leases',holder:actorId(engine.world,r.tenant),subject:r.subject,terms:{contract:key,use:r.use??null}});
        if(r.version===1&&r.kind==='lease'&&['待履行','有效'].includes(r.status)&&r.subject)out.push({kind:'leases',holder:r.parties?.[0]??'player',subject:r.subject,terms:{contract:key,use:'business'}});
        return {holdings:out.filter(h=>h.holder&&h.subject&&h.holder!==h.subject&&(entityTemplates(engine,state,h.subject)??[]).length)};
    },
});

// ---- equity：入股（contract kind equity，有效）→ 股份 share（份额 = 百分比 / 100）；未售出的份额记在发行组织自己名下，
// 使同一标的份额之和恒为 1（I8）。发行人是个人（以其商号入股）时，设计上股份的标的须是组织或商号实体，旧数据无法表达，不进存储。
defineHoldingSource('equity',{
    recordCategories:['contract'],unitOfRecord:(state,key,row)=>row.kind==='equity'?row.issuer:null,
    units:(engine,state)=>new Set(Object.values(state.records??{}).filter(r=>r?.category==='contract'&&r.kind==='equity'&&r.issuer).map(r=>r.issuer)),
    extract(engine,state,issuer){
        if(!(entityTemplates(engine,state,issuer)??[]).includes('collective'))return null;
        const shares=new Map();
        for(const r of Object.values(state.records??{}))if(r?.category==='contract'&&r.kind==='equity'&&r.issuer===issuer&&r.status==='有效'&&r.holder&&r.share>0){const h=actorId(engine.world,r.holder);shares.set(h,(shares.get(h)??0)+r.share/100);}
        const sold=[...shares.values()].reduce((n,s)=>n+s,0);
        if(!shares.size)return null;
        if(sold<1-1e-9)shares.set(issuer,(shares.get(issuer)??0)+(1-sold));
        return {holdings:[...shares].map(([holder,share])=>({kind:'share',holder,subject:issuer,terms:{share:Math.round(share*1e9)/1e9}}))};
    },
});

// ---- business：本人的商号（business 记录，筹备 / 营业）→ 经营 operates（店主 → 商号）。 ----
defineHoldingSource('pledge',{
    recordCategories:['debt','pledge'],
    unitOfRecord:(state,key,row)=>row.category==='debt'?key:Object.entries(state?.records??{}).filter(([,r])=>r.category==='debt'&&r.pledgeRecord===key).map(([id])=>id),
    units:(engine,state)=>Object.keys(state.records??{}).filter(id=>state.records[id]?.category==='debt'&&state.records[id].pledgeRecord),
    extract(engine,state,id){
        const debt=state.records?.[id],pledge=debt?.pledgeRecord&&state.records?.[debt.pledgeRecord];
        return {holdings:debt?.amount>(debt.paid??0)&&pledge?.status==='质押中'?[{kind:'pledged',holder:id,subject:debt.pledgeRecord}]:[]};
    },
});
defineHoldingSource('business',{
    recordCategories:['business'],unitOfRecord:(state,key)=>key,
    units:(engine,state)=>Object.entries(state.records??{}).filter(([,r])=>r?.category==='business').map(([k])=>k),
    extract(engine,state,key){
        const r=state.records?.[key];if(r?.category!=='business'||!['筹备','营业'].includes(r.status)||!r.owner)return null;
        return {holdings:[{kind:'operates',holder:actorId(engine.world,r.owner),subject:key}]};
    },
});

// ---- property：建筑所有（作者数据的 owner、本局建成的 state.created 与 state.buildings 的 owner / owners 份额）→ owns{share} ----
defineHoldingSource('property',{
    paths:[{prefix:['state','buildings','*'],at:2},{prefix:['state','created','*'],at:2}],
    units(engine,state){
        const out=new Set();
        for(const l of engine.world.locations??[])if(l.owner)out.add(l.id);
        for(const [id,c] of Object.entries(state.created??{}))if(c?.type==='bld'&&c.owner)out.add(id);
        for(const id of Object.keys(state.buildings??{}))out.add(id);
        return out;
    },
    extract(engine,state,id){
        // 只有物（建筑、设施）可被所有；作者数据里聚落“拥有”自己的街区、野外地点是公共地块，设计上由统治 / 管理表达，不进 owns。
        if(!(entityTemplates(engine,state,id)??[]).includes('thing'))return null;
        const row=state.buildings?.[id],base=state.created?.[id]??engine.byId?.get(id);
        const owners=row?.owners&&Object.keys(row.owners).length?row.owners:null,owner=row?.owner??base?.owner??null;
        const shares=owners?Object.entries(owners).filter(([,s])=>s>0):owner?[[owner,1]]:[];
        return {holdings:shares.map(([h,s])=>({kind:'owns',holder:actorId(engine.world,h),subject:id,terms:{share:Math.round(s*1e9)/1e9}}))};
    },
});

// ---- transport：车船与驮畜（作者数据的期初载具 + transport_asset 记录）→ owns（主人 → 载具）与位置事实（载具在地点）。 ----
const openingAsset=(engine,key)=>openingTransportAssets.find(a=>a.id===key&&engine.byId?.has(a.owner)&&engine.byId?.has(a.location));
defineHoldingSource('transport',{
    recordCategories:['transport_asset'],unitOfRecord:(state,key)=>key,
    units:(engine,state)=>new Set([...openingTransportAssets.filter(a=>engine.byId?.has(a.owner)&&engine.byId?.has(a.location)).map(a=>a.id),
        ...Object.entries(state.records??{}).filter(([,r])=>r?.category==='transport_asset').map(([k])=>k)]),
    extract(engine,state,key){
        const r=state.records?.[key]??openingAsset(engine,key);
        if(!r||((r.durability??1)<=0&&r.destroyedAt===undefined))return null;
        return {holdings:r.owner?[{kind:'owns',holder:actorId(engine.world,r.owner),subject:key,terms:{share:1}}]:[],
            locations:r.location?[{entity:key,at:r.location,mode:'place'}]:[]};
    },
});

// ---- tamed：生灵的主人（state.creatures.<id>.owner）→ tamed_by（主人 → 生灵）。法律归属 owns 待物种 ownable 数据，此处只记驯服。 ----
defineHoldingSource('tamed',{
    paths:[{prefix:['state','creatures','*','owner'],at:2}],
    units:(engine,state)=>Object.entries(state.creatures??{}).filter(([,c])=>c?.owner).map(([k])=>k),
    extract(engine,state,id){const c=state.creatures?.[id];return c?.owner?{holdings:[{kind:'tamed_by',holder:actorId(engine.world,c.owner),subject:id}]}:null;},
});

// ---- companion：同行（state.player.companions）→ companion（玩家 → 同行者）。 ----
defineHoldingSource('companion',{
    paths:[{prefix:['state','player','companions'],unit:'player'}],
    units:()=>['player'],
    extract:(engine,state)=>({holdings:[...new Set(state.player?.companions??[])].map(id=>({kind:'companion',holder:'player',subject:actorId(engine.world,id)}))}),
});

// ---- faith：本人存下的信仰（actor.faith 或作者数据的 faith，带 temple）→ 信奉 devotee_of（人 → 教团）。
// faith-state.faithOf 的其余推断（师承、同户、文化神）是读取派生，不在此列。 ----
defineHoldingSource('faith',{
    paths:[{prefix:['state','npcs','*','faith'],at:2},{prefix:['state','creatures','*','faith'],at:2},{prefix:['state','player','faith'],unit:'player'}],
    units:(engine,state)=>new Set(['player',...[...engine.world.npcs??[],...engine.world.residents??[]].filter(p=>p.faith).map(p=>p.id),
        ...Object.entries(state.npcs??{}).filter(([,n])=>n?.faith).map(([k])=>k),...Object.entries(state.creatures??{}).filter(([,n])=>n?.faith).map(([k])=>k)]),
    extract(engine,state,id){
        const a=id==='player'?state.player:state.npcs?.[id]??state.creatures?.[id],f=a?.faith??(id==='player'?null:engine.byId?.get(id)?.faith);
        const temple=f?.temple;if(!temple||!(entityTemplates(engine,state,temple)??[]).includes('collective'))return null;
        return {holdings:[{kind:'devotee_of',holder:id,subject:temple,terms:{aspect:f.deity??null}}]};
    },
});

// ---- career：认证（玩家职业 state.professions、人物 state.npcs.<id>.certifications、作者数据 professions）→
// certified（人 → 认证资格职位 office_cert:<职业>）；入门守戒（training_initiation，守戒中）与作者数据的“师父”→ 师承 mentor_of。 ----
export const certificationOffice=profession=>`office_cert:${profession}`;
const playerRoles=state=>[state.professions?.combat,...state.professions?.life??[],...state.professions?.hidden??[]].filter(Boolean);
const authoredRoles=p=>Array.isArray(p?.professions)?p.professions.map(x=>typeof x==='string'?x:x?.id).filter(Boolean):[];
defineHoldingSource('career',{
    paths:[{prefix:['state','professions'],unit:'player'},{prefix:['state','npcs','*','certifications'],at:2}],
    recordCategories:['training_initiation'],unitOfRecord:()=>'player',
    units:(engine,state)=>new Set(['player',...(engine.world.npcs??[]).filter(p=>authoredRoles(p).length||p.relationships?.some(r=>r.type==='师父')).map(p=>p.id),
        ...Object.entries(state.npcs??{}).filter(([,n])=>n?.certifications&&Object.keys(n.certifications).length).map(([k])=>k)]),
    extract(engine,state,id,ctx){
        const roles=id==='player'?playerRoles(state):[...new Set([...Object.keys(state.npcs?.[id]?.certifications??{}),...authoredRoles(engine.byId?.get(id))])];
        const valid=roles.filter(r=>/^profession_/.test(r)).sort();
        const out=valid.map(r=>({kind:'certified',holder:id,subject:certificationOffice(r)}));
        const teachers=new Set();
        for(const r of engine.byId?.get(id)?.relationships??[])if(r.type==='师父'&&(!r.status||r.status==='有效'))teachers.add(r.with);
        if(id==='player')for(const r of byCategory(state,'training_initiation',ctx))if(r.status==='守戒中'&&r.teacher)teachers.add(r.teacher);
        for(const t of teachers)if(t!==id&&(entityTemplates(engine,state,t)??[]).includes('agent'))out.push({kind:'mentor_of',holder:actorId(engine.world,t),subject:id});
        return {holdings:out};
    },
});

// ---- certification：认证资格职位（世界职业目录里的每个职业一个 office_cert:<职业>）。职位不因无人持有而消失。 ----
defineHoldingSource('certification',{
    units:engine=>(engine.world.professions??[]).map(p=>p.id).filter(id=>/^profession_/.test(id)),
    extract:(engine,state,id)=>({entities:[{id:certificationOffice(id),kind:'office',facts:{profession:id}}]}),
});

// ---- permit：授权（authorization，未撤回；授予者 → 受权人与同行者）与宅基许可（housing_permit，未收回）→ 许可 permit{scope}。 ----
defineHoldingSource('permit',{
    recordCategories:['authorization','housing_permit'],unitOfRecord:(state,key)=>key,
    units:(engine,state)=>Object.entries(state.records??{}).filter(([,r])=>r?.category==='authorization'||r?.category==='housing_permit').map(([k])=>k),
    extract(engine,state,key){
        const r=state.records?.[key];if(!r)return null;
        let grantor,grantees,scope;
        if(r.category==='authorization'){if(r.revoked)return null;grantor=r.grantor;grantees=[r.grantee,...r.guests??[]];scope=r.action??null;}
        else if(r.category==='housing_permit'){if(r.status==='已收回')return null;grantor=r.steward;grantees=[r.holder];scope='housing_plot';}
        else return null;
        grantor=grantor?actorId(engine.world,grantor):null;
        if(!grantor||!(entityTemplates(engine,state,grantor)??[]).some(t=>['agent','collective','office'].includes(t)))return null;
        return {holdings:[...new Set(grantees.filter(Boolean).map(g=>actorId(engine.world,g)))].filter(g=>g!==grantor&&(entityTemplates(engine,state,g)??[]).includes('agent'))
            .map(g=>({kind:'permit',holder:grantor,subject:g,terms:{scope,record:key}}))};
    },
});

// ---- lair：首领巢穴（lair 记录，驻守）→ 控制 controls（占据者 → 巢穴）。 ----
defineHoldingSource('lair',{
    recordCategories:['lair'],unitOfRecord:(state,key)=>key,
    units:(engine,state)=>Object.entries(state.records??{}).filter(([,r])=>r?.category==='lair').map(([k])=>k),
    extract(engine,state,key){
        const r=state.records?.[key];if(r?.category!=='lair'||!['驻守','易主'].includes(r.status)||!r.lair)return null;
        const who=r.occupant?.actor??r.occupant?.definition??r.boss;if(!who)return null;
        return {holdings:[{kind:'controls',holder:actorId(engine.world,who),subject:r.lair}]};
    },
});

// ---- branch：钱庄网点（作者数据 rules.economy.credit.banks：钱庄 → 柜台所在建筑）。 ----
defineHoldingSource('branch',{
    units:engine=>(engine.rules?.economy?.credit?.banks??[]).map(b=>b.id),
    extract(engine,state,id){const b=(engine.rules?.economy?.credit?.banks??[]).find(x=>x.id===id);return b?.location?{holdings:[{kind:'branch',holder:id,subject:b.location}]}:null;},
});

// ---- item：物品个体的位置事实（state.itemInstances）：持有中 → 随身（owner 为个体时），容器内 → container，封存在某处 → 地点。 ----
// 旧字段的 owner 是“东西在谁手里”（占有），不是法律归属；所有权 owns 的个体化留待物品实体化。
defineHoldingSource('item',{
    paths:[{prefix:['state','itemInstances','*'],at:2}],
    units:(engine,state)=>Object.keys(state.itemInstances??{}),
    extract(engine,state,id){
        const u=state.itemInstances?.[id];if(!u)return null;
        if(u.container&&(state.itemInstances?.[u.container]||Object.values(state.records??{}).some(r=>r.category==='transition'&&r.wreck===u.container&&r.gone)))return {locations:[{entity:id,at:u.container,mode:'container'}]};
        if(u.status==='持有'&&u.owner&&(entityTemplates(engine,state,actorId(engine.world,u.owner))??[]).includes('agent'))return {locations:[{entity:id,at:actorId(engine.world,u.owner),mode:'carried'}]};
        if(u.status==='封存'&&u.location)return {locations:[{entity:id,at:u.location,mode:'place'}]};
        return null;
    },
});

// ---- 实体化：遗产（family.deaths 的遗产分配）、议案（组织 / 聚落 / 怪物社会的议案记录）、残骸（生灵尸体）。 ----
// 遗产：旧实现当刻“先分后还”，所以遗产实体在死亡事件里开立即已关闭（phase closed）；S2b 改为按程序阶段清偿分配。
defineHoldingSource('estate',{
    paths:[{prefix:['state','family','deaths','*'],at:3}],goneBasis:'dissolution',
    units:(engine,state)=>Object.entries(state.family?.deaths??{}).filter(([,r])=>r?.estate).map(([k])=>k),
    extract(engine,state,id){
        const r=state.family?.deaths?.[id];if(!r?.estate)return null;
        if(r.estate.id)return null; // The protocol source owns this estate.
        return {entities:[{id:`estate_${id}`,kind:'estate',facts:{deceased:r.person,heirs:[...r.estate.heirs??[]],phase:'closed'}}]};
    },
});
const MOTIONS=['organization_proposal','governance_proposal','society_motion'];
defineHoldingSource('motion',{
    recordCategories:MOTIONS,unitOfRecord:(state,key)=>key,goneBasis:'dissolution',
    units:(engine,state)=>Object.entries(state.records??{}).filter(([,r])=>MOTIONS.includes(r?.category)).map(([k])=>k),
    extract(engine,state,key){
        const r=state.records?.[key];if(!MOTIONS.includes(r?.category))return null;
        return {entities:[{id:`motion_${key}`,kind:'motion',facts:{body:r.org??r.settlement??r.society??null,phase:r.status??null}}]};
    },
});
defineHoldingSource('wreck',{
    paths:[{prefix:['state','creatures','*','corpse'],at:2}],goneBasis:'destruction',
    units:(engine,state)=>Object.entries(state.creatures??{}).filter(([,c])=>c?.corpse).map(([k])=>k),
    extract(engine,state,id){
        const c=state.creatures?.[id];if(!c?.corpse)return null;
        const wreck=`wreck_${id}:${c.incarnation??0}`;
        return {entities:[{id:wreck,kind:'wreck',facts:{of:id,species:c.species??null,phase:c.corpse.status??null}}],locations:c.location?[{entity:wreck,at:c.location,mode:'place'}]:[]};
    },
});

// ---- guardianship：监护（guardianship 记录，代管中）→ 监护 guardian_of（监护人 → 被监护人）。 ----
// “待指定”（无监护人）不开持有；成年与死亡终止由旧推进写入状态时同步（成年 threshold 钩子是 S2b 的事）。
defineHoldingSource('guardianship',{
    recordCategories:['guardianship'],unitOfRecord:(state,key)=>key,
    units:(engine,state)=>Object.entries(state.records??{}).filter(([,r])=>r?.category==='guardianship').map(([k])=>k),
    extract(engine,state,key){
        const r=state.records?.[key];if(r?.category!=='guardianship'||r.status!=='代管中'||!r.guardian||!r.ward)return null;
        return {holdings:[{kind:'guardian_of',holder:actorId(engine.world,r.guardian),subject:actorId(engine.world,r.ward),terms:{scope:r.scope??'person_and_property'}}]};
    },
});
