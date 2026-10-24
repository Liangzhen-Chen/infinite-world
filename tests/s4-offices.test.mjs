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

test('名册会长实例化后可经真实动作办理任命，行动与提示解析只保留同一人物',async()=>{
 const leader='npc_w5_lampbridge_leader',name='office_exam_life_6';
 const before=initial(),authored=structuredClone(engine.byId.get(leader));
 assert.equal(before.state.npcs[leader],undefined);
 let document=officeScene(engine,before,{location:'bld_bs_guild',present:[leader],abilities:{skills:{skill_life_6_core:100}}});
 for(const scoped of [engine.scoped(document),engine.promptScoped(document)]){
  assert.equal(scoped.entities.filter(p=>p.id===leader).length,1);
  assert.equal(scoped.byId.get(leader).location,'bld_bs_guild');
  assert.equal(scoped.resolve(authored.name,'npc'),leader);
 }
 let out=await officeCall(engine,document,'apply',{name},'roster-apply');document=out.document;
 const request=out.result.application;
 out=await engine.reduce(document,{tool:'world_time',args:{minutes:60},eventId:'roster-wait'});document=applyPatches(document,out.patches);
 out=await officeCall(engine,document,'decide',{name,request,authority:leader},'roster-decide');document=out.document;
 assert.equal(out.result.decision.status,'已批准');
 out=await officeCall(engine,document,'appoint',{name,request,authority:leader},'roster-appoint');document=out.document;
 assert.equal(institutionOffices(engine,document.state).find(o=>o.id===name).holder,'player');
 assert.deepEqual(engine.byId.get(leader),authored);assert.equal(before.state.created?.[leader],undefined);
 const forged=structuredClone(document);forged.state.created[leader].name='伪造会长';
 assert.throws(()=>engine.scoped(forged),/重复实体编号/);
 assert.throws(()=>engine.promptScoped(forged),/重复实体编号/);
 const collision=structuredClone(document);collision.state.created.loc_bs=structuredClone(engine.byId.get('loc_bs'));
 assert.throws(()=>engine.scoped(collision),/重复实体编号/);
 const duplicate=structuredClone(document);duplicate.state.created.duplicate=structuredClone(duplicate.state.created[leader]);
 assert.throws(()=>engine.scoped(duplicate),/重复实体编号/);
});

test('原生报案收件读取正式在岗席位，伪造 onDuty 不能补足在场或任职',async()=>{
 const clerk='npc_bs_031_2',office='office_bs_report_desk';
 const document=officeScene(engine,initial(),{location:'bld_bs_watch',minute:600,present:[clerk]});
 const call=eventId=>({tool:'world_act',eventId,args:{action:'core:law.report',slots:{authority:clerk,request:{kind:'theft'}}}});
 // No personally known theft is fabricated: passing the recipient lookup
 // must reach the independent incident precondition, with no applied effects.
 const current=await engine.reduce(document,call('recipient-current'));
 assert.equal(current.result.receipt.status,'rejected');assert.match(current.result.receipt.reason,/本人确实知晓的事由/);
 assert.deepEqual(current.patches,[]);
 const asleep=structuredClone(document);asleep.state.npcs[clerk].activity='熟睡';asleep.holdings.entities[office].facts.onDuty=true;
 const rejected=await engine.reduce(asleep,call('recipient-asleep'));
 assert.equal(rejected.result.receipt.status,'rejected');assert.match(rejected.result.receipt.reason,/当值.*职权/);
 assert.deepEqual(rejected.patches,[]);
 const priorClerk=officeScene(engine,initial(),{location:'bld_bs_watch',minute:540,present:[clerk]});
 let changed=(await appointedClaimClerk(engine,priorClerk,{name:office})).document;
 for(const destination of ['loc_bs_guanqian','bld_bs_watch']){
  const moved=await engine.reduce(changed,{tool:'world_act',eventId:`recipient-walk:${destination}`,args:{action:'core:move',slots:{destination,mode:'walk'}}});
  assert.equal(moved.result.receipt.status,'committed');changed=applyPatches(changed,moved.patches);
 }
 assert.equal(changed.state.npcs[clerk].location,changed.state.location);
 changed.holdings.entities[office].facts.onDuty=true;
 const former=await engine.reduce(changed,call('recipient-former'));
 assert.equal(former.result.receipt.status,'rejected');assert.match(former.result.receipt.reason,/当值.*职权/);
 assert.deepEqual(former.patches,[]);
});
