// S2a 持有对账辅助：比较旧字段应有的持有 / 实体 / 位置事实（holding-sources）与存储（document.holdings）。
//  holdingsDiscrepancies(engine, a, b, patches?) → 一次归约里旧字段与存储不一致的键（漏写）。
//    给出补丁时只比对本事件写到的来源单元（快，审计预加载用）；不给时比对全部单元（对账测试用）。
//    存储已开：事件后两侧应相等（双写把存储改成写入后的旧字段；测试夹具在两次归约之间直接改过旧字段、
//    而本事件又写到它的，也由这次双写对齐）。存储未开：比较两侧的变化量（未开时存储一侧按旧字段计）。
// 作为 --import 预加载（HOLDINGS_AUDIT_LOG=<文件>）时包装 WorldEngine.reduce，把每个事件的差异、
// 被注册形状拒绝而记下的漂移与 I8 审计违例追加到日志，供定位漏掉的写入点。
import fs from 'node:fs';
import {legacyHoldings,touchedUnits,legacyOfUnit,unitsOfSource} from '../../server-plugin/holding-sources.mjs';
import {auditHoldings} from '../../server-plugin/holdings.mjs';

const canon=v=>v===undefined||v===null?'':JSON.stringify(v,Object.keys(v).sort());
const hkey=h=>`${h.source}#${h.kind}|${h.variant??''}|${h.holder}|${h.subject}|${canon(h.terms)}`;
function count(list,key){const m=new Map();for(const x of list){const k=key(x);m.set(k,(m.get(k)??0)+1);}return m;}
const entityValue=e=>`${e.kind}|${canon(e.facts??{})}`,locationValue=l=>`${l.mode}@${l.at}`;
function sideOf({holdings,entities,locations}){return {holdings:count(holdings,hkey),entities:new Map(entities.map(e=>[e.id,entityValue(e)])),locations:new Map(locations.map(l=>[l.entity,locationValue(l)]))};}
function legacySide(engine,state,scope=null){
    if(!scope)return sideOf(legacyHoldings(engine,state));
    const all={holdings:[],entities:[],locations:[]},ctx={};
    for(const [name,units] of scope)for(const unit of units){const o=legacyOfUnit(engine,state,name,unit,ctx);all.holdings.push(...o.holdings);all.entities.push(...o.entities);all.locations.push(...o.locations);}
    return sideOf(all);
}
function storeSide(document,scope=null){
    const h=document?.holdings;if(h?.version===undefined)return null;
    const inScope=source=>!scope||scope.has(source);
    return {holdings:count(Object.values(h.rows).filter(r=>r.until===undefined&&inScope(r.source)),hkey),
        entities:new Map(Object.values(h.entities).filter(e=>e.goneAt===undefined&&inScope(e.source)).map(e=>[e.id,entityValue(e)])),
        locations:new Map(Object.entries(h.locations).filter(([,l])=>inScope(l.source)).map(([k,l])=>[k,locationValue(l)]))};
}
// 补丁触及的单元，展开整源（null）为该源的全部单元（事件前后与存储里出现过的）。
function scopeOf(engine,before,after,patches){
    const touched=touchedUnits(patches,before,after),scope=new Map();
    for(const [name,units] of touched){
        let list=units;
        if(units===null){
            list=new Set([...unitsOfSource(engine,before.state,name),...unitsOfSource(engine,after.state,name)]);
            for(const doc of [before,after])for(const r of Object.values(doc.holdings?.rows??{}))if(r.source?.startsWith(`${name}:`))list.add(r.source.slice(name.length+1));
        }
        scope.set(name,[...list]);
    }
    const keys=new Set();for(const [name,units] of scope)for(const u of units)keys.add(`${name}:${u}`);
    return {scope,keys};
}
const deltaCount=(a,b)=>{const out=new Map();for(const k of new Set([...a.keys(),...b.keys()])){const n=(b.get(k)??0)-(a.get(k)??0);if(n)out.set(k,n);}return out;};
export function holdingsDiscrepancies(engine,before,after,patches=null){
    let scope=null,keys=null;
    if(patches){({scope,keys}=scopeOf(engine,before,after,patches));if(!scope.size)return [];}
    const la=legacySide(engine,after.state,scope),sa=storeSide(after,keys),out=[];
    if(sa){
        // 实体可由别的单元先提到：按编号比对，不按来源筛（scope 内旧字段提到的实体都要在存储里）。
        const ents=after.holdings.entities;
        for(const k of new Set([...la.holdings.keys(),...sa.holdings.keys()]))if((la.holdings.get(k)??0)!==(sa.holdings.get(k)??0))out.push({holding:k,legacy:la.holdings.get(k)??0,store:sa.holdings.get(k)??0});
        for(const [id,v] of la.entities){const e=ents[id];const got=e&&e.goneAt===undefined?entityValue(e):null;if(got!==v)out.push({entity:id,legacy:v,store:got});}
        for(const [id,v] of sa.entities)if(!la.entities.has(id))out.push({entity:id,legacy:null,store:v});
        for(const k of new Set([...la.locations.keys(),...sa.locations.keys()]))if((la.locations.get(k)??null)!==(sa.locations.get(k)??null))out.push({location:k,legacy:la.locations.get(k)??null,store:sa.locations.get(k)??null});
        return out;
    }
    // 存储未开：比较变化量。
    const lb=legacySide(engine,before.state,scope),dl=deltaCount(lb.holdings,la.holdings);
    for(const [k,n] of dl)out.push({holding:k,legacy:n,store:0,unopened:true});
    for(const f of ['entities','locations'])for(const k of new Set([...lb[f].keys(),...la[f].keys()]))if(lb[f].get(k)!==la[f].get(k))out.push({[f.slice(0,-1)]:k,legacy:la[f].get(k)??null,store:lb[f].get(k)??null,unopened:true});
    return out;
}
export {auditHoldings};

const LOG=process.env.HOLDINGS_AUDIT_LOG;
if(LOG){
    const {WorldEngine}=await import('../../server-plugin/engine.mjs');
    const {applyPatches}=await import('../../server-plugin/storage.mjs');
    const {remoteEngine}=await import('../../server-plugin/remote-generation.mjs');
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
            // 旧字段按事件后的世界视图读：本事件生成了远方郡时，事件后的叠加世界才含新居民。
            const viewEngine=remoteEngine(this,after,world=>new WorldEngine(world));
            const bad=holdingsDiscrepancies(viewEngine,document,after,out.patches);
            const view=doc=>({peek:(...p)=>p.reduce((v,k)=>v?.[k],doc)});
            const prior=new Set(auditHoldings(view(document))),audit=auditHoldings(view(after)).filter(e=>!prior.has(e));
            // 适配器被注册形状拒绝而记下的漂移（旧字段仍是权威，存储缺这一条）。
            const drift=(after.holdings?.drift??[]).slice((document.holdings?.drift??[]).length);
            if(bad.length||audit.length||drift.length||process.env.HOLDINGS_AUDIT_ALL)fs.appendFileSync(LOG,JSON.stringify({test:process.argv.at(-1),tool:input.tool??input.type,op:input.args?.operation??input.args?.choice??input.args?.action??null,eventId:input.eventId,bad:bad.slice(0,12),audit:audit.slice(0,5),drift:drift.slice(0,5)})+'\n');
        }catch(e){fs.appendFileSync(LOG,JSON.stringify({tool:input.tool,eventId:input.eventId,error:String(e.stack??e).slice(0,1500)})+'\n');}
        return out;
    };
}
