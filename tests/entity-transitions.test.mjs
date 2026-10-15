import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {personAge,personName,personOccupation,personRelationships,groupView,settlementPopulation} from '../server-plugin/entity-view.mjs';
import {entityTransition} from '../server-plugin/entity-transitions.mjs';
import {worldEvents,registerWorldEventSubscriber,publishTransitionEvent,eventRumorId} from '../server-plugin/world-events.mjs';
import {advanceOffices} from '../server-plugin/governance.mjs';
import {advanceOfficeSalaries} from '../server-plugin/office-salary.mjs';
import {advancePromotion} from '../server-plugin/promotion.mjs';
import {recordEntityDeath,advanceNpcLife} from '../server-plugin/npc-life.mjs';
import {deliverFugitive} from '../server-plugin/bounty.mjs';
import {advanceLaw} from '../server-plugin/law.mjs';
import {organizationAction,advanceOrganizations} from '../server-plugin/organizations.mjs';
import {advanceTribalAwakening,tribalKey,tribalOrgId} from '../server-plugin/tribal-awakening.mjs';
import {npcBackground,npcContext} from '../server-plugin/npc-memory.mjs';
import {npcRumors} from '../server-plugin/npc-rumors.mjs';
import {sceneCard} from '../server-plugin/scene-card.mjs';
import {personal} from '../server-plugin/ui-personal.mjs';
import {affairs} from '../server-plugin/ui-affairs.mjs';
import {history} from '../server-plugin/ui-history.mjs';
import {publicSettlement} from '../server-plugin/settlement-profile.mjs';
import {returnChanges} from '../server-plugin/return-summary.mjs';
import {currentShops} from '../server-plugin/shop.mjs';

const source=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const A='npc_hw_zhongxiu',B='npc_hw_baihui',C='npc_hw_ayan',SID='loc_bs_yupo',DAY=1440,MONTH=30*DAY,Q=90*DAY;
let probes=0;
function fixture(t){
    const w=structuredClone(source);for(const n of w.npcs)delete n.schedule;
    const engine=new WorldEngine(w),document=engine.createCharacter(seed,{},'entity-transitions');document.state.minute=600;
    const d={document,get(...p){return p.reduce((o,k)=>o?.[k],this.document);},
        set(p,v){let o=this.document;for(const k of p.slice(0,-1))o=o[k]??={};o[p.at(-1)]=structuredClone(v);},
        remove(p){let o=this.document;for(const k of p.slice(0,-1))o=o[k];delete o[p.at(-1)];},say(){}};
    const events=[],off=registerWorldEventSubscriber({id:`v6_probe_${++probes}`,order:999,on(d,e,rows){events.push(...structuredClone(rows));}});t.after(off);
    return {w,engine,d,s:document.state,events};
}
const transitions=s=>worldEvents(s,e=>e.tags?.includes('entity-transition'));
function once(f,verb,action){
    const old=transitions(f.s).filter(e=>e.verb===verb).length;action();
    const rows=transitions(f.s).filter(e=>e.verb===verb);assert.equal(rows.length,old+1,verb);
    const e=rows.at(-1),before=structuredClone(f.s),calls=f.events.length;
    assert.equal(publishTransitionEvent(f.d,f.engine,e),false);assert.deepEqual(f.s,before);assert.equal(f.events.length,calls);return e;
}
function office(s,holder='player'){
    const id=`governance_office:${SID}:office_village_head:${holder}`;
    return s.records[id]={category:'governance_office',id,office:'office_village_head',holder,settlement:SID,name:'村长',status:'在任',since:0,until:MONTH*10,nextReview:MONTH*10,appointedBy:'公署'};
}
function guild(s){
    s.records['organization:org_v6']={category:'organization',id:'org_v6',source:'created',name:'匠会',kind:'行会',seat:s.location,leader:'player',
        members:{player:{position:'会长'},[A]:{position:'成员'}},removed:{},treasury:0,ledger:[],charter:{mode:'leader',approval:false,fee:0,dues:0}};
}

test('任命与免职在提交后各通知一次，重复推进不重审；旧任命书保留官称',t=>{
    const f=fixture(t),{s,engine,d}=f,head=source.settlementProfiles.find(p=>p.id===SID).details.governance.head;
    s.records[`civic_citizen:${SID}:player`]={category:'civic_citizen',status:'已登记'};
    s.records.contribution={category:'civic_contribution',settlement:SID,subject:'player',points:1000};
    s.records[`standing:${head}:player`]={category:'standing',value:80};
    s.records.app={category:'governance_application',id:'app',settlement:SID,office:'office_village_head',status:'待审定',due:600};
    const appointed=once(f,'appoint',()=>advanceOffices(d,engine,{after:600}));
    assert.equal(personOccupation(engine,s,'player').value,'村长');assert.match(appointed.summary,/获任村长/);
    const snapshot=structuredClone(s);advanceOffices(d,engine,{after:600});assert.deepEqual(s,snapshot);
    const row=Object.values(s.records).find(r=>r.category==='governance_office');s.minute=row.until;
    s.records[`settlement_rank:${SID}`]={category:'settlement_rank',settlement:SID,level:'镇',since:601};
    const dismissed=once(f,'dismiss',()=>advanceOffices(d,engine,{after:row.until}));assert.match(dismissed.summary,/卸任镇长/);
    assert.equal(personOccupation(engine,s,'player').value,'居民');assert.equal(row.name,'村长');
    assert.match(appointed.summary,/获任村长/);
});

test('欠俸通知与真实债务结算同一次发生，重跑不再扣账或降士气',t=>{
    const f=fixture(t);office(f.s,A);f.s.settlements[SID].treasury=0;f.s.minute=MONTH;
    const e=once(f,'salary',()=>advanceOfficeSalaries(f.d,f.engine,{before:MONTH-1,after:MONTH}));
    assert.ok(e.arrearsCopper>0);assert.equal(e.arrearsCopper,f.s.records[e.salary].arrears);
    const snapshot=structuredClone(f.s);advanceOfficeSalaries(f.d,f.engine,{before:MONTH-1,after:MONTH});assert.deepEqual(f.s,snapshot);
});

for(const cause of ['战斗身亡','法术致死','寿终','处决','战死'])test(`${cause}只发布一次死亡事件，遗产与人口不重算`,t=>{
    const f=fixture(t),pop=f.s.settlements.loc_hw.population;f.s.npcs[A].coins=31;
    const e=once(f,'die',()=>recordEntityDeath(f.d,f.engine,A,600,cause));assert.equal(e.cause,cause);
    const snapshot=structuredClone(f.s);recordEntityDeath(f.d,f.engine,A,900,'战死');assert.deepEqual(f.s,snapshot);
    assert.equal(f.s.settlements.loc_hw.population,pop-1);
    assert.ok(!JSON.stringify(e).includes('estate'),'通知不带遗产私账');
});

test('拘押、停业和释放在各自提交点通知，释放与交付回放不重付赏金',t=>{
    const A='npc_hw_linsui';
    const f=fixture(t),{s,engine,d}=f,shop=currentShops(engine,s).find(x=>x.keeper===A);assert.ok(shop);
    const code=engine.rules.law.codes.find(c=>c.court==='bld_hw_council');
    const wanted={id:'legal_wanted:v6',subject:A,law:code.id,case:'legal_case:v6',scope:[code.id],status:'生效',bounty:0,pledge:{coins:0},silenced:[],history:[]};
    s.records[wanted.id]=wanted;s.records[wanted.case]={category:'legal_case',id:wanted.case,offender:A,status:'已报案'};
    once(f,'detain',()=>deliverFugitive(d,engine,wanted,'player',600));
    assert.equal(transitions(s).filter(e=>e.verb==='close'&&e.shop===shop.id).length,1);
    assert.ok(!currentShops(engine,s).some(x=>x.keeper===A));
    const after=structuredClone(s);deliverFugitive(d,engine,wanted,'player',600);assert.deepEqual(s,after);
    const end=s.records[`legal_detention:${wanted.id}`].expires;s.minute=end;
    once(f,'release',()=>advanceLaw(d,end,engine));const released=structuredClone(s);advanceLaw(d,end,engine);assert.deepEqual(s,released);
});

test('死亡导致同一店铺易主时只发一次易主通知，现经营者与事件一致',t=>{
    const A='npc_hw_linsui';
    const f=fixture(t),{s,engine,d}=f,shop=currentShops(engine,s).find(x=>x.keeper===A);assert.ok(shop);
    const base=engine.byId.get(A);s.npcs[B].workplace={location:base.workplace?.location??base.location};
    s.npcs[B].shopType='tavern';s.npcs[B].status='正常';
    const b=engine.byId.get(B);b.services=['trade'];b.shopType='tavern';b.workplace={location:base.workplace?.location??base.location};b.shopRestock=structuredClone(base.shopRestock??shop.restock);
    recordEntityDeath(d,engine,A,600,'寿终');
    const events=transitions(s).filter(e=>e.verb==='transfer'&&e.shop===shop.id);assert.equal(events.length,1);
    assert.equal(events[0].keeper,B);assert.equal(currentShops(engine,s).find(x=>x.id===shop.id).keeper,B);
    const snapshot=structuredClone(s);recordEntityDeath(d,engine,A,600,'寿终');assert.deepEqual(s,snapshot);
});

test('迁居出发与抵达各发一次，重跑不重扣路费或人口',t=>{
    const f=fixture(t),{s,engine,d}=f,from=source.households.find(h=>h.members.includes(C)),to=source.households.find(h=>h.settlement!==from.settlement&&s.npcs[h.members[0]]);
    const host=to.members[0];s.npcs[C].location=from.homeLocation;s.npcs[C].coins=10000;s.npcs[C].activity='闲谈';
    engine.byId.get(C).schedule={default:[{start:0,end:1440,location:from.homeLocation,activity:'家务',services:[]}]};
    s.family??={};s.family.migrations={move:{id:'move',person:C,host,reason:'谋生',status:'待出发',departAt:601,postponed:0,from:{household:from.id,settlement:from.settlement,home:from.homeLocation},to:{household:to.id,settlement:to.settlement,home:to.homeLocation}}};
    s.minute=601;const e=once(f,'migrate',()=>advanceNpcLife(d,engine,600,601));assert.equal(e.stage,'depart');
    const at=s.family.migrations.move.arriveAt;s.minute=at;const arrive=once(f,'migrate',()=>advanceNpcLife(d,engine,at-1,at));assert.equal(arrive.stage,'arrive');
    const snapshot=structuredClone(s);advanceNpcLife(d,engine,600,at);assert.deepEqual(s,snapshot);
});

test('入会、退会与首领任命在成员写入后各发一次，旧关系事实不被改写',t=>{
    const f=fixture(t),{s,d,engine}=f;guild(s);s.npcs[B].location=s.location;s.npcs[B].activity='闲谈';
    const act=(args,id)=>organizationAction.call(engine,d,{org:'org_v6',...args},id);
    const join=once(f,'organize',()=>act({operation:'org_join',member:B,consent:true},'join'));assert.ok(groupView(engine,s,'org_v6').members.value[B]);
    const appoint=once(f,'organize',()=>act({operation:'org_propose',action:'appoint',member:B,name:'会长'},'chair'));assert.equal(groupView(engine,s,'org_v6').leader.value,B);
    once(f,'organize',()=>act({operation:'org_leave',consent:true},'leave'));assert.ok(!groupView(engine,s,'org_v6').members.value.player);
    assert.match(appoint.summary,/任命.*会长/);assert.match(join.summary,/加入匠会/);
    const snapshot=structuredClone(s);advanceOrganizations(d,engine,{before:600,after:DAY});assert.deepEqual(s,snapshot);
});

test('升格通知只在批准后产生，读取新官称而保留原任命与旧契约',t=>{
    const f=fixture(t),{s,engine,d}=f;const appointed=office(s),old=structuredClone(appointed);
    const rules=engine.rules.governance.promotion??engine.rules.governance.promotions;
    assert.ok(rules);
    const q=rules.steps[0].requires;s.settlements[SID].population=q.population;
    for(let i=0;i<q.housing;i++)s.created[`bld_v6_home_${i}`]={id:`bld_v6_home_${i}`,scope:SID,purpose:'私宅'};
    for(let i=0;i<q.industries;i++)s.records[`business:v6_${i}`]={category:'business',status:'营业',location:SID};
    for(let i=0;i<q.facilities;i++)s.created[`bld_v6_public_${i}`]={id:`bld_v6_public_${i}`,scope:SID,purpose:'公共设施'};
    s.records.petition={category:'promotion_petition',id:'petition',settlement:SID,from:'村',status:'待审定',due:600};
    const e=once(f,'promote',()=>advancePromotion(d,engine,{before:599,after:600}));
    assert.equal(personOccupation(engine,s,'player').value,'镇长');assert.match(e.summary,/升为镇/);assert.deepEqual(s.records[appointed.id],old);
    const snapshot=structuredClone(s);advancePromotion(d,engine,{before:599,after:600});assert.deepEqual(s,snapshot);
});

test('自治聚居地事件与可进入地点同一次提交，季度重跑不重复创建',t=>{
    const f=fixture(t),{s,engine,d}=f,dyn=engine.rules.tribalAwakening.dynamics.find(x=>x.id==='badger_northwood');
    s.records[tribalKey(dyn.id)]={category:'tribal_awakening',id:dyn.id,status:'听息',progress:engine.rules.tribalAwakening.thresholds.liyi-1,totals:{magic:0,teach:0,injustice:0},taught:0,choiceTotals:{teach:0,trade:0,mediate:1,suppress:0},seen:{displaced:0},quarters:[],awakened:[],factions:[],demands:[],population:0,outcome:null,lastTick:0};
    advanceTribalAwakening(d,engine,{before:Q-1,after:Q});
    s.records[`tribal_clock:${tribalOrgId(dyn.id,'accord')}`].filled=engine.rules.tribalAwakening.clock.segments;
    advanceTribalAwakening(d,engine,{before:2*Q-1,after:2*Q});
    const id=worldEvents(s,e=>e.tags?.includes('autonomy'))[0];assert.ok(id);assert.equal(id.visibility,'public');assert.ok(id.summary);
    assert.ok(s.settlements[id.subject]);const snapshot=structuredClone(s);advanceTribalAwakening(d,engine,{before:2*Q-1,after:2*Q});assert.deepEqual(s,snapshot);
    assert.equal(f.events.filter(e=>e.id===id.id).length,1);
});

test('当前称呼、年龄、关系与人口由同一视图投影，历史记忆及契约按原文保留',t=>{
    const f=fixture(t),{s,engine,d}=f;office(s,A).until=100*MONTH;s.created[A]={...engine.byId.get(A),name:'现任甲'};s.npcs[A].location=s.location;s.npcs[A].activity='闲谈';s.npcs[B].location=s.location;
    s.minute=360*DAY+600;s.records[`settlement_rank:${SID}`]={category:'settlement_rank',settlement:SID,level:'镇',since:1};
    s.family??={};s.family.marriages={m:{id:'m',partners:[A,B],since:1,status:'在婚'}};
    const base=engine.byId.get(B);base.relationships=[{with:A,type:'配偶',note:'旧时关系'}];
    s.npcs[B].memoryStream=[{id:'past',sourceEvent:'past',kind:'trade',minute:1,content:'旧称村长在当日签约',participants:['player',B],sourceType:'亲历',location:s.location}];
    const past=structuredClone(s.npcs[B].memoryStream[0]);s.records.contract={category:'contract',parties:['player',A],signedTerms:{name:'旧称',occupation:'村长'}};const contract=structuredClone(s.records.contract);
    s.settlements[SID].population=777;s.location=SID;s.npcs[A].location=SID;s.npcs[B].location=SID;
    assert.match(sceneCard(engine,d.document,'现任甲'),new RegExp(`现任甲.*镇长，${personAge(engine,s,A).value}岁`));
    const brief=publicSettlement(engine.world,SID,d.document),panel=affairs(engine,d.document).settlements.find(r=>r.id===SID);
    assert.equal(brief.population,settlementPopulation(engine,s,SID).population.value);assert.equal(panel.population,brief.population);assert.equal(panel.head,'现任甲');
    const background=npcBackground(engine,d.document,B,base.name);assert.equal(background.relations.find(r=>r.with===A).publicRole,'镇长');
    assert.equal(npcContext(engine,d.document,B,base.name).relations.find(r=>r.with===A).type,'配偶');
    s.family.marriages.m.status='丧偶';assert.ok(!personRelationships(engine,s,B).value.some(r=>r.with===A&&r.type==='配偶'));
    assert.deepEqual(s.npcs[B].memoryStream[0],past);assert.deepEqual(s.records.contract,contract);
    const people=history(engine,d.document,{facts:[]}).people.items;assert.equal(people.find(r=>r.id===B).age,personAge(engine,s,B).value);
    s.player.age=38;office(s).until=100*MONTH;assert.equal(personal(engine,d.document).player.age,38);assert.equal(personal(engine,d.document).player.occupation,'镇长');
});

test('公开通知只给真实在场者传播；私密、组织内务与未成年事件不进入传闻或返场',t=>{
    const f=fixture(t),{s,engine,d}=f;s.location=SID;s.minute=1000;
    for(const id of [A,B,C]){s.npcs[id].location=id===C?'loc_hw':SID;s.npcs[id].activity='闲谈';s.npcs[id].memoryStream=[];}
    const emit=(id,extra={})=>entityTransition(d,engine,{id,verb:'appoint',actor:'公署',target:A,minute:900,location:SID,summary:`${id}任命通知`,...extra});
    const pub=emit('public');assert.ok(eventRumorId(engine,s,pub));
    assert.ok(npcRumors(engine,B,d.document).some(r=>r.id===`rumor_event:${pub.id}`));assert.equal(s.npcs[C].memoryStream.length,0);
    const secret=emit('private',{visibility:'private'});assert.equal(eventRumorId(engine,s,secret),null);assert.ok(!s.npcs[B].memoryStream.some(m=>m.sourceEvent===secret.id));
    const members=emit('members',{visibility:'members'});assert.equal(eventRumorId(engine,s,members),null);
    const unseen=emit('unseen',{witnesses:[]});assert.equal(eventRumorId(engine,s,unseen),null);
    s.created.npc_v6_child={id:'npc_v6_child',name:'不能外传的孩子',age:12};s.npcs.npc_v6_child={location:SID,status:'正常'};
    const child=emit('minor',{target:'npc_v6_child',summary:'不能外传的孩子获任'});assert.equal(eventRumorId(engine,s,child),null);
    engine.byId.get(A).flags={...engine.byId.get(A).flags,minor:true};
    assert.equal(eventRumorId(engine,s,emit('protected')),null,'显式未成年保护不因年龄资料冲突失效');
    engine.byId.get(A).flags.minor=false;
    const lines=returnChanges(engine,s,SID,{from:800,to:1000}).join('；');assert.match(lines,/public任命通知/);assert.doesNotMatch(lines,/private任命|members任命|不能外传的孩子/);
    const saved=structuredClone(s);personName(engine,s,A);personal(engine,d.document);affairs(engine,d.document);assert.deepEqual(s,saved,'投影只读');
});

test('历史死亡通知保留当时姓名；当前改名不倒改返场事实，私密家事不回退成公开账',t=>{
    const f=fixture(t),{s,engine,d}=f;s.created[A]={...engine.byId.get(A),name:'当时姓名'};s.npcs[A].location='loc_hw';s.minute=600;
    recordEntityDeath(d,engine,A,600,'寿终');s.created[A].name='后来姓名';s.minute=900;
    assert.equal(personName(engine,s,A).value,'后来姓名');
    const before=returnChanges(engine,s,'loc_hw',{from:500,to:900}).join('；');assert.match(before,/当时姓名/);assert.doesNotMatch(before,/后来姓名/);
    const e=transitions(s).find(e=>e.verb==='die');s.records[`world_event:${e.id}`].visibility='private';
    assert.doesNotMatch(returnChanges(engine,s,'loc_hw',{from:500,to:900}).join('；'),/当时姓名|后来姓名/);
});

test('私密案件的拘押与释放保持同一可知边界，不通过后续期限通知变为公开',t=>{
    const f=fixture(t),{s,engine,d}=f,code=engine.rules.law.codes.find(c=>c.court==='bld_hw_council');
    const w={id:'legal_wanted:private_v6',subject:A,law:code.id,case:'legal_case:private_v6',scope:[code.id],status:'生效',bounty:0,pledge:{coins:0},silenced:[],history:[]};
    s.records[w.id]=w;s.records[w.case]={category:'legal_case',id:w.case,offender:A,status:'已报案',private:true};
    s.npcs[B].location=code.court;s.npcs[B].activity='闲谈';s.npcs[B].memoryStream=[];
    const held=once(f,'detain',()=>deliverFugitive(d,engine,w,'player',600));assert.equal(held.visibility,'private');
    const at=s.records[`legal_detention:${w.id}`].expires;s.minute=at;
    const release=once(f,'release',()=>advanceLaw(d,at,engine));assert.equal(release.visibility,'private');assert.equal(eventRumorId(engine,s,release),null);
    assert.ok(!s.npcs[B].memoryStream.some(m=>[held.id,release.id].includes(m.sourceEvent)));
    s.location=code.court;s.records['custody:private_player']={category:'legal_custody',case:w.case,status:'生效',reason:'待审',location:code.court,expires:at+1};
    const playerRelease=once(f,'release',()=>advanceLaw(d,at+1,engine));assert.equal(playerRelease.visibility,'private');
});

test('公开组织现任职位与师承读取当前关系，离职后撤去官称而历史师承记忆保留',t=>{
    const f=fixture(t),{s,engine,d}=f,F='faction_saltboat';
    s.records[`organization:${F}`]={category:'organization',id:F,source:'faction',leader:B,members:{[B]:{position:'首领'}},removed:{}};
    engine.byId.get(A).relationships=[{with:B,type:'师父',note:'入门时拜师'}];s.npcs[B].location=s.location;
    const first=npcBackground(engine,d.document,A,engine.byId.get(A).name).relations.find(r=>r.with===B);assert.ok(first.publicRole.includes(engine.byId.get(F).name));
    s.npcs[A].relationships??={};s.npcs[A].relationships[B]={type:'师父',status:'已结束'};
    s.records[`organization:${F}`].removed[B]={minute:600};delete s.records[`organization:${F}`].members[B];
    assert.ok(!personRelationships(engine,s,A).value.some(r=>r.with===B&&r.type==='师父'));
    assert.equal(engine.byId.get(A).relationships[0].note,'入门时拜师');
    const role=engine.rules.training.institutions[0];s.professions.life=[role.profession];s.careers??={};s.careers[role.profession]={certification:{teacher:role.teacher}};
    assert.ok(personal(engine,d.document).player.relations.some(r=>r.with===role.teacher&&r.type==='师父'));
    s.professions.life=[];assert.ok(!personal(engine,d.document).player.relations.some(r=>r.with===role.teacher&&r.type==='师父'));
});

test('同一输入存档与事件重放产生相同补丁，领域事件重启后继续去重',async t=>{
    const f=fixture(t);office(f.s,A);f.s.settlements[SID].treasury=0;f.s.minute=MONTH-1;
    for(const r of Object.values(f.s.records))if(Number.isSafeInteger(r.lastDay))r.lastDay=28;
    const input={tool:'world_time',args:{minutes:1},eventId:'v6-replay'},out=await f.engine.reduce(f.d.document,input);
    const replay=await f.engine.reduce(f.d.document,input,{replay:true,result:out.result});assert.deepEqual(replay.patches,out.patches);
    const doc=applyPatches(f.d.document,out.patches),event=transitions(doc.state).find(e=>e.verb==='salary');assert.ok(event);
    f.d.document=JSON.parse(JSON.stringify(doc));assert.equal(publishTransitionEvent(f.d,f.engine,event),false);
});
