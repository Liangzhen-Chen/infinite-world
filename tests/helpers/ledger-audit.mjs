// S1a 对账辅助：比较旧字段余额与新账本账户。
//  reconcile(engine, document)      → 全部账户差异（旧 ≠ 新）与漂移记录
//  eventDiscrepancies(engine, a, b)  → 一次归约前后，旧余额变化 ≠ 新账户变化的账户（不受测试直接改状态影响）
//  flowDelta(a, b)                   → 一次归约的源净流入与汇流出
// 作为 --import 预加载（LEDGER_AUDIT_LOG=<文件>）时包装 WorldEngine.reduce，把每个事件的差异追加到日志，供定位漏掉的写入点。
import fs from 'node:fs';
import {legacyMoney} from '../../server-plugin/money.mjs';
import {parseAccount,isSource,isSink,auditLedger} from '../../server-plugin/ledger.mjs';

export function reconcile(engine,document){
    const legacy=legacyMoney(engine,document.state),accounts=document.ledger?.accounts??{},out=[];
    for(const key of new Set([...legacy.keys(),...Object.keys(accounts)])){
        const old=legacy.get(key)??0,now=accounts[key]??0;
        if(old!==now)out.push({account:key,legacy:old,ledger:now});
    }
    return {mismatches:out.sort((a,b)=>a.account<b.account?-1:1),drift:document.ledger?.drift??[],audit:auditLedger(document.ledger)};
}
export function eventDiscrepancies(engine,before,after){
    const lb=legacyMoney(engine,before.state),la=legacyMoney(engine,after.state),ab=before.ledger?.accounts??{},aa=after.ledger?.accounts??{},out=[];
    const opened=!before.ledger;
    for(const key of new Set([...lb.keys(),...la.keys(),...Object.keys(ab),...Object.keys(aa)])){
        const legacy=(la.get(key)??0)-(lb.get(key)??0),books=(aa[key]??0)-(opened?(lb.get(key)??0):(ab[key]??0));
        if(legacy!==books)out.push({account:key,legacy,ledger:books});
    }
    return out;
}
export function flowDelta(before,after){
    const fb=before.ledger?.flows??{},fa=after.ledger?.flows??{},out={sources:0,sinks:0,byFlow:{}};
    for(const key of new Set([...Object.keys(fb),...Object.keys(fa)])){
        const n=(fa[key]??0)-(fb[key]??0);if(!n)continue;
        const {owner}=parseAccount(key);out.byFlow[key]=n;
        if(isSource(owner))out.sources+=n;else if(isSink(owner))out.sinks+=n;
    }
    return out;
}
export const legacyTotal=(engine,state)=>[...legacyMoney(engine,state).values()].reduce((a,b)=>a+b,0);

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
            if(bad.length||drift>0)fs.appendFileSync(LOG,JSON.stringify({test:process.argv.at(-1),tool:input.tool??input.type,op:input.args?.operation??input.args?.choice??null,eventId:input.eventId,bad:bad.slice(0,12),drift:(after.ledger.drift??[]).slice(-Math.max(0,drift))})+'\n');
        }catch(e){fs.appendFileSync(LOG,JSON.stringify({tool:input.tool,error:String(e.stack??e)})+'\n');}
        return out;
    };
}
