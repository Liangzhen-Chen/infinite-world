import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {groupView,personView,groupRepresentative} from '../server-plugin/entity-view.mjs';
import {organization,organizationAction,advanceOrganizations,DUES_PERIOD} from '../server-plugin/organizations.mjs';
import {spendFactionAssets,creditFactionAssets,factionClockAction} from '../server-plugin/faction-clock.mjs';
import {groupAccountView,ensureGroupAccount} from '../server-plugin/group-account.mjs';
import {recommendation,notableAction} from '../server-plugin/notables.mjs';
import {collectivesOf} from '../server-plugin/standing.mjs';
import {electionAction} from '../server-plugin/elections.mjs';
import {societyGovernance,societyAgreement,assertSocietyTrade} from '../server-plugin/monster-society.mjs';
import {partyCoins,partyPay} from '../server-plugin/military.mjs';
import {registerWorldEventSubscriber,publishTransitionEvent} from '../server-plugin/world-events.mjs';
import {advanceTribalAwakening,tribalKey} from '../server-plugin/tribal-awakening.mjs';

const source=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const F='faction_saltboat',A='npc_hw_linsui',B='npc_hw_ayan',S='monster_instance_group_test',DAY=1440;
function setup(){
    const world=structuredClone(source);for(const n of world.npcs){delete n.schedule;delete n.tier;}
    const engine=new WorldEngine(world),document=engine.createCharacter(seed,{},'entity-groups');
    document.state.minute=540;document.state.player.coins=500;document.state.creatures??={};
    const d={document,get(...p){return p.reduce((v,k)=>v?.[k],this.document);},set(p,v){let o=this.document;for(const k of p.slice(0,-1))o=o[k]??={};o[p.at(-1)]=structuredClone(v);},say(){}};
    for(const id of [A,B])Object.assign(document.state.npcs[id],{location:document.state.location,coins:100,status:'正常',activity:'闲谈'});
    return {world,engine,d,s:document.state};
}
function guild(s,id='org_test',extra={}){
    return s.records[`organization:${id}`]={category:'organization',id,source:'created',kind:'行会',name:id,seat:s.location,leader:'player',members:{player:{position:'会长'},[A]:{position:'成员'}},removed:{},treasury:100,ledger:[],charter:{mode:'leader',approval:false,dues:0},...extra};
}
const act=(e,d,args,id)=>organizationAction.call(e,d,args,id);

test('公库两入口共享余额：组织存入、时钟支出退款、议案支取与会费都守恒，读取不写存档',()=>{
    const {engine,d,s}=setup(),base=engine.world.factions.find(f=>f.id===F).resources.treasuryCopper;
    guild(s,F,{source:'faction',leader:'player',treasury:0,nextDues:DUES_PERIOD,charter:{mode:'leader',dues:5}});
    const total=()=>s.player.coins+Object.values(s.npcs).reduce((n,a)=>n+(a.coins??0),0)+groupView(engine,s,F).treasury.value,initial=total();
    act(engine,d,{operation:'org_deposit',org:F,coins:50},'dep');
    assert.equal(groupView(engine,s,F).treasury.value,base+50);
    assert.equal(s.records[`faction-assets:${F}`].coins,base+50);
    assert.equal(s.records[`organization:${F}`].treasury,0,'历史差额不再充当可花费余额');
    assert.equal(spendFactionAssets(d,engine,F,{coins:30},{sourceEvent:'stage',minute:600}),true);
    creditFactionAssets(d,engine,F,{coins:10},{sourceEvent:'refund',minute:601});
    assert.equal(organization(engine,s,F).treasury,base+30);
    const out=act(engine,d,{operation:'org_propose',org:F,action:'withdraw',member:A,coins:20},'withdraw');
    assert.equal(out.outcome,'已执行');assert.equal(s.npcs[A].coins,120);
    assert.equal(groupView(engine,s,F).treasury.value,base+10);
    advanceOrganizations(d,engine,{before:DUES_PERIOD-1,after:DUES_PERIOD});
    // Every living catalog member of this faction also owes the same dues.
    const paid=s.records[`organization:${F}`].ledger.filter(l=>l.kind==='会费').reduce((n,l)=>n+l.amount,0);
    assert.equal(groupView(engine,s,F).treasury.value,base+10+paid);
    assert.equal(total(),initial-20,'阶段净花费20铜，所有组织转账守恒');
    const before=structuredClone(s);groupView(engine,s,F);groupAccountView(engine,s,F);assert.deepEqual(s,before);
    assert.equal(spendFactionAssets(d,engine,F,{coins:base+100000},{sourceEvent:'no'}),false);
});

test('旧双账按来源合并增量，重叠只计一次，保留两份历史，重启后不重复核对',()=>{
    const {engine,d,s}=setup(),base=engine.world.factions.find(f=>f.id===F).resources.treasuryCopper;
    const orgLedger=[{sourceEvent:'same',amount:10,party:'player'},{sourceEvent:'org-only',amount:20},{sourceEvent:'org-spend',amount:-5}];
    guild(s,F,{source:'faction',treasury:25,ledger:orgLedger});
    const clockLedger=[{sourceEvent:'same',coins:10},{sourceEvent:'clock-spend',coins:-30}];
    s.records[`faction-assets:${F}`]={category:'faction_assets',faction:F,coins:base-20,items:{},relations:{},disputes:{},ledger:clockLedger};
    assert.equal(groupView(engine,s,F).treasury.value,base-5);
    const account=ensureGroupAccount(d,engine,F);
    assert.deepEqual(account.organizationReconciliation,{delta:25,applied:15,overlap:10,unverified:0,ledger:orgLedger});
    assert.deepEqual(account.ledger,clockLedger);assert.deepEqual(s.records[`organization:${F}`].ledger,orgLedger);
    assert.equal(groupView(engine,structuredClone(s),F).treasury.value,base-5);
    act(engine,d,{operation:'org_deposit',org:F,coins:7},'new');
    assert.equal(ensureGroupAccount(d,engine,F).coins,base+2);
    assert.equal(groupView(engine,s,F).treasury.value,base+2);
});

test('旧双账缺来源的差额保留待核对，不凭两份余额相加增资；仅旧组织账仍可用',()=>{
    const {engine,d,s}=setup(),base=engine.world.factions.find(f=>f.id===F).resources.treasuryCopper;
    guild(s,F,{source:'faction',treasury:70,ledger:[]});
    assert.equal(groupView(engine,s,F).treasury.value,base+70);
    assert.equal(partyCoins(engine,s,F),base+70);
    s.records[`faction-assets:${F}`]={category:'faction_assets',faction:F,coins:40,ledger:[],items:{}};
    assert.equal(groupView(engine,s,F).treasury.value,40);
    assert.equal(ensureGroupAccount(d,engine,F).organizationReconciliation.unverified,70);
    assert.equal(s.records[`organization:${F}`].treasury,70);
    assert.equal(partyPay(d,engine,F,3,{sourceEvent:'military',reason:'军需',partial:false}),3);
    assert.equal(groupView(engine,s,F).treasury.value,37);
});

test('共享账户保留资产记录冲突保护',()=>{
    const {engine,d,s}=setup();s.records[`faction-assets:${F}`]={category:'unrelated',coins:500};
    assert.throws(()=>ensureGroupAccount(d,engine,F),/记录冲突/);
    assert.equal(s.records[`faction-assets:${F}`].category,'unrelated');
});

test('代表读现任职位：首领别名、换任、空缺、死亡与退出即时生效',()=>{
    const {world,engine,d,s}=setup(),f=world.factions.find(f=>f.id===F),old=f.leader,location=f.contactAnchor;
    for(const f of world.factions)if(f.clock?.stages)delete f.clock.stages;
    world.rules.factionClock={version:1,clocks:[{id:'group_clock',faction:F,source:'test',settlement:'loc_hw',intervalDays:1,probability:1,
        stages:[{id:'stage',condition:{kind:'always'},cost:{},effect:{kind:'relation',target:'faction_riverhomes',delta:1}}],contact:{location,representative:old}}]};
    s.location=location;s.creatures[S]={id:S,name:'精怪代表',location,status:'正常',coins:20,activity:'登记'};
    guild(s,F,{source:'faction',leader:S,treasury:0,members:{[S]:{position:'首领'}}});
    assert.equal(groupRepresentative(engine,s,F,old),S);
    assert.ok(!groupView(engine,s,F).officials.value.includes(old));
    assert.equal(factionClockAction.call(engine,d,{operation:'faction_inspect',faction:F},'inspect').treasury,groupView(engine,s,F).treasury.value);
    s.records[`organization:${F}`].leader=null;
    assert.throws(()=>factionClockAction.call(engine,d,{operation:'faction_inspect',faction:F},'vacant'),/代表/);
    assert.equal(groupView(engine,s,F).leader.override,true);
    s.records[`organization:${F}`].leader=S;s.creatures[S].status='死亡';
    assert.equal(groupView(engine,s,F).leader.value,null);
    assert.throws(()=>factionClockAction.call(engine,d,{operation:'faction_inspect',faction:F},'dead'),/代表/);
    const boss=world.bosses.find(b=>b.actor&&b.actor.startsWith('npc_'));
    guild(s,'org_alias',{leader:boss.id,members:{[boss.id]:{position:'会长'}}});
    assert.equal(groupView(engine,s,'org_alias').leader.value,boss.actor);
});

test('精怪与首领身体共用入退会、任职、收款、缴费与立场路径',()=>{
    const {engine,d,s}=setup();guild(s);s.creatures[S]={id:S,name:'精怪',location:s.location,status:'正常',coins:100,activity:'闲谈'};
    s.creatures[S].trust=-100;
    assert.throws(()=>act(engine,d,{operation:'org_join',org:'org_test',member:S,consent:true},'forged-join'),/本人当面同意/);
    assert.ok(!s.consentEvents?.some(row=>row.from===S));
    s.creatures[S].trust=0;
    assert.equal(act(engine,d,{operation:'org_join',org:'org_test',member:S},'join').joined,true);
    assert.ok(s.consentEvents.some(row=>row.from===S&&row.scope==='org.join'&&row.subject==='org_test'));
    assert.equal(act(engine,d,{operation:'org_propose',org:'org_test',action:'withdraw',member:S,coins:12},'pay').outcome,'已执行');
    assert.equal(s.creatures[S].coins,112);assert.ok(!s.npcs[S]);
    act(engine,d,{operation:'org_propose',org:'org_test',action:'appoint',member:S,name:'会长'},'appoint');
    assert.equal(groupView(engine,s,'org_test').leader.value,S);
    assert.equal(groupView(engine,s,'org_test').members.value.player.position,'成员');
    s.records['organization:org_test'].nextDues=DUES_PERIOD;s.records['organization:org_test'].charter.dues=5;
    advanceOrganizations(d,engine,{before:DUES_PERIOD-1,after:DUES_PERIOD});assert.equal(s.creatures[S].coins,107);
    s.records['organization:org_test'].leader='player';
    act(engine,d,{operation:'org_leave',org:'org_test',member:S,consent:true},'leave');
    assert.ok(!personView(engine,s,S).organizations.some(o=>o.value.id==='org_test'));
    assert.ok(!collectivesOf(engine,s,S).some(o=>o.holder==='org_test'));
});

test('精怪选民可在场听演说和收款，不写出第二个NPC身体',()=>{
    const {engine,d,s}=setup();guild(s,'org_vote',{leader:S,charter:{mode:'vote'},members:{player:{position:'成员'},[S]:{position:'会长'}}});
    s.creatures[S]={id:S,name:'精怪选民',location:s.location,status:'正常',coins:0,activity:'闲谈'};
    engine.advance=()=>{};engine.check=()=>({success:true});
    const election=electionAction.call(engine,d,{operation:'election_start',org:'org_vote'},'start');
    const result=electionAction.call(engine,d,{operation:'election_campaign',proposal:election.election,choice:'speech',content:'公开账目'},'speech');
    assert.deepEqual(result.targets,[S]);assert.ok(s.creatures[S].memoryStream.some(m=>m.kind==='campaign'));assert.ok(!s.npcs[S]);
});

test('引见和举荐读现任职位，旧任与空缺不能引见，历史会见不倒改',()=>{
    const {world,engine,d,s}=setup(),rules=world.rules.governance.notables;
    const f=world.factions.find(f=>rules.rights.nobleKinds.includes(f.kind)),old=f.leader;
    guild(s,f.id,{source:'faction',leader:A,members:{[A]:{position:'首领'}},treasury:0});
    s.records[`standing:${A}:player`]={category:'standing',holder:A,target:'player',value:100,history:[]};
    assert.equal(recommendation(engine,s,A).ok,true);assert.equal(recommendation(engine,s,old).ok,false);
    s.records['notable:player']={category:'notable',status:'在册',holder:'player'};s.location=f.contactAnchor;s.npcs[A].location=s.location;
    engine.advance=()=>{};
    const result=notableAction.call(engine,d,{operation:'notable_audience',sponsor:f.id},'meet');assert.equal(result.host,A);
    s.records[`organization:${f.id}`].leader=null;
    assert.throws(()=>notableAction.call(engine,d,{operation:'notable_audience',sponsor:f.id},'vacant'),/空缺/);
    assert.equal(s.records['notable_audience:meet'].host,A);
});

test('离屏议决在成员提交后只通知一次，已存事件重放不再触发订阅者',()=>{
    const {engine,d,s}=setup();guild(s,'org_off',{leader:A,charter:{mode:'leader',approval:true,fee:0}});
    const received=[],off=registerWorldEventSubscriber({id:'v4_commit_test',order:999,on(d,e,events){for(const event of events)if(event.tags.includes('org:decide'))received.push({id:event.id,member:groupView(e,d.get('state'),'org_off').members.value[B]});}});
    try{
        act(engine,d,{operation:'org_join',org:'org_off',member:B,consent:true},'apply');
        advanceOrganizations(d,engine,{before:540,after:DAY});advanceOrganizations(d,engine,{before:540,after:DAY});
        assert.equal(received.length,1);assert.ok(received[0].member);
        const event=s.records[`world_event:${received[0].id}`];assert.deepEqual(event.witnesses,[]);
        assert.equal(publishTransitionEvent(d,engine,event),false);assert.equal(received.length,1);
    }finally{off();}
});

test('待决议案按现任职位表决，已故前任不占据决策席',()=>{
    const {engine,d,s}=setup();guild(s,'org_pending',{leader:A,charter:{mode:'leader',approval:true,fee:0}});
    s.creatures[S]={id:S,name:'继任会长',location:s.location,status:'正常',coins:0,activity:'议事'};
    const p=act(engine,d,{operation:'org_join',org:'org_pending',member:B,consent:true},'apply');
    assert.equal(p.status,'议事中');
    s.npcs[A].status='死亡';s.records['organization:org_pending'].leader=S;s.records['organization:org_pending'].members[S]={position:'会长'};
    const vote=act(engine,d,{operation:'org_vote',org:'org_pending',proposal:p.proposal,speaker:S,opinion:'approve'},'new-chair');
    assert.equal(vote.status,'通过');assert.ok(groupView(engine,s,'org_pending').members.value[B]);
    assert.deepEqual(s.records[p.proposal].deciders,[S]);
});

test('族群分派在组织与成员提交后发语义事件，重复季度不重复发布',()=>{
    const {engine,d,s}=setup(),dyn=engine.rules.tribalAwakening.dynamics[0],Q=90*DAY;
    s.creatures[S]={id:S,name:'族群成员',species:dyn.species,ecology:dyn.habitat,location:dyn.home,status:'正常',hp:20,maxHp:20,level:3};
    s.records[tribalKey(dyn.id)]={category:'tribal_awakening',id:dyn.id,status:'听息',progress:engine.rules.tribalAwakening.thresholds.liyi-1,totals:{magic:0,teach:0,injustice:0},taught:0,choiceTotals:{teach:0,trade:0,mediate:0,suppress:0},seen:{displaced:0},quarters:[],awakened:[],factions:[],demands:[],population:0,outcome:null,lastTick:0};
    const received=[],off=registerWorldEventSubscriber({id:'v4_tribal_commit',order:999,on(d,e,events){for(const event of events)if(event.tribe===dyn.id&&event.verb==='organize'){
        const org=event.tags.includes('org:join')?event.target:event.actor;
        assert.ok(groupView(e,d.get('state'),org));if(event.member)assert.ok(groupView(e,d.get('state'),org).members.value[event.member]);received.push(event);
    }}});
    try{
        advanceTribalAwakening(d,engine,{before:Q-1,after:Q});
        assert.equal(received.filter(e=>e.tags.includes('org:found')).length,3);
        assert.equal(received.filter(e=>e.tags.includes('org:join')).length,1);
        const count=received.length;advanceTribalAwakening(d,engine,{before:Q-1,after:Q});assert.equal(received.length,count);
    }finally{off();}
});

test('聚居地议事由现任组织首领闭合，前任退出即失去主持权',()=>{
    const {world,engine,d,s}=setup(),place=world.locations.find(l=>l.monsterSociety),f=world.factions.find(f=>f.contactAnchor===place.id),c=place.monsterSociety;
    const member=world.npcs.find(n=>n.society===place.id&&n.id!==f.leader&&n.age>=18).id;
    guild(s,f.id,{source:'faction',leader:member,members:{[member]:{position:'首领'}},removed:{[f.leader]:{}},treasury:0});
    s.location=c.meetingPlace;Object.assign(s.npcs[member],{location:s.location,status:'正常',activity:'议事'});
    const proposed=societyGovernance(d,engine,{operation:'governance_propose',issue:c.motions[0].id},'propose',place.id);
    assert.throws(()=>societyGovernance(d,engine,{operation:'governance_close',proposal:proposed.proposal,authority:f.leader},'old',place.id),/成员|首领/);
    assert.ok(['通过','否决'].includes(societyGovernance(d,engine,{operation:'governance_close',proposal:proposed.proposal,authority:member},'new',place.id).meeting.status));
});

test('已签聚居地契约保留原签约人，离任后仍按原契约履约，新任不能接走历史身份',()=>{
    const {world,engine,d,s}=setup(),place=world.locations.find(l=>l.monsterSociety),f=world.factions.find(f=>f.contactAnchor===place.id),boss=world.bosses.find(b=>b.id===place.monsterSociety.leader);
    guild(s,f.id,{source:'faction',leader:A,members:{[A]:{position:'首领'}},removed:{[boss.actor]:{}},treasury:0});
    Object.assign(s.npcs[boss.actor],{location:s.location,status:'正常',activity:'履约'});
    s.records.signed={category:'society_agreement',society:place.id,leader:boss.actor,parties:[boss.actor],kind:'trade',offer:[],request:[],installments:[],status:'有效',nextDue:s.minute,expires:s.minute+30*DAY};
    const result=societyAgreement(d,engine,boss,{contract:'signed'},'kept',()=>{});
    assert.equal(result.kept,true);assert.equal(s.records.signed.leader,boss.actor);assert.deepEqual(s.records.signed.parties,[boss.actor]);
    assert.throws(()=>societyAgreement(d,engine,{...boss,actor:A},{contract:'signed'},'usurp',()=>{}),/这位首领/);
});

test('退出聚居地组织并迁居后，旧聚居地敌意不再禁止与本人交易',()=>{
    const {world,engine,d,s}=setup(),place=world.locations.find(l=>l.monsterSociety),f=world.factions.find(f=>f.contactAnchor===place.id),id=f.leader;
    guild(s,f.id,{source:'faction',leader:null,members:{},removed:{[id]:{}},treasury:0});
    s.npcs[id].residence={settlement:'loc_hw',since:0};s.records[`stance:${place.id}:player`]={category:'settlement_stance',stance:'敌对'};
    assert.doesNotThrow(()=>assertSocietyTrade(d,engine,'player',id));
});
