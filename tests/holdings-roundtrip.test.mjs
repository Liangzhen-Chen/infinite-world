// S2a 持有与实体化对象的存档往返（参照 R25 save-roundtrip）：组织、议案、首领职位、商号租铺与雇工等写入持有存储后，
// 导出→导入、写盘→新进程读盘，持有分区（持有、实体、位置事实、序号）逐字段一致；继续推进后与未中断的存档一致，
// 旧字段与存储仍对账一致。不调用模型。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpRoot} from '../tools/tmp-root.mjs';
import {loadWorld} from '../tools/load-world.mjs';
import {createPlaytestServer} from '../tools/playtest-runner.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {reconcileHoldings,reconciled} from '../server-plugin/holding-sources.mjs';
import {digest} from '../server-plugin/storage.mjs';

const DAY=1440,INN='bld_hw_qingdeng',LANDLORD='npc_hw_linsui',WORKER='npc_hw_ayan',SEED='s2a-holdings-roundtrip';
const world=await loadWorld();
for(const npc of world.npcs.filter(n=>n.id===WORKER))npc.schedule={default:[{start:0,end:DAY,location:INN,activity:'休息',services:[]}]};
const engine=new WorldEngine(world);

async function tempDir(t){const dir=await fs.mkdtemp(path.join(tmpRoot(),'s2a-holdings-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}
async function open(t,directory){const server=await createPlaytestServer({world,seed:SEED,consistencyEnabled:false,directory});let closed=false;const close=async()=>{if(!closed){closed=true;await server.close();}};t.after(close);return {...server,close};}
function session(server,campaignId){
    const read=async()=>(await server.api('read',{campaignId})).document;
    const execute=async(tool,args,eventId)=>{const view=await server.api('read',{campaignId});return (await server.api('execute',{campaignId,tool,args,eventId,anchor:null,expectedSequence:view.reference.sequence})).result;};
    return {campaignId,read,execute,exportBundle:()=>server.api('export',{campaignId})};
}
async function createCampaign(server){
    const {reference}=await server.api('create',{character:{name:'往返者'}});
    const bundle=await server.api('export',{campaignId:reference.campaignId}),initial=structuredClone(bundle.initial),s=initial.state;
    s.minute=600;s.location=INN;s.player.coins=800;s.npcs[WORKER].location=INN;s.npcs[WORKER].activity='休息';s.npcs[WORKER].coins=100;
    const hash=digest(initial),imported=await server.api('import',{bundle:{...bundle,initial,events:[],metadata:{...bundle.metadata,initialHash:hash},checksum:hash,documentHash:hash}});
    return session(server,imported.reference.campaignId);
}
async function scenario(s){
    const org=(await s.execute('world_create',{type:'org',name:'灯桥互助会',data:{notes:'账目公开',occupation:'行会'}},'found')).organization;
    await s.execute('world_settlement',{operation:'org_propose',org,action:'charter',cost:5},'fee');
    const apply=await s.execute('world_settlement',{operation:'org_join',org,member:WORKER,feePayer:'player'},'apply');
    await s.execute('world_settlement',{operation:'org_vote',org,proposal:apply.proposal,opinion:'approve'},'approve');
    const shop=(await s.execute('world_trade',{operation:'lease',seller:LANDLORD,consent:true,days:3,deposit:3},'lease')).business;
    // D05 §5.1: persist a genuinely funded counter rather than a purse alias.
    await s.execute('world_act',{action:'business:open_counter',slots:{business:shop,coins:100}},'counter');
    const order=await s.execute('world_trade',{operation:'procure',business:shop,seller:LANDLORD,consent:true,item:'item_bread',quantity:2},'procure');
    await s.execute('world_trade',{operation:'fulfill',business:shop,seller:LANDLORD,contract:order.contract},'delivered');
    await s.execute('world_settlement',{operation:'business_open',business:shop},'open');
    await s.execute('world_trade',{operation:'hire',business:shop,seller:WORKER,consent:true,task:'stocktake',minutes:30,item:'item_bread',quantity:2},'hire');
    await s.execute('world_time',{minutes:DAY},'day');
    return {org,proposal:apply.proposal,shop};
}
function assertHoldings(document,{org,proposal,shop}){
    const h=document.holdings;assert.ok(h?.version===1,'持有分区已开');
    assert.ok(h.entities[`office_org:${org}:leader`]&&h.entities[`motion_${proposal}`],'职位与议案是实体');
    const alive=Object.values(h.rows).filter(r=>r.until===undefined);
    assert.ok(alive.some(r=>r.kind==='member_of'&&r.holder===WORKER&&r.subject===org));
    assert.ok(alive.some(r=>r.kind==='operates'&&r.holder==='player'&&r.subject===shop));
    assert.ok(reconciled(reconcileHoldings(engine,document)),'旧字段与存储一致');
}

test('导出→导入：持有分区逐字段一致，继续推进后仍一致',{timeout:600000},async t=>{
    const server=await open(t,await tempDir(t)),original=await createCampaign(server),ids=await scenario(original);
    const before=await original.read();assertHoldings(before,ids);
    const copy=session(server,(await server.api('import',{bundle:JSON.parse(JSON.stringify(await original.exportBundle()))})).reference.campaignId);
    assert.deepEqual((await copy.read()).holdings,before.holdings,'导入后持有分区一致');
    for(const s of [original,copy])await s.execute('world_time',{minutes:DAY},'later');
    const after=await original.read();
    assert.deepEqual((await copy.read()).holdings,after.holdings,'继续推进后一致');assert.deepEqual(await copy.read(),after);
    assert.ok(reconciled(reconcileHoldings(engine,after)));
});

test('写盘→新进程读盘：持有分区与写盘时一致，继续推进与未中断存档一致',{timeout:600000},async t=>{
    const directory=await tempDir(t),first=await open(t,directory),saved=await createCampaign(first),ids=await scenario(saved);
    const atSave=await saved.read();assertHoldings(atSave,ids);await first.close();
    const second=await open(t,directory),reloaded=session(second,saved.campaignId);
    assert.deepEqual((await reloaded.read()).holdings,atSave.holdings,'重启读盘后一致');
    await reloaded.execute('world_time',{minutes:DAY},'later');const resumed=await reloaded.read();await second.close();
    const live=await open(t,await tempDir(t)),control=await createCampaign(live);await scenario(control);await control.execute('world_time',{minutes:DAY},'later');
    assert.deepEqual(resumed,await control.read(),'与从未中断的存档逐字段一致');
});
