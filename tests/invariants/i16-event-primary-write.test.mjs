// I16 事件主写（02 §I16）：每个状态变化都对应事件日志里的一个事件及其原语列表；从快照 + 事件可重建状态。
// 性质：随机真实动作经 CampaignStorage 提交后，(1) 每个改变了存档的动作恰有一个事件，且事件的补丁覆盖存档所有变化的分区；
// (2) 被拒动作不留事件、不改存档；(3) 初始快照 + 日志补丁折叠 = 实时存档 = 冷启动重放（走真实归约器）= 导出再导入。
// 反例：在测试内丢掉一个事件的补丁，折叠结果必须与实时存档不同；篡改补丁后导入被拒。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import fc from 'fast-check';
import {tmpRoot} from '../../tools/tmp-root.mjs';
import {CampaignStorage,applyPatches,canonical} from '../../server-plugin/storage.mjs';
import {campaign,actionArb} from '../helpers/invariant-campaign.mjs';

const SEED=1016,RUNS=4,STEPS=8;
const roots=patches=>new Set(patches.map(p=>p.path[0]));
const changedRoots=(a,b)=>[...new Set([...Object.keys(a),...Object.keys(b)])].filter(k=>canonical(a[k])!==canonical(b[k]));
const fold=(initial,events)=>events.filter(e=>e.kind==='action').reduce((doc,e)=>applyPatches(doc,e.patches),initial);

async function play(actions,label){
    const c=campaign(label),reducer=c.engine.reduce.bind(c.engine);
    const directory=await fs.mkdtemp(path.join(tmpRoot(),`i16-${label}-`));
    const store=new CampaignStorage(directory,{reducer,snapshotEvery:3});
    await store.create({id:label,worldVersion:'i16',document:c.doc});
    const initial=structuredClone(c.doc);
    for(const [i,action] of actions.entries()){
        const view=await store.read(label),before=view.document,seqBefore=view.reference.sequence;
        let ok=true;
        try{await store.transact(label,{id:`${label}-${i}`,input:{tool:action.tool,args:action.args,eventId:`${label}-${i}`}},reducer);}catch{ok=false;}
        const after=await store.read(label),events=(await store.export(label)).events;
        if(!ok){assert.equal(after.reference.sequence,seqBefore,`步 ${i}：被拒动作不留事件`);assert.equal(canonical(after.document),canonical(before),`步 ${i}：被拒动作不改存档`);continue;}
        assert.equal(after.reference.sequence,seqBefore+1,`步 ${i}：一个动作恰一个事件`);
        const event=events.at(-1),moved=changedRoots(before,after.document),covered=roots(event.patches);
        for(const k of moved)assert.ok(covered.has(k),`步 ${i}：分区 ${k} 变了但事件补丁没有覆盖`);
    }
    return {store,directory,reducer,initial,label};
}

test('I16 性质：改变存档的动作都有事件及补丁覆盖；快照 + 事件折叠 = 实时 = 冷启动重放 = 导出再导入',{timeout:3000000},async()=>{
    await fc.assert(fc.asyncProperty(fc.array(actionArb,{minLength:STEPS,maxLength:STEPS}),fc.integer({min:0,max:1e9}),async(actions,tag)=>{
        const label=`i16p${tag}`,run=await play(actions,label);
        try{
            const live=(await run.store.read(label)).document,bundle=await run.store.export(label);
            assert.equal(canonical(fold(run.initial,bundle.events)),canonical(live),'补丁折叠 = 实时存档');
            const fresh=new CampaignStorage(run.directory,{reducer:run.reducer});
            assert.equal(canonical((await fresh.read(label)).document),canonical(live),'冷启动重放 = 实时存档');
            const imported=await fresh.import(JSON.parse(JSON.stringify(bundle)),`${label}-copy`);
            assert.equal(canonical(imported.document),canonical(live),'导出再导入 = 实时存档');
        }finally{await fs.rm(run.directory,{recursive:true,force:true});}
        return true;
    }),{seed:SEED,numRuns:RUNS});
});

test('I16 反例：丢掉一个事件的补丁，折叠结果与实时存档不同；篡改补丁的导入被拒',{timeout:600000},async()=>{
    const actions=[{tool:'world_time',args:{minutes:600}},{tool:'world_trade',args:{seller:'npc_hw_linsui',item:'item_bread',quantity:1}},{tool:'world_move',args:{destination:'bld_hw_post'}}];
    const run=await play(actions,'i16neg');
    try{
        const live=(await run.store.read('i16neg')).document,bundle=await run.store.export('i16neg');
        const acting=bundle.events.filter(e=>e.kind==='action'&&e.patches.length);
        assert.ok(acting.length>=2,'前提：至少两个事件带补丁');
        assert.equal(canonical(fold(run.initial,bundle.events)),canonical(live));
        const dropped=structuredClone(bundle.events);dropped.find(e=>e.sequence===acting[0].sequence).patches=[];
        assert.notEqual(canonical(fold(run.initial,dropped)),canonical(live),'缺一个事件的原语就不能重建状态');
        const forged=JSON.parse(JSON.stringify(bundle));forged.events.find(e=>e.sequence===acting[0].sequence).patches=[];
        const fresh=new CampaignStorage(run.directory,{reducer:run.reducer});
        await assert.rejects(fresh.import(forged,'i16neg-forged'),/校验失败|不一致/);
    }finally{await fs.rm(run.directory,{recursive:true,force:true});}
});
