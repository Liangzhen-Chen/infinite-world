import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import fc from 'fast-check';
import {loadWorld}from'../tools/load-world.mjs';
import {withLawRules}from'../world/design/law-foundation.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {CampaignStorage,applyPatches}from'../server-plugin/storage.mjs';
import {validateWorld}from'../tools/validate-world.mjs';
import {readStateSection}from'../extension/state-read.mjs';
import {lawView}from'../server-plugin/law.mjs';

const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const victim='npc_hw_linsui',guard='npc_hw_gucen',judge='npc_hw_chenbai';
const money=c=>c.state.player.coins+Object.values(c.state.npcs).reduce((sum,a)=>sum+a.coins,0)+Object.values(c.state.records).filter(r=>['legal_treasury','legal_deposit'].includes(r.category)).reduce((sum,r)=>sum+r.coins,0);
async function setup(){
    const world=withLawRules(await loadWorld()),engine=new WorldEngine(world),document=engine.initialFromLegacy(seed,'law-test');
    document.state.location='bld_hw_qingdeng';document.state.npcs[victim].inventory.item_bread=4;
    const run=async(c,tool,args,eventId)=>{const out=await engine.reduce(c,{tool,args,eventId});return{document:applyPatches(c,out.patches),result:out.result};};
    return{world,engine,document,run};
}
async function theft(run,c,{success=true,seen=null,args={item:'item_bread'}}={}){
    for(let i=0;i<500;i++){
        const eventId=`theft_sample_${i}`,out=await run(c,'world_crime',{operation:'steal',target:victim,...args},eventId);
        if(out.result.checkSuccess===success&&(seen===null||out.result.witnesses.length===seen))return{...out,eventId};
    }
    throw new Error('找不到需要的独立犯罪检定样本');
}
async function confessed(run,c,caseId){
    // Isolated procedural fixture: officer has physically come to the player's scene.
    c=structuredClone(c);c.state.npcs[guard].location=c.state.location;
    return(await run(c,'world_law',{operation:'confess',case:caseId,authority:guard},'confess')).document;
}
async function judged(run,c,caseId){
    c=await confessed(run,c,caseId);
    c=(await run(c,'world_move',{destination:'bld_hw_council'},'walk_to_court')).document;
    return(await run(c,'world_law',{operation:'hear',case:caseId,authority:judge},'hearing')).document;
}

test('认罪缺执法者返回可纠正候选；自认标志不与已报案混淆',async()=>{
    const{document,run,engine}=await setup();document.state.npcs[guard].location=document.state.location;
    const incident=await theft(run,document),before=structuredClone(incident.document);
    assert.equal(lawView(engine,before).cases[0].confessed,false);
    await assert.rejects(run(before,'world_law',{operation:'confess',case:incident.result.case},'bad_confession'),/authority.*顾岑/);
    assert.deepEqual(incident.document,before);
    const accepted=await run(before,'world_law',{operation:'confess',case:incident.result.case,authority:guard},'good_confession');
    assert.equal(lawView(engine,accepted.document).cases[0].confessed,true);
});

test('偷窃实际转一件库存并保留唯一身份，失败不转财物，钱币偷取守恒且不会无依据定罪',async()=>{
    const{document,run}=await setup(),original=structuredClone(document);
    const good=await theft(run,document),unit=good.result.stolen.unit,c=good.document;
    assert.equal(c.state.npcs[victim].inventory.item_bread.quantity,3);assert.equal(c.state.inventory.item_bread.quantity,1);
    assert.equal(c.state.itemInstances[unit].owner,'player');assert.equal(c.state.itemInstances[unit].maker,null);
    assert.equal(c.state.itemInstances[unit].legalClaims[0].case,good.result.case);
    assert.equal(c.state.records[good.result.case].status,'未报案');assert.equal(c.state.npcs[guard].legalKnowledge,undefined);
    assert.equal(c.state.minute,document.state.minute+5);assert.equal(money(c),money(document));assert.deepEqual(document,original);
    const failed=await theft(run,document,{success:false});assert.deepEqual(failed.document.state.inventory,document.state.inventory);
    assert.equal(failed.document.state.npcs[victim].inventory.item_bread,4);assert.equal(failed.document.state.records[failed.result.case].offense,'theft_attempt');
    const coins=await theft(run,document,{args:{coins:10}});assert.equal(coins.document.state.player.coins,document.state.player.coins+10);assert.equal(coins.document.state.npcs[victim].coins,document.state.npcs[victim].coins-10);assert.equal(money(coins.document),money(document));
});

test('偷窃拒绝空库存、他处目标、死亡和非法金额与编号冲突，原存档保持不变',async()=>{
    const{document,run}=await setup();
    for(const[change,args,error]of[
        [c=>delete c.state.npcs[victim].inventory.item_bread,{item:'item_bread'},/没有/],
        [c=>c.state.npcs[victim].location='loc_hw_gate',{item:'item_bread'},/不在场/],
        [c=>c.state.npcs[victim].status='死亡',{coins:10},/清醒/],
        [()=>{},{coins:21},/范围/],
        [()=>{},{item:'item_bread',coins:10},/不能同时/],
        [()=>{},{item:'item_bread',instance:'unit_fiction'},/库存/],
        [c=>c.state.records['legal_case:reserved']={category:'contract',content:'既有记录'},{item:'item_bread'},/占用/],
    ]){const c=structuredClone(document);change(c);const before=structuredClone(c);await assert.rejects(run(c,'world_crime',{operation:'steal',target:victim,...args},'reserved'),error);assert.deepEqual(c,before);}
});

test('没被看见不降低个人信任，目击仅记录在场清醒人物，未作证者不能被全局认定知情执法',async()=>{
    const{document,run}=await setup(),hidden=await theft(run,document,{seen:0});
    assert.equal(hidden.document.state.npcs[victim].trust,document.state.npcs[victim].trust);
    const sleep=structuredClone(document);sleep.state.npcs.npc_hw_hezhou.activity='熟睡';
    const out=await theft(run,sleep);assert.ok(!out.result.witnesses.includes('npc_hw_hezhou'));
    const c=structuredClone(out.document);c.state.npcs[guard].location=c.state.location;
    await assert.rejects(run(c,'world_law',{operation:'report',case:out.result.case,authority:guard,reporter:guard},'forged_report'),/没有亲见/);
    const records=readStateSection(out.document.state,'记录'),npcs=readStateSection(out.document.state,'人物');
    assert.equal(records[out.result.case].evidence,undefined);assert.equal(npcs[victim].legalKnowledge,undefined);
});

test('目击必须实际报案，单个证词不足；两人独立作证可裁判，重复作证不加权',async()=>{
    const{document,run}=await setup(),incident=await theft(run,document,{seen:2});let c=incident.document;
    c.state.npcs[guard].location=c.state.location;
    c=(await run(c,'world_law',{operation:'report',case:incident.result.case,authority:guard,reporter:victim},'report_1')).document;
    await assert.rejects(run(c,'world_law',{operation:'report',case:incident.result.case,authority:guard,reporter:victim},'report_twice'),/重复/);
    c=(await run(c,'world_move',{destination:'bld_hw_council'},'court_1')).document;
    const first=await run(c,'world_law',{operation:'hear',case:incident.result.case,authority:judge},'insufficient');
    assert.equal(first.result.convicted,false);assert.equal(first.document.state.records[incident.result.case].status,'证据不足');
    c=(await run(first.document,'world_move',{destination:'bld_hw_qingdeng'},'back')).document;
    c=(await run(c,'world_law',{operation:'report',case:incident.result.case,authority:guard,reporter:'npc_hw_hezhou'},'report_2')).document;
    c=(await run(c,'world_move',{destination:'bld_hw_council'},'court_2')).document;
    const second=await run(c,'world_law',{operation:'hear',case:incident.result.case,authority:judge},'adequate');
    assert.equal(second.result.convicted,true);assert.equal(second.result.judgment.evidenceScore,2);
    assert.equal(second.document.state.player.coins,document.state.player.coins);
});

test('逮捕须充分证据和在场乡巡，沿路线押解，未审超时释放，不提前罚款',async()=>{
    const{engine,document,run}=await setup(),incident=await theft(run,document);let c=incident.document;
    c.state.npcs[guard].location=c.state.location;
    await assert.rejects(run(c,'world_law',{operation:'arrest',case:incident.result.case,authority:guard},'no_evidence'),/证据/);
    c=await confessed(run,c,incident.result.case);
    const route=engine.route(c.state.location,'bld_hw_council','walk',c.state.minute),arrested=await run(c,'world_law',{operation:'arrest',case:incident.result.case,authority:guard},'arrest');
    assert.equal(arrested.document.state.location,'bld_hw_council');assert.equal(arrested.document.state.npcs[guard].location,'bld_hw_council');
    assert.equal(arrested.document.state.minute,c.state.minute+route.minutes);assert.equal(arrested.document.state.player.coins,c.state.player.coins);
    await assert.rejects(run(arrested.document,'world_move',{destination:'loc_hw'},'escape'),/羁押/);
    const released=(await run(arrested.document,'world_time',{minutes:1440},'custody_expired')).document;
    assert.equal(released.state.records[`legal_custody:${incident.result.case}`].status,'已结束');
    await run(released,'world_move',{destination:'loc_hw'},'free_after_expiry');
});

test('法院实际保管原物与罚款，受害人未到场不瞬间获赔，到场领取不复制单件',async()=>{
    const{document,run}=await setup(),incident=await theft(run,document);let c=await judged(run,incident.document,incident.result.case);
    const paid=await run(c,'world_law',{operation:'pay',case:incident.result.case,authority:judge},'pay');c=paid.document;
    assert.equal(paid.result.compensation,0);assert.equal(c.state.inventory.item_bread,undefined);assert.equal(money(c),money(document));
    const unit=incident.result.stolen.unit;assert.equal(c.state.itemInstances[unit].status,'保管');assert.equal(c.state.npcs[victim].inventory.item_bread.quantity,3);
    await assert.rejects(run(c,'world_law',{operation:'claim',case:incident.result.case,authority:judge,claimant:victim},'remote_claim'),/不在场/);
    await assert.rejects(run(c,'world_law',{operation:'pay',case:incident.result.case,authority:judge},'pay_twice'),/重复/);
    c.state.npcs[victim].location='bld_hw_council';
    const claimed=await run(c,'world_law',{operation:'claim',case:incident.result.case,authority:judge,claimant:victim},'claim');c=claimed.document;
    assert.equal(c.state.npcs[victim].inventory.item_bread.quantity,4);assert.equal(c.state.itemInstances[unit].owner,victim);
    assert.equal(Object.keys(c.state.itemInstances).length,1);assert.equal(money(c),money(document));
    await assert.rejects(run(c,'world_law',{operation:'claim',case:incident.result.case,authority:judge,claimant:victim},'claim_twice'),/已经/);
});

test('赃物转手保留署名和去向，法院不能从无辜买家口袋复制原物，改以真实钱赔偿',async()=>{
    const{document,run}=await setup(),incident=await theft(run,document),unit=incident.result.stolen.unit;
    let c=incident.document;c=(await run(c,'world_trade',{buyer:'npc_hw_hezhou',seller:'player',item:'item_bread',quantity:1,instances:[unit]},'sell_stolen')).document;
    assert.equal(c.state.itemInstances[unit].owner,'npc_hw_hezhou');assert.equal(c.state.itemInstances[unit].maker,null);
    c=await judged(run,c,incident.result.case);
    const paid=await run(c,'world_law',{operation:'pay',case:incident.result.case,authority:judge},'money_restitution');
    assert.equal(paid.result.compensation,incident.document.state.records[incident.result.case].value);
    assert.equal(paid.result.returnedUnit,null);assert.equal(paid.document.state.itemInstances[unit].owner,'npc_hw_hezhou');assert.equal(money(paid.document),money(document));
});

test('劳役/监禁必须经过真实时长，禁止期间自由行动；赔偿债务保留，折役不伪称已收罚金',async()=>{
    for(const operation of['labor','prison']){
        const{document,run}=await setup(),incident=await theft(run,document);let c=await judged(run,incident.document,incident.result.case);
        const sentenced=await run(c,'world_law',{operation,case:incident.result.case,authority:judge},`sentence_${operation}`);c=sentenced.document;
        assert.equal(c.state.records[incident.result.case].status,'服役中');
        await assert.rejects(run(c,'world_trade',{seller:victim,item:'item_bread',quantity:1},'buy_in_prison'),/服役/);
        c=(await run(c,'world_time',{minutes:sentenced.result.sentenceMinutes-1},'almost_done')).document;
        assert.equal(c.state.records[incident.result.case].status,'服役中');
        c=(await run(c,'world_time',{minutes:1},'finished')).document;
        assert.equal(c.state.records[incident.result.case].status,'待赔偿');assert.equal(c.state.records[incident.result.case].finePaid,0);
        c=(await run(c,'world_law',{operation:'compensate',case:incident.result.case,authority:judge},'pay_after_service')).document;
        assert.equal(c.state.records[incident.result.case].finePaid,0);assert.equal(c.state.records[`legal_treasury:law_hw_property`],undefined);assert.equal(money(c),money(document));
    }
});

test('服役长短等待切分无关，法律资金不因等待造出副本',async()=>{
    const{document,run}=await setup(),incident=await theft(run,document);let base=await judged(run,incident.document,incident.result.case);
    base=(await run(base,'world_law',{operation:'labor',case:incident.result.case,authority:judge},'begin_service')).document;
    await fc.assert(fc.asyncProperty(fc.integer({min:1,max:20}),fc.integer({min:1,max:100}),async(n,part)=>{
        const full=(await run(base,'world_time',{minutes:n*part},'long')).document;let split=structuredClone(base);
        for(let i=0;i<n;i++)split=(await run(split,'world_time',{minutes:part},`split_${i}`)).document;
        assert.deepEqual(split.state.records,full.state.records);assert.equal(money(full),money(document));
    }),{numRuns:40});
});

test('法律目录只读、坏角色/辖区/法院及重复法典拒绝，异地不能拿旧父级关系套村社法',async()=>{
    const{world,engine,document,run}=await setup(),before=structuredClone(world),view=lawView(engine,document);
    view.law.locations.push('loc_capital');assert.deepEqual(world,before);assert.equal(validateWorld(world).ok,true);
    for(const mutate of[w=>w.rules.law.codes[0].officers=['npc_missing'],w=>w.rules.law.codes[0].court='bld_bs_shrine',
        w=>{const npc=w.npcs.find(x=>x.id==='npc_hw_ayan');npc.age=17;npc.flags={minor:true,romanceable:false};w.rules.law.codes[0].officers=[npc.id];},w=>w.rules.law.codes.push(structuredClone(w.rules.law.codes[0])),w=>w.rules.law.codes[0].locations.push('item_staff')]){
        const bad=structuredClone(world);mutate(bad);assert.equal(validateWorld(bad).ok,false);
    }
    const c=structuredClone(document);c.state.location='loc_capital';c.state.npcs[victim].location='loc_capital';
    await assert.rejects(run(c,'world_crime',{operation:'steal',target:victim,coins:10},'wrong_jurisdiction'),/法典/);
});

test('熟睡人物不能目击或受理，但已有真实财物仍可被尝试偷取',async()=>{
    const{document,run}=await setup();document.state.npcs[victim].activity='熟睡';
    const incident=await theft(run,document);assert.ok(!incident.result.witnesses.includes(victim));
    const c=incident.document;c.state.npcs[guard].location=c.state.location;c.state.npcs[guard].activity='熟睡';
    await assert.rejects(run(c,'world_law',{operation:'confess',case:incident.result.case,authority:guard},'sleeping_guard'),/清醒/);
});

test('服役中死亡不抹掉剩余判罚，复活后不被跨地点状态锁住，恢复原服役方式只补剩余时间',async()=>{
    const{document,run}=await setup(),incident=await theft(run,document);let c=await judged(run,incident.document,incident.result.case);
    c=(await run(c,'world_law',{operation:'labor',case:incident.result.case,authority:judge},'service')).document;
    const original=c.state.records[incident.result.case].sentence.minutes;
    c=(await run(c,'world_time',{minutes:30},'worked')).document;
    c=(await run(c,'world_health',{delta:-c.state.player.maxHp*3},'died')).document;
    assert.equal(c.state.records[`legal_sentence:${incident.result.case}`].status,'已中止');
    assert.equal(c.state.records[incident.result.case].remainingSentence.minutes,original-30);
    c=(await run(c,'world_revive',{},'revive')).document;
    assert.notEqual(c.state.location,'bld_hw_council');
    c=(await run(c,'world_move',{destination:'bld_hw_council'},'return_for_sentence')).document;
    const resumed=await run(c,'world_law',{operation:'labor',case:incident.result.case,authority:judge},'resume');
    assert.equal(resumed.result.sentenceMinutes,original-30);assert.equal(money(resumed.document),money(document));
});

test('真实推搡留下法律案件，掰腕检定不被当成伤害，原有关系变化不重复扣除',async()=>{
    const{document,run}=await setup(),shoved=await run(document,'world_combat',{target:victim,intent:'shove'},'shove');
    const row=shoved.document.state.records[shoved.result.case];assert.equal(row.category,'legal_case');
    assert.ok(['assault','assault_attempt'].includes(row.offense));assert.equal(shoved.document.state.npcs[victim].trust,document.state.npcs[victim].trust-5);
    const checked=await run(document,'world_check',{attribute:'力量',opponent:{npc:victim,attribute:'力量'}},'arm_wrestle');
    assert.equal(Object.values(checked.document.state.records).filter(r=>r.category==='legal_case').length,0);
});

test('法律案件与赃物在重启、导出导入和删除消息回滚中与原库存一致',async t=>{
    const{engine,document,run}=await setup(),incident=await theft(run,document),directory=await fs.mkdtemp(path.join(os.tmpdir(),'fields-law-test-'));
    t.after(async()=>{const target=path.resolve(directory);if(!target.startsWith(path.resolve(os.tmpdir())+path.sep+'fields-law-test-'))throw new Error('临时目录边界错误');await fs.rm(target,{recursive:true,force:true});});
    const reducer=(c,input)=>engine.reduce(c,input),store=new CampaignStorage(directory,{reducer});await store.create({id:'law',worldVersion:engine.world.version,document});
    await store.transact('law',{id:incident.eventId,anchor:'stolen',input:{tool:'world_crime',args:{operation:'steal',target:victim,item:'item_bread'},eventId:incident.eventId}},reducer);
    const current=await store.read('law');assert.deepEqual(current.document,incident.document);
    assert.deepEqual((await new CampaignStorage(directory,{reducer}).read('law')).document,current.document);
    assert.deepEqual((await store.import(await store.export('law'),'law_copy')).document,current.document);
    assert.deepEqual((await store.reconcile('law',[])).document,document);
});
