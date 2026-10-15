import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import {loadWorld} from './load-world.mjs';
import {benchmarkContext} from './benchmark-context.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches,atomicJSON,digest} from '../server-plugin/storage.mjs';
import {unfoldRemoteAt,seatLocation} from '../server-plugin/remote-generation.mjs';
import {unfoldPopulationAt,populationTemplate} from '../server-plugin/population.mjs';
import {startWar} from '../server-plugin/war-diplomacy.mjs';
import {advanceTribalAwakening} from '../server-plugin/tribal-awakening.mjs';
import {factionClockRules} from '../server-plugin/faction-clock.mjs';

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
export async function scaleFixture({counties=Infinity,world=null,activate=counties>0}={}){
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
    return {world,engine,document,session,scale:{provinces:new Set(selected.map(c=>c.province)).size,counties:selected.length,
        generatedCounties:Object.keys(document.state.remote??{}).length,settlements:session.world.settlementProfiles.length,
        districts:Object.values(document.state.population??{}).reduce((n,p)=>n+Object.keys(p.districts).length,0),
        residents:Object.values(document.state.created??{}).filter(p=>p.generated==='population').length,
        simulatedNpcs:Object.keys(document.state.npcs).length,locations:session.world.locations.length,
        factionClocks:factionClockRules(session).length,hazards:session.rules.hazardClock?.clocks?.length??0,
        wars:Object.values(document.state.records).filter(r=>r.category==='war').length,
        tribes:Object.values(document.state.records).filter(r=>r.category==='tribal_awakening').length}};
}
export async function measureScale(fixture,{month=true}={}){
    const {engine,document,world}=fixture,metrics={},hashes={};
    const timed=async(name,fn)=>{const start=performance.now(),v=await fn();metrics[name]=performance.now()-start;if(process.env.SCALE_TRACE==='1')console.log(name,metrics[name]);return v;};
    const heapBefore=process.memoryUsage().heapUsed;
    for(const [name,minutes] of [['turnMs',1],['dayMs',1440],...(month?[['monthMs',30*1440]]:[])]){
        const out=await timed(name,()=>engine.reduce(document,{tool:'world_time',args:{minutes},eventId:`scale-${name}`}));
        hashes[name]=digest({patches:out.patches,result:out.result});
        if(name==='monthMs'||name==='dayMs'&&!month){
            const advanced=applyPatches(document,out.patches);metrics.advancedSaveBytes=Buffer.byteLength(JSON.stringify(advanced));
            metrics.quests=Object.keys(advanced.state.quests??{}).length;
        }
    }
    const context=await benchmarkContext({world,engine,document});metrics.promptMs=Math.max(...context.samples);metrics.sceneMs=Math.max(...context.sceneSamples);
    const json=await timed('serializeMs',()=>JSON.stringify(document));metrics.saveBytes=Buffer.byteLength(json);
    const dir=await fs.mkdtemp(path.join(os.tmpdir(),'dnd-scale-'));
    try{
        await timed('writeMs',()=>atomicJSON(path.join(dir,'save.json'),document));
        const restored=await timed('readMs',async()=>JSON.parse(await fs.readFile(path.join(dir,'save.json'),'utf8')));
        if(digest(restored)!==digest(document))throw Error('存档读写不等价');
    }finally{await fs.rm(dir,{recursive:true,force:true});}
    metrics.heapGrowthBytes=process.memoryUsage().heapUsed-heapBefore;metrics.peakRssBytes=process.resourceUsage().maxRSS*1024;
    return {scale:fixture.scale,metrics,hashes};
}
export async function scaleBench({counties=Infinity,month=true}={}){
    const world=await loadWorld();
    const core=await measureScale(await scaleFixture({counties:0,world}),{month});
    console.log('scale-bench: core complete');
    const full=await scaleFixture({counties,world});console.log('scale-bench: fixture',JSON.stringify(full.scale));
    const large=await measureScale(full,{month});
    const report={node:process.version,budgets:SCALE_BUDGETS,scope:'正式生成与人口配额，无模型；真实工具/5000消息提示/原子存档读写；RSS为进程累计峰值',core,large};
    report.violations=scaleViolations(report);report.pass=!report.violations.length;return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
    const i=process.argv.indexOf('--counties'),report=await scaleBench({counties:i<0?Infinity:Number(process.argv[i+1]),month:!process.argv.includes('--no-month')});
    const json=JSON.stringify(report,null,2)+'\n',o=process.argv.indexOf('--output');if(o>=0)await fs.writeFile(process.argv[o+1],json);console.log(json);
    if(!report.pass)process.exitCode=1;
}
