// 只读诊断探针：逐笔查清“F026 客流：玩家开店营业一天……”测试里店主（林穗）钱袋从 721 分到午夜后的增量来源。
// 场景复刻自 tests/s5-w4-economy.test.mjs（不 import 测试文件）：
//   夹具 openShop：第 224-240 行；推进函数 toBeforeNoon / waitPastMidnight：第 242-243 行；
//   场景参数（钱袋 A=40,B=40,D=200,E=3；B 存粮面包 2）：第 318-324 行；取 721 快照：第 330-331 行；终态 = waitPastMidnight 推进后（第 332 行）。
// 钱流取自账本调试钩子 globalThis.__LEDGER_TRACE__（ledger.mjs:217，transfer 每笔一条），这里换成带调用栈的记录器。
// 不写盘、不联网、不调模型。用法：node tools/coin86-probe.mjs   （输出 JSON 到标准输出）
import fs from 'node:fs/promises';
import {loadWorld} from './load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {applyIntentSetup} from './a3-score.mjs';
import {purse} from '../server-plugin/money.mjs';

const DAY=1440,KEEPER='npc_hw_linsui',PLACE='bld_hw_qingdeng';
const [A,B,C,D,E]=['npc_hw_xuling','npc_hw_wushuo','npc_hw_anhuai','npc_hw_yanzhe','npc_hw_taozhi'];
const world=await loadWorld(),seed=JSON.parse(await fs.readFile(new URL('../tests/fixtures/legacy/seed.json',import.meta.url),'utf8'));

async function openShop({coins,bread,campaignSeed='w4-flow'}){
    const landlord=KEEPER,place=PLACE;
    const engine=new WorldEngine(structuredClone(world)),initial=engine.createCharacter(seed,{},campaignSeed);
    const facts=Object.keys(initial.state.npcs).filter(id=>id!==landlord).map(id=>({path:['state','npcs',id,'coins'],value:coins[id]??0}));
    for(const [id,quantity] of Object.entries(bread))facts.push({path:['state','npcs',id,'inventory'],value:{item_bread:{quantity,quality:'木'}}});
    const prepared=applyIntentSetup(engine,initial,{minute:600,location:place,coins:300,inventory:{item_bread:5,item_parchment:1},present:[landlord],abilitiesByActor:{player:{skills:{skill_literacy:500}}},facts});
    if(prepared.setupUnmet.length)throw Error('setupUnmet '+JSON.stringify(prepared.setupUnmet));
    const f={engine,document:prepared.document};
    f.act=async(action,slots,id)=>{const out=await engine.reduce(f.document,{tool:'world_act',args:{action,slots},eventId:id});f.document=applyPatches(f.document,out.patches);return out.result;};
    const leased=await engine.reduce(f.document,{tool:'world_trade',args:{operation:'lease',seller:landlord,consent:true,days:2},eventId:'w4-lease'});
    f.document=applyPatches(f.document,leased.patches);f.business=leased.result.business;
    await f.act('business:open_counter',{business:f.business,coins:100},'w4-counter');
    await f.act('core:settlement.business_open',{business:f.business},'w4-open');
    return f;
}
const advance=async(f,minutes,id)=>{const out=await f.engine.reduce(f.document,{tool:'world_time',args:{minutes},eventId:id});f.document=applyPatches(f.document,out.patches);};

// 快照：旧字段 coins（玩家、全部 NPC）、柜台账户、账本里全部 coin_river 账户之和与源汇流量。
function snap(f){
    const s=f.document.state,npcs={};
    for(const [id,n] of Object.entries(s.npcs??{}))npcs[id]=n.coins??0;
    const counters=Object.values(s.records??{}).filter(r=>r.category==='money_account'&&r.purpose==='counter').map(r=>({account:r.account,owner:r.owner,coins:r.coins}));
    const accounts=f.document.ledger?.accounts??{},coinAccounts={};let total=0;
    for(const [k,n] of Object.entries(accounts))if(k.split('|')[1]==='coin_river'){coinAccounts[k]=n;total+=n;}
    let sources=0,sinks=0;
    for(const [k,n] of Object.entries(f.document.ledger?.flows??{})){const [o,r]=k.split('|');if(r!=='coin_river')continue;if(o.startsWith('src:'))sources+=n;else if(o.startsWith('sink:'))sinks+=n;}
    return {minute:s.minute,player:s.player.coins,npcs,counters,ledgerCoinTotal:total,ledgerSources:sources,ledgerSinks:sinks,coinAccounts};
}
const keeperKey=purse(null,KEEPER);

const f=await openShop({coins:{[A]:40,[B]:40,[D]:200,[E]:3},bread:{[B]:2}});
{const m=f.document.state.minute%DAY;if(m<719)await advance(f,719-m,'w4-to-noon');}
await advance(f,2,'w4-after-noon');
const at721=snap(f);

// 记录器：只记 721 之后；调用栈取前两个 server-plugin 帧（跳过 ledger/money 自身）。
const rows=[];
globalThis.__LEDGER_TRACE__={push(t){
    const frames=(new Error().stack??'').split('\n').filter(l=>l.includes('server-plugin')&&!/server-plugin[\/](ledger|money)\.mjs/.test(l)).slice(0,2).map(l=>l.trim().replace(/file:\/\/\/.*server-plugin\//,'server-plugin/'));
    rows.push({from:t.from,to:t.to,amount:t.amount,writer:t.writer,eventId:t.eventId,frames});
},get length(){return rows.length;}};
{const m=f.document.state.minute;await advance(f,DAY-(m%DAY)+30,'w4-day');}
globalThis.__LEDGER_TRACE__=undefined;
const final=snap(f);

const diff=(a,b)=>Object.fromEntries(Object.keys({...a,...b}).map(k=>[k,{at721:a[k]??0,final:b[k]??0,delta:(b[k]??0)-(a[k]??0)}]));
const keeperRows=rows.filter(r=>r.from===keeperKey||r.to===keeperKey);
const keeperIn=keeperRows.filter(r=>r.to===keeperKey).reduce((n,r)=>n+r.amount,0),keeperOut=keeperRows.filter(r=>r.from===keeperKey).reduce((n,r)=>n+r.amount,0);
const coinRows=rows.filter(r=>String(r.from).split('|')[1]==='coin_river');
console.log(JSON.stringify({
    scenario:{keeper:KEEPER,coinsFact:{[A]:40,[B]:40,[D]:200,[E]:3},minuteSnapshot:at721.minute,minuteFinal:final.minute},
    '①':{player:{at721:at721.player,final:final.player,delta:final.player-at721.player},npcs:diff(at721.npcs,final.npcs),counters:{at721:at721.counters,final:final.counters}},
    '②keeperTransfers':keeperRows.map(r=>({eventId:r.eventId,from:r.from,to:r.to,amount:r.amount,writer:r.writer,frames:r.frames})),
    '③':{keeperIn,keeperOut,keeperNet:keeperIn-keeperOut,keeperLegacyDelta:final.npcs[KEEPER]-at721.npcs[KEEPER],keeperNetEquals86:keeperIn-keeperOut===86,
        allCoinTransfersCount:coinRows.length,ledgerCoinTotal:{at721:at721.ledgerCoinTotal,final:final.ledgerCoinTotal,delta:final.ledgerCoinTotal-at721.ledgerCoinTotal},
        sourcesDelta:final.ledgerSources-at721.ledgerSources,sinksDelta:final.ledgerSinks-at721.ledgerSinks,
        conserved:(final.ledgerCoinTotal-at721.ledgerCoinTotal)===((final.ledgerSources-at721.ledgerSources)-(final.ledgerSinks-at721.ledgerSinks)),
        legacyNpcPlusPlayerDelta:Object.values(final.npcs).reduce((a,b)=>a+b,0)+final.player-Object.values(at721.npcs).reduce((a,b)=>a+b,0)-at721.player},
},null,1));
