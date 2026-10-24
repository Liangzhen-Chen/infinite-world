import {withReviewClaims} from './helpers/consistency-response.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from 'node:path';
import {createPlaytestServer,runPlaytest} from '../tools/playtest-runner.mjs';
import {loadPromptBundle} from '../tools/build-card.mjs';
import {summarizeConsistency,consistencyThreshold} from '../server-plugin/consistency-outcome.mjs';
import {runSoak} from '../tools/m3-soak-runner.mjs';
import {summarizeNpcAcceptance} from '../tools/npc-acceptance.mjs';

const issue={category:'fact',severity:'error',quote:'已核对。',reason:'测试拒绝理由',source:'model'};
const clean={verified:true,canCommit:true,status:'verified',issues:[]};
const sample=(total,failed)=>[{id:'ratio',attempt:1,turns:Array.from({length:total},(_,index)=>({index,reply:'已核对。',originalReply:'原文',
 consistency:index<failed?{...clean,canCommit:false,status:'unverified',feedback:'拒绝理由',issues:[issue]}:clean}))}];

test('拒绝后继续完整十回合，保留原文及付款，拒绝尾注不入账；stopOnFailure不截断审查失败',async t=>{
 const server=await createPlaytestServer({consistencyClient:null});t.after(()=>server.close());
 let reviews=0,generated=0;
 const api=async(endpoint,body)=>{
  const result=await server.api(endpoint,body);
  if(endpoint!=='review/reply')return result;
  return {...result,...clean,...(reviews++===0?{canCommit:false,status:'unverified',text:'不能替换原文',feedback:'测试拒绝理由',issues:[issue]}:{})};
 };
 const client={async generate(body,label){generated++;
  return {choices:[label==='continue-1-0-0'?{finish_reason:'tool_calls',message:{tool_calls:[{id:'pay',type:'function',function:{name:'world_trade',arguments:JSON.stringify({seller:'林穗',service:'住宿',days:1})}}]}}:
   {finish_reason:'stop',message:{content:label.startsWith('continue-1-0-')?'已核对。<回合 额外="0分" 地点="bld_hw_qingdeng" 在场="npc_hw_linsui"/>':'已核对。'}}]};
 }};
 const scenario={id:'continue',initial:{mode:'legacy'},turns:Array.from({length:10},(_,index)=>({input:index?'（场外）只核对。':'我付六铜住一晚。',assertions:[index?{kind:'elapsed',min:0,max:0}:{kind:'delta',path:'state.player.coins',value:-6}]}))};
 const result=await runPlaytest({scenario,api,client,bundle:await loadPromptBundle(),countTokens:()=>20,stopOnFailure:true});
 assert.equal(result.turns.length,10);assert.equal(generated,11);assert.equal(result.failedTurns,1);assert.equal(result.turns[0].errors.length,0);
 // 修订记录 2026-10-23 第3条：拒审原文保留供诊断，只发布来源模板。
 assert.equal(result.turns[0].reply,result.turns[0].consistency.safeText);
 assert.notEqual(result.turns[0].reply,result.turns[0].originalReply);assert.match(result.turns[0].originalReply,/已核对/);
 assert.match(result.turns[0].reply,/6文/);
 assert.deepEqual(result.turns[0].reviewFailure,{reason:'测试拒绝理由',categories:['fact']});
 assert.equal(result.session.history.filter(row=>row.role==='assistant'&&row.content===result.turns[0].originalReply).length,0);
 assert.equal(result.session.history.filter(row=>row.role==='assistant'&&row.content===result.turns[0].reply).length,1);
 assert.equal(result.finalDocument.state.player.coins,174);assert.equal(result.ledgerPass,true);
 const exported=await server.api('export',{campaignId:result.session.campaignId});
 assert.equal(exported.events.filter(e=>e.input?.tool==='world_trade').length,1);
 assert.equal(exported.events.filter(e=>e.input?.tool==='world_turn'&&e.anchor==='continue-1-0').length,0);
 assert.equal(exported.events.filter(e=>e.input?.tool==='world_turn').length,9);
 assert.equal(result.consistency.failed,1);assert.equal(result.consistency.failureRatio,.1);assert.equal(result.consistency.passRatio,.9);
 assert.equal(result.consistencyPass,true);assert.equal(result.acceptancePass,true);assert.equal(result.reviewRequired,true);assert.equal(result.pass,false);
});

test('报告按全体回合计失败比例，90%边界通过，低于边界失败，缺测与空样本不通过',()=>{
 const result=sample(10,1),report=summarizeConsistency(result);
 assert.equal(report.total,10);assert.equal(report.failed,1);assert.equal(report.rejected,1);assert.equal(report.thresholdReached,true);
 assert.equal(consistencyThreshold(sample(10,2)),false);assert.equal(consistencyThreshold(result,.95),false);
 const sessions=result[0].turns.map((turn,index)=>({id:`session-${index}`,attempt:1,turns:[turn],assertions:1,passed:1,consistencyPass:index!==0}));
 const npc=summarizeNpcAcceptance(sessions,[]);
 assert.equal(npc.consistencyPass,true);assert.equal(npc.ledger.thresholdReached,true);
 sessions[0].passed=0;assert.equal(summarizeNpcAcceptance(sessions,[]).ledger.thresholdReached,false);
 delete result[0].turns[1].consistency;
 assert.equal(summarizeConsistency(result).failed,2);assert.equal(summarizeConsistency([]).thresholdReached,false);
 result[0].turns[0].consistency={...result[0].turns[0].consistency,issues:[],originalIssues:[issue],rewriteError:'改写响应格式错误'};
 const preserved=summarizeConsistency(result).failures[0];
 assert.deepEqual(preserved.categories,['fact']);assert.equal(preserved.reason,'改写响应格式错误');
});

test('有证据的误报及真实矛盾单列，未判定不猜测；误报仍计失败且不改审查决定',()=>{
 const result=sample(10,3),turns=result[0].turns;
 turns[0].consistencyAdjudications=[{issueIndex:0,category:'fact',quote:issue.quote,disposition:'false-positive',reason:'回执支持原句',evidence:'receipt:0：核对成功'}];
 turns[1].consistencyAdjudications=[{issueIndex:0,category:'fact',quote:issue.quote,disposition:'contradiction',reason:'原句与回执冲突',evidence:'receipt:0：核对失败'}];
 const report=summarizeConsistency(result);
 assert.equal(report.falsePositives.length,1);assert.equal(report.contradictions.length,1);assert.equal(report.unresolved.length,1);
 assert.equal(report.failed,3);assert.equal(report.failureRatio,.3);assert.equal(report.thresholdReached,false);
 assert.equal(turns[0].consistency.canCommit,false);assert.equal(report.falsePositives[0].turn,0);
 turns[0].consistencyAdjudications[0].quote='另一句话';
 assert.equal(summarizeConsistency(result).falsePositives.length,0);
});

test('M3浸泡拒绝仍完成两人格整场，检查点和失败样本持久保存，续跑不重发',async t=>{
 const directory=await fs.mkdtemp(path.join(tmpRoot(),'fields-review-continue-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 let calls=0;
 const client={async generate(body,label){calls++;
  const message=label.startsWith('consistency:')?{tool_calls:[{id:'review',type:'function',function:{name:'report_consistency_issues',arguments:JSON.stringify({issues:[{...issue,evidence:[{id:'player',quote:'只核对'}]}]})}}]}:{content:'已核对。'};
  return {...(label.startsWith('consistency:')?withReviewClaims({choices:[{finish_reason:'tool_calls',message}]},body):{choices:[{finish_reason:'stop',message}]}),measurement:{costUpperYuan:.001,usage:{prompt_cache_hit_tokens:90,prompt_cache_miss_tokens:10}}};
 }};
 const config={directory,turns:2,budgetYuan:2,inputFor:()=> '（场外）只核对。',adapterOptions:{client,processMessages:m=>m,countTokens:()=>20,createBody:{name:'试玩者'}}};
 const report=await runSoak(config);
 assert.equal(report.status,'complete');assert.equal(report.complete,true);assert.equal(report.pass,false);
 for(const persona of report.personas){assert.equal(persona.turns,2);assert.equal(persona.consistency.rejected,2);assert.equal(persona.consistency.failed,2);assert.equal(persona.consistency.failureRatio,1);}
 const before=calls;await runSoak(config);assert.equal(calls,before);
 const tapes=await fs.readdir(path.join(directory,'tasks'));
 const tape=JSON.parse(await fs.readFile(path.join(directory,'tasks',tapes[0]),'utf8'));
 assert.equal(tape.result.originalReply,'已核对。');assert.equal(tape.result.consistency.canCommit,false);assert.ok(tape.result.checkpoint);
});
