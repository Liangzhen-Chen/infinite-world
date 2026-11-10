// 确定性诊断探针：只调用公开函数，搭出与对应测试相同的前置状态，打印钱的分项流向。
// 不调用模型，不改任何文件。用法：node tools/probe-money-flow.mjs <bounty|s3|migration|all>
// 钱流取自账本调试钩子 globalThis.__LEDGER_TRACE__（ledger.transfer 每笔转移一条：from,to,amount,writer,eventId）。
import fs from 'node:fs/promises';
import {loadWorld} from './load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';

const DAY=1440,which=process.argv[2]??'all';
const seed=JSON.parse(await fs.readFile(new URL('../tests/fixtures/legacy/seed.json',import.meta.url),'utf8'));
const source=await loadWorld();
const COINS='coin_river';
const coinTrace=()=>(globalThis.__LEDGER_TRACE__??[]).filter(t=>t.from.includes(COINS)&&t.to.includes(COINS));
function startTrace(){globalThis.__LEDGER_TRACE__=[];}
function table(rows,title){
    const agg=new Map();
    for(const t of rows){const k=`${t.from} -> ${t.to} | ${t.writer} | ${String(t.eventId??'').replace(/\d{3,}/g,'#')}`;agg.set(k,(agg.get(k)??0)+t.amount);}
    console.log(`  ${title}（${rows.length} 笔，合计 ${rows.reduce((n,t)=>n+t.amount,0)}）`);
    for(const [k,v] of [...agg].sort((a,b)=>b[1]-a[1]))console.log(`    ${String(v).padStart(6)}  ${k}`);
}
async function step(s,minutes,tag){
    const out=await s.engine.reduce(s.doc,{tool:'world_time',args:{minutes},eventId:`${tag}-${s.doc.state.minute}-${minutes}`});
    s.doc=applyPatches(s.doc,out.patches);return out;
}

// ---------------- 1. bounty ----------------
const B={victim:'npc_hw_linsui',guard:'npc_hw_gucen',judge:'npc_hw_chenbai',hunter:'npc_hw_wushuo',ypGuard:'npc_yp_renbo',ypOfficer:'npc_yp_lisha',court:'bld_hw_council'};
const bountyMoney=c=>c.state.player.coins+Object.values(c.state.npcs).reduce((n,a)=>n+(a.coins??0),0)+Object.values(c.state.records).filter(r=>["legal_treasury","legal_deposit"].includes(r.category)).reduce((n,r)=>n+r.coins,0)+Object.values(c.state.records).filter(r=>r.category==="money_account").reduce((n,r)=>n+(r.coins??0),0);
const counters=d=>Object.values(d.state.records).filter(r=>r.category==='money_account'&&r.coins).map(r=>`${r.account.split('|')[0]}=${r.coins}`).join('；')||'无';
async function bountyFixture({randomSeed,minute=600,caseMinute=600}={}){
    const {victim,guard,judge,hunter,ypGuard,ypOfficer,court}=B;
    const {shopStores}=await import('../server-plugin/shop.mjs');
    const w=structuredClone(source);
    for(const n of w.npcs){delete n.schedule;if(n.id!==hunter)delete n.tier;}
    w.npcs.find(n=>n.id===hunter).schedule={default:[{start:0,end:1440,location:'loc_hw_northwood',activity:'巡山',services:[]}]};
    const engine=new WorldEngine(w);const doc=engine.createCharacter(seed,{},'bounty-test');
    if(randomSeed)doc.randomSeed=randomSeed;
    doc.state.minute=minute;doc.state.location='loc_bs';doc.state.player.coins=500;
    for(const shop of shopStores(w))for(const row of shop.restock){const bag=doc.state.npcs[shop.keeper].inventory,old=bag[row.item];bag[row.item]=typeof old==='object'?{...old,quantity:row.maximum}:row.maximum;}
    for(const id of Object.keys(doc.state.npcs))doc.state.npcs[id]={...doc.state.npcs[id],location:'loc_capital',activity:'休息',status:'正常'};
    const place=(id,location,activity='当值')=>{doc.state.npcs[id]={...doc.state.npcs[id],location,activity,status:'正常',coins:doc.state.npcs[id].coins??0};};
    place(victim,'bld_hw_qingdeng','营业');doc.state.npcs[victim].coins=200;
    place(guard,'loc_hw_gate');place(judge,court);place(hunter,'loc_hw_northwood','巡山');place(ypGuard,'loc_bs_yupo','巡看');place(ypOfficer,'bld_yp_hall');
    const caseId='legal_case:t_theft';
    doc.state.records[caseId]={category:'legal_case',id:caseId,law:'law_hw_property',procedureVersion:1,settlement:'loc_hw',offender:'player',victim,offense:'theft',value:10,stolen:{coins:10},
        location:'bld_hw_qingdeng',minute:caseMinute,status:'已裁定',reported:true,receiver:guard,reportedAt:caseMinute,evidence:[],
        judgment:{judge,minute:caseMinute,fine:20,compensation:10,evidenceScore:2,communityMinutes:600,prisonMinutes:1200}};
    return {engine,doc};
}
const holders=d=>{const o={player:d.state.player.coins};for(const [id,n] of Object.entries(d.state.npcs))o[id]=n.coins??0;for(const [k,r] of Object.entries(d.state.records))if(['legal_treasury','legal_deposit'].includes(r.category))o[k]=r.coins;for(const [k,r] of Object.entries(d.state.settlements??{}))o[`settle:${k}`]=r.treasury??0;return o;};
async function report(s,m,tag,total,prev){
    startTrace();await step(s,m,tag);
    table(coinTrace(),`${tag}（推进 ${m} 分钟）账本钱流`);
    const now=holders(s.doc),diffs=[];
    for(const k of new Set([...Object.keys(prev),...Object.keys(now)])){const dlt=(now[k]??0)-(prev[k]??0);if(dlt)diffs.push(`${k}:${dlt>0?'+':''}${dlt}`);}
    console.log(`    持有人旧字段变动：${diffs.join('  ')||'无'}`);
    console.log(`    测试口径 money() = ${bountyMoney(s.doc)}（与基准差 ${bountyMoney(s.doc)-total}）；专用柜台账户：${counters(s.doc)}`);
    return now;
}
async function bounty(){
    // 测试1（test:46-59）
    const s=await bountyFixture();const total=bountyMoney(s.doc);
    console.log(`[bounty 测试1] 开场 money()=${total}；专用柜台账户：${counters(s.doc)}`);
    let prev=holders(s.doc);
    prev=await report(s,2*DAY,'段1',total,prev);prev=await report(s,DAY,'段2',total,prev);
    const L=s.doc.ledger,{legacyMoney}=await import('../server-plugin/money.mjs');
    const lm=legacyMoney(s.engine,s.doc.state),bad=[];
    for(const k of new Set([...lm.keys(),...Object.keys(L.accounts)]))if(k.includes(COINS)&&(lm.get(k)??0)!==(L.accounts[k]??0))bad.push(`${k}: 旧字段 ${lm.get(k)??0} / 账本 ${L.accounts[k]??0}`);
    console.log(`  账本漂移 ${JSON.stringify(L.driftTally??{})}；账本与旧字段不一致账户：${bad.length?bad.join('；'):'无'}`);
    // 全账本守恒：账户合计 = 源流出 - 汇流入
    const {auditLedger}=await import('../server-plugin/ledger.mjs');console.log(`  auditLedger: ${JSON.stringify(auditLedger(L))}`);
    // 测试3（test:92-117）：同一夹具，先推 1 天再取基准，之后每天对比
    console.log('[bounty 测试3 后半段] 范围内追捕，基准取"issue"一天之后');
    for(let sd=0;sd<30;sd++){
        const g=await bountyFixture({randomSeed:`bounty-hunt-${sd}`,caseMinute:600-3*DAY});g.doc.state.location='loc_hw_fields';
        await step(g,DAY,'issue');const base=bountyMoney(g.doc);let pv=holders(g.doc),caught=false;
        console.log(`  seed ${sd}: 基准 ${base}；柜台 ${counters(g.doc)}`);
        for(let day=0;day<7&&!caught;day++){
            pv=await report(g,DAY,`seed${sd}-day${day}`,base,pv);
            caught=Object.values(g.doc.state.records).some(r=>r.category==='legal_custody'&&r.reason==='到案'&&r.status==='生效');
        }
        if(caught){console.log(`  seed ${sd} 追获，停在这里（测试断言在押到法院之后，见下）`);
            const lock=Object.values(g.doc.state.records).find(r=>r.category==='legal_custody'&&r.reason==='到案'&&r.status==='生效');
            pv=await report(g,lock.expires-g.doc.state.minute,'押送',base,pv);break;}
    }
}

// ---------------- 2. s3-probe-integration（R2-E3 义务子项） ----------------
// 与 tests/s3-probe-integration.test.mjs:28-35 同一前置：invest 20 股 → 记利润 → 取 netAssets → 现金清零 → 记欠薪 20 → 再取 netAssets。
// 分项：现金（账本读 / 旧字段）、库存估值（逐物品：数量、单价、稀缺度、供给、需求）、负债。
async function s3(){
    const F=await import('../tests/helpers/finance.mjs');
    const {netAssets}=await import('../server-plugin/finance-assets.mjs');
    const {settleEmploymentPay}=await import('../server-plugin/labor-market.mjs');
    const {obligationRows,obligationView}=await import('../server-plugin/obligation-state.mjs');
    const {marketQuote,quoteSupply,saleableStock}=await import('../server-plugin/market.mjs');
    const {regionalTradeBase}=await import('../server-plugin/settlement-trade.mjs');
    const {partyAccount,coinRead}=await import('../server-plugin/money.mjs');
    const {priceRead}=await import('../server-plugin/stock.mjs');
    const {host,worker,DAY:D}=F;
    const f=F.fixture();
    await f.act({operation:'invest',seller:host,quantity:20,consent:true},'pharmacy-equity');
    f.doc.state.records[`finance_profit:${host}`]={category:'finance_profit',issuer:host,net:1000};
    const parts=(d,label)=>{
        const e=f.e,actor=d.get(...e.actorPath(host)),state=d.get('state'),location=actor.location;
        const legacyCash=actor.coins,ledgerCash=d.get('ledger','accounts',partyAccount(e,state,host))??null;
        const goods=actor.inventory??{},rows=[];let stock=0;
        for(const [item,v] of Object.entries(goods)){
            const q=typeof v==='number'?v:v.quantity??0;if(!q||!e.byId.has(item)||!e.byId.get(item).basePrice)continue;
            const proj=marketQuote(d,e,{item,location,seller:host,quantity:q,base:regionalTradeBase(d,e,item,location)});
            const unit=proj.explanation.value.value;stock+=q*unit;
            rows.push({item,q,unit:+unit.toFixed(4),scarcity:+proj.explanation.scarcity.toFixed(4),supply:proj.supply,demand:+Number(proj.demand).toFixed(3)});
        }
        const debt=obligationRows(state).filter(r=>r.debtor===host).reduce((n,r)=>n+obligationView(state,r).owed,0);
        const net=netAssets(d,e,host);
        console.log(`  [${label}] netAssets=${net}  = max(1, 现金(账本)${ledgerCash} [旧字段 ${legacyCash}] + 库存估值 ${stock.toFixed(3)} - 负债 ${debt})`);
        for(const r of rows)console.log(`      库存 ${r.item} x${r.q} 单价 ${r.unit} 稀缺度 ${r.scarcity} 供给 ${r.supply} 需求 ${r.demand}`);
        const sup=quoteSupply(d,e,{item:'item_bread',location});
        for(const r of sup.rows.filter(r=>r.owner===host))console.log(`      持有人自己的面包行(budgetStock)：stock ${r.stock} retained ${r.retained} upkeep ${r.upkeep??0} committed ${r.committed} available ${r.available}`);
        const who=[];
        for(const id of ['player',...Object.keys(state.npcs)]){const row=saleableStock(d,e,id,'item_bread');
            if(row&&(row.retained||row.committed))who.push(`${id}: stock ${row.stock} retained ${row.retained} upkeep ${row.upkeep??0} committed ${row.committed}`);}
        console.log(`      各人对面包的 retained/committed 贡献：${who.join(' | ')||'无'}`);
        console.log(`      同聚落面包全部供给行 ${sup.rows.length} 行：供给 ${sup.supply}，需求 ${sup.demand}`);
        return {net,stock,rows,ledgerCash,legacyCash,debt};
    };
    console.log('[s3-probe-integration]');
    const d0=f.draft();const A=parts(d0,'前：注资后');d0.done();
    // 二分：只清零旧字段现金（不记欠薪）时，别人的口粮留存是否变？
    {const f2=F.fixture();await f2.act({operation:'invest',seller:host,quantity:20,consent:true},'pharmacy-equity');
     const read=(doc)=>{const dd=f2.draft();const o=['player',...Object.keys(doc.state.npcs)].map(id=>`${id.replace('npc_hw_','')}:${saleableStock(dd,f2.e,id,'item_bread').retained}`).join(' ');dd.done();return o;};
     console.log(`  [二分] 基线 retained：${read(f2.doc)}`);
     f2.doc.state.npcs[host].coins=0;console.log(`  [二分] 仅把 ${host} 旧字段现金设 0：${read(f2.doc)}`);
     {const keep=f2.doc.ledger.accounts[partyAccount(f2.e,f2.doc.state,host)];f2.doc.ledger.accounts[partyAccount(f2.e,f2.doc.state,host)]=0;
      const dd=f2.draft();const n0=netAssets(dd,f2.e,host);dd.done();
      console.log(`  [二分] 旧字段与账本同时清零（真实的现金清零）：${read(f2.doc)}；netAssets(host)=${n0}`);f2.doc.ledger.accounts[partyAccount(f2.e,f2.doc.state,host)]=keep;}
     f2.doc.state.npcs[host].coins=637;f2.doc.state.npcs[worker].coins=0;console.log(`  [二分] 改为仅把 worker 现金设 0：${read(f2.doc)}`);
     f2.doc.state.npcs[worker].coins=500;f2.doc.state.player.coins=0;console.log(`  [二分] 改为仅把 玩家 现金设 0：${read(f2.doc)}`);
     f2.doc.state.player.coins=3000-0;
     const dj=f2.draft(),jb={id:'pharmacy-job',category:'contract',kind:'workshop',owner:host,worker,wage:20,location:f2.doc.state.location,createdAt:0,starts:0,deadline:30*D,status:'有效',paid:0,workedMinutes:0};
     dj.set(['state','records',jb.id],jb);dj.done();console.log(`  [二分] 仅登记雇佣合同(未结算)：${read(f2.doc)}`);
     const dk=f2.draft();settleEmploymentPay(dk,f2.e,jb,600,480);dk.done();console.log(`  [二分] 再结算工钱(记欠薪，host 现金账本不足以立即付?)：${read(f2.doc)}；host 旧字段现金 ${f2.doc.state.npcs[host].coins}，账本 ${f2.doc.ledger.accounts[partyAccount(f2.e,f2.doc.state,host)]}`);
     const tk=Object.values(f2.doc.state.records).filter(r=>r.category==='contract'||r.kind==='wage').map(r=>`${r.id??'?'}:${r.category}/${r.kind}`).slice(0,6);console.log(`  [二分] 记录：${tk.join(' ')}`);}
    {const {moveCoins,purse,sink,mirrorPartyCoins}=await import('../server-plugin/money.mjs');
     const broke=f.draft(),have=f.doc.state.npcs[host].coins;moveCoins(broke,{from:purse(f.e,host),to:sink('export','travel'),amount:have,writer:'shop',eventId:'clear-cash'});mirrorPartyCoins(broke,f.e,host,-have,'clear-cash','shop');broke.done();
     console.log(`  正式入口清零：旧字段 ${f.doc.state.npcs[host].coins}，账本 ${f.doc.ledger.accounts[purse(f.e,host)]??0}`);}
    const d=f.draft(),job={id:'pharmacy-job',category:'contract',kind:'workshop',owner:host,worker,wage:20,location:f.doc.state.location,createdAt:0,starts:0,deadline:30*D,status:'有效',paid:0,workedMinutes:0};
    d.set(['state','records',job.id],job);const earned=settleEmploymentPay(d,f.e,job,600,480);console.log(`  settleEmploymentPay 欠薪 ${earned.arrears}`);d.done();
    const q=f.draft();const B=parts(q,'后：旧字段现金清零 + 欠薪 20');
    console.log(`  结论数字：net ${A.net} -> ${B.net}；Δ现金(账本) ${B.ledgerCash-A.ledgerCash}；Δ库存估值 ${(B.stock-A.stock).toFixed(3)}；Δ负债 ${B.debt-A.debt}`);
    q.done();
}

// ---------------- 3. npc-life-migration（缺粮谋生：财产随身） ----------------
// 与 tests/npc-life-migration.test.mjs:89-135 同一前置（fixture/hungry/夹具赋值/会面与付款约定），
// 每 60 分钟一步推进到抵达，打印迁居者 coins 的时间线与每笔涉及迁居者的钱流（来源、去向、写入者、事件）。
async function migration(){
    const mover='npc_hw_xuling',host='npc_yp_fengya',friend='npc_hw_taozhi',fromHome='bld_hw_riverhome',toHome='bld_yp_home_21',shop='bld_hw_herbs',away='bld_yp_kitchen';
    const start=10*DAY+600,firstNight=11*DAY;
    const tie=(a,b,type='旧友')=>({with:b,type,trust:60,affection:50});
    const world=structuredClone(source),find=id=>world.npcs.find(n=>n.id===id),life=world.rules.npcLife;
    delete world.rules.householdSubsistence;
    life.health={...life.health,bands:[{fromAge:0,illnessPerYear:0,graveShare:0,suddenDeathPerYear:0}]};
    const m0=life.migration;
    life.migration={...m0,stranger:undefined,livelihood:{...m0.livelihood,chancePerDay:1},refuge:{...m0.refuge,chancePerDay:1}};
    find(mover).schedule={default:[{start:0,end:480,location:fromHome,activity:'睡眠',services:[]},{start:480,end:1080,location:shop,activity:'在药铺帮手、教人认药',services:['teach']},{start:1080,end:1440,location:fromHome,activity:'歇息',services:[]}]};
    find(mover).relationships.push(tie(mover,host));find(host).relationships.push(tie(host,mover));
    const engine=new WorldEngine(world),doc=engine.createCharacter(seed,{name:'试'},'npc-migration-test');
    doc.state.minute=start;doc.state.location='loc_bs_liquan';
    for(const row of Object.values(doc.state.records))if(Number.isSafeInteger(row.lastDay))row.lastDay=Math.floor(start/DAY)-1;
    for(const row of Object.values(doc.state.settlements))row.starvation=-100;
    Object.assign(doc.state.npcs[mover],{location:shop,activity:'在药铺帮手、教人认药'});Object.assign(doc.state.npcs[friend],{location:shop});Object.assign(doc.state.npcs[host],{location:away});
    doc.state.settlements.loc_hw.starvation=5;
    Object.assign(doc.state.npcs[mover],{coins:57,inventory:{[source.items[0].id]:Number(process.env.RATIONS??2),...JSON.parse(process.env.EXTRA??"{}")}});
    const s={engine,doc},npc=id=>s.doc.state.npcs[id],moves=()=>Object.values(s.doc.state.family?.migrations??{});
    console.log(`[migration] 开场 迁居者 coins=${npc(mover).coins}，库存 ${JSON.stringify(npc(mover).inventory)}（item[0]=${source.items[0].id}）`);
    // 第一段按小时推进：迁居预告出现之前的购粮也记录
    startTrace();let lastA=npc(mover).coins;const pre=[];
    while(s.doc.state.minute<firstNight+1){
        const to=Math.min(firstNight+1,s.doc.state.minute+60);await step(s,to-s.doc.state.minute,'a');
        const mine=coinTrace().filter(t=>t.from.startsWith(mover+'|')||t.to.startsWith(mover+'|'));globalThis.__LEDGER_TRACE__=[];
        if(mine.length||npc(mover).coins!==lastA){console.log(`  t=${s.doc.state.minute}（${((s.doc.state.minute-start)/60).toFixed(1)}h，位置 ${npc(mover).location??'途中'}，活动 ${npc(mover).activity}）coins ${lastA} -> ${npc(mover).coins}`);for(const t of mine){pre.push(t);console.log(`      ${t.amount} 铜  ${t.from} -> ${t.to}  [${t.writer}] ${t.eventId??''}`);}}
        lastA=npc(mover).coins;
    }
    const [m]=moves();
    const meeting=(id,{with:other=friend,location=shop,at})=>{s.doc.state.obligations[id]={id,reservationVersion:1,type:'会面',promisor:mover,promisee:other,content:'一起理一遍药柜',location,start:at,deadline:at+60,departures:{[mover]:at,[other]:at},createdAt:start,status:'待履行',attendance:{[mover]:0,[other]:0},togetherMinutes:0};};
    meeting('obl_road',{at:m.departAt+600});meeting('obl_old',{at:m.departAt+6*DAY});meeting('obl_new',{with:host,location:toHome,at:m.departAt+8*DAY});
    s.doc.state.obligations.migration_payment={id:'migration_payment',type:'付款',promisor:mover,promisee:friend,coins:5,start:m.departAt+600,deadline:m.departAt+30*DAY,status:'待履行',location:shop};
    console.log(`  预告 departAt=${m.departAt}（开场后 ${(m.departAt-start)/60} 小时）；migration_payment 5 铜自 ${m.departAt+600} 起可履行`);
    let go=null,last=npc(mover).coins;const all=[];let atDepart=null;
    startTrace();
    for(let guard=0;guard<2000;guard++){
        const st=s.doc.state.family.migrations[m.id];
        if(st.status==='已抵达'){go=st;break;}
        await step(s,60,'m');
        if(!atDepart&&s.doc.state.minute>=m.departAt+1)atDepart={minute:s.doc.state.minute,coins:npc(mover).coins,inventory:structuredClone(npc(mover).inventory),status:s.doc.state.family.migrations[m.id].status};
        const c=npc(mover).coins;
        const mine=coinTrace().filter(t=>t.from.startsWith(mover+'|')||t.to.startsWith(mover+'|'));
        globalThis.__LEDGER_TRACE__=[];
        if(mine.length||c!==last){console.log(`  t=${s.doc.state.minute}（${(s.doc.state.minute-start)/60}h）${st.status} coins ${last} -> ${c}`);for(const t of mine){all.push(t);console.log(`      ${t.amount} 铜  ${t.from} -> ${t.to}  [${t.writer}] ${t.eventId??''}`);}}
        last=c;
    }
    all.unshift(...pre);
    const fin=s.doc.state.family.migrations[m.id];
    console.log(`  抵达 status=${fin.status} arrivedAt=${fin.arrivedAt} routeCost=${fin.routeCost} routeMinutes=${fin.routeMinutes}；迁居者 coins=${npc(mover).coins}（开场 57，差 ${npc(mover).coins-57}）`);
    table(all,'迁居者全程钱流');
    console.log(`  出发后快照(t=${atDepart?.minute}，${atDepart?.status})：coins ${atDepart?.coins}，库存 ${JSON.stringify(atDepart?.inventory)}；抵达时 coins ${npc(mover).coins}，库存相等=${JSON.stringify(atDepart?.inventory)===JSON.stringify(npc(mover).inventory)}`);
    console.log(`  库存 ${JSON.stringify(npc(mover).inventory)}；migration_payment 状态 ${s.doc.state.obligations.migration_payment.status}（5 铜付款是否已履行）`);
}

const jobs={bounty,s3,migration};
for(const [name,fn] of Object.entries(jobs))if(which===name||which==='all')await fn();
