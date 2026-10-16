import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {advanceRegistry} from '../server-plugin/advance-registry.mjs';
import {npcSchedule} from '../server-plugin/npc-state.mjs';
import {standing} from '../server-plugin/standing.mjs';
import {organization} from '../server-plugin/organizations.mjs';
import {toolDefinitions} from '../extension/tools.mjs';
import {validateMilitary,ensureArmies,raiseLevy,armyWeek,armyPayday,advanceMilitary,armyKey,armyStrength,leviedWorkers,partyCoins} from '../server-plugin/military.mjs';

const source=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),DAY=1440;
function setup(seed='military-test'){
 const world=structuredClone(source);for(const n of world.npcs){delete n.tier;delete n.schedule;}
 const engine=new WorldEngine(world),doc=engine.createCharacter(legacy,{},seed);
 return{world,engine,doc};
}
function draft(doc){
 return{document:doc,patches:[],messages:[],get(...p){return p.reduce((v,k)=>v?.[k],this.document);},
  set(path,value){this.document=applyPatches(this.document,[{op:'set',path,value}]);this.patches.push(path);},
  remove(path){this.document=applyPatches(this.document,[{op:'delete',path}]);},say(m){this.messages.push(m);}};
}
const army=(d,id)=>structuredClone(d.get('state','records',armyKey(id)));
const save=(d,a)=>d.set(['state','records',armyKey(a.id)],a);
async function reduce(engine,doc,args,eventId,tool='world_settlement'){const r=await engine.reduce(doc,{tool,args,eventId});return{doc:applyPatches(doc,r.patches),result:r.result};}

test('正式军务数据通过校验，坏数据被拒；推进与五个操作已接上且不加工具',()=>{
 assert.deepEqual(validateMilitary(source),[]);
 for(const change of [w=>w.rules.military.armies[0].party='faction_missing',w=>w.rules.military.armies[3].supply='granary'&&(w.rules.military.armies[3].base='loc_bs'),
  w=>w.rules.military.levy.maxShareBps=0,w=>w.rules.military.morale.unpaid=5,w=>w.rules.military.armies.push(w.rules.military.armies[0])]){
  const bad=structuredClone(source);change(bad);assert.ok(validateMilitary(bad).length);
 }
 assert.ok(advanceRegistry.some(s=>s.id==='military'));
 const tools=toolDefinitions();assert.equal(tools.length,27);
 const ops=tools.find(t=>t.function.name==='world_settlement').function.parameters.properties.operation.enum;
 for(const op of ['army_inspect','army_enlist','army_duty','army_recruit','army_dismiss'])assert.ok(ops.includes(op),op);
});

test('征召从各户抽丁：人物按服役作息去营地，家人对征召方不满，村里可用劳力与农事人手同步减少',()=>{
 const {engine,doc}=setup(),d=draft(doc),at=7*DAY,scheduled=new WorldEngine(structuredClone(source));
 ensureArmies(d,engine,at);
 const a=army(d,'army_liquan_militia');assert.equal(a.status,'驻守');assert.equal(armyStrength(a),0);
 const n=raiseLevy(d,engine,a,at,'levy-test');save(d,a);
 const s=d.get('state','settlements','loc_bs_liquan'),houses=source.households.filter(h=>h.settlement==='loc_bs_liquan');
 assert.ok(n>0&&n<=houses.length&&n<=Math.floor(s.population*0.2),`征${n}人`);
 assert.equal(leviedWorkers(d.get('state'),'loc_bs_liquan'),n);assert.equal(a.levy.count,n);
 const named=a.levy.people.map(p=>p.id);assert.ok(named.length>0,'有登记人物被征');
 const levy=d.get('state','records','levy:loc_bs_liquan');
 for(const id of named){
  const npc=d.get('state','npcs',id);assert.equal(npc.levy.army,'army_liquan_militia');
  const plan=npcSchedule(scheduled,d.get('state'),id);
  assert.equal(plan.default[0].activity,'服役');assert.equal(plan.default[0].location,a.location);
  const house=Object.entries(levy.households).find(([,v])=>v===id)[0],kin=source.households.find(h=>h.id===house).members.find(x=>x!==id&&d.get('state','npcs',x));
  if(kin)assert.ok(standing(engine,d.get('state'),kin,'loc_bs_liquan')<standing(engine,doc.state,kin,'loc_bs_liquan'),'家人对征召方的看法变差');
 }
 assert.ok(organization(engine,d.get('state'),'army_liquan_militia').members[named[0]],'被征者在军团名册上');
 // 同一天农事：被征走的人不在田里。
 const before=draft(doc),after=draft(d.document);
 for(const x of [before,after])advanceRegistry.find(r=>r.id==='daily').advance(engine,x,{before:doc.state.minute,after:DAY});
 const report=x=>x.get('state','records','agriculture:loc_bs_liquan').lastReport.workers.available;
 assert.equal(report(before)-report(after),n);
 assert.equal(named.length,n,'每个征丁都来自真实户籍');
 assert.ok(after.get('state','records','agriculture:loc_bs_liquan').lastReport.fresh<before.get('state','records','agriculture:loc_bs_liquan').lastReport.fresh,'征召实际减少产量');
 // 再征一次不会重复抽同一户。
 const again=army(d,'army_liquan_militia');assert.equal(raiseLevy(d,engine,again,at+DAY,'levy-again'),0);
});

test('军饷付不出：记欠饷、士气逐周下滑、有人逃散，被征的人物先回家',()=>{
 const {engine,doc}=setup(),d=draft(doc),at=7*DAY;
 ensureArmies(d,engine,at);
 const a=army(d,'army_liquan_militia');raiseLevy(d,engine,a,at,'levy-pay');
 d.set(['state','settlements','loc_bs_liquan','treasury'],0);// 村公账见底
 const pay=armyPayday(d,engine,a,30*DAY,'pay-1');
 assert.equal(pay.paid,0);assert.equal(a.arrears,a.levy.count*a.payCopperMonth);
 const start=a.levy.count,people=a.levy.people.map(p=>p.id);let deserted=0;
 for(let w=1;w<=8&&a.levy.count;w++){const row=armyWeek(d,engine,a,at+w*7*DAY,`week-${w}`);deserted+=row?.deserted??0;}
 assert.ok(a.morale<55,'欠饷让士气下滑');assert.ok(deserted>0&&a.levy.count<start,'有人逃散');
 const home=people.filter(id=>!d.get('state','npcs',id).levy);assert.ok(home.length>0,'被征的人物回了家');
 assert.equal(leviedWorkers(d.get('state'),'loc_bs_liquan'),a.levy.count);
 assert.ok(Object.values(d.get('state','records')).some(r=>r.category==='world_event'&&r.tags?.includes('desertion')));
 // 付得出时按人头发到被征人物手里，士气回升。
 const {engine:e2,doc:doc2}=setup(),d2=draft(doc2);ensureArmies(d2,e2,at);
 const b=army(d2,'army_liquan_militia');raiseLevy(d2,e2,b,at,'levy-paid');const one=b.levy.people[0].id,coins=d2.get('state','npcs',one,'coins');
 const ok=armyPayday(d2,e2,b,30*DAY,'pay-ok');assert.equal(ok.arrears,0);assert.equal(d2.get('state','npcs',one,'coins'),coins+b.payCopperMonth);
});

test('补给走粮仓余粮；冬荒时粮仓不出粮，队伍挨饿；冬季觅食减半；买口粮从公库出',()=>{
 const {engine,doc}=setup(),d=draft(doc),at=7*DAY;
 ensureArmies(d,engine,at);
 // 让砾泉民兵有常备兵，从村粮仓提粮；提走的粮按出仓记账，仓与账一致。
 const a=army(d,'army_liquan_militia');a.regular=10;
 const food=d.get('state','settlements','loc_bs_liquan','food'),sold=d.get('state','records','agriculture:loc_bs_liquan').ledger.sold;
 const row=armyWeek(d,engine,a,at,'supply-1');
 assert.ok(row.got>0&&!row.hungry);assert.equal(d.get('state','settlements','loc_bs_liquan','food'),food-row.got);
 const ag=d.get('state','records','agriculture:loc_bs_liquan');assert.equal(ag.ledger.sold,sold+row.got);assert.equal(ag.ledger.armyDrawn,row.got);
 assert.equal(ag.batches.reduce((n,b)=>n+b.amount,0),d.get('state','settlements','loc_bs_liquan','food'));
 // 冬荒：宣告的饥荒期间粮仓不出粮；吃完存粮就挨饿、掉士气。
 d.set(['state','records','hazard-famine:loc_bs_liquan'],{category:'hazard_famine',settlement:'loc_bs_liquan',since:at,until:at+120*DAY,clock:'test',sourceEvent:'test'});
 const b=army(d,'army_liquan_militia');b.regular=10;b.food=0;const m0=b.morale;
 const famine=armyWeek(d,engine,b,at+7*DAY,'supply-famine');
 assert.equal(famine.got,0);assert.ok(famine.famine&&famine.hungry);assert.ok(b.morale<m0);
 // 觅食的队伍冬季只找到一半。
 const c=army(d,'army_heilu_band'),summer=armyWeek(d,engine,structuredClone(c),100*DAY,'forage-summer'),winter=armyWeek(d,engine,structuredClone(c),280*DAY,'forage-winter');
 assert.equal(engine.calendar(280*DAY).season,3);assert.equal(winter.got,Math.floor(summer.got/2));
 // 买口粮的戍营从郡府公库付钱，冬季更贵。
 const g=army(d,'army_longqu_garrison'),coins=partyCoins(engine,d.get('state'),'county_xichui_longqu'),bought=armyWeek(d,engine,g,at,'buy-1');
 assert.ok(bought.paid>0);assert.equal(partyCoins(engine,d.get('state'),'county_xichui_longqu'),coins-bought.paid);
 const g2=army(d,'army_longqu_garrison');g2.food=0;const w2=armyWeek(d,engine,g2,280*DAY,'buy-winter');assert.ok(w2.paid/w2.got>bought.paid/bought.got);
 d.set(['state','records',`hazard-famine:${g2.base}`],{category:'hazard_famine',since:at,until:400*DAY});g2.food=0;
 const shortage=armyWeek(d,engine,g2,280*DAY,'buy-famine');assert.equal(shortage.got,0);assert.ok(shortage.hungry,'有钱也买不到冬荒中的口粮');
 d.remove(['state','records',`hazard-famine:${g2.base}`]);engine.airDraft=d;
 d.set(['state','records','war-disruption:test'],{category:'war_disruption',since:0,until:400*DAY,routes:['route_bs_yp'],locations:[],factor:1});
 const cut=army(d,'army_longqu_garrison');cut.location='loc_bs_yupo';cut.food=0;
 const closed=armyWeek(d,engine,cut,at,'supply-closed');assert.equal(closed.got,0);assert.ok(closed.hungry,'封路阻断补给而不使整个推进失败');
});

test('玩家服役：到营报到、执勤抵爵位兵役并领执勤饷；离屏按周推进',async()=>{
 const {engine,doc:start}=setup();let doc=structuredClone(start);
 doc.state.location='loc_bs';
 doc.state.records['title:player']={category:'title',id:'title:player',holder:'player',title:'男爵',rank:'一等',fief:null,status:'受封',levy:{men:1,days:10,personal:true,due:400*DAY,served:0,attended:false},breaches:0,nextIncome:400*DAY,incomeMark:0,history:[]};
 await assert.rejects(reduce(engine,doc,{operation:'army_duty',days:2},'duty-0'),/先 army_enlist/);
 let r=await reduce(engine,doc,{operation:'army_enlist',org:'army_longqu_garrison'},'enlist');doc=r.doc;
 assert.equal(r.result.enlisted,true);assert.equal(doc.state.records['military_service:player'].army,'army_longqu_garrison');
 assert.equal(organization(engine,doc.state,'army_longqu_garrison').members.player.position,'兵');
 const coins=doc.state.player.coins;
 r=await reduce(engine,doc,{operation:'army_duty',days:5},'duty-1');doc=r.doc;
 assert.equal(r.result.days,5);assert.equal(doc.state.records['title:player'].levy.served,5);assert.equal(doc.state.records['title:player'].levy.attended,true);
 assert.equal(doc.state.player.coins,coins+60);assert.equal(doc.state.records['military_service:player'].days,5);
 const inspect=await reduce(engine,doc,{operation:'army_inspect'},'look');assert.equal(inspect.result.titleLevy.served,5);
 assert.ok(inspect.result.armies.some(a=>a.army==='army_longqu_garrison'));
 // 离屏：一个月里周补给与月饷照常结算。
 const d=draft(doc);advanceMilitary(d,engine,{before:doc.state.minute,after:doc.state.minute+31*DAY});
 assert.ok(army(d,'army_longqu_garrison').history.length>army(draft(doc),'army_longqu_garrison').history.length);
});

test('自募私兵：挂在玩家组织名下，从组织公库付安家钱与月饷；佣兵按合同，欠付即散伙；钱庄存款代付本人私兵',async()=>{
 const {engine,doc:start}=setup();let doc=structuredClone(start);
 doc.state.location='loc_bs';
 let r=await reduce(engine,doc,{type:'org',name:'白石护村队',data:{occupation:'会社',notes:'护村'}},'found','world_create');doc=r.doc;
 const org=r.result.organization;
 await assert.rejects(reduce(engine,doc,{operation:'army_recruit',org,quantity:5},'recruit-0'),/安家钱/);
 doc.state.player.coins+=2000;
 r=await reduce(engine,doc,{operation:'org_deposit',org,coins:1000},'dep');doc=r.doc;
 r=await reduce(engine,doc,{operation:'army_recruit',org,quantity:5},'recruit-1');doc=r.doc;
 assert.equal(r.result.strength,5);assert.equal(organization(engine,doc.state,org).treasury,1000-5*40);
 const id=r.result.army,d=draft(doc);
 const a=army(d,id),pay=armyPayday(d,engine,a,doc.state.minute+30*DAY,'private-pay');assert.equal(pay.paid,5*60);
 assert.equal(organization(engine,d.get('state'),org).treasury,1000-200-300);
 // 佣兵：在王都雇背灯佣队，首月佣金付给佣兵团；公库付不出下月佣金即散伙。
 doc=d.document;doc.state.location='loc_capital';
 const merc=doc.state.records['faction-assets:faction_lanternmerc']?.coins??58400;
 r=await reduce(engine,doc,{operation:'army_recruit',org,quantity:4,choice:'mercenary'},'merc');doc=r.doc;
 assert.equal(r.result.mercenary.count,4);assert.equal(doc.state.records['faction-assets:faction_lanternmerc'].coins,merc+4*90);
 const d2=draft(doc),b=army(d2,id);
 const treasury=organization(engine,d2.get('state'),org).treasury;d2.set(['state','records',`organization:${org}`,'treasury'],d2.get('state','records',`organization:${org}`,'treasury')-treasury);
 armyPayday(d2,engine,b,doc.state.minute+30*DAY,'merc-pay');assert.equal(b.mercenary,null);
 assert.ok(standing(engine,d2.get('state'),'faction_lanternmerc',org)<0);
 // 本人名义的私兵：现钱不够时由钱庄存款代付。
 const {engine:e3,doc:s3}=setup();let d3doc=structuredClone(s3);d3doc.state.location='loc_bs';d3doc.state.player.coins=400;
 r=await reduce(e3,d3doc,{operation:'army_recruit',quantity:5},'self');d3doc=r.doc;assert.equal(d3doc.state.player.coins,200);
 const bank=e3.rules.economy.credit.banks[0];d3doc.state.records[bank.id]={category:'bank',id:bank.id,name:bank.name,location:bank.location,coins:5000,goods:{},accounts:{player:1000}};
 const d3=draft(d3doc),c=army(d3,r.result.army),paid=armyPayday(d3,e3,c,d3doc.state.minute+30*DAY,'self-pay');
 assert.equal(paid.paid,300);assert.equal(d3.get('state','player','coins'),0);assert.equal(d3.get('state','records',bank.id).accounts.player,900);
 r=await reduce(e3,d3.document,{operation:'army_dismiss',org:c.id,quantity:5},'dismiss');assert.equal(r.result.strength,0);
});
