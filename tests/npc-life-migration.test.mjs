import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {validateNpcLifeRules,npcHousehold,householdMembers,npcMigration} from '../server-plugin/npc-life.mjs';
import {npcAvailability} from '../server-plugin/npc-schedule.mjs';
import {npcSchedule} from '../server-plugin/npc-state.mjs';
import {npcContext} from '../server-plugin/npc-memory.mjs';
import {sceneCard} from '../server-plugin/scene-card.mjs';
import {obligationView} from '../server-plugin/obligation-state.mjs';

const source=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const DAY=1440,start=10*DAY+600,firstNight=11*DAY;
// 许苓 lives alone by the river and helps at the herb shop; 冯雅 keeps a home in 榆坡.
const mover='npc_hw_xuling',host='npc_yp_fengya',friend='npc_hw_taozhi',elder='npc_hw_fanrong',suitor='npc_hw_wushuo';
const fromHome='bld_hw_riverhome',toHome='bld_yp_home_21',shop='bld_hw_herbs',away='bld_yp_kitchen';
const tie=(a,b,type='旧友')=>({with:b,type,trust:60,affection:50});

function fixture({migration={},prep=()=>{},hostTie=true}={}){
 const world=structuredClone(source),find=id=>world.npcs.find(n=>n.id===id),life=world.rules.npcLife;
 // These migration fixtures hold possessions and the authored workday fixed.
 // Daily fetching/foraging is exercised with migration inputs in the K16 law tests.
 delete world.rules.householdSubsistence;
 life.health={...life.health,bands:[{fromAge:0,illnessPerYear:0,graveShare:0,suddenDeathPerYear:0}]};
 const m=life.migration;
 // Strangers taking people in is covered in npc-life-t164; these cases keep to kin and friends.
 life.migration={...m,stranger:undefined,...migration,livelihood:{...m.livelihood,chancePerDay:1,...migration.livelihood},refuge:{...m.refuge,chancePerDay:1,...migration.refuge}};
 find(mover).schedule={default:[{start:0,end:480,location:fromHome,activity:'睡眠',services:[]},{start:480,end:1080,location:shop,activity:'在药铺帮手、教人认药',services:['teach']},{start:1080,end:1440,location:fromHome,activity:'歇息',services:[]}]};
 if(hostTie){find(mover).relationships.push(tie(mover,host));find(host).relationships.push(tie(host,mover));}
 prep(world,find);
 const engine=new WorldEngine(world),doc=engine.createCharacter(seed,{name:'试'},'npc-migration-test');
 doc.state.minute=start;doc.state.location='loc_bs_liquan';
 for(const row of Object.values(doc.state.records))if(Number.isSafeInteger(row.lastDay))row.lastDay=Math.floor(start/DAY)-1;
 for(const row of Object.values(doc.state.settlements))row.starvation=-100;
 Object.assign(doc.state.npcs[mover],{location:shop,activity:'在药铺帮手、教人认药'});
 Object.assign(doc.state.npcs[friend],{location:shop});
 Object.assign(doc.state.npcs[host],{location:away});
 return {world,engine,doc};
}
async function wait(s,minutes,tag='w'){const out=await s.engine.reduce(s.doc,{tool:'world_time',args:{minutes},eventId:`${tag}-${s.doc.state.minute}-${minutes}`});s.doc=applyPatches(s.doc,out.patches);return out;}
const until=(s,minute,tag)=>wait(s,minute-s.doc.state.minute,tag);
const npc=(s,id)=>s.doc.state.npcs[id];
const moves=s=>Object.values(s.doc.state.family?.migrations??{});
const knows=(s,id,root)=>(npc(s,id).memoryStream??[]).find(m=>(m.rootMemoryId??m.id)===root);
const meeting=(s,id,{with:other=friend,location=shop,at})=>{s.doc.state.obligations[id]={id,reservationVersion:1,type:'会面',promisor:mover,promisee:other,content:'一起理一遍药柜',location,start:at,deadline:at+60,
 departures:{[mover]:at,[other]:at},createdAt:start,status:'待履行',attendance:{[mover]:0,[other]:0},togetherMinutes:0};};
// Since T164 family life may bring a roster spouse or housemate into campaign
// state, and births add children; nothing else may appear, and nobody vanishes.
function onlyLifeAdditions(s,ids,people={},created={}){
 const st=s.doc.state,born=id=>Boolean(st.family?.births?.[st.npcs[id]?.life?.source]);
 assert.ok(ids.every(id=>st.npcs[id]),'原有人物都还在');
 for(const id of Object.keys(st.npcs).filter(x=>!ids.includes(x)))
  assert.ok(st.npcs[id].life?.kind==='roster'&&s.engine.world.residents.some(r=>r.id===id)||st.npcs[id].life?.kind==='born'&&born(id),id);
 for(const [id,row] of Object.entries(st.family?.people??{}))if(!people[id])assert.ok(st.family.births[row.sourceEvent],id);
 for(const [id,row] of Object.entries(st.created??{}))if(!created[id])assert.ok(row.generated==='birth'&&st.family.births[row.sourceEvent],id);
}
const hungry=s=>{s.doc.state.settlements.loc_hw.starvation=5;return s;};

test('托养允许受托人正常作息离场，真实迁居才中断，动物留在原处且不消失',async()=>{
 const s=hungry(fixture()),id='s3_migration_pet';
 s.engine.byId.set(id,{id,name:'托养岸犬',intelligence:1,tamingRule:{category:'support',food:[{item:'item_ration',hungerRelief:50}],skills:[]}});
 s.doc.state.creatures??={};s.doc.state.pets??={};
 s.doc.state.creatures[id]={name:'托养岸犬',hp:100,maxHp:100,level:1,status:'正常',owner:'player',location:shop};
 s.doc.state.pets[id]={petFormat:1,creature:id,category:'support',status:'活跃',following:true};
 npc(s,mover).inventory.item_ration={quantity:1000};npc(s,mover).coins=100;s.doc.state.location=shop;
 const signed=await s.engine.reduce(s.doc,{tool:'world_pet',args:{operation:'custody',target:id,keeper:mover,days:360,consent:true},eventId:'migration-custody-sign'});
 s.doc=applyPatches(s.doc,signed.patches);const claim=s.doc.state.pets[id].custody.obligation;
 await until(s,firstNight+1,'custody-night');
 assert.notEqual(npc(s,mover).location,shop);assert.equal(s.doc.state.pets[id].custody.status,'active','睡觉或下班回家不取消托养');
 const move=moves(s).find(m=>m.person===mover);assert.ok(move);
 await until(s,move.departAt+61,'custody-move');
 assert.equal(s.doc.state.pets[id].custody.status,'interrupted');assert.equal(obligationView(s.doc.state,claim).closed,true);
 assert.equal(s.doc.state.creatures[id].location,shop);assert.equal(s.doc.state.creatures[id].owner,'player');assert.ok(s.doc.state.creatures[id].hp>0);
});

test('迁居参数有效；没有原因或没有愿意接纳的人家时谁也不搬',async()=>{
 assert.deepEqual(validateNpcLifeRules(source),[]);
 const bad=structuredClone(source);bad.rules.npcLife.migration={...bad.rules.npcLife.migration,departMinute:0,livelihood:{starvationDays:0,chancePerDay:2}};
 assert.ok(validateNpcLifeRules(bad).length>=2);
 const calm=fixture();await wait(calm,20*DAY,'calm');
 assert.deepEqual(moves(calm),[],'有愿意接纳的朋友但本地不缺粮、无祸事，不搬');
 const lonely=hungry(fixture({hostTie:false}));await wait(lonely,5*DAY,'lonely');
 assert.deepEqual(moves(lonely),[],'缺粮但外乡没有愿意接纳的亲友，不搬');
 assert.equal(npcHousehold(lonely.engine,lonely.doc.state,mover).id,'house_hw_03');
});

test('缺粮谋生：预告、沿实际路线走完全程，抵达后住户、作息工作、人口与未了约定更新；财产随身，不新增人物',async()=>{
 const s=hungry(fixture());
 const ids=Object.keys(s.doc.state.npcs).sort(),people=JSON.stringify(s.doc.state.family?.people??{}),created=JSON.stringify(s.doc.state.created??{});
 Object.assign(npc(s,mover),{coins:57,inventory:{[source.items[0].id]:2}});
 const hostCoins=npc(s,host).coins,hostGoods=structuredClone(npc(s,host).inventory);
 // 条件(a)：出发前的日常购粮要在账本上记成一笔钱换货的成交。账本调试钩子只在这一段开启，用规则定位交易：
 // 买方是迁居者、发生在出发之前（本段止于预告日夜里，早于 departAt）、物品属于食物类；不写死成交 id 或时间点。
 const coins0=npc(s,mover).coins;
 globalThis.__LEDGER_TRACE__=[];
 await until(s,firstNight+1,'a');
 const trace=globalThis.__LEDGER_TRACE__;delete globalThis.__LEDGER_TRACE__;
 const foodIds=new Set(source.items.filter(i=>i.tags?.includes('food')).map(i=>i.id));
 const buys=trace.filter(t=>t.writer==='shop'&&t.from.startsWith(`${mover}|coin_river|`)&&t.amount>0&&foodIds.has(String(t.eventId).split(':').at(-1))&&String(t.eventId).endsWith(`:${mover}:${String(t.eventId).split(':').at(-1)}`));
 assert.ok(buys.length>0,'出发前迁居者的日常购粮在账本上有成交记录');
 let paid=0;
 for(const b of buys){
  const item=String(b.eventId).split(':').at(-1),seller=b.to.split('|')[0];
  assert.ok(npc(s,seller),'钱付给了卖家（一个真实人物）');
  const got=trace.filter(t=>t.writer==='items'&&t.from===`${seller}|${item}|inventory`&&t.to===`${mover}|${item}|inventory`).reduce((n,t)=>n+t.amount,0);
  assert.ok(got>0,`${item}：货从卖家库存转到了迁居者手里，数量${got}`);
  paid+=b.amount;
 }
 // EC-1b 起迁居者清醒的空闲段也是居民卖方：手里的口粮会卖给同聚落的邻居（trader_<编号>，customer 事件）并交商税，所以他的钱袋净变动 = 流入 − 流出，不再只有购粮。
 // 核对按账本逐笔：流出只有两类（购粮货款；他自己卖货的商税，事件号 customer:trader_<他>:…），净变动恰等于账本里流入减流出（钱袋守恒）。
 const purse=`${mover}|coin_river|`,outs=trace.filter(t=>String(t.from).startsWith(purse)&&t.amount>0),ins=trace.filter(t=>String(t.to).startsWith(purse)&&t.amount>0);
 assert.ok(outs.filter(t=>!buys.includes(t)).every(t=>t.writer==='finance-tax'&&String(t.eventId).startsWith(`customer:trader_${mover}:`)),'除购粮货款外，迁居者的钱只用于交自己卖货的商税，没有别的去向');
 assert.equal(coins0-npc(s,mover).coins,outs.reduce((n,t)=>n+t.amount,0)-ins.reduce((n,t)=>n+t.amount,0),'迁居者出发前钱袋净变动恰为账本里的流出减流入');
 assert.ok(paid>0);
 // 探针（tools/probe-money-flow.mjs migration，本次）给出的这笔交易：t=15120，买方许苓，卖方林穗（悦灯客栈 shop_hw_qingdeng），
 // 1 铜买面包 item_bread ×1，7 铜买燕麦薄饼 item_oat_flatbread ×4，共 8 铜（57→49）；货转移 writer=items，货款 writer=shop；
 // 其中 4 张燕麦薄饼随后在 t=15840 被家里当晚饭吃掉（household-meal，早于出发），面包留在库存。
 const [m]=moves(s);
 assert.equal(moves(s).length,1);assert.equal(m.person,mover);assert.equal(m.reason,'谋生');assert.equal(m.host,host);assert.equal(m.status,'待出发');
 assert.deepEqual(m.to,{household:'house_yp_21',settlement:'loc_bs_yupo',home:toHome});
 assert.equal(m.departAt,firstNight+DAY+300);
 assert.equal(knows(s,mover,`${m.id}:plan`).sourceType,'亲历');
 meeting(s,'obl_road',{at:m.departAt+600});meeting(s,'obl_old',{at:m.departAt+6*DAY});meeting(s,'obl_new',{with:host,location:toHome,at:m.departAt+8*DAY});
 s.doc.state.obligations.migration_payment={id:'migration_payment',type:'付款',promisor:mover,promisee:friend,coins:5,start:m.departAt+600,deadline:m.departAt+30*DAY,status:'待履行',location:shop};
 const payment=structuredClone(s.doc.state.obligations.migration_payment);
 await until(s,firstNight+660,'b');
 const heard=knows(s,friend,`${m.id}:plan`);assert.equal(heard?.sourceType,'听说');assert.equal(heard.heardFrom,mover,'同在药铺的朋友白天从本人口中得知');
 const route=s.engine.route(npc(s,mover).location===shop?fromHome:npc(s,mover).location,toHome,'walk',m.departAt,s.doc.randomSeed);
 await until(s,m.departAt+1,'c');
 const go=s.doc.state.family.migrations[m.id];
 // 财产基准取在出发之后（在途、已离开作息与店铺），而不是开场：开场到出发之间的正午，许苓作为居民会照常到悦灯客栈买饭
 // （探针 tools/probe-money-flow.mjs migration：第 10 天正午 15120 付 1+7 铜，早于迁居预告 17580，且出发后到抵达没有任何钱流）。
 // 这笔日常购粮不是迁居造成的；事先多给口粮也固定不住（给 30 份口粮仍买 7 铜燕麦饼，余粮还会被店铺收购），
 // 所以“迁居本身不丢钱、不丢物”应比较出发后与抵达时的财产。
 // 出发前的日常购粮属于正常生活，不在“迁居不丢钱”的断言范围内；时间点依据探针复跑（本次）：购粮发生在 t=15120（开场后 2 小时，
 // 迁居预告 t=17580 之前 40 多小时），出发快照 t=17581 时 coins 49，抵达（t=19058，路费 0）时仍是 49、库存逐项相等，途中无任何钱流。
 const coins=npc(s,mover).coins,goods=structuredClone(npc(s,mover).inventory);
 assert.equal(go.status,'在途');assert.equal(go.origin,fromHome);assert.ok(go.routeMinutes>=600,`路程${go.routeMinutes}分钟`);
 assert.equal(go.routeMinutes,route.minutes);assert.equal(go.arriveAt,m.departAt+route.minutes);assert.deepEqual(go.routeEdges,route.edges);
 assert.equal(npc(s,mover).location,null);assert.equal(npc(s,mover).scheduleTravel.arrive,go.arriveAt);
 assert.deepEqual(npcAvailability(s.engine,s.doc.state,mover),{activity:'赶路',services:[]});
 assert.equal(s.doc.state.obligations.obl_road.status,'取消');assert.equal(s.doc.state.obligations.obl_road.endedByMigration,m.id);
 assert.equal(s.doc.state.obligations.obl_old.status,'待履行','途中赶不上的才先退掉');
 assert.deepEqual(s.doc.state.obligations.migration_payment,payment,'搬走不能取消已经承诺的付款');
 await until(s,go.arriveAt-1,'d');
 assert.equal(npc(s,mover).location,null);assert.equal(npcHousehold(s.engine,s.doc.state,mover).id,'house_hw_03','未抵达前户籍不变');
 const before={hw:s.doc.state.settlements.loc_hw.population,yp:s.doc.state.settlements.loc_bs_yupo.population};
 await until(s,go.arriveAt,'e');
 const done=s.doc.state.family.migrations[m.id];
 assert.equal(done.status,'已抵达');assert.equal(done.arrivedAt,go.arriveAt);
 assert.equal(npcHousehold(s.engine,s.doc.state,mover).id,'house_yp_21');
 assert.ok(householdMembers(s.engine,s.doc.state,'house_yp_21').includes(mover));assert.ok(!householdMembers(s.engine,s.doc.state,'house_hw_03').includes(mover));
 assert.deepEqual(done.population,{from:{before:before.hw,after:before.hw-1},to:{before:before.yp,after:before.yp+1}});
 assert.equal(s.doc.state.settlements.loc_hw.population,before.hw-1);assert.equal(s.doc.state.settlements.loc_bs_yupo.population,before.yp+1);
 assert.equal(s.doc.state.obligations.obl_old.status,'取消');assert.match(s.doc.state.obligations.obl_old.reason,/迁居/);
 assert.equal(s.doc.state.obligations.obl_new.status,'待履行','新住处的约定照旧');
 assert.deepEqual(done.obligations,['obl_road','obl_old']);
 assert.deepEqual(s.doc.state.obligations.migration_payment,payment,'抵达后原金额及到期仍保留，不因迁居免债');
 const day=npcSchedule(s.engine,s.doc.state,mover).default;
 assert.ok(!day.some(x=>[fromHome,shop].includes(x.location)),'旧家和旧工作地点不再出现在作息里');
 const work=day.find(x=>x.start===480);assert.equal(work.location,away);assert.deepEqual(work.services,[]);assert.match(work.activity,/帮冯雅/);
 assert.match(npc(s,mover).occupation,/迁居后帮衬冯雅家/);
 assert.equal(npc(s,mover).developments.at(-1).type,'迁居');
 // Property travels with the person; nobody is copied or newly created.
 // 这里逐项比较出发快照与抵达时的铜币和库存是否相等，比李白条件(b)“从出发到抵达现金加货物合计价值不减”更严，因此已覆盖(b)。
 // 途中经过一个午夜（出发到抵达之间）：不在灶边的人在所在之处自成一桌吃自己背包里的粮（EC-1 灶边判定，已批准），所以库存等于出发快照减去这一桌吃掉的量；
 // 吃掉的量读该桌的午夜用餐记录（family.meals 里 household 带 @所在聚落、成员含迁居者的记录，consumed 里持有人为他的各行）。其余物品与铜币仍逐项相等。
 const eaten=Object.values(s.doc.state.family.meals??{}).filter(r=>String(r.household).includes('@')&&r.members?.includes(mover)).flatMap(r=>r.consumed??[]).filter(c=>c.holder===mover);
 const expectedInventory=structuredClone(goods);
 for(const c of eaten){const v=expectedInventory[c.item],left=(typeof v==='number'?v:v?.quantity??0)-c.quantity;if(left>0)expectedInventory[c.item]=typeof v==='number'?left:{...v,quantity:left};else delete expectedInventory[c.item];}
 assert.equal(npc(s,mover).coins,coins-go.routeCost);assert.deepEqual(npc(s,mover).inventory,expectedInventory);
 assert.equal(npc(s,host).coins,hostCoins);assert.deepEqual(npc(s,host).inventory,hostGoods);
 onlyLifeAdditions(s,ids,JSON.parse(people),JSON.parse(created));
 assert.equal(Object.values(s.doc.state.npcs).filter(n=>n.name===npc(s,mover).name).length,1);
 const next=Math.floor(go.arriveAt/DAY+1)*DAY;
 await until(s,next+540,'f');
 assert.equal(npc(s,mover).location,away,'次日照新作息随房东去灶房帮工');
 assert.equal(npcAvailability(s.engine,s.doc.state,mover).services.length,0);
 assert.equal(npcMigration(s.doc.state,mover),null);assert.equal(moves(s).length,1,'抵达后不再重复迁出');
});

test('玩家离开期间的迁居，回来后经在场旧邻的日常交谈得知，不自动写进玩家记忆',async()=>{
 const s=hungry(fixture());
 await until(s,firstNight+1,'a');
 const [m]=moves(s);
 await until(s,m.departAt+3*DAY,'b');
 assert.equal(s.doc.state.family.migrations[m.id].status,'已抵达');
 assert.ok(!Object.values(s.doc.memories??{}).some(row=>String(row.sourceEvent??'').startsWith(m.id)),'玩家没有凭空得知');
 assert.equal(knows(s,'npc_yp_shiling',`${m.id}:plan`),undefined,'无关远方住户不知情');
 // The player walks back into the herb shop during the day.
 await until(s,Math.floor(s.doc.state.minute/DAY+1)*DAY+600,'c');
 s.doc.state.location=shop;
 assert.equal(npc(s,friend).location,shop);
 const news=npcContext(s.engine,s.doc,friend).lifeNews;
 assert.ok(news.some(n=>n.rootMemoryId===`${m.id}:plan`&&n.sourceType==='听说'&&n.heardFrom===mover),JSON.stringify(news));
 const card=sceneCard(s.engine,s.doc,'许苓去哪了');
 assert.match(card,/本人知道的乡里人事，玩家未必知情：[^\n]*许苓[^\n]*迁往榆坡/);
});

test('成婚、投亲、避祸各有其因：配偶搬去同住、独居长者投靠外乡亲属、受害者离开加害者所在聚落',async()=>{
 const wed=fixture({hostTie:false});
 wed.doc.state.family={...wed.doc.state.family,marriages:{marriage_t:{id:'marriage_t',partners:[suitor,mover].sort(),since:start-5*DAY,status:'在婚',settlement:'loc_hw',households:['house_hw_03','house_hw_05']}}};
 await until(wed,firstNight+DAY+600,'w');
 const w=moves(wed);assert.equal(w.length,1,'只一方搬');assert.equal(w[0].reason,'成婚');assert.equal(w[0].cause,'marriage_t');
 assert.equal(w[0].person,mover);assert.equal(w[0].to.household,'house_hw_05');assert.equal(w[0].status,'已抵达');
 assert.equal(w[0].population,null,'同聚落内搬家，人口账不变');
 assert.equal(npcHousehold(wed.engine,wed.doc.state,mover).id,npcHousehold(wed.engine,wed.doc.state,suitor).id);
 assert.equal(npcSchedule(wed.engine,wed.doc.state,mover).default.find(x=>x.start===480).location,shop,'同聚落的原工作照旧');

 const alone=fixture({hostTie:false,migration:{joinKin:{afterDeathDays:7,elderAge:55,minimumTrust:0}},prep:(world,find)=>{find(elder).relationships.push({with:host,type:'姐姐',trust:50});}});
 Object.assign(npc(alone,friend),{status:'死亡',activity:'已故'});
 alone.doc.state.family={...alone.doc.state.family,deaths:{death_t:{id:'death_t',person:friend,minute:start-3*DAY,cause:'寿终',household:'house_hw_06',settlement:'loc_hw'}}};
 await until(alone,firstNight+1,'j1');
 assert.deepEqual(moves(alone),[],'丧事未满七天不动身');
 await until(alone,firstNight+4*DAY+1,'j2');
 const j=moves(alone).find(x=>x.person===elder);assert.equal(j?.reason,'投亲');assert.equal(j.host,host);assert.equal(j.cause,'death_t');

 const fled=fixture();
 npc(fled,mover).memoryStream=[{id:'harm_t',rootMemoryId:'harm_t',sourceEvent:'ev_harm',kind:'crime',sourceType:'亲历',participants:[suitor,mover],minute:start-DAY,content:'吴朔夜里撬我家门锁',salience:3}];
 await until(fled,firstNight+1,'f');
 const f=moves(fled);assert.equal(f.length,1);assert.equal(f[0].reason,'避祸');assert.equal(f[0].fleeing,suitor);assert.equal(f[0].to.settlement,'loc_bs_yupo');
});

test('一次长等、分段短等与中途存档重载，迁居结果一致',async()=>{
 const pick=s=>JSON.stringify({minute:s.doc.state.minute,family:s.doc.state.family,population:Object.fromEntries(Object.entries(s.doc.state.settlements).map(([k,v])=>[k,v.population])),obligations:s.doc.state.obligations,
  npcs:[mover,host,friend].map(id=>({id,location:npc(s,id).location,coins:npc(s,id).coins,residence:npc(s,id).residence,occupation:npc(s,id).occupation,travel:npc(s,id).scheduleTravel,memories:npc(s,id).memoryStream??[]}))});
 const prep=s=>{hungry(s);meeting(s,'obl_x',{at:firstNight+2*DAY});return s;};
 const long=prep(fixture());await wait(long,4*DAY,'long');
 assert.equal(moves(long)[0]?.status,'已抵达');
 const short=prep(fixture());for(const minutes of [7*60,DAY-7*60,333,DAY-333,DAY+1,DAY-1])await wait(short,minutes,'short');
 assert.equal(pick(short),pick(long));
 const reload=prep(fixture());await wait(reload,DAY+DAY/2+600,'r1');
 assert.equal(moves(reload)[0]?.status,'在途','重载点处于途中');
 const restored={world:reload.world,engine:new WorldEngine(structuredClone(reload.world)),doc:JSON.parse(JSON.stringify(reload.doc))};
 await wait(restored,4*DAY-(DAY+DAY/2+600),'r2');
 assert.equal(pick(restored),pick(long));
});

test('正式参数下全世界离屏两个月：每次迁居都有登记的原因和接纳人，人物与名册不增不改',async()=>{
 const engine=new WorldEngine(source),doc=engine.createCharacter(seed,{name:'试'},'npc-migration-real');
 const ids=Object.keys(doc.state.npcs).sort(),catalog=JSON.stringify(source.npcs);let s={engine,doc};
 for(let i=0;i<2;i++)await wait(s,30*DAY,`q${i}`);
 for(const m of moves(s)){assert.ok(['成婚','投亲','谋生','避祸'].includes(m.reason));assert.ok(m.host&&m.cause);}
 onlyLifeAdditions(s,ids);
 assert.equal(JSON.stringify(source.npcs),catalog);
});
