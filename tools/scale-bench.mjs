import fs from 'node:fs/promises';
import{tmpRoot}from'./tmp-root.mjs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import {loadWorld} from './load-world.mjs';
import {benchmarkContext} from './benchmark-context.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches,atomicJSON,digest} from '../server-plugin/storage.mjs';
import {unfoldRemoteAt,seatLocation} from '../server-plugin/remote-generation.mjs';
import {unfoldPopulationAt,populationTemplate,settlePopulationLayers} from '../server-plugin/population.mjs';
import {startWar} from '../server-plugin/war-diplomacy.mjs';
import {advanceTribalAwakening} from '../server-plugin/tribal-awakening.mjs';
import {factionClockRules} from '../server-plugin/faction-clock.mjs';
import {advanceRegistry} from '../server-plugin/advance-registry.mjs';

// Tool-only instrumentation: never persisted and never used for budget claims.
// Collectors and their executions are separate so an empty candidate scan is
// visible instead of being mistaken for settlement cost.
export function scaleDiagnostics(){
    const rows={},restore=[],ticks=new Set();
    const wrap=(owner,key,label,transform=null,temporary=false)=>{
        const original=owner[key];if(typeof original!=='function')return;
        owner[key]=function(...args){
            const start=performance.now(),row=rows[label]??={calls:0,ms:0,candidates:0};row.calls++;
            try{const result=original.apply(this,args);return transform?transform(result,row,args):result;}
            finally{row.ms+=performance.now()-start;}
        };
        if(!temporary)restore.push(()=>{owner[key]=original;});
    };
    for(const system of advanceRegistry){
        wrap(system,'nextMinute',`${system.id}.next`);
        wrap(system,'advance',`${system.id}.advance`,(result,row,args)=>{ticks.add(args[2].after);return result;});
        wrap(system,'dueItems',`${system.id}.collect`,(items,row,args)=>{
            ticks.add(args[2].after);row.candidates+=items.length;
            for(const item of items)wrap(item,'execute',`${system.id}.execute`,null,true);
            return items;
        });
    }
    return {report:()=>({instrumented:true,ticks:ticks.size,systems:rows}),close:()=>{for(const reset of restore.reverse())reset();}};
}

// 5 seconds keeps a one-day rest bounded; the 30-day offline operation gets
// 120 seconds (4 seconds per day, amortizing fixed work). Scene generation
// must fit inside the existing 150ms request budget. 64MiB holds 35k roster
// identities plus the county skeletons without allowing unbounded snapshots.
// Existing commit/reconcile/1000-event limits stay in performance.test.mjs.
export const SCALE_BUDGETS=Object.freeze({dayMs:5000,monthMs:120000,sceneMs:150,promptMs:150,saveBytes:64*1024*1024});
export function scaleViolations(report){
    const out=[];
    for(const scope of ['core','large'])for(const [key,budget] of Object.entries(SCALE_BUDGETS)){
        const value=report[scope].metrics[key];if(value!==undefined&&value>budget)out.push({scope,key,value,budget});
    }
    return out;
}

// Ordinary changes to the fixture use the actual generation and ledger entry
// points. No profile drafting, model calls, or edits to the authored world.
export function fixtureDraft(document){
    return {document,get(...p){return p.reduce((v,k)=>v?.[k],this.document);},
        set(p,v){let at=this.document;for(const k of p.slice(0,-1))at=at[k]??={};at[p.at(-1)]=structuredClone(v);},
        remove(p){let at=this.document;for(const k of p.slice(0,-1))at=at?.[k];if(at)delete at[p.at(-1)];},say(){}};
}
export async function scaleFixture({counties=Infinity,world=null,activate=counties>0,compact=true}={}){
    world??=await loadWorld();const engine=new WorldEngine(world);
    const seed=JSON.parse(await fs.readFile(new URL('../tests/fixtures/legacy/seed.json',import.meta.url),'utf8'));
    const document=engine.createCharacter(seed,{},'p3-scale'),d=fixtureDraft(document);
    const selected=world.regions.filter(r=>r.category==='county').slice(0,counties);
    const stubs=selected.map(c=>seatLocation(world,c.id)).filter(Boolean);
    const navigator=Object.create(engine);navigator.remoteBase=engine;navigator.world={...world,locations:[...world.locations,...stubs]};
    for(const c of selected)unfoldRemoteAt(d,navigator,c.seat.location??seatLocation(world,c.id)?.id);
    let session=engine.scoped(document);
    if(counties)for(const p of session.world.settlementProfiles??[])for(const loc of Object.keys(populationTemplate(session.world,p.id)?.districts??{}))unfoldPopulationAt(d,session,loc);
    // Every configured tribal clock and U12 border campaign is live from the
    // fixture's first minute; all other systems retain their formal rules.
    if(activate){
        advanceTribalAwakening(d,session,{before:90*1440-1,after:90*1440});
        for(const source of session.rules.warDiplomacy?.sources??[])startWar(d,session,source,document.state.minute,`scale:${source.id}`);
    }
    session=engine.scoped(document);
    const scale={provinces:new Set(selected.map(c=>c.province)).size,counties:selected.length,
        generatedCounties:Object.keys(document.state.remote??{}).length,settlements:session.world.settlementProfiles.length,
        districts:Object.values(document.state.population??{}).reduce((n,p)=>n+Object.keys(p.districts).length,0),
        residents:Object.values(document.state.created??{}).filter(p=>p.generated==='population').length,
        simulatedNpcs:Object.keys(document.state.npcs).length,locations:session.world.locations.length,
        factionClocks:factionClockRules(session).length,hazards:session.rules.hazardClock?.clocks?.length??0,
        wars:Object.values(document.state.records).filter(r=>r.category==='war').length,
        tribes:Object.values(document.state.records).filter(r=>r.category==='tribal_awakening').length};
    if(compact)settlePopulationLayers(d,session);
    scale.storedResidents=Object.values(document.state.created??{}).filter(p=>p.generated==='population').length;
    session=engine.scoped(document);
    return {world,engine,document,session,scale};
}
export async function measureScale(fixture,{month=true,diagnostics=false,onlyMonth=false}={}){
    const {engine,document,world}=fixture,metrics={},hashes={};
    const timed=async(name,fn)=>{const start=performance.now(),v=await fn();metrics[name]=performance.now()-start;if(process.env.SCALE_TRACE==='1')console.log(name,metrics[name]);return v;};
    const heapBefore=process.memoryUsage().heapUsed;
    const diagnostic={};
    for(const [name,minutes] of (onlyMonth?[['monthMs',30*1440]]:[['turnMs',1],['dayMs',1440],...(month?[['monthMs',30*1440]]:[])])){
        const probe=diagnostics?scaleDiagnostics():null;
        let out;
        try{out=await timed(name,()=>engine.reduce(document,{tool:'world_time',args:{minutes},eventId:`scale-${name}`}));}
        finally{if(probe){diagnostic[name]=probe.report();probe.close();}}
        if(probe){
            const writes={};for(const p of out.patches){const key=p.path.slice(0,2).join('.');writes[key]=(writes[key]??0)+1;}
            diagnostic[name].patchWrites=writes;
        }
        hashes[name]=digest({patches:out.patches,result:out.result});
        if(name==='monthMs'||name==='dayMs'&&!month){
            const advanced=applyPatches(document,out.patches);metrics.advancedSaveBytes=Buffer.byteLength(JSON.stringify(advanced));
            metrics.quests=Object.keys(advanced.state.quests??{}).length;
        }
    }
    const context=await benchmarkContext({world,engine,document});metrics.promptMs=Math.max(...context.samples);metrics.sceneMs=Math.max(...context.sceneSamples);
    const json=await timed('serializeMs',()=>JSON.stringify(document));metrics.saveBytes=Buffer.byteLength(json);
    const dir=await fs.mkdtemp(path.join(tmpRoot(),'dnd-scale-'));
    try{
        await timed('writeMs',()=>atomicJSON(path.join(dir,'save.json'),document));
        const restored=await timed('readMs',async()=>JSON.parse(await fs.readFile(path.join(dir,'save.json'),'utf8')));
        if(digest(restored)!==digest(document))throw Error('存档读写不等价');
    }finally{await fs.rm(dir,{recursive:true,force:true});}
    metrics.heapGrowthBytes=process.memoryUsage().heapUsed-heapBefore;metrics.peakRssBytes=process.resourceUsage().maxRSS*1024;
    return {scale:fixture.scale,metrics,hashes,...(diagnostics?{diagnostic}:{})};
}
export async function scaleBench({counties=Infinity,month=true,diagnostics=false,onlyMonth=false}={}){
    const world=await loadWorld();
    const core=await measureScale(await scaleFixture({counties:0,world}),{month,diagnostics,onlyMonth});
    console.log('scale-bench: core complete');
    const full=await scaleFixture({counties,world});console.log('scale-bench: fixture',JSON.stringify(full.scale));
    const large=await measureScale(full,{month,diagnostics,onlyMonth});
    const report={node:process.version,budgets:SCALE_BUDGETS,scope:'正式生成与人口配额，无模型；真实工具/5000消息提示/原子存档读写；RSS为进程累计峰值',core,large};
    report.violations=scaleViolations(report);report.pass=!report.violations.length;return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
    const i=process.argv.indexOf('--counties'),report=await scaleBench({counties:i<0?Infinity:Number(process.argv[i+1]),month:!process.argv.includes('--no-month'),diagnostics:process.argv.includes('--diagnostics'),onlyMonth:process.argv.includes('--only-month')});
    const json=JSON.stringify(report,null,2)+'\n',o=process.argv.indexOf('--output');if(o>=0)await fs.writeFile(process.argv[o+1],json);console.log(json);
    if(!report.pass)process.exitCode=1;
}
