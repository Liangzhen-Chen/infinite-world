import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {loadWorld} from '../tools/load-world.mjs';
import {validateWorld} from '../tools/validate-world.mjs';
import {withFarmPests} from '../world/design/farm-pests-foundation.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches,CampaignStorage} from '../server-plugin/storage.mjs';
import {planFarmPestsMigration} from '../server-plugin/farm-pests-migration.mjs';
import {toolResultWithClock} from '../extension/turn.mjs';
const legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),source=await loadWorld();
delete source.rules.wildlife.farmPests;
const farm=c=>c.state.records['agriculture:loc_hw'],pool=(c,species,habitat)=>c.state.records[`ecology:${habitat}`].populations[species];
const mouse='monster_mottled_field_mouse',fox='monster_red_ear_fox',field='habitat_hw_field',wood='habitat_hw_wood';
function setup(seed='farm-pests-test',world=withFarmPests(source)){
    const engine=new WorldEngine(world),c=engine.createCharacter(legacy,{},seed);
    const run=async(doc,tool,args,id)=>{const out=await engine.reduce(doc,{tool,args,eventId:id});return{document:applyPatches(doc,out.patches),result:out.result};};return{engine,c,run,world};
}
async function wait(run,c,minutes,id){return(await run(c,'world_time',{minutes},id)).document;}
function conservation(c){
    const r=farm(c),s=c.state.settlements.loc_hw,l=r.ledger;
    assert.equal(l.openingFood+l.openingSeed+l.freshProduced+l.harvested+l.donated,s.food+r.field.seedBank+l.eaten+l.spoiled+l.overflow+l.seedSpent+l.sold);
    assert.equal(l.potentialHarvested,l.harvested+l.pestLost);assert.equal(r.batches.reduce((n,b)=>n+b.amount,0),s.food);
    for(const r of Object.values(c.state.records).filter(r=>r.category==='ecology'))for(const p of Object.values(r.populations))assert.equal(p.initial+p.born+(p.arisen??0)+(p.immigrated??0)-p.predated-p.starved-p.withdrawn-(p.emigrated??0),p.count);
}
async function year(run,c,label){for(let i=0;i<12;i++)c=await wait(run,c,30*1440,`${label}${i}`);return c;}
function rodentsAtCapacity(c){const p=pool(c,mouse,field);p.born+=24-p.count;p.count=24;}
async function growing(set){
    let c=await wait(set.run,set.c,10*1440,'grow');c.state.location='loc_hw_fields';assert.ok(farm(c).field.cohorts.length>0);rodentsAtCapacity(c);return c;
}
// R31: farm-pests.test.mjs 拆成四个可并行的文件，共用此夹具（逐字取自原文件头部）。
export {legacy,source,farm,pool,mouse,fox,field,wood,setup,wait,conservation,year,rodentsAtCapacity,growing};
