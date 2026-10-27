// S1a 账本（L0，01 §1.6、02 I1/I2/I15、附录 A §A.1）：账户 = (实体, 资源, 用途)，存量是非负整数；
// transfer() 是改存量的唯一入口。源汇（src:* / sink:*）是显式账户，只记累计流量，
// 只能由登记了该源汇的写入者引用，源按 (写入者, 源, 资源) 声明每日预算，超出即熔断。
// 账本放在文档根的 ledger 分区（与 state 并列）：state 的读者、人口压缩的引用扫描与提示卡都不读它。
// 迁移期（绞杀式）旧字段照写，账本由适配器在每个旧写入点同时写入；对账测试断言两者逐账户相等。
export const LEDGER_VERSION=1;
export const CORE_NAMESPACE='core';
// 本地记账铜钱（world/ontology/resources.json 的 coin_river；rules.economy.credit.coinages 中 item 为 null 的 coinage_river）。
export const LEDGER_COIN='coin_river';
const DAY=1440;
// 资源键：[命名空间:]名称；core: 可省略（规范形式不带 core:）。
const RESOURCE=/^(?:([a-z][a-z0-9_-]{1,31}):)?([a-z][a-z0-9_]*)$/;
export const isResourceKey=resource=>RESOURCE.test(String(resource??''));
export function resourceKey(resource){
    const m=RESOURCE.exec(String(resource??''));if(!m)throw Error(`资源键无效：${resource}`);
    return m[1]&&m[1]!==CORE_NAMESPACE?`${m[1]}:${m[2]}`:m[2];
}
const OWNER=/^[^|\s]+$/,PURPOSE=/^[^|\s]+$/;
export function accountKey(owner,resource,purpose){
    if(!OWNER.test(String(owner??''))||!PURPOSE.test(String(purpose??'')))throw Error(`账户键无效：${owner}|${resource}|${purpose}`);
    return `${owner}|${resourceKey(resource)}|${purpose}`;
}
export function parseAccount(key){
    const [owner,resource,purpose,...rest]=String(key).split('|');
    if(rest.length||!owner||!resource||!purpose)throw Error(`账户键无效：${key}`);
    return {owner,resource:resourceKey(resource),purpose};
}
export const isSource=owner=>String(owner).startsWith('src:');
export const isSink=owner=>String(owner).startsWith('sink:');
const isFlow=owner=>isSource(owner)||isSink(owner);
// L1 may mirror dedicated account storage after an actual posting. Ordinary
// purses and stocks retain their existing writers; this grants no authority.
let transferProjection=null;
export function registerTransferProjection(fn){transferProjection=fn;}
const transferObservers=new Map();
export function registerTransferObserver(id,fn){transferObservers.set(id,fn);}

// ---- 源汇登记（写入权与每日预算） -------------------------------------------
// 源汇词条（id 与含义）登记在 world/ontology/resources.json 的 sourcesAndSinks；
// 这里是运行期的写入权表：写入者在模块加载时声明自己用哪些源（含每日预算）与汇。
const writers=new Map();
export function declareLedgerWriter(writer,{sources={},sinks=[]}={}){
    if(!/^[a-z][a-z0-9-]*$/.test(writer))throw Error(`账本写入者名无效：${writer}`);
    const row=writers.get(writer)??{sources:new Map(),sinks:new Set()};
    for(const [source,budgets] of Object.entries(sources)){
        if(!isSource(source))throw Error(`${writer} 声明的源不是 src:*：${source}`);
        const per=row.sources.get(source)??new Map();
        for(const [resource,budget] of Object.entries(budgets)){
            if(!(budget===Infinity||Number.isSafeInteger(budget)&&budget>0))throw Error(`${writer} 对 ${source} 的每日预算无效`);
            per.set(resource==='*'?'*':resourceKey(resource),budget);
        }
        row.sources.set(source,per);
    }
    for(const sink of sinks){if(!isSink(sink))throw Error(`${writer} 声明的汇不是 sink:*：${sink}`);row.sinks.add(sink);}
    writers.set(writer,row);
}
export function ledgerWriters(){
    return Object.fromEntries([...writers].sort(([a],[b])=>a<b?-1:1).map(([w,r])=>[w,{
        sources:Object.fromEntries([...r.sources].map(([s,m])=>[s,Object.fromEntries([...m].map(([k,v])=>[k,v===Infinity?null:v]))])),sinks:[...r.sinks].sort()}]));
}

// ---- 开账（genesis） ------------------------------------------------------
// 没有 ledger 分区的文档（新开局或迁移前的存档）在第一次归约时开账：由本体层登记的
// 开账函数列出旧字段里的全部余额，全部从 src:genesis 转入。开账只依赖文档与世界数据，确定性。
// 开账按范围（scope）登记：S1a 的 coin（货币），S1b 的 stock（物品、粮与库存）。已有账本缺某个范围
// （S1a 存档）时只补开该范围，已开范围不重开。
const openers=new Map();
export const LEDGER_SCOPES=['coin','stock'];
export function registerLedgerOpening(fn,scope='coin'){
    if(!LEDGER_SCOPES.includes(scope))throw Error(`未登记的开账范围：${scope}`);
    openers.set(scope,fn);
}
export function emptyLedger(){return {version:LEDGER_VERSION,scopes:[...LEDGER_SCOPES],accounts:{},flows:{},lots:{},budget:{day:null,used:{}},transfers:0};}
const openedScopes=ledger=>ledger?.scopes??['coin'];// S1a 存档的账本没有 scopes 字段，只开过货币
function openScopes(engine,document,ledger,scopes){
    for(const scope of scopes){
        const opener=openers.get(scope);if(!opener)throw Error(`账本开账函数未登记：${scope}`);
        for(const [key,amount,lots] of opener(engine,document.state)){
            if(!amount)continue;
            const {owner,resource}=parseAccount(key);
            if(isFlow(owner)||!Number.isSafeInteger(amount)||amount<0)throw Error(`开账余额无效：${key}=${amount}`);
            ledger.accounts[key]=(ledger.accounts[key]??0)+amount;
            if(lots?.length)ledger.lots[key]=[...(ledger.lots[key]??[]),...lots.map(l=>({...l}))];
            const flow=accountKey('src:genesis',resource,'opening');ledger.flows[flow]=(ledger.flows[flow]??0)+amount;
            ledger.transfers++;
        }
    }
    ledger.scopes=LEDGER_SCOPES.filter(s=>openedScopes(ledger).includes(s)||scopes.includes(s));
    return ledger;
}
export function openLedger(engine,document){return openScopes(engine,document,emptyLedger(),LEDGER_SCOPES);}
// The reducer opens the ledger on its own copy of the document so the opening
// never counts as a change of the event; the opening is prepended to the
// event's patches only when the event actually books a transfer. An event that
// moves nothing (an instant look, a zero-length turn) leaves the save as it was.
export function withLedger(engine,document){
    if(!document?.state)return {document,opening:null};
    if(document.ledger){
        const missing=LEDGER_SCOPES.filter(s=>!openedScopes(document.ledger).includes(s));
        if(!missing.length||document.ledger.version!==LEDGER_VERSION)return {document,opening:null};
        const old=document.ledger,ledger=openScopes(engine,document,{...old,accounts:{...old.accounts},flows:{...old.flows},lots:{...old.lots??{}}},missing);
        return {document:{...document,ledger},opening:{op:'set',path:['ledger'],value:ledger}};
    }
    const ledger=openLedger(engine,document);
    return {document:{...document,ledger},opening:{op:'set',path:['ledger'],value:ledger}};
}
export function finishLedger(patches,opening){
    if(!opening)return patches;
    return patches.some(p=>p.path[0]==='ledger')?[opening,...patches]:patches;
}

// ---- 批次（lots，01 §1.6） ------------------------------------------------
// 批次不是实体，是账户的一个维度：声明了批次的账户（由适配器登记的策略判定：资源种类声明 lots
// 且用途是仓储类）在 ledger.lots[账户] 里按批次记数量与元数据——入库日 day、品质 quality、
// 来源 origin（产地、来源事件）、保质到期日 expiresDay、类别 kind。Σ批次 = 账户余额。
// 转出缺省先进先出（按到期日、编号），也可由调用方指定批次；转入批次账户时携带转出的批次，
// 来自源或非批次账户时由调用方给出元数据。批次元数据只能经 reviseLots（白名单字段）改写。
let lotPolicy=()=>false;
export function registerLotPolicy(fn){lotPolicy=fn;}
export const lotAccount=key=>{const {owner,resource,purpose}=parseAccount(key);return !isFlow(owner)&&lotPolicy({owner,resource,purpose});};
const LOT_FIELDS=new Set(['id','qty','day','quality','origin','expiresDay','kind']);
const byExpiry=(a,b)=>(a.expiresDay??Infinity)-(b.expiresDay??Infinity)||String(a.id).localeCompare(String(b.id));
// 从批次列表取出 amount；pick = 批次编号列表，或 {kind} 过滤。返回 [剩余, 取出]。
function takeLots(list,amount,pick){
    const rest=list.map(l=>({...l})),out=[];let left=amount;
    const order=[...rest].sort(byExpiry),ids=Array.isArray(pick)?pick:null;
    const eligible=ids?ids.map(id=>order.find(l=>l.id===id)).filter(Boolean):order.filter(l=>!pick?.kind||l.kind===pick.kind);
    for(const lot of eligible){if(!left)break;const n=Math.min(left,lot.qty);if(!n)continue;lot.qty-=n;left-=n;out.push({...lot,qty:n});}
    // 指定批次不够（账本批次与旧批次已分叉）时其余按先进先出补足，保证 Σ批次 = 余额；分叉由批次对账报出。
    for(const lot of order){if(!left)break;const n=Math.min(left,lot.qty);if(!n)continue;lot.qty-=n;left-=n;out.push({...lot,qty:n});}
    return [rest.filter(l=>l.qty>0),out];
}
function mergeLots(list,add){
    const out=list.map(l=>({...l}));
    for(const lot of add){
        for(const k of Object.keys(lot))if(!LOT_FIELDS.has(k))throw Error(`批次字段未登记：${k}`);
        if(!lot.qty)continue;
        const same=out.find(l=>l.id===lot.id&&l.day===lot.day&&l.expiresDay===lot.expiresDay&&l.kind===lot.kind&&l.quality===lot.quality&&l.origin===lot.origin);
        if(same)same.qty+=lot.qty;else out.push({...lot});
    }
    return out;
}
export function lotsOf(d,key){return read(d,'ledger','lots',key)??[];}
// fact.set 的批次白名单：只改 expiresDay / quality / kind（如仓况变差缩短保质）。
export function reviseLots(d,key,fn){
    if(!ledgerActive(d))return;
    const list=lotsOf(d,key),next=list.map(l=>{const r=fn({...l});for(const k of new Set([...Object.keys(l),...Object.keys(r)]))if(!['expiresDay','quality','kind'].includes(k)&&r[k]!==l[k])throw Error(`批次元数据只能改保质期、品质、类别：${k}`);return r;});
    if(JSON.stringify(next)!==JSON.stringify(list))d.set(['ledger','lots',key],next);
}
// ---- 转移 ----------------------------------------------------------------
const read=(d,...p)=>typeof d.peek==='function'?d.peek(...p):d.get(...p);
export const ledgerActive=d=>read(d,'ledger','version')===LEDGER_VERSION;
export function balance(d,key){return read(d,'ledger','accounts',key)??0;}
// from / to: account keys. A source or sink side is `src:<kind>|<resource>|<purpose>`.
// Returns the amount moved (0 when the document has no ledger: forecasts and
// bare unit-test drafts are not campaigns and carry no books).
export function transfer(d,{from,to,amount,writer,eventId=null,lot=null,pick=null}){
    if(amount===0)return 0;
    if(!Number.isSafeInteger(amount)||amount<0)throw Error(`转移数量无效：${amount}`);
    const a=parseAccount(from),b=parseAccount(to);
    if(a.resource!==b.resource)throw Error(`转移两端资源不同：${from} → ${to}`);
    if(from===to)throw Error(`转移两端相同：${from}`);
    if(isSink(a.owner)||isSource(b.owner))throw Error(`源只能流出、汇只能流入：${from} → ${to}`);
    if(isSource(a.owner)&&isSink(b.owner))throw Error('源不能直接流入汇');
    const w=writers.get(writer);if(!w)throw Error(`未登记的账本写入者：${writer}`);
    if(isSink(b.owner)&&!w.sinks.has(b.owner))throw Error(`${writer} 没有 ${b.owner} 的写入权`);
    // 每日预算按 (写入者, 源, 资源) 声明；资源 '*' 是该源对其余资源的统一预算（物品种类多，逐种声明不可行）。
    const budgets=isSource(a.owner)?w.sources.get(a.owner):null,budget=budgets?.get(a.resource)??budgets?.get('*');
    if(isSource(a.owner)&&budget===undefined)throw Error(`${writer} 没有 ${a.owner} 的写入权`);
    if(!ledgerActive(d))return 0;
    let moved=null;
    if(isSource(a.owner)){
        const day=Math.floor((read(d,'state','minute')??0)/DAY),current=read(d,'ledger','budget')??{day:null,used:{}};
        const used={...(current.day===day?current.used:{})},slot=`${writer}|${a.owner}|${a.resource}`;
        used[slot]=(used[slot]??0)+amount;
        if(used[slot]>budget)throw Error(`源汇预算熔断：${writer} 当日经 ${a.owner} 流入 ${a.resource} ${used[slot]} 超过 ${budget}`);
        d.set(['ledger','budget'],{day,used});
        d.set(['ledger','flows',from],(read(d,'ledger','flows',from)??0)+amount);
    }else{
        const have=balance(d,from);
        // 双写期旧字段仍是权威：新账余额不足说明某个旧写入点漏了双写（或外部直接改了旧字段）。
        // 不以新账拒绝旧结算，而是把差额记为漂移（经内部源 src:drift 补足，守恒照旧成立）；
        // 对账测试要求漂移为零，否则阻塞。账户永不为负（I2）。
        if(have<amount){
            const gap=amount-have,drift=accountKey('src:drift',a.resource,a.owner.replace(/[|\s]/g,'_'));
            d.set(['ledger','flows',drift],(read(d,'ledger','flows',drift)??0)+gap);
            d.set(['ledger','drift'],[...(read(d,'ledger','drift')??[]),{account:from,gap,writer,eventId,minute:read(d,'state','minute')??null}].slice(-50));
            tallyDrift(d,'gap');
        }
        d.set(['ledger','accounts',from],Math.max(0,have-amount));
        if(lotAccount(from)){
            const [rest,out]=takeLots(lotsOf(d,from),Math.min(have,amount),pick);moved=out;
            if(rest.length)d.set(['ledger','lots',from],rest);else if(read(d,'ledger','lots',from))d.remove(['ledger','lots',from]);
        }
    }
    if(isSink(b.owner))d.set(['ledger','flows',to],(read(d,'ledger','flows',to)??0)+amount);
    else{
        d.set(['ledger','accounts',to],balance(d,to)+amount);
        if(lotAccount(to)){
            // 携带转出的批次（lot 为对象时覆盖其元数据，如改换来源）；lot 为数组时即转入的全部批次；
            // 来自源或非批次账户的部分按 lot 元数据新开批次。
            const day=Math.floor((read(d,'state','minute')??0)/DAY);
            let add;
            if(Array.isArray(lot)){add=lot;if(lot.reduce((n,l)=>n+l.qty,0)!==amount)throw Error('指定批次的数量与转移数量不符');}
            else{
                const carried=(moved??[]).map(l=>({...l,...(lot??{}),qty:l.qty})),rest=amount-carried.reduce((n,l)=>n+l.qty,0);
                add=[...carried,...(rest>0?[{id:eventId??`lot:${day}`,day,...(lot??{}),qty:rest}]:[])];
            }
            d.set(['ledger','lots',to],mergeLots(lotsOf(d,to),add));
        }
    }
    d.set(['ledger','transfers'],(read(d,'ledger','transfers')??0)+1);
    transferProjection?.(d,{from,to,fromAccount:a,toAccount:b,amount,eventId,writer});
    for(const observe of transferObservers.values())observe(d,{from,to,fromAccount:a,toAccount:b,amount,eventId,writer});
    globalThis.__LEDGER_TRACE__?.push({from,to,amount,writer,eventId});// 调试：对账定位用
    return amount;
}

// ---- 世界版本更新（包升级）的折算 ------------------------------------------------
// 世界更新（world-upgrade）按新版目录给居民补发钱物或改写旧字段，不经工具归约。适配器登记折算函数：
// 比较更新前后的旧字段余额，增加的从 src:pack_converted 流入、减少的流入 sink:pack_removed（12 §12.5），
// 账本补丁随更新补丁一并写入，更新后旧字段与账户仍逐账户相等。
const upgradeBookings=new Map();
export function registerUpgradeBooking(name,fn){upgradeBookings.set(name,fn);}
export function bookUpgrade(before,after,world){
    if(before?.ledger?.version!==LEDGER_VERSION)return [];
    const ledger=structuredClone(before.ledger),patches=[];
    const d={peek:(...p)=>p[0]==='ledger'?p.slice(1).reduce((v,k)=>v?.[k],ledger):p.reduce((v,k)=>v?.[k],after),
        get(...p){return this.peek(...p);},
        set(path,value){if(path[0]!=='ledger')throw Error('折算只写账本分区');let t=ledger;for(const k of path.slice(1,-1))t=t[k]??={};t[path.at(-1)]=structuredClone(value);patches.push({op:'set',path,value});},
        remove(path){let t=ledger;for(const k of path.slice(1,-1))t=t?.[k];if(t)delete t[path.at(-1)];patches.push({op:'delete',path});}};
    // 折算函数只读世界目录：给一个只含 world / rules / byId 的引擎视图。
    const engine={world,rules:world.rules,byId:new Map(Object.values(world).filter(Array.isArray).flat().filter(r=>r&&typeof r.id==='string').map(r=>[r.id,r]))};
    for(const fn of upgradeBookings.values())fn(d,engine,before,after);
    return patches;
}

// ---- 审计 ----------------------------------------------------------------
// Σ实体账户 = Σ源流出 − Σ汇流入（逐资源）。
export function ledgerTotals(ledger){
    const out={};const add=(r,k,n)=>{const row=out[r]??={accounts:0,sources:0,sinks:0};row[k]+=n;};
    for(const [key,n] of Object.entries(ledger?.accounts??{}))add(parseAccount(key).resource,'accounts',n);
    for(const [key,n] of Object.entries(ledger?.flows??{})){const {owner,resource}=parseAccount(key);add(resource,isSource(owner)?'sources':'sinks',n);}
    return out;
}
// 漂移上报（账本双写退出第一期，只统计不拒绝）：drift 清单只留最近 50 条，这里另记不封顶的累计次数。
// 类别：gap（余额不足由 src:drift 补足）、unbooked（旧写入漏传对方账户）、holding（持有写入被注册形状拒绝）。
// 刻末由 stampDriftReport 写入 ledger.driftReport 供查询；S6 入口再据此拒绝。
export function tallyDrift(d,kind){
    if(!ledgerActive(d))return;
    d.set(['ledger','driftTally',kind],(read(d,'ledger','driftTally',kind)??0)+1);
}
export function driftCounts(document){
    const t=document?.ledger?.driftTally??{};
    return {gap:t.gap??0,unbooked:t.unbooked??0,holding:document?.holdings?.driftTally??0};
}
export function stampDriftReport(d){
    if(!ledgerActive(d))return;
    const c=driftCounts({ledger:{driftTally:read(d,'ledger','driftTally')},holdings:{driftTally:read(d,'holdings','driftTally')}});
    if(c.gap+c.unbooked+c.holding===0)return;
    const prev=read(d,'ledger','driftReport');
    if(prev&&prev.gap===c.gap&&prev.unbooked===c.unbooked&&prev.holding===c.holding)return;
    d.set(['ledger','driftReport'],{...c,minute:read(d,'state','minute')??null});
}
export function auditLedger(ledger){
    const errors=[];
    for(const [key,n] of Object.entries(ledger?.accounts??{}))if(!Number.isSafeInteger(n)||n<0)errors.push(`账户为负或非整数：${key}=${n}`);
    for(const [r,t] of Object.entries(ledgerTotals(ledger)))if(t.accounts!==t.sources-t.sinks)errors.push(`${r} 不守恒：账户 ${t.accounts} ≠ 源 ${t.sources} − 汇 ${t.sinks}`);
    for(const [key,list] of Object.entries(ledger?.lots??{})){
        if(list.some(l=>!Number.isSafeInteger(l.qty)||l.qty<=0))errors.push(`批次数量无效：${key}`);
        const n=list.reduce((a,l)=>a+l.qty,0);
        if(n!==(ledger.accounts?.[key]??0))errors.push(`批次合计 ≠ 账户余额：${key} ${n} ≠ ${ledger.accounts?.[key]??0}`);
    }
    return errors;
}
