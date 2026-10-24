import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {tmpRoot} from '../tools/tmp-root.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {CampaignStorage,applyPatches,digest} from '../server-plugin/storage.mjs';
import {createRoutingContext} from '../server-plugin/action-router.mjs';
import {turnCandidates} from '../server-plugin/action-constructor.mjs';
import {selectedCandidateCall} from '../extension/turn-contract.mjs';
import {replayCandidates,assessCandidates} from '../tools/candidate-replay.mjs';

const world=await loadWorld(),engine=new WorldEngine(world);
const legacy=JSON.parse(await fs.readFile(new URL('../server-plugin/legacy/seed.json',import.meta.url),'utf8'));
const opening=()=>({...engine.createCharacter(legacy,{name:'离线候选'},'candidate-test'),worldHash:digest(world)});
const preview=(document,text)=>{const scoped=engine.scoped(document);return turnCandidates(scoped,document,text,createRoutingContext(scoped,document));};
async function move(document,destination,id){const next=await engine.reduce(document,{tool:'world_move',args:{destination},eventId:id});return applyPatches(document,next.patches);}

test('教学候选由当前可授内容派生，别名绑定学科、唯一教师和学科种类',async()=>{
 const document=await move(opening(),'bld_hw_school','school'),before=digest(document);
 const rows=preview(document,'学习基础识字');
 const row=rows.candidates.find(row=>row.id==='core:learn'&&row.slots.entity==='skill_literacy');
 assert.ok(row);assert.equal(row.slots.source,'npc_hw_luqing');assert.equal(row.slots.kind,'skill');assert.deepEqual(row.missing,[]);
 assert.equal(row.match.complete,true);assert.equal(digest(document),before);
 assert.ok(selectedCandidateCall(rows,'学习基础识字',{ref:row.ref}));
});

test('多件购买逐物绑定数量，并作为一个完整序列确认，不漏掉第二件',async()=>{
 const document=await move(opening(),'bld_hw_mill','mill');
 const input='我向阿砚买一把削木小刀和两份木料',rows=preview(document,input);
 const row=rows.candidates.find(row=>row.id==='sequence');assert.ok(row);
 const calls=selectedCandidateCall(rows,input,{ref:row.ref}).steps;
 assert.deepEqual(calls.map(row=>[row.args.slots.seller,row.args.slots.item,row.args.slots.quantity]),[['npc_hw_ayan','item_whittling_knife',1],['npc_hw_ayan','item_wood',2]]);
 assert.ok(rows.candidates.length<=5);
});

test('已知的多段路线可以派生目的地，未理解的创意余句仍不能确认近似项',async()=>{
 // Establish actual discovery before testing a known, non-adjacent destination.
 const visited=await move(opening(),'loc_hw_northwood','discover');
 const document=await move(visited,'bld_hw_mill','mill');
 const input='我步行去北林边',rows=preview(document,input),row=rows.candidates.find(row=>row.slots.destination==='loc_hw_northwood');
 assert.ok(row);assert.equal(row.match.complete,true);
 const creative='我步行去北林边，然后用歌声让整片森林睡着';
 const partial=preview(document,creative),near=partial.candidates.find(row=>row.slots.destination==='loc_hw_northwood');
 assert.ok(near);assert.equal(near.match.complete,false);
 assert.throws(()=>selectedCandidateCall(partial,creative,{ref:near.ref}),/完整原意/);
 assert.equal(selectedCandidateCall(partial,creative,{ref:'none'}).args.slots.intent,creative);
});

test('完整命中和仅覆盖分开计数；所有关键参数及多步都必须命中',()=>{
 const preview={candidates:[{id:'core:move',slots:{destination:'loc_bs'},missing:[],match:{complete:false}}]};
 const wanted=[{tool:'world_move',args:{destination:'loc_bs',mode:'walk'}}];
 assert.equal(assessCandidates(engine,preview,wanted).coverageHit,true);
 assert.equal(assessCandidates(engine,preview,wanted).hit,false);
 preview.candidates[0].match.complete=true;
 assert.equal(assessCandidates(engine,preview,wanted).hit,true);
 assert.equal(assessCandidates(engine,preview,[{tool:'world_move',args:{destination:'loc_hw'}}]).hit,false);
 assert.equal(assessCandidates(engine,preview,[...wanted,{tool:'world_time',args:{minutes:10}}]).coverageHit,false);
 assert.equal(assessCandidates(engine,preview,[...wanted,...wanted]).hit,false,'一次移动不能冒充两次');
 const alternatives={candidates:[{...preview.candidates[0],ref:'c1'},{id:'core:time',ref:'c2',slots:{minutes:10},missing:[],match:{complete:true}}]};
 assert.equal(assessCandidates(engine,alternatives,[...wanted,{tool:'world_time',args:{minutes:10}}]).coverageHit,true);
 assert.equal(assessCandidates(engine,alternatives,[...wanted,{tool:'world_time',args:{minutes:10}}]).hit,false,'两个互斥引用不能冒充一个完整计划');
});

test('以物易物原意不能被拆成两笔现金购买',()=>{
 const input='我用面包买水',rows=preview(opening(),input);
 assert.ok(!rows.candidates.some(row=>row.match.complete));
 assert.equal(selectedCandidateCall(rows,input,{ref:'none'}).args.slots.intent,input);
});

test('追踪物种取本地栖地菜单；明确今天的时刻不能被擅改为明天',async()=>{
 const document=await move(opening(),'loc_hw_northwood','habitat');
 // Use the real catalog spelling (路鬃), not an invented near-name (鹿鬃).
 const tracked=preview(document,`追踪${engine.byId.get('monster_bristle_boar').name}`).candidates.find(row=>row.id==='core:wildlife.track');
 assert.ok(tracked);assert.equal(tracked.slots.species,'monster_bristle_boar');
 const waited=preview(document,'休息到今天早上八点半').candidates.find(row=>row.id==='core:time'&&row.slots.until);
 assert.ok(waited);assert.deepEqual(waited.slots.until,{dayOffset:0,hour:8,minute:30});
});

test('精确重放读取原事件链；调用被当前规则拒绝就停止，不用原补丁修补状态',async t=>{
 const directory=await fs.mkdtemp(path.join(tmpRoot(),'candidate-replay-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const scenarioDirectory=path.join(directory,'scenarios');await fs.mkdir(scenarioDirectory);
 const scenario={id:'replay_fixture',initial:{mode:'new'},turns:[{input:'等10分钟',expectedTools:['world_time']},{input:'等20分钟',expectedTools:['world_time']} ]};
 await fs.writeFile(path.join(scenarioDirectory,'replay_fixture.json'),JSON.stringify(scenario));
 const initial=opening(),store=new CampaignStorage(path.join(directory,'server','infinite-fields'));
 const created=await store.create({id:'campaign_fixture',worldVersion:world.version,document:initial});
 const first={tool:'world_time',args:{minutes:10},eventId:'first-0'};
 const settled=await store.transact(created.reference.campaignId,{id:first.eventId,anchor:'first',input:first},(document,input)=>engine.reduce(document,input));
 const invalid={tool:'world_time',args:{minutes:-20},eventId:'second-0'};
 // A synthetically recorded success is intentionally invalid under today's
 // rules. Its stored patch must not be used to force the second result.
 await store.transact(created.reference.campaignId,{id:invalid.eventId,anchor:'second',input:invalid},()=>({patches:[{op:'set',path:['state','minute'],value:570}],result:{ok:true}}));
 const firstDocument=applyPatches(initial,(await engine.reduce(initial,first)).patches);
 const record={budgetFile:path.join(directory,'budget.json'),results:[{id:scenario.id,attempt:1,fixture:scenario.initial,session:{campaignId:created.reference.campaignId,chat:[{is_user:true,extra:{fields_anchor:'first'}},{is_user:true,extra:{fields_anchor:'second'}}]},finalDocument:firstDocument,
  turns:[{index:0,input:scenario.turns[0].input,calls:[{...first,result:settled.result}],minute:550,location:initial.state.location,player:initial.state.player},{index:1,input:scenario.turns[1].input,calls:[{...invalid,result:{ok:true}}]}]}]};
 const report=await replayCandidates({record,scenarioDirectory,world});
 assert.equal(report.groups[0].baselineHits,null,'没有运行旧构造器时，改前数据必须标为未知，不能伪报0');
 assert.equal(report.restored,2);assert.equal(report.sessions[0].rows[1].minute,550);
 // Negative duration is an argument error thrown by the current engine, rather
 // than a domain receipt with a different status. Both stop before applying it.
 assert.equal(report.sessions[0].stopped.reason,'recorded_event_rejected');
 assert.equal(report.sessions[0].stopped.sequence,2);
 assert.equal((await store.read(created.reference.campaignId)).document.state.minute,570);
});
