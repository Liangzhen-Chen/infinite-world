import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {personOffices,personOccupation,personCareer,personTeaching,personCertified,personQuestRights,settlementHead,settlementGovernment,placeView,questPublisher,personRoutine,personLawRoles,personSimulation} from '../server-plugin/entity-view.mjs';
import {questPublishingRights} from '../server-plugin/quest-board.mjs';
import {governanceAction} from '../server-plugin/governance.mjs';
import {trainingInstitution} from '../server-plugin/training.mjs';
import {advanceOfficeSalaries} from '../server-plugin/office-salary.mjs';
import {knownTopics,opinionOf} from '../server-plugin/public-opinion.mjs';
import {npcBackground,npcContext} from '../server-plugin/npc-memory.mjs';
import {generateCounty,remoteWorld} from '../server-plugin/remote-generation.mjs';
import {questGenerators} from '../server-plugin/quest-sources.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const SID='loc_bs_yupo',NPC='npc_hw_ayan',MONTH=30*1440,head=world.settlementProfiles.find(p=>p.id===SID).details.governance.head;
function fixture(){
    const w=structuredClone(world),engine=new WorldEngine(w),document=engine.createCharacter(seed,{},'entity-authority');
    const d={document,get(...p){return p.reduce((v,k)=>v?.[k],this.document);},set(p,v){let at=this.document;for(const k of p.slice(0,-1))at=at[k]??={};at[p.at(-1)]=v;},say(){}};
    return {w,engine,d,state:document.state};
}
function appoint(s,holder=NPC,office='office_village_head'){
    const id=`governance_office:${SID}:${office}:${holder}`;
    return s.records[id]={category:'governance_office',id,office,holder,settlement:SID,status:'在任',since:0,until:20*MONTH,nextReview:20*MONTH,source:'白石镇公署任命'};
}
test('玩家与 NPC 共用现任官职；升格读取当前名称、额度、预算与月俸，不修改任职事实',()=>{
    for(const who of ['player',NPC]){
        const {engine,state}=fixture(),row=appoint(state,who),before=structuredClone(row);
        assert.equal(personOffices(engine,state,who)[0].value.monthlyQuotaD,10);
        assert.equal(questPublishingRights(engine,state,who).limitD,10);
        assert.equal(questPublisher(engine,state,SID).value,who);
        state.records[`settlement_rank:${SID}`]={category:'settlement_rank',level:'镇',settlement:SID,superior:'loc_bs',since:state.minute};
        const o=personOffices(engine,state,who)[0].value;
        assert.equal(o.name,'镇长');assert.equal(o.monthlyQuotaD,40);assert.equal(o.monthlyBudgetCopper,5000);assert.equal(o.monthlySalaryCopper,360);
        assert.equal(personOccupation(engine,state,who).value,'镇长');assert.equal(questPublishingRights(engine,state,who).limitD,40);
        assert.deepEqual(row,before,'派生读取不回写、存档重载后同样生效');
    }
});
test('撤职、到期和死亡取消当前权限与旧官称；空缺不恢复原头人，显式主事人覆盖标来源',()=>{
    const {engine,state}=fixture(),row=appoint(state);
    assert.equal(settlementHead(engine,state,SID).value,NPC);
    assert.equal(personOffices(engine,state,head,{settlement:SID}).length,0);
    row.status='已免职';assert.equal(settlementHead(engine,state,SID).value,null);assert.equal(questPublishingRights(engine,state,NPC).limitD,0);
    assert.equal(personOccupation(engine,state,NPC).value,'居民');assert.equal(personOffices(engine,state,NPC).length,0);
    row.status='在任';row.until=state.minute;assert.equal(personOffices(engine,state,NPC).length,0);
    row.until=20*MONTH;state.npcs[NPC].status='死亡';assert.equal(personOffices(engine,state,NPC).length,0);
    engine.rules.questSources.publishers[SID]=head;
    assert.deepEqual(questPublisher(engine,state,SID),{value:head,source:'rules.questSources.publishers',override:true});
});
test('同一主官席位以最后生效任命为准；新任离职后不复活旧任，未来任命不提前接管',()=>{
    const {engine,state}=fixture(),old=appoint(state);old.since=state.minute;
    const newer=appoint(state,'player');newer.since=state.minute+60;
    assert.equal(settlementHead(engine,state,SID).value,NPC);
    state.minute+=60;assert.equal(settlementHead(engine,state,SID).value,'player');
    assert.equal(personOffices(engine,state,NPC,{settlement:SID}).length,0);
    newer.status='已免职';assert.equal(settlementHead(engine,state,SID).value,null);
    assert.equal(personOffices(engine,state,NPC,{settlement:SID}).length,0);
});

test('主事人、任职和地点视图共用生效任命；撤职、到期、死亡留下同一空缺',()=>{
    const {engine,state}=fixture(),initial=settlementGovernment(engine,state,SID),before=structuredClone(state);
    assert.deepEqual(initial.head,settlementHead(engine,state,SID));
    assert.equal(personOffices(engine,state,head,{settlement:SID})[0].value.workplace,initial.seat.value);
    assert.deepEqual(state,before);
    const row=appoint(state,'player');delete row.since;row.appointedAt=state.minute+60;row.workplace='loc_bs';
    assert.equal(settlementGovernment(engine,state,SID).head.value,head);
    assert.equal(personOffices(engine,state,'player',{settlement:SID}).length,0);
    state.minute+=60;
    const current=settlementGovernment(engine,state,SID);
    assert.equal(current.head.value,'player');assert.equal(current.seat.value,'loc_bs');assert.equal(current.source.value,row.source);
    assert.deepEqual(placeView(engine,state,SID).government,current);
    assert.deepEqual(questPublisher(engine,state,SID),current.head);
    assert.equal(personOffices(engine,state,'player',{settlement:SID})[0].value.workplace,current.seat.value);
    assert.equal(personOffices(engine,state,head,{settlement:SID}).length,0);
    for(const reason of ['免职','到期','死亡','撤职记录']){
        row.status='在任';row.until=20*MONTH;state.player.status='正常';delete state.records.dismissal;
        if(reason==='免职')row.status='已免职';
        if(reason==='到期')row.until=state.minute;
        if(reason==='死亡')state.player.status='死亡';
        if(reason==='撤职记录')state.records.dismissal={category:'legal_dismissal',subject:'player',status:'生效'};
        assert.equal(settlementGovernment(engine,state,SID).head.value,null,reason);
        assert.equal(questPublisher(engine,state,SID).value,null,reason);
        assert.deepEqual(personOffices(engine,state,'player',{settlement:SID}),[],reason);
        assert.deepEqual(placeView(engine,state,SID).government.powers.value,[],reason);
    }
    state.records.dismissal.status='撤销';assert.equal(settlementHead(engine,state,SID).value,'player');
});

test('议会主官和办公地点保持同一 fact 结构，现任变化不授予另一套村长席位',()=>{
    const {engine,state}=fixture(),profile=engine.world.settlementProfiles.find(p=>p.id===SID),id='org_authority_council';
    profile.council=id;
    state.records[`organization:${id}`]={category:'organization',id,source:'created',name:'议会',kind:'会社',seat:'loc_bs',leader:NPC,members:{[NPC]:{position:'会长'},player:{position:'成员'}},removed:{},charter:{rules:['议会表决']}};
    appoint(state,'player');
    const council=settlementGovernment(engine,state,SID);
    assert.deepEqual(Object.keys(council).sort(),['head','powers','appointment','enforcers','seat','source'].sort());
    for(const entry of Object.values(council))assert.ok(Object.hasOwn(entry,'value')&&Object.hasOwn(entry,'source')&&Object.hasOwn(entry,'override'));
    assert.equal(council.head.value,NPC);assert.equal(council.seat.value,'loc_bs');assert.deepEqual(council.powers.value,['议会表决']);
    assert.deepEqual(settlementHead(engine,state,SID),council.head);assert.equal(questPublisher(engine,state,SID).value,NPC);
    assert.deepEqual(personOffices(engine,state,NPC,{settlement:SID}),[]);assert.deepEqual(personOffices(engine,state,'player',{settlement:SID}),[]);
    state.records[`organization:${id}`].leader='player';assert.equal(settlementGovernment(engine,state,SID).head.value,'player');
    state.player.status='死亡';assert.equal(settlementHead(engine,state,SID).value,null);assert.equal(placeView(engine,state,SID).government.head.value,null);
});
test('所有身份额度取最大值，名士只授文化额度；组织职位变化与个人覆盖实时生效',()=>{
    const {engine,state}=fixture();appoint(state,NPC,'office_works_deputy');
    state.records.t={category:'title',holder:NPC,title:'准爵',rank:'一等',status:'受封'};
    state.records.n={category:'notable',holder:NPC,status:'在册'};
    assert.equal(personQuestRights(engine,state,NPC).limitD,5);
    state.records.t.status='已除爵';assert.equal(personQuestRights(engine,state,NPC).limitD,3);
    assert.equal(personQuestRights(engine,state,NPC,{cultural:true}).limitD,5);
    state.records['organization:org_test']={category:'organization',id:'org_test',name:'测试行会',source:'created',kind:'行会',seat:'loc_hw',leader:NPC,members:{[NPC]:{position:'会长'}},removed:{},charter:{}};
    assert.equal(personQuestRights(engine,state,NPC).limitD,10);
    state.records['organization:org_test'].leader=null;state.records['organization:org_test'].members[NPC].position='成员';
    assert.equal(personQuestRights(engine,state,NPC).limitD,3);
    state.npcs[NPC].monthlyQuotaD=17;assert.equal(personQuestRights(engine,state,NPC).limitD,17);assert.equal(personQuestRights(engine,state,NPC).override.override,true);
    state.npcs[NPC].monthlyQuotaD=0;assert.equal(personQuestRights(engine,state,NPC).limitD,0);
});
test('现任主官可主持议事，前任失去该席位；任职作息读取新职务，去职不沿旧工作地',()=>{
    const {engine,d,state}=fixture(),row=appoint(state,'player'),g=world.settlementProfiles.find(p=>p.id===SID).details.governance;
    state.location=g.meetingPlace;
    const view=governanceAction.call(engine,d,{operation:'governance_inspect',settlement:SID},'current-inspect');
    assert.equal(view.appointment.head,'player');assert.ok(view.permissions.head.includes('register'));assert.equal(view.foundingAppointment.head,head);
    state.records.proposal={id:'proposal',category:'governance_proposal',settlement:SID,status:'议事中',opinions:[],affected:[]};
    state.npcs[head].location=g.meetingPlace;
    assert.throws(()=>governanceAction.call(engine,d,{operation:'governance_close',settlement:SID,proposal:'proposal',authority:head},'old-chair'),/本村在场头人/);
    const out=governanceAction.call(engine,d,{operation:'governance_close',settlement:SID,proposal:'proposal',authority:'player'},'new-chair');
    assert.equal(out.meeting.authority,'player');assert.equal(out.meeting.appointmentSource,row.source);
    row.status='已免职';const npcRow=appoint(state);
    assert.equal(personRoutine(engine,state,NPC).default[1].location,g.meetingPlace);
    npcRow.status='已免职';assert.notEqual(personRoutine(engine,state,NPC).default[1].location,g.meetingPlace);
});
test('改业同步普通教学、突破和机构导师资格；玩家弃职保留技能并取消认证有效值',async()=>{
    const {engine,state,d}=fixture(),entry=engine.rules.training.institutions[0],teacher=entry.teacher;
    assert.ok(personCareer(engine,state,teacher).value.roles.includes(entry.profession));
    assert.ok(trainingInstitution(engine,entry.institution,entry.profession,teacher,state));
    const vocation=engine.rules.npcGrowth.vocations.find(v=>v.id==='vocation_hw_qingdeng_cook');
    state.npcs[teacher].vocation={id:vocation.id,since:state.minute};
    assert.equal(personTeaching(engine,state,teacher,entry.profession),false);
    assert.throws(()=>trainingInstitution(engine,entry.institution,entry.profession,teacher,state),/不相符/);
    assert.equal(personTeaching(engine,state,teacher,'skill_life_3_core'),true);
    assert.equal(personCertified(engine,state,teacher,'skill_life_3_core'),true);
    const role='profession_life_6';state.professions.life=[role];state.skills.skill_life_6_core={proficiency:800};state.player.coins=10000;
    const out=await engine.reduce(d.document,{tool:'world_profession',args:{operation:'abandon',profession:role},eventId:'abandon'});
    const changed=applyPatches(d.document,out.patches).state;
    assert.equal(changed.skills.skill_life_6_core.proficiency,800);assert.equal(personCertified(engine,changed,'player','skill_life_6_core'),false);
});
test('俸禄从同一聚落公账支付，缺额变欠俸并影响士气与已获知的舆论；离任后只补旧债',()=>{
    const {engine,state,d}=fixture(),row=appoint(state),bank=state.settlements[SID];
    bank.treasury=350;const money=state.npcs[NPC].coins;state.minute=MONTH;
    advanceOfficeSalaries(d,engine,{before:MONTH-1,after:MONTH});
    const debt=Object.values(state.records).find(r=>r.category==='office_salary'&&r.holder===NPC);
    assert.equal(debt.monthlyCopper,120);assert.equal(debt.paid,50);assert.equal(debt.arrears,70);assert.equal(bank.treasury,300);
    assert.equal(state.npcs[NPC].coins,money+50);assert.equal(state.npcs[NPC].morale,55);
    assert.match(npcContext(engine,d.document,NPC).concern,/欠本人月俸70铜，士气55/);
    const topics=[...knownTopics(engine,d.document,NPC).values()];assert.ok(topics.some(t=>t.kind==='salary'&&opinionOf(engine,state,NPC,t).stance==='oppose'));
    const saved=structuredClone(state);advanceOfficeSalaries(d,engine,{before:MONTH-1,after:MONTH});assert.deepEqual(state,saved,'重放不得重复支付或扣士气');
    row.status='已免职';bank.treasury+=1000;state.minute=2*MONTH;
    advanceOfficeSalaries(d,engine,{before:2*MONTH-1,after:2*MONTH});
    const paid=state.records[debt.id];assert.equal(paid.paid,120);assert.equal(paid.arrears,0);assert.equal(state.npcs[NPC].coins,money+120);
    assert.equal(Object.values(state.records).filter(r=>r.category==='office_salary'&&r.holder===NPC).length,1);
});
test('升格后月俸随级别改变，既有契约和历史回执保留签署时事实',()=>{
    const {engine,state,d}=fixture();appoint(state);
    state.settlements[SID].treasury=10000;state.records.old={category:'contract',parties:[NPC,'player'],officeName:'村长',monthlyQuotaD:10,status:'有效'};
    const old=structuredClone(state.records.old);state.records[`settlement_rank:${SID}`]={category:'settlement_rank',level:'镇'};state.minute=MONTH;
    advanceOfficeSalaries(d,engine,{before:MONTH-1,after:MONTH});
    const salary=Object.values(state.records).find(r=>r.category==='office_salary'&&r.holder===NPC);
    assert.equal(salary.monthlyCopper,360);assert.equal(salary.paid,360);assert.deepEqual(state.records.old,old);
});
test('执法资格读撤职与职责法域；当前公开关系纳入新婚事实而历史关系保留',()=>{
    const {engine,state,d}=fixture(),code=engine.rules.law.codes.find(c=>c.officers.length),officer=code.officers[0];
    assert.ok(personLawRoles(engine,state,officer,code).includes('officer'));
    state.records[`legal_dismissal:${officer}`]={category:'legal_dismissal',npc:officer};
    assert.deepEqual(personLawRoles(engine,state,officer,code),[]);assert.equal(personOccupation(engine,state,officer).value,'居民');
    state.family??={};state.family.marriages??={};state.family.marriages.new={id:'new',partners:[NPC,head],since:state.minute,status:'在婚'};
    state.location=state.npcs[head].location;
    assert.ok(npcBackground(engine,d.document,NPC).relations.some(r=>r.with===head&&r.type==='配偶'&&r.source==='state.family.marriages.new'));
});
test('远方生成聚落默认主事人跟随新任；名册补成 full 后取得需求单模拟资格',()=>{
    const {state}=fixture(),county='county_jingzhao_luyu',skeleton=generateCounty(world,county,'authority-remote');
    state.remote={[county]:{county,skeleton,profiles:{}}};
    const engine=new WorldEngine(remoteWorld(world,state)),sid=skeleton.settlements[0].id,original=skeleton.publishers[sid];
    assert.equal(questPublisher(engine,state,sid).value,original);
    const gov=settlementGovernment(engine,state,sid),office=skeleton.offices.find(o=>o.settlement===sid&&o.source==='generated');
    assert.equal(gov.head.value,office.holder);assert.equal(gov.head.source,`state.remote.${county}.skeleton.offices`);
    assert.equal(gov.seat.value,engine.byId.get(original).location);assert.equal(gov.source.value,gov.head.source);
    assert.equal(personOffices(engine,state,original,{settlement:sid})[0].value.workplace,gov.seat.value);
    const row=appoint(state);row.settlement=sid;
    assert.equal(questPublisher(engine,state,sid).value,NPC);
    assert.equal(placeView(engine,state,sid).government.head.value,NPC);assert.deepEqual(personOffices(engine,state,original,{settlement:sid}),[]);
    row.office=office.id;assert.equal(settlementHead(engine,state,sid).value,NPC);
    row.status='已免职';assert.equal(settlementHead(engine,state,sid).value,null);assert.deepEqual(personOffices(engine,state,NPC,{settlement:sid}),[]);
    const resident=skeleton.people.find(p=>!engine.world.npcs.some(n=>n.id===p.id));
    if(resident){assert.equal(personSimulation(engine,state,resident.id).value,false);state.remote[county].profiles[resident.id]={status:'full'};assert.equal(personSimulation(engine,state,resident.id).value,true);}
});
test('名册展开为完整档后同一个需求生成器实际出单，补档前不出单',()=>{
    const {engine,state,d}=fixture(),owner='npc_hw_linsui',base=engine.byId.get(owner);
    base.tier='roster';state.npcs={[owner]:state.npcs[owner]};state.npcs[owner].coins=200;
    state.buildings.bld_hw_qingdeng.condition=20;
    const scan=questGenerators().find(g=>g.id==='npc_needs').scan;
    assert.deepEqual(scan(d,engine,1440),[]);
    base.profileStatus='full';assert.equal(scan(d,engine,1440).length,1);
    const q=Object.values(state.quests).find(q=>q.publisher===owner);
    assert.equal(q.source.need,'repair');assert.equal(q.source.generator,'npc_needs');assert.equal(q.escrow,50);
});
