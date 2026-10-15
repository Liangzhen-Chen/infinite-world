import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {personView,groupView,placeView,populationView,itemView} from '../server-plugin/entity-view.mjs';
import {npcHousehold,npcAgeAt,householdMembers} from '../server-plugin/npc-life.mjs';
import {organization,organizationAction} from '../server-plugin/organizations.mjs';
import {reputationFactions} from '../server-plugin/reputation-registry.mjs';
import {collectivesOf,transmitStanding,standing} from '../server-plugin/standing.mjs';
import {opinionOf} from '../server-plugin/public-opinion.mjs';
import {observeLegalReputation} from '../server-plugin/reputation.mjs';

const world=await loadWorld(),engine=new WorldEngine(world);
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const fresh=()=>engine.createCharacter(seed,{},'entity-view');
const A='npc_hw_linsui',B='npc_hw_ayan',F='faction_reedpact';
const draft=document=>({document,get(...p){return p.reduce((o,k)=>o?.[k],this.document);},set(p,value){let o=this.document;for(const k of p.slice(0,-1))o=o[k]??={};o[p.at(-1)]=value;}});
const harm=(target,id)=>({id,verb:'harm',actor:'player',target,harm:6,witnesses:[],tags:['combat','hostile'],minute:600});
const guild=(state,id,members,leader)=>state.records[`organization:${id}`]={category:'organization',id,source:'created',name:id,kind:'行会',seat:'loc_hw',members,removed:{},leader,charter:{mode:'leader'},treasury:0};

test('迁居后的当前户籍、居所和旅途位置分开读取，立场只传新村新家户',()=>{
    const d=draft(fresh()),s=d.document.state,old=npcHousehold(engine,s,A);
    const home=world.households.find(h=>h.settlement!=='loc_hw'&&h.members.length);
    s.family??={};s.family.households={[old.id]:{left:[A]},[home.id]:{members:[A]}};
    s.npcs[A].residence={household:home.id,settlement:home.settlement,home:home.homeLocation,since:500};
    s.npcs[A].location=null;
    const v=personView(engine,s,A);
    assert.equal(v.household.value.id,home.id);assert.equal(v.settlement.value,home.settlement);
    assert.equal(v.location.value,null);assert.equal(v.residence.value.home,home.homeLocation);
    assert.equal(v.household.override,true);assert.equal(v.settlement.override,true);
    assert.match(v.settlement.source,/residence.settlement$/);
    assert.deepEqual(v.household.value.members,householdMembers(engine,s,home.id));
    const rows=collectivesOf(engine,s,A);
    assert.ok(rows.some(r=>r.holder===home.settlement));
    assert.ok(!rows.some(r=>r.holder==='loc_hw'||r.holder===B));
    transmitStanding(d,engine,[harm(A,'moved')]);
    assert.equal(standing(engine,s,home.settlement),-5);assert.equal(standing(engine,s,'loc_hw'),0);
    // Visiting the former village does not restore the former membership.
    s.npcs[A].location=old.homeLocation;
    assert.equal(personView(engine,s,A).settlement.value,home.settlement);
    assert.ok(!collectivesOf(engine,s,A).some(r=>r.holder==='loc_hw'));
});

test('退出目录势力后目录仍可发现，当前成员和立场、舆论不再使用旧名单',()=>{
    const d=draft(fresh()),s=d.document.state,member=world.factions.find(f=>f.id===F).leader;
    assert.ok(reputationFactions(engine,s).find(f=>f.id===F).members.includes(member));
    s.records[`organization:${F}`]={category:'organization',id:F,members:{},removed:{[member]:{minute:500}}};
    assert.ok(reputationFactions(engine).find(f=>f.id===F).members.includes(member),'目录默认保持可发现');
    assert.ok(!reputationFactions(engine,s).find(f=>f.id===F).members.includes(member));
    assert.ok(!personView(engine,s,member).organizations.some(o=>o.value.id===F));
    assert.ok(!collectivesOf(engine,s,member).some(r=>r.holder===F||r.via===`ally:${F}`));
    transmitStanding(d,engine,[harm(member,'left')]);assert.equal(standing(engine,s,F),0);
    s.records.case_left={category:'legal_case',id:'case_left',offender:'player',settlement:'loc_hw',reputationEvents:{conviction:{sourceEvent:'law_left',stage:'conviction',minute:500}}};
    observeLegalReputation(d,engine,member,{legalCase:'case_left',sourceEvent:'law_left',legalStage:'conviction',minute:600,location:'loc_hw',sourceType:'目击'});
    assert.ok(!Object.values(s.records).some(r=>r.category==='reputation'&&r.target===F),'退出者获知裁判也不代表旧势力记声望');
    s.records[`standing:${F}:player`]={category:'standing',holder:F,target:'player',value:-60,history:[]};
    assert.deepEqual(opinionOf(engine,s,member,{act:'harm',actor:'player',affected:'unrelated'}),{stance:'neutral',basis:'与双方无利害'});
    // No memoized current membership survives an admission on the same state.
    s.records[`organization:${F}`].members[member]={position:'成员',joinedAt:700};
    delete s.records[`organization:${F}`].removed[member];
    assert.ok(reputationFactions(engine,s).find(f=>f.id===F).members.includes(member));
});

test('组织唯一首领实际退会后空缺不回退，死亡首领也不再占职',()=>{
    const d=draft(fresh()),s=d.document.state;
    guild(s,'org_only',{player:{position:'会长'}},'player');
    assert.equal(groupView(engine,s,'org_only').leader.value,'player');
    const result=organizationAction.call(engine,d,{operation:'org_leave',org:'org_only'},'leave-only');
    assert.equal(result.left,true);
    assert.deepEqual(groupView(engine,s,'org_only').members.value,{});
    assert.deepEqual(groupView(engine,s,'org_only').leader,{value:null,source:'state.records.organization:org_only.leader',override:true});
    const f=world.factions.find(f=>f.id===F),member=f.leader;
    s.records[`organization:${F}`]={category:'organization',id:F,members:{},removed:{[member]:{}},leader:null};
    assert.equal(organization(engine,s,F).leader,null);
    delete s.records[`organization:${F}`];s.npcs[member]??={};s.npcs[member].status='死亡';
    assert.equal(groupView(engine,s,F).leader.value,null);
    assert.ok(!reputationFactions(engine,s).find(f=>f.id===F).members.includes(member));
});

test('精怪同时以有效组织与精怪社会成员传导，退出和死亡即时生效',()=>{
    const d=draft(fresh()),s=d.document.state,id='spirit_v1',society='spirit_society:v1';
    s.creatures??={};s.creatures[id]={id,name:'试验精怪',species:world.monsters[0].id,status:'正常',mind:{awakened:{stage:'立意'}},society:{id:society}};
    guild(s,'org_spirit',{[id]:{position:'会长'}},id);
    s.records[`organization:${F}`]={category:'organization',id:F,members:{[id]:{position:'成员'}},removed:{}};
    const v=personView(engine,s,id);
    assert.deepEqual(v.actorPath.value,['state','creatures',id]);assert.equal(v.society.value.id,society);
    assert.ok(v.organizations.find(o=>o.value.id===F).override);
    assert.equal(groupView(engine,s,'org_spirit').leader.value,id);
    transmitStanding(d,engine,[harm(id,'spirit')]);
    assert.equal(standing(engine,s,'org_spirit'),-8);assert.equal(standing(engine,s,F),-8);assert.equal(standing(engine,s,society),-8);
    s.records[`organization:${F}`].members={};s.records[`organization:${F}`].removed[id]={};
    assert.ok(!collectivesOf(engine,s,id).some(r=>r.holder===F));
    s.creatures[id].status='死亡';assert.equal(groupView(engine,s,'org_spirit').leader.value,null);
    assert.deepEqual(groupView(engine,s,'org_spirit').members.value,{});
});

test('首领别名复用居民身体、家户和组织归属，名册与玩家保留原有身份来源',()=>{
    const s=fresh().state,boss=world.bosses.find(b=>b.actor),id=boss.actor;
    assert.equal(personView(engine,s,boss.id).id.value,id);
    assert.deepEqual(personView(engine,s,boss.id).actorPath.value,['state','npcs',id]);
    assert.deepEqual(collectivesOf(engine,s,boss.id),collectivesOf(engine,s,id));
    assert.equal(standing(engine,s,boss.id),standing(engine,s,id));
    const roster=world.residents.find(r=>r.householdId);
    assert.equal(personView(engine,s,roster.id).household.value.id,roster.householdId);
    assert.equal(personView(engine,s,roster.id).age.value,npcAgeAt(engine,s,roster.id));
    guild(s,'org_player',{player:{position:'会长'}},'player');
    assert.ok(personView(engine,s,'player').organizations.some(o=>o.value.id==='org_player'));
    assert.equal(personView(engine,s,'player').location.value,s.location);
});

test('官职、爵位、名士与法律身份按当前记录读，过期或撤销身份不授予',()=>{
    const s=fresh().state;s.minute=800;
    s.records.office={category:'governance_office',holder:'player',status:'在任',until:900,office:'mayor'};
    s.records.expired={category:'governance_office',holder:'player',status:'在任',until:800};
    s.records.title={category:'title',holder:'player',status:'受封'};
    s.records.notable={category:'notable',holder:'player',status:'在册'};
    s.records.wanted={category:'legal_wanted',subject:'player',status:'生效'};
    s.records.custody={category:'legal_custody',status:'生效',expires:850};
    s.records.dismissal={category:'legal_dismissal',npc:A};
    let v=personView(engine,s,'player');assert.equal(v.offices.length,1);
    assert.equal(v.offices[0].source,'state.records.office');assert.equal(v.offices[0].override,true);
    assert.equal(v.titles.length,1);assert.equal(v.notables.length,1);assert.equal(v.legal.length,2);
    assert.equal(personView(engine,s,A).legal[0].value.category,'legal_dismissal');
    s.records.office.status='免职';s.records.title.status='已除爵';s.records.notable.status='已除名';
    s.records.wanted.status='已销案';s.minute=851;
    v=personView(engine,s,'player');assert.equal(v.offices.length,0);assert.equal(v.titles.length,0);assert.equal(v.notables.length,0);assert.equal(v.legal.length,0);
});

test('五个入口只读且返回独立值，旧存档缺字段仍沿目录默认，不另存人物汇总',()=>{
    const old={minute:0,npcs:{},records:{}},person=personView(engine,old,A);
    assert.equal(person.household.override,false);assert.equal(person.settlement.value,'loc_hw');
    assert.deepEqual(person.offices,[]);assert.deepEqual(person.legal,[]);
    assert.ok(groupView(engine,old,F).members.value[world.factions.find(f=>f.id===F).leader]);
    const s=fresh().state,item=world.items[0],h=engine.rules.wildlife.habitats[0],species=world.monsters[0].id;
    s.itemInstances??={};s.itemInstances.unit_v1={id:'unit_v1',item:item.id,owner:A,status:'持有',durability:7};
    s.records[`ecology:${h.id}`]={populations:{[species]:{count:9}}};
    const before=structuredClone(s),catalog=structuredClone(world);
    const views=[personView(engine,s,A),groupView(engine,s,F),placeView(engine,s,'loc_hw'),populationView(engine,s,h.id,species),itemView(engine,s,'unit_v1')];
    assert.equal(views[3].population.value.count,9);assert.equal(views[4].owner.value,A);
    for(const view of views)for(const field of Object.values(view))if(field?.value&&typeof field.value==='object')field.value.changedByCaller=true;
    assert.deepEqual(s,before);assert.deepEqual(world,catalog);
    assert.equal(itemView(engine,s,item.id).definition.override,false);
    assert.equal(personView(engine,s,'missing'),null);assert.equal(groupView(engine,s,'missing'),null);
});
