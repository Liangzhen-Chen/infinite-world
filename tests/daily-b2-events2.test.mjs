// todo 的阶段与真实前提逐条登记：docs/A3-后续阶段登记.md S5CT CT04（保留原阶段边界）。
// 日常题集第二批（DAILY 卡）：普通打斗、求医、入会、过关卡、离开几天再回来。
// 夹具与口径同 daily-b2-trade.test.mjs；求医经 world_act（A1b：本人同意由动作派生）。
import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {standing} from '../server-plugin/standing.mjs';
import {monsterStats} from '../server-plugin/combat.mjs';
import {MEDICAL_SKILL} from '../server-plugin/medicine-state.mjs';
import {openLedger} from '../server-plugin/ledger.mjs';
import {uiSession} from './helpers/ui-script.mjs';
import {variant,item,setPrice,scene,stack,monthDayMinute,conserved,primed,held,baseEngine,baseWorld,replayed} from './helpers/daily-b2.mjs';

const ZHENG='npc_hw_zhengshuisheng',LINSUI='npc_hw_linsui';

// ---- D31 普通打斗 ----
async function fightD31(t){
 // 铁剑→直刃单手剑（铁档，item_steel_arming_sword）；野狼→灰脊林狼 7 级；玩家 1 级入门，生命 80/80；秋季九月十八申时，北林边。
 const WOOD='loc_hw_northwood',HABITAT='habitat_hw_wood',WOLF='monster_instance_d31',SPECIES='monster_grey_ridge_wolf',SWORD='item_steel_arming_sword';
 const stats=monsterStats({level:7,template:1},baseWorld.rules);
 const ui=await uiSession(t,{mutate:scene(WOOD,monthDayMinute(9,18,16,0),s=>{
  Object.assign(s.player,{level:1,hp:80,maxHp:80});s.inventory[SWORD]={quantity:1,quality:'铁',durability:100,weight:1.5};
  const p=s.records[`ecology:${HABITAT}`].populations[SPECIES];p.count--;p.withdrawn++;
  s.created={...s.created,[WOLF]:{id:WOLF,name:'灰脊林狼·d31',aliases:[],monster:SPECIES,template:1,scope:WOOD}};
  s.creatures={...s.creatures,[WOLF]:{name:'灰脊林狼·d31',species:SPECIES,location:WOOD,hp:stats.maxHp,maxHp:stats.maxHp,level:7,status:'正常',ecology:HABITAT,owner:null}};
 })});
 const before=await primed(ui),count=s=>s.state.records[`ecology:${HABITAT}`].populations[SPECIES].count,rounds=[];
 for(let i=0;i<300;i++){const roundStart=(await ui.read()).state.minute;const r=await ui.choose('combat',{target:WOLF,weapon:SWORD},{search:true});assert.ok(r.ok,r.error);assert.equal((await ui.read()).state.minute-roundStart,1,'D31.4 per round');rounds.push(r.result);if(r.result.targetHp===0)break;}
 const after=await ui.read(),wolf=after.state.creatures[WOLF];assert.equal(after.state.minute-before.state.minute,rounds.length);
 assert.equal(rounds.at(-1).targetHp,0,'打到野狼毙命');assert.equal(wolf.status,'死亡');
 assert.ok(wolf.corpse&&wolf.corpse.items.length>0,'②留下可剥取的尸体');assert.deepEqual(wolf.corpse.items.map(i=>i.item),['item_rawhide'],'普通野狼不掉钱财宝物');
 assert.equal(after.state.player.coins,before.state.player.coins);
 assert.equal(before.state.inventory[SWORD].durability-after.state.inventory[SWORD].durability,rounds.length,'③铁剑耐久每回合小幅下降');
 const received=rounds.reduce((n,r)=>n+r.received,0);assert.ok(received>0,'玩家确实受了伤');assert.equal(before.state.player.hp-after.state.player.hp,received,'①生命损失 = 各回合结算的受伤之和');
 assert.equal(count(after),count(before),'⑤战斗不改变地域种群账（个体化时已 −1，死亡不回流）');assert.equal(count(before),3);
 await replayed(ui,after);
 const wait=await ui.choose('time',{until:{dayOffset:1,hour:16}});assert.ok(wait.ok,wait.error);
 const next=await ui.read();assert.equal(next.state.creatures[WOLF].status,'死亡','次日不复活');assert.equal(Object.values(next.state.creatures).filter(c=>c.species===SPECIES&&c.status!=='死亡').length,0,'原地没有新狼');
}
// fightD31 asserts D31.4 (one minute per round) together with ②③⑤ in a single run; one registration only.
test('D31 普通打斗 ②③⑤ 与 D31.4：落单野狼被打死，留下可剥取的尸体（只有兽皮、没有钱财），铁剑耐久每回合 −1，每回合 1 分钟，地域野狼数不因死亡回流、次日不复活；玩家生命差 = 各回合受伤之和',fightD31);

// ---- D32 受伤求医 ----
async function treatmentD32(t){
 // 医师林大夫→陶芝（药草院）；诊金加药 30 文=半个日薪 24 + 药价 6（世界副本：初级日工钱 48，药 6）；秋季九月十九辰时；玩家 70 文，生命 60/80，咬伤。
 const CLINIC='bld_hw_herbs',DOCTOR='npc_hw_taozhi';
 const world=variant(w=>{
  // 15 §15.2：医师耗材与普通人行囊不是公开在售草药，S=0、D=1，稀缺1。
  // 保留题面“药价6、诊费30”的财务断言：模板基价设6，诊费=24+round(6×1)=30；不再用12补偿旧的私人供给折价。
  w.rules.economy.wageCopperPerHalfDay=[48,96];setPrice(w,'item_herb',6);
  const d=w.npcs.find(n=>n.id===DOCTOR);d.schedule={default:[{start:0,end:1440,location:CLINIC,activity:'坐诊配药'}]};d.proficiencies={...d.proficiencies,[MEDICAL_SKILL]:1500};
 });
 const bite={bloodMl:4500,pain:3,wounds:[{id:'bite',simple:true,depthMm:2,areaCm2:5,bleedingMlPerMinute:1,contamination:10,infectionRisk:20,toxinUg:0,foreignBody:false,closed:false}],symptoms:[]};
 const ui=await uiSession(t,{world,mutate:scene(CLINIC,monthDayMinute(9,19,9,0),s=>{
  Object.assign(s.player,{coins:70,hp:60,maxHp:80,medical:structuredClone(bite)});
  Object.assign(s.npcs[DOCTOR],{location:CLINIC,status:'正常',activity:'坐诊配药',coins:20});s.npcs[DOCTOR].inventory={...s.npcs[DOCTOR].inventory,item_herb:5};
 })});
 const before=await primed(ui),seek=await ui.choose('settlement.medicine_seek',{},{search:true,eventId:'seek-d32'});assert.ok(seek.ok,seek.error);const visit=seek.result;
 assert.equal(visit.fee,30);assert.equal(visit.doctor,DOCTOR);
 await ui.choose('time',{minutes:visit.end-(await ui.read()).state.minute});
 const treated=await ui.read(),done=treated.state.records[visit.id];
 assert.equal(done.status,'已诊');assert.equal(before.state.player.coins,70);assert.equal(treated.state.player.coins,40,'①70→40');assert.equal(treated.state.npcs[DOCTOR].coins-before.state.npcs[DOCTOR].coins,30,'①林大夫 +30');
 const wound=treated.state.player.medical.wounds[0];
 assert.equal(wound.bleedingMlPerMinute,0);assert.equal(wound.treatments.length,1);assert.ok(wound.careDue>treated.state.minute,'②咬伤已处理、恢复中（有复诊期限）');assert.ok(!wound.healed);
 assert.equal(held(before.state.npcs[DOCTOR].inventory,'item_herb')-held(treated.state.npcs[DOCTOR].inventory,'item_herb'),1,'④医师药材库存 −1');
 assert.equal(treated.state.player.hp,60,'⑤看过病生命不会瞬间回满');
 // 逐夜回升：当晚 22 点睡到次日 6 点，再睡一夜。
 await ui.choose('time',{until:{dayOffset:0,hour:22}});
 const hp0=(await ui.read()).state.player.hp,n1=await ui.choose('time.sleep',{until:{dayOffset:1,hour:6}});assert.ok(n1.ok,n1.error);
 const hp1=(await ui.read()).state.player.hp;assert.ok(hp1>hp0&&hp1<80,`⑤第一夜 ${hp0}→${hp1}，未满`);
 await ui.choose('time',{until:{dayOffset:0,hour:22}});const n2=await ui.choose('time.sleep',{until:{dayOffset:1,hour:6}});assert.ok(n2.ok,n2.error);
 const hp2=(await ui.read()).state.player.hp;assert.ok(hp2>hp1,`⑤第二夜 ${hp1}→${hp2}`);
 assert.equal((await ui.read()).state.player.medical.wounds[0].healed,true,'复诊期满伤口愈合');
 return {ui,before,treated,visit,world};
}
test('D32 受伤求医 ①②④⑤：诊金加药 30 文（70→40，林大夫 +30），咬伤止血留下医治记录，医师药材 −1，生命不会瞬间回满而是逐夜回升',treatmentD32);
test('D32.2 public medical service delivers three daily dressings from the actual doctor herb, with balanced source and replay',async t=>{
 const {ui,before,treated,visit,world}=await treatmentD32(t),done=treated.state.records[visit.id],drug='item_external_medicine',dispensed=done.prescription.dispensed;
 assert.equal(held(treated.state.inventory,drug)-held(before.state.inventory,drug),3);assert.equal(dispensed.days,3);assert.equal(dispensed.patient,'player');assert.equal(dispensed.source,visit.id);assert.deepEqual(dispensed.material,{item:'item_herb',quantity:1,from:visit.doctor});
 assert.equal(treated.ledger.flows['src:craft|item_external_medicine|prescription']-(before.ledger?.flows['src:craft|item_external_medicine|prescription']??0),3);
 assert.equal(treated.ledger.flows['sink:consume|item_herb|treatment']-(before.ledger?.flows['sink:consume|item_herb|treatment']??0),1);conserved(before,treated,'D32 prescription',new WorldEngine(world));
 const pre=await ui.read();await replayed(ui,pre);const retry=await ui.choose('settlement.medicine_seek',{},{search:true,eventId:'seek-d32'});assert.ok(retry.ok,retry.error);assert.deepEqual(await ui.read(),pre);
 const repeat=await ui.choose('settlement.medicine_seek',{},{search:true});assert.equal(repeat.ok,false);assert.deepEqual(await ui.read(),pre);
});
test('D32⑤ 诊疗后的轻伤按病程与康复槽闭式逐夜恢复',async t=>{
 const {ui}=await treatmentD32(t),doc=await ui.read();
 // 轻伤 5 天 × 医疗愈合时间 0.6 = 3 天；两个八小时夜晚合计 2/3 日，
 // 缺失生命 20，floor(20 - 20 × (1 - 1/3)^(2/3)) = 4，而非固定 +32。
 assert.equal(doc.state.player.hp,64);assert.equal(doc.state.player.medical.recovery.restMinutes,960);
});

// ---- D36 加入组织 ----
const ORG='org_d36',LEADER='npc_hw_luowei',orgRow=()=>({category:'organization',id:ORG,source:'created',name:'柳溪猎户会',kind:'行会',seat:'loc_hw',founder:LEADER,foundedAt:0,leader:LEADER,
 members:{[LEADER]:{position:'会长',joinedAt:0,arrears:0}},removed:{},charter:{mode:'leader',approval:true,fee:50,dues:0,rules:['入会需会长同意，入会费入会库']},treasury:0,ledger:[],sourceEvent:'fixture'});
const joinSession=(t,trust)=>uiSession(t,{mutate:scene('loc_hw',monthDayMinute(6,1,8,0),(s,doc)=>{
 s.player.coins=120;Object.assign(s.npcs[LEADER],{location:'loc_hw',activity:'闲谈',status:'正常',trust,affection:trust,coins:200});s.records[`organization:${ORG}`]=orgRow();
 // 当面拒绝不必先扣再退；与 D23 一样显式开账，保留无转账路径的完整对账。
 doc.ledger=openLedger(baseEngine,doc);
})});
test('D36 加入组织 ①②③：入会费 50（120→70），在场会长按 A2 同意后入会库而不是会长口袋，玩家进成员名单',async t=>{
 // 老韩→罗苇（会长）；入会费 50、需会长同意；夏季六月初一辰时；玩家 120 文。
 const ui=await joinSession(t,30),before=await primed(ui);
 assert.equal(standing(baseEngine,before.state,LEADER,'player'),30,'夹具：会长对玩家好感 +30');
 const apply=await ui.choose('settlement.org_join',{org:ORG},{search:true});assert.ok(apply.ok,apply.error);
 // A3-C D36.5 要求当面表态；保留费用、公库、会长个人钱袋和成员资格断言。
 assert.equal(apply.result.joined,true,'在场会长已经表态');assert.equal(apply.result.decision.outcome,'agree');
 assert.ok(apply.lines.some(line=>line.includes('已加入')),'动作回执明确说明已入会');
 const after=await ui.read(),org=after.state.records[`organization:${ORG}`];
 assert.equal(org.treasury,50,'②入会费进了会库');assert.equal(after.state.npcs[LEADER].coins,200,'②不是会长个人口袋');
 assert.equal(org.members.player.position,'成员','③成员资格生效，成员名单包含玩家');assert.equal(after.state.player.coins,70);
 assert.equal(after.state.minute-before.state.minute,15);assert.equal(apply.result.cost.time,15);
 conserved(before,after,'D36');
});
test('D36 易错：会长不同意（好感 −40）则不能入会，入会费原样退还',async t=>{
 const ui=await joinSession(t,-40),before=await primed(ui);
 const apply=await ui.choose('settlement.org_join',{org:ORG},{search:true});assert.ok(apply.ok,apply.error);
 assert.equal(apply.result.joined,false);assert.equal(apply.result.decision.outcome,'refuse');
 const after=await ui.read(),org=after.state.records[`organization:${ORG}`];
 assert.equal(org.members.player,undefined,'会长不同意不能入会');assert.equal(org.treasury,0);assert.equal(after.state.player.coins,120,'入会费退还');
 conserved(before,after,'D36 否决');
});
test.todo('D36 ④会员权益（参加会内狩猎分成）——引擎成员资格只记在组织名册，没有“会员权益”派生（狩猎分成/额度/投票权）：缺 member_of 持有的 derives（S2 持有与协议）');
test('D36 ⑤当面拒绝也占一刻钟，客户端 consent 不能替会长同意',async t=>{
 const ui=await joinSession(t,-40),before=await primed(ui);
 const forged=await ui.choose('settlement.org_join',{org:ORG,consent:true,opinion:'approve'},{search:true});
 assert.equal(forged.ok,false,'A3-A 的旧入口同意保护拒绝客户端伪造同意');assert.equal((await ui.read()).state.minute,before.state.minute);
 const apply=await ui.choose('settlement.org_join',{org:ORG},{search:true});assert.ok(apply.ok,apply.error);
 const after=await ui.read();assert.equal(after.state.minute-before.state.minute,15);assert.equal(apply.result.cost.time,15);
 assert.equal(apply.result.decision.outcome,'refuse');assert.equal(after.state.records[`organization:${ORG}`].members.player,undefined);
 assert.ok(apply.lines.some(line=>line.includes('入会未完成')),'拒绝回执不能说成已加入');
 assert.equal(after.state.player.coins,120);assert.equal(after.state.records[`organization:${ORG}`].treasury,0);conserved(before,after,'D36 当面拒绝');
});

// ---- D37 交税过关卡 ----
test('D37 交税过关卡 ①②④⑤：10 匹粗布（货值 500）按 5% 抽税 25 文（100→75），税入关卡所在聚落公库，布全部保留过关，随身铜钱与衣物不计税',async t=>{
 // 规定“货值 5%、个人随身物品免税”落到世界副本：关税各政体 500 基点、聚落级别加成 0、不设每种货免税件数；粗布 50 文/匹、归入 trade_goods；河湾村到白石镇的路设守卫成关卡；秋季九月二十二巳时。
 const world=variant(w=>{
  const cloth=item(w,'item_linen_cloth');cloth.basePrice=50;cloth.tags=[...cloth.tags,'trade_goods'];
  const tax=w.rules.economy.credit.taxes;tax.personalAllowance=0;for(const regime of Object.values(tax.regimes))regime.tariff=500;for(const k of Object.keys(tax.levelBps))tax.levelBps[k]=0;
  w.routes.find(r=>r.id==='route_hw_bs').guards=['npc_hw_gucen'];
 });
 const ui=await uiSession(t,{world,mutate:scene('loc_hw',monthDayMinute(9,22,9,0),s=>{s.player.coins=100;s.inventory.item_linen_cloth=stack(10,{weight:0.4});})});
 const before=await primed(ui),treasury=s=>s.state.settlements.loc_bs?.treasury??0;
 const r=await ui.choose('move',{destination:'loc_bs'},{target:'loc_bs'});assert.ok(r.ok,r.error);const after=await ui.read();
 const pass=Object.values(after.state.records).find(x=>x.category==='tariff_passage');
 assert.equal(pass.value,500,'货值 = 10 匹 × 50，只有货物计税');assert.equal(pass.bps,500);assert.equal(pass.amount,25,'①税额 500 × 5% = 25');
 assert.equal(before.state.player.coins,100);assert.equal(after.state.player.coins,75,'①100→75');
 assert.equal(treasury(after)-treasury(before),25,'②关卡所在聚落公库 +25');
 assert.equal(held(after.state.inventory,'item_linen_cloth'),10,'④10 匹粗布全部保留');assert.equal(after.state.location,'loc_bs','④通过关卡');
 assert.equal(held(after.state.inventory,'item_clothes'),held(before.state.inventory,'item_clothes'),'⑤衣物还在、没被计税');assert.equal(pass.value,10*50,'⑤铜钱与衣物不进货值');
 conserved(before,after,'D37',new WorldEngine(world));
});
test.todo('D37 ③玩家获得完税凭据——引擎只在账上记 tariff_passage 与 trade_tax 记录，玩家手里没有凭据物品：缺“征管流程出具文书物品”（S3 票据 = 义务 + 代表物品；S4 税表 assessed 流程）');
test.todo('D37 ①“个人随身物品免税”的口径——引擎规则是每种货免税 personalAllowance=2 件（本测试夹具把它设 0 对齐题面）；设计口径是 tax.json exemption.default（口粮、生计工具）按类别免、货物全额计税：缺 exemption 按类别消费（S4 税表 exemption/subjects）');

// ---- D40 离开村子几天再回来 ----
test('D40 离开几天再回来 ①②④⑤：离开期间世界照常走（时间同步到九月初六、酒馆补了货），回村才从离屏变化里听说喜事，家里的钱物不变，好感不变',async t=>{
 // 青石村→河湾村；县城→白石镇；杂货铺新货→酒馆面包补货；李员外家喜事→陈柏与许苓成亲（九月初三）；秋季九月初一辰时出发。
 const CHEN='npc_hw_chenbai',XU='npc_hw_xuling',start=monthDayMinute(9,1,7,0);
 const ui=await uiSession(t,{mutate:scene('loc_hw',start,s=>{
  s.npcs[LINSUI].inventory.item_bread=0;
  s.family={...s.family,marriages:{m_d40:{id:'m_d40',partners:[CHEN,XU],since:monthDayMinute(9,3,12,0),settlement:'loc_hw'}}};
 })});
 const before=await primed(ui),regard=id=>standing(baseEngine,before.state,id,'player');
 assert.equal(held(before.state.npcs[LINSUI].inventory,'item_bread'),0,'夹具：酒馆面包卖空');
 assert.ok((await ui.choose('move',{destination:'loc_bs'},{target:'loc_bs'})).ok);
 await ui.choose('time',{until:{dayOffset:5,hour:7}});
 const away=await ui.read();
 assert.equal(away.state.visits.lastReturn,undefined,'②人在外面，没有凭空知道喜事');
 assert.ok(!JSON.stringify(away.state.visits).includes('成了亲')&&!Object.values(away.memories).some(m=>/成亲|喜事/.test(m.content)));
 const back=await ui.choose('move',{destination:'loc_hw'},{target:'loc_hw'});assert.ok(back.ok,back.error);
 const after=await ui.read();
 assert.match(baseEngine.calendar(after.state.minute).text,/雁月 6日/,'①世界同步到九月初六');
 assert.ok(held(after.state.npcs[LINSUI].inventory,'item_bread')>0,'①离屏期间酒馆补了新货');
 assert.ok(after.state.visits.lastReturn.lines.includes('陈柏与许苓成了亲'),'②回村后才听说喜事');
 assert.ok(after.state.visits.lastReturn.lines.every(l=>!/初三|喜糖|红纸/.test(l)),'②只有“成了亲”，没有其他细节');
 assert.deepEqual(after.state.inventory,before.state.inventory,'④玩家的物品不变');assert.equal(after.state.player.coins,before.state.player.coins,'④铜钱不变');
 for(const id of [LINSUI,CHEN,XU,ZHENG])assert.ok(Math.abs(standing(baseEngine,after.state,id,'player')-regard(id))<=2,`⑤${id} 好感无故不大变`);
});
// D40① 正式覆盖见 tests/s5-06.test.mjs：真实饲喂、两日积蛋、收集及余额归零。
test.todo('D40 ③不同 NPC 回忆喜事的说法一致（日期都是九月初三）——引擎传闻没有 tell 版本与失真表的日期行：缺 distortion 的 date 行 p = 0（S6 失真表 core 行；附录 A §A.18 失真表行）');
