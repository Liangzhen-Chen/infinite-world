import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {lawView} from '../server-plugin/law.mjs';
import {shopStores} from '../server-plugin/shop.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile(new URL('fixtures/legacy/seed.json',import.meta.url),'utf8'));
const DAY=1440,victim='npc_hw_linsui',guard='npc_hw_gucen',judge='npc_hw_chenbai',hunter='npc_hw_wushuo',ypGuard='npc_yp_renbo',ypOfficer='npc_yp_lisha';
const court='bld_hw_council',villages=['law_hw_property','law_yp_property','law_wt_property','law_lq_property','law_sb_property'];
const money=c=>c.state.player.coins+Object.values(c.state.npcs).reduce((n,a)=>n+(a.coins??0),0)+Object.values(c.state.records).filter(r=>['legal_treasury','legal_deposit'].includes(r.category)).reduce((n,r)=>n+r.coins,0);

// Quiet world: people stay where the fixture puts them; the hunter keeps a full profile and a fixed day.
function fixture({randomSeed}={}){
    const w=structuredClone(world);
    for(const n of w.npcs){delete n.schedule;if(n.id!==hunter)delete n.tier;}
    w.npcs.find(n=>n.id===hunter).schedule={default:[{start:0,end:1440,location:'loc_hw_northwood',activity:'巡山',services:[]}]};
    const engine=new WorldEngine(w);let doc=engine.createCharacter(seed,{},'bounty-test');
    if(randomSeed)doc.randomSeed=randomSeed;
    doc.state.minute=600;doc.state.location='loc_bs';doc.state.player.coins=500;
    // This quiet legal fixture needs no imports. W8-E8 adds an initially empty
    // sickle shelf (one costs 10 * scarcity 2 = 20); start all registered shelves
    // full so unrelated stock purchases cannot leave the legal cash perimeter.
    // The unchanged equality below still catches every lost bounty/refund coin.
    for(const shop of shopStores(w))for(const row of shop.restock){
        const bag=doc.state.npcs[shop.keeper].inventory,old=bag[row.item];
        bag[row.item]=typeof old==='object'?{...old,quantity:row.maximum}:row.maximum;
    }
    for(const id of Object.keys(doc.state.npcs))doc.state.npcs[id]={...doc.state.npcs[id],location:'loc_capital',activity:'休息',status:'正常'};
    const place=(id,location,activity='当值')=>{doc.state.npcs[id]={...doc.state.npcs[id],location,activity,status:'正常',coins:doc.state.npcs[id].coins??0};};
    place(victim,'bld_hw_qingdeng','营业');doc.state.npcs[victim].coins=200;
    place(guard,'loc_hw_gate');place(judge,court);place(hunter,'loc_hw_northwood','巡山');place(ypGuard,'loc_bs_yupo','巡看');place(ypOfficer,'bld_yp_hall');
    const act=async(tool,args,eventId)=>{const out=await engine.reduce(doc,{tool,args,eventId});doc=applyPatches(doc,out.patches);return out.result;};
    return {engine,act,place,get doc(){return doc;},set doc(v){doc=v;}};
}
function judgedCase(doc,{id='legal_case:t_theft',fine=20,minute=600}={}){
    doc.state.records[id]={category:'legal_case',id,law:'law_hw_property',procedureVersion:1,settlement:'loc_hw',offender:'player',victim,offense:'theft',value:10,stolen:{coins:10},
        location:'bld_hw_qingdeng',minute,status:'已裁定',reported:true,receiver:guard,reportedAt:minute,evidence:[],
        judgment:{judge,minute,fine,compensation:10,evidenceScore:2,communityMinutes:600,prisonMinutes:1200}};
    return id;
}
const wantedOf=(doc,caseId)=>doc.state.records[doc.state.records[caseId].wanted];

test('判决后逾期未到案生成通缉：范围含协查五村，文书按路线延迟抵达，悬赏从受害人认捐进法院钱库并上告示，钱数守恒',async()=>{
    const f=fixture(),caseId=judgedCase(f.doc),total=money(f.doc);
    await f.act('world_time',{minutes:2*DAY},'wait_short');
    assert.equal(f.doc.state.records[caseId].wanted,undefined,'未过到案期限不通缉');
    await f.act('world_time',{minutes:DAY},'wait_due');
    const w=wantedOf(f.doc,caseId);
    assert.equal(w.category,'legal_wanted');assert.equal(w.status,'生效');assert.equal(w.reason,'判决后逾期未到案');assert.equal(w.subject,'player');
    assert.deepEqual([...w.scope].sort(),[...villages].sort());
    assert.equal(w.reach.law_hw_property,w.issuedAt+60);
    assert.ok(w.reach.law_yp_property>w.reach.law_hw_property+120,'邻村文书要沿路走到');
    assert.equal(w.bounty,40);assert.equal(w.pledge.coins,40);assert.equal(f.doc.state.npcs[victim].coins,160);
    const fund=f.doc.state.records['legal_treasury:law_hw_property'];assert.equal(fund.coins,40);assert.equal(fund.reserved,40);
    const quest=f.doc.state.quests[w.quest];assert.equal(quest.boardVersion,'bounty');assert.equal(quest.location,court);assert.equal(quest.reward,40);assert.ok(['公开','进行中'].includes(quest.status));
    assert.equal(money(f.doc),total);
    // Relay: the far village knows only after the courier arrives.
    assert.equal((f.doc.state.npcs[ypGuard].legalKnowledge??[]).some(k=>k.case===caseId),false);
    await f.act('world_time',{minutes:w.reach.law_yp_property-f.doc.state.minute+1},'relay');
    assert.ok(f.doc.state.npcs[ypGuard].legalKnowledge.some(k=>k.case===caseId&&k.source==='通缉文书'));
    assert.ok(f.doc.state.npcs[ypGuard].memoryStream.some(m=>m.legalCase===caseId&&m.legalStage==='wanted'));
    const view=lawView(f.engine,f.doc);assert.equal(view.wanted[0].case,caseId);assert.equal(view.wanted[0].reachedHere,false);
    await assert.rejects(f.act('world_quest',{operation:'accept',quest:w.quest},'self'),/不能悬赏缉拿自己/);
});

test('范围外不被认出；进入已获文书的村子，巡看人认出并当场扣下，押到发布法院后通缉解除，执法者不领赏，认捐退回',async()=>{
    const f=fixture(),caseId=judgedCase(f.doc,{minute:600-3*DAY});
    await f.act('world_time',{minutes:DAY},'issue');
    const w=wantedOf(f.doc,caseId);
    await f.act('world_time',{minutes:DAY},'outside');
    assert.equal(Object.values(f.doc.state.records).some(r=>r.category==='legal_custody'),false,'白石镇不在协查范围');
    f.doc.state.location='loc_bs_yupo';
    let held=null;
    for(let i=0;i<40&&!held;i++){await f.act('world_time',{minutes:30},`linger_${i}`);held=Object.values(f.doc.state.records).find(r=>r.category==='legal_custody'&&r.reason==='到案'&&r.status==='生效');}
    assert.ok(held,'巡看人认出通缉之人');assert.equal(held.captor,ypGuard);assert.equal(held.location,'loc_bs_yupo');
    assert.equal(wantedOf(f.doc,caseId).sightings.at(-1).reaction,'拦截');
    await assert.rejects(f.act('world_move',{destination:'loc_bs'},'run'),/羁押/);
    await f.act('world_time',{minutes:held.expires-f.doc.state.minute},'escorted');
    assert.equal(f.doc.state.location,court);
    const after=f.doc.state.records[w.id];assert.equal(after.status,'已到案');
    assert.equal(f.doc.state.records[caseId].status,'已裁定');assert.ok(f.doc.state.records[caseId].appearedAt>=held.expires);
    assert.equal(f.doc.state.records['legal_treasury:law_hw_property'].reserved,0);assert.equal(f.doc.state.npcs[victim].coins,200,'执法者押到不领赏，认捐退回');
    // Paying the fine now closes the case; no new notice is issued.
    await f.act('world_law',{operation:'pay',case:caseId,authority:judge},'pay');
    await f.act('world_time',{minutes:4*DAY},'later');
    assert.equal(f.doc.state.records[caseId].status,'已结案');assert.equal(Object.values(f.doc.state.records).filter(r=>r.category==='legal_wanted').length,1);
});

test('NPC赏金猎人按推进注册表离屏追捕：目标在范围外追期满落空；在范围内追获后押到法院领赏',async()=>{
    const f=fixture(),caseId=judgedCase(f.doc,{minute:600-3*DAY});
    await f.act('world_time',{minutes:DAY},'issue');
    const w=wantedOf(f.doc,caseId);
    await f.act('world_time',{minutes:DAY},'board');
    let q=f.doc.state.quests[w.quest];assert.equal(q.taker,hunter);assert.equal(q.status,'进行中');
    await f.act('world_time',{minutes:8*DAY},'cold_trail');
    const failed=f.doc.state.records[w.id];
    assert.ok(failed.history.some(h=>h.kind==='追踪无果'));assert.ok(failed.history.some(h=>h.kind==='追捕落空'&&h.by===hunter));
    assert.ok(failed.gaveUp.includes(hunter));assert.equal(f.doc.state.quests[w.quest].status,'公开');
    assert.ok(f.doc.state.npcs[hunter].memoryStream.some(m=>/落空/.test(m.content)));
    // Inside the notice's reach the same hunter (on another campaign) can run the player down.
    let caught=null;
    for(let s=0;s<30&&!caught;s++){
        const g=fixture({randomSeed:`bounty-hunt-${s}`}),id=judgedCase(g.doc,{minute:600-3*DAY});g.doc.state.location='loc_hw_fields';
        await g.act('world_time',{minutes:DAY},'issue');const total=money(g.doc);
        for(let day=0;day<7&&!caught;day++){await g.act('world_time',{minutes:DAY},`day_${day}`);
            const lock=Object.values(g.doc.state.records).find(r=>r.category==='legal_custody'&&r.reason==='到案'&&r.status==='生效');
            if(lock)caught={g,id,lock,total};}
    }
    assert.ok(caught,'范围内追捕能得手');
    const {g,id,lock,total}=caught,before=g.doc.state.npcs[hunter].coins;
    assert.equal(lock.captor,hunter);assert.ok(wantedOf(g.doc,id).history.some(h=>h.kind==='追获'));
    await g.act('world_time',{minutes:lock.expires-g.doc.state.minute},'escort');
    const done=wantedOf(g.doc,id);assert.equal(done.status,'已到案');assert.equal(g.doc.state.location,court);
    assert.equal(g.doc.state.npcs[hunter].coins,before+done.bounty);assert.equal(g.doc.state.quests[done.quest].status,'已完成');assert.equal(money(g.doc),total);
});

test('脱逃羁押立即通缉；自首押到法院解除通缉',async()=>{
    const f=fixture(),caseId=judgedCase(f.doc);
    f.doc.state.location=court;
    await f.act('world_law',{operation:'labor',case:caseId,authority:judge},'labor');
    f.doc.state.location='loc_hw_gate';f.doc.state.npcs[guard].location='loc_hw_gate';
    await f.act('world_time',{minutes:1},'slip');
    const w=wantedOf(f.doc,caseId);assert.equal(w.reason,'脱逃羁押');assert.equal(f.doc.state.records[caseId].remainingSentence.type,'labor');
    const custody=Object.values(f.doc.state.records).find(r=>r.category==='legal_custody'&&r.case===caseId&&r.status==='已中止');assert.equal(custody.wanted,w.id);
    const out=await f.act('world_law',{operation:'confess',case:caseId,authority:guard},'surrender');
    assert.equal(out.surrendered,true);assert.equal(f.doc.state.location,court);assert.equal(f.doc.state.records[w.id].status,'已到案');
    assert.equal(f.doc.state.records[w.id].rewardPaid,undefined);
});

test('贿赂：价码按廉洁度与立场，出价不足拒收并记行贿未遂；无人看破则撤案；看破则行贿成罪、受贿者撤职潜逃并被悬赏，玩家接赏缉拿交付领赏',async()=>{
    const base=fixture();base.doc.state.location='loc_hw_gate';
    const pending=id=>{base.doc.state.records[id]={category:'legal_case',id,law:'law_hw_property',procedureVersion:1,offender:'player',victim,offense:'theft',value:10,stolen:{coins:10},location:'loc_hw_gate',minute:600,
        status:'已报案',reported:true,receiver:guard,reportedAt:600,evidence:[{kind:'eyewitness',witness:guard,identified:true,testified:true,minute:600}]};};
    pending('legal_case:t_pending');const start=structuredClone(base.doc);
    // Refused: 80 integrity asks 1.6 times the stake (fine 20).
    let out=await base.act('world_law',{operation:'bribe',case:'legal_case:t_pending',authority:guard,coins:10},'low_offer');
    assert.equal(out.accepted,false);assert.equal(base.doc.state.player.coins,500);
    assert.equal(base.doc.state.records[out.bribeCase].offense,'bribery_attempt');assert.equal(base.doc.state.records[out.bribeCase].status,'已报案');
    // Accepted unseen: the case is dropped.
    base.doc=structuredClone(start);
    out=await base.act('world_law',{operation:'bribe',case:'legal_case:t_pending',authority:guard,coins:40},'quiet_offer');
    assert.equal(out.accepted,true);assert.equal(out.exposed,false);assert.deepEqual(out.effects,['撤案']);
    assert.equal(base.doc.state.records['legal_case:t_pending'].status,'已撤案');assert.equal(base.doc.state.player.coins,460);
    assert.equal(Object.values(base.doc.state.records).find(r=>r.category==='legal_bribe').discovered,false);
    // Seen through by someone present.
    let exposed=null;
    for(let i=0;i<40&&!exposed;i++){
        base.doc=structuredClone(start);base.place(victim,'loc_hw_gate','路过');base.place(judge,court);
        const r=await base.act('world_law',{operation:'bribe',case:'legal_case:t_pending',authority:guard,coins:40},`seen_${i}`);if(r.exposed)exposed=r;
    }
    assert.ok(exposed,'在场旁人能看破行贿');const doc=base.doc,total=money(doc);
    assert.equal(doc.state.records['legal_case:t_pending'].status,'已报案','被看破则不撤案');
    assert.equal(doc.state.records[exposed.bribeCase].offense,'bribery');
    const corruption=doc.state.records[exposed.corruptionCase];assert.equal(corruption.offender,guard);assert.equal(corruption.offense,'corruption');
    assert.equal(doc.state.records[`legal_dismissal:${guard}`].category,'legal_dismissal');
    const event=Object.values(doc.state.records).find(r=>r.category==='world_event'&&r.tags?.includes('bribery'));
    assert.equal(event.verb,'breach');assert.equal(event.actor,guard);
    const w=doc.state.records[exposed.wanted];assert.equal(w.subject,guard);assert.equal(w.reason,'受贿事发潜逃');assert.ok(w.bounty>0);
    assert.equal(doc.state.npcs[guard].fugitive,w.id);
    await assert.rejects(base.act('world_law',{operation:'report',case:'legal_case:t_pending',authority:guard,reporter:victim},'dismissed'),/撤职/);
    // Player bounty: accept, wait for the notice to be posted here, seize, escort, hand in at the court.
    await base.act('world_quest',{operation:'accept',quest:w.quest},'take');
    await assert.rejects(base.act('world_law',{operation:'arrest',case:exposed.corruptionCase},'too_soon'),/文书未到/);
    await base.act('world_time',{minutes:61},'posted');
    let seized=false;
    for(let i=0;i<30&&!seized;i++){
        const r=await base.act('world_law',{operation:'arrest',case:exposed.corruptionCase},`seize_${i}`);seized=r.captured;
        if(!seized){await assert.rejects(base.act('world_law',{operation:'arrest',case:exposed.corruptionCase},`again_${i}`),/甩脱/);await base.act('world_time',{minutes:60},`regroup_${i}`);}
    }
    assert.ok(seized);assert.ok(base.doc.state.player.companions.includes(guard));
    await assert.rejects(base.act('world_quest',{operation:'complete',quest:w.quest},'early'),/押到/);
    await base.act('world_move',{destination:court},'escort');
    assert.equal(base.doc.state.npcs[guard].location,court);
    const coins=base.doc.state.player.coins,paid=await base.act('world_quest',{operation:'complete',quest:w.quest},'deliver');
    assert.equal(paid.reward,w.bounty);assert.equal(base.doc.state.player.coins,coins+w.bounty);
    assert.equal(base.doc.state.records[w.id].status,'已到案');assert.equal(base.doc.state.records[exposed.corruptionCase].status,'已到案');
    assert.equal(base.doc.state.player.companions.includes(guard),false);assert.equal(base.doc.state.records[`legal_detention:${w.id}`].subject,guard);
    assert.equal(money(base.doc),total);
});
