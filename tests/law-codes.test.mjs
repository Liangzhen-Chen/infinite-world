import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {generateCounty,remoteWorld} from '../server-plugin/remote-generation.mjs';
import {legalCodes,legalCodeAt,legalTemplate,courtHierarchy,courtFacilities,legalCooperation} from '../server-plugin/law-codes.mjs';
import {lawAction} from '../server-plugin/law.mjs';
import {wantedScope,wantedReachedAt} from '../server-plugin/bounty.mjs';
const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
function setup(counties=['county_hanlu_tongji','county_zhonglu_wangji']){
 const state={records:{},npcs:{},remote:{},minute:600};
 for(const county of counties){const skeleton=generateCounty(world,county,'L1-law');state.remote[county]={county,skeleton,profiles:{}};for(const p of skeleton.people)state.npcs[p.id]={status:'正常',location:p.location,activity:'办公',occupation:p.occupation,coins:1000};}
 const engine=new WorldEngine(remoteWorld(world,state));return{engine,state};
}
function draft(state){return{document:{state,randomSeed:'L1-law'},get:(...p)=>p.reduce((o,k)=>o?.[k],{state}),set:(p,v)=>{let o={state};for(const k of p.slice(0,-1))o=o[k];o[p.at(-1)]=v;},say:()=>{}};}
test('九省全部郡按实际统治政体选法典，五村原文不变，非人议事程序独立',()=>{
 const templates=world.rules.law.templates;assert.equal(templates.length,15);
 for(const c of world.regions.filter(r=>r.category==='county'))assert.ok(legalTemplate(world,c),c.id);
 for(const c of world.rules.law.codes)assert.ok(!c.derived&&!c.template);
 for(const t of templates){assert.deepEqual(Object.keys(t.stances),['duel','magic','smuggling','mining','enslavement','trafficking']);assert.equal(t.evidenceRequired,2);assert.ok(t.penalties.fraud&&t.penalties.trafficking);}
 assert.match(templates.find(t=>t.id==='law_orcmoot').procedure,/会火/);assert.match(templates.find(t=>t.id==='law_lignum').procedure,/就地答辩/);assert.match(templates.find(t=>t.id==='law_scent').evidence,/串迹/);
});
test('远方生成各级聚落读出法院和实际执法者，当前改业与撤职即时生效',()=>{
 for(const county of ['county_hanlu_tongji','county_hanlu_zheya','county_feicui_lieer','county_wushan_shanyi']){
  const {engine,state}=setup([county]),before=structuredClone(state);
  for(const s of state.remote[county].skeleton.settlements){const f=courtFacilities(engine,state,s.id);assert.ok(f.court&&f.officers.length&&f.judges.length);assert.equal(legalCodeAt(engine,s.id,state).polity,world.regions.find(c=>c.id===county).ruler.polity);}
  assert.deepEqual(state,before);
  const sid=state.remote[county].skeleton.seat,officer=courtFacilities(engine,state,sid).officers[0];state.npcs[officer].occupation='小贩';assert.ok(!courtFacilities(engine,state,sid).officers.includes(officer));
 }
});
test('王国上诉到郡府再王都，非人终议在本政体，履行后与重复终审拒绝',()=>{
 const {engine,state}=setup(),sk=state.remote.county_hanlu_tongji.skeleton,local=sk.settlements[1],code=legalCodeAt(engine,local.id,state),hierarchy=courtHierarchy(engine,state,code);
 assert.equal(hierarchy[1].court,legalCodeAt(engine,sk.seat,state).court);assert.equal(hierarchy[2].court,legalCodeAt(engine,'loc_capital',state).court);
 state.player={coins:100};state.location=hierarchy[1].court;
 const row={id:'legal_case:l1',category:'legal_case',law:code.id,offender:'player',victim:null,status:'已裁定',evidence:[{kind:'confession',subject:'player'}],judgment:{judge:code.judges[0],fine:20}};state.records[row.id]=row;
 engine.advance=d=>{};
 let r=lawAction.call(engine,draft(state),{operation:'appeal',case:row.id,authority:hierarchy[1].judges[0]},'l1-appeal');assert.equal(r.upheld,true);assert.equal(r.final,false);
 state.location=hierarchy[2].court;r=lawAction.call(engine,draft(state),{operation:'appeal',case:row.id,authority:hierarchy[2].judges[0]},'l1-final');assert.equal(r.final,true);
 assert.throws(()=>lawAction.call(engine,draft(state),{operation:'appeal',case:row.id},'again'),/终审/);
 const n=setup(['county_hanlu_zheya']),nc=legalCodeAt(n.engine,n.state.remote.county_hanlu_zheya.skeleton.settlements[1].id,n.state);assert.ok(courtHierarchy(n.engine,n.state,nc).every(c=>c.name!=='王都终审'));
});
test('通缉与引渡按当前战争及双向立场派生，旧文书不能绕过外交中断',()=>{
 const {engine,state}=setup(['county_hanlu_zheya','county_feicui_lieer']),all=legalCodes(engine.world,state),a=all.find(c=>c.polity==='赭牙部盟'),b=all.find(c=>c.polity==='砾耳兽裔');
 state.records[`diplomacy:${[a.faction,b.faction].sort().join(':')}`]={category:'diplomacy',status:'结盟'};
 assert.equal(legalCooperation(engine,state,a,b).extradition,true);assert.ok(wantedScope(engine,a.id,state).includes(b.id));
 const w={law:a.id,scope:[a.id,b.id],reach:{[b.id]:0}};assert.equal(wantedReachedAt(engine,w,b.court,600,state),true);
 state.records.war={category:'war',aggressor:a.faction,defender:b.faction,status:'交战'};
 assert.equal(legalCooperation(engine,state,a,b).notices,false);assert.equal(wantedReachedAt(engine,w,b.court,600,state),false);
});
test('五村旧案保留原法典，可携卷到已展开的上级治所复审，再到王都终审',()=>{
 const {engine,state}=setup(['county_xichui_huancheng','county_zhonglu_wangji']),code=world.rules.law.codes.find(c=>c.id==='law_hw_property'),hierarchy=courtHierarchy(engine,state,code);
 assert.equal(hierarchy[1].court,legalCodeAt(engine,'loc_far_huancheng',state).court);assert.equal(hierarchy[2].court,legalCodeAt(engine,'loc_capital',state).court);
 const id='legal_case:home-appeal';state.player={coins:100};state.records[id]={id,category:'legal_case',law:code.id,offender:'player',status:'已裁定',evidence:[{kind:'confession',subject:'player'}],judgment:{judge:'npc_hw_chenbai',fine:20}};
 state.location=hierarchy[1].court;engine.advance=()=>{};
 const r=lawAction.call(engine,draft(state),{operation:'appeal',case:id,authority:hierarchy[1].judges[0]},'home-review');assert.equal(r.upheld,true);
 state.location=hierarchy[2].court;assert.equal(lawAction.call(engine,draft(state),{operation:'appeal',case:id,authority:hierarchy[2].judges[0]},'home-final').final,true);
});


test('分级复审撤销裁判时释放实际被告，私密案件不公开通知',()=>{
 const {engine,state}=setup(),local=state.remote.county_hanlu_tongji.skeleton.settlements[1],code=legalCodeAt(engine,local.id,state),hierarchy=courtHierarchy(engine,state,code),subject='player';
 const id='legal_case:merged-appeal',key=`legal_custody:${id}`;
 state.player={name:'测试玩家',coins:100};state.location=hierarchy[1].court;
 state.records[id]={id,category:'legal_case',law:code.id,offender:subject,status:'已裁定',private:true,evidence:[],judgment:{judge:code.judges[0],fine:20}};
 state.records[key]={category:'legal_custody',case:id,subject,reason:'待审',status:'生效',location:code.court};engine.advance=()=>{};
 const r=lawAction.call(engine,draft(state),{operation:'appeal',case:id,authority:hierarchy[1].judges[0]},'merged-appeal');assert.equal(r.upheld,false);
 assert.equal(state.records[key].status,'已结束');const event=state.records[`world_event:${key}:release`];assert.equal(event.target,subject);assert.equal(event.visibility,'private');assert.equal(event.location,code.court);
 assert.throws(()=>lawAction.call(engine,draft(state),{operation:'appeal',case:id,authority:hierarchy[1].judges[0]},'again'),/终审/);
});
