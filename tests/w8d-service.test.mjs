// W8-D：服务排队（槽 service:capacity）、队伍威慑、运价/发车表读表。
// 前提全部来自真实动作（求医、开班、委托讼师/匠人、承运报价与托运）；每条断言带手算锚点。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {MEDICAL_SKILL} from '../server-plugin/medicine-state.mjs';
import {bookMedicine,advanceMedicine} from '../server-plugin/medicine.mjs';
import {serviceCapacity,serviceTier} from '../server-plugin/service-queue.mjs';
import {partyDeterrence,guardPower} from '../server-plugin/deterrence.mjs';
import {quoteTransport,carrierDeparture,bookTransport} from '../server-plugin/transport.mjs';
import {fixture as transportFixture,asset as transportAsset,DRIVER,SECOND,RECIPIENT} from './helpers/transport.mjs';

const DAY=1440;
const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const table=name=>structuredClone(world.balance[name]);
// 只改规则表里的一个参数（与 daily-b2 的 variant 同形），让日容量成为手算得出的整数。
function withParam(w,tableName,id,value){const t=table(tableName),p=t.params.find(p=>p.id===id);p.value=value;w.balance={...world.balance,[tableName]:t};}

// ---- 一、服务容量由槽派生 ------------------------------------------------------------
test('日容量 = (基数 + 每阶增量 × 技能阶) × (1 + 助手 × 份额) × 设施系数，取整后经槽 service:capacity',()=>{
 const w=structuredClone(world),e=new WorldEngine(w),d={document:e.createCharacter(seed,{},'cap')};
 // 医疗 base 4 perTier 2：熟练度 600 → 阶 2 → 8（与 healer.capacity=8 的中阶一致）；一位药童 ×1.5 → 12；设施半损 ×0.5 → 6。
 assert.equal(serviceTier(600),2);
 assert.equal(serviceCapacity(e,d,{provider:'x',service:'medicine',proficiency:600}),8);
 assert.equal(serviceCapacity(e,d,{provider:'x',service:'medicine',proficiency:600,helpers:1}),12);
 assert.equal(serviceCapacity(e,d,{provider:'x',service:'medicine',proficiency:600,helpers:1,factor:0.5}),6);
 // 讼师 base 2 perTier 1，熟练度 450 → 阶 1 → 3；匠人同表，熟练度 0 → 2；座位制（学堂）直接取设施座位。
 assert.equal(serviceCapacity(e,d,{provider:'x',service:'law',proficiency:450}),3);
 assert.equal(serviceCapacity(e,d,{provider:'x',service:'craft',proficiency:0}),2);
 assert.equal(serviceCapacity(e,d,{provider:'x',service:'teach',seats:12}),12);
 // 槽上限 50：再大的设施也夹到 50；设施停用（系数 0）即无容量。
 assert.equal(serviceCapacity(e,d,{provider:'x',service:'teach',seats:100}),50);
 assert.equal(serviceCapacity(e,d,{provider:'x',service:'medicine',proficiency:600,factor:0}),0);
});

// ---- 二、医疗：容量 1 的大夫 -------------------------------------------------------------
const CLINIC='bld_hw_herbs',DOCTOR='npc_hw_taozhi',HELPER='npc_hw_fanrong',P1='npc_hw_linsui',P2='npc_hw_shendu',P3='npc_hw_zhengshuisheng';
function clinic(){
 // 日容量基数 1、每阶 0：无论药童在不在（⌊1×1.5⌋ = 1），这位大夫一天只接 1 诊。
 const w=structuredClone(world);
 const t=table('health'),cap=t.params.find(p=>p.id==='service.capacity');cap.value.medicine={base:1,perTier:0};w.balance={...world.balance,health:t};
 for(const id of [DOCTOR,HELPER,P1,P2,P3]){const b=w.npcs.find(n=>n.id===id);b.schedule={default:[{start:0,end:1440,location:CLINIC,activity:'坐诊配药'}]};}
 w.npcs.find(n=>n.id===DOCTOR).proficiencies={...w.npcs.find(n=>n.id===DOCTOR).proficiencies,[MEDICAL_SKILL]:600};
 const e=new WorldEngine(w),doc=e.initialFromLegacy({state:seed.state,memories:seed.memories},'w8d-clinic');
 Object.assign(doc.state,{minute:400,location:CLINIC});
 for(const id of [DOCTOR,HELPER,P1,P2,P3])doc.state.npcs[id]={...doc.state.npcs[id],location:CLINIC,status:'正常',activity:'坐诊配药'};
 doc.state.npcs[DOCTOR].inventory={...doc.state.npcs[DOCTOR].inventory,item_herb:20};
 const d={document:doc,get(...p){return p.reduce((v,k)=>v?.[k],this.document);},set(p,value){this.document=applyPatches(this.document,[{op:'set',path:p,value}]);},remove(p){this.document=applyPatches(this.document,[{op:'delete',path:p}]);},say(){}};
 e.airDraft=d;return {e,d};
}
// 病人真实患病：病程已满两日（needsCare），轻症 → 紧迫度 1；P3 另有一道在流血的伤口 → 紧迫度 3。
function fall(d,id,{wound=false}={}){
 const s=d.get('state');
 if(wound){d.set(['state','npcs',id,'medical'],{bloodMl:4500,pain:3,wounds:[{id:`cut_${id}`,simple:true,depthMm:2,areaCm2:5,bleedingMlPerMinute:1,contamination:10,infectionRisk:20,toxinUg:0,foreignBody:false,closed:false}],symptoms:[]});d.set(['state','npcs',id,'coins'],100);return;}
 const ill={id:`illness_${id}`,patient:id,severity:'轻',since:s.minute-2*DAY,endsAt:s.minute+10*DAY,status:'患病中',previousStatus:null,household:null,caregivers:[],fatality:{cared:.2,alone:.4}};
 d.set(['state','family','illnesses',ill.id],ill);d.set(['state','npcs',id,'coins'],100);
}
const visit=(d,id)=>Object.values(d.get('state','records')).find(r=>r.category==='medicine_visit'&&r.patient===id);

test('容量 1 的大夫：第二位病人顺延到次日，回执写明位次 2 与预计时刻',()=>{
 const {e,d}=clinic();fall(d,P1);fall(d,P2);
 const a=bookMedicine(d,e,{patient:P1,clinic:`clinic:${CLINIC}`,consent:true},'a'),b=bookMedicine(d,e,{patient:P2,clinic:`clinic:${CLINIC}`,consent:true},'b');
 // 06:40 起；第一诊排在 08:00（480），当日名额 1 已满；第二诊只能排到次日开诊 08:00 = 1440+480 = 1920。
 assert.equal(a.start,480);assert.equal(Math.floor(a.start/DAY),0);assert.equal(a.position,1);assert.equal(a.status,'预约');
 assert.equal(b.start,DAY+480);assert.equal(b.etaAt,1920);assert.equal(b.position,2,'前面还有 1 位同级、先到的病人');
 assert.equal(b.status,'预约');assert.equal(b.doctor,DOCTOR);
});

test('急症插前：流血的伤者顶掉未开始的轻症，被顶者回到排队、保留原先后，按序重排',()=>{
 const {e,d}=clinic();fall(d,P1);fall(d,P2);fall(d,P3,{wound:true});
 const a=bookMedicine(d,e,{patient:P1,clinic:`clinic:${CLINIC}`,consent:true},'a'),b=bookMedicine(d,e,{patient:P2,clinic:`clinic:${CLINIC}`,consent:true},'b');
 const c=bookMedicine(d,e,{patient:P3,clinic:`clinic:${CLINIC}`,consent:true},'c');
 // 出血伤口紧迫度 3，两位轻症 1：A、B 尚未开始（depart 480、1920 > 400）都被顶回「排队」，C 拿到当日唯一名额 480。
 assert.equal(c.urgency,3);assert.equal(c.start,480);assert.equal(c.position,1);
 assert.equal(visit(d,P1).status,'排队');assert.equal(visit(d,P2).status,'排队');
 assert.equal(visit(d,P1).createdAt,a.createdAt,'原登记时刻保留');
 // 推进一步：排队者按（紧迫度、登记先后）重排；当日名额被 C 占用，A 排次日 1920，B 再排后天 3360。
 advanceMedicine(d,e,{before:400,after:401});
 const a2=visit(d,P1),b2=visit(d,P2);
 assert.equal(a2.status,'预约');assert.equal(a2.start,DAY+480);assert.equal(a2.position,2);
 assert.equal(b2.status,'预约');assert.equal(b2.start,2*DAY+480);assert.equal(b2.position,3);
});

// ---- 三、学堂满员排队 ------------------------------------------------------------------
import {fixture as eduFixture,run as eduRun} from './fixtures/education.mjs';
import {educationCourses} from '../server-plugin/education-state.mjs';
test('学堂座位满员：多出的学生排队（回执写位次），座位空出后按先后补入',async()=>{
 const f=eduFixture(),school='bld_hw_school',second='npc_hw_shendu',third='npc_hw_zhengshuisheng';
 for(const id of [second,third])Object.assign(f.doc.state.npcs[id],{location:school,status:'正常',activity:'清醒研习',skills:{skill_literacy:0}});
 // 学堂 12 座；常设授业班（陆卿）整日占着 11 座 → 同时段只剩 12 − 11 = 1 座。
 const occupied=educationCourses(f.e,f.doc.state).filter(c=>c.location===school&&c.start<600&&c.end>480).reduce((n,c)=>n+c.students.length,0);
 assert.equal(occupied,11);
 const r=await eduRun(f,'world_learn',{operation:'school_open',source:f.teacher,entity:'skill_literacy',kind:'skill',students:[f.student,second,third],start:480,minutes:120,days:10,consent:true},'open-full');
 assert.deepEqual(r.students,[f.student],'唯一的空座给报名最先的一位');
 assert.equal(r.queued,true);assert.deepEqual(r.waitlist.map(w=>[w.student,w.position]),[[second,1],[third,2]],'其余按报名先后排队，回执写明位次');
 assert.equal(r.waitlist[0].eta,null,'常设班没有定期停课，座位何时空出无从预计，如实写 null');
 for(const w of r.waitlist)assert.equal(f.doc.state.records[w.ticket].status,'排队');
 assert.deepEqual(f.doc.state.records[r.course].students,[f.student]);
 // 学堂扩建到 14 座（同一世界、同一存档，换一台读新容量的引擎）：到下一个上课/下课节点（课堂 480–600 的下课钟点）两位按先后补入，排队号转为已受理。
 const w2=structuredClone(f.w);w2.locations.find(p=>p.id===school).capacity=14;f.e=new (f.e.constructor)(w2);
 await eduRun(f,'world_time',{minutes:130},'tick');
 assert.deepEqual(f.doc.state.records[r.course].students,[f.student,second,third]);
 for(const w of r.waitlist)assert.equal(f.doc.state.records[w.ticket].status,'已受理');
});

// ---- 四、讼师排队 ----------------------------------------------------------------------
import {initializeVocation} from '../server-plugin/npc-growth.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {advocateService} from '../server-plugin/legal-representation.mjs';
const intents=JSON.parse(await fs.readFile('tests/fixtures/a3-intents-v2-r7.json','utf8'));
test('讼师日容量用尽：新委托排队不收费不耗时，急务（已裁定）排在先到的轻案前，次日按序受理',async()=>{
 const w=structuredClone(world);withParam(w,'health','service.capacity',{medicine:{base:4,perTier:2},law:{base:1,perTier:0},craft:{base:2,perTier:1}});
 const engine=new WorldEngine(w),initial=engine.initialFromLegacy(seed,'w8d-law'),setup=structuredClone(intents.find(r=>r.id==='A3V2-055').setup);
 let document=applyIntentSetup(engine,initial,{minute:600,location:setup.location,present:setup.present,history:setup.history.filter(r=>r.verb==='qualified'),abilitiesByActor:setup.abilitiesByActor}).document;
 const vocation=setup.vocations[0],lawyer=vocation.actor,d=engine.primitiveDraft(structuredClone(document));
 initializeVocation(d,engine,vocation,{origin:'initial',eventId:'w8d-initial'});
 const mk=(id,status)=>({category:'legal_case',id,law:'law_hw_property',offender:'player',victim:'npc_hw_wushuo',offense:'theft',value:1,reported:true,status,witnesses:[],evidence:[]});
 for(const [id,status] of [['legal_case:one','已报案'],['legal_case:two','已报案'],['legal_case:three','已裁定']])d.set(['state','records',id],mk(id,status));
 document=d.document;
 const hire=async(id,eventId)=>{const out=await engine.reduce(document,{tool:'world_law',eventId,args:{operation:'hire_advocate',case:id,authority:lawyer}});document=applyPatches(document,out.patches);return out.result;};
 const fee=advocateService(engine,document.state,lawyer).fee,coins0=document.state.player.coins,minute0=document.state.minute;
 // 熟练度 450 的讼师，表里 law base 1 / perTier 0 → 日容量 1。第一件案子立即受理。
 const one=await hire('legal_case:one','hire-one');
 assert.equal(one.representation.paid,fee);assert.equal(document.state.player.coins,coins0-fee);
 const minute1=document.state.minute,coins1=document.state.player.coins;
 // 第二件：当日名额已满 → 排队（排第 1），预计次日开门钟点 480 受理 = (今日 + 1) × 1440 + 480；没有扣钱、没有耗时。
 const two=await hire('legal_case:two','hire-two'),day=Math.floor(minute1/DAY);
 assert.equal(two.queued,true);assert.equal(two.position,1);assert.equal(two.eta,(day+1)*DAY+480);
 assert.equal(document.state.player.coins,coins1);assert.equal(document.state.minute,minute1);assert.equal(document.state.records['legal_case:two'].representation,undefined);
 // 第三件已裁定（急务，紧迫度 2 > 1）后到却排在第 2 件前面：位次 1；再问第 2 件，位次变 2。
 const three=await hire('legal_case:three','hire-three');assert.equal(three.position,1);
 const twoAgain=await hire('legal_case:two','hire-two-again');assert.equal(twoAgain.position,2);
 assert.equal(document.state.records[twoAgain.ticket].createdAt,document.state.records[two.ticket].createdAt,'重复询问不改登记先后');
 // 次日 08:00 讼师开门：第二件仍排在急务后面（名额 1 先给第三件），第三件受理。
 document.state.minute=(day+1)*DAY+480;
 const still=await hire('legal_case:two','hire-two-day2');assert.equal(still.queued,true);assert.equal(still.position,2);
 const served=await hire('legal_case:three','hire-three-day2');assert.equal(served.representation.paid,fee);
 assert.equal(document.state.records['legal_case:three'].representation.npc,lawyer);
 assert.equal(document.state.records[three.ticket].status,'已受理');
});

// ---- 五、匠人排队 ----------------------------------------------------------------------
import {uiSession} from './helpers/ui-script.mjs';
import {variant,scene,monthDayMinute,primed,tool} from './helpers/daily-b2.mjs';
test('匠人日容量用尽：第二件活计排队不收费不耗时，次日开门后受理',async t=>{
 const SWORD='item_steel_arming_sword',SMITH='npc_hw_duanyan',FORGE='bld_hw_forge';
 const w=variant(w=>{const n=w.npcs.find(n=>n.id===SMITH);n.proficiencies={...n.proficiencies,skill_life_5_core:500};n.schedule={default:[{start:0,end:1440,location:FORGE,activity:'repair',services:['trade']}]};});
 // 匠人 base 1 / perTier 0 → 日容量 1（原表 2 + 1×阶）。
 withParam(w,'health','service.capacity',{medicine:{base:4,perTier:2},law:{base:2,perTier:1},craft:{base:1,perTier:0}});
 const unit=id=>({id,item:SWORD,owner:'player',status:'持有',durability:50,maxDurability:100,maker:SMITH,source:'fixture'});
 const ui=await uiSession(t,{world:w,mutate:scene(FORGE,monthDayMinute(4,10,10,0),s=>{s.player.coins=100;s.inventory[SWORD]={...tool(),quantity:2,durability:50,maxDurability:100,instances:['sword-a','sword-b']};s.itemInstances={...s.itemInstances,'sword-a':unit('sword-a'),'sword-b':unit('sword-b')};})});
 const before=await primed(ui);
 const first=await ui.choose('craft.repair',{item:SWORD,instance:'sword-a',maker:SMITH},{search:true,eventId:'w8d-repair-a'});assert.ok(first.ok,first.error);
 const mid=await ui.read();
 assert.equal(mid.state.player.coins,before.state.player.coins-25,'第一件收 25 文');assert.equal(mid.state.minute-before.state.minute,60,'耗时 60 分钟');
 // 第二件：先报价就能看到要排队；真下单则只给排队号。
 const quote=await ui.choose('craft.repair',{item:SWORD,instance:'sword-b',maker:SMITH,quote:true},{search:true});assert.ok(quote.ok,quote.error);
 const day=Math.floor(mid.state.minute/DAY);
 assert.equal(quote.result.queue.position,1);assert.equal(quote.result.queue.eta,(day+1)*DAY+480);
 assert.equal((await ui.read()).state.records[quote.result.queue.ticket]?.status,undefined,'报价不登记排队号');
 const second=await ui.choose('craft.repair',{item:SWORD,instance:'sword-b',maker:SMITH},{search:true,eventId:'w8d-repair-b'});assert.ok(second.ok,second.error);
 const queued=await ui.read();
 assert.equal(second.result.queued,true);assert.equal(second.result.position,1);assert.equal(second.result.eta,(day+1)*DAY+480);
 assert.equal(queued.state.player.coins,mid.state.player.coins);assert.equal(queued.state.minute,mid.state.minute);assert.equal(queued.state.itemInstances['sword-b'].durability,50);
 assert.equal(queued.state.records[second.result.ticket].status,'排队');
 // The smith remembers a queued job as waiting in line, never as a failed repair.
 const recall=(queued.state.npcs[SMITH].memoryStream??[]).filter(m=>m.kind==='repair').map(m=>m.content);
 assert.ok(recall.some(c=>c.includes('活计已满，排在第1位')),recall.join(' / '));assert.ok(!recall.some(c=>c.includes('未成功')),recall.join(' / '));
 // 次日 08:00 再来：名额已重置，受理并完成修整，排队号转为已受理。
 await ui.choose('time',{minutes:(day+1)*DAY+480-queued.state.minute});
 const third=await ui.choose('craft.repair',{item:SWORD,instance:'sword-b',maker:SMITH},{search:true,eventId:'w8d-repair-b2'});assert.ok(third.ok,third.error);
 const done=await ui.read();assert.equal(done.state.itemInstances['sword-b'].durability,100);assert.equal(done.state.records[second.result.ticket].status,'已受理');
});

// ---- 六、队伍威慑：战力、装备、护送义务、标签 -------------------------------------------------
const near=(a,b,msg)=>assert.ok(Math.abs(a-b)<1e-9,`${msg}：${a} ≠ ${b}`);
function lane({risk=1,guards=[]}={}){
 const f=transportFixture();f.w.routes[0].risk=risk;f.w.routes[0].guards=guards;
 const id=transportAsset(f.d,f.e);return {...f,id};
}
const quoteOf=(f,extra={})=>quoteTransport(f.d,f.e,{asset:f.id,from:'loc_hw',to:'loc_bs',cargo:[{item:'item_oats',quantity:10}],...extra});
test('威慑：护卫战力权重 S，base = S/(S+1)；护送义务 ×1.25；路线驻守护卫无义务按 ×1',()=>{
 // 参照战力 = 3 级空手：攻 3+3×1.1 = 6.3，防 1+3×0.45 = 2.35，合计 8.65。陆卿同级（3 级）空手 → 权重 1。
 const none=lane();near(quoteOf(none).passages[0].deterrence,0,'无护卫');
 const escorted=lane();const q=quoteOf(escorted,{escort:SECOND});
 near(guardPower(escorted.e,escorted.d,SECOND),8.65,'护送者战力');
 // 受护送义务约束：权重 1×(1+0.25) = 1.25 → 1.25/2.25。
 near(q.passages[0].deterrence,1.25/2.25,'护送者威慑');near(q.passages[0].risk,1-1.25/2.25,'路线风险 1 × (1 − 威慑)');
 // 同一个人只是驻守在路线端点（没有护送义务）：权重 1 → 1/2。
 const garrison=lane({guards:[SECOND]});near(quoteOf(garrison).passages[0].deterrence,0.5,'驻守护卫');
});
test('威慑随护卫装备变化：行囊里真实持有、等级够用的兵器计入战力，等级不够的不计',()=>{
 // 铁木矛 item_ash_spear：攻 +4、铁质（无等级门槛）→ 战力 8.65 + 4 = 12.65，权重 12.65/8.65，再 ×1.25。
 const armed=lane();armed.d.set(['state','npcs',SECOND,'inventory','item_ash_spear'],{quantity:1,quality:'铁',durability:100});
 const s1=12.65/8.65*1.25;near(quoteOf(armed,{escort:SECOND}).passages[0].deterrence,s1/(s1+1),'持铁木矛');
 // 精钢剑 item_steel_arming_sword 是银质，要 20 级；3 级的护卫拿着也用不了 → 战力不变。
 const unfit=lane();unfit.d.set(['state','npcs',SECOND,'inventory','item_steel_arming_sword'],{quantity:1,quality:'银',durability:100});
 near(quoteOf(unfit,{escort:SECOND}).passages[0].deterrence,1.25/2.25,'等级不够的装备不计');
 // 同一把矛没有真的持有（数量 0）不计。
 const empty=lane();empty.d.set(['state','npcs',SECOND,'inventory','item_ash_spear'],{quantity:0,quality:'铁',durability:100});
 near(quoteOf(empty,{escort:SECOND}).passages[0].deterrence,1.25/2.25,'没有持有');
});
test('威慑：车队标签（mark:escort_banner）按 0.1 缩小剩余缺口；护送报价更低',()=>{
 const f=lane();f.d.set(['state','records',f.id,'marks'],['mark:escort_banner']);
 // 缺口 1/(S+1) = 1/2.25，标签再缩 10% → 威慑 = 1 − (1/2.25)×0.9 = 0.6。
 near(quoteOf(f,{escort:SECOND}).passages[0].deterrence,1-(1/2.25)*0.9,'带旗');
 const plain=lane();
 assert.ok(quoteOf(f,{escort:SECOND}).freight<=quoteOf(plain,{escort:SECOND}).freight,'威慑越高风险越低，运价不会更高');
 // 无关标签不起作用。
 const other=lane();other.d.set(['state','records',other.id,'marks'],['mark:graffiti']);
 near(quoteOf(other,{escort:SECOND}).passages[0].deterrence,1.25/2.25,'无关标签');
});
test('partyDeterrence 是承运报价与其它遭遇/劫掠候选共用的同一个读法',()=>{
 const f=lane();
 const a=partyDeterrence(f.e,f.d,{guards:[SECOND],bonded:[SECOND],tags:[]}),b=partyDeterrence(f.e,f.d,{guards:[SECOND],bonded:[SECOND],tags:[]});
 assert.deepEqual(a,b);near(a.base,1.25/2.25,'base');near(a.strength,1.25,'S');assert.equal(a.members[0].id,SECOND);
 near(partyDeterrence(f.e,f.d,{}).base,0,'没有护卫');
});

// ---- 七、运价/发车表读表 ---------------------------------------------------------------------
test('车船规格读 balance/transport.json 的 carrier:* 行，数值与原硬编码 SPECS 一致',()=>{
 const rows=Object.fromEntries(table('transport').rows.filter(r=>r.key.startsWith('carrier:')).map(r=>[r.key.slice(8),r]));
 const SPECS={cart:{mode:'cart',kg:600,m3:3,seats:4,wood:20,metal:2,rate:0.012},boat:{mode:'boat',kg:2400,m3:12,seats:12,wood:60,metal:4,rate:0.008},pack:{mode:'walk',kg:80,m3:0.5,seats:0,wood:0,metal:0,rate:0.02}};
 for(const [kind,spec] of Object.entries(SPECS))for(const [k,v] of Object.entries(spec))assert.equal(rows[kind][k],v,`${kind}.${k}`);
});
test('运费读表：车的费率改成两倍，同一批货的运费翻倍（12 km × 50 kg × 费率，路线无风险）',()=>{
 const f=lane({risk:0}),base=quoteOf(f,{cargo:[{item:'item_oats',quantity:100}]});
 // 100 份燕麦 × 0.5 kg = 50 kg；12 × 50 × 0.012 = 7.2 → ceil 8。
 assert.equal(base.freight,8);
 const w=structuredClone(f.w);const t=table('transport');t.rows.find(r=>r.key==='carrier:cart').rate=0.024;w.balance={...world.balance,transport:t};
 const g=transportFixture();g.e=new WorldEngine(Object.assign(structuredClone(g.w),{balance:w.balance}));g.w.routes[0].risk=0;
 // 换成读新表的引擎后：12 × 50 × 0.024 = 14.4 → ceil 15。
 const f2={...g,id:transportAsset(g.d,g.e)};g.e.airDraft=g.d;
 assert.equal(quoteOf(f2,{cargo:[{item:'item_oats',quantity:100}]}).freight,15);
});
test('发车表：车行/船行整点随到随发、午初（660）后次日辰初（420）起发；驿站每日辰初发',()=>{
 const {e}=transportFixture();
 // 车行：10:00（600）整点即发；11:40（700）过午初截件，次日 07:00 = 1860；次日 01:00（1500）仍须等该日辰初 = 1860。
 assert.equal(carrierDeparture(e,'cart',600),600);assert.equal(carrierDeparture(e,'cart',700),1860);assert.equal(carrierDeparture(e,'cart',1500),1860);
 // 驿站：05:00（300）→ 当日 07:00（420）；正好 07:00 即发；08:00（480）错过 → 次日 1860。
 assert.equal(carrierDeparture(e,'post',300),420);assert.equal(carrierDeparture(e,'post',420),420);assert.equal(carrierDeparture(e,'post',480),1860);
});
test('信件（无货无客无护送）按驿传费 post.feePerLi 计里程、按驿站班次发；货运不受影响',()=>{
 const f=lane({risk:1});
 // 12 km = 24 里 × 0.4 文/里 = 9.6 → 10；不乘风险附加（驿传是公价）。起点 10:00（600）→ 驿站次日辰初 1860。
 const letter=quoteTransport(f.d,f.e,{asset:f.id,from:'loc_hw',to:'loc_bs'});
 assert.equal(letter.freight,10);assert.equal(letter.departAt,1860);assert.equal(letter.estimatedArrivalAt,1860+letter.route.minutes);
 // 同一路线运货仍按重量：10 份燕麦 5 kg → 12 × 5 × 0.012 × (1 + 风险)，风险 = 1 − 0 = 1 → 1.44 → 2。
 const cargo=quoteOf(f);assert.equal(cargo.departAt,600);assert.equal(cargo.freight,2);
 // 书信下单后运单的发车时刻就是驿站班次，提前到站的班次被拒。
 const trip=bookTransport(f.d,f.e,{asset:f.id,to:'loc_bs',recipient:RECIPIENT},'letter-trip');
 assert.equal(trip.departAt,1860);assert.equal(trip.status,'booked');
 assert.throws(()=>bookTransport(f.d,f.e,{asset:f.id,to:'loc_bs',recipient:RECIPIENT,departAt:900},'bad-letter'),/班次/);
});
