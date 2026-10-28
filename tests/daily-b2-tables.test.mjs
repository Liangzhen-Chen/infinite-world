// 日常题集第二批（DAILY 卡）表级验证：题面里由“参数表缺省值”决定的数值，用 balance 表的缺省行 + 题面场景量算一遍，必须恰好落在题面预期里。
// 说明：引擎目前不读 balance 表（表只供 BalSim、指标库与将来的结算规则用），所以这里验证的是“缺省值 + 设计公式 = 题面预期”，
// 引擎侧接线（A3 动作耗时、S1 身体需求量、S6 立场事件权重、S5 产出）后同一组数值由引擎结算。引擎侧能结算的条目在 daily-b2-*.test.mjs 里直接断言。
import test from 'node:test';
import assert from 'node:assert/strict';
import {baseWorld} from './helpers/daily-b2.mjs';

const tables=baseWorld.balance;
const row=(table,key)=>{const r=tables[table].rows.find(x=>x.key===key);assert.ok(r,`${table}/${key} 缺省行存在`);return r;};
const param=(table,id)=>{const p=tables[table].params.find(x=>x.id===id);assert.ok(p,`${table}/${id} 缺省参数存在`);return p;};
const within=(value,[lo,hi],label)=>assert.ok(value>=lo&&value<=hi,`${label}：${value} 应在 [${lo}, ${hi}]`);
const SHICHEN=120;      // 题面 D06：一时辰 = 2 小时
const WORKDAY=param('action-costs','workday.minutes').value;
const bodyRate=(need,activity)=>row('body',`person/${need}`).drainPerHour[activity];

test('本卡补入的缺省行：都标待仿真标定、带界、值在界内、注明对应日常题号',()=>{
 const added=[['action-costs',['talk.direction','talk.ask','talk.overhear','read.notice','eat.meal','quest.accept','org.join','bank.deposit','pet.feed','fish.*','practice.*']],
  ['event-weights',['haggle/affinity','ask_way/affinity','settle_on_time/trust','borrow/trust','attend_festival/affinity','study_under/trust','feed_pet/attachment']],
  ['yields',['field:wheat/seed','fish:stream','husbandry:hen']]];
 for(const [table,keys] of added)for(const key of keys){
  const r=row(table,key);assert.equal(r.basis,'calibrate');assert.equal(r.calibration,'pending');assert.match(r.source,/待仿真标定/);assert.match(r.note,/日常题 D\d\d/,`${table}/${key} 注明题号`);assert.ok(r.bounds&&Object.keys(r.bounds).length);
 }
 for(const [table,id] of [['action-costs','workday.minutes'],['body','wet.drainMul'],['transport','speed.rain'],['transport','post.feePerLi'],['transport','freight.cart.perShiLi'],['health','wound.restRecoverShare']]){
  const p=param(table,id);assert.equal(p.basis,'calibrate');assert.match(p.source,/待仿真标定/);assert.match(p.note,/日常题 D\d\d/);within(p.value,p.bounds,`${table}/${id}`);
 }
});

test('D01 / D27 / D34 / D36 / D38 / D22 / D23 / D05 / D07 动作耗时缺省：落在题面给的时间里',()=>{
 const time=key=>row('action-costs',key).timeMin;
 assert.equal(time('trade.retail'),5,'D01⑤ 约 5 分钟');assert.ok(time('trade.retail')<SHICHEN,'D01⑤ 不跨时辰');
 within(time('talk.direction'),[2,5],'D07③ 问路 2–5 分钟');
 within(time('eat.meal'),[20,30],'D05⑤ 吃饭 20–30 分钟');
 assert.equal(time('talk.ask'),15,'D22⑤ 打听约 15 分钟');
 within(time('quest.accept'),[5,10],'D23④ 接任务 5–10 分钟');
 assert.equal(time('talk.greet'),15,'D21③ 寒暄约一刻钟');
 assert.equal(time('read.notice')+time('talk.overhear'),15,'D38④ 看告示 + 旁听 = 约一刻钟');
 assert.equal(time('org.join'),15,'D36⑤ 申请入会约一刻钟');assert.equal(time('bank.deposit'),15,'D27⑤ 开户存入约一刻钟');
 within(time('pet.feed'),[2,10],'D34④ 喂宠物几分钟');
 for(const key of ['talk.ask','talk.overhear','read.notice','eat.meal','quest.accept','org.join','bank.deposit','pet.feed','talk.direction']){const r=row('action-costs',key);within(r.timeMin,r.bounds.timeMin,key);}
});

test('D15 / D20 / D14 持续动作：玩家指定的一个时辰（120 分钟）落在时长槽内；D31 战斗按回合记分钟',()=>{
 for(const key of ['gather.*','fish.*','practice.*']){const r=row('action-costs',key);within(SHICHEN,[r.durationMin,r.durationMax],`${key} 时长槽含一个时辰`);}
 const bout=row('action-costs','combat.bout').minutesPerBout;
 for(const rounds of [3,5,8,15])within(rounds*bout,[3,15],`D31④ ${rounds} 回合 × ${bout} 分钟/回合 = 几分钟到一刻钟`);
});

test('D05 / D06 / D09 / D12 / D20 / D04 / D33 身体需求量：吃面后不再饥饿，赶路体力不到 0，雨天更累，播种耕作体力下降，睡一夜接近满值',()=>{
 const satiety=row('body','person/satiety'),stamina=row('body','person/stamina');
 const hunger=70,s0=100-hunger;
 assert.ok(s0<=satiety.thresholds.hungry,'D05 饥饿度 70 = 饱食 30，处于饥饿');
 assert.ok(s0+satiety.mealGainLow>satiety.thresholds.hungry,'D05② 吃一餐后离开饥饿阈');
 // D06：题面自带步行速度 10 里/时辰 → 20 里 = 2 时辰 = 4 小时。
 const hours=20/10*2,drop=hours*bodyRate('stamina','travel');
 assert.ok(drop>0&&100-drop>0,`D06③ 步行 ${hours} 小时体力 100→${100-drop}，下降但没到 0`);
 // D09：同一段路雨天 = 晴天耗时 ÷ 雨速系数，疲劳率再乘 wet.drainMul。
 const rainHours=hours/param('transport','speed.rain').value,rainDrop=rainHours*bodyRate('stamina','travel')*param('body','wet.drainMul').value;
 assert.ok(rainHours>4,`D09② 雨天 ${rainHours.toFixed(2)} 小时 > 4 小时`);assert.ok(rainDrop>drop&&100-rainDrop>0,`D09③ 雨天体力少 ${rainDrop.toFixed(1)} > 晴天 ${drop}，仍未到 0`);
 // D12：2 亩播种 = 0.5 工日/亩 × 2 = 1 工日 = 一个工作日的大半以上；重活体力下降。
 const sowMinutes=row('yields','field:wheat').laborSow*2*WORKDAY;
 within(sowMinutes,[360,720],'D12③ 耕种耗时占一天的大半');assert.ok(sowMinutes/60*bodyRate('stamina','heavy')<100,'D12④ 体力下降但不为 0');
 // D20：练习一个时辰，轻活，体力小幅下降。
 within(2*bodyRate('stamina','light'),[1,10],'D20③ 体力小幅下降');
 // D04 / D33：睡眠恢复 = 12/小时 × 时长 × 住处系数，封顶 100。
 const sleep=(hours,room,start)=>Math.min(100,start+stamina.sleepRecoverPerHour*hours*stamina.lodgingFactor[room]);
 assert.equal(sleep(9,'room',30),100,'D04④ 单间 9 小时，体力 30 → 接近满值');assert.ok(sleep(9,'hostel',30)>=95,'通铺同样接近满值');
 assert.ok(sleep(8,'room',20)>=95,'D33② 睡 8 小时，体力 20 → 接近满值');
 assert.ok(8*bodyRate('satiety','rest')>0,'D33③ 一夜未进食，饱食下降（饥饿度上升）');
});

test('D12 / D13 / D14 / D15 / D40 产出与劳力：种子、产量、劳时、采集量、渔获、蛋',()=>{
 const wheat=row('yields','field:wheat'),seed=row('yields','field:wheat/seed');
 assert.equal(seed.seedPerUnit.qty*2,4,'D12① 每亩 2 斤 × 2 亩 = 4 斤，种子全部扣完');
 within(wheat.perUnit.qty,wheat.bounds['perUnit.qty'],'D13① 亩产在正常年景范围内');within(wheat.perUnit.qty*2,wheat.bounds['perUnit.qty'].map(n=>n*2),'D13① 2 亩产量 = 1 亩的两倍，落在正常年景范围内');
 const harvestDays=wheat.laborHarvest*2*WORKDAY/WORKDAY;within(harvestDays,[1,2],'D13③ 收割 2 亩 = 2 工日 = 1–2 天');
 const herb=row('yields','gather:herb');within(herb.perUnit.qty*SHICHEN/WORKDAY,[1,50],'D14① 一个时辰采到的株数合理（单次不超过几十株）');
 within(row('learning','skill:*/perHour').perHour.work*2,[0.5,30],'D14④ 采集熟练度小幅增加（≤ 每日上限 30）');
 assert.equal(row('yields','fish:stream').perUnit.qty*SHICHEN/WORKDAY,3,'D15 钓鱼一个时辰约 3 条');
 const eggs=row('yields','husbandry:hen').perUnit.qty;assert.ok(Math.floor(eggs*5)>=3,'D40① 离开 5 天，一只鸡窝里积攒 ≥ 3 枚蛋');
 within(row('learning','skill:*/perHour').perHour.work*3,[0.5,30],'D17④ 做一个木凳（3 小时）木工熟练度小幅增加');
 within(row('learning','skill:*/perHour').perHour.practice*2,[0.5,30],'D20② 练习一个时辰熟练度小幅增加，不会一次升到精通');
 assert.ok(row('learning','skill:*/perHour').perHour.taught*24>0&&row('learning','skill:*/dailyCap').dailyCap[0]*3<300,'D19④ 学 3 天得入门（熟练度 > 0），上限 90 点仍在初级内');
});

test('D03 / D07 / D19 / D21 / D24 / D29 / D30 / D34 / D35 立场事件权重：方向与幅度',()=>{
 const w=(verb,dim)=>row('event-weights',`${verb}/${dim}`);
 within(Math.abs(w('haggle','affinity').weight),[0,2],'D03⑤ 还价好感变化 ±2 以内');
 within(w('ask_way','affinity').weight,[0,1],'D07⑤ 问路好感不变或微升');
 const greet=w('greet','affinity');within(greet.weight,[1,3],'D21② 一次寒暄 +1~+3');assert.ok(greet.weight*greet.saturation.n*greet.saturation.factor<=5,'D21② 饱和后累计不超过 +5');
 within(w('complete_bounty','trust').weight,[1,5],'D24⑤ 交任务好感小幅上升');
 assert.ok(w('borrow','trust').weight>=0,'D29④ 借钱本身不降好感');
 within(w('settle_on_time','trust').weight,[1,5],'D30④ 按时还钱好感小幅上升');
 for(const [verb,dim,label] of [['feed_pet','attachment','D34③'],['attend_festival','affinity','D35④'],['study_under','trust','D19⑤']])within(w(verb,dim).weight,[0,2],`${label} 小幅上升或不变`);
});

test('D25 / D26 / D32 / D37 价与率：驿传费 8、托运费 30、休息回复逐日、关卡税 5% 在界内',()=>{
 assert.equal(param('transport','post.feePerLi').value*20,8,'D25① 20 里驿传费 8 文');
 assert.equal(param('transport','freight.cart.perShiLi').value*2*20,30,'D26① 2 石 × 20 里 = 30 文');
 const share=param('health','wound.restRecoverShare').value,missing=80-60;
 within(share*missing,[1,missing-1],'D32⑤ 第一天回升一部分，不是瞬间回满');
 let hp=60;for(let day=1;day<=5;day++){const next=hp+share*(80-hp);assert.ok(next>hp&&next<80,`D32⑤ 第 ${day} 天 ${hp.toFixed(1)}→${next.toFixed(1)}`);hp=next;}
 const gate=tables.tax.params.find(p=>p.id==='toll.perGate');within(0.05,gate.bounds,'D37 题面 5% 过卡税在 toll.perGate 界内（缺省 2%）');assert.equal(500*0.05,25,'D37① 500 × 5% = 25');
 assert.deepEqual(tables.tax.params.find(p=>p.id==='exemption.default').value,['口粮','生计工具'],'D37⑤ 缺省免税项不含货物');
});

test('冲突登记：D06 题面步行速度 10 里/时辰低于速度表界下沿，表按 15 里/时辰算',()=>{
 const walk=param('transport','speed.walk');
 assert.ok(10<walk.bounds[0],'题面速度 10 里/时辰在界 [12, 18] 之外');
 const hoursAtTable=20/walk.value*2;assert.ok(hoursAtTable<3,`按表 20 里只要 ${hoursAtTable.toFixed(2)} 小时，卯时出发不会到巳时`);
});
test.todo('D06 ① 题面“步行 10 里/时辰、20 里约 4 小时、卯时出发约巳时到”与数值方案冲突：transport.json speed.walk 缺省 15 里/时辰（界 [12, 18]，日行 60 里），20 里约 2.7 小时、辰时初到；S5 运力/交通参数口径待用户决定：改题面（速度改 15 里/时辰或距离改 30 里）还是改速度界');
