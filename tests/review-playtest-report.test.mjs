import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {playtestEvidenceHash,persistentReviewClient,reassessPlaytestReport,reviewReportCLI} from '../tools/review-playtest-report.mjs';

const scores={truth:80,agency:80,language:80,continuity:80};
const sample=()=>({results:[{id:`saved-${randomUUID()}`,attempt:1,requirements:['N6'],ledgerPass:true,consistencyPass:true,
    review:{complete:false,parts:[{error:'length',rawReview:'旧失败原文'}]},npcAcceptance:{complete:false,error:'旧引用失败'},
    turns:[{index:0,input:'请求',visible:'我不知道。',calls:[],assertions:[],sceneBeforeReply:'旧场景'}]}],costUpperYuan:4});
const scenario=report=>[{id:report.results[0].id,requirements:['N6'],rubric:{truth:'事实'}}];
const mock=()=>({spent:0,async generate(body){
    assert.equal(body.tools,undefined);assert.equal(body.tool_choice,undefined);
    const input=JSON.parse(body.messages[1].content);
    assert.equal(input.turns[0].sceneBeforeReply,'旧场景');
    const value=input.requirements?{requirements:[{id:'N6',pass:true,reason:'未泄密',evidence:[{turn:0,quote:'我不知道。'}]}]}:{scores,findings:[]};
    this.spent+=.01;
    return {measurement:{costUpperYuan:.01},choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]};
}});
async function temporary(t){
    const directory=await fs.mkdtemp(path.join(tmpRoot(),'dnd-review-'));
    t.after(async()=>{assert.ok(directory.startsWith(path.join(tmpRoot(),'dnd-review-')));await fs.rm(directory,{recursive:true,force:true});});
    return directory;
}

test('旧报告只重评保存证据，旧评分和原游戏费用原样保留',async()=>{
    const report=sample(),before=structuredClone(report),client=mock();
    const reviewed=await reassessPlaytestReport(client,report,scenario(report));
    assert.deepEqual(report,before);
    assert.equal(reviewed.results[0].review.complete,true);assert.equal(reviewed.results[0].npcAcceptance.complete,true);
    assert.deepEqual(reviewed.results[0].reviewHistory[0],{review:before.results[0].review,npcAcceptance:before.results[0].npcAcceptance});
    assert.deepEqual(reviewed.results[0].turns,before.results[0].turns);
    assert.equal(reviewed.costUpperYuan,4);assert.equal(reviewed.reassessment.gameExecuted,false);
    assert.equal(reviewed.m2.thresholdReached,false,'一次N6不能冒充M2');
    const changed=structuredClone(report);changed.results[0].review={complete:true};
    assert.equal(playtestEvidenceHash(changed),playtestEvidenceHash(report));
});

test('持久预算恢复spent与未知reserved，上限只收紧，失败预留不能免费重跑',async t=>{
    const directory=await temporary(t),file=path.join(directory,'budget.json'),evidenceHash='stable';
    await fs.writeFile(file,JSON.stringify({evidenceHash,spentYuan:.1,reservedYuan:.2,limitYuan:.5}));
    const failed={spent:0,async generate(){throw Error('网络中断');}};
    const guarded=await persistentReviewClient(failed,{file,budget:2,evidenceHash});
    assert.ok(Math.abs(guarded.spent-.3)<1e-10);assert.equal(guarded.budgetYuan,.5);
    await assert.rejects(guarded.generate({messages:[{role:'user',content:'已存报告'}],max_tokens:1000}),/网络中断/);
    const saved=JSON.parse(await fs.readFile(file,'utf8'));
    assert.ok(saved.spentYuan>.3);assert.equal(saved.reservedYuan,0);
    const recovered=await persistentReviewClient(mock(),{file,budget:.31,evidenceHash});
    assert.equal(recovered.budgetYuan,.31);assert.equal(recovered.spent,saved.spentYuan);
    let calls=0;
    const blocked=await persistentReviewClient({spent:0,async generate(){calls++;}},{file,budget:30,evidenceHash});
    assert.equal(blocked.budgetYuan,.31);
    await assert.rejects(blocked.generate({messages:[{role:'user',content:'x'}],max_tokens:5000}),/费用上限/);
    await assert.rejects(blocked.generate({tools:[]}),/不得调用游戏工具/);assert.equal(calls,0);
});

test('CLI显式输出不可覆盖旧报告，换output仍沿用同一预算，零预算不发模型请求',async t=>{
    const directory=await temporary(t),report=sample(),input=path.join(directory,'old.json'),output=path.join(directory,'new.json');
    const original=JSON.stringify(report);await fs.writeFile(input,original);
    const args=['--input',input,'--output',output,'--budget','0'];
    let calls=0;
    const deps={scenarios:scenario(report),clientFactory:()=>({spent:0,async generate(){calls++;assert.fail('预算0不调用模型');}})};
    const reviewed=await reviewReportCLI(args,deps);
    t.after(async()=>{await fs.unlink(reviewed.reassessment.budgetFile);});
    assert.equal(calls,0);assert.equal(reviewed.reassessment.complete,false);assert.equal(reviewed.results[0].reviewHistory[0].review.parts[0].rawReview,'旧失败原文');
    assert.equal(await fs.readFile(input,'utf8'),original);
    await assert.rejects(reviewReportCLI(args,deps),error=>error.code==='EEXIST');
    await assert.rejects(reviewReportCLI(['--input',input,'--output',input,'--budget','1'],deps),/不得覆盖/);
    const resumed=await reviewReportCLI(['--input',input,'--output',path.join(directory,'another.json'),'--budget','1'],deps);
    assert.equal(resumed.reassessment.budgetFile,reviewed.reassessment.budgetFile);
    assert.equal(resumed.reassessment.reviewLimitYuan,0);assert.equal(calls,0);
    await assert.rejects(reviewReportCLI(['--input',input,'--output',output],deps),/必须显式/);
});
