import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {once} from 'node:events';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {init} from '../server-plugin/index.mjs';
import {toolDefinitions} from '../extension/tools.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const villages=world.settlementProfiles.filter(p=>p.details?.governance?.appointment);
function setup(village=villages[0]){
    const w=structuredClone(world);for(const n of w.npcs)delete n.schedule;
    const engine=new WorldEngine(w),doc=engine.createCharacter(seed,{},'governance-test');
    const {head,meetingPlace}=village.details.governance;
    const steward=village.details.governance.coordinators.find(id=>id!==head);
    doc.state.location=meetingPlace;doc.state.minute=540;
    for(const id of [head,steward,...village.details.problems[0].stakeholders.map(p=>p.person)]){
        doc.state.npcs[id].location=meetingPlace;doc.state.npcs[id].activity='议事';
    }
    const run=async(c,args,eventId,tool='world_settlement')=>{
        const out=await engine.reduce(c,{tool,args:{...(tool==='world_settlement'?{settlement:village.id}:{}),...args},eventId});
        return {document:applyPatches(c,out.patches),result:out.result};
    };
    return {engine,doc,run,village,head,steward};
}
async function grant(s,doc=s.doc,event='grant',extra={}){
    return s.run(doc,{operation:'governance_grant',authority:s.head,steward:s.steward,action:'account_report',consent:true,minutes:2880,...extra},event);
}
async function queue(s,doc,authorization,event='queue',extra={}){
    return s.run(doc,{operation:'governance_queue',authority:s.head,action:'account_report',authorization,due:600,...extra},event);
}
function finance(c){return {player:c.state.player.coins,people:Object.fromEntries(Object.entries(c.state.npcs).map(([id,r])=>[id,r.coins])),stock:structuredClone(c.state.settlements),projects:structuredClone(c.state.projects)};}
const proposalArgs=(v,extra={})=>({operation:'governance_propose',plot:v.details.problems[0].location,issue:v.details.problems[0].id,name:'公开核对原记录',wood:2,days:1,budget:10,proposedFee:5,...extra});

test('四村真实任命与名册可查，逐人在场意见；否决后不落工程、不收费，缺席不代投',async()=>{
    for(const v of villages){
        const s=setup(v),{run,doc,head}=s,before=finance(doc);
        const view=await run(doc,{operation:'governance_inspect'},'inspect');
        assert.equal(view.result.appointment.head,head);assert.match(view.result.appointment.source,/任命册/);
        assert.deepEqual(view.document,doc);assert.ok(view.result.eligible.length>v.details.problems[0].stakeholders.length);
        let made=await run(doc,proposalArgs(v),'proposal'),c=made.document,id=made.result.proposal;
        const speakers=v.details.problems[0].stakeholders.map(p=>p.person),speaker=speakers[1];
        let closed=await run(c,{operation:'governance_close',authority:head,proposal:id},'missing');
        assert.equal(closed.result.status,'议事中');assert.ok(closed.result.missing.includes(speaker));
        await assert.rejects(run(c,{operation:'governance_opinion',proposal:id,speaker:'player',opinion:'approve',content:'同意'},'noncitizen'),/公民登记/);
        const absent=structuredClone(c);absent.state.npcs[speaker].location=v.id;
        await assert.rejects(run(absent,{operation:'governance_opinion',proposal:id,speaker,opinion:'approve',content:'同意'},'absent'),/在场/);
        c=(await run(c,{operation:'governance_opinion',proposal:id,speaker,opinion:'reject',content:'不同意未经核对就花公款'},'veto')).document;
        closed=await run(c,{operation:'governance_close',authority:head,proposal:id},'close');c=closed.document;
        assert.equal(closed.result.meeting.status,'已否决');assert.deepEqual(closed.result.meeting.opinions.map(o=>o.speaker),[speaker]);
        const g=await grant(s,c);c=g.document;
        await assert.rejects(run(c,{operation:'start_project',authorization:g.result.authorization,proposal:id,name:'绕过否决',wood:2,days:1},'build'),/已否决/);
        await assert.rejects(queue(s,c,g.result.authorization,'housing',{action:'housing',proposal:id}),/已否决/);
        assert.deepEqual(finance(c),before);
        assert.equal(Object.values(c.state.records).some(r=>r.category==='civic_contribution'),false);
    }
});

test('当事人意见确认仍不产生官职、地权或支出许可；正常任命入口只转交现有上级',async()=>{
    const s=setup(),{run,doc,head,village}=s,made=await run(doc,proposalArgs(village),'proposal');let c=made.document;
    for(const [i,{person:speaker}]of village.details.problems[0].stakeholders.entries())c=(await run(c,{operation:'governance_opinion',proposal:made.result.proposal,speaker,opinion:'approve',content:'同意当面核对'},`agree-${i}`)).document;
    const closed=await run(c,{operation:'governance_close',authority:head,proposal:made.result.proposal},'close');c=closed.document;
    assert.equal(closed.result.meeting.status,'意见已确认');
    const office=await run(c,{operation:'governance_appointment',authority:head,name:'村长'},'office');c=office.document;
    assert.equal(office.result.granted,false);assert.equal(office.result.request.status,'待上级决定');
    assert.equal(office.result.request.referral.status,'referral-only');
    for(const action of ['housing','public_project'])await assert.rejects(grant(s,c,`grant-${action}`,{action}),/任命未授予/);
    await assert.rejects(grant(s,c,'self',{authority:'player',action:'housing'}),/在场|未登记/);
    assert.deepEqual(finance(c),finance(doc));
    assert.equal(Object.values(c.state.records).some(r=>r.category==='authorization'),false);
    assert.deepEqual(c.state.created,doc.state.created);
});

test('正式工具签发限期公账授权，必须真实主体与同意；不能扩大预算、收费或税率',async()=>{
    const s=setup(),{doc,run,head,steward}=s;
    for(const extra of [{consent:false},{budget:1},{proposedFee:1},{taxBps:0},{authority:steward},{steward:head},{minutes:0}]){
        await assert.rejects(grant(s,doc,'bad',extra),/同意|支出|头人|数值/);assert.deepEqual(finance(doc),finance(s.doc));
    }
    const g=await grant(s),a=g.result.permission;
    assert.equal(a.grantor,head);assert.equal(a.grantee,steward);assert.ok(a.appointmentSource);
    assert.equal(a.expires,doc.state.minute+2880);assert.deepEqual(a.scope.actions,['account_report']);assert.equal(a.scope.budget,0);
    const retried=await grant(s,g.document);assert.equal(retried.result.duplicate,true);assert.deepEqual(retried.document,g.document);
    await assert.rejects(grant(s,g.document,'grant',{minutes:5}),/sourceEvent/);
    const q=await queue(s,g.document,g.result.authorization);
    await assert.rejects(queue(s,q.document,g.result.authorization,'late',{due:a.expires}),/期限/);
    await assert.rejects(run(q.document,{operation:'governance_process',authorization:g.result.authorization,steward,request:q.result.request},'early'),/尚未/);
});

test('正式日结和手动管事共用回执；真实公账和亲历记忆可追溯，重载重办不复制',async()=>{
    const s=setup(),g=await grant(s),q=await queue(s,g.document,g.result.authorization),auth=g.result.authorization;
    // Manual and offscreen branches start from the same formally granted queue.
    const manualStart=structuredClone(q.document),offStart=structuredClone(q.document);
    offStart.state.location='loc_hw';
    const manual=(await s.run(manualStart,{minutes:60},'manual-clock','world_time')).document;
    const processed=await s.run(manual,{operation:'governance_process',authorization:auth,steward:s.steward,request:q.result.request},'manual');
    const off=(await s.run(offStart,{minutes:60},'off-clock','world_time')).document;
    const key=`governance_execution:${q.result.request}`;
    assert.deepEqual(processed.document.state.records[key],off.state.records[key]);
    assert.deepEqual(processed.document.state.records[q.result.request],off.state.records[q.result.request]);
    assert.deepEqual(finance(processed.document),finance(off));
    const execution=off.state.records[key];assert.equal(execution.report.treasury,off.state.settlements[s.village.id].treasury);
    assert.equal(execution.charged,0);assert.equal(off.state.npcs[s.steward].memoryStream.filter(m=>m.sourceEvent===key).length,1);
    const restored=JSON.parse(JSON.stringify(processed.document));
    const repeat=await s.run(restored,{operation:'governance_process',authorization:auth,steward:s.steward,request:q.result.request},'repeat');
    assert.equal(repeat.result.execution.duplicate,true);assert.deepEqual(finance(repeat.document),finance(restored));
    assert.equal(repeat.document.state.npcs[s.steward].memoryStream.filter(m=>m.sourceEvent===key).length,1);
});

test('撤权、到期、失能、离场均不代办；日结留失败原因，不动公账',async()=>{
    for(const kind of ['revoke','expire','sleep','away']){
        const s=setup(),g=await grant(s,s.doc,'grant',kind==='expire'?{minutes:61}:{});
        const q=await queue(s,g.document,g.result.authorization);let c=q.document;
        if(kind==='revoke')c=(await s.run(c,{operation:'governance_revoke',authority:s.head,authorization:g.result.authorization},'revoke')).document;
        if(kind==='expire')c.state.minute=601;
        else c.state.minute=600;
        if(kind==='sleep')c.state.npcs[s.steward].activity='睡眠';
        if(kind==='away')c.state.npcs[s.steward].location=s.village.id;
        const before=finance(c);
        await assert.rejects(s.run(c,{operation:'governance_process',authorization:g.result.authorization,steward:s.steward,request:q.result.request},'blocked'),/撤销|到期|在场|清醒|办事/);
        c.state.location='loc_hw';const off=await s.run(c,{minutes:1440},'day','world_time');
        assert.equal(off.document.state.records[`governance_execution:${q.result.request}`],undefined);
        assert.ok(Object.values(off.document.state.records).some(r=>r.category==='governance_attempt'&&r.request===q.result.request&&r.charged===0));
        assert.equal(off.document.state.player.coins,before.player);
        assert.deepEqual(off.document.state.projects,before.projects);
    }
});

test('建房待办无正式任命时明确停在权限决定，零预算也不生成工程或收费',async()=>{
    const s=setup(),g=await grant(s),made=await s.run(g.document,proposalArgs(s.village,{budget:0,proposedFee:20}),'housing-proposal');
    const q=await queue(s,made.document,g.result.authorization,'housing',{action:'housing',proposal:made.result.proposal});
    const before=finance(q.document);let c=(await s.run(q.document,{minutes:60},'clock','world_time')).document;
    const done=await s.run(c,{operation:'governance_process',authorization:g.result.authorization,steward:s.steward,request:q.result.request},'process');c=done.document;
    assert.equal(done.result.execution.status,'待权限决定');assert.match(done.result.execution.reason,/未授予建房/);assert.equal(done.result.execution.charged,0);
    assert.deepEqual(finance(c),before);
    const retry=await s.run(c,{operation:'governance_process',authorization:g.result.authorization,steward:s.steward,request:q.result.request},'repeat');
    assert.equal(retry.result.execution.duplicate,true);assert.deepEqual(finance(retry.document),before);
    // Same normal grant used as a purported building permission must fail too.
    await assert.rejects(s.run(c,{operation:'start_project',authorization:g.result.authorization,proposal:made.result.proposal,name:'建房',wood:2,days:1},'build'),/未授予/);
});

test('统一工具公开治理入口，户籍费用仍不能由正文填写',()=>{
    const schema=toolDefinitions().find(t=>t.function.name==='world_settlement').function.parameters;
    for(const op of ['governance_propose','governance_opinion','governance_close','governance_grant','governance_queue','governance_process'])assert.ok(schema.properties.operation.enum.includes(op));
    assert.equal(schema.properties.fee,undefined);assert.equal(schema.properties.office,undefined);
});

test('隔离HTTP正式工具签发公账授权、办事、导出导入，并拒绝伪称官职建房',async t=>{
    const express=createRequire(new URL('../SillyTavern/package.json',import.meta.url))('express');
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'governance-http-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
    // 与宿主酒馆的bodyParser上限（500mb）一致；世界扩充后导出包已超过20MB的UTF-8字节。
    const s=setup(),app=express();app.use(express.json({limit:'500mb'}));
    const router=express.Router();await init(router,{baseRoot:root,world});app.use(router);
    const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
    const post=async(endpoint,body)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
    const created=await post('/create',{character:{}}),id=created.body.reference.campaignId;
    const execute=(args,eventId,tool='world_settlement')=>post('/execute',{campaignId:id,tool,args:{...(tool==='world_settlement'?{settlement:s.village.id}:{}),...args},eventId});
    // Travel from the ordinary opening location. Preserve every real schedule;
    // no fixture positions, records, authorizations or appointment changes.
    const arrival=await execute({destination:s.village.details.governance.meetingPlace},'http-arrive','world_move');assert.equal(arrival.status,200,arrival.body.error);
    let view=(await post('/read',{campaignId:id})).body.document;
    if([s.head,s.steward].some(who=>view.state.npcs[who].location!==view.state.location||view.state.npcs[who].scheduleTravel)){
        const wait=await execute({until:{dayOffset:1,hour:10,minute:30}},'http-office-hours','world_time');assert.equal(wait.status,200,wait.body.error);
        view=(await post('/read',{campaignId:id})).body.document;
    }
    const g=await execute({operation:'governance_grant',authority:s.head,steward:s.steward,consent:true,action:'account_report',minutes:2880},'http-grant');
    assert.equal(g.status,200,g.body.error);const authorization=g.body.result.authorization;
    const due=(Math.floor(view.state.minute/1440)+1)*1440+600;
    const q=await execute({operation:'governance_queue',authority:s.head,authorization,action:'account_report',due},'http-queue');assert.equal(q.status,200,q.body.error);
    assert.equal((await execute({destination:s.village.id},'http-leave','world_move')).status,200);
    view=(await post('/read',{campaignId:id})).body.document;
    assert.equal((await execute({minutes:due-view.state.minute},'http-clock','world_time')).status,200);
    view=(await post('/read',{campaignId:id})).body.document;
    assert.equal(view.state.records[`governance_execution:${q.body.result.request}`].status,'已完成');
    assert.equal((await execute({destination:s.village.details.governance.meetingPlace},'http-return','world_move')).status,200);
    const done=await execute({operation:'governance_process',authorization,steward:s.steward,request:q.body.result.request},'http-process');assert.equal(done.status,200,done.body.error);
    assert.equal(done.body.result.execution.status,'已完成');
    const bad=await execute({operation:'governance_grant',authority:s.head,steward:s.steward,consent:true,action:'housing',minutes:1440},'http-housing');assert.equal(bad.status,400);assert.match(bad.body.error,/未授予/);
    const live=await post('/read',{campaignId:id});
    const exported=await post('/export',{campaignId:id}),restored=await post('/import',{bundle:exported.body});assert.equal(restored.status,200,restored.body.error);
    assert.deepEqual(restored.body.document.state.records,live.body.document.state.records);
});
