import test from 'node:test';
import assert from 'node:assert/strict';
import {uiSession,qty} from './helpers/ui-script.mjs';
import {variant,scene,primed,conserved} from './helpers/daily-b2.mjs';
const NPC='npc_hw_linsui',INN='bld_hw_qingdeng';
async function setup(t,change=()=>{},patchWorld=()=>{}){
 const world=variant(w=>{w.npcs.find(n=>n.id===NPC).schedule={default:[{start:0,end:1440,location:INN,activity:'营业',services:['trade']}]};patchWorld(w);});
 return uiSession(t,{world,mutate:scene(INN,540,s=>{Object.assign(s.npcs[NPC],{goals:{},trust:20,activity:'营业',location:INN});s.player.coins=500;change(s);})});
}
const talk=(ui,id,slots={})=>ui.choose(`dialogue.${id}`,slots,{target:NPC});
test('对话入口、N2 完成后仍可聊天；N3 拒借公钥有理由；询问未知事实不编造',async t=>{
 const ui=await setup(t);await primed(ui);
 assert.ok((await ui.menu(NPC)).actions.some(a=>a.id==='core:dialogue.greet'));
 const hello=await talk(ui,'greet');assert.ok(hello.ok,hello.error);assert.match(hello.lines.join(''),/林穗/);
 const denied=await talk(ui,'public_key');assert.equal(denied.result.dialogue.decision.outcome,'refuse');assert.match(denied.lines.join(''),/公共仓库.*管事/);
 const ask=await talk(ui,'ask',{content:'不存在的秘密'});assert.ok(ask.ok,ask.error);assert.match(ask.lines.join(''),/不知道/);
 assert.ok((await talk(ui,'greet')).ok);
});
test('N4 请求带路经同一决策，按真实路线同行、到达完成；回执和导出可重放',async t=>{
 const ui=await setup(t);await primed(ui);const before=await ui.read();
 const request=await talk(ui,'guide',{destination:'loc_hw'});assert.ok(request.ok,request.error);
 assert.equal(request.result.dialogue.decision.outcome,'agree');assert.ok(request.result.obligation);
 const moved=await ui.choose('move',{destination:'loc_hw'});assert.ok(moved.ok,moved.error);
 const after=await ui.read(),o=after.state.obligations[`obl_${request.eventId}`];
 assert.equal(o.status,'已完成');assert.equal(after.state.npcs[NPC].location,after.state.location);assert.ok(after.state.minute>before.state.minute);
 const bundle=await ui.server.api('export',{campaignId:ui.campaignId});
 const imported=await ui.server.api('import',{bundle});assert.ok(imported.reference);
});
test('N5 托人送货按期到场真实交付，账本守恒，无模型',async t=>{
 const ui=await setup(t);await primed(ui);const before=await ui.read(),deadline=before.state.minute+30;
 const req=await talk(ui,'delivery',{item:'item_bread',quantity:1,location:'bld_hw_council',deadline});assert.ok(req.ok,req.error);
 assert.equal(req.result.dialogue.decision.outcome,'agree');
 const move=await ui.choose('move',{destination:'bld_hw_council'},{search:true});assert.ok(move.ok,move.error);
 const current=await ui.read(),wait=await ui.choose('time',{minutes:deadline-current.state.minute});assert.ok(wait.ok,wait.error);
 const after=await ui.read();assert.equal(after.state.obligations[`obl_${req.eventId}`].status,'已完成');
 assert.equal(qty(after.state.inventory.item_bread)-qty(before.state.inventory.item_bread),1);conserved(before,after,'送货');
});
test('N1 实际履约改变关系、三日后提及具体帮助；N11 实际违约后要求预付',async t=>{
 const ui=await setup(t);await primed(ui);let doc=await ui.read();const trust=doc.state.npcs[NPC].trust;
 const promise=await ui.choose('promise.create',{promisor:'player',promisee:NPC,type:'付款',content:'帮你修屋顶的材料款',coins:1,deadline:doc.state.minute+1},{search:true});assert.ok(promise.ok,promise.error);
 assert.ok((await ui.choose('time',{minutes:3*1440})).ok);doc=await ui.read();assert.ok(doc.state.npcs[NPC].trust>trust);
 const greet=await talk(ui,'greet');assert.ok(greet.ok,greet.error);assert.match(greet.lines.join(''),/修屋顶/);
 const broken=await ui.choose('promise.create',{promisor:'player',promisee:NPC,type:'付款',content:'答应的报酬',coins:99999,deadline:doc.state.minute+1},{search:true});assert.ok(broken.ok,broken.error);
 assert.ok((await ui.choose('time',{minutes:2})).ok);
 const req=await talk(ui,'guide',{destination:'loc_hw'});assert.ok(req.ok,req.error);assert.equal(req.result.dialogue.decision.outcome,'conditional');
 assert.match(req.lines.join(''),/先付/);
 const before=await ui.read(),accept=await talk(ui,'accept');assert.ok(accept.ok,accept.error);assert.ok(accept.result.obligation);
 const after=await ui.read();assert.ok(before.state.player.coins>after.state.player.coins);conserved(before,after,'预付');
});
test('N13 急事结束谈话并登记待办；未成年人和同意不能由玩家伪造',async t=>{
 const ui=await setup(t,s=>{s.npcs[NPC].goals={short:[{content:'去照看病中的家人',urgency:10,progress:0}]};});await primed(ui);
 const r=await talk(ui,'greet');assert.ok(r.ok,r.error);assert.equal(r.result.dialogue.decision.outcome,'defer');assert.match(r.lines.join(''),/家人/);
 const req=await talk(ui,'guide',{destination:'loc_hw'});assert.ok(req.ok,req.error);assert.equal(req.result.dialogue.decision.outcome,'defer');
 assert.ok(Object.values((await ui.read()).state.records).some(r=>r.category==='dialogue_pending'));
 const fake=await ui.choose('promise.create',{promisor:NPC,type:'带路',destination:'loc_hw',content:'fake',consent:true},{search:true});assert.equal(fake.ok,false);
});
test('还价按轮数与让步表，确认后实际成交；只改成交价格，钱物仍守恒',async t=>{
 const ui=await setup(t,s=>{s.player.coins=5000;},w=>{w.items.find(i=>i.id==='item_bread').basePrice=100;});await primed(ui);
 const first=await ui.choose('trade.buy',{seller:NPC,item:'item_bread',quantity:1},{target:NPC});assert.ok(first.ok,first.error);
 const start=await ui.read(),quote=Object.values(start.state.records).find(r=>r.category==='trade_quote'&&r.seller===NPC&&r.item==='item_bread'),offered=Math.ceil(quote.listPrice*.95);
 assert.ok((await talk(ui,'haggle',{content:String(quote.listPrice),source:'item_bread'})).ok);
 const bargain=await talk(ui,'haggle',{content:String(offered),source:'item_bread'});assert.ok(bargain.ok,bargain.error);assert.equal(bargain.result.dialogue.decision.outcome,'agree');
 const before=await ui.read(),accept=await talk(ui,'accept');assert.ok(accept.ok,accept.error);assert.equal(accept.result.cost,offered);
 const after=await ui.read(),later=Object.values(after.state.records).find(r=>r.category==='trade_quote'&&r.seller===NPC&&r.item==='item_bread');
 assert.equal(later.listPrice,quote.listPrice);assert.equal(later.deals.at(-1).unitPrice,offered);conserved(before,after,'还价成交');
});
test('告知引用已知来源；欺骗经对抗并写现有谎言账，不能把虚构说法冒充告知',async t=>{
 const ui=await setup(t,s=>{s.player.memoryStream=[{id:'bridge',sourceEvent:'bridge-built',kind:'help',content:'桥已经修好',sourceType:'亲历',minute:500,participants:['player']}];});await primed(ui);
 const tell=await talk(ui,'tell',{source:'bridge',content:'桥已经修好'});assert.ok(tell.ok,tell.error);
 const fake=await talk(ui,'tell',{source:'bridge',content:'桥塌了'});assert.equal(fake.ok,false);
 let lie=null;for(let i=0;i<30&&!lie;i++){const attempt=await talk(ui,'deceive',{source:'bridge',content:'桥塌了'});assert.ok(attempt.ok,attempt.error);lie=attempt.result.lie;}
 assert.ok(lie);const record=(await ui.read()).state.records[lie];assert.equal(record.truth,'桥已经修好');assert.equal(record.tellings.at(-1).claim,'桥塌了');
});
