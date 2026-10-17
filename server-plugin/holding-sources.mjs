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
    setLocation,clearLocation,locationOf,declareHoldingWriter,registerHoldingsOpening,registerEntityResolver,registerCapacityResolver,registerHoldingsUpgrade,ENTITY_KINDS} from './holdings.mjs';
import './holding-kinds.mjs';

const read=(d,...p)=>typeof d.peek==='function'?d.peek(...p):d.get(...p);
const sources=new Map();
export function defineHoldingSource(name,spec){
    if(!/^[a-z][a-z0-9_-]*$/.test(name))throw Error(`持有来源名无效：${name}`);
    if(sources.has(name))throw Error(`持有来源重复：${name}`);
    sources.set(name,spec);
}
export const holdingSources=()=>[...sources.keys()].sort();
const sourceKey=(name,unit)=>`${name}:${unit}`;
const parseSource=key=>{const i=String(key).indexOf(':');return i<0?null:{name:key.slice(0,i),unit:key.slice(i+1)};};

// ---- 实体模板解析（登记给 L0）：实体 id → 可能的模板 --------------------------------------
const worldSets=new WeakMap();
function sets(engine){
    let s=worldSets.get(engine.world);if(s)return s;
    const w=engine.world;
    s={factions:new Set((w.factions??[]).map(f=>f.id)),households:new Set((w.households??[]).map(h=>h.id)),
        settlements:new Set([...(w.settlementProfiles??[]).map(p=>p.id),...(engine.rules?.agriculture?.settlements??[]).map(p=>p.settlement),...(w.regions??[]).map(r=>r.id)]),
        people:new Set([...(w.npcs??[]),...(w.residents??[]),...(w.factionPeople??[])].map(p=>p.id)),
        creatures:new Set([...(w.monsters??[]),...(w.bosses??[])].map(m=>m.id)),
        polities:new Set((engine.rules?.military?.polities??[]).map(p=>p.id)),
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
    if(state?.npcs?.[id]||state?.created?.[id]&&state.created[id].kind!=='building'||state?.family?.people?.[id]||w.people.has(id)||state?.creatures?.[id]||w.creatures.has(id)||/^npc_/.test(id))out.add('agent');
    if(w.settlements.has(id)||state?.settlements?.[id]){out.add('collective');out.add('place');}
    if(w.factions.has(id)||w.households.has(id)||w.polities.has(id)||w.societies.has(id)||records[`organization:${id}`]||state?.family?.households?.[id]||COLLECTIVE_PREFIX.test(id))out.add('collective');
    if(/^(loc_|site_|lair_)/.test(id)||w.lairs.has(id)||engine.byId?.get(id)?.type==='loc')out.add('place');
    if(/^bld_/.test(id)||state?.created?.[id]?.kind==='building'){out.add('thing');out.add('place');}
    if(state?.itemInstances?.[id]||records[id]?.category==='transport_asset'||state?.buildings?.[id])out.add('thing');
    if(records[id]?.category==='business')out.add('thing');
    if(state?.obligations?.[id]||records[id]?.category==='debt'||records[id]?.category==='contract')out.add('instrument');
    return out.size?[...out]:null;
}
registerEntityResolver((d,id,engine)=>engine?entityTemplates(engine,read(d,'state'),id):null);
// 容量（lodges）：节点事实 capacity，读作者数据或运行期创建的地点。
registerCapacityResolver((d,id,field,engine)=>engine?.byId?.get(id)?.[field]??read(d,'state','created',id)?.[field]??null);

// ---- 提取、开账与双写 -----------------------------------------------------------------
const canon=v=>v===undefined||v===null?'':JSON.stringify(v,Object.keys(v).sort());
const holdingKey=h=>`${h.kind}|${h.variant??''}|${h.holder}|${h.subject}|${canon(h.terms)}`;
// 一个单元按旧字段应有的内容；缺省三项为空。
function desired(engine,state,name,unit){
    const out=sources.get(name).extract(engine,state,unit)??{};
    return {holdings:out.holdings??[],entities:out.entities??[],locations:out.locations??[]};
}
function* allUnits(engine,state){
    for(const name of holdingSources())for(const unit of new Set(sources.get(name).units(engine,state)))yield [name,String(unit)];
}
// 开账（genesis）：全部来源的全部单元。来源名带进 source 字段，对账与双写按它找回单元。
export function legacyHoldings(engine,state){
    const holdings=[],entities=[],locations=[];
    for(const [name,unit] of allUnits(engine,state)){
        const out=desired(engine,state,name,unit),source=sourceKey(name,unit);
        for(const h of out.holdings)holdings.push({...h,source});
        for(const e of out.entities)entities.push({...e,source});
        for(const l of out.locations)locations.push({...l,source});
    }
    return {holdings,entities,locations};
}
registerHoldingsOpening(legacyHoldings);

declareHoldingWriter('holding-sources',{kinds:['*'],entities:['*'],locations:true});
// 双写入口：writer 为旧写入点所在模块（须声明持有写入者），reason 为关闭旧边的原因。
export function syncHoldings(d,engine,name,unit,{writer,reason='vacated',eventId=null}={}){
    if(!sources.has(name))throw Error(`未登记的持有来源：${name}`);
    if(!writer)throw Error('双写须给出写入者');
    if(!ensureHoldings(d,engine))return false;
    applyUnit(d,engine,name,String(unit),{writer,reason,eventId});
    return true;
}
// 同一来源的全部单元（写入点一次改动多条旧记录、或不便算出单元时）。
export function syncHoldingSource(d,engine,name,opts){
    if(!sources.has(name))throw Error(`未登记的持有来源：${name}`);
    if(!ensureHoldings(d,engine))return false;
    const state=read(d,'state'),units=new Set([...sources.get(name).units(engine,state)].map(String));
    for(const r of aliveHoldings(d))if(r.source?.startsWith(`${name}:`))units.add(parseSource(r.source).unit);
    for(const e of Object.values(read(d,'holdings','entities')??{}))if(e.goneAt===undefined&&e.source?.startsWith(`${name}:`))units.add(parseSource(e.source).unit);
    for(const [,l] of Object.entries(read(d,'holdings','locations')??{}))if(l.source?.startsWith(`${name}:`))units.add(parseSource(l.source).unit);
    for(const unit of [...units].sort())applyUnit(d,engine,name,unit,opts);
    return true;
}
function applyUnit(d,engine,name,unit,{writer,reason='vacated',eventId=null}){
    const want=desired(engine,read(d,'state'),name,unit),source=sourceKey(name,unit);
    // 实体先于持有：新职位、案件等要先存在才能被持有。
    for(const e of want.entities){
        const have=entityRow(d,e.id);
        if(!have)createEntity(d,{id:e.id,kind:e.kind,facts:e.facts??{},source,writer,eventId,origin:'runtime'});
        else if(have.goneAt===undefined&&canon(have.facts)!==canon(e.facts??{}))updateEntity(d,{id:e.id,facts:e.facts??{},writer,eventId});
    }
    const current=aliveHoldings(d,{source}),wanted=new Map(want.holdings.map(h=>[holdingKey(h),h]));
    const keep=new Set();
    for(const r of current){const k=holdingKey(r);if(wanted.has(k)&&!keep.has(k))keep.add(k);else closeHolding(d,{id:r.id,reason,writer,eventId});}
    for(const [k,h] of wanted)if(!keep.has(k))openHolding(d,{...h,source,writer,eventId,engine});
    for(const l of want.locations)setLocation(d,{entity:l.entity,at:l.at,mode:l.mode,writer,source,engine});
    for(const [entity,l] of Object.entries(read(d,'holdings','locations')??{}))if(l.source===source&&!want.locations.some(x=>x.entity===entity))clearLocation(d,{entity,writer});
    // 旧字段里已不存在的实体：记墓碑（basis 由来源声明，缺省 destruction）。
    for(const e of Object.values(read(d,'holdings','entities')??{}))if(e.source===source&&e.goneAt===undefined&&!want.entities.some(x=>x.id===e.id))
        endEntity(d,{id:e.id,basis:sources.get(name).goneBasis??'destruction',writer,eventId});
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
    out.missing.sort();out.extra.sort();
    return out;
}
export const reconciled=r=>!r.missing.length&&!r.extra.length&&!r.entities.length&&!r.locations.length;

// ---- 世界版本更新：作者数据改动带来的持有差异按 pack_converted / pack_removed 折算 ----------------
registerHoldingsUpgrade('sources',(d,engine)=>{
    for(const name of holdingSources())syncHoldingSource(d,engine,name,{writer:'holding-sources',reason:'pack_removed'});
});
export {ENTITY_KINDS,locationOf,holdingsActive};
