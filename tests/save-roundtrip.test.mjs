// R25：存档往返。人物自治任务快照曾写入 activity:undefined，事件按含 undefined 的内存对象算哈希，
// JSON 落盘或导出后该键消失，导入与重启读盘都报“事件校验失败”。这里覆盖：一段含交易、租铺雇工、钱庄借贷、
// 离屏推进与人物自治的长场景，导出→导入、写盘→新进程读盘后各自继续推进，与从未中断的存档逐字段一致；
// 以及修复前写下的旧存档（事件、快照、导出包、人物计划指纹）按写明的方式读入。不调用模型。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {createPlaytestServer} from '../tools/playtest-runner.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {CampaignStorage,applyPatches,digest} from '../server-plugin/storage.mjs';
import {npcPlanFingerprint} from '../server-plugin/npc-autonomy.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';

const DAY=1440,INN='bld_hw_qingdeng',POST='bld_hw_post',LANDLORD='npc_hw_linsui',WORKER='npc_hw_ayan',CLERK='npc_hw_shendu',SEED='r25-roundtrip-seed';
// The hired hand rests at the inn all day so the hire has a free window; everyone else keeps the real schedules.
const world=await loadWorld();
for(const npc of world.npcs.filter(n=>n.id===WORKER))npc.schedule={default:[{start:0,end:DAY,location:INN,activity:'休息',services:[]}]};
const engine=new WorldEngine(world);

// Raw reducer patches are recorded before storage normalizes them, so an undefined written anywhere is caught.
// Recording is scoped to the scenario tests (other files may share this process under --test-isolation=none).
let undefinedWrites=null;
const prepare=CampaignStorage.prototype.prepare;
CampaignStorage.prototype.prepare=function(state,payload){
 const walk=(value,at)=>{if(value===undefined)undefinedWrites?.push(at.join('.'));else if(value&&typeof value==='object')for(const key of Object.keys(value))walk(value[key],[...at,key]);};
 for(const patch of payload.patches??[])if(patch.op==='set')walk(patch.value,patch.path);
 return prepare.call(this,state,payload);
};

async function tempDir(t){const dir=await fs.mkdtemp(path.join(tmpRoot(),'r25-roundtrip-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}
async function open(t,directory){const server=await createPlaytestServer({world,seed:SEED,consistencyEnabled:false,directory});let closed=false;const close=async()=>{if(!closed){closed=true;await server.close();}};t.after(close);return {...server,close};}
function session(server,campaignId){
 const read=async()=>(await server.api('read',{campaignId})).document;
 const execute=async(tool,args,eventId)=>{const view=await server.api('read',{campaignId});try{return (await server.api('execute',{campaignId,tool,args,eventId,anchor:null,expectedSequence:view.reference.sequence})).result;}catch(error){error.message=`${eventId}（第${view.document.state.minute}分）：${error.message}`;throw error;}};
 // Interface actions go through the same menu fill as the 可做之事 panel.
 const choose=async(action,slots,eventId,target=null)=>{const menu=await server.api('actions',{campaignId,...(target?{target}:{})}),row=menu.actions.find(a=>a.id===`core:${action}`);assert.ok(row,`菜单里没有 ${action}`);return execute('world_act',{action:row.id,slots:{...row.fill,...slots}},eventId);};
 return {campaignId,read,execute,choose,exportBundle:()=>server.api('export',{campaignId})};
}
// Campaign opening at 10:00 at the inn: daily autonomy starts in this very minute, from people whose state has no activity yet.
async function createCampaign(server){
 const {reference}=await server.api('create',{character:{name:'试玩者'}});
 const bundle=await server.api('export',{campaignId:reference.campaignId});let initial=structuredClone(bundle.initial);const s=initial.state;
 s.minute=600;s.location=INN;s.player.coins=800;s.inventory.item_coin_coast={quantity:2,quality:'铜',durability:100,weight:0.005};
 s.npcs[WORKER].location=INN;s.npcs[WORKER].activity='休息';
 // The innkeeper gets vinegar, water, shavings and her pot and knife for a few warm drinks of her own, so autonomy keeps running on later days.
 for(const item of ['item_fruit_vinegar','item_water','item_wood_shavings','item_cooking_pot','item_kitchen_knife']){const row=s.npcs[LANDLORD].inventory[item];s.npcs[LANDLORD].inventory[item]=typeof row==='number'?row+4:{quality:'木',durability:100,weight:0.2,...row,quantity:(row?.quantity??0)+4};}
 // D05 §5.1 / S5-02: the roundtrip tests persistence, not food scarcity;
 // declare opening stock sufficient for both household reserves and orders.
 const supplied=applyIntentSetup(engine,initial,{facts:[{path:['state','npcs',LANDLORD,'inventory'],value:{...s.npcs[LANDLORD].inventory,item_bread:{quantity:40}}}]});assert.deepEqual(supplied.setupUnmet,[]);initial=supplied.document;
 const hash=digest(initial),imported=await server.api('import',{bundle:{...bundle,initial,events:[],metadata:{...bundle.metadata,initialHash:hash},checksum:hash,documentHash:hash}});
 return session(server,imported.reference.campaignId);
}
async function longScenario(s){
 const bought=await s.choose('trade.buy',{item:'item_bread',quantity:1},'buy',LANDLORD);assert.ok(bought.cost>0);
 const lease=await s.execute('world_trade',{operation:'lease',seller:LANDLORD,consent:true,days:3,deposit:3},'lease'),shop=lease.business;
 // D05 §5.1: the roundtrip now includes a real operating-capital transfer.
 await s.execute('world_act',{action:'business:open_counter',slots:{business:shop,coins:100}},'counter');
 const order=await s.execute('world_trade',{operation:'procure',business:shop,seller:LANDLORD,consent:true,item:'item_bread',quantity:2},'procure');
 await s.execute('world_trade',{operation:'fulfill',business:shop,seller:LANDLORD,contract:order.contract},'delivered');
 await s.execute('world_settlement',{operation:'business_open',business:shop},'open');
 const hire=await s.execute('world_trade',{operation:'hire',business:shop,seller:WORKER,consent:true,task:'stocktake',minutes:30,item:'item_bread',quantity:2},'hire');
 await s.execute('world_trade',{operation:'fulfill',business:shop,seller:WORKER,contract:hire.contract},'work');
 await s.choose('move',{destination:POST},'to-post',POST);
 const loan=await s.choose('trade.borrow',{coins:100,days:30,item:'item_coin_coast',quantity:2},'borrow');
 await s.choose('move',{destination:'loc_bs'},'away','loc_bs');
 const left=await s.read();
 await s.choose('time',{minutes:2*DAY},'offscreen');
 // Off-screen: the village keeps living at its own level of detail while the player is in another town.
 const away=await s.read();assert.equal(away.state.location,'loc_bs');assert.ok(away.state.minute-left.state.minute>=2*DAY);
 assert.ok(Object.keys(away.state.npcs).some(id=>id.startsWith('npc_hw_')&&JSON.stringify(away.state.npcs[id])!==JSON.stringify(left.state.npcs[id])),'离开期间村里不冻结');
 await s.choose('move',{destination:POST},'back',POST);
 await s.choose('time',{until:{dayOffset:0,hour:9}},'wait-counter');
 await s.choose('trade.repay',{debt:loan.debt,seller:CLERK},'repay');
 // Stop at 10:05 so this morning's autonomy work is still in progress when the save is exported or written.
 await s.choose('time',{until:{dayOffset:0,hour:10,minute:5}},'mid-work');
 return {shop,debt:loan.debt};
}
async function continueScenario(s){
 await s.choose('time',{minutes:DAY},'later');
 await s.choose('move',{destination:INN},'inn',INN);
 await s.choose('trade.buy',{item:'item_bread',quantity:1},'buy-again',LANDLORD);
}
function assertCovered(document,{shop,debt}){
 const st=document.state,tasks=Object.values(st.npcAutonomy.tasks);
 assert.ok(tasks.some(task=>task.rule&&task.start===600),'开局当刻有规则日常任务');
 assert.ok(tasks.some(task=>task.start===DAY+600)&&tasks.some(task=>task.start===2*DAY+600),'玩家在白石镇的两天里村中人物自治照常');
 assert.ok(tasks.some(task=>task.status==='进行中'&&task.start===3*DAY+600),'存档时有当天开工、尚未完成的自治任务');
 assert.ok(Object.keys(st.npcAutonomy.actions).length>0,'人物自治有完成的行动');
 assert.equal(st.records[debt].status,'已还清');
 assert.ok(Object.values(st.records).some(r=>r.business===shop&&/hire/.test(r.id)),'有雇工合同');
 assert.ok(st.minute>=3*DAY,'推进了几天');
}

test('导出→导入往返：长场景导入后与原存档逐字段一致，继续推进后仍一致，并可再次往返',async t=>{
 undefinedWrites=[];t.after(()=>{undefinedWrites=null;});
 const server=await open(t,await tempDir(t)),original=await createCampaign(server),covered=await longScenario(original);
 const before=await original.read();assertCovered(before,covered);
 const bundle=JSON.parse(JSON.stringify(await original.exportBundle()));
 const copy=session(server,(await server.api('import',{bundle})).reference.campaignId);
 assert.deepEqual(await copy.read(),before,'导入后逐字段一致');
 await continueScenario(original);await continueScenario(copy);
 const after=await original.read();assert.ok(after.state.minute>before.state.minute);
 assert.ok(Object.values(before.state.npcAutonomy.tasks).filter(task=>task.status==='进行中').every(task=>after.state.npcAutonomy.tasks[task.id].status!=='进行中'),'跨存档点的自治任务在继续推进中结算');
 assert.deepEqual(await copy.read(),after,'继续推进后逐字段一致');
 const again=session(server,(await server.api('import',{bundle:await copy.exportBundle()})).reference.campaignId);
 assert.deepEqual(await again.read(),after,'二次往返一致');
 assert.deepEqual(undefinedWrites,[],'没有写入 undefined 的补丁');
});

test('写盘→新进程读盘往返：重启后与写盘时逐字段一致，继续推进与从未中断的存档逐字段一致',async t=>{
 undefinedWrites=[];t.after(()=>{undefinedWrites=null;});
 const directory=await tempDir(t);
 const first=await open(t,directory),saved=await createCampaign(first),covered=await longScenario(saved);
 const atSave=await saved.read();assertCovered(atSave,covered);await first.close();
 const second=await open(t,directory),reloaded=session(second,saved.campaignId);
 assert.deepEqual(await reloaded.read(),atSave,'重启读盘后逐字段一致');
 await continueScenario(reloaded);const resumed=await reloaded.read();await second.close();
 // Reference: the same play in a campaign that never left memory.
 const live=await open(t,await tempDir(t)),control=await createCampaign(live);await longScenario(control);await continueScenario(control);
 const expected=await control.read();assert.deepEqual(resumed,expected,'重启后继续推进与未中断存档逐字段一致');
 const third=await open(t,directory);assert.deepEqual(await session(third,saved.campaignId).read(),resumed,'再次重启仍一致');
 assert.deepEqual(undefinedWrites,[],'没有写入 undefined 的补丁');
});

// Storage-level: a reducer that still writes undefined/NaN cannot break the chain or snapshots.
const deduct=(document,input)=>({patches:[{op:'set',path:['state','coins'],value:document.state.coins-input.cost},{op:'set',path:['state','note'],value:{kept:1,dropped:undefined,list:[undefined,NaN]}}],result:{balance:document.state.coins-input.cost}});
test('存储层：补丁里的 undefined/NaN 按 JSON 持久形式入链与入快照，读盘、导入与内存一致',async t=>{
 const directory=await tempDir(t),store=new CampaignStorage(directory,{snapshotEvery:2,reducer:deduct});
 await store.create({id:'live',worldVersion:'test',document:{state:{coins:100}}});
 for(const [i,cost]of[3,4,5].entries())await store.transact('live',{id:`e${i}`,input:{cost}},deduct);
 const memory=(await store.read('live')).document;
 assert.deepEqual(memory.state.note,{kept:1,list:[null,null]},'内存文档即持久形式');
 assert.deepEqual((await new CampaignStorage(directory,{reducer:deduct}).read('live')).document,memory,'重启读盘（含快照）一致');
 const imported=await store.import(JSON.parse(JSON.stringify(await store.export('live'))),'copy');
 assert.deepEqual(imported.document,memory,'导入一致');
});

// Legacy saves written before the fix: the events hashed {location, activity: undefined, status}.
// Handling: on load/import a hash mismatch is retried once with activity:undefined restored to the
// npcAutonomy task presence entries that lack it (the only shape the defect produced). undefined carries
// no data, so the document is unchanged; import rehashes the events in the persisted form. Any other
// mismatch is still rejected.
const legacyTask=(location='bld_hw_mill')=>({id:'npc_daily_0_npc_hw_ayan',npc:'npc_hw_ayan',status:'进行中',presence:{npcs:{npc_hw_ayan:{location,activity:undefined,status:'正常'}}}});
const legacyReducer=(document,input)=>({patches:[{op:'set',path:['state','npcAutonomy','tasks',input.task.id],value:input.task}],result:{ok:true}});
async function writeLegacyCampaign(directory,{tamper=false,snapshot=false,other=false}={}){
 const store=new CampaignStorage(directory,{reducer:legacyReducer}),id='legacy';
 const initial={state:{minute:600,npcAutonomy:{tasks:{}}}},metadata={format:2,id,worldVersion:'test',initialHash:digest(initial),created:'2026-10-01T00:00:00.000Z',provenance:null};
 await fs.mkdir(path.join(directory,id,'events'),{recursive:true});await fs.mkdir(path.join(directory,id,'snapshots'));
 await fs.writeFile(path.join(directory,id,'initial.json'),JSON.stringify(initial));await fs.writeFile(path.join(directory,id,'meta.json'),JSON.stringify(metadata));
 // Exactly what the old append did: hash the in-memory object, then JSON drops the undefined key.
 const task={...legacyTask(),...(other?{reason:undefined}:{})},event={kind:'action',id:'old',signature:digest({task}),input:{task:JSON.parse(JSON.stringify(task))},anchor:null,patches:[{op:'set',path:['state','npcAutonomy','tasks',task.id],value:task}],result:{ok:true},sequence:1,previous:metadata.initialHash};
 event.hash=digest(event);if(tamper)event.patches[0].value.presence.npcs.npc_hw_ayan.location='bld_hw_forge';
 await fs.writeFile(path.join(directory,id,'events','00000000.jsonl'),`${JSON.stringify(event)}\n`);
 const document=applyPatches(initial,event.patches);
 const initialSnapshot={sequence:0,revision:0,document:initial,checksum:digest(initial),head:metadata.initialHash,activeSequences:[]};initialSnapshot.envelopeHash=digest(initialSnapshot);
 await fs.writeFile(path.join(directory,id,'snapshots','0000000000-0.json'),JSON.stringify(initialSnapshot));
 if(snapshot){const data={sequence:1,revision:0,document,checksum:digest(document),head:event.hash,activeSequences:[1]};data.envelopeHash=digest(data);await fs.writeFile(path.join(directory,id,'snapshots','0000000001-0.json'),JSON.stringify(data));}
 return {store,id,event,documentHash:digest(document)};
}

test('旧存档（修复前写下的 activity:undefined 事件与快照）：读盘、导入、继续推进均可，数据不丢，导入后链按新格式重算',async t=>{
 for(const snapshot of [false,true]){
  const directory=await tempDir(t),{store,id,event,documentHash}=await writeLegacyCampaign(directory,{snapshot});
  const loaded=await store.read(id),presence=loaded.document.state.npcAutonomy.tasks.npc_daily_0_npc_hw_ayan.presence.npcs.npc_hw_ayan;
  assert.deepEqual(presence,{location:'bld_hw_mill',status:'正常'},'地点与状态保留，activity 原本就未定义');
  const raw=await fs.readFile(path.join(directory,id,'events','00000000.jsonl'),'utf8');
  await store.transact(id,{id:'next',input:{task:{...legacyTask('bld_hw_forge'),id:'later'}}},legacyReducer);
  assert.equal((await fs.readFile(path.join(directory,id,'events','00000000.jsonl'),'utf8')).startsWith(raw),true,'旧事件原样保留，不改写原文件');
  assert.equal((await new CampaignStorage(directory,{reducer:legacyReducer}).read(id)).document.state.npcAutonomy.tasks.later.presence.npcs.npc_hw_ayan.activity,undefined);
  // An export written by the old code: events as JSON, documentHash over the in-memory undefined form.
  const old={format:'infinite-fields-server-v2',metadata:JSON.parse(await fs.readFile(path.join(directory,id,'meta.json'),'utf8')),initial:JSON.parse(await fs.readFile(path.join(directory,id,'initial.json'),'utf8')),events:[JSON.parse(raw)],checksum:event.hash,documentHash};
  const copy=await store.import(JSON.parse(JSON.stringify(old)),`copy_${snapshot}`);
  assert.deepEqual(copy.document.state.npcAutonomy.tasks,{npc_daily_0_npc_hw_ayan:{...legacyTask(),presence:{npcs:{npc_hw_ayan:{location:'bld_hw_mill',status:'正常'}}}}});
  const rehashed=(await store.export(`copy_${snapshot}`)).events[0],{hash,...body}=rehashed;
  assert.equal(digest(body),hash,'导入副本的事件按持久形式重新计算哈希');
 }
});

test('旧存档容忍只限已知缺陷形状：篡改内容或其他 undefined 仍拒绝',async t=>{
 for(const options of [{tamper:true},{other:true}]){
  const directory=await tempDir(t),{store,id}=await writeLegacyCampaign(directory,options);
  await assert.rejects(store.read(id),/事件1校验失败/);
 }
});

test('旧人物计划：修复前按 activity:undefined 冻结的状态指纹在重放时仍被认作同一状态',async()=>{
 const document=engine.initialFromLegacy(JSON.parse(await fs.readFile(new URL('fixtures/legacy/seed.json',import.meta.url),'utf8')),'r25-plan');
 document.state.npcAutonomy={...document.state.npcAutonomy,tasks:{[legacyTask().id]:{...legacyTask(),status:'已完成',presence:{npcs:{npc_hw_ayan:{location:'bld_hw_mill',status:'正常'}}}}}};
 const fresh=npcPlanFingerprint(document);
 const oldState={...document.state,npcAutonomy:{...document.state.npcAutonomy,tasks:{[legacyTask().id]:{...legacyTask(),status:'已完成'}}}};
 const legacy=digest({minute:oldState.minute,npcs:oldState.npcs,location:oldState.location,companions:oldState.player.companions,obligations:oldState.obligations,actions:oldState.npcAutonomy});
 assert.notEqual(legacy,fresh);
 for(const stateFingerprint of [fresh,legacy]){
  const out=await engine.reduce(document,{type:'npc_plan',eventId:'plan',plan:{kind:'npc-plan',version:1,minute:document.state.minute,stateFingerprint,proposals:[]}},{replay:true,result:{}});
  assert.equal(out.result.ok,true);
 }
 await assert.rejects(async()=>engine.reduce(document,{type:'npc_plan',eventId:'plan',plan:{kind:'npc-plan',version:1,minute:document.state.minute,stateFingerprint:'stale',proposals:[]}}),/冻结输入/);
});
