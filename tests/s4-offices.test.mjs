import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {institutionOffices,officeOnDuty} from '../server-plugin/entity-view.mjs';
import {authority} from '../server-plugin/action-authority.mjs';
import {primitiveContext} from '../server-plugin/primitives-runtime.mjs';
import {aliveHoldings} from '../server-plugin/holdings.mjs';
import {affairs} from '../server-plugin/ui-affairs.mjs';
import {officeCall,officeScene,appointedClaimClerk} from './helpers/office-actions.mjs';

const world=await loadWorld(),engine=new WorldEngine(world),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
// Age is an existing character fact in the legacy input, not an office premise.
const initial=()=>engine.initialFromLegacy({...seed,state:{...seed.state,player:{...seed.state.player,age:25}}},'s4-offices');
test('申请、审定、任命独立；任职权限来自正式席位，免职立即撤回并保留历史',async()=>{
 const name='office_bs_claim_desk',authorityId='npc_bs_townhead';
 let document=officeScene(engine,initial());
 let out=await officeCall(engine,document,'apply',{name,authority:authorityId},'apply');document=out.document;
 const request=out.result.application;
 assert.equal(institutionOffices(engine,document.state).find(o=>o.id===name).holder,'npc_bs_033_2');
 await assert.rejects(officeCall(engine,document,'decide',{name,request,authority:authorityId},'early'),/尚未到|rejected/);
 let wait=await engine.reduce(document,{tool:'world_time',args:{minutes:60},eventId:'wait-decision'});document=applyPatches(document,wait.patches);
 out=await officeCall(engine,document,'decide',{name,request,authority:authorityId},'decide');document=out.document;
 assert.equal(out.result.decision.status,'已批准',JSON.stringify(out.result));
 assert.equal(aliveHoldings(engine.primitiveDraft(document),{kind:'holds_office',holder:'player',subject:name}).length,0);
 out=await officeCall(engine,document,'appoint',{name,request,authority:authorityId},'appoint');document=out.document;
 assert.equal(authority(primitiveContext(engine,document),'player','receive_claim',name).allowed,true,JSON.stringify({office:institutionOffices(engine,document.state).find(o=>o.id===name),holding:aliveHoldings(engine.primitiveDraft(document),{kind:'holds_office',subject:name}),player:document.state.player,location:document.state.location}));
 assert.equal(authority(primitiveContext(engine,document),'player','review_building_application',name).allowed,false);
 assert.equal(authority(primitiveContext(engine,document),'player','transfer','loc_bs|coin_river|treasury').allowed,false);
 wait=await engine.reduce(document,{tool:'world_time',args:{minutes:10},eventId:'wait-removal'});document=applyPatches(document,wait.patches);
 await assert.rejects(officeCall(engine,document,'remove',{name,authority:'npc_hw_yanzhe'},'forged'),/任免机关|rejected/);
 out=await officeCall(engine,document,'remove',{name,authority:authorityId},'remove');document=out.document;
 const changed=document.state.records['organization:faction_bs_government'].offices[name];
 assert.equal(changed.previous.since,600);assert.equal(changed.removedAt,610);assert.equal(changed.previous.sourceEvent,'appoint');
 assert.equal(authority(primitiveContext(engine,JSON.parse(JSON.stringify(document))),'player','receive_claim',name).allowed,false);
 assert.equal(aliveHoldings(engine.primitiveDraft(document),{kind:'holds_office',subject:name}).length,0);
 const view=affairs(engine,document);assert.equal(view.offices.find(o=>o.id===name).holder,null);
 assert.equal(view.officeApplications.find(a=>a.id===request).status,'已免职');
});
test('在岗读取实际任职、地点、接待时段和身体状态，不信任 onDuty 参数',async()=>{
 const {document,name}=await appointedClaimClerk(engine,initial()),office=institutionOffices(engine,document.state).find(o=>o.id===name);
 assert.equal(officeOnDuty(engine,document.state,office),true);
 for(const patch of [{minute:730},{location:'loc_bs'},{player:{...document.state.player,status:'昏迷'}}]){
  const state={...document.state,...patch};assert.equal(officeOnDuty(engine,state,office),false);
  assert.equal(authority(primitiveContext(engine,{...document,state}),'player','receive_claim',name).allowed,false);
 }
 const unappointed=officeScene(engine,initial());unappointed.state.player.onDuty=true;
 assert.equal(officeOnDuty(engine,unappointed.state,office),false);
});
test('未登记任免链的首领席位不可自任，收件员没有裁判权限',async()=>{
 const document=officeScene(engine,initial(),{location:'bld_bs_office',present:['npc_bs_townhead','npc_bs_034_1']});
 await assert.rejects(officeCall(engine,document,'apply',{name:'office_bs_town_head'},'self-head'),/任免链|rejected/);
 assert.equal(authority(primitiveContext(engine,document),'npc_bs_034_1','judge','office_bs_appeal_desk').allowed,false);
});
