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
import {storedOrganization,storedOrganizationIds} from './organization-state.mjs';
import {actorId} from './npc-state.mjs';

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
function desired(engine,state,name,unit,ctx={}){
    const out=sources.get(name).extract(engine,state,unit,ctx)??{};
    return {holdings:out.holdings??[],entities:out.entities??[],locations:out.locations??[]};
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
export function syncHoldings(d,engine,name,unit,{writer,reason='vacated',eventId=null}={}){
    engine??=d.engine;
    if(!sources.has(name))throw Error(`未登记的持有来源：${name}`);
    if(!writer)throw Error('双写须给出写入者');
    if(!ensureHoldings(d,engine))return false;
    applyUnit(d,engine,name,String(unit),{writer,reason,eventId});
    return true;
}
// 旧记录（state.records 的一行）的双写：按记录类别找到受影响的来源与单元（写入前后两版记录都算，
// 改了持有人、换了聚落或删掉记录都能找回原单元）。来源以 recordCategories / unitOfRecord 声明它读哪些记录。
export function syncHoldingRecord(d,engine,key,opts){
    engine??=d.engine;
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
export function syncHoldingSource(d,engine,name,opts){
    engine??=d.engine;
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
        const holder=latest?(latest.status==='在任'?latest.holder:null):catalogHead(engine,state,settlement,office);
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
        return {holdings:[{kind:t.includes('collective')?'governs':'controls',holder:id,subject:domain}]};
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
        else out.push([name,path.length<p.length&&rule.whole!==false?null:'all']);
    }
    return out;
}
function afterWrite(d,engine,path,writer,eventId){
    if(path[0]!=='state')return;
    if(path[1]==='records'&&path.length>=3){
        const key=path[2],cats=holdingRecordCategories();
        if(cats.has(read(d,'state','records',key)?.category)||cats.has(d.original?.state?.records?.[key]?.category))syncHoldingRecord(d,engine,key,{writer,eventId});
        return;
    }
    if(path.length<2){for(const name of holdingSources())syncHoldingSource(d,engine,name,{writer,eventId});return;}
    const units=pathUnits(path);if(!units.length)return;
    if(!ensureHoldings(d,engine??=d.engine))return;
    const all=new Set(units.filter(([,u])=>u===null).map(([n])=>n));
    for(const name of all)syncHoldingSource(d,engine,name,{writer,eventId});
    for(const [name,unit] of units)if(unit!==null&&!all.has(name))applyUnit(d,engine,name,unit,{writer,eventId});
}
export function holdingSet(d,engine,path,value,writer,eventId=null){
    d.set(path,value);afterWrite(d,engine,path,writer,eventId);
    return value;
}
export function holdingRemove(d,engine,path,writer,eventId=null){
    d.remove(path);afterWrite(d,engine,path,writer,eventId);
}
// 写入点是否落在某个来源上（静态扫描测试与审计用）。
export const holdingPathWatched=path=>path[0]==='state'&&(path[1]==='records'||pathUnits(path).length>0);

// ---- legal：案件实体、羁押 / 收押 / 服刑（legal_custody、legal_detention）与通缉（legal_wanted） ----
// 案件 = interim 实体 case_<旧记录键>，慢变事实 phase 取旧状态；被羁押者对东道开 guest_of{detained}（受限），
// 东道是案件所属的政体或聚落治理（官府组织，不是某个狱吏，01 §1.3）；通缉 = wanted（发出通缉的政体 → 被通缉者）。
export const caseEntity=key=>`case_${key}`;
const collectiveOr=(engine,state,...ids)=>ids.find(id=>id&&(entityTemplates(engine,state,id)??[]).includes('collective'))??null;
function caseHost(engine,state,caseKey){
    const c=state.records?.[caseKey];if(!c)return null;
    return collectiveOr(engine,state,c.faction,c.settlement);
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
