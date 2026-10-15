import fs from 'node:fs/promises';
import path from 'node:path';
import {planNpcAutonomy}from'../tools/npc-autonomy-planner.mjs';
import {digest}from'./storage.mjs';
import {personSimulation}from'./entity-view.mjs';

// Planning is outside the reducer. Only its frozen, validated response enters
// the ordinary event log, so rewind and replay never make a model request.
export async function settleNpcPlanning(store,campaignId,{anchor=null,planner=planNpcAutonomy,enabled=Boolean(process.env.DEEPSEEK_API_KEY),options={}}={}){
    if(!enabled)return{status:'disabled'};
    const view=await store.read(campaignId),document=view.document;
    if(document.releaseVersion!==1)return{status:'unavailable'};
    const day=Math.floor(document.state.minute/1440);
    if(document.state.npcPlanning?.day===day)return{status:'already_planned'};
    const engine=await store.worldRegistry.get(document.worldHash);
    const current=engine.scoped(document);
    if(Object.keys(document.state.npcs).filter(id=>personSimulation(current,document.state,id).value).length<8)return{status:'unavailable'};
    const directory=path.join(store.directory(campaignId),'npc-planning');
    await fs.mkdir(directory,{recursive:true});
    const result=await planner(current,document,{...options,ledgerFile:path.join(directory,'budget.json')});
    if(!result.input)return{status:result.status,reason:result.reason};
    const eventId=`npc_plan_${digest(result.input.plan).slice(0,24)}_${view.reference.sequence}`;
    const saved=await store.transact(campaignId,{id:eventId,input:{...result.input,eventId},anchor,expectedSequence:view.reference.sequence},store.reducer);
    return{status:'applied',eventId,reference:saved.reference,measurement:result.measurement};
}
