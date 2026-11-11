import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpRoot} from '../tools/tmp-root.mjs';
import {CampaignStorage,digest} from '../server-plugin/storage.mjs';
import {recordSideband,sidebandClient,sidebandFile} from '../server-plugin/sideband.mjs';
import {modelProfileGenerator} from '../server-plugin/population-service.mjs';
import {planNpcAutonomy} from '../tools/npc-autonomy-planner.mjs';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {createPlaytestServer} from '../tools/playtest-runner.mjs';
import {reviewResponse} from './helpers/consistency-response.mjs';

const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const temp=async t=>{const dir=await fs.mkdtemp(path.join(tmpRoot(),'ai18-sideband-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;};
const readRows=async(store,id,turn)=>JSON.parse(await fs.readFile(sidebandFile(store,id,turn),'utf8'));
const FIELDS=['role','label','requestHash','model','status','latencyMs','costYuan'];

test('旁路记录：同一回合并发写入逐条追加，不丢不乱；缺字段或非法 status 拒绝',async t=>{
 const store=new CampaignStorage(await temp(t));
 const row=n=>({role:'consistency',label:`l${n}`,requestHash:digest(n),model:'deepseek-flash',status:'ok',latencyMs:1,costYuan:null});
 await Promise.all([1,2,3,4,5].map(n=>recordSideband(store,'c1',7,row(n))));
 const file=await readRows(store,'c1',7);
 assert.equal(file.turn,7);assert.deepEqual(file.calls.map(c=>c.label).sort(),['l1','l2','l3','l4','l5']);
 assert.throws(()=>recordSideband(store,'c1',7,{...row(1),status:'weird'}),/旁路记录缺少/);
 assert.throws(()=>recordSideband(store,'c1',7,{...row(1),requestHash:'x'}),/旁路记录缺少/);
 assert.throws(()=>sidebandFile(store,'c1',-1),/有效回合序号/);
});

test('sidebandClient：成功与失败各写恰一条，结果与异常原样透传，requestHash 是请求体哈希',async t=>{
 const store=new CampaignStorage(await temp(t));
 const ok={choices:[{message:{content:'好'}}],measurement:{model:'deepseek-flash',costUpperYuan:0.0031}};
 const body={messages:[{role:'user',content:'问'}]};
 const wrapped=sidebandClient({generate:async()=>ok},{store,campaignId:'c2',turn:3,role:'population'});
 assert.equal(await wrapped.generate(body,'label-a'),ok);
 const timeout=sidebandClient({generate:async()=>{throw Object.assign(Error('request timed out'),{name:'TimeoutError'});}},{store,campaignId:'c2',turn:3,role:'population'});
 await assert.rejects(timeout.generate(body,'label-b'),/timed out/);
 const failed=sidebandClient({generate:async()=>{throw Error('服务错误');}},{store,campaignId:'c2',turn:3,role:'population'});
 await assert.rejects(failed.generate(body,'label-c'),/服务错误/);
 const {calls}=await readRows(store,'c2',3);
 assert.equal(calls.length,3);
 for(const call of calls){for(const f of FIELDS)assert.ok(f in call,`缺字段 ${f}`);assert.equal(call.requestHash,digest(body));assert.ok(Number.isFinite(call.latencyMs));}
 assert.deepEqual(calls.map(c=>[c.label,c.status,c.model,c.costYuan]),[['label-a','ok','deepseek-flash',0.0031],['label-b','timeout','unknown',null],['label-c','failed','unknown',null]]);
 assert.deepEqual(calls[0].response,ok);assert.equal(calls[2].error,'服务错误');assert.ok(!('response' in calls[2]));
});

test('人物档生成：草稿与自查各一条旁路记录；不带 sideband 选项（注入的生成器）不写文件',async t=>{
 const root=await temp(t),store=new CampaignStorage(root);let n=0;
 const answer=content=>({choices:[{message:{content:JSON.stringify(content)}}],measurement:{model:'deepseek-flash',costUpperYuan:0.001}});
 const client={generate:async()=>answer(++n===1?{background:'本地人。'}:{issues:[],profile:{background:'本地人。'}})};
 const brief={identity:{id:'p_1',name:'甲',age:30,sex:'男',culture:'c',occupation:'农',minor:false,household:[],district:'d',dwelling:'w'}};
 const generate=modelProfileGenerator(client);
 await generate(brief,{template:null,sideband:{store,campaignId:'c3',turn:5}});
 const {calls}=await readRows(store,'c3',5);
 assert.deepEqual(calls.map(c=>c.label),['population-draft-p_1','population-selfcheck-p_1']);
 assert.ok(calls.every(c=>c.role==='population'&&c.status==='ok'&&/^[a-f0-9]{64}$/.test(c.requestHash)&&c.model==='deepseek-flash'));
 n=0;await generate(brief,{template:null});
 assert.equal((await readRows(store,'c3',5)).calls.length,2);
 await assert.rejects(fs.access(sidebandFile(store,'c3',6)));
});

test('离屏规划：一次模型调用写一条旁路记录；同日缓存命中不再写',async t=>{
 const root=await temp(t),store=new CampaignStorage(root),engine=new WorldEngine(await loadWorld());
 const document=engine.initialFromLegacy(seed,'ai18-sideband');document.state.minute=540;document.state.location='loc_capital';
 const ledgerFile=path.join(root,'ledger.json');let calls=0;
 const client={generate:async body=>{calls++;const context=JSON.parse(body.messages[1].content);return {usage:{prompt_tokens:100,completion_tokens:80},choices:[{message:{tool_calls:[{function:{name:'propose_npc_actions',arguments:JSON.stringify({proposals:context.people.map(p=>({npc:p.id,actions:[]}))})}}]}}]};}};
 const options={maxTokens:1000,client,ledgerFile,sideband:{store,campaignId:'c4',turn:9}};
 assert.equal((await planNpcAutonomy(engine,document,options)).status,'ready');
 assert.equal((await planNpcAutonomy(engine,document,options)).cached,true);
 assert.equal(calls,1);
 const rows=(await readRows(store,'c4',9)).calls;
 assert.equal(rows.length,1);
 assert.equal(rows[0].role,'npc-planning');assert.equal(rows[0].status,'ok');assert.match(rows[0].label,/^npc-autonomy:/);
 for(const f of FIELDS)assert.ok(f in rows[0]);
});

test('一致性审查与改写：模型客户端被调用几次，该回合旁路文件就有几条，重复请求不再追加',async t=>{
 const seen=[];
 const client={async generate(body,label){
  seen.push(label);
  if(label.startsWith('consistency-rewrite:'))return {choices:[{finish_reason:'stop',message:{content:'<q who="player">我全都答应。</q>'}}]};
  return reviewResponse(body);
 }};
 const server=await createPlaytestServer({consistencyClient:client});t.after(()=>server.close());
 const created=await server.api('create',{}),campaignId=created.reference.campaignId,anchor='sideband-bread';
 const begun=await server.api('review/begin',{campaignId,anchor,playerText:'买一个面包',expectedSequence:created.reference.sequence});
 await server.api('execute',{campaignId,anchor,eventId:'sideband-buy',tool:'world_act',args:{action:'core:trade.buy',slots:{seller:'林穗',item:'面包',quantity:1}},expectedSequence:created.reference.sequence});
 const before=await server.api('read',{campaignId}),turn=before.reference.sequence;
 const request={campaignId,token:begun.token,draft:'<q who="player">我全都答应。</q>',query:'买一个面包',expectedSequence:turn};
 await server.api('review/reply',request);
 const store=new CampaignStorage(server.directory),{calls}=await readRows(store,campaignId,turn);
 assert.ok(seen.length>=2);
 assert.deepEqual(calls.map(c=>c.label),seen);
 assert.ok(calls.every(c=>c.role==='consistency'&&c.status==='ok'&&/^[a-f0-9]{64}$/.test(c.requestHash)&&c.model==='unknown'&&Number.isFinite(c.latencyMs)));
 await server.api('review/reply',request);
 assert.equal((await readRows(store,campaignId,turn)).calls.length,seen.length);
});
