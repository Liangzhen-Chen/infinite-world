// 卡 C 通用初加工链（K1 的初加工部分）·独立验收。
// 全部断言写成世界里的现象：只用真实动作（world_act / world_propose）和推进时间驱动；观察只读存档（state、ledger）。
// 用法：TEMP=F:/dnd-tmp TMP=F:/dnd-tmp node F:/dnd-tmp/c-processing-acc/acceptance.mjs [--days N] [--rebuild]
//   ACC_REPO=<仓库> 指定被验收的树（默认基线 F:/dnd-wt/S5FIX）；--days 浸泡天数（本机冒烟 ≤3，正式 30 交李白）。
// 结果：pass / fail / blocked（前提现象造不出来，写明卡在哪条缺失的规律上；等同未过）。输出 acceptance.json，全过退出码 0。
import fs from 'node:fs';
import path from 'node:path';
import {BASE,MUT,OUT_DIR,openRepo,act,propose,say,at,inv,pinv,parse,flowDiff,craftsSince,FAKE_SRC,makerOf,derive,categories,manufactured,realIn,trace,soak,argDays,has} from './lib.mjs';
import {build,NEW,k8Url} from './mutate.mjs';
import {wearOut} from './wear.mjs';

const DAYS=argDays(3),t0=Date.now();
const results=[];
const check=(id,group,phenomenon,outcome,evidence)=>{results.push({id,group,phenomenon,result:outcome===true?'pass':outcome===false?'fail':outcome,evidence});return outcome===true;};
const blocked=(id,group,phenomenon,why,evidence={})=>check(id,group,phenomenon,'blocked',{blockedBy:why,...evidence});
const log=(...a)=>console.log(`[${((Date.now()-t0)/1000).toFixed(0)}s]`,...a);
const books=(T,c,before)=>{const a=T.auditLedger(c.doc.ledger),k=before?T.conservation(c.engine,before,c.doc):[];return {ok:!a.length&&!k.length,audit:a.slice(0,3),conservation:k.slice(0,3)};};
const coord=(world,id)=>Object.values(world.locations).find(l=>l.id===id)?.coordinates;
const dist=(world,a,b)=>{const p=coord(world,a),q=coord(world,b);return p&&q?Math.hypot(p[0]-q[0],p[1]-q[1]):Infinity;};
const isTool=(D,id)=>D.toolSet.has(id);
// 卖家持货账户：NPC 本人或店铺等持货人（不是玩家、不是源汇、不是据点存量）。
const npcAcct=(k,doc)=>{const {owner}=parse(k);return owner!=='player'&&!/^(src|sink):/.test(owner)&&!owner.startsWith('site:');};

// ================= 一、基线树：浸泡 =================
const T=await openRepo(BASE),D=derive(T.world),M=manufactured(D),C=categories(D);
log('仓库',BASE,'浸泡',DAYS,'天');
const {runK8Guard}=await import(k8Url(BASE));
const k8Base=runK8Guard(BASE),k8Find=(rep,id)=>rep.findings.find(x=>x.rule==='origin-not-produced'&&x.id===id)?.detail??null;

const ctx=T.newGame('cpb');
// P3 准备：在出生聚落找一位手里有工具的卖家，把他某种工具买空（最多 5 件），让"补货从哪来"在浸泡里显出来。
const buyout={tried:[]};
{const here=ctx.doc.state.location,near=Object.entries(ctx.doc.state.npcs).filter(([,n])=>!(n.hp<=0)&&String(n.location??'').includes(here.replace(/^loc_/,'')));
 outer:for(const [id,n] of near)for(const it of Object.keys(n.inventory??{}).filter(i=>D.toolSet.has(i)&&inv(n,i)>0&&inv(n,i)<=5)){
   await at(ctx,n.location);let got=0,r;for(let i=0;i<5&&inv(ctx.doc.state.npcs[id],it)>0;i++){r=await act(ctx,'core:trade.buy',{seller:id,item:it,quantity:1});if(r.status!=='committed')break;got++;}
   buyout.tried.push({seller:id,item:it,bought:got,last:say(r),left:inv(ctx.doc.state.npcs[id],it)});
   if(got>0&&inv(ctx.doc.state.npcs[id],it)===0){buyout.picked={seller:id,item:it,bought:got};break outer;}
   if(buyout.tried.length>=6)break outer;}}
log('P3 买空',JSON.stringify(buyout.picked??buyout.tried.slice(-1)));
// P3 准备：玩家买工具、学配方、反复做活，直到工具磨损报废（见 wear.mjs，全部是真实动作）。
const worn=await wearOut(ctx,{D,world:T.world,M,waitDays:Math.min(DAYS,3)});
log('P3 磨坏',worn.broke?worn.tool:'没磨坏',JSON.stringify(worn.runs.map(r=>({recipe:r.recipe,tool:r.tool,durability:r.durability.slice(-3)}))));
// P4 准备：数据里"据点再生"的资源中，物品是制成品的那些（制成品 = 配方产物 ∪ 卡点名九类）。挑离出生地最近的一处，进去采空，再看浸泡里会不会长回来。
const regrowRows=[],openSite=id=>!(Object.values(T.world.locations).find(l=>l.id===id)?.site?.entryMechanisms??[]).length;
for(const l of Object.values(T.world.locations))for(const ch of l.site?.changes??[])if(ch.kind==='regrow'){const r=(l.site.resources??[]).find(x=>x.id===ch.resource);if(r)regrowRows.push({location:l.id,resource:r.id,item:r.item,everyDays:ch.everyDays,max:ch.max,requires:r.requires??null,mechanisms:r.mechanisms??null,manufactured:M.has(r.item)});}
const fakeRegrow=regrowRows.filter(r=>r.manufactured);
const deplete={tried:[],picked:null};
for(const r of [...fakeRegrow].filter(r=>!r.requires&&!r.mechanisms&&openSite(r.location)).sort((a,b)=>dist(T.world,ctx.doc.state.location,a.location)-dist(T.world,ctx.doc.state.location,b.location)).slice(0,3)){
  const m=await at(ctx,r.location),e=await act(ctx,'core:site.enter',{});
  const left=ctx.doc.state.records?.[`site:${r.location}`]?.remaining?.[r.resource];
  const g=await act(ctx,'core:site.gather',{target:r.resource,quantity:left??r.max??1});
  const after=ctx.doc.state.records?.[`site:${r.location}`]?.remaining?.[r.resource];
  deplete.tried.push({...r,move:say(m),enter:say(e),gather:say(g),remainingAfter:after});
  if(g.status==='committed'){deplete.picked={...r,remainingAfter:after,minute:ctx.doc.state.minute};break;}
}
log('P4 采空', deplete.picked?`${deplete.picked.location}/${deplete.picked.resource}`:'无');
// P4 前提：再生规律真的在跑。先用真实动作采一次带再生条目的自然物据点（再生周期不超过浸泡天数的优先，其次最近），浸泡后看它是否长回。
const natSite={tried:[],picked:null};
for(const r of regrowRows.filter(r=>!r.manufactured&&!r.requires&&!r.mechanisms&&openSite(r.location)).sort((a,b)=>((a.everyDays>DAYS)-(b.everyDays>DAYS))||(dist(T.world,ctx.doc.state.location,a.location)-dist(T.world,ctx.doc.state.location,b.location))).slice(0,3)){
  const m=await at(ctx,r.location),e=await act(ctx,'core:site.enter',{});
  const g=await act(ctx,'core:site.gather',{target:r.resource,quantity:Math.max(1,Math.min(r.max??1,3))});
  const after=ctx.doc.state.records?.[`site:${r.location}`]?.remaining?.[r.resource];
  natSite.tried.push({...r,move:say(m),enter:say(e),gather:say(g),remainingAfter:after});
  if(g.status==='committed'){natSite.picked={...r,remainingAfter:after};break;}
}
log('P4 采自然物', natSite.picked?`${natSite.picked.location}/${natSite.picked.resource}（${natSite.picked.everyDays} 天）`:'无');

// 浸泡：每天记一次 NPC 持有的工具账户，看卖家补货。
const s0=ctx.doc,daily=[];
const toolAccts=doc=>Object.fromEntries(Object.entries(doc.ledger.accounts).filter(([k])=>npcAcct(k,doc)&&isTool(D,parse(k).resource)));
let prev=toolAccts(s0);
const sk=await soak(ctx,DAYS,(d,c)=>{const now=toolAccts(c.doc);const inc=[];for(const [k,v] of Object.entries(now)){const dv=v-(prev[k]??0);if(dv>0)inc.push([k,dv]);}daily.push({day:d+1,toolIncrements:inc});prev=now;if((d+1)%5===0)log('浸泡第',d+1,'天');});
const s1=ctx.doc,flows=flowDiff(s0,s1),crafts=craftsSince(s0,s1);
log('浸泡完成',sk.ok?'':sk.reason,'制作记录',crafts.length);
const tctx={flows,crafts,doc:s1,M,ctxId:ctx.id};
check('S0','浸泡','浸泡真实推进完成，账本守恒（审计为空，逐资源 Δ总量 = 源 − 汇）',sk.ok&&books(T,ctx,s0).ok,{soak:sk,books:books(T,ctx,s0)});

// ---- P1 30 天产量 ----
const traced={};
for(const [cat,ids] of Object.entries(C)){
  const per=ids.map(id=>({id,name:D.items[id]?.name,realIn:realIn(flows,id,M),trace:trace(id,tctx)}));
  traced[cat]=per;
  const produced=per.filter(p=>p.realIn.n>0);
  check(`P1.${cat}.产量`,'P1 产量',`${cat}：浸泡期内有真实产量（非开局、非进货、非据点再生的源流入 > 0）`,produced.length>0,
    {items:per.map(p=>({id:p.id,name:p.name,realIn:p.realIn.n,by:p.realIn.by})),why:produced.length?undefined:'缺：初加工规律（配方 + 自然投入 + 劳动）没有产出它'});
  const ok=per.filter(p=>p.trace.ok);
  check(`P1.${cat}.可追溯`,'P1 产量',`${cat}：每一单位能追到"配方 + 自然投入 + 劳动"：有制作记录、做工者可认定、各级投入同期真实产出覆盖制作消耗`,ok.length>0,
    {items:per.map(p=>({id:p.id,trace:p.trace}))});
}

// 对照（不计入判定）：浸泡期内真实做出过的任一制成品，用同一追踪器追一遍，说明量具本身能认出"配方 + 自然投入 + 劳动"。
const controls=[];
{const made=[...new Set(crafts.flatMap(c=>Object.keys(c.outputs??{})))].filter(i=>!Object.values(C).flat().includes(i));
 for(const i of made.slice(0,3))controls.push({item:i,name:D.items[i]?.name,trace:trace(i,tctx)});}

// ---- P3 工具替代来源 ----
{
  const toolSinks={};for(const [k,v] of Object.entries(flows)){const {owner,resource,purpose}=parse(k);if(owner.startsWith('sink:')&&isTool(D,resource)&&v>0)toolSinks[resource]=(toolSinks[resource]??0)+v;}
  const toolMade={};for(const c of crafts)for(const [i,q] of Object.entries(c.outputs??{}))if(isTool(D,i))toolMade[i]=(toolMade[i]??0)+q;
  const tracedTools=Object.keys(toolMade).map(i=>({item:i,made:toolMade[i],trace:trace(i,tctx)}));
  check('P3.配方产工具','P3 工具','浸泡期内世界里有人按配方造出工具，且可追到配方 + 自然投入 + 劳动',tracedTools.some(t=>t.trace.ok),{toolsMade:tracedTools.map(t=>({item:t.item,made:t.made,ok:t.trace.ok,why:t.trace.ok?undefined:t.trace}))});
  // 玩家磨坏工具后，世界里要有替代来源：浸泡里有人按配方造出这种工具（可追溯），或者向卖家买到一件、而卖家正是浸泡里造过它的人。
  if(!worn.broke)blocked('P3.报废有替代','P3 工具','玩家反复使用把工具磨到报废后，世界里有替代来源（配方生产，或卖家补货追到生产者）','玩家用真实动作驱动不出工具报废：缺做活所需材料的真实来源（P1）',{worn});
  else{const t=worn.tool,made=toolMade[t]??0,tr=made?trace(t,tctx):null,makers=[...new Set(crafts.filter(x=>(x.outputs?.[t]??0)>0).map(x=>makerOf(x,s1,ctx.id)).filter(m=>m&&m!=='player'))];
    const buys=[];let boughtFromProducer=false;
    for(const m of makers){const n=ctx.doc.state.npcs[m];if(!n||inv(n,t)<=0)continue;const before=pinv(ctx.doc,t);const r=await buy(ctx,m,t);buys.push(`向生产者 ${m} 买 ${t}：${say(r)}`);if(pinv(ctx.doc,t)>before){boughtFromProducer=true;break;}}
    check('P3.报废有替代','P3 工具','玩家反复使用把工具磨到报废后，世界里有替代来源（配方生产，或卖家补货追到生产者）',!!tr?.ok||boughtFromProducer,{worn:{tool:t,recipe:worn.recipe,runs:worn.runs},madeInSoak:made,trace:tr,makers,buys});}
  // 数据推导：被配方用到的工具，K8 守门的产出路径分析里都能走通（不报 origin-not-produced）。
  const usedTools=[...new Set(D.recipes.flatMap(r=>r.tools??[]))];
  const noPath=usedTools.filter(i=>/全世界|投入断了/.test(k8Find(k8Base,i)??''));
  check('P3.工具有生产链','P3 工具','（数据推导·K8 守门）配方用到的每种工具在世界里都有走得通的产出路径',noPath.length===0,{usedTools:usedTools.length,noPath:noPath.length,sample:noPath.slice(0,8).map(i=>({id:i,detail:k8Find(k8Base,i)}))});
  // 卖家补货：凭空进货为 0；NPC 工具库存的增量不超过同期配方产出（补货追得到生产者）。
  const imports=Object.entries(flows).filter(([k,v])=>v>0&&parse(k).owner.startsWith('src:import')&&isTool(D,parse(k).resource));
  const incByItem={};for(const d of daily)for(const [k,dv] of d.toolIncrements){const {owner,resource}=parse(k);const made=crafts.some(c=>(c.outputs?.[resource]??0)>0&&makerOf(c,s1,ctx.id)===owner);if(!made)incByItem[resource]=(incByItem[resource]??0)+dv;}
  // 卖家之间转手开局存货不算凭空；判追到生产者：补进的每种工具，同期世界里确有配方产出它。
  const restock=Object.entries(incByItem).map(([i,n])=>({item:i,restocked:n,producedInWorld:toolMade[i]??0,ok:(toolMade[i]??0)>0}));
  if(!imports.length&&!restock.length)blocked('P3.补货追到生产者','P3 工具','卖家补货能追到生产者：工具凭空进货为 0，卖家（非自造）补进的每种工具同期确有配方产出',`浸泡 ${DAYS} 天内没有卖家补货工具（开局已把一位卖家的某种工具买空）`,{buyout});
  else check('P3.补货追到生产者','P3 工具','卖家补货能追到生产者：工具凭空进货为 0，卖家（非自造）补进的每种工具同期确有配方产出',!imports.length&&restock.every(r=>r.ok),{buyout,imports:imports.slice(0,10),restock:restock.slice(0,10)});
}

// ---- P4 据点只再生自然物 ----
{
  const regrowM=Object.entries(flows).filter(([k,v])=>v>0&&parse(k).owner==='src:regrowth'&&M.has(parse(k).resource));
  // 店铺凭空补货归 E 卡，这里只管据点再生。
  const np=natSite.picked,npNow=np?s1.state.records?.[`site:${np.location}`]?.remaining?.[np.resource]:undefined,regrew=np&&(npNow??0)>(np.remainingAfter??0);
  if(!regrew)blocked('P4.浸泡再生','P4 据点','据点再生规律在跑（采过的自然物长回来了），同期据点再生的制成品为 0',np?`采过的 ${np.location}/${np.resource} 浸泡 ${DAYS} 天没长回（再生周期 ${np.everyDays} 天），没法确认再生规律在跑`:'走不到或采不到任何带再生条目的自然物据点',{natSite,remainingNow:npNow,regrowthOfManufactured:regrowM});
  else check('P4.浸泡再生','P4 据点','据点再生规律在跑（采过的自然物长回来了），同期据点再生的制成品为 0',regrowM.length===0,{natSite:np,remainingNow:npNow,regrowthOfManufactured:regrowM});
  check('P4.数据','P4 据点','（数据）据点再生条目里没有制成品',fakeRegrow.length===0,{count:fakeRegrow.length,rows:fakeRegrow.slice(0,12)});
  if(!fakeRegrow.length)check('P4.采空不复生','P4 据点','采空据点的制成品后不会自行长回',true,{note:'数据里已无制成品再生条目，无可采空的对象'});
  else if(!deplete.picked)blocked('P4.采空不复生','P4 据点','采空据点的制成品后不会自行长回','走不到或采不到任何带制成品再生条目的据点',{tried:deplete.tried});
  else{const p=deplete.picked,now=s1.state.records?.[`site:${p.location}`]?.remaining?.[p.resource];
    const enough=DAYS>=(p.everyDays??0);
    if(!enough&&now===p.remainingAfter)blocked('P4.采空不复生','P4 据点','采空据点的制成品后不会自行长回',`浸泡 ${DAYS} 天短于该条目的再生周期 ${p.everyDays} 天，未到判定点（正式 30 天跑判定）`,{picked:p,remainingNow:now});
    else check('P4.采空不复生','P4 据点','采空据点的制成品后不会自行长回',(now??0)<=(p.remainingAfter??0),{picked:p,remainingNow:now});}
}

// ---- P2 技能书可再造 ----
const paperIds=[...C['羊皮纸'],...C['纸']],inkIds=C['墨'];
const bookItems=Object.values(D.items).filter(i=>(i.tags??[]).includes('book')&&i.book?.teaches?.length);
const holders=(doc,item)=>Object.entries(doc.state.npcs).filter(([,n])=>inv(n,item)>0&&!(n.hp<=0)).map(([id,n])=>({id,location:n.location,qty:inv(n,item)}));
// 买：对方按作息暂不接待时，等一个时辰再去（最多一天），每次都是真实等待。
async function buy(c,seller,item){let r;for(let i=0;i<16;i++){await at(c,c.doc.state.npcs[seller].location);r=await act(c,'core:trade.buy',{seller,item,quantity:1});if(r.status==='committed'||!/此刻不提供|不在场|不在此/.test(r.reason??''))return r;await act(c,'core:time',{minutes:60});}return r;}
// 抄写路径：①登记动作里名为抄/誊/copy 的；②产物是书的配方（先学再做）；③开放提案。
const actionFiles=fs.readdirSync(path.join(BASE,'world/actions')).filter(f=>f.endsWith('.json'));
const allActions=actionFiles.flatMap(f=>{const j=JSON.parse(fs.readFileSync(path.join(BASE,'world/actions',f),'utf8'));const a=j.actions??j;return Array.isArray(a)?a:Object.values(a);}).filter(a=>a?.id);
const COPY=/抄|誊|transcri|copy/i;
const copyActions=allActions.filter(a=>COPY.test([a.id,a.label,...(a.synonyms??[])].join(' ')));
const copyRecipes=D.recipes.filter(r=>(D.items[r.output?.item]?.tags??[]).includes('book'));
async function tryCopy(c,book,paper,ink){
  const tries=[],count=()=>pinv(c.doc,book);
  const okAfter=(before,b0)=>pinv(c.doc,book)>b0&&(pinv(c.doc,paper)<before.p||pinv(c.doc,ink)<before.i);
  for(const a of copyActions){const slots={};for(const s of a.slots??[]){if(s.kind==='entity'&&s.entity==='item')slots[s.name]=book;}
    const before={p:pinv(c.doc,paper),i:pinv(c.doc,ink)},b0=count(),doc0=c.doc,r=await act(c,a.id,slots);tries.push(`${a.id}：${say(r)}`);if(r.status==='committed'&&okAfter(before,b0))return {ok:true,via:a.id,tries,before:doc0};}
  for(const r of copyRecipes){
    const l=await act(c,'core:learn',{kind:'recipe',entity:r.id,mode:'acquire',...(r.teachers?.[0]?{source:r.teachers[0]}:{})});tries.push(`learn ${r.id}：${say(l)}`);
    for(const st of Object.values(T.world.locations).filter(x=>(x.workstations??[]).some(w=>w.kind===r.workstation)).slice(0,1))tries.push(`move ${st.id}：${say(await at(c,st.id))}`);
    const before={p:pinv(c.doc,paper),i:pinv(c.doc,ink)},b0=count(),doc0=c.doc,m=await act(c,'core:craft.manufacture',{recipe:r.id});tries.push(`craft ${r.id}：${say(m)}`);if(m.status==='committed'&&okAfter(before,b0))return {ok:true,via:r.id,tries,before:doc0};}
  const before={p:pinv(c.doc,paper),i:pinv(c.doc,ink)},b0=count(),doc0=c.doc;
  const fx=[{op:'transfer',resource:paper,from:`player|${paper}|inventory`,to:`sink:consume|${paper}|craft`,qty:1},{op:'transfer',resource:ink,from:`player|${ink}|inventory`,to:`sink:consume|${ink}|craft`,qty:1},{op:'create',kind:'item',template:book}];
  const p=await propose(c,`照着手里的《${D.items[book].name}》，用${D.items[paper].name}和${D.items[ink].name}抄写一本副本`,fx);tries.push(`world_propose 抄写：${say(p)}`);
  if(p.status==='committed'&&okAfter(before,b0))return {ok:true,via:'world_propose',tries,before:doc0};
  return {ok:false,tries};
}
async function copyBook(c,{real}){
  const steps=[],get=async(ids,label)=>{
    for(const id of ids){
      if(pinv(c.doc,id)>0)return id;
      // real：只向浸泡期内真的做出过它的人买；否则向任何持有人买（只用于探路，不计"真实产出"）。
      const makers=real?[...new Set(crafts.filter(x=>(x.outputs?.[id]??0)>0).map(x=>makerOf(x,s1,ctx.id)).filter(m=>m&&m!=='player'))]:holders(c.doc,id).map(h=>h.id);
      for(const m of makers){if(!c.doc.state.npcs[m]||inv(c.doc.state.npcs[m],id)<=0){steps.push(`${m} 手里没有 ${id}`);continue;}const r=await buy(c,m,id);steps.push(`向 ${m} 买 ${id}：${say(r)}`);if(pinv(c.doc,id)>0)return id;}
    }
    steps.push(`${label}：取不到（${real?'浸泡期内没有真实产出它的生产者':'世界里没有持有人'}）`);return null;};
  const paper=await get(paperIds,'纸'),ink=await get(inkIds,'墨');
  let book=null;for(const b of bookItems){if(pinv(c.doc,b.id)>0){book=b.id;break;}const h=holders(c.doc,b.id)[0];if(!h)continue;const r=await buy(c,h.id,b.id);steps.push(`买原本 ${b.id}：${say(r)}`);if(pinv(c.doc,b.id)>0){book=b.id;break;}if(steps.length>20)break;}
  if(!paper||!ink||!book)return {ok:false,stage:'取料',paper,ink,book,steps};
  const r=await tryCopy(c,book,paper,ink);
  return {...r,stage:'抄写',paper,ink,book,steps,books:r.ok?books(T,c,r.before):undefined};
}
{
  // 探路：用开局存量的纸墨试抄写路径本身是否存在（不计真实产出）。
  const probe=await copyBook(T.fork({...T.newGame('cpp')},'x'),{real:false});
  const routeOk=probe.ok&&probe.books?.ok;
  check('P2.抄写路径','P2 技能书','世界里有"照着原本、消耗纸墨、劳动抄出一本技能书"的路径（用开局纸墨探路），账本守恒',routeOk,
    {...probe,before:undefined,copyActions:copyActions.map(a=>a.id),copyRecipes:copyRecipes.map(r=>r.id),why:routeOk?undefined:'缺：抄写规律（书由纸、墨、劳动做出）'});
  const realRun=await copyBook(ctx,{real:true});
  const realOk=realRun.ok&&realRun.books?.ok;
  if(!realOk&&realRun.stage==='取料')blocked('P2.真实纸墨再造','P2 技能书','玩家用世界里真实产出的羊皮纸和墨抄出一本技能书，账本守恒','缺：羊皮纸/墨的真实生产者（P1）',{...realRun});
  else check('P2.真实纸墨再造','P2 技能书','玩家用世界里真实产出的羊皮纸和墨抄出一本技能书，账本守恒',realOk,{...realRun,before:undefined});
}

// ================= 二、变异副本 =================
let info=null;try{const prevInfo=JSON.parse(fs.readFileSync(path.join(OUT_DIR,'mutation.json'),'utf8'));info=await build({rebuild:has('--rebuild')||prevInfo.base!==BASE});}catch(e){info=await build({rebuild:true});}
log('变异副本就绪',JSON.stringify(info.V2&&{product:info.V2.product,input:info.V2.naturalInput}));
const T2=await openRepo(MUT),D2=derive(T2.world),M2=manufactured(D2);
check('V0.变异载入','变异','变异副本只改数据即可载入，新材料、新配方、新据点资源都在世界里',!!D2.items[NEW.natural]&&!!D2.items[NEW.product]&&D2.recipes.some(r=>r.id===NEW.recipe),{V1:info.V1});
// ---- P5 玩家 ----
{
  const c=T2.newGame('cpm'),before=c.doc,steps=[];
  steps.push(`去 ${NEW.site}：${say(await at(c,NEW.site))}`);steps.push(`进入据点：${say(await act(c,'core:site.enter',{}))}`);
  for(let i=0;i<3&&pinv(c.doc,NEW.natural)<2;i++)steps.push(`采 ${NEW.resource}：${say(await act(c,'core:site.gather',{target:NEW.resource,quantity:2}))}`);
  const got=pinv(c.doc,NEW.natural);
  // 学：照数据里的师傅学这条新配方（有检定，没学会就再上一课；师傅不接待就等两个时辰）。
  for(let i=0;i<8;i++){const t=c.doc.state.npcs[NEW.teacher];if(t)await at(c,t.location);
    const probe=await act(c,'core:craft.manufacture',{recipe:NEW.recipe},{commit:false});if(!/尚未学会|技能/.test(probe.reason??''))break;
    const l=await act(c,'core:learn',{kind:'recipe',entity:NEW.recipe,source:NEW.teacher,mode:'acquire'});steps.push(`向 ${NEW.teacher} 学 ${NEW.recipe}：${say(l)}`);
    if(l.status==='rejected')await act(c,'core:time',{minutes:120});}
  steps.push(`去工位 ${NEW.station}：${say(await at(c,NEW.station))}`);
  let made=0;
  // 制作有检定，失败会耗掉材料：回据点再采、再做，最多 4 次。
  for(let i=0;i<4&&!pinv(c.doc,NEW.product);i++){
    if(pinv(c.doc,NEW.natural)<2){await at(c,NEW.site);await act(c,'core:site.enter',{});steps.push(`再采：${say(await act(c,'core:site.gather',{target:NEW.resource,quantity:2}))}`);await at(c,NEW.station);}
    const m=await act(c,'core:craft.manufacture',{recipe:NEW.recipe});steps.push(`制作 ${NEW.recipe}：${say(m)}`);}
  made=pinv(c.doc,NEW.product);
  const f=flowDiff(before,c.doc),bk=books(T2,c,before);
  const ok=got>=2&&made>0&&(f[`src:craft|${NEW.product}|craft`]??0)>0&&bk.ok;
  check('P5.玩家产出','P5 变异','新自然材料：玩家真实采到它，按新配方做出新产物（src:craft），账本守恒——不改代码',ok,{steps,gathered:got,made,naturalIn:realIn(f,NEW.natural,M2),craftIn:f[`src:craft|${NEW.product}|craft`]??0,books:bk});
}
// ---- 变异浸泡：P5 NPC、P6 ----
const cm=T2.newGame('cpn'),m0=cm.doc;
const skm=await soak(cm,DAYS,(d)=>{if((d+1)%5===0)log('变异浸泡第',d+1,'天');});
const m1=cm.doc,mflows=flowDiff(m0,m1),mcrafts=craftsSince(m0,m1),mctx={flows:mflows,crafts:mcrafts,doc:m1,M:M2,ctxId:cm.id};
{
  const recs=mcrafts.filter(x=>x.recipe===NEW.recipe),makers=[...new Set(recs.map(x=>makerOf(x,m1,cm.id)).filter(m=>m&&m!=='player'))];
  const tr=trace(NEW.product,mctx);
  check('P5.NPC产出','P5 变异',`新自然材料：浸泡 ${DAYS} 天里有 NPC 自行采到它并按新配方真实产出新产物，可追溯——不改代码`,skm.ok&&makers.length>0&&tr.ok,
    {soak:skm,crafts:recs.length,makers,trace:tr,naturalIn:realIn(mflows,NEW.natural,M2),why:makers.length?undefined:'缺：NPC 按需求/职业做初加工的通用规律（不按名单）'});
  check('S1','变异','变异浸泡账本守恒',skm.ok&&books(T2,cm,m0).ok,{books:books(T2,cm,m0)});
}
// ---- P6 无产出路径要能检出 ----
{
  const v=info.V2;
  if(!v)blocked('P6.检出','P6 删投入','删掉某初加工产物的自然投入后，能检出它失去产出路径','九类产物的产出配方里找不到可删干净的自然投入',{tried:info.V2tried});
  else{
    const k8Mut=runK8Guard(MUT);
    const k8=(()=>{const b=k8Find(k8Base,v.product),m=k8Find(k8Mut,v.product);return {base:b,mut:m,hadPath:!b,lost:!!m,ok:!b&&!!m};})();
    const baseProduced=realIn(flows,v.product,M).n,mutProduced=realIn(mflows,v.product,M2).n;
    const tr={baseProduced,mutProduced,hadPath:baseProduced>0,lost:mutProduced===0,ok:baseProduced>0&&mutProduced===0};
    check('P6.检出','P6 删投入',`删掉 ${v.product} 的自然投入 ${v.naturalInput} 的世界来源后，能检出它失去产出路径（K8 守门报出，或产出追踪：原树有产量、变异树为 0）`,k8.ok||tr.ok,
      {mutation:{product:v.product,naturalInput:v.naturalInput,removed:v.removed},k8,trace:tr,why:k8.ok||tr.ok?undefined:'原树里它本来就没有走得通的产出路径（无可"失去"），需先有 P1 的真实产出'});
  }
}

// ================= 汇总 =================
const sum={pass:0,fail:0,blocked:0};for(const r of results)sum[r.result]++;
const out={repo:BASE,days:DAYS,seconds:Math.round((Date.now()-t0)/1000),summary:sum,results,controls};
fs.writeFileSync(path.join(OUT_DIR,`acceptance${process.env.ACC_TAG?'-'+process.env.ACC_TAG:''}.json`),JSON.stringify(out,null,1));
for(const r of results)console.log(r.result.padEnd(7),r.id,'—',r.phenomenon);
log('合计',JSON.stringify(sum));
process.exitCode=sum.fail+sum.blocked?1:0;
