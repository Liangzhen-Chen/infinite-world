// 卡 D 职业驱动劳动·独立验收（判定 + 编排）。本进程不加载世界，只顺序启动子进程（同时只有一个在算），再读轨迹判定。
// 用法：TEMP=F:/dnd-tmp TMP=F:/dnd-tmp node acceptance.mjs [--days N] [--judge-only]
//   ACC_REPO=<树> 指定被测仓库（默认 F:/dnd-wt/S5FIX）。产物：trace-*.json、mut-meta.json、acceptance.json。退出码 0 = 全 pass。
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const ROOT='F:/dnd-tmp/d-labor-acc';
const REPO=(process.env.ACC_REPO??'F:/dnd-wt/S5FIX').split('\\').join('/').replace(/\/$/,'');
const arg=(k,d)=>{const i=process.argv.indexOf(k);return i<0?d:process.argv[i+1];};
const DAYS=Number(arg('--days',3)),JUDGE_ONLY=process.argv.includes('--judge-only');
const env=repo=>({...process.env,ACC_REPO:repo,TEMP:'F:/dnd-tmp',TMP:'F:/dnd-tmp'});
const run=(script,args,repo)=>{const t=Date.now();const r=spawnSync(process.execPath,[`${ROOT}/${script}`,...args],{env:env(repo),stdio:['ignore','inherit','inherit']});
  console.error(`· ${script} ${args.join(' ')} [${repo}] → ${r.status} (${((Date.now()-t)/1000).toFixed(0)}s)`);return r.status;};
const readJ=f=>fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):null;
if(!JUDGE_ONLY){
  for(const f of ['trace-base.json','trace-mut1.json','trace-mut2.json','mut-meta.json'])fs.rmSync(`${ROOT}/${f}`,{force:true});
  if(run('soak.mjs',['--days',String(DAYS),'--tag','base','--price'],REPO))process.exit(3);
  if(run('mutate.mjs',['--stage','1'],REPO))process.exit(3);
  if(!readJ(`${ROOT}/mut-meta.json`).stage1.blocked&&run('soak.mjs',['--days',String(DAYS),'--tag','mut1'],`${ROOT}/mut`))process.exit(3);
  if(run('mutate.mjs',['--stage','2'],REPO))process.exit(3);
  if(run('soak.mjs',['--days',String(DAYS),'--tag','mut2'],`${ROOT}/mut`))process.exit(3);
}
const base=readJ(`${ROOT}/trace-base.json`),mut1=readJ(`${ROOT}/trace-mut1.json`),mut2=readJ(`${ROOT}/trace-mut2.json`),meta=readJ(`${ROOT}/mut-meta.json`)??{};
const R=['item_salt','item_wood','item_herb','item_clay','item_honey'];
const NAME={item_salt:'盐',item_wood:'柴（木料）',item_herb:'药草',item_clay:'黏土',item_honey:'蜂蜜'};
const results=[];
const check=(id,phenomenon,outcome,evidence)=>{results.push({id,phenomenon,result:outcome===true?'pass':outcome===false?'fail':'blocked',evidence});};
const blocked=(id,ph,why,ev={})=>check(id,ph,'blocked',{blockedBy:why,...ev});
const SLEEP=/睡|眠|sleep|歇息|就寝/;
const credits=(t,f=()=>true)=>(t?.credited??[]).flatMap(x=>x.credits.map(c=>({...c,npc:x.npc,occupation:x.occupation??t.npcs?.[x.npc]?.occupation,phase:x.phase,step:x.step,slot:x.slot,event:x.event,kind:x.kind}))).filter(f);
const verified=c=>c.cat==='gather'||(c.cat==='process'&&c.inputsTraced!==false)||((c.cat==='sell'||c.cat==='carry')&&c.traced&&(c.cat!=='sell'||c.paid));
// 加工的投入须能追到真实产出（不是只靠开局存量）
function markProcess(t){if(!t)return;const traced=new Set(t.producedItems);
  for(const x of t.credited){const ins=x.inputs??[];for(const c of x.credits)if(c.cat==='process'){c.inputs=ins;c.inputsTraced=ins.length>0&&ins.some(i=>traced.has(i));}}}
[base,mut1,mut2].forEach(markProcess);
if(!base){console.error('没有 trace-base.json');process.exit(3);}
const soakC=credits(base,c=>c.phase==='soak');
const thirds=Math.max(1,Math.floor(base.soakSteps*2/3));
// ---- 0. 浸泡长度 ----
check('1.0','连跑满 30 天（正式跑交 Linux；本机冒烟 ≤3 天时此条记 fail）',base.days>=30,{days:base.days,seconds:base.seconds});
// ---- 1. 30 天采集供应 ----
for(const r of R){
  const g=soakC.filter(c=>c.cat==='gather'&&c.item===r);
  const sup={};for(const c of g){sup[c.npc]??={occupation:c.occupation,qty:0,events:0,workSlot:0};sup[c.npc].qty+=c.qty;sup[c.npc].events++;if(c.slot&&!SLEEP.test(c.slot.activity??''))sup[c.npc].workSlot++;}
  const ok=g.length>0&&Object.values(sup).some(s=>s.workSlot>0);
  check(`1.${r}`,`出现真实的${NAME[r]}供应者，都是 NPC；货能追到他们的采集劳动事件（同一时段自然储量减少或真实产出源入账、本人或本聚落账户增加），劳动落在本人作息的工作时段`,ok,
    {suppliers:sup,sample:g.slice(0,3).map(c=>({npc:c.npc,event:c.event,kind:c.kind,qty:c.qty,nature:c.nature,slot:c.slot})),
     ...(g.length?{}:{why:`浸泡 ${base.days} 天里没有任何 NPC 采集${NAME[r]}的事件能对上账本（缺 R8：采集对 NPC 开放；R3：职业 → 作息 → 劳动类别）`})});
}
// ---- 2. 价格随稀缺 ----
for(const r of R){
  const p=base.priceRuns.find(x=>x.item===r);
  if(!p||p.blocked){blocked(`2a.${r}`,`${NAME[r]}：买空后报价上升`,p?.blocked??'未跑 --price');blocked(`2b.${r}`,`${NAME[r]}：NPC 供应补回后报价回落`,p?.blocked??'未跑 --price');continue;}
  const ev={market:p.market,anchor:p.anchor,S0:p.S0,S1:p.S1,S2:p.S2,Q0:p.Q0,Q1:p.Q1,Q2:p.Q2,K:p.K,buys:p.buys};
  if(p.Q1?.price==null)blocked(`2a.${r}`,`${NAME[r]}：买空后报价上升`,`买空后报价失败：${p.Q1?.reason}`,ev);
  else check(`2a.${r}`,`${NAME[r]}：供应少时价格高——玩家真实买走 ${p.market} 的大部分存货后，同一卖家报价上升`,p.S1<p.S0&&p.Q1.price>p.Q0.price,ev);
  const win=credits(base,c=>c.phase===`price:${r}`&&c.cat==='gather'&&c.item===r).reduce((s,c)=>s+c.qty,0);
  if(p.Q1?.price==null||p.Q2?.price==null)blocked(`2b.${r}`,`${NAME[r]}：NPC 供应补回后报价回落`,`报价失败：${p.Q2?.reason??p.Q1?.reason}`,{...ev,laborInWindow:win});
  else check(`2b.${r}`,`${NAME[r]}：供应多时价格低——等 ${p.K} 天，NPC 采集使 ${p.market} 的在售存量回升，报价随之回落`,p.S2>p.S1&&win>0&&p.Q2.price<p.Q1.price,{...ev,laborInWindow:win});
}
// ---- 3. 世界自给（玩家整个浸泡不调用任何采集入口）----
for(const r of R){
  const zeroDays=base.daily.filter(d=>!(d.holdings[r].world>0)).map(d=>d.day);
  const late=soakC.filter(c=>c.cat==='gather'&&c.item===r&&c.step>=thirds).reduce((s,c)=>s+c.qty,0);
  check(`3.${r}`,`不调用玩家采集入口，${NAME[r]}不断链：每日世界存量（人、聚落、行会，不含玩家与自然储量）都 > 0，且最后三分之一时段仍有 NPC 采集补入`,
    base.playerGatherCalls===0&&!zeroDays.length&&late>0,{playerGatherCalls:base.playerGatherCalls,playerActions:base.playerActions,zeroDays,lateGather:late,
    stock:base.daily.map(d=>[d.day,d.holdings[r].world])});
}
check('3.books','主浸泡账本守恒：auditLedger 为空，逐资源 Δ总量 = 源 − 汇',!base.books.audit.length&&!base.books.conservation.length,base.books);
// ---- 4. 非采集劳动 ----
const DESC={process:'加工（如木匠做板）：NPC 用能追到真实产出的投入做出成品',sell:'出售（如商贩卖货）：NPC 把能追到真实产出的货卖给别人并收到钱',carry:'运输（如脚夫运货）：NPC 把能追到真实产出的货从一地运到另一地'};
for(const cat of ['process','sell','carry']){
  const all=soakC.filter(c=>c.cat===cat),ok=all.filter(verified);
  check(`4.${cat}`,DESC[cat],ok.length>0,{verified:ok.slice(0,3).map(c=>({npc:c.npc,occupation:c.occupation,item:c.item,kind:c.kind,event:c.event,inputs:c.inputs})),
    unverified:all.filter(c=>!verified(c)).slice(0,3).map(c=>({npc:c.npc,occupation:c.occupation,item:c.item,kind:c.kind,traced:c.traced,inputs:c.inputs,why:c.cat==='process'?'投入只来自开局存量或进货':'货追不到真实产出（开局或 src:import 进货）'})),total:all.length});
}
// ---- 5. 职业通用 ----
const s1=meta.stage1??{};
if(s1.blocked||!mut1)blocked('5a','新职业名只带劳动类别属性，就有人去做这件事',s1.blocked??'mut1 未跑',{meta:s1});
else{const g=credits(mut1,c=>c.phase==='soak'&&c.npc===s1.target&&c.cat==='gather'&&c.item===s1.item);
  const before=credits(base,c=>c.npc===s1.target);
  check('5a',`副本里新职业“${s1.newOccupation}”只带劳动类别属性（${(s1.definition?.laborKeys??[]).join('、')}），改成它的 ${s1.target}（原职业“${s1.targetOldOccupation}”，基线里不劳动）去采集 ${s1.item}`,
    g.length>0&&before.length===0,{target:s1.target,item:s1.item,definition:s1.definition,events:g.slice(0,3),baselineLabor:before.length});}
const control=mut1&&!s1.blocked?mut1:base,controlTag=control===mut1?'mut1':'base';
const keyset=(t,cat)=>new Set(credits(t,c=>c.phase==='soak'&&c.cat===cat&&verified(c)).map(c=>`${c.npc}|${c.item}`));
for(const cat of ['gather','process','sell','carry']){
  const a=keyset(control,cat),b=mut2?keyset(mut2,cat):new Set();
  if(!mut2){blocked(`5b.${cat}`,`职业名改成随机串后 ${cat} 行为不变`,'mut2 未跑');continue;}
  if(!a.size){blocked(`5b.${cat}`,`职业名改成随机串后 ${cat} 劳动不变`,`对照组（${controlTag}）里没有已核实的 ${cat} 劳动，无从比较（先要第 1/4 条成立）`);continue;}
  const lost=[...a].filter(k=>!b.has(k)),gained=[...b].filter(k=>!a.has(k));
  check(`5b.${cat}`,`把所有劳动者的职业名换成不含任何关键词的随机 ASCII 串，${cat} 劳动（谁、做什么）与对照组完全相同`,!lost.length&&!gained.length,{control:controlTag,size:a.size,lost:lost.slice(0,10),gained:gained.slice(0,10),renamed:Object.keys(meta.stage2?.renamed??{}).length});
}
if(s1.blocked||!mut1||!mut2)blocked('5b.new','新职业改成随机串后照样有人去做',s1.blocked??'mut1/mut2 未跑');
else{const n=meta.stage2.renamed[s1.newOccupation];const g=credits(mut2,c=>c.phase==='soak'&&c.npc===s1.target&&c.cat==='gather'&&c.item===s1.item);
  check('5b.new',`新职业“${s1.newOccupation}”再改名为“${n}”后，${s1.target} 照样采集 ${s1.item}`,g.length>0,{renamedTo:n,events:g.length});}
const mb=[mut1,mut2].filter(Boolean).map(t=>({tag:t.tag,...t.books}));
check('5.books','变异副本浸泡账本守恒',mb.length>0&&mb.every(b=>!b.audit.length&&!b.conservation.length),mb);
// ---- 汇总 ----
const tally={pass:0,fail:0,blocked:0};for(const r of results)tally[r.result]++;
const out={card:'d-labor',repo:REPO,days:base.days,generated:new Date().toISOString(),tally,seconds:{base:base.seconds,mut1:mut1?.seconds,mut2:mut2?.seconds},
  baseEventKinds:base.eventKinds,results};
fs.writeFileSync(`${ROOT}/acceptance.json`,JSON.stringify(out,null,1));
for(const r of results)console.log(`${r.result.padEnd(7)} ${r.id.padEnd(16)} ${r.phenomenon.slice(0,70)}`);
console.log(JSON.stringify(tally));
process.exit(tally.fail||tally.blocked?1:0);
