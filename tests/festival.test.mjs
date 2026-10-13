import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {localFestivalCalendar,festivalScene} from '../server-plugin/festival.mjs';
import {sceneCard} from '../server-plugin/scene-card.mjs';
import {toolDefinitions} from '../extension/tools.mjs';

const world=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),DAY=1440;
function setup({full=false,day=1,month=1}={}){
 const w=structuredClone(world);for(const n of w.npcs){delete n.schedule;delete n.tier;}
 const profile=w.settlementProfiles.find(p=>p.id==='loc_bs_yupo'),f=profile.details.calendar.festivals[0];f.day=day;f.month=month;
 const supplier='npc_yp_zhaofeng';
 // Find an actual second Yupo full instead of assuming a roster name exists.
 const person=w.npcs.find(n=>n.id!==supplier&&n.id!==f.host&&n.id.startsWith('npc_yp_')).id;
 if(full)for(const n of w.npcs.filter(n=>[person,f.host].includes(n.id)))n.tier='full';
 const engine=new WorldEngine(w),doc=engine.createCharacter(legacy,{},'festival-test');doc.state.location=f.location;
 for(const id of [f.host,supplier,person])Object.assign(doc.state.npcs[id],{location:f.location,status:'正常',activity:'歇工',coins:50});
 const run=async(c,args,id,tool='world_settlement')=>{const out=await engine.reduce(c,{tool,args,eventId:id});return {doc:applyPatches(c,out.patches),out};};
 const wait=(c,minutes,id='time')=>run(c,{minutes},id,'world_time');
 return {engine,w,doc,run,wait,f,host:f.host,supplier,person,custom:localFestivalCalendar(engine)[0].id};
}
async function plan(s,{cost=7,join=true,authorize=true}={}){
 let {doc,out}=await s.run(s.doc,{operation:'festival_plan',festival:s.custom,cost,supplier:s.supplier},'plan');const id=out.result.festival;
 if(authorize)for(const who of [s.host,...(cost?[s.supplier]:[])])doc=(await s.run(doc,{operation:'festival_authorize',festival:id,speaker:who,consent:true},`authorize-${who}`)).doc;
 if(join)doc=(await s.run(doc,{operation:'festival_join',festival:id,speaker:s.person,consent:true},'join')).doc;
 return {doc,id};
}
const cash=doc=>doc.state.player.coins+Object.values(doc.state.npcs).reduce((n,p)=>n+p.coins,0)+Object.values(doc.state.settlements).reduce((n,p)=>n+p.treasury,0)+Object.values(doc.state.records).filter(r=>r.category==='settlement_trade').reduce((n,r)=>n+r.escrowCopper,0);
test('四村只适配已发布节俗，24候选没有进入正式节日库；正常工具可检查预约',async()=>{
 const s=setup();assert.equal(localFestivalCalendar(s.engine).length,4);assert.ok(localFestivalCalendar(s.engine).every(f=>f.kind==='local-custom'&&f.status==='custom-only'));
 const inspect=await s.run(s.doc,{operation:'festival_inspect'},'inspect');assert.equal(inspect.out.result.calendar.length,1);
 const tool=toolDefinitions().find(t=>t.function.name==='world_settlement');assert.ok(tool.function.parameters.properties.operation.enum.includes('festival_authorize'));
 await assert.rejects(s.run(s.doc,{operation:'festival_plan',festival:'festival_rainmark'},'candidate'),/候选/);
 await assert.rejects(s.run(s.doc,{operation:'festival_plan',festival:s.custom,cost:7,supplier:s.supplier,authorization:'governance_permission:x'},'public'),/公款/);
});
test('有私人费用授权及实际参与才举办，组织费守恒且重放不重复收费',async()=>{
 const s=setup({full:true}),p=await plan(s),opening=cash(p.doc),stock=structuredClone(p.doc.state.inventory);
 const out=await s.wait(p.doc,720-p.doc.state.minute),event=out.doc.state.records[p.id];
 assert.equal(event.status,'held');assert.equal(event.paidCopper,7);assert.equal(cash(out.doc),opening);
 assert.equal(out.doc.state.npcs[s.host].coins,43);assert.equal(out.doc.state.npcs[s.supplier].coins,57);assert.deepEqual(out.doc.state.inventory,stock);
 assert.deepEqual(event.participants,[s.host,s.person]);assert.equal(out.doc.state.npcs[s.person].relationships[s.host].trust,1);
 assert.ok(out.doc.state.npcs[s.person].memoryStream.some(m=>m.sourceEvent===event.resultEvent));
 assert.equal(out.doc.state.npcs[s.supplier].relationships?.[s.person],undefined);
 assert.deepEqual(await s.wait(p.doc,720-p.doc.state.minute),out);
 const later=(await s.wait(out.doc,1,'after')).doc;assert.equal(later.state.npcs[s.host].coins,43);
});
test('取消、无人到场、资金不足和缺授权各保留原因，不扣费',async()=>{
 for(const mode of ['cancelled','no-attendance','insufficient-funds','unauthorized','unavailable']){
  const s=setup(),p=await plan(s,{join:mode!=='no-attendance',authorize:mode!=='unauthorized'});let doc=p.doc;
  if(mode==='cancelled')doc=(await s.run(doc,{operation:'festival_cancel',festival:p.id,speaker:s.host,consent:true,content:'组织者临时无法办理'},'cancel')).doc;
  if(mode==='insufficient-funds')doc.state.npcs[s.host].coins=0;
  if(mode==='unavailable')doc.state.npcs[s.person].location='loc_hw';
  const before=cash(doc),out=await s.wait(doc,720-doc.state.minute),event=out.doc.state.records[p.id];
  assert.equal(event.status,mode==='unavailable'?'no-attendance':mode);assert.ok(event.reason);assert.equal(event.paidCopper,0);assert.equal(cash(out.doc),before);
 }
});
test('实际作息、睡眠和已占用义务不会被节俗瞬移或代参与',async()=>{
 const s=setup(),p=await plan(s);p.doc.state.npcs[s.person].status='睡眠';
 const c=(await s.wait(p.doc,180)).doc;assert.equal(c.state.records[p.id].status,'no-attendance');assert.equal(c.state.npcs[s.person].status,'睡眠');
 const t=setup({full:true}),q=await plan(t);q.doc=(await t.run(q.doc,{type:'会面',promisor:t.person,promisee:'player',deadline:1000,content:'核对另一个约定',location:t.f.location},'busy','world_promise')).doc;
 // The obligation remains active through the event and cannot count as consent.
 const busy=(await t.wait(q.doc,180)).doc;assert.equal(busy.state.records[q.id].status,'no-attendance');
});
test('月份与年界一次发生，30日离开分步一致且只有本地场景显示结果',async()=>{
 const s=setup({day:30,month:12});
 while(s.doc.state.minute<359*DAY+540)s.doc=(await s.wait(s.doc,Math.min(30*DAY,359*DAY+540-s.doc.state.minute),'prepare-year')).doc;
 const p=await plan(s);p.doc.state.location='loc_hw';
 const large=await s.wait(p.doc,30*DAY,'large');let split=p.doc;
 for(let i=0;i<30;i++)split=(await s.wait(split,DAY,`small-${i}`)).doc;
 const selected=doc=>Object.values(doc.state.records).filter(r=>r.category==='festival');
 assert.deepEqual(selected(split),selected(large.doc));assert.equal(large.doc.state.records[p.id].status,'held');
 assert.equal(cash(large.doc),cash(p.doc));assert.equal(festivalScene(s.engine,large.doc),'');
 assert.ok(!large.out.result.messages.some(m=>m.includes(s.f.name)));
 const remote=sceneCard(s.engine,large.doc,'节日');assert.ok(!remote.includes('已举行当地节俗活动'));
 const local=structuredClone(large.doc);local.state.location=s.f.location;
 assert.match(festivalScene(s.engine,local),/已举行当地节俗活动/);
 assert.equal(Object.values(large.doc.state.records).filter(r=>r.category==='festival'&&r.custom===s.custom&&r.year===1).length,1);
});
test('没有计划的实际日期有未举办结果，晚到旧档不补造过去',async()=>{
 const s=setup();const c=(await s.wait(s.doc,180)).doc;assert.equal(c.state.records[`festival:${s.custom}:1`].status,'not-scheduled');
 const t=setup();t.doc.state.minute=800;const after=(await t.wait(t.doc,DAY)).doc;assert.equal(after.state.records[`festival:${t.custom}:1`],undefined);
});
test('真实作息离场后不代替参加，未报名者不凭在场加关系',async()=>{
 const s=setup({full:true}),p=await plan(s);
 s.w.npcs.find(n=>n.id===s.person).schedule=structuredClone(world.npcs.find(n=>n.id===s.person).schedule);
 const out=await s.wait(p.doc,180),person=out.doc.state.npcs[s.person];
 assert.ok(person.location!==s.f.location||person.scheduleTravel);
 assert.equal(out.doc.state.records[p.id].status,'no-attendance');
 assert.equal(out.doc.state.records[p.id].participants.includes(s.supplier),false);
 assert.equal(out.doc.state.npcs[s.supplier].relationships?.[s.person],undefined);
});
test('授权来源篡改、远方同意和未成年恋爱均不会通过参与获得权力',async()=>{
 const s=setup(),p=await plan(s);p.doc.state.records[p.id].agreements[0].budget=999;
 const c=(await s.wait(p.doc,180)).doc;assert.equal(c.state.records[p.id].status,'unauthorized');
 const t=setup(),q=await plan(t);q.doc.state.npcs[t.person].location='loc_hw';
 await assert.rejects(t.run(q.doc,{operation:'festival_join',festival:q.id,speaker:t.person,consent:true},'remote'),/在场/);
 assert.ok(Object.values(c.state.npcs).every(n=>!n.relationships||Object.values(n.relationships).every(r=>(r.romance??0)===0)));
});
