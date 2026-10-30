// S2a 持有存储（L0，01 §1.3、02 I5/I8、附录 A §A.4 / §A.15）：持有是有向、带时间区间的边
// 持有人 ─[种类, 变体, 条款, 授予者, 起, 止, 终止原因]→ 标的。openHolding / closeHolding / transferHolding /
// rescaleHolding 是改持有的唯一入口（像 ledger.transfer 那样）：写入者须声明它写哪些种类，每次写入按注册形状
// （两端模板、互斥、份额、容量、incompatibleWith 四策略、缔结快照）校验，不合法即抛出并给世界内原因。
// 同一分区还存 S2a 实体化的对象（职位、遗产、案件、议案、残骸：entities）与位置事实（随身 / 容器 / 地点：locations），
// 各自也只有本模块的入口。
// 存放：文档根的 holdings 分区（与 state、ledger 并列），state 的读者、人口压缩与提示卡都不读它。
// 迁移期（绞杀式）旧字段照写、读仍走旧字段；L1 适配器（holding-sources.mjs）在每个旧写入点同时写入，
// 对账测试断言两者逐条相等。本模块不 import 任何 L1 以上模块：种类、模板解析与开账函数都由 L1 登记进来。
import {recordIndexActive} from './storage.mjs';
export const HOLDINGS_VERSION=1;
const read=(d,...p)=>typeof d.peek==='function'?d.peek(...p):d.get(...p);
export const holdingsActive=d=>read(d,'holdings','version')===HOLDINGS_VERSION;
// 开账（genesis）写下的是“开局即有”的关系，不记开账时刻：开账发生在哪个事件不改变存储内容（分段推进与重载等价）。
const minuteOf=d=>d.genesis?undefined:read(d,'state','minute')??0;

// ---- 世界内原因：拒绝写入时抛出的错误带 code 与给玩家看的原因 -------------------------
export class HoldingRejected extends Error{
    constructor(code,reason,detail=''){super(`${reason}${detail?`（${detail}）`:''}`);this.code=code;this.reason=reason;}
}

// ---- 种类注册（L1 holding-kinds.mjs 在加载时登记；注册形状的完整性校验在 L1） -------------
const kinds=new Map();
let reasons=new Set();
export function registerHoldingKind(entry){
    if(!entry?.id||!Array.isArray(entry.holderKinds)||!Array.isArray(entry.subjectKinds)||!entry.handover||!('onSubjectGone' in entry))throw Error(`持有种类注册形状不完整：${entry?.id}`);
    kinds.set(entry.id,{...entry,hooks:(entry.hooks??[]).map((h,i)=>({...h,id:h.id??`${entry.id}:${i}`,packId:h.packId??entry.namespace??'core'}))});
}
export function registerHoldingReasons(list){reasons=new Set([...reasons,...list]);}
export const holdingKind=id=>kinds.get(id)??null;
export const holdingKindIds=()=>[...kinds.keys()].sort();
// L0 dispatch only; the installed L1 protocol owns lifecycle decisions.
let lifecycleProtocol=null;
let holdingProtocol=null;
export function registerHoldingProtocol(fn){holdingProtocol=fn;}
export function runHoldingProtocol(d,engine,input){return holdingProtocol&&d.document?holdingProtocol(d,engine,input):null;}
export function registerLifecycleProtocol(fn){lifecycleProtocol=fn;}
export function runLifecycleProtocol(d,engine,input){
    if(!lifecycleProtocol)throw Error('Lifecycle protocol is not installed');
    return lifecycleProtocol(d,engine,input);
}
const variantOf=(kind,variant)=>variant?kind.variants?.[variant]??null:null;

// ---- 模板解析与容量（L1 登记：实体 id → 可能的模板集合） --------------------------------
let resolver=()=>null,capacityOf=()=>null;
export function registerEntityResolver(fn){resolver=fn;}
export function registerCapacityResolver(fn){capacityOf=fn;}
// 存储里的实体（职位、遗产、案件、议案、残骸）先于 L1 解析：它们的模板由实体种类决定。
export const ENTITY_KINDS=Object.freeze({office:'office',estate:'interim',liquidation:'interim',case:'interim',project:'interim',motion:'interim',wreck:'thing',person:'agent',creature:'agent',population:'thing',item:'thing',building:'thing',mark:'thing'});
export function templatesOf(d,id,engine=null){
    const e=read(d,'holdings','entities',id);
    if(e)return [ENTITY_KINDS[e.kind]];
    if(typeof id==='string'&&id.startsWith('holding:'))return ['holding'];
    if(typeof id==='string'&&id.split('|').length===3)return ['account'];
    return resolver(d,id,engine)??null;
}

// ---- 写入者（像账本写入者一样在模块加载时声明） ---------------------------------------
const writers=new Map();
export function declareHoldingWriter(writer,{kinds:list=[],entities=[],locations=false}={}){
    if(!/^[a-z][a-z0-9-]*$/.test(writer))throw Error(`持有写入者名无效：${writer}`);
    const row=writers.get(writer)??{kinds:new Set(),entities:new Set(),locations:false};
    for(const k of list)row.kinds.add(k);for(const k of entities)row.entities.add(k);row.locations||=locations;
    writers.set(writer,row);
}
export function holdingWriters(){
    return Object.fromEntries([...writers].sort(([a],[b])=>a<b?-1:1).map(([w,r])=>[w,{kinds:[...r.kinds].sort(),entities:[...r.entities].sort(),locations:r.locations}]));
}
function writerFor(writer,what,kind){
    const w=writers.get(writer);if(!w)throw new HoldingRejected('E-HOLDING-WRITER',`未登记的持有写入者：${writer}`);
    if(what==='kinds'&&!w.kinds.has(kind)&&!w.kinds.has('*'))throw new HoldingRejected('E-HOLDING-WRITER',`${writer} 没有持有种类 ${kind} 的写入权`);
    if(what==='entities'&&!w.entities.has(kind)&&!w.entities.has('*'))throw new HoldingRejected('E-HOLDING-WRITER',`${writer} 没有实体种类 ${kind} 的写入权`);
    if(what==='locations'&&!w.locations)throw new HoldingRejected('E-HOLDING-WRITER',`${writer} 没有位置事实的写入权`);
}

// ---- 开账（genesis）：分区在第一次写入时从旧字段开出 -------------------------------------
// 开账函数由 L1 登记，读旧字段（作者数据转换与运行期旧记录）给出全部持有、实体与位置事实。
// 懒开账：第一次写入时从事件前的文档（引擎草稿的 original）开出，于是同一事件里先前漏掉双写的
// 旧写入仍表现为对账差异，不会被开账吸收。没有事件前文档的裸草稿（预演、单元测试）不记。
let opener=null;
export function registerHoldingsOpening(fn){opener=fn;}
export function emptyHoldings(){return {version:HOLDINGS_VERSION,seq:0,rows:{},entities:{},locations:{}};}
// 开账的每一条也经唯一写入点（写入者 genesis），受同样的注册形状校验；缔结快照记 form: authored。
export function openHoldings(engine,document){
    if(!opener)throw Error('持有开账函数未登记');
    const root={state:document.state,holdings:emptyHoldings()};
    const d={genesis:true,peek:(...p)=>p.reduce((v,k)=>v?.[k],root),get(...p){return this.peek(...p);},
        set(path,value){if(path[0]!=='holdings')throw Error('开账只写持有分区');let t=root;for(const k of path.slice(0,-1))t=t[k]??={};t[path.at(-1)]=value;},
        remove(path){let t=root;for(const k of path.slice(0,-1))t=t?.[k];if(t)delete t[path.at(-1)];}};
    const {holdings=[],entities=[],locations=[]}=opener(engine,document.state);
    // 作者数据里违反注册形状的一条不阻断开账：记漂移（对账报出），其余照开。
    const attempt=(info,fn)=>{try{fn();}catch(e){if(!(e instanceof HoldingRejected))throw e;root.holdings.drift=[...root.holdings.drift??[],{...info,code:e.code,reason:e.message}].slice(-50);root.holdings.driftTally=(root.holdings.driftTally??0)+1;}};
    for(const e of entities)attempt({source:e.source,entity:e.id},()=>createEntity(d,{id:e.id,kind:e.kind,facts:e.facts??{},source:e.source??null,writer:'genesis',origin:e.origin??'authored'}));
    for(const h of holdings)attempt({source:h.source,kind:h.kind,variant:h.variant??null,holder:h.holder,subject:h.subject},()=>openHolding(d,{...h,writer:'genesis',engine}));
    for(const l of locations)attempt({source:l.source,entity:l.entity},()=>setLocation(d,{entity:l.entity,at:l.at,mode:l.mode,source:l.source??null,writer:'genesis',engine}));
    return root.holdings;
}
declareHoldingWriter('genesis',{kinds:['*'],entities:['*'],locations:true});
export function ensureHoldings(d,engine){
    if(holdingsActive(d))return true;
    if(read(d,'holdings')!==undefined)return false;// 版本不同的分区：不覆盖
    const original=d.original;
    if(!original?.state||!engine)return false;
    const opened=openHoldings(engine,original);
    d.set(['holdings'],opened);
    return true;
}
const stripUndefined=o=>{for(const k of Object.keys(o))if(o[k]===undefined)delete o[k];return o;};
const concludedOf=(kind,variant)=>{const k=kinds.get(kind);return Boolean(variantOf(k,variant)?.concluded??k?.concluded);};

// ---- 存活持有的索引（每个草稿一份，按 seq 失效；本模块是唯一写者） ------------------------
const indexes=new WeakMap();
// Sharing across readers is safe only in the cursor-protected advance scope.
// Plain import/fixture readers may edit their document between new readers.
const indexKey=d=>recordIndexActive()?read(d,'holdings')??d:d;
export const invalidateHoldings=d=>{indexes.delete(d);indexes.delete(read(d,'holdings'));};
function index(d){
    const seq=read(d,'holdings','seq')??0,key=indexKey(d),cached=indexes.get(key);
    if(cached&&cached.seq===seq)return cached;
    const idx={seq,bySubject:new Map(),bySubjectOnly:new Map(),byHolder:new Map(),bySource:new Map(),entities:new Map(),locations:new Map()};
    for(const row of Object.values(read(d,'holdings','rows')??{}))if(row.until===undefined)addIndex(idx,row);
    for(const e of Object.values(read(d,'holdings','entities')??{}))if(e.goneAt===undefined&&e.source)push(idx.entities,e.source,e.id);
    for(const [entity,l] of Object.entries(read(d,'holdings','locations')??{}))if(l.source)push(idx.locations,l.source,entity);
    indexes.set(key,idx);return idx;
}
const push=(m,k,id)=>{let s=m.get(k);if(!s)m.set(k,s=new Set());s.add(id);};
const pull=(m,k,id)=>{const s=m.get(k);if(s){s.delete(id);if(!s.size)m.delete(k);}};
function addIndex(idx,row){push(idx.bySubject,`${row.kind}|${row.subject}`,row.id);push(idx.bySubjectOnly,row.subject,row.id);push(idx.byHolder,row.holder,row.id);if(row.source)push(idx.bySource,row.source,row.id);}
function dropIndex(idx,row){pull(idx.bySubject,`${row.kind}|${row.subject}`,row.id);pull(idx.bySubjectOnly,row.subject,row.id);pull(idx.byHolder,row.holder,row.id);if(row.source)pull(idx.bySource,row.source,row.id);}
function bump(d,idx){const seq=(read(d,'holdings','seq')??0)+1;d.set(['holdings','seq'],seq);idx.seq=seq;indexes.set(indexKey(d),idx);return seq;}
const rowOf=(d,id)=>read(d,'holdings','rows',id)??null;
export function aliveHoldings(d,{kind,holder,subject,source}={}){
    if(!holdingsActive(d))return [];
    const idx=index(d);
    const ids=source!==undefined?idx.bySource.get(source):subject!==undefined?(kind?idx.bySubject.get(`${kind}|${subject}`):idx.bySubjectOnly.get(subject)):holder!==undefined?idx.byHolder.get(holder):null;
    const list=ids?[...ids].map(id=>rowOf(d,id)):ids===undefined?[]:Object.values(read(d,'holdings','rows')??{}).filter(r=>r.until===undefined);
    return list.filter(r=>r&&(!kind||r.kind===kind)&&(holder===undefined||r.holder===holder)&&(subject===undefined||r.subject===subject)&&(source===undefined||r.source===source))
        .sort((a,b)=>Number(a.id.slice(1))-Number(b.id.slice(1)));
}
export const holdingRow=(d,id)=>rowOf(d,id);
// A read-only view of a plain document. It is cached per document object, so
// repeated aliveHoldings queries on one document share an index that is rebuilt
// only when holdings.seq moves, instead of scanning every row each time.
const views=new WeakMap();
export function holdingsView(document){
    let view=views.get(document);
    if(!view){view={get:(...path)=>path.reduce((value,key)=>value?.[key],document)};views.set(document,view);}
    return view;
}
// 某个来源单元在存储里的存活持有、存活实体与位置事实（双写按单元比对时用，不扫全表）。
export function holdingsOfSource(d,source){
    if(!holdingsActive(d))return {holdings:[],entities:[],locations:[]};
    const idx=index(d);
    return {holdings:aliveHoldings(d,{source}),entities:[...idx.entities.get(source)??[]].sort(),locations:[...idx.locations.get(source)??[]].sort()};
}

// ---- 写入点 ------------------------------------------------------------------------
const EPS=1e-9;
function checkTemplates(d,kind,holder,subject,engine){
    const h=templatesOf(d,holder,engine),s=templatesOf(d,subject,engine);
    if(!h)throw new HoldingRejected('E-HOLDING-ENTITY','持有人不存在',`${kind.id}: ${holder}`);
    if(!s)throw new HoldingRejected('E-HOLDING-ENTITY','标的不存在',`${kind.id}: ${subject}`);
    if(!h.some(t=>kind.holderKinds.includes(t)))throw new HoldingRejected('E-HOLDING-TEMPLATE',`${kind.label}的持有人不能是这类实体`,`${kind.id}: ${holder} 为 ${h.join('/')}`);
    if(!s.some(t=>kind.subjectKinds.includes(t)))throw new HoldingRejected('E-HOLDING-TEMPLATE',`${kind.label}的标的不能是这类实体`,`${kind.id}: ${subject} 为 ${s.join('/')}`);
}
// 返回值：新持有的 id。同一事务里由 incompatibleWith auto_vacate 关闭的持有记在 row.vacated。
export function openHolding(d,{kind:kindId,variant=null,holder,subject,terms=null,grantedBy=null,source=null,writer,eventId=null,reason='opened',place=null,lawVersion=null,form=null,inName=null,engine=null}){
    const kind=kinds.get(kindId);if(!kind)throw new HoldingRejected('E-HOLDING-KIND','未登记的持有种类',kindId);
    writerFor(writer,'kinds',kindId);
    if(kind.variants&&!kind.variants[variant])throw new HoldingRejected('E-HOLDING-VARIANT',`${kind.label}须指明变体`,`${kindId}: ${variant}`);
    if(!kind.variants&&variant)throw new HoldingRejected('E-HOLDING-VARIANT',`${kind.label}没有变体`,`${kindId}: ${variant}`);
    if(!reasons.has(reason))throw Error(`未登记的持有变更原因：${reason}`);
    if(typeof holder!=='string'||!holder||typeof subject!=='string'||!subject)throw new HoldingRejected('E-HOLDING-ENTITY','持有两端缺失',kindId);
    if(!holdingsActive(d))return null;
    checkTemplates(d,kind,holder,subject,engine);
    const idx=index(d),v=variantOf(kind,variant),minute=minuteOf(d);
    const peers=[...idx.bySubject.get(`${kindId}|${subject}`)??[]].map(id=>rowOf(d,id));
    // 同两端、同变体、同条款的第二条是重复；条款不同（两份授权、两份雇佣合同）是两条持有。
    const termsKey=JSON.stringify(terms??null,terms?Object.keys(terms).sort():undefined);
    // 份额种类每个持有人一条边（共有按份额）。
    if(peers.some(r=>r.holder===holder&&(r.variant??null)===variant&&(kind.sum!==undefined||JSON.stringify(r.terms??null,r.terms?Object.keys(r.terms).sort():undefined)===termsKey)))throw new HoldingRejected('E-HOLDING-DUPLICATE','这条持有已经存在',`${kindId}: ${holder} → ${subject}`);
    if(kind.exclusive&&peers.length)throw new HoldingRejected('E-HOLDING-EXCLUSIVE',`${kind.label}同一时刻只能有一个持有人`,`${kindId}: ${subject} 已由 ${peers[0].holder} 持有`);
    if(kind.sum!==undefined){
        const share=terms?.share;
        if(!(typeof share==='number'&&share>0&&share<=kind.sum+EPS))throw new HoldingRejected('E-HOLDING-SHARE',`${kind.label}须给出 (0, ${kind.sum}] 的份额`,`${kindId}: ${subject}`);
        const total=peers.reduce((n,r)=>n+(r.terms?.share??0),0)+share;
        if(total>kind.sum+EPS)throw new HoldingRejected('E-HOLDING-SUM',`${kind.label}份额之和超过 ${kind.sum}`,`${kindId}: ${subject} 合计 ${total}`);
    }
    if(kind.capacity){
        const cap=capacityOf(d,subject,kind.capacity,engine);
        if(Number.isFinite(cap)&&peers.length>=cap)throw new HoldingRejected('E-HOLDING-CAPACITY',`${subject} 已满`,`${kindId}: ${peers.length}/${cap}`);
    }
    // incompatibleWith（01 §1.3）：forbid 拒绝；auto_vacate 同一事务关闭旧持有；needs_permission 要求许可持有；flag 打标记。
    const flags=[],vacated=[];
    for(const rule of [...kind.incompatibleWith??[],...v?.incompatibleWith??[]]){
        const clash=[...idx.byHolder.get(holder)??[]].map(id=>rowOf(d,id)).filter(r=>r.kind===rule.kind&&(!rule.variant||r.variant===rule.variant));
        if(!clash.length)continue;
        if(rule.policy==='forbid')throw new HoldingRejected('E-HOLDING-INCOMPATIBLE',`与已有的${kinds.get(rule.kind)?.label??rule.kind}不相容`,`${kindId}${variant?`:${variant}`:''}: ${holder} 已有 ${clash.map(r=>`${r.kind}→${r.subject}`).join('、')}`);
        if(rule.policy==='auto_vacate')for(const r of clash){closeHolding(d,{id:r.id,reason:'vacated',writer,eventId});vacated.push(r.id);}
        if(rule.policy==='needs_permission'){
            const ok=[...idx.byHolder.get(holder)??[]].map(id=>rowOf(d,id)).some(r=>r.kind==='permit'&&r.terms?.scope===rule.permit)||aliveHoldings(d,{kind:'permit',subject:holder}).some(r=>r.terms?.scope===rule.permit);
            if(!ok)throw new HoldingRejected('E-HOLDING-PERMISSION',`兼有${kinds.get(rule.kind)?.label??rule.kind}须先取得许可`,`${kindId}: ${holder} 缺 ${rule.permit}`);
        }
        if(rule.policy==='flag')flags.push(`conflict:${rule.kind}`);
    }
    const seq=bump(d,idx),id=`h${seq}`;
    const row=stripUndefined({id,kind:kindId,variant:variant??undefined,holder,subject,terms:terms??undefined,grantedBy:grantedBy??undefined,since:minute,source:source??undefined,writer,
        event:eventId??undefined,...(flags.length?{flags}:{}),...(vacated.length?{vacated}:{}),
        ...(concludedOf(kindId,variant)?{concluded:stripUndefined({time:minute,place,lawVersion,form:form??(writer==='genesis'?'authored':'act'),...(inName?{inName}:{})})}:{})});
    d.set(['holdings','rows',id],row);addIndex(idx,row);
    return id;
}
export function closeHolding(d,{id,reason,writer,eventId=null}){
    if(!holdingsActive(d))return null;
    const row=rowOf(d,id);if(!row)throw Error(`持有不存在：${id}`);
    writerFor(writer,'kinds',row.kind);
    if(!reasons.has(reason))throw Error(`未登记的持有变更原因：${reason}`);
    if(row.until!==undefined)throw new HoldingRejected('E-HOLDING-CLOSED','这条持有已经结束',id);
    const idx=index(d);bump(d,idx);dropIndex(idx,row);
    d.set(['holdings','rows',id],{...row,until:minuteOf(d),reason,...(eventId?{closedBy:eventId}:{}),...(writer!==row.writer?{closedWriter:writer}:{})});
    return id;
}
// holding.transfer：同一事务关闭旧边（reason）并以新的持有人 / 标的开立同种、同条款的新边。
export function transferHolding(d,{id,holder,subject,reason='transferred',writer,eventId=null,terms,engine=null}){
    const row=rowOf(d,id);if(!row)throw Error(`持有不存在：${id}`);
    closeHolding(d,{id,reason,writer,eventId});
    return openHolding(d,{kind:row.kind,variant:row.variant??null,holder:holder??row.holder,subject:subject??row.subject,terms:terms??row.terms??null,grantedBy:row.grantedBy??null,source:row.source??null,writer,eventId,reason,engine});
}
// holding.rescale（06 §6.3）：同一事务改写某标的全部份额，结束后份额之和仍为种类声明的 sum。
export function rescaleHolding(d,{kind:kindId,subject,shares,writer,eventId=null,source=null,engine=null}){
    const kind=kinds.get(kindId);if(kind?.sum===undefined)throw new HoldingRejected('E-HOLDING-SHARE','这种持有没有份额',kindId);
    const total=Object.values(shares).reduce((n,s)=>n+s,0);
    if(Math.abs(total-kind.sum)>EPS)throw new HoldingRejected('E-HOLDING-SUM',`${kind.label}份额之和须为 ${kind.sum}`,`${subject} 合计 ${total}`);
    if(!holdingsActive(d))return [];
    const current=aliveHoldings(d,{kind:kindId,subject});
    for(const r of current)if(Math.abs((shares[r.holder]??0)-(r.terms?.share??0))>EPS)closeHolding(d,{id:r.id,reason:'rescaled',writer,eventId});
    const out=[];
    for(const [holder,share] of Object.entries(shares).sort(([a],[b])=>a<b?-1:1)){
        if(!(share>0))continue;
        const keep=current.find(r=>r.holder===holder&&Math.abs((r.terms?.share??0)-share)<=EPS);
        out.push(keep?keep.id:openHolding(d,{kind:kindId,holder,subject,terms:{...(current.find(r=>r.holder===holder)?.terms??{}),share},source:source??current[0]?.source??null,writer,eventId,reason:'rescaled',engine}));
    }
    return out;
}

// ---- 实体（S2a 实体化：office、estate、case、motion、wreck） ----------------------------
const ENTITY_ID=/^[a-z]+_[^\s|]+$/;
export const entityRow=(d,id)=>read(d,'holdings','entities',id)??null;
export function createEntity(d,{id,kind,facts={},source=null,writer,eventId=null,origin='runtime'}){
    if(!ENTITY_KINDS[kind])throw Error(`S2a 未实体化的种类：${kind}`);
    if(!ENTITY_ID.test(String(id??''))||!String(id).startsWith(`${kind==='liquidation'?'liq':kind}_`))throw Error(`实体编号须以 ${kind}_ 开头：${id}`);
    writerFor(writer,'entities',kind);
    if(!holdingsActive(d))return null;
    if(entityRow(d,id))throw new HoldingRejected('E-ENTITY-DUPLICATE','编号已被占用（编号永不复用）',id);
    const idx=index(d);bump(d,idx);if(source)push(idx.entities,source,id);
    d.set(['holdings','entities',id],stripUndefined({id,kind,facts,source:source??undefined,origin,createdAt:minuteOf(d),writer,event:eventId??undefined}));
    return id;
}
// 慢变事实只因事件改变：phase / status 等由旧写入点同步写入；不可变事实不在此改。
export function updateEntity(d,{id,facts,writer,eventId=null}){
    if(!holdingsActive(d))return null;
    const e=entityRow(d,id);if(!e)throw Error(`实体不存在：${id}`);
    writerFor(writer,'entities',e.kind);
    if(e.goneAt!==undefined)throw new HoldingRejected('E-ENTITY-GONE','实体已消失',id);
    const next={...e.facts,...facts};if(JSON.stringify(next)===JSON.stringify(e.facts))return id;
    const idx=index(d);bump(d,idx);
    d.set(['holdings','entities',id],{...e,facts:next,updatedAt:minuteOf(d),...(eventId?{updatedBy:eventId}:{})});
    return id;
}
// 旧字段把对象删掉（残骸被取尽或腐朽）时，实体记消失时刻与起因；墓碑保留，编号不复用。
// 完整的 transition(gone) 协议（承接、交接、断言）由 S2b 接管，这里只落墓碑。
export const GONE_BASES=Object.freeze(['death','dissolution','destruction','extinction','declared','insolvency','rested','reborn','aggregated','pack_removed']);
export function endEntity(d,{id,basis,writer,eventId=null}){
    if(!holdingsActive(d))return null;
    const e=entityRow(d,id);if(!e)throw Error(`实体不存在：${id}`);
    writerFor(writer,'entities',e.kind);
    if(!GONE_BASES.includes(basis))throw Error(`未登记的消失起因：${basis}`);
    if(e.goneAt!==undefined)return id;
    const idx=index(d);bump(d,idx);if(e.source)pull(idx.entities,e.source,id);
    d.set(['holdings','entities',id],{...e,goneAt:minuteOf(d),basis,...(eventId?{goneBy:eventId}:{})});
    const loc=read(d,'holdings','locations',id);if(loc){if(loc.source)pull(idx.locations,loc.source,id);d.remove(['holdings','locations',id]);}
    return id;
}

// ---- 位置事实（01 §1.2：地点节点；某个 agent（随身）；某个 item（容器内）） --------------------
// 物在随身者或容器中时，有效位置随载体派生（located），不另存。
export const LOCATION_MODES=Object.freeze({place:['place','thing'],carried:['agent'],container:['thing']});
export const locationOf=(d,entity)=>read(d,'holdings','locations',entity)??null;
export function setLocation(d,{entity,at,mode,writer,source=null,engine=null}){
    writerFor(writer,'locations');
    if(!LOCATION_MODES[mode])throw Error(`未知的位置形态：${mode}`);
    if(!holdingsActive(d))return null;
    if(at===entity)throw new HoldingRejected('E-LOCATION-SELF','东西不能放在自己里面',entity);
    const t=templatesOf(d,at,engine);
    if(!t||!t.some(x=>LOCATION_MODES[mode].includes(x)))throw new HoldingRejected('E-LOCATION-TEMPLATE','位置载体不合这种形态',`${entity} ${mode} ${at}${t?` 为 ${t.join('/')}`:''}`);
    // 容器链不得成环。
    if(mode==='container'){const seen=new Set([entity]);let x=at;while(x){if(seen.has(x))throw new HoldingRejected('E-LOCATION-CYCLE','容器不能互相包含',entity);seen.add(x);const l=locationOf(d,x);x=l?.mode==='container'?l.at:null;}}
    const prev=locationOf(d,entity);
    if(prev&&prev.at===at&&prev.mode===mode)return entity;
    const idx=index(d);bump(d,idx);
    const next=stripUndefined({at,mode,since:minuteOf(d),source:source??prev?.source??undefined});
    if(prev?.source)pull(idx.locations,prev.source,entity);if(next.source)push(idx.locations,next.source,entity);
    d.set(['holdings','locations',entity],next);
    return entity;
}
export function clearLocation(d,{entity,writer}){
    writerFor(writer,'locations');
    if(!holdingsActive(d)||!locationOf(d,entity))return null;
    const idx=index(d);bump(d,idx);const prev=locationOf(d,entity);if(prev?.source)pull(idx.locations,prev.source,entity);d.remove(['holdings','locations',entity]);return entity;
}
// 有效位置：沿随身者 / 容器链上溯到地点；载体自身的位置由 L1 的 placeOf（旧字段：人物 location 等）给出。
export function located(d,entity,placeOf=()=>null){
    const seen=new Set();let x=entity;
    while(x&&!seen.has(x)){seen.add(x);const l=locationOf(d,x);if(!l)return placeOf(x)??null;if(l.mode==='place')return l.at;x=l.at;}
    return null;
}

// ---- 旧写入点的包装（L0 入口，内核与各层共用）：d.set / d.remove 之后通知 L1 适配器按写入路径双写 ----
// L1（holding-sources.mjs）登记观察者；本模块只转发，不知道哪些路径对应哪些持有。
let observer=null;
export function registerHoldingObserver(fn){const prev=observer;observer=fn;return prev;}
export function holdingSet(d,engine,path,value,writer,eventId=null,{projection=false}={}){
    // The lifecycle transaction has already changed the authoritative edges.
    // Its compatibility projection must not run the old-source adapter again.
    if(projection&&(!d.protocolTransaction||writer!=='transition'))throw Error('Holding projection requires the lifecycle transaction');
    d.set(path,value);if(!projection)observer?.(d,engine,path,writer,eventId);return value;
}
export function holdingRemove(d,engine,path,writer,eventId=null){d.remove(path);observer?.(d,engine,path,writer,eventId);}

// ---- 世界版本更新（包升级）的折算 ------------------------------------------------------
const upgrades=new Map();
export function registerHoldingsUpgrade(name,fn){upgrades.set(name,fn);}
// 世界视图在本事件里变大（远方郡生成后叠加世界含新居民、家户与官职）：用新世界的引擎把各来源重同步一遍。
// 旧字段没有为这些人写任何路径，单靠写入点双写够不着。
export function resyncHoldings(d,engine){for(const fn of upgrades.values())fn(d,engine);}
export function bookHoldingsUpgrade(before,after,world){
    if(before?.holdings?.version!==HOLDINGS_VERSION)return [];
    const patches=[],doc={...after,holdings:structuredClone(before.holdings)};
    const d={original:before,peek:(...p)=>p.reduce((v,k)=>v?.[k],doc),get(...p){return structuredClone(this.peek(...p));},
        set(path,value){if(path[0]!=='holdings')throw Error('折算只写持有分区');let t=doc;for(const k of path.slice(0,-1))t=t[k]??={};t[path.at(-1)]=structuredClone(value);patches.push({op:'set',path,value});},
        remove(path){let t=doc;for(const k of path.slice(0,-1))t=t?.[k];if(t)delete t[path.at(-1)];patches.push({op:'delete',path});}};
    const engine={world,rules:world.rules,byId:new Map(Object.values(world).filter(Array.isArray).flat().filter(r=>r&&typeof r.id==='string').map(r=>[r.id,r]))};
    for(const fn of upgrades.values())fn(d,engine);
    return patches;
}

// ---- 漂移：双写期旧字段仍是权威（S1a 账本同此）：适配器按旧字段写入时被注册形状拒绝的那一条，
// 不拦旧结算，而是记一条漂移（种类、两端、拒绝码与原因），存储里缺这一条，对账即报出；验收要求漂移为 0。
export function recordHoldingDrift(d,entry){
    if(!holdingsActive(d))return;
    d.set(['holdings','drift'],[...(read(d,'holdings','drift')??[]),{...entry,minute:minuteOf(d)}].slice(-50));
    d.set(['holdings','driftTally'],(read(d,'holdings','driftTally')??0)+1);
}
export const holdingsDrift=d=>read(d,'holdings','drift')??[];

// ---- 审计 ----------------------------------------------------------------------------
// I8：互斥种类同一标的至多一条存活持有；份额种类同一标的的存活份额之和不超过 sum（有份额者应恰为 sum，由对账报出）；
// 存活持有的两端仍可解析；容器链无环。
export function auditHoldings(d){
    const errors=[];if(!holdingsActive(d))return errors;
    const alive=Object.values(read(d,'holdings','rows')??{}).filter(r=>r.until===undefined),bySubject=new Map();
    for(const r of alive){const k=`${r.kind}|${r.subject}`;bySubject.set(k,[...bySubject.get(k)??[],r]);if(!kinds.has(r.kind))errors.push(`未登记种类：${r.id} ${r.kind}`);}
    for(const [k,list] of bySubject){
        const kind=kinds.get(list[0].kind);if(!kind)continue;
        if(kind.exclusive&&list.length>1)errors.push(`互斥持有多于一条：${k}（${list.map(r=>r.holder).join('、')}）`);
        if(kind.sum!==undefined){const n=list.reduce((a,r)=>a+(r.terms?.share??0),0);if(Math.abs(n-kind.sum)>1e-6)errors.push(`份额之和 ≠ ${kind.sum}：${k} = ${n}`);}
    }
    for(const [entity] of Object.entries(read(d,'holdings','locations')??{})){const seen=new Set();let x=entity;while(x){if(seen.has(x)){errors.push(`容器成环：${entity}`);break;}seen.add(x);const l=read(d,'holdings','locations',x);x=l?.mode==='place'?null:l?.at;}}
    return errors;
}

// Pure queries. A state-only caller reads the protocol's compatibility mirror;
// pass a document/draft when the canonical holdings partition is available.
// Queries return only scalar facts. Borrow the cursor's current tree without
// exposing an immutable checkpoint and forcing copies on the next write.
const documentOf=source=>typeof source?.peek==='function'?source.peek():source?.document??source;
export function lifecycleState(engine,source,id,query=null){
 const doc=documentOf(source),state=doc?.state??doc??{};
 const actor=id==='player'?state.player:state.npcs?.[id]??state.creatures?.[id]??state.created?.[id]??state.family?.people?.[id]??engine?.byId?.get(id);
 const entity=doc?.holdings?.entities?.[id];
 const protocol=doc?.holdings?.protocol?.entities?.[id]??state.records?.[`transition:${id}`];
 const generation=actor?.incarnation??protocol?.generation??0;
 const current=protocol&&((protocol.generation??0)===generation||protocol.gone===false&&protocol.restoredAt!==undefined&&(protocol.generation??0)+1===generation)?protocol:null;
 const exists=!!(actor||entity||current);
 // A restoration is authoritative even if an old status mirror is stale.
 const gone=current?current.gone===true:entity?.goneAt!==undefined||actor?.status==='死亡'||actor?.diedAt!==undefined;
 if(query==='effective')return exists&&!gone;
 if(query==='gone')return exists&&gone;
 const dead=current?(current.gone===true&&(current.basis==='death'||current.actualDeath!==undefined)):
  actor?.status==='死亡'||actor?.diedAt!==undefined;
 if(query==='dead')return exists&&dead;
 if(query==='living')return exists&&!dead;
 return {exists,generation,gone:exists&&gone,dead:exists&&dead,living:exists&&!dead,
  effective:exists&&!gone,basis:current?.basis??entity?.basis??null,restored:current?.gone===false&&current.restoredAt!==undefined};
}
export const isGone=(engine,source,id)=>lifecycleState(engine,source,id,'gone');
export const isPhysicallyDead=(engine,source,id)=>lifecycleState(engine,source,id,'dead');
export const isLiving=(engine,source,id)=>lifecycleState(engine,source,id,'living');
export const isEffective=(engine,source,id)=>lifecycleState(engine,source,id,'effective');
// Subjective consumers must pass only their permitted projection, never a world
// document. Unknown facts stay unknown; this does not grant consent or capacity.
export const bodyLiving=self=>!!self&&self.status!=='死亡'&&self.diedAt===undefined;

export const projectionLiving=bodyLiving;
