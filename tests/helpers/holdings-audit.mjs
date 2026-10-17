// S2a 持有对账辅助：比较旧字段应有的持有 / 实体 / 位置事实（holding-sources.legacyHoldings）与存储（document.holdings）。
//  holdingsView(engine, document)            → {legacy, store}：两边各自的 键 → 次数 / 事实
//  holdingsDiscrepancies(engine, a, b)       → 一次归约前后，旧字段的变化 ≠ 存储的变化的键（不受测试在两次归约之间直接改状态影响）
// 未开分区的文档，存储一边按旧字段计（懒开账：分区在第一次双写时才开出）。
// 作为 --import 预加载（HOLDINGS_AUDIT_LOG=<文件>）时包装 WorldEngine.reduce，把每个事件的差异追加到日志，供定位漏掉的写入点。
import fs from 'node:fs';
import {legacyHoldings} from '../../server-plugin/holding-sources.mjs';
import {auditHoldings} from '../../server-plugin/holdings.mjs';

const canon=v=>v===undefined||v===null?'':JSON.stringify(v,Object.keys(v).sort());
const hkey=h=>`${h.source}#${h.kind}|${h.variant??''}|${h.holder}|${h.subject}|${canon(h.terms)}`;
function count(list,key){const m=new Map();for(const x of list){const k=key(x);m.set(k,(m.get(k)??0)+1);}return m;}
function legacySide(engine,state){
    const {holdings,entities,locations}=legacyHoldings(engine,state);
    return {holdings:count(holdings,hkey),entities:new Map(entities.map(e=>[e.id,`${e.kind}|${canon(e.facts??{})}`])),locations:new Map(locations.map(l=>[l.entity,`${l.mode}@${l.at}`]))};
}
function storeSide(document){
    const h=document?.holdings;if(h?.version===undefined)return null;
    return {holdings:count(Object.values(h.rows).filter(r=>r.until===undefined),hkey),
        entities:new Map(Object.values(h.entities).filter(e=>e.goneAt===undefined).map(e=>[e.id,`${e.kind}|${canon(e.facts??{})}`])),
        locations:new Map(Object.entries(h.locations).map(([k,l])=>[k,`${l.mode}@${l.at}`]))};
}
export function holdingsView(engine,document){return {legacy:legacySide(engine,document.state),store:storeSide(document)};}
const deltaCount=(a,b)=>{const out=new Map();for(const k of new Set([...a.keys(),...b.keys()])){const n=(b.get(k)??0)-(a.get(k)??0);if(n)out.set(k,n);}return out;};
const deltaFact=(a,b)=>{const out=new Map();for(const k of new Set([...a.keys(),...b.keys()]))if(a.get(k)!==b.get(k))out.set(k,b.get(k)??null);return out;};
export function holdingsDiscrepancies(engine,before,after){
    const lb=legacySide(engine,before.state),la=legacySide(engine,after.state);
    const sb=storeSide(before)??lb,sa=storeSide(after)??sb,out=[];
    const dl=deltaCount(lb.holdings,la.holdings),ds=deltaCount(sb.holdings,sa.holdings);
    // 本事件里任一侧变过的键：存储已开时，事件后两侧应相等（双写把存储改成写入后的旧字段；测试夹具在两次归约之间
    // 直接改过旧字段、而本事件又写到它的，也由这次双写对齐，不算漏写）；存储未开时比较两侧的变化量。
    const opened=Boolean(storeSide(after));
    for(const k of new Set([...dl.keys(),...ds.keys()])){
        const miss=opened?(la.holdings.get(k)??0)!==(sa.holdings.get(k)??0):(dl.get(k)??0)!==(ds.get(k)??0);
        if(miss)out.push({holding:k,legacy:dl.get(k)??0,store:ds.get(k)??0,...((lb.holdings.get(k)??0)!==(sb.holdings.get(k)??0)?{preexisting:true}:{})});
    }
    // 实体与位置：存储在事件后应 = 事件前的存储 + 旧字段在本事件里的变化。
    for(const field of ['entities','locations']){
        const el=deltaFact(lb[field],la[field]),es=deltaFact(sb[field],sa[field]);
        for(const k of new Set([...el.keys(),...es.keys()])){
            const expected=el.has(k)?el.get(k):sb[field].get(k)??null,actual=sa[field].get(k)??null;
            if(expected!==actual)out.push({[field.slice(0,-1)]:k,legacy:expected,store:actual});
        }
    }
    return out;
}
export {auditHoldings};

const LOG=process.env.HOLDINGS_AUDIT_LOG;
if(LOG){
    const {WorldEngine}=await import('../../server-plugin/engine.mjs');
    const {applyPatches}=await import('../../server-plugin/storage.mjs');
    const original=WorldEngine.prototype.reduce;
    // 远方郡的存档由叠加世界的引擎归约（外层 reduce 委托给 overlay.reduce）：只审内层，那里的世界与写入时一致。
    const frames=[];
    WorldEngine.prototype.reduce=async function(document,input,options){
        const frame={nested:false};frames.push(frame);let out;
        try{out=await original.call(this,document,input,options);}finally{frames.pop();}
        if(frames.length)frames.at(-1).nested=true;
        if(frame.nested)return out;
        try{
            if(!document?.state||!out?.patches?.length)return out;
            const after=applyPatches(document,out.patches);
            // 迁移事件（schema / release / rules_state）直接改旧字段且不开账：尚未开分区时，下一个双写按当时的旧字段开账，
            // 迁移本身没有漏写可言；已开分区时迁移按世界版本更新同一入口折算，照常审。
            if(!after.holdings&&/migration/.test(input.type??''))return out;
            const bad=holdingsDiscrepancies(this,document,after);
            const prior=new Set(auditHoldings({peek:(...p)=>p.reduce((v,k)=>v?.[k],document)})),audit=auditHoldings({peek:(...p)=>p.reduce((v,k)=>v?.[k],after)}).filter(e=>!prior.has(e));
            // 适配器被注册形状拒绝而记下的漂移（旧字段仍是权威，存储缺这一条）。
            const drift=(after.holdings?.drift??[]).slice((document.holdings?.drift??[]).length);
            if(bad.length||audit.length||drift.length||process.env.HOLDINGS_AUDIT_ALL)fs.appendFileSync(LOG,JSON.stringify({test:process.argv.at(-1),tool:input.tool??input.type,op:input.args?.operation??input.args?.choice??input.args?.action??null,eventId:input.eventId,bad:bad.slice(0,12),audit:audit.slice(0,5),drift:drift.slice(0,5)})+'\n');
        }catch(e){fs.appendFileSync(LOG,JSON.stringify({tool:input.tool,eventId:input.eventId,error:String(e.stack??e).slice(0,1500)})+'\n');}
        return out;
    };
}
