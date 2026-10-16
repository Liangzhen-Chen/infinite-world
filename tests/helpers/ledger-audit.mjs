// S1a/S1b 对账辅助：比较旧字段余额（货币 money.legacyMoney、物品与库存 stock.legacyStock）与新账本账户。
//  reconcile(engine, document)      → 全部账户差异（旧 ≠ 新）、批次差异、漂移记录与守恒审计
//  eventDiscrepancies(engine, a, b)  → 一次归约前后，旧余额变化 ≠ 新账户变化的账户（不受测试直接改状态影响）
//  flowDelta(a, b, resource?)        → 一次归约的源净流入与汇流出（给出资源时只计该资源）
//  conservation(engine, a, b)        → 逐资源 Δ总量 − (源 − 汇) 不为零的资源
// 作为 --import 预加载（LEDGER_AUDIT_LOG=<文件>）时包装 WorldEngine.reduce，把每个事件的差异追加到日志，供定位漏掉的写入点。
import fs from 'node:fs';
import {legacyMoney} from '../../server-plugin/money.mjs';
import {legacyStock} from '../../server-plugin/stock.mjs';
import {parseAccount,isSource,isSink,auditLedger} from '../../server-plugin/ledger.mjs';

export function legacyBooks(engine,state){
    const money=legacyMoney(engine,state),{balances,lots}=legacyStock(engine,state);
    return {balances:new Map([...money,...balances]),lots};
}
// 批次按 (入库日, 到期日, 类别) 聚合比较：编号是账本内部的，不与旧批次编号对应。
const lotShape=list=>{const m=new Map();for(const l of list??[]){const k=`${l.day??'-'}/${l.expiresDay??'-'}/${l.kind??'-'}`;m.set(k,(m.get(k)??0)+l.qty);}return JSON.stringify([...m].sort(([a],[b])=>a<b?-1:1));};
export function reconcile(engine,document){
    const {balances:legacy,lots}=legacyBooks(engine,document.state),accounts=document.ledger?.accounts??{},out=[],lotMismatches=[];
    for(const key of new Set([...legacy.keys(),...Object.keys(accounts)])){
        const old=legacy.get(key)??0,now=accounts[key]??0;
        if(old!==now)out.push({account:key,legacy:old,ledger:now});
    }
    for(const [key,list] of lots){const a=lotShape(list),b=lotShape(document.ledger?.lots?.[key]);if(a!==b)lotMismatches.push({account:key,legacy:a,ledger:b});}
    return {mismatches:out.sort((a,b)=>a.account<b.account?-1:1),lots:lotMismatches,drift:document.ledger?.drift??[],audit:auditLedger(document.ledger)};
}
export function eventDiscrepancies(engine,before,after){
    const lb=legacyBooks(engine,before.state).balances,la=legacyBooks(engine,after.state).balances,ab=before.ledger?.accounts??{},aa=after.ledger?.accounts??{},out=[];
    const opened=!before.ledger,stockOpened=!opened&&!(before.ledger.scopes??['coin']).includes('stock');
    const isStock=key=>parseAccount(key).resource!=='coin_river';
    for(const key of new Set([...lb.keys(),...la.keys(),...Object.keys(ab),...Object.keys(aa)])){
        const fresh=opened||stockOpened&&isStock(key);
        const legacy=(la.get(key)??0)-(lb.get(key)??0),books=(aa[key]??0)-(fresh?(lb.get(key)??0):(ab[key]??0));
        if(legacy!==books)out.push({account:key,legacy,ledger:books});
    }
    return out;
}
export function flowDelta(before,after,resource=null){
    const fb=before.ledger?.flows??{},fa=after.ledger?.flows??{},out={sources:0,sinks:0,byFlow:{}};
    for(const key of new Set([...Object.keys(fb),...Object.keys(fa)])){
        const n=(fa[key]??0)-(fb[key]??0);if(!n)continue;
        const {owner,resource:r}=parseAccount(key);if(resource&&r!==resource)continue;
        out.byFlow[key]=n;
        if(isSource(owner))out.sources+=n;else if(isSink(owner))out.sinks+=n;
    }
    return out;
}
export const legacyTotal=(engine,state,resource='coin_river')=>{let n=0;for(const [k,v] of legacyBooks(engine,state).balances)if(parseAccount(k).resource===resource)n+=v;return n;};
// 逐资源：Δ旧总量（开账事件从零算起）= 源净流入 − 汇流出。
export function conservation(engine,before,after){
    const total=state=>{const m=new Map();for(const [k,v] of legacyBooks(engine,state).balances){const r=parseAccount(k).resource;m.set(r,(m.get(r)??0)+v);}return m;};
    const tb=before.ledger?total(before.state):new Map(),ta=total(after.state),flows=new Map();
    const fb=before.ledger?.flows??{},fa=after.ledger?.flows??{};
    for(const key of new Set([...Object.keys(fb),...Object.keys(fa)])){
        const n=(fa[key]??0)-(fb[key]??0);if(!n)continue;const {owner,resource}=parseAccount(key);
        flows.set(resource,(flows.get(resource)??0)+(isSource(owner)?n:isSink(owner)?-n:0));
    }
    const out=[];
    for(const r of new Set([...tb.keys(),...ta.keys(),...flows.keys()])){const delta=(ta.get(r)??0)-(tb.get(r)??0),net=flows.get(r)??0;if(delta!==net)out.push({resource:r,delta,net});}
    return out;
}

const LOG=process.env.LEDGER_AUDIT_LOG;
if(LOG){
    const {WorldEngine}=await import('../../server-plugin/engine.mjs');
    const {applyPatches}=await import('../../server-plugin/storage.mjs');
    const original=WorldEngine.prototype.reduce;
    WorldEngine.prototype.reduce=async function(document,input,options){
        const out=await original.call(this,document,input,options);
        try{
            if(!document?.state||!out?.patches?.length)return out;
            const after=applyPatches(document,out.patches);if(!after.ledger)return out;
            const bad=eventDiscrepancies(this,document,after),drift=(after.ledger.drift??[]).length-(document.ledger?.drift??[]).length;
            const prior=new Set(auditLedger(document.ledger)),audit=auditLedger(after.ledger).filter(e=>!prior.has(e));
            // 事件前旧字段与账本就已不等的账户（测试在两次归约之间直接改了状态）标为 preexisting，便于和漏记区分。
            if(document.ledger&&bad.length){const lb=legacyBooks(this,document.state).balances;for(const b of bad)if((lb.get(b.account)??0)!==(document.ledger.accounts?.[b.account]??0))b.preexisting=true;}
            if(bad.length||drift>0||audit.length)fs.appendFileSync(LOG,JSON.stringify({test:process.argv.at(-1),tool:input.tool??input.type,op:input.args?.operation??input.args?.choice??null,eventId:input.eventId,bad:bad.slice(0,12),drift:(after.ledger.drift??[]).slice(-Math.max(0,drift)),audit:audit.slice(0,5)})+'\n');
        }catch(e){fs.appendFileSync(LOG,JSON.stringify({tool:input.tool,error:String(e.stack??e)})+'\n');}
        return out;
    };
}
