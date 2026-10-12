import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {toolDefinitions} from '../extension/tools.mjs';
import {civicRules} from '../world/design/m5-civic-rules.mjs';

const world=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json'));
const village='loc_hw',head='npc_hw_chenbai',sponsor='npc_hw_linsui';
function setup({full=false,scheduled=false}={}){
    const isolated=structuredClone(world);
    for(const npc of isolated.npcs){if(!scheduled)delete npc.schedule;if(!full)delete npc.tier;}
    const engine=new WorldEngine(isolated),doc=engine.createCharacter(legacy,{},'civic-test');
    doc.state.player.coins=1000;
    const run=async(c,args,eventId,tool='world_settlement')=>{const out=await engine.reduce(c,{tool,args,eventId});return{document:applyPatches(c,out.patches),result:out.result,patches:out.patches};};
    return {engine,doc,run};
}
const args=operation=>({operation,settlement:village,authority:head,sponsor});
function atCounter(doc,settlement=village){
    const p=world.rules.agriculture.settlements.find(p=>p.settlement===settlement);
    doc.state.location=p.counter;doc.state.npcs[p.manager].location=p.counter;doc.state.npcs[p.manager].activity='办公';
    doc.state.npcs[sponsor].location=p.counter;doc.state.npcs[sponsor].activity='商谈';
}
async function rented(run,doc,weeks=1){
    doc.state.location='bld_hw_qingdeng';doc.state.npcs[sponsor].location=doc.state.location;
    for(let i=0;i<weeks;i++)doc=(await run(doc,{seller:sponsor,service:'住宿',days:7},`rent_${i}`,'world_trade')).document;
    return doc;
}
async function ready(run,doc,days=3){
    doc=await rented(run,doc,days>7?5:1);
    // A controlled clock isolates admission conditions from survival simulation.
    // The residence dates themselves come from real paid engine contracts.
    doc.state.minute=doc.state.records.contract_room_rent_0.starts+days*1440;
    atCounter(doc);
    doc=(await run(doc,args('civic_residence'),'residence')).document;
    doc=(await run(doc,args('civic_sponsor'),'sponsor')).document;
    return doc;
}
const cash=doc=>doc.state.player.coins+Object.values(doc.state.npcs).reduce((n,p)=>n+p.coins,0)+Object.values(doc.state.settlements).reduce((n,s)=>n+s.treasury,0);

test('旧未知居住史、只站在村内、虚构来源和异村住宿均不能登记；查看不补历史',async()=>{
    const {doc,run}=setup(),before=structuredClone(doc);
    const inspected=await run(doc,args('civic_inspect'),'inspect');
    assert.equal(inspected.result.residence,null);assert.deepEqual(inspected.document,doc);
    for(const operation of ['civic_residence','civic_apply_resident']){
        const c=structuredClone(doc);atCounter(c);
        await assert.rejects(run(c,args(operation),'unknown'),/居住史未知/);
    }
    await assert.rejects(run(doc,{...args('civic_contribution'),sourceEvent:'imaginary'},'fake'),/没有可核验/);
    const paid=await rented(run,doc);
    await assert.rejects(run(paid,{operation:'civic_residence',settlement:'loc_bs_yupo'},'other-village'),/居住史未知/);
    assert.deepEqual(before.state.records,doc.state.records);
});

test('居民条件逐项拒绝，拒绝不扣款；实际担保、管理人和费用入村公库且重复申请幂等',async()=>{
    const {doc,run}=setup(),c=await ready(run,doc);
    const cases=[
        [x=>{x.state.location='loc_hw';},{},/柜台/],
        [x=>{x.state.npcs[head].location='loc_hw';},{},/在场/],
        [x=>{x.state.npcs[head].activity='熟睡';},{},/清醒/],
        [()=>{},{authority:sponsor},/正式管理人/],
        [()=>{},{authority:undefined},/authority/],
        [x=>{delete x.state.records[`civic_residence:${village}:player`];},{},/登记.*起日/],
        [x=>{x.state.minute-=1440;},{},/居住不足/],
        [x=>{delete x.state.records[`civic_sponsor:${village}:player`];},{},/担保人/],
        [x=>{x.state.npcs[sponsor].location='loc_hw';},{},/在场/],
        [x=>{x.state.player.coins=civicRules.resident.fee-1;},{},/费用不足/],
        [x=>{delete x.state.settlements[village].treasury;},{},/公库余额未知/],
        [x=>{x.state.records.pending={category:'legal_case',offender:'player',status:'已裁定'};},{},/犯罪案件/],
        [x=>{x.state.records.pending={category:'legal_case',offender:'player',status:'已结案',fineDischarged:true,compensationPaid:false};},{},/实际履行/],
    ];
    for(const[mutate,extra,error]of cases){const x=structuredClone(c);mutate(x);const before=structuredClone(x);await assert.rejects(run(x,{...args('civic_apply_resident'),...extra},'rejected'),error);assert.deepEqual(x,before);}
    const initialCash=cash(c),coins=c.state.player.coins,treasury=c.state.settlements[village].treasury;
    const good=await run(c,args('civic_apply_resident'),'admit');
    assert.equal(good.document.state.player.coins,coins-civicRules.resident.fee);
    assert.equal(good.document.state.settlements[village].treasury,treasury+civicRules.resident.fee);
    assert.equal(cash(good.document),initialCash);assert.match(good.result.notices.find(n=>n.type==='civic').text,/居民已登记/);
    const retry=await run(good.document,args('civic_apply_resident'),'retry');assert.equal(retry.result.duplicate,true);assert.deepEqual(retry.document,good.document);
    assert.equal(good.document.state.records[`civic_resident:${village}:player`].since,c.state.records.contract_room_rent_0.starts);
    assert.deepEqual(good.document.state.professions,c.state.professions);
    assert.deepEqual(good.document.state.buildings,c.state.buildings);
});

test('担保必须当面由当地成年既有住户确认；名册与职业不能代替资格',async()=>{
    const {doc,run}=setup();atCounter(doc);
    for(const id of ['npc_hw_duanhe','npc_yp_zhaofeng']){
        const c=structuredClone(doc);c.state.npcs[id].location=c.state.location;c.state.npcs[id].activity='商谈';
        await assert.rejects(run(c,{...args('civic_sponsor'),sponsor:id},`bad-sponsor-${id}`),/成年登记住户/);
    }
    const c=structuredClone(doc);c.state.npcs[sponsor].status='死亡';
    await assert.rejects(run(c,args('civic_sponsor'),'dead'),/清醒/);
});

test('续住契约到期后仍可核对连续历史，断住与未来住宿不增加已住天数',async()=>{
    const {doc,run}=setup();let c=await rented(run,doc,2);
    const first=c.state.records.contract_room_rent_0,second=c.state.records.contract_room_rent_1;
    c.state.minute=first.expires+1440;first.status='已到期';
    const good=await run(c,args('civic_residence'),'renewed');assert.equal(good.result.residence.days,8);assert.equal(good.result.residence.since,first.starts);
    second.starts+=1;
    const gap=await run(c,args('civic_residence'),'gap');assert.equal(gap.result.residence.since,second.starts);assert.equal(gap.result.residence.days,0);
    c.state.minute=first.starts-1;
    await assert.rejects(run(c,args('civic_residence'),'future'),/居住史未知/);
});

test('真实捐粮产生分聚落贡献，失败不记，sourceEvent防重复消费或换村',async()=>{
    const {doc,run}=setup(),p=world.rules.agriculture.settlements.find(p=>p.settlement==='loc_bs_yupo'),q=world.rules.agriculture.settlements.find(p=>p.settlement==='loc_bs_weiting');
    atCounter(doc,p.settlement);doc.state.inventory.item_oats={quantity:100};
    const donation={operation:'donate',settlement:p.settlement,quantity:10};
    const good=await run(doc,donation,'grain','world_farm');
    assert.equal(good.result.contribution.points,2);assert.equal(good.result.contribution.sourceEvent,'grain');assert.equal(good.document.state.inventory.item_oats.quantity,90);
    assert.equal(good.document.state.settlements[p.settlement].food,doc.state.settlements[p.settlement].food+10);
    const retry=await run(good.document,donation,'grain','world_farm');assert.equal(retry.result.duplicate,true);assert.deepEqual(retry.document,good.document);
    const view=await run(good.document,{operation:'civic_inspect',settlement:q.settlement},'other');assert.equal(view.result.contribution,0);
    await assert.rejects(run(good.document,{...donation,settlement:q.settlement},'grain','world_farm'),/不能改村/);
    await assert.rejects(run(good.document,{operation:'civic_contribution',settlement:q.settlement,sourceEvent:'grain'},'double'),/其他聚落/);
    await assert.rejects(run(doc,{...donation,quantity:101},'empty','world_farm'),/谷物不足/);
    assert.equal(doc.state.records['civic_source:empty'],undefined);
    assert.match(good.result.notices.find(n=>n.type==='contribution').text,/贡献 \+2/);
});

test('公共工程完成与授权必须真实；施工中和私人工事不能刷贡献，同源只记一次',async()=>{
    const {doc,run}=setup();atCounter(doc);
    doc.state.records.public={category:'authorization',action:'public_project',settlement:village,grantor:head,grantee:'player',expires:doc.state.minute+1440,sourceEvent:'formal-approval'};
    doc.state.records.private={category:'authorization',settlement:village};
    const build={operation:'start_project',settlement:village,authorization:'public',name:'公共修桥',wood:2,days:1,beneficiaries:[village]};
    const before=structuredClone(doc);await assert.rejects(run(doc,{...build,wood:doc.state.settlements[village].wood+1},'failed-project'),/材料不足/);assert.deepEqual(doc,before);
    await assert.rejects(run(doc,{...args('civic_contribution'),sourceEvent:'project_failed-project'},'failed-points'),/没有可核验/);
    let c=(await run(doc,build,'bridge')).document;
    await assert.rejects(run(c,{...args('civic_contribution'),sourceEvent:'project_bridge'},'unfinished'),/工程未完成/);
    c=(await run(c,{...build,authorization:'private',beneficiaries:['player'],name:'私人棚屋'},'private')).document;
    c=(await run(c,{minutes:1440},'day','world_time')).document;
    assert.equal(c.state.projects.project_bridge.status,'已完成');
    assert.equal(c.state.records['civic_source:project_bridge'],undefined);
    await assert.rejects(run(c,{...args('civic_contribution'),sourceEvent:'project_private'},'private-points'),/私人/);
    const credited=await run(c,{...args('civic_contribution'),sourceEvent:'project_bridge'},'points');assert.equal(credited.result.contribution.points,civicRules.projectPoints);
    const retry=await run(credited.document,{...args('civic_contribution'),sourceEvent:'project_bridge'},'retry');assert.deepEqual(retry.document,credited.document);
    assert.deepEqual(credited.document.state.professions,c.state.professions);
});

test('成功教学复用真实亲历sourceEvent，贡献归实际教师，失败和异村证据拒绝',async()=>{
    const {doc,run}=setup({full:true}),teacher='npc_hw_luqing';
    doc.state.location='bld_hw_school';doc.state.npcs[teacher].location=doc.state.location;doc.state.npcs[teacher].activity='教学';delete doc.state.skills.skill_literacy;
    let good,failed;
    for(let i=0;i<100&&(!good||!failed);i++){
        const eventId=`lesson_${i}`,out=await run(doc,{entity:'skill_literacy',source:teacher,kind:'skill'},eventId,'world_learn');
        if(out.result.success&&!good)good={...out,eventId};else if(!out.result.success&&!failed)failed={...out,eventId};
    }
    assert.ok(good);assert.ok(failed);
    const credited=await run(good.document,{...args('civic_contribution'),sourceEvent:good.eventId},'teacher-points');
    assert.equal(credited.result.contribution.subject,teacher);assert.equal(credited.result.contribution.points,civicRules.teachingPoints);
    const viewed=await run(credited.document,args('civic_inspect'),'view');assert.equal(viewed.result.contribution,0);
    await assert.rejects(run(failed.document,{...args('civic_contribution'),sourceEvent:failed.eventId},'failed-points'),/成功与当地亲历/);
    await assert.rejects(run(good.document,{operation:'civic_contribution',settlement:'loc_bs_yupo',sourceEvent:good.eventId},'wrong-village'),/当地亲历/);
});

test('贡献达标只开放公民申请，长住、居民身份、当地贡献和实际犯罪审核仍逐项核验',async()=>{
    const {doc,run}=setup();let c=await ready(run,doc,30);
    await assert.rejects(run(c,args('civic_apply_citizen'),'no-resident'),/居民身份/);
    c=(await run(c,args('civic_apply_resident'),'resident')).document;
    await assert.rejects(run(c,args('civic_apply_citizen'),'no-points'),/贡献不足/);
    c.state.inventory.item_oats={quantity:50};
    c=(await run(c,{operation:'donate',settlement:village,quantity:50},'citizen-grain','world_farm')).document;
    const view=await run(c,args('civic_inspect'),'eligible');assert.equal(view.result.canApplyCitizen,true);
    assert.equal(view.document.state.records[`civic_citizen:${village}:player`],undefined);
    assert.deepEqual(view.document.state.professions,c.state.professions);
    const blocked=structuredClone(c);blocked.state.records.case={category:'legal_case',offender:'player',status:'服役中'};
    await assert.rejects(run(blocked,args('civic_apply_citizen'),'pending-law'),/犯罪案件/);
    const coins=c.state.player.coins,money=cash(c),applied=await run(c,args('civic_apply_citizen'),'citizen');
    assert.equal(applied.document.state.player.coins,coins-civicRules.citizen.fee);assert.equal(cash(applied.document),money);
    const retry=await run(applied.document,args('civic_apply_citizen'),'retry');assert.deepEqual(retry.document,applied.document);
    assert.deepEqual(applied.document.state.buildings,c.state.buildings);assert.deepEqual(applied.document.state.npcs,c.state.npcs);
    assert.equal(Object.values(applied.document.state.records).some(r=>r.category==='authorization'&&r.grantee==='player'),false);
});

test('户籍工具沿既有聚落路由，正文不能填费用、日期、贡献分或官职',()=>{
    const tool=toolDefinitions().find(t=>t.function.name==='world_settlement').function;
    assert.ok(tool.parameters.properties.operation.enum.includes('civic_apply_citizen'));
    assert.deepEqual(tool.parameters.required,['operation','settlement']);
    for(const field of ['fee','since','points','office'])assert.equal(tool.parameters.properties[field],undefined);
});

test('实际犯罪登记阻止入籍，law判罚履行结案仍保留犯罪裁定，不能免除无犯罪条件',async()=>{
    const {doc,run}=setup();let c=await ready(run,doc);
    const officer='npc_hw_gucen';c.state.npcs[officer].location=c.state.location;c.state.npcs[officer].activity='执勤';
    const incident=await run(c,{operation:'steal',target:sponsor,coins:1},'actual-incident','world_crime');c=incident.document;
    assert.equal(c.state.records[incident.result.case].category,'legal_case');
    await assert.rejects(run(c,args('civic_apply_resident'),'pending-actual'),/犯罪案件/);
    c=(await run(c,{operation:'confess',case:incident.result.case,authority:officer},'confess','world_law')).document;
    c=(await run(c,{operation:'hear',case:incident.result.case,authority:head},'hearing','world_law')).document;
    c=(await run(c,{operation:'pay',case:incident.result.case,authority:officer},'pay','world_law')).document;
    assert.equal(c.state.records[incident.result.case].status,'已结案');
    const before=structuredClone(c);await assert.rejects(run(c,args('civic_apply_resident'),'after-law'),/犯罪裁定记录/);assert.deepEqual(c,before);
});

test('证据不足未裁定不冒充犯罪记录，旧未知结案档也不伪造清白',async()=>{
    const {doc,run}=setup(),c=await ready(run,doc);
    c.state.records.case={category:'legal_case',offender:'player',status:'已结案',fineDischarged:true,compensationPaid:true};
    await assert.rejects(run(c,args('civic_apply_resident'),'unknown-case'),/缺少犯罪审核依据/);
    c.state.records.case={category:'legal_case',offender:'player',status:'证据不足'};
    const admitted=await run(c,args('civic_apply_resident'),'insufficient-case');assert.equal(admitted.result.application.status,'已登记');
});

test('正式管理人的村务作息虽无交易服务，真实在场清醒时仍可办理户籍',async()=>{
    const {engine,doc,run}=setup({full:true,scheduled:true});
    doc.state.minute=540;
    const c=await ready(run,doc),slot=engine.byId.get(head).schedule.default.find(row=>row.start<=c.state.minute%1440&&c.state.minute%1440<row.end);
    assert.deepEqual(slot.services,[]);assert.equal(slot.location,c.state.location);
    const admitted=await run(c,args('civic_apply_resident'),'scheduled-resident');assert.equal(admitted.result.application.authority,head);
});
