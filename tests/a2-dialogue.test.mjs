import {relationView} from '../server-plugin/npc-state.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {facilityRuntime} from '../server-plugin/facility-state.mjs';
import bargainingTable from '../world/rules/tables/bargaining.json' with {type:'json'};
// A3 causal2: compare the same trust changes through the single read model.
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
test('N2 脚本：询问 NPC 未知的具体消息，明确答不知情且不生成传闻或承诺',async t=>{
 const ui=await setup(t);await primed(ui);
 const before=await ui.read(),beforeRumors=Object.values(before.state.records).filter(r=>r.category==='rumor').length;
 const result=await talk(ui,'ask',{content:'秘密会籍的成员名单'});
 assert.ok(result.ok,result.error);assert.match(result.lines.join(''),/不知/);
 assert.equal(result.result.dialogue.decision.outcome,'agree');
 const after=await ui.read();
 assert.equal(Object.values(after.state.records).filter(r=>r.category==='rumor').length,beforeRumors);
 assert.equal(Object.values(after.state.obligations??{}).length,Object.values(before.state.obligations??{}).length);
 assert.ok(!JSON.stringify(after.state.npcs[NPC].memoryStream??[]).includes('成员名单'));
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
 const ui=await setup(t);await primed(ui);let doc=await ui.read();const trust=relationView(null,doc.state,NPC,'player').trust;
 const promise=await ui.choose('promise.create',{promisor:'player',promisee:NPC,type:'付款',content:'帮你修屋顶的材料款',coins:1,deadline:doc.state.minute+1},{search:true});assert.ok(promise.ok,promise.error);
 assert.ok((await ui.choose('time',{minutes:3*1440})).ok);doc=await ui.read();assert.ok(relationView(null,doc.state,NPC,'player').trust>trust);
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
 let patched;
 const ui=await setup(t,s=>{s.player.coins=5000;},w=>{w.items.find(i=>i.id==='item_bread').basePrice=100;patched=w;});await primed(ui);
 const first=await ui.choose('trade.buy',{seller:NPC,item:'item_bread',quantity:1},{target:NPC});assert.ok(first.ok,first.error);
 // Setup trust 20 gives relation 1-.15*.7*.2=.979. 稀缺度 = 需求/供给（market.mjs stockSupply:219、marketQuote:303），
 // 不再被夹在 0.5 地板：探针 tools/probe-rules-a.mjs a2（uiSession 同一入口）读到同类食物供给 47、需求 28，28/47=0.5957 > 0.5。
 // Baseline 100 × 0.5957 × .979 × depth/grade/spread/corrections 1 = 58.32 → 58 copper。
 // 旧期望 48（需求 14/供给 133 或 16/43，夹到 .5，100×.5×.979=48.95）的变化链，对 git 历史逐段二分（同一探针）：
 //  · t-alloc f8e4a13b（R5：同一卖家可售存量按需求在买方间分摊，口粮替代 shop.mjs foodSources）：需求 14→24、供给 46，稀缺度 .522，价 51；
 //  · st-5（105d2730，同属 R5 及 t-foodsrc/t-staple 单餐额度）：供给 44、需求 24，.545，价 53；
 //  · 现状（R1 t-sat 饱腹改由推导 + t-avail 买得起的来源）：供给 47、需求 28，.596，价 58（同类食物各户 retained 之和 36→40）。
 // EC-1a 之后（采购口径扣聚落公粮，household-budget.mjs:378-379）：登记户口粮由公粮覆盖，各户 retained 归 0，需求/供给 ≤ 0.5，稀缺度回到 0.5 地板：
 // 100 × 0.5 × 0.979 × 1 = 48.95，截断一次 = 48（即上面“旧期望 48”的同一算式）。
 assert.equal(first.result.cost,48);
 // S5-02 / 15 §15.2: a real purchase receipt is the observed price; the
 // conversation recomputes its own current projection instead of reading cache.
 const quote=first.result.pricing;
 // 出价取当前报价（原为首笔成交单价×.95=56）。原假设“买一件后价格不变”只在供需比被钳在下限 .5 时成立；现在供需比 29/47→买一件后 29/46，
 // 在曲线上（离开下限），再叠加深度与关系变化，成交后的现价 61.916 比首笔 58.323 高约 6%，56 低于第 2 轮让步线 ceil(61.916×(1−.05))=59，被拒（dialogue.mjs:154-155 的既有判定，未改）。
 // 本测试要检验的意图不变：还价按轮数与让步表（bargaining.json concession 第 2 轮 5%）判定，出价在让步线上则成交；这里让步线由引擎当前报价与让步表算出，不写死 56 或 59。
 // 对应设计变化：面包饱腹改推导 + 卖家份额分摊使供需比离开下限（PLAN.md:584、591③、316③、563②）；李白 11-11 (a)（PLAN.md:540）。证据：F:/dnd/docs/审查记录/市场价格-探针输出-mkt-5.txt，复算 市场价格-独立复算-A.md、-B.md（a2-dialogue-7）。
 const engine=new WorldEngine(patched),bargaining=engine.rules.bargaining??bargainingTable,rule=Array.isArray(bargaining)?bargaining.find(r=>!r.selector.culture)??bargaining[0]:bargaining;
 const current=facilityRuntime().currentTradeQuote(engine,await ui.read(),{seller:NPC,item:'item_bread'});
 const offered=Math.ceil(current.listPrice*(1-rule.concession[1]));
 const opening=await talk(ui,'haggle',{content:String(Math.ceil(quote.unitPrice)),source:'item_bread'});assert.ok(opening.ok,opening.error);
 const bargain=await talk(ui,'haggle',{content:String(offered),source:'item_bread'});assert.ok(bargain.ok,bargain.error);assert.equal(bargain.result.dialogue.decision.outcome,'agree');
 const before=await ui.read(),accept=await talk(ui,'accept');assert.ok(accept.ok,accept.error);assert.equal(accept.result.cost,offered);
 const after=await ui.read(),later=Object.values(after.state.records).filter(r=>r.category==='market_trade'&&r.seller===NPC&&r.item==='item_bread').at(-1);
 assert.equal(accept.result.pricing.baseline,100);assert.equal(later.totalCoins,offered);assert.equal(later.quantity,1);conserved(before,after,'还价成交');
});
test('告知引用已知来源；欺骗经对抗并写现有谎言账，不能把虚构说法冒充告知',async t=>{
 const ui=await setup(t,s=>{s.player.memoryStream=[{id:'bridge',sourceEvent:'bridge-built',kind:'help',content:'桥已经修好',sourceType:'亲历',minute:500,participants:['player']}];});await primed(ui);
 const tell=await talk(ui,'tell',{source:'bridge',content:'桥已经修好'});assert.ok(tell.ok,tell.error);
 const fake=await talk(ui,'tell',{source:'bridge',content:'桥塌了'});assert.equal(fake.ok,false);
 let lie=null;for(let i=0;i<30&&!lie;i++){const attempt=await talk(ui,'deceive',{source:'bridge',content:'桥塌了'});assert.ok(attempt.ok,attempt.error);lie=attempt.result.lie;}
 assert.ok(lie);const record=(await ui.read()).state.records[lie];assert.equal(record.truth,'桥已经修好');assert.equal(record.tellings.at(-1).claim,'桥塌了');
});
