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
            per.set(resourceKey(resource),budget);
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
let opener=null;
export function registerLedgerOpening(fn){opener=fn;}
export function emptyLedger(){return {version:LEDGER_VERSION,accounts:{},flows:{},budget:{day:null,used:{}},transfers:0};}
export function openLedger(engine,document){
    if(!opener)throw Error('账本开账函数未登记');
    const ledger=emptyLedger();
    for(const [key,amount] of opener(engine,document.state)){
        if(!amount)continue;
        const {owner,resource}=parseAccount(key);
        if(isFlow(owner)||!Number.isSafeInteger(amount)||amount<0)throw Error(`开账余额无效：${key}=${amount}`);
        ledger.accounts[key]=(ledger.accounts[key]??0)+amount;
        const flow=accountKey('src:genesis',resource,'opening');ledger.flows[flow]=(ledger.flows[flow]??0)+amount;
        ledger.transfers++;
    }
    return ledger;
}
// The reducer opens the ledger on its own copy of the document so the opening
// never counts as a change of the event; the opening is prepended to the
// event's patches only when the event actually books a transfer. An event that
// moves no money (an instant look, a zero-length turn) leaves the save as it was.
export function withLedger(engine,document){
    if(document?.ledger||!document?.state)return {document,opening:null};
    const ledger=openLedger(engine,document);
    return {document:{...document,ledger},opening:{op:'set',path:['ledger'],value:ledger}};
}
export function finishLedger(patches,opening){
    if(!opening)return patches;
    return patches.some(p=>p.path[0]==='ledger')?[opening,...patches]:patches;
}

// ---- 转移 ----------------------------------------------------------------
const read=(d,...p)=>typeof d.peek==='function'?d.peek(...p):d.get(...p);
export const ledgerActive=d=>read(d,'ledger','version')===LEDGER_VERSION;
export function balance(d,key){return read(d,'ledger','accounts',key)??0;}
// from / to: account keys. A source or sink side is `src:<kind>|<resource>|<purpose>`.
// Returns the amount moved (0 when the document has no ledger: forecasts and
// bare unit-test drafts are not campaigns and carry no books).
export function transfer(d,{from,to,amount,writer,eventId=null}){
    if(amount===0)return 0;
    if(!Number.isSafeInteger(amount)||amount<0)throw Error(`转移数量无效：${amount}`);
    const a=parseAccount(from),b=parseAccount(to);
    if(a.resource!==b.resource)throw Error(`转移两端资源不同：${from} → ${to}`);
    if(from===to)throw Error(`转移两端相同：${from}`);
    if(isSink(a.owner)||isSource(b.owner))throw Error(`源只能流出、汇只能流入：${from} → ${to}`);
    if(isSource(a.owner)&&isSink(b.owner))throw Error('源不能直接流入汇');
    const w=writers.get(writer);if(!w)throw Error(`未登记的账本写入者：${writer}`);
    if(isSink(b.owner)&&!w.sinks.has(b.owner))throw Error(`${writer} 没有 ${b.owner} 的写入权`);
    if(isSource(a.owner)&&w.sources.get(a.owner)?.get(a.resource)===undefined)throw Error(`${writer} 没有 ${a.owner} 的写入权`);
    if(!ledgerActive(d))return 0;
    if(isSource(a.owner)){
        const budget=w.sources.get(a.owner).get(a.resource);
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
        }
        d.set(['ledger','accounts',from],Math.max(0,have-amount));
    }
    if(isSink(b.owner))d.set(['ledger','flows',to],(read(d,'ledger','flows',to)??0)+amount);
    else d.set(['ledger','accounts',to],balance(d,to)+amount);
    d.set(['ledger','transfers'],(read(d,'ledger','transfers')??0)+1);
    globalThis.__LEDGER_TRACE__?.push({from,to,amount,writer,eventId});// 调试：对账定位用
    return amount;
}

// ---- 审计 ----------------------------------------------------------------
// Σ实体账户 = Σ源流出 − Σ汇流入（逐资源）。
export function ledgerTotals(ledger){
    const out={};const add=(r,k,n)=>{const row=out[r]??={accounts:0,sources:0,sinks:0};row[k]+=n;};
    for(const [key,n] of Object.entries(ledger?.accounts??{}))add(parseAccount(key).resource,'accounts',n);
    for(const [key,n] of Object.entries(ledger?.flows??{})){const {owner,resource}=parseAccount(key);add(resource,isSource(owner)?'sources':'sinks',n);}
    return out;
}
export function auditLedger(ledger){
    const errors=[];
    for(const [key,n] of Object.entries(ledger?.accounts??{}))if(!Number.isSafeInteger(n)||n<0)errors.push(`账户为负或非整数：${key}=${n}`);
    for(const [r,t] of Object.entries(ledgerTotals(ledger)))if(t.accounts!==t.sources-t.sinks)errors.push(`${r} 不守恒：账户 ${t.accounts} ≠ 源 ${t.sources} − 汇 ${t.sinks}`);
    return errors;
}
