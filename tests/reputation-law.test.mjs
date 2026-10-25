import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld}from'../tools/load-world.mjs';
import {withM5LawRules}from'../world/design/m5-law-rules.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {applyPatches}from'../server-plugin/storage.mjs';
import {reputationView}from'../server-plugin/reputation.mjs';
import {readStateSection}from'../extension/state-read.mjs';
import {toolDefinitions}from'../extension/tools.mjs';
import {officeScene}from'./helpers/office-actions.mjs';

const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const victim='npc_hw_linsui',carrier='npc_hw_hezhou',guard='npc_hw_gucen',judge='npc_hw_chenbai',reviewer='npc_hw_luqing',friend='faction_saltboat',enemy='faction_riverhomes';
const money=c=>c.state.player.coins+Object.values(c.state.npcs).reduce((sum,n)=>sum+n.coins,0)+Object.values(c.state.records).filter(r=>['legal_treasury','legal_deposit'].includes(r.category)).reduce((sum,r)=>sum+r.coins,0)+Object.values(c.state.workshopFunds??{}).reduce((sum,n)=>sum+n,0);
const account=(c,scope,id)=>reputationView(c).find(row=>row.scope===scope&&row.target===id);
async function setup(configure=()=>{}){
    const world=withM5LawRules(await loadWorld());
    for(const npc of world.npcs)if([victim,carrier,guard,judge,reviewer].includes(npc.id)){delete npc.schedule;if(npc.id!==carrier)delete npc.tier;}
    // Explicit procedural fixture; no missing shipped law is guessed.
    const code=world.rules.law.codes[0];code.appeal.judges=[reviewer];
    code.procedure={...code.procedure,evidence:{weights:{eyewitness:1,confession:2,document:2,statement:0},convictionThreshold:{theft:2,theft_attempt:2}},appealStaysExecution:false,refundOnReversal:true};
    // Existing characters stand in as faction listeners in this fixture only.
    world.rules.reputation.factions.find(row=>row.id===friend).members=[judge];
    world.rules.reputation.factions.find(row=>row.id===enemy).members=[carrier];
    world.rules.law.codes[0].faction=friend;
    configure(world);
    const engine=new WorldEngine(world);let document=engine.initialFromLegacy(seed,'reputation-law');
    document=officeScene(engine,document,{location:'bld_bs_watch',minute:600,present:['npc_bs_035_1']});
    document.state.location='bld_hw_qingdeng';document.state.npcs[victim].inventory.item_bread=4;
    document.state.npcs[guard].location=document.state.location;
    const run=async(c,tool,args,eventId)=>{const out=await engine.reduce(c,{tool,args,eventId});return{document:applyPatches(c,out.patches),result:out.result,patches:out.patches};};
    const law=(c,args,id)=>run(c,'world_law',args,id);
    return{world,engine,document,run,law};
}
async function convicted(f,{origin=f.document,event='incident',target=victim,court='bld_hw_council',official=judge,officer=guard}={}){
    let out=await f.run(origin,'world_crime',{operation:'steal',target,coins:1},event),c=out.document,id=out.result.case;
    c.state.npcs[officer].location=c.state.location;
    const confession=await f.law(c,{operation:'confess',case:id,authority:officer},`${event}_confess`);
    c=await filed(f,confession,`${event}_file`);
    c=(await f.run(c,'world_move',{destination:court},`${event}_court`)).document;
    c.state.npcs[official].location=court;
    // No carrier sees this hearing, and its whereabouts remain a fixture input.
    if(carrier!==official)c.state.npcs[carrier].location='loc_bs';
    out=await f.law(c,{operation:'hear',case:id,authority:official},`${event}_hear`);
    return{...out,id};
}
// S4-06 decision D: an incident becomes a case only through the NPC desk's
// independent acceptance of the actual confession. Reputation assertions stay.
async function filed(f,out,event){
    const location=out.document.state.location;
    const desk=officeScene(f.engine,out.document,{location:'bld_bs_watch',minute:out.document.state.minute,present:['npc_bs_035_1']});
    const accepted=await f.run(desk,'world_act',{action:'law:request_decision',slots:{request:out.result.request,authority:'npc_bs_035_1'}},event);
    assert.equal(accepted.result.accepted,true);assert.equal(accepted.result.decision.source.kind,'npc_decision');
    return officeScene(f.engine,accepted.document,{location,minute:accepted.document.state.minute,present:[]});
}

test('实际裁判入当地口碑及友方信誉，异地/敌方未知，公示不重复计账，旧记录栏隐藏见证者',async()=>{
    const f=await setup(),out=await convicted(f),c=out.document;
    assert.equal(account(c,'settlement','loc_hw').reputation,-4);
    assert.equal(account(c,'faction',friend).reputation,-4);
    assert.equal(account(c,'faction',friend).notoriety,2);
    assert.equal(account(c,'faction',enemy),undefined);assert.equal(account(c,'settlement','loc_bs'),undefined);
    const published=await f.law(c,{operation:'publish',case:out.id,authority:judge},'publish');
    assert.deepEqual(reputationView(published.document),reputationView(c));
    const view=readStateSection(c.state,'记录')[out.id];assert.equal(view,undefined); // Native legal cases are hidden entirely in this legacy section.
    const inspect=(await f.law(c,{operation:'inspect'},'inspect')).result;
    assert.equal(inspect.executionAuthority,true);assert.ok(inspect.notifications.some(m=>m.from===judge&&m.case===out.id));
    assert.ok(toolDefinitions().find(t=>t.function.name==='world_law').function.parameters.properties.operation.enum.includes('notify'));
});

test('同一裁判经真实携信后在两地形成不同口碑，敌方评价独立，听说不授予作证或跨区执法',async()=>{
    const f=await setup(),out=await convicted(f);let c=out.document;
    const memory=c.state.npcs[victim].memoryStream?.find(m=>m.legalCase===out.id);
    // The victim was not at the hearing; court publication is the source.
    assert.equal(memory,undefined);
    c.state.npcs[victim].location=c.state.location;
    c=(await f.law(c,{operation:'publish',case:out.id,authority:judge},'public_notice')).document;
    const notice=c.state.npcs[victim].memoryStream.find(m=>m.legalCase===out.id);
    const sent=await f.law(c,{operation:'notify',case:out.id,from:victim,to:carrier,memory:notice.id,channel:'carry'},'carry_notice');
    c=sent.document;assert.equal(account(c,'settlement','loc_bs'),undefined);assert.equal(c.state.npcs[carrier].legalKnowledge,undefined);
    const left=sent.result.arrive-c.state.minute;
    c=(await f.run(c,'world_time',{minutes:left-1},'almost')).document;
    assert.equal(account(c,'faction',enemy),undefined);
    c=(await f.run(c,'world_time',{minutes:1},'arrival')).document;
    assert.equal(c.state.npcCognition.messages[sent.result.messageId].status,'已交付');
    assert.equal(account(c,'settlement','loc_bs').reputation,-1);
    assert.equal(account(c,'faction',enemy).reputation,4);assert.equal(account(c,'faction',enemy).fame,2);assert.equal(account(c,'faction',enemy).notoriety,0);
    const heard=c.state.npcs[carrier].memoryStream.find(m=>m.legalCase===out.id);
    assert.equal(heard.sourceType,'听说');assert.equal(heard.sourceEvent,notice.sourceEvent);assert.equal(heard.heardFrom,victim);
    assert.equal(c.state.npcs[carrier].legalKnowledge,undefined);
    await assert.rejects(f.law(c,{operation:'report',case:out.id,authority:judge,reporter:carrier},'rumor_report'),/判罚|不在场|没有亲见/);
    c.state.location='loc_bs';
    await assert.rejects(f.law(c,{operation:'arrest',case:out.id,authority:carrier},'remote_arrest'),/辖区/);
    assert.equal((await f.law(c,{operation:'inspect'},'no_code')).result.executionAuthority,false);
    const unregulated=await f.run(c,'world_crime',{operation:'steal',target:carrier,coins:1},'no_authority');assert.equal(unregulated.result.case,null);
});

test('封路、私密消息或无来源传话不会先写异地声望',async()=>{
    const f=await setup(),out=await convicted(f);let c=out.document;
    c.state.npcs[victim].location=c.state.location;
    c=(await f.law(c,{operation:'publish',case:out.id,authority:judge},'notice')).document;
    const memory=c.state.npcs[victim].memoryStream.find(m=>m.legalCase===out.id),before=structuredClone(c);
    await assert.rejects(f.law(c,{operation:'notify',case:out.id,from:victim,to:carrier,memory:'invented'},'invented'),/没有/);
    const remote=structuredClone(c);remote.state.location='loc_hw';await assert.rejects(f.law(remote,{operation:'notify',case:out.id,from:victim,to:carrier,memory:memory.id},'remote_order'),/在场/);
    f.world.routes.forEach(route=>route.closedSeasons=[0,1,2,3]);
    await assert.rejects(f.law(c,{operation:'notify',case:out.id,from:victim,to:carrier,memory:memory.id},'closed'));
    assert.deepEqual(c,before);assert.equal(account(c,'settlement','loc_bs'),undefined);
    f.world.routes.forEach(route=>delete route.closedSeasons);
    memory.visibility='secret';
    await assert.rejects(f.law(c,{operation:'notify',case:out.id,from:victim,to:carrier,memory:memory.id},'private'),/私密/);
});

test('证伪和无出处的证词不够判罪，听说不变成独立见证，重复自认不加权',async()=>{
    const f=await setup();let out=await f.run(f.document,'world_crime',{operation:'steal',target:victim,coins:1},'evidence'),c=out.document,id=out.result.case;
    c.state.npcs[guard].location=c.state.location;
    c=await filed(f,await f.law(c,{operation:'confess',case:id,authority:guard},'evidence_confess'),'evidence_file');
    const row=c.state.records[id];row.reported=true;row.status='已报案';row.evidence=[
        {kind:'eyewitness',witness:carrier,testified:true,identified:true,minute:c.state.minute},
        {kind:'eyewitness',witness:victim,testified:true,identified:true,falseStatement:true,minute:c.state.minute},
        {kind:'confession',subject:victim,minute:c.state.minute}];
    row.witnesses=[victim];
    c=(await f.run(c,'world_move',{destination:'bld_hw_council'},'to_court')).document;c.state.npcs[judge].location=c.state.location;
    out=await f.law(c,{operation:'hear',case:id,authority:judge},'reject_forgery');
    assert.equal(out.result.convicted,false);assert.equal(out.result.evidenceScore,0);assert.deepEqual(reputationView(out.document),[]);
    c=out.document;c.state.records[id].evidence=[{kind:'confession',subject:'player',minute:c.state.minute},{kind:'confession',subject:'player',minute:c.state.minute}];
    f.world.rules.law.codes[0].evidenceRequired=3;
    // The new procedural table is the same threshold fixture, per offense.
    f.world.rules.law.codes[0].procedure.evidence.convictionThreshold[row.offense]=3;
    out=await f.law(c,{operation:'hear',case:id,authority:judge},'duplicate_confession');assert.equal(out.result.convicted,false);assert.equal(out.result.evidenceScore,2);
});

test('两个已配置辖区各用本地规则和钱库，跨村不接管旧案，缺法典不套默认刑罚',async()=>{
    const f=await setup(world=>{
        const code=structuredClone(world.rules.law.codes[0]);code.id='law_test_bs';code.name='仅测试辖区';code.locations=['loc_bs','bld_bs_shrine'];code.court='bld_bs_shrine';code.settlement='loc_bs';code.officers=[carrier];code.judges=[carrier];code.appeal.judges=[carrier];code.penalties.theft.baseFine=40;world.rules.law.codes.push(code);
        // 05 §5.2.2 / S4LAW: this fixture explicitly replaces Baishi's statute,
        // so its binding must name the same statute. Keep every penalty,
        // treasury, jurisdiction and conservation assertion below unchanged.
        world.rules.law.bindings.find(b=>b.place==='loc_bs').value=code.id;
    });
    const hw=await convicted(f);let origin=structuredClone(f.document);origin.state.location='loc_bs';origin.state.npcs[victim].location='loc_bs';origin.state.npcs[carrier].location='loc_bs';
    // Independent existing character court fixture, no new resident entity.
    const bs=await convicted(f,{origin,event:'bs_incident',court:'bld_bs_shrine',official:carrier,officer:carrier});
    assert.equal(bs.result.judgment.fine-hw.result.judgment.fine,30);
    let c=hw.document;c.state.npcs[judge].location=c.state.location;c=(await f.law(c,{operation:'pay',case:hw.id,authority:judge},'hw_payment')).document;
    let b=bs.document;b.state.npcs[carrier].location=b.state.location;b=(await f.law(b,{operation:'pay',case:bs.id,authority:carrier},'bs_payment')).document;
    assert.equal(c.state.records['legal_treasury:law_hw_property'].coins,hw.result.judgment.fine);
    assert.equal(b.state.records['legal_treasury:law_test_bs'].coins,bs.result.judgment.fine);
    assert.equal(money(c),money(f.document));assert.equal(money(b),money(origin));
    c.state.location='loc_bs';await assert.rejects(f.law(c,{operation:'pay',case:hw.id,authority:carrier},'cross_village'),/辖区/);
});

test('上诉维持原判不新增钱物或声望，已缴付和已服刑不可重罚',async()=>{
    const f=await setup(),out=await convicted(f),before=out.document;
    before.state.npcs[reviewer].location=before.state.location;
    const accepted=await f.law(before,{operation:'appeal',case:out.id,authority:reviewer},'appeal_accept');
    assert.equal(accepted.result.accepted,true);assert.deepEqual(accepted.document.state.records[out.id].judgment,before.state.records[out.id].judgment);
    const appeal=await f.law(accepted.document,{operation:'request_review',case:out.id,authority:reviewer},'appeal');let c=appeal.document;
    assert.equal(appeal.result.upheld,true);assert.equal(c.state.records[out.id].judgment.fine,before.state.records[out.id].judgment.fine);assert.equal(c.state.records[out.id].judgment.compensation,before.state.records[out.id].judgment.compensation);assert.equal(c.state.records[out.id].judgment.judge,reviewer);
    assert.equal(money(c),money(before));assert.deepEqual(reputationView(c),reputationView(before));
    await assert.rejects(f.law(c,{operation:'appeal',case:out.id,authority:judge},'appeal_twice'),/重复/);
    c=(await f.law(c,{operation:'pay',case:out.id,authority:judge},'pay')).document;assert.equal(money(c),money(f.document));
    await assert.rejects(f.law(c,{operation:'pay',case:out.id,authority:judge},'pay_again'),/重复/);
    await assert.rejects(f.law(c,{operation:'appeal',case:out.id,authority:judge},'late_appeal'),/重复/);
    const labor=await f.law(before,{operation:'labor',case:out.id,authority:judge},'labor');
    let served=(await f.run(labor.document,'world_time',{minutes:labor.result.sentenceMinutes},'serve')).document;
    assert.equal(served.state.records[out.id].fineDischarged,true);assert.equal(served.state.records[out.id].sentenceCompleted,labor.document.state.minute+labor.result.sentenceMinutes);
    served.state.npcs[judge].location=served.state.location;
    await assert.rejects(f.law(served,{operation:'labor',case:out.id,authority:judge},'labor_again'),/已裁定/);
    assert.equal(money(served),money(before));
});

test('复核证伪撤判，改正消息抵达后才抵消异地旧评价',async()=>{
    const f=await setup(),out=await convicted(f);let c=out.document;
    c.state.npcs[victim].location=c.state.location;c=(await f.law(c,{operation:'publish',case:out.id,authority:judge},'old_notice')).document;
    const oldMemory=c.state.npcs[victim].memoryStream.find(m=>m.legalCase===out.id);
    const sent=await f.law(c,{operation:'notify',case:out.id,from:victim,to:carrier,memory:oldMemory.id},'old_carry');
    c=(await f.run(sent.document,'world_time',{minutes:sent.result.arrive-sent.document.state.minute},'old_delivery')).document;
    c.state.records[out.id].evidence.forEach(e=>{e.disproven=true;});c.state.npcs[judge].location=c.state.location;
    c.state.npcs[reviewer].location=c.state.location;
    const accepted=await f.law(c,{operation:'appeal',case:out.id,authority:reviewer},'overturn_accept');
    assert.equal(accepted.result.accepted,true);
    const appeal=await f.law(accepted.document,{operation:'request_review',case:out.id,authority:reviewer},'overturn');c=appeal.document;
    assert.equal(appeal.result.upheld,false);assert.equal(account(c,'settlement','loc_hw').reputation,0);
    assert.equal(account(c,'settlement','loc_bs').reputation,-1);
    // Correction travels by an actual second journey with an existing carrier.
    c.state.npcs[victim].location=c.state.location;c=(await f.law(c,{operation:'publish',case:out.id,authority:judge},'correction')).document;
    const correction=c.state.npcs[victim].memoryStream.find(m=>m.legalStage==='overturned');
    const correctionSent=await f.law(c,{operation:'notify',case:out.id,from:victim,to:carrier,memory:correction.id},'correction_carry');
    c=(await f.run(correctionSent.document,'world_time',{minutes:correctionSent.result.arrive-correctionSent.document.state.minute},'corrected_delivery')).document;
    assert.equal(account(c,'settlement','loc_bs').reputation,0);assert.equal(account(c,'faction',enemy).fame,0);
    assert.equal(c.state.npcs[carrier].legalKnowledge,undefined);
    // A newly verified evidence fixture permits a new hearing under the old
    // procedure. Publication must describe that ruling, not the older appeal.
    c.state.records[out.id].evidence=[{kind:'confession',subject:'player',minute:c.state.minute}];
    c.state.npcs[judge].location=c.state.location;
    const retried=await f.law(c,{operation:'hear',case:out.id,authority:judge},'new_hearing');c=retried.document;
    assert.equal(retried.result.convicted,true);assert.equal(account(c,'settlement','loc_hw').reputation,-4);assert.equal(account(c,'settlement','loc_bs').reputation,0);
    const republished=await f.law(c,{operation:'publish',case:out.id,authority:judge},'new_publication');
    assert.equal(republished.result.sourceEvent,'new_hearing:law:conviction');
});

test('旧案件没有新增字段仍能履行并重放，历史patch保持原样',async()=>{
    const f=await setup(),out=await convicted(f),old=structuredClone(out.document);
    const row=old.state.records[out.id];for(const field of ['procedureVersion','settlement','faction','sourceEvent','witnesses','reputationEvents','reputationHistory'])delete row[field];
    for(const npc of Object.values(old.state.npcs))npc.memoryStream=npc.memoryStream?.filter(m=>m.legalCase!==out.id);
    for(const[id,row]of Object.entries(old.state.records))if(row.category==='reputation')delete old.state.records[id];
    const before=structuredClone(old),paid=await f.law(old,{operation:'pay',case:out.id,authority:judge},'legacy_pay');
    assert.equal(paid.document.state.records[out.id].status,'已结案');assert.equal(money(paid.document),money(old));assert.deepEqual(old,before);
    const replay=await f.engine.reduce(old,{tool:'world_law',args:{operation:'pay',case:out.id,authority:judge},eventId:'legacy_pay'},{replay:true,result:paid.result});
    assert.deepEqual(applyPatches(old,replay.patches),paid.document);
});

test('犯罪和裁判回执按现行规则重放同一案件与声望，付款守恒',async()=>{
    const f=await setup(),input={tool:'world_crime',args:{operation:'steal',target:victim,coins:1},eventId:'historical_theft'};
    const current=await f.engine.reduce(f.document,input),expected=applyPatches(f.document,current.patches),receipt=structuredClone(current.result);
    const replay=await f.engine.reduce(f.document,input,{replay:true,result:receipt});
    assert.deepEqual(applyPatches(f.document,replay.patches),expected);
    const judgment=await convicted(f),before=judgment.document;
    const args={operation:'pay',case:judgment.id,authority:judge},paid=await f.law(before,args,'replayed_pay');
    const replayed=await f.engine.reduce(before,{tool:'world_law',args,eventId:'replayed_pay'},{replay:true,result:paid.result});
    const after=applyPatches(before,replayed.patches);
    assert.deepEqual(after,paid.document);assert.equal(after.state.records[judgment.id].status,'已结案');
    assert.deepEqual(reputationView(after),reputationView(paid.document));assert.equal(money(after),money(before));
});
