// S1 指标库骨架（数值平衡调研 §3.3 “指标的计算口径”，数值方案 §4.2）：
// 对一份存档文档（{state, ledger}）计算平衡指标的纯函数，输出 JSON。同一输入同一输出，不读时钟、不改文档。
// 已接入现有数据能算的几项：货币总量与源汇分项、价格指数、家户钱袋基尼、技能阶人数分布、名额计数、等级分布、物种存量；
// 其余指标登记在 METRICS 里标 todo（写明缺什么数据、对应哪条目标），随各迁移阶段补全。
// 战斗胜率由 tools/balance-combat.mjs 提供（竞技场第一版）：这里只登记位置，需要时用 --combat 调用，不改它的行为。
//
// 用法：node tools/balance-metrics.mjs <存档文档.json> [--world <世界根>] [--only 指标id,指标id] [--combat] [--list]
//   存档文档可以是裸文档 {state, ledger}，也可以是 CampaignStorage.read 的结果（取其 document）。
import fs from 'node:fs';
import path from 'node:path';
import {parseAccount,isSource,isSink,LEDGER_COIN} from '../server-plugin/ledger.mjs';
import {parameterHash,balanceValue} from './balance-tables.mjs';

export const METRICS_FORMAT='balance-metrics@1';
const DAY=1440;
const TIER_NAMES=['初级','中级','高级','特级','专家','大师','宗师','圣级','神级'];
const TIER_WIDTH=300,PRACTITIONER_FLOOR=100;
const LEVEL_STEPS=[10,30,60,90,120,150,180];

// ---- 纯统计函数（导出以便测试与 BalSim 复用）---------------------------------
const round=(n,digits=6)=>Number.isFinite(n)?Number(n.toFixed(digits)):null;
export function median(values){
 if(!values.length)return null;
 const s=[...values].sort((a,b)=>a-b),m=s.length>>1;
 return s.length%2?s[m]:(s[m-1]+s[m])/2;
}
// 基尼系数 G = Σᵢ Σⱼ |xᵢ − xⱼ| ÷ (2n²μ)；全零或空返回 null。
export function gini(values){
 const n=values.length,total=values.reduce((a,b)=>a+b,0);
 if(!n||total<=0)return null;
 const s=[...values].sort((a,b)=>a-b);
 let weighted=0;s.forEach((x,i)=>{weighted+=(i+1)*x;});
 return (2*weighted)/(n*total)-(n+1)/n;
}
// 洛伦兹曲线（累计人口 → 累计财富份额）与前 share 比例的份额。
export function lorenz(values,points=10){
 const s=[...values].sort((a,b)=>a-b),total=s.reduce((a,b)=>a+b,0);
 if(!s.length||total<=0)return null;
 const out=[];let run=0,k=0;
 for(let p=1;p<=points;p++){const upto=Math.round(s.length*p/points);while(k<upto)run+=s[k++];out.push([p/points,round(run/total)]);}
 return out;
}
export function topShare(values,share){
 const s=[...values].sort((a,b)=>b-a),total=s.reduce((a,b)=>a+b,0);
 if(!s.length||total<=0)return null;
 const k=Math.max(1,Math.ceil(s.length*share));
 return round(s.slice(0,k).reduce((a,b)=>a+b,0)/total);
}
// 通胀率 π = 价格指数的年对数变化；series 为按日排序的 [{day, index}]，至少两点。
export function inflationRate(series){
 if(!Array.isArray(series)||series.length<2)return null;
 const a=series[0],b=series.at(-1),days=b.day-a.day;
 if(days<=0||a.index<=0||b.index<=0)return null;
 return round(Math.log(b.index/a.index)/(days/360));
}
export const tierOf=proficiency=>Math.min(TIER_NAMES.length-1,Math.max(0,Math.floor(proficiency/TIER_WIDTH)));

// ---- 取数 ---------------------------------------------------------------------
const stateOf=document=>document?.state??{};
const ledgerOf=document=>document?.ledger??null;
const proficiencyOf=v=>typeof v==='object'&&v!==null?(v.proficiency??0):(Number.isFinite(v)?v:0);
// 一个人物的各技能熟练度：存档里的成长优先，其次世界数据（与 npc-growth.npcProficiency 同序）。
function npcSkills(state,npc){
 const out=new Map();
 const take=map=>{if(map&&typeof map==='object'&&!Array.isArray(map))for(const [skill,v] of Object.entries(map))if(!out.has(skill))out.set(skill,proficiencyOf(v));};
 take(state.npcs?.[npc.id]?.skills);take(npc.skills);take(npc.proficiencies);
 return out;
}
const levelOf=(state,npc)=>state.npcs?.[npc.id]?.level??npc.level;
const purseOwner=key=>{try{const a=parseAccount(key);return a.resource===LEDGER_COIN&&a.purpose==='purse'?a.owner:null;}catch{return null;}};

// ---- 指标实现：compute(ctx) → 值；缺数据时抛 Unavailable（登记为 unavailable，不当作 0）-------------
class Unavailable extends Error{}
const need=(cond,why)=>{if(!cond)throw new Unavailable(why);};

function moneyTotal({document}){
 const ledger=ledgerOf(document);need(ledger?.accounts,'存档没有账本（ledger 分区未开）');
 const byResource={};
 const row=r=>byResource[r]??={accounts:0,accountCount:0,sources:0,sinks:0};
 for(const [key,n] of Object.entries(ledger.accounts)){const a=parseAccount(key),r=row(a.resource);r.accounts+=n;r.accountCount++;}
 for(const [key,n] of Object.entries(ledger.flows??{})){const a=parseAccount(key),r=row(a.resource);if(isSource(a.owner))r.sources+=n;else if(isSink(a.owner))r.sinks+=n;}
 for(const r of Object.values(byResource))r.conserved=r.accounts===r.sources-r.sinks;
 const byPurpose={};
 for(const [key,n] of Object.entries(ledger.accounts)){const a=parseAccount(key);if(a.resource===LEDGER_COIN)byPurpose[a.purpose]=(byPurpose[a.purpose]??0)+n;}
 const coin=byResource[LEDGER_COIN]??{accounts:0,accountCount:0,sources:0,sinks:0,conserved:true};
 return {resource:LEDGER_COIN,total:coin.accounts,byPurpose:Object.fromEntries(Object.entries(byPurpose).sort(([a],[b])=>a<b?-1:1)),accountCount:coin.accountCount,conserved:coin.conserved,byResource:Object.fromEntries(Object.entries(byResource).sort(([a],[b])=>a<b?-1:1)),
  note:'活跃口径（按 money.activeWindow 窗口）与全部口径各一、按法域按铸币分种：todo，待 S1 铸币分种与流通存量活跃口径'};
}
function moneyFlows({document}){
 const ledger=ledgerOf(document);need(ledger?.flows,'存档没有账本（ledger 分区未开）');
 const rows=Object.entries(ledger.flows).map(([key,amount])=>{const a=parseAccount(key);return {flow:a.owner,resource:a.resource,purpose:a.purpose,direction:isSource(a.owner)?'source':'sink',amount};})
  .sort((x,y)=>x.flow<y.flow?-1:x.flow>y.flow?1:x.purpose<y.purpose?-1:x.purpose>y.purpose?1:0);
 const sum=dir=>rows.filter(r=>r.direction===dir&&r.resource===LEDGER_COIN).reduce((s,r)=>s+r.amount,0);
 return {coinSources:sum('source'),coinSinks:sum('sink'),rows,
  budgetRatio:'todo：每日预算（12 §12.8.3）按写入者的使用占比，待源汇预算读数接口'};
}
function priceIndex({document}){
 const records=Object.values(stateOf(document).records??{}).filter(r=>r?.category==='regional_quote'&&r.price>0&&r.basePrice>0);
 need(records.length,'存档没有区域报价记录（regional_quote）');
 const ratios=records.map(r=>r.price/r.basePrice),byItem={};
 for(const r of records){const e=byItem[r.item]??={n:0,sum:0};e.n++;e.sum+=r.price/r.basePrice;}
 return {n:records.length,mean:round(ratios.reduce((a,b)=>a+b,0)/ratios.length),median:round(median(ratios)),min:round(Math.min(...ratios)),max:round(Math.max(...ratios)),
  byItem:Object.fromEntries(Object.entries(byItem).sort(([a],[b])=>a<b?-1:1).map(([item,e])=>[item,{n:e.n,mean:round(e.sum/e.n)}])),
  basis:'区域报价 ÷ 基准价的算术均值；ppi 篮子（economy.json basket.weights）与按商品类分解：todo，待 15 §15.4 的篮子价值单位'};
}
function wealthGini({document,world}){
 const ledger=ledgerOf(document);need(ledger?.accounts,'存档没有账本（ledger 分区未开）');
 need(Array.isArray(world?.npcs),'需要世界数据（world.npcs）');
 const purses=new Map();
 for(const [key,n] of Object.entries(ledger.accounts)){const owner=purseOwner(key);if(owner!==null)purses.set(owner,(purses.get(owner)??0)+n);}
 // 人物首次动用钱款前不在账本里（旧字段 state.npcs[id].coins 未建），其钱款取世界数据 npc.coins；动过的以账本为准。
 const touched=stateOf(document).npcs??{};
 const cash=npc=>touched[npc.id]?(purses.get(npc.id)??0):(npc.coins??0);
 const housed=new Set(),units=[],byId=new Map(world.npcs.map(n=>[n.id,n]));
 for(const h of world.households??[]){let sum=0;for(const m of h.members??[]){housed.add(m);const npc=byId.get(m);if(npc)sum+=cash(npc);}units.push(sum);}
 let single=0;
 for(const npc of world.npcs)if(!housed.has(npc.id)){units.push(cash(npc));single++;}
 const player=purses.get('player')??null;
 return {households:units.length-single,singles:single,unitCount:units.length,gini:round(gini(units)),top1pct:topShare(units,0.01),lorenz:lorenz(units),playerPurse:player,
  basis:'不含玩家；家户财富 = 成员钱袋铜钱之和（动过钱款的取账本，没动过的取世界数据 coins；财富 = 账户 + 持有的 value：todo，待 S2 持有与统一估值）'};
}
function skillTiers({document,world}){
 need(Array.isArray(world?.npcs),'需要世界数据（world.npcs）');
 const state=stateOf(document),overall=new Array(TIER_NAMES.length).fill(0),bySkill={};
 for(const npc of world.npcs)for(const [skill,p] of npcSkills(state,npc)){
  if(p<PRACTITIONER_FLOOR)continue;
  const t=tierOf(p);overall[t]++;(bySkill[skill]??=new Array(TIER_NAMES.length).fill(0))[t]++;
 }
 const practitioners=overall.reduce((a,b)=>a+b,0);
 return {tiers:TIER_NAMES,practitioners,counts:overall,shares:overall.map(n=>practitioners?round(n/practitioners):null),
  bySkill:Object.fromEntries(Object.entries(bySkill).sort(([a],[b])=>a<b?-1:1)),basis:`从业者 = 熟练度 ≥ ${PRACTITIONER_FLOOR} 的（人物, 技能）对；不含玩家；阶宽 ${TIER_WIDTH}`};
}
function seatHolders({document,world,tables}){
 need(Array.isArray(world?.npcs),'需要世界数据（world.npcs）');
 const state=stateOf(document),saintTier=7,divineTier=8,holders={};
 let level180=0;
 for(const npc of world.npcs){
  for(const [skill,p] of npcSkills(state,npc)){const t=tierOf(p);if(t>=saintTier)(holders[skill]??={saint:0,divine:0})[t>=divineTier?'divine':'saint']++;}
  if((levelOf(state,npc)??0)>=180)level180++;
 }
 const cap={saintPerSkill:balanceValue(tables??{},'seats.saint.perSkill',null),divinePerSkill:balanceValue(tables??{},'seats.divine.perSkill',null),level180:balanceValue(tables??{},'seats.level180.world',null)};
 const violations=[];
 for(const [skill,h] of Object.entries(holders)){
  if(cap.divinePerSkill!==null&&h.divine>cap.divinePerSkill)violations.push({kind:'divine',skill,holders:h.divine,cap:cap.divinePerSkill});
  if(cap.saintPerSkill!==null&&h.saint>cap.saintPerSkill)violations.push({kind:'saint',skill,holders:h.saint,cap:cap.saintPerSkill});
 }
 if(cap.level180!==null&&level180>cap.level180)violations.push({kind:'level180',holders:level180,cap:cap.level180});
 return {holders:Object.fromEntries(Object.entries(holders).sort(([a],[b])=>a<b?-1:1)),level180,cap,violations,
  basis:'NUM-P1 骨架：按 NPC 数据计数（玩家占名额、挂起与递补由名额规则在 S5 前后落地：todo）；上限读 learning.json 的 seats.*'};
}
function levelDistribution({document,world}){
 need(Array.isArray(world?.npcs),'需要世界数据（world.npcs）');
 const state=stateOf(document),levels=world.npcs.map(n=>levelOf(state,n)).filter(Number.isFinite);
 need(levels.length,'人物没有等级数据');
 const atLeast=Object.fromEntries(LEVEL_STEPS.map(step=>{const n=levels.filter(l=>l>=step).length;return [`>=${step}`,{count:n,share:round(n/levels.length)}];}));
 return {population:levels.length,median:median(levels),max:Math.max(...levels),atLeast,basis:'已建档人物（含老幼）的等级；目标口径是 3.5 万居民，已建档人物只是其子集'};
}
function speciesStock({document,world}){
 const records=Object.entries(stateOf(document).records??{}).filter(([key,r])=>key.startsWith('ecology:')&&r?.populations);
 need(records.length,'存档没有生态栖地记录（ecology:*）');
 const capacity=new Map((world?.monsters??[]).filter(m=>m.wildlife).map(m=>[m.id,m.wildlife.capacity]));
 const species={};
 for(const [,r] of records)for(const [id,p] of Object.entries(r.populations)){
  const e=species[id]??={count:0,habitats:0};e.count+=p.count??0;e.habitats++;
 }
 for(const [id,e] of Object.entries(species)){const k=capacity.get(id);e.authoredCapacity=k??null;e.stockRatio=k?round(e.count/(k*e.habitats)):null;}
 const ids=Object.keys(species).sort();
 return {speciesCount:ids.length,total:ids.reduce((s,id)=>s+species[id].count,0),species:Object.fromEntries(ids.map(id=>[id,species[id]])),extinct:ids.filter(id=>species[id].count<=0),
  basis:'N 取各栖地 populations.count 之和；K 取物种数据 wildlife.capacity（作者基线，运行期容量含林水等修正：todo）；stockRatio = N ÷ (K × 栖地数)'};
}

// ---- 登记表：全部指标，含 todo ------------------------------------------------
// status：implemented 已实现；partial 口径不全；registered 由别处实现、这里只登记位置；todo 待接。
export const METRICS=Object.freeze([
 {id:'money.total',title:'货币总量 M（按用途、按资源）与守恒',status:'implemented',targets:['BAL-M2','BAL-M4'],compute:moneyTotal},
 {id:'money.flows',title:'源汇分项流量',status:'implemented',targets:['BAL-M2'],compute:moneyFlows},
 {id:'price.index',title:'价格指数（区域报价 ÷ 基准价）',status:'partial',targets:['BAL-M2','BAL-E2'],compute:priceIndex,needs:['ppi 篮子价值单位（15 §15.4）','按商品类分解']},
 {id:'wealth.gini',title:'家户钱袋基尼、前 1% 份额、洛伦兹曲线',status:'partial',targets:['NUM-W8','BAL-Gini'],compute:wealthGini,needs:['持有的 value（S2）','阶层 × 地区分组（用户回复）']},
 {id:'skill.tierDistribution',title:'技能阶人数分布（不含玩家）',status:'implemented',targets:['NUM-P3','NUM-P2','BAL-G3'],compute:skillTiers},
 {id:'seats.holders',title:'名额计数：圣级、神级每技能持有人与 ≥180 级人数',status:'partial',targets:['NUM-P1'],compute:seatHolders,needs:['玩家占名额、挂起与递补（S5 前后）']},
 {id:'level.distribution',title:'等级分布（≥10、≥30、……、≥180）',status:'implemented',targets:['NUM-P3','NUM-P2'],compute:levelDistribution},
 {id:'species.stock',title:'物种存量 N 与 N ÷ K',status:'partial',targets:['BAL-Y1','BAL-Y3'],compute:speciesStock,needs:['运行期容量 K（林水修正）']},
 {id:'combat.winRate',title:'开发指南 3.3 胜率表（竞技场第一版）',status:'registered',targets:['BAL-F1','BAL-P1'],provider:{module:'tools/balance-combat.mjs',export:'balanceReport'},note:'tools/balance-combat.mjs 在 S1 登记为竞技场第一版，行为不变；--combat 时调用，不读 combat.json（收编为直接读该表：S1 后续）'},
 {id:'money.velocity',title:'货币流通速度 V = 期间成交额 ÷ 平均 M',status:'todo',targets:['BAL-M2'],needs:['成交额的时间序列（市场成交埋点）']},
 {id:'price.inflation',title:'通胀率 π = ppi 的年对数变化',status:'todo',targets:['BAL-M2'],needs:['价格指数的按月采样序列（BalSim 浸泡）'],note:'纯函数 inflationRate(series) 已实现并有测试，等序列'},
 {id:'household.incomeExpenseRatio',title:'家户收支比（按阶层 × 地区分组）',status:'todo',targets:['NUM-W6','NUM-W8','NUM-W10'],needs:['家户收入与支出流水','阶层 × 地区分组（用户 2026-10-16 回复：佃户紧、地主宽、城市平民中、官员好）']},
 {id:'wage.incomeVsTable',title:'实际收入 ÷ 收入表（各职业各阶中位数）',status:'todo',targets:['NUM-W1','NUM-W2','NUM-W3','BAL-W1'],needs:['职业收入流水（S5 劳务与浸泡）']},
 {id:'hunger.personDays',title:'缺餐人日',status:'todo',targets:['NUM-W7','BAL-W2'],needs:['口粮保障天数与缺餐事件']},
 {id:'population.rates',title:'粗出生率、粗死亡率、净迁移、抚养比',status:'todo',targets:['BAL-N1','BAL-N2'],needs:['出生与死亡事件计数（npcLife，S5）']},
 {id:'crime.rates',title:'凶杀率、财产犯罪率、报案率、定罪率、案件积压',status:'todo',targets:['NUM-J1','NUM-J2','NUM-J6'],needs:['案件与罪名事件（S4 法域）']},
 {id:'quest.reward',title:'任务报酬中位数与“发不出”比例',status:'todo',targets:['NUM-Q3','NUM-Q5','NUM-Q6'],needs:['任务派生报价（用户决定④）与发布记录']},
 {id:'growth.timeToLevel',title:'到达各级的全职日数',status:'todo',targets:['NUM-G1','NUM-G2','NUM-S1'],needs:['成长路线套件（A3）']},
]);
export const metricIds=()=>METRICS.map(m=>m.id);

// ---- 计算入口 --------------------------------------------------------------------
// document：{state, ledger}；options：{world, tables, only, combat}。world 缺省时只算不需要世界数据的指标。
export function computeMetrics(document,{world=null,tables=undefined,only=null,combat=false,combatTrials=2000}={}){
 const resolvedTables=tables??world?.balance??{};
 const ctx={document,world,tables:resolvedTables};
 const out={};
 for(const m of METRICS){
  if(only&&!only.includes(m.id))continue;
  const head={title:m.title,status:m.status,targets:m.targets,...(m.needs?{needs:m.needs}:{}),...(m.note?{note:m.note}:{})};
  if(m.compute){
   try{out[m.id]={...head,value:m.compute(ctx)};}
   catch(e){if(!(e instanceof Unavailable))throw e;out[m.id]={...head,status:'unavailable',reason:e.message};}
  }else if(m.provider){
   out[m.id]={...head,provider:m.provider,...(combat?{value:'__combat__'}:{})};
  }else out[m.id]=head;
 }
 return {format:METRICS_FORMAT,minute:stateOf(document).minute??null,day:Math.floor((stateOf(document).minute??0)/DAY),
  parameterHash:Object.keys(resolvedTables).length?parameterHash(resolvedTables):null,metrics:out};
}
// 竞技场：异步调用 tools/balance-combat.mjs（只在需要时加载战斗引擎）。
export async function withCombat(result,world,{trials=2000}={}){
 const slot=result.metrics['combat.winRate'];
 if(!slot||slot.value!=='__combat__')return result;
 const {balanceReport}=await import('./balance-combat.mjs');
 const report=balanceReport(world.rules,{trials});
 slot.value={pass:report.pass,trials:report.trials,seed:report.seed,rows:report.results.map(r=>({id:r.id,winRate:r.winRate,min:r.min,max:r.max,pass:r.pass,averageRounds:r.averageRounds}))};
 return result;
}

if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
 const args=process.argv.slice(2),flag=name=>{const i=args.indexOf(name);return i<0?null:args[i+1];};
 if(args.includes('--list')){
  console.log(JSON.stringify(METRICS.map(({id,title,status,targets,needs})=>({id,title,status,targets,...(needs?{needs}:{})})),null,2));
 }else{
  const file=args.find(a=>!a.startsWith('--')&&a!==flag('--world')&&a!==flag('--only'));
  if(!file){console.error('用法：node tools/balance-metrics.mjs <存档文档.json> [--world <世界根>] [--only id,id] [--combat] [--list]');process.exit(2);}
  const raw=JSON.parse(fs.readFileSync(file,'utf8')),document=raw.document??raw;
  const {loadWorld}=await import('./load-world.mjs');
  const world=await loadWorld(flag('--world')??undefined);
  const result=computeMetrics(document,{world,only:flag('--only')?.split(',')??null,combat:args.includes('--combat')});
  await withCombat(result,world);
  console.log(JSON.stringify(result,null,2));
 }
}
