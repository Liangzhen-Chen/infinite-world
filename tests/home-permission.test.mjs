import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {CampaignStorage,applyPatches} from '../server-plugin/storage.mjs';
const world=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const owner='npc_hw_miaozhen',house='bld_hw_home_15';
// K6 依据（审查 C-b location-access:23）：住户许可决定合法与否，不决定能否走进去；进入发生，命中擅入私宅，罪名挂本次事件
const trespassed=(out,eventId)=>{const o=out.result.offenses?.find(o=>o.offense==='trespass');assert.ok(o,`${eventId} 命中擅入私宅`);assert.equal(o.victim,owner);assert.equal(out.doc.state.records[o.record].sourceEvent,eventId);assert.equal(out.doc.state.location,house);return o;};
const grant={operation:'grant_access',promisor:owner,location:house,content:'进屋查看旧筛架，不取用家中物品',minutes:60};
async function setup(){
 const engine=new WorldEngine(world);let doc=engine.createCharacter(legacy,{},'permission');
 const run=async(document,tool,args,id)=>{const out=await engine.reduce(document,{tool,args,eventId:id});return{doc:applyPatches(document,out.patches),result:out.result};};
 doc=(await run(doc,'world_move',{destination:'loc_hw_fields'},'fields')).doc;
 doc=(await run(doc,'world_time',{minutes:30},'wait-owner')).doc;
 assert.equal(doc.state.npcs[owner].location,doc.state.location);
 return{engine,doc,run};
}
test('真实行走后在场住户签发许可，入宅不转移家产，到期提示一次且仍可离开，过期再进命中擅入',async()=>{
 const{engine,doc,run}=await setup(),issued=await run(doc,'world_promise',grant,'grant');
 const permission=issued.result.authorization;assert.equal(permission,'permission_grant');
 assert.deepEqual(issued.doc.state.player,doc.state.player);assert.deepEqual(issued.doc.state.inventory,doc.state.inventory);
 assert.equal(issued.doc.state.minute,doc.state.minute);assert.equal(issued.result.notices.filter(n=>n.type==='permission').length,1);
 assert.ok(issued.doc.state.npcs[owner].memoryStream.some(m=>m.kind==='permission'&&m.private===true));
 for(const [id,npc]of Object.entries(issued.doc.state.npcs))if(id!==owner)assert.ok(!(npc.memoryStream??[]).some(m=>m.sourceEvent==='grant'));
 const entered=await run(issued.doc,'world_move',{destination:house,authorization:permission},'visit');assert.equal(entered.doc.state.location,house);
 assert.deepEqual(entered.doc.state.inventory,doc.state.inventory);
 const expired=await run(entered.doc,'world_time',{minutes:60},'expire');assert.match(expired.result.notices.find(n=>n.type==='permission').text,/到期/);
 const later=await run(expired.doc,'world_time',{minutes:1},'later');assert.ok(!later.result.notices.some(n=>n.type==='permission'));
 const exited=await run(later.doc,'world_move',{destination:'loc_hw'},'exit');assert.equal(exited.doc.state.location,'loc_hw');
 /* 许可已过期再进：照样进门，记擅入 */trespassed(await run(exited.doc,'world_move',{destination:house,authorization:permission},'reenter'),'reenter');
});
test('旁人、未成年、未实例化名册与不清醒者不能签发；同行者须逐名许可、撤销生效，缺许可进门命中擅入',async()=>{
 const{doc,run}=await setup();
 for(const edit of [d=>d.state.npcs[owner].location='loc_hw',d=>d.state.npcs[owner].status='昏迷',d=>d.state.npcs[owner].activity='睡眠']){
  const changed=structuredClone(doc);edit(changed);const before=structuredClone(changed);
  await assert.rejects(run(changed,'world_promise',grant,'bad'),/实际在场且清醒/);assert.deepEqual(changed,before);
 }
 for(const args of [{...grant,promisor:'npc_hw_duanhe'},{...grant,promisor:world.residents[0].id},{...grant,location:'bld_hw_home_16'},
  {...grant,minutes:1441},{...grant,guests:['npc_hw_wushuo']}]){
  const before=structuredClone(doc);await assert.rejects(run(doc,'world_promise',args,'invalid'));assert.deepEqual(doc,before);
 }
 // Isolated companion fixture verifies that being present does not grant entry.
 const together=structuredClone(doc);together.state.player.companions=['npc_hw_wushuo'];together.state.npcs.npc_hw_wushuo.location=together.state.location;
 const alone=await run(together,'world_promise',grant,'alone');/* 许可未覆盖同行者：一同进门，记擅入 */trespassed(await run(alone.doc,'world_move',{destination:house,authorization:alone.result.authorization},'bring-guest'),'bring-guest');
 const group=await run(together,'world_promise',{...grant,guests:['npc_hw_wushuo']},'group');
 assert.deepEqual(group.result.permission.guests,['npc_hw_wushuo']);
 const revoked=await run(group.doc,'world_promise',{operation:'revoke_access',promisor:owner,authorization:group.result.authorization},'revoke');
 assert.ok(revoked.result.permission.revoked);assert.match(revoked.result.notices.find(n=>n.type==='permission').text,/收回/);
 /* 许可已收回再进：照样进门，记擅入 */trespassed(await run(revoked.doc,'world_move',{destination:house,authorization:group.result.authorization},'revoked-entry'),'revoked-entry');
 const again=await run(revoked.doc,'world_promise',{operation:'revoke_access',promisor:owner,authorization:group.result.authorization},'repeat-revoke');
 assert.deepEqual(again.doc,revoked.doc);assert.equal(again.result.notices.length,0);
 const entered=await run(group.doc,'world_move',{destination:house,authorization:group.result.authorization},'approved-group');
 assert.equal(entered.doc.state.npcs.npc_hw_wushuo.location,house);
});
test('许可随同一事件去重、重启和导出保存，删回合同时撤销许可与可见反馈',async t=>{
 const{engine,doc}=await setup(),directory=await fs.mkdtemp(path.join(tmpRoot(),'fields-home-permit-'));
 t.after(async()=>{const target=path.resolve(directory);assert.ok(target.startsWith(path.resolve(tmpRoot())+path.sep+'fields-home-permit-'));await fs.rm(target,{recursive:true,force:true});});
 const reducer=(document,input,options)=>engine.reduce(document,input,options),store=new CampaignStorage(directory,{reducer});
 await store.create({id:'home',worldVersion:doc.worldVersion,document:doc});
 const event={id:'permission',anchor:'visit',input:{tool:'world_promise',args:grant,eventId:'permission'}};
 await store.transact('home',event,reducer);await store.transact('home',event,reducer);
 const granted=(await store.read('home')).document,feedback=await store.feedback('home');
 assert.equal(feedback.events.flatMap(e=>e.notices).filter(n=>n.type==='permission').length,1);
 const reopened=new CampaignStorage(directory,{reducer});assert.deepEqual((await reopened.read('home')).document,granted);
 assert.deepEqual((await reopened.import(await reopened.export('home'),'copy')).document,granted);
 await reopened.reconcile('home',[],null);assert.deepEqual((await reopened.read('home')).document,doc);assert.deepEqual((await reopened.feedback('home')).events,[]);
});
