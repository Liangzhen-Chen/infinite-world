// EC-1a 付款收口（整类）。
// 一、整类扫描：server-plugin 下每一处“从某个 NPC 钱袋出钱”的 moveCoins（from: purse(...) / purseAccount(...)，付款人不是字面量 'player'）
//    要么已改走唯一入口 npc-payment.payFromNpc（所以不再出现直接 moveCoins），要么登记在下面的例外清单里并写明理由；
//    清单里的条数必须与源码完全一致（多出一处漏网的、或清单里有已不存在的条目，都失败）。新增付款路径时必须二选一，不能悄悄绕过。
//    扫描只认 `moveCoins(d,{from:purse(` 这一写法；付款账户经变量或三元式传入的（finance-bank、shop 的 payer、law、tender、finance-tax 等）
//    已在原语层（financeTransfer/financeChange、shop 的 householdPoolTopUp、obligation-runtime 的 topUpNpc）收口，不在本扫描范围。
// 二、行为：入口（及它的“只补足”变体 topUpNpc）按付款类别各一条：本人钱袋不够、户池够 → 补足后成交、账本守恒、陌生户不动；户池也不够 → 拒绝。
//    各调用点是否接了入口由第一部分守住；第二部分用各类别真实的收款账户类型与写入者走入口本身，期望值手推。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {openLedger,auditLedger} from '../server-plugin/ledger.mjs';
import {purse,sink,fund,escrow} from '../server-plugin/money.mjs';
import {financeTransfer} from '../server-plugin/finance-bank.mjs';
import {npcCanPay,payFromNpc,topUpNpc} from '../server-plugin/npc-payment.mjs';

// ---------------------------------------------------------------- 一、整类扫描
// 键 = 文件|付款人表达式；值 = [条数, 理由]
const EXCEPTIONS={
 'npc-payment.mjs|purse(engine,payer)':[1,'入口本身'],
 'household-budget.mjs|purse(engine,member)':[1,'户池补足本身：同一登记户成员钱袋之间的转账'],
 'bounty.mjs|purse(null,row.victim)':[1,'悬赏认捐：受害人自愿按自己钱袋的一定比例出，上限取自本人钱袋，不是付款义务'],
 'npc-crime.mjs|purse(null,victim)':[1,'盗窃：受害人被抢，不是付款'],
 'family-law.mjs|purse(e,ward)':[1,'监护代管：被监护人的继承财产，属遗产类账户，不并入户池'],
 'business.mjs|purse(e,owner)':[2,'玩家柜台出资与开户：owner 只允许 player（上文 throw），不是 NPC'],
 'business.mjs|purse(this,buyer)':[1,'玩家店手动售出：付款前（business.mjs 付款之上）已 householdPoolTopUp'],
 'business.mjs|purse(engine,buyer)':[1,'玩家店客流成交：serve 在成交前按 tripCost+货款一并 householdPoolTopUp'],
 'business.mjs|purse(engine,id)':[1,'客流路费：serve 在同一事件里先按 tripCost+货款 householdPoolTopUp'],
 'distribution.mjs|purse(engine,buyer)':[1,'持货人进货：付款前 householdPoolTopUp'],
 'market-seller.mjs|purse(engine,buyer)':[1,'settleSale 默认付款：调用方（business 客流/手动售出、distribution）成交前已补足'],
 'money.mjs|purse(engine,owner)':[2,'玩家柜台注资与取用（depositCounter/spendCounter），owner 只允许 player'],
 'works.mjs|purseAccount(engine,npc)':[2,'书籍买家与听众小费：买家按自己钱袋出得起才入选，小费取 min(本人钱袋, 档位)，自愿且以本人钱袋为上限'],
 'finance-bank.mjs|partyAccount(e,state,from)':[1,'financeTransfer：动钱前 poolTopUpFor（即 topUpNpc）'],
 'finance-bank.mjs|partyAccount(e,state,buyer)':[2,'典当拍卖买方：付款前 topUpNpc（本卡补）'],
 'finance-tax.mjs|group?treasury(seller):purse(e,seller)':[1,'商税：卖方缴税取自刚收到的成交款，同一笔成交里先收后缴；缴不起即整笔拒绝（上方“卖方现款不足以缴纳”），不是独立的 NPC 采购付款'],
 'shop.mjs|payer':[2,'店主收货与补货：payer 为柜台或店主钱袋，付款前 householdPoolTopUp / counterCash 判定（shop.mjs 自带）'],
 'tender.mjs|from':[1,'payInKind：付款前 topUpNpc（本卡补）'],
 'obligation-runtime.mjs|from':[1,'通用清偿：付款前 topUpNpc（来源是本人钱袋时）；托管/质押来源不是户内钱袋'],
 'money.mjs|from':[1,'moveCoins 定义本身'],
 'money.mjs|books.account':[1,'bookSide：账本对方账户配平，成对另一边由调用方负责（financeChange 已补足）'],
 'law.mjs|from':[1,'books 助手定义行。其调用点：报案/立案讼费（NPC 可能是付方）已改走 payFromNpc；其余 books 调用：付方是玩家字面量（罚金、悬赏、转账、牌照费），强制扣押（按判决从当事人现钱扣，非自愿付款）与受害人赔付（被判令的强制给付），收款方是基金/托管/玩家；NPC 自愿付款不再经 books'],
 'legal-appeal.mjs|account.account':[1,'公库返还：付方是法律公库，不是钱袋'],
 'legal-appeal.mjs|amount>0?purse(e,row.offender):fund(id)':[1,'上诉改判的转移：付款前 topUpNpc（本卡补）'],
 'environment.mjs|from':[1,'玩家敞开的钱袋容器取钱（transfer_purse）：付方是玩家的容器，不是 NPC'],
 'organizations.mjs|admissionEscrow(p)':[1,'入会费托管退还：付方是托管账户'],
 'remote-generation.mjs|from':[1,'远方世界生成：开账与初始分配，不是付款']
};
// 提取每个 moveCoins(d,{from…,to 的付方表达式（含 from 简写、三元式、变量、partyAccount、purse）。
// 免登记：付方是 玩家字面量 / 托管、金库、公库、基金、源、汇、中转 账户构造 / 柜台与记录账户。其余必须在 EXCEPTIONS 里。
// 选源码扫描而不是在 moveCoins 里做运行期断言：合法的直接 moveCoins 很多（店铺成交前已补足、玩家付款、公库出账），运行期无法区分“已补足”与“漏补”，
// 断言会误杀或被标记绕过；扫描 + 每条例外写明理由 + 条数精确相等，新增付款路径必须二选一。
const FROM=/moveCoins\(d,\{from(?::(.*?))?,to\b/g;
const SAFE=[/^(escrowAccount|escrow|vault|fundAccount|fund|treasuryAccount|treasury|sink|source|transit)\(/,/^(counter\.account|row\.account|account|chest)$/,/^purse(Account)?\([a-z]+,'player'\)$/];
test('every moveCoins whose payer is not a fixed non-purse account is either routed through payFromNpc or on the documented exception list', async () => {
 const dir=new URL('../server-plugin/',import.meta.url),files=(await fs.readdir(dir)).filter(f=>f.endsWith('.mjs')).sort(),found={};
 for(const file of files){
  const text=await fs.readFile(new URL(file,dir),'utf8');
  for(const m of text.matchAll(FROM)){
   const expr=(m[1]??'from').trim();
   if(SAFE.some(re=>re.test(expr)))continue;
   const key=`${file}|${expr}`;found[key]=(found[key]??0)+1;
  }
 }
 for(const [key,count] of Object.entries(found))assert.ok(EXCEPTIONS[key],`未登记的付款路径（直接 moveCoins，没走 payFromNpc）：${key} ×${count}`);
 for(const [key,[count,reason]] of Object.entries(EXCEPTIONS))assert.equal(found[key]??0,count,`例外清单与源码不符：${key}（${reason}）`);
});
test('clone-and-write-back payment paths re-read the draft coins after paying instead of patching a stale copy', async () => {
 for(const file of ['npc-schedule.mjs','npc-obligations.mjs']){
  const text=await fs.readFile(new URL(`../server-plugin/${file}`,import.meta.url),'utf8');
  assert.match(text,/npc\.coins=d\.get\('state','npcs',(npcId|id),'coins'\)-route\.cost/,`${file}: 付款后必须按草稿最新值扣路费`);
  assert.doesNotMatch(text,/npc\.coins\+=payFromNpc/,`${file}: 不得对克隆副本补算补足额`);
 }
});
test('the NPC-payer call sites converted in EC-1a really call the entry point', async () => {
 const SITES={'npc-labor.mjs':3,'npc-autonomy.mjs':2,'festival.mjs':1,'building-maintenance.mjs':2,'npc-crime.mjs':3,'family-law.mjs':1,'credit.mjs':2,'quest-board.mjs':1,'quest-sources.mjs':1,'npc-cognition.mjs':1,'npc-life.mjs':1,'npc-obligations.mjs':1,'npc-schedule.mjs':1,'contracts.mjs':1,'smuggling.mjs':1,'public-projects.mjs':1,'business.mjs':1};
 for(const [file,least] of Object.entries(SITES)){
  const text=await fs.readFile(new URL(`../server-plugin/${file}`,import.meta.url),'utf8');
  assert.ok((text.match(/payFromNpc\(d,/g)??[]).length>=least,`${file}: payFromNpc 调用少于 ${least} 处`);
 }
 const runtime=await fs.readFile(new URL('../server-plugin/obligation-runtime.mjs',import.meta.url),'utf8'),top=runtime.indexOf('topUpNpc(d,e,payer,amount,eventId)');
 assert.ok(top>=0&&top<runtime.indexOf('Settlement source has insufficient booked cash'),'通用清偿：补足必须在“来源现钱够不够”的检查之前');
});

// ---------------------------------------------------------------- 二、行为
const world=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const A='npc_hw_luowei',B='npc_hw_duanyan',C='npc_hw_shendu',D='npc_hw_linsui',home='bld_hw_qingdeng';
function fixture(coins){
 const w=structuredClone(world);
 delete w.rules.householdSubsistence;
 w.households=[{id:'pay-house',members:[A,B],settlement:'loc_hw',homeLocation:home},{id:'pay-stranger',members:[C],settlement:'loc_hw',homeLocation:home},{id:'pay-payee',members:[D],settlement:'loc_hw',homeLocation:home}];
 const e=new WorldEngine(w),doc=e.createCharacter(legacy,{},'ec1a-payment-paths');
 doc.state.minute=0;doc.state.location=home;
 doc.state.npcs=Object.fromEntries([A,B,C,D].map(id=>[id,{...doc.state.npcs[id],coins:coins[id]??0,inventory:{},location:home,status:'正常',activity:'休息'}]));
 doc.ledger=openLedger(e,doc);
 return {e,doc,d:e.primitiveDraft(doc)};
}
const coin=(f,id)=>f.d.get('state','npcs',id,'coins'),bal=(f,account)=>f.d.get('ledger','accounts',account)??0;
const purses=f=>[A,B,C,D].reduce((n,id)=>n+coin(f,id),0);
const ledgerPurses=f=>[A,B,C,D].reduce((n,id)=>n+bal(f,purse(f.e,id)),0);

// 类别表：writer 与收款账户取该类别调用点真实使用的；need = 付款额；own = 付款人 A 的钱；pool = 同户 B 的钱。
// 手推：补足额 = need − own；A 付后为 0（own+补足 = need）；B 剩 pool − 补足；陌生户 C 不动；收款账户 +need。
const CATEGORIES=[
 {name:'进货（劳务采买/筹料：npc-labor settleBuy、building-maintenance）',writer:'npc-labor',to:f=>purse(f.e,D),need:30,own:10,pool:100,topped:20,payeeCoins:30},
 {name:'路费（npc-schedule/obligations/labor/cognition 的出行）',writer:'npc-schedule',to:()=>sink('export','travel'),need:4,own:1,pool:100,topped:3,sinkAmount:4},
 {name:'罚金赔偿（npc-crime 判决、family-law 赔偿）',writer:'npc-crime',to:()=>fund('legal_treasury:ec1-test'),need:25,own:10,pool:100,topped:15,fundAmount:25},
 {name:'任务报酬（quest-board 发布者托管）',writer:'quest-board',to:()=>escrow('quest_ec1_test'),need:40,own:10,pool:100,topped:30,fundAmount:40}
];
for(const c of CATEGORIES){
 test(`${c.name}: short own purse, enough in the household pool -> topped up, paid, books conserved, stranger untouched`,()=>{
  const f=fixture({[A]:c.own,[B]:c.pool,[C]:500}),before=purses(f),ledgerBefore=ledgerPurses(f),dest=c.to(f);
  assert.equal(npcCanPay(f.d,f.e,A,c.need),true,'本人不够但户池够，判定可付');
  const topped=payFromNpc(f.d,f.e,{payer:A,to:dest,amount:c.need,writer:c.writer,eventId:'pay-1'});
  assert.equal(topped,c.topped);
  assert.equal(coin(f,A),0,'补足额 = 付款额 − 本人钱，付后本人为 0');
  assert.equal(coin(f,B),c.pool-c.topped);assert.equal(coin(f,C),500,'陌生户不出钱');
  if(c.payeeCoins!==undefined)assert.equal(coin(f,D),c.payeeCoins);
  assert.equal(purses(f),before-(c.sinkAmount??0)-(c.fundAmount??0),'钱袋合计只减去流向汇/基金/托管的部分');
  assert.equal(ledgerPurses(f),purses(f),'账本与旧字段一致');
  assert.equal(ledgerBefore-ledgerPurses(f),(c.sinkAmount??0)+(c.fundAmount??0));
  if(c.fundAmount!==undefined)assert.equal(bal(f,dest),c.fundAmount);
  if(c.sinkAmount!==undefined)assert.equal(bal(f,dest),c.sinkAmount);
  assert.deepEqual(auditLedger(f.d.get('ledger')),[]);
 });
 test(`${c.name}: the whole pool is short -> refused (and a stranger household cannot cover it)`,()=>{
  const f=fixture({[A]:2,[B]:3,[C]:500});
  assert.equal(npcCanPay(f.d,f.e,A,c.need),false,'本人 2 + 户池 3 = 5，不够 '+c.need);
  assert.throws(()=>payFromNpc(f.d,f.e,{payer:A,to:c.to(f),amount:c.need,writer:c.writer,eventId:'pay-2'}));
 });
}

test('工钱/补货（劳务工钱、店铺补货经金融原语 financeTransfer）: short own purse, pool enough -> paid; pool short -> refused', () => {
 const f=fixture({[A]:10,[B]:100,[C]:500}),before=purses(f);
 financeTransfer(f.d,f.e,A,D,30,'pay-wage');
 assert.equal(coin(f,A),0);assert.equal(coin(f,B),80);assert.equal(coin(f,D),30);assert.equal(coin(f,C),500);assert.equal(purses(f),before);
 assert.deepEqual(auditLedger(f.d.get('ledger')),[]);
 const g=fixture({[A]:10,[B]:15,[C]:500});
 assert.throws(()=>financeTransfer(g.d,g.e,A,D,40,'pay-wage-short'),/当事人资金不足/);
});

test('信用还款（obligation-runtime.settleObligation 付款前的 topUpNpc）: debtor purse short -> pool tops it up to the amount; nothing to top up when own purse suffices; non-NPC parties are never topped up', () => {
 const f=fixture({[A]:10,[B]:100,[C]:500}),before=purses(f);
 assert.equal(topUpNpc(f.d,f.e,A,30,'repay-1'),20,'缺 30−10=20，由同户 B 补');
 assert.equal(coin(f,A),30);assert.equal(coin(f,B),80);assert.equal(coin(f,C),500);assert.equal(purses(f),before,'只在户内转，币总量不变');
 assert.equal(bal(f,purse(f.e,A)),30,'账本里债务人钱袋同步到 30（通用清偿据此检查“来源现钱够不够”）');
 assert.equal(topUpNpc(f.d,f.e,A,20,'repay-2'),0,'本人 30 已够 20，不动户池');
 assert.equal(coin(f,B),80);
 assert.equal(topUpNpc(f.d,f.e,'player',999,'repay-3'),0,'玩家不是户内钱袋，不补');
 assert.deepEqual(auditLedger(f.d.get('ledger')),[]);
});

test('fare paid wholly by the household pool (own purse 0): after the call-site formula the draft coin field equals the ledger purse', () => {
 // 手推：A 0 币、同户 B 100 币、路费 4：补足 4，A 付 4 后账本钱袋 0；草稿字段按“最新值 − 路费”写回为 0；B 剩 96。
 const f=fixture({[A]:0,[B]:100,[C]:500}),before=purses(f);
 payFromNpc(f.d,f.e,{payer:A,to:sink('export','travel'),amount:4,writer:'npc-schedule',eventId:null});
 f.d.set(['state','npcs',A,'coins'],f.d.get('state','npcs',A,'coins')-4);
 assert.equal(coin(f,A),0);assert.equal(bal(f,purse(f.e,A)),0,'字段与账本一致');
 assert.equal(coin(f,B),96);assert.equal(bal(f,purse(f.e,B)),96);assert.equal(coin(f,C),500);assert.equal(purses(f),before-4);
 assert.deepEqual(auditLedger(f.d.get('ledger')),[]);
});

test('no top-up when the payer\'s own purse suffices; the household pool is not touched', () => {
 const f=fixture({[A]:100,[B]:100,[C]:500});
 assert.equal(payFromNpc(f.d,f.e,{payer:A,to:purse(f.e,D),amount:30,writer:'npc-labor',eventId:'pay-3'}),0);
 assert.equal(coin(f,A),70);assert.equal(coin(f,B),100);assert.equal(coin(f,D),30);
});
