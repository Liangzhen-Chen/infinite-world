// 卡 E 分销与补货（K2）·现象验收。
// 用法：
//   node acceptance.mjs --part main [--days N]   主世界（基线树或 ACC_REPO）
//   node acceptance.mjs --part mut  [--days N]   通用性变异副本（先跑 mutate.mjs 生成 mut/）
// 每次运行把本部分结果写进 part-<part>.json，并把已有的各部分合并成 acceptance.json。
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const HERE=path.dirname(fileURLToPath(import.meta.url)).split(String.fromCharCode(92)).join('/');
const arg=(k,d)=>{const i=process.argv.indexOf('--'+k);return i>0?process.argv[i+1]:d;};
const PART=arg('part','main'),DAYS=+arg('days','30');
if(PART==='mut')process.env.ACC_REPO=`${HERE}/mut`;
const L=await import('./lib.mjs');
const mutSpec=PART==='mut'?JSON.parse(await fs.readFile(`${HERE}/mut/ACC-MUTATION.json`,'utf8')):null;
const started=Date.now();
const ctx=L.newGame(`e-acc-${PART}`);
const results=[];
let control=null;
const put=(id,group,status,detail,evidence={})=>{results.push({id,group,status,detail,evidence});console.log(`[${status}] ${id} ${detail}`);};
// 写入者名按运行时 budget 的键识别；quest/works 用宽松匹配，防止名字差一个字就漏判。
const IMPORT_WRITERS=['shop','quest-sources','works'],WRITER_RE={shop:/^shop$/,'quest-sources':/quest/,works:/^works?$|work-?order|commission/};
const settlements=()=>Object.keys(ctx.doc.state.settlements);

// ---------- 0. 开账，记录起点 ----------
await L.call(ctx,'world_time',{minutes:1});
const startDoc=ctx.doc;
const sellers=L.tradeSellers(),keepers=L.storeKeepers();
const allHolders=[...new Set([...sellers,...keepers])];
const startStock=new Map();// `${owner}|${item}` → qty
for(const id of allHolders)for(const item of Object.keys(ctx.doc.state.npcs[id]?.inventory??{}))if(L.tradeable(item)){const q=L.stock(ctx.doc,id,item);if(q>0)startStock.set(`${id}|${item}`,q);}

// ---------- 0b. 用真实玩家动作触发 quest-sources 与 works 两个写入者（只在主世界做）----------
// 任务：玩家先自己发一张"送货"委托（交付物取开局有 ≥2 位持货人的最便宜食物），等 NPC 接单履约；
//       窗口里一旦告示板上出现 NPC 发的公开任务，玩家去接，交付类就向在场持货人真实买齐后交付。
// 著作：works 写入者对应 world_research（写书、测绘、演出）。逐个真实尝试，记下引擎的回答。
const triggers={quest:[],works:[]};
if(PART==='main'){
  const holdersOf=new Map();for(const k of startStock.keys()){const [,item]=k.split('|');holdersOf.set(item,(holdersOf.get(item)??0)+1);}
  const deliver=[...holdersOf].filter(([i,n])=>n>=2&&L.itemById.get(i)?.nutrition&&i!=='item_oats').map(([i])=>i).sort((a,b)=>L.itemById.get(a).basePrice-L.itemById.get(b).basePrice||(a<b?-1:1))[0];
  const p=await L.call(ctx,'world_quest',{operation:'publish',publisher:'player',personal:true,grade:'D',reward:20,content:'求人送两份'+(L.itemById.get(deliver)?.name??deliver)+'来',objective:{type:'deliver',item:deliver,quantity:2}});
  triggers.quest.push({action:'publish',item:deliver,status:p.status,reason:p.reason,quest:p.result?.quest??null,minute:ctx.doc.state.minute});
  for(const a of [{operation:'write',name:'河湾杂记',concept:'记河湾村集市见闻',minutes:240},{operation:'survey',name:'河湾渡口图'},{operation:'perform',name:'渡口谣',minutes:60}]){
    const r=await L.call(ctx,'world_research',a);triggers.works.push({action:a.operation,status:r.status,reason:r.reason});}
}
const questGoods=[];// 玩家因任务收到的货及其来源
// 学艺计划（建角色时没有识字或手艺背景可选：createCharacter 只收 name、attributes、birthplace）：
// 第一个被拒的著作动作 → 理由里点名的技能 → 本聚落教这门技能的人 → 拜师（有检定，没学会就改天再上）→ 每天练 3×180 分钟到门槛
// → 缺什么材料就按理由里的物品名向持货人买 → 再做这个著作动作，成稿后出版。
const study={phase:'none',log:[]};
if(PART==='main'&&!triggers.works.some(t=>t.status==='committed')){
  const first=triggers.works.find(t=>t.reason);
  const sk=first&&L.world.skills.filter(x=>x.name&&first.reason.includes(x.name.replace(/基础手艺$/,''))).sort((a,b)=>b.name.length-a.name.length)[0];
  const here=L.settlementOf(ctx.doc,ctx.doc.state.location);
  const teacher=sk&&L.world.npcs.find(n=>(n.serviceCatalog??[]).some(e=>e.kind==='teach'&&e.what===sk.id)&&L.settlementOfOwner(ctx.doc,n.id)===here)
    ||sk&&L.world.npcs.find(n=>(n.serviceCatalog??[]).some(e=>e.kind==='teach'&&e.what===sk.id));
  const threshold=sk?.id==='skill_literacy'?(L.world.rules.books?.minimumLiteracy??100):100;
  Object.assign(study,{phase:sk&&teacher?'learn':'none',op:first?.action??null,args:first?[{operation:'write',name:'河湾杂记',concept:'记河湾村集市见闻',minutes:240},{operation:'survey',name:'河湾渡口图'},{operation:'perform',name:'渡口谣',minutes:60}].find(a=>a.operation===first.action):null,
    skill:sk?.id??null,skillName:sk?.name??null,teacher:teacher?.id??null,threshold,startedDay:0});
  if(study.phase==='none')study.log.push('认不出缺的手艺或找不到师傅：'+(first?.reason??'无'));
}
const prof=()=>ctx.doc.state.skills?.[study.skill]?.proficiency??-1;
async function studyStep(day){
  const act=(a,sl)=>L.call(ctx,'world_act',{action:a,slots:sl});
  if(study.phase==='learn'){
    const loc=ctx.doc.state.npcs[study.teacher]?.location;if(loc&&ctx.doc.state.location!==loc)await L.call(ctx,'world_move',{destination:loc});
    if(ctx.doc.state.minute%L.DAY<8*60+30)await L.call(ctx,'world_time',{until:{dayOffset:0,hour:8,minute:30}});
    for(let i=0;i<3&&!ctx.doc.state.skills?.[study.skill];i++){const l=await act('core:learn',{entity:study.skill,source:study.teacher});study.log.push(`第${day+1}天 拜师 ${l.status}${l.reason?'：'+l.reason:''}`);if(l.status==='rejected')break;}
    if(ctx.doc.state.skills?.[study.skill]){study.phase='practice';study.learnedDay=day;}
    return;
  }
  if(study.phase==='practice'){
    for(let i=0;i<3;i++){const p=await act('core:practice.session',{skill:study.skill,minutes:180});if(p.status==='rejected'){study.log.push(`第${day+1}天 练习被拒：${p.reason}`);break;}}
    if(prof()>=study.threshold){study.phase='make';study.readyDay=day;}
    return;
  }
  if(study.phase==='make'){
    for(let k=0;k<4;k++){
      const r=await L.call(ctx,'world_research',study.args);
      if(r.status==='committed'&&r.result?.success!==false){triggers.works.push({action:study.args.operation,status:'committed',day,result:String(JSON.stringify(r.result)).slice(0,300)});study.phase='publish';study.work=ctx.doc.state.works?.[r.result?.work]?.id??r.result?.work??null;break;}
      if(r.status==='committed'){study.log.push(`第${day+1}天 ${study.args.operation} 检定未成：再试`);continue;}
      const miss=/缺少(.+)$/.exec(r.reason??'')?.[1]?.trim();const item=miss&&L.world.items.find(i=>i.name===miss||miss.includes(i.name))?.id;
      study.log.push(`第${day+1}天 ${study.args.operation}：${r.reason}`);
      if(!item){study.phase='stuck';break;}
      let got=false;for(const id of Object.keys(ctx.doc.state.npcs)){if(L.stock(ctx.doc,id,item)<=0)continue;const n=ctx.doc.state.npcs[id];
        if(ctx.doc.state.location!==n.location)await L.call(ctx,'world_move',{destination:n.location});
        const t=await L.call(ctx,'world_trade',{seller:id,item,quantity:Math.min(2,L.stock(ctx.doc,id,item))});study.log.push(`向 ${id} 买 ${item}：${t.status}${t.reason?'：'+t.reason:''}`);if(t.status==='committed'){got=true;break;}}
      if(!got){study.phase='stuck';study.log.push(`买不到 ${item}`);break;}
    }
    return;
  }
  if(study.phase==='publish'&&study.args.operation==='write'){
    for(const coins of [80,50,30,20]){const p=await L.call(ctx,'world_research',{operation:'publish',project:study.work,coins});study.log.push(`第${day+1}天 出版 coins=${coins}：${p.status}${p.reason?'：'+p.reason:''}`);
      if(p.status==='committed'){triggers.works.push({action:'publish',status:'committed',day});break;}}
    study.phase='done';
  }
}

// ---------- 1. 真实买空一组样本（只在主世界做）----------
// 样本从玩家所在聚落的持货人里按物品标签分组派生：每组取总价最低的一项，跳过谷物燕麦（S5 已覆盖），总价不超过钱包的 50%（其余留给任务交付与报酬）。
const sample=[];
if(PART==='main'){
  const here=L.settlementOf(ctx.doc,ctx.doc.state.location);
  const cands=[...startStock].map(([k,q])=>{const [id,item]=k.split('|');const it=L.itemById.get(item);return {id,item,q,cost:it.basePrice*q,group:(it.tags??[])[0]??'untagged',settlement:L.settlementOfOwner(ctx.doc,id)};})
    .filter(r=>r.settlement===here&&r.item!=='item_oats').sort((a,b)=>a.cost-b.cost);
  let budget=Math.floor(ctx.doc.state.player.coins*0.5);const groups=new Set(),sellersUsed=new Map();
  for(const r of cands){
    if(groups.has(r.group)||(sellersUsed.get(r.id)??0)>=2||r.cost*1.5>budget)continue;
    const loc=ctx.doc.state.npcs[r.id]?.location;if(!loc)continue;
    if(ctx.doc.state.location!==loc)await L.call(ctx,'world_move',{destination:loc});
    const qty=L.stock(ctx.doc,r.id,r.item);if(!qty)continue;
    const t=await L.call(ctx,'world_trade',{seller:r.id,item:r.item,quantity:qty});
    const left=L.stock(ctx.doc,r.id,r.item);
    if(t.status==='committed'&&left===0){groups.add(r.group);sellersUsed.set(r.id,(sellersUsed.get(r.id)??0)+1);budget-=t.result?.cost??r.cost;
      sample.push({seller:r.id,item:r.item,bought:qty,paid:t.result?.cost??null,settlement:r.settlement,group:r.group,soldOutMinute:ctx.doc.state.minute});}
    else sample.push({seller:r.id,item:r.item,attempt:{status:t.status,reason:t.reason,left},failed:true});
    if(sample.filter(s=>!s.failed).length>=8)break;
  }
}
const soldOut=sample.filter(s=>!s.failed);

// ---------- 2. 逐日推进并观察 ----------
const priceItems=[...new Set([...startStock.keys()].map(k=>k.split('|')[1]).concat(mutSpec?[mutSpec.item]:[]))];
const prices=[];// day → {item:{settlement:price}}
const readPrices=()=>{const row={};for(const item of priceItems){const p={};for(const s of settlements()){const v=L.regionalPrice(ctx.doc,ctx.engine,item,s);if(v!=null)p[s]=v;}row[item]=p;}return row;};
prices.push(readPrices());
const importsByWriter={};// writer → resource → qty（非铜钱）
const budgetDaysSeen=new Set();
const trades=new Map();// market_trade 记录
const producers=new Map(),legit=new Map();// item → Map(owner→day)
const restockEvents=[];// {owner,item,day,qty,trace,counterparts,import}
const naturalSoldOut=new Map();// `${owner}|${item}` → {day}
const stockNow=new Map(startStock);
const everHeld=new Map();// item → Set(owner) 仅对变异物
const crossTransfers=[],carrierOrigin=new Map(),npcFlows=new Map();
const step=[];
const carriageCheck=(item,ids)=>{
  const hits=[];
  for(const [k,v] of Object.entries(ctx.doc.state.records)){
    const s=JSON.stringify(v);if(!s.includes(item))continue;if(!/waypoint|"edges"|"route"|outboundEdges/.test(s))continue;
    if(!ids.some(id=>id&&s.includes(id)))continue;hits.push(k);if(hits.length>=3)break;
  }
  return hits;
};
let prevDoc=ctx.doc;
// 每天在 05:59、11:59、17:59、23:59 各观察一次（补货与卖空可能在同一天内先后发生）；写入者预算只在 23:59 读当日累计。
const HOURS=[5,11,17,23];
const endMinute=Math.floor(ctx.doc.state.minute/L.DAY)*L.DAY+DAYS*L.DAY-1;
for(let day=0;ctx.doc.state.minute<endMinute;){
  if(PART==='main'&&ctx.doc.state.minute%L.DAY===5*60+59&&!['none','done','stuck'].includes(study.phase))await studyStep(day);
  const tod=ctx.doc.state.minute%L.DAY,next=HOURS.find(h=>h*60+59>tod);
  const r=await L.call(ctx,'world_time',{until:next==null?{dayOffset:1,hour:HOURS[0],minute:59}:{dayOffset:0,hour:next,minute:59}});
  if(r.status!=='committed'){step.push({day,stop:r.reason});break;}
  const doc=ctx.doc,endOfDay=doc.state.minute%L.DAY===L.DAY-1;
  // 2a. 写入者预算：当天每个写入者的进货（budget.used 当日累计，取 23:59 的读数）
  const b=doc.ledger?.budget;
  if(endOfDay&&b&&!budgetDaysSeen.has(b.day)){budgetDaysSeen.add(b.day);
    for(const [k,v] of Object.entries(b.used??{})){const [writer,src,res]=k.split('|');if(src!=='src:import'||/^coin_/.test(res))continue;((importsByWriter[writer]??={})[res]=(importsByWriter[writer][res]??0)+v);}}
  // 2b. 成交记录
  for(const [k,v] of Object.entries(doc.state.records))if(v?.category==='market_trade'&&!trades.has(k))trades.set(k,{...v,observedDay:day});
  // 2b'. 接 NPC 发的公开任务（至多试 3 张），交付类向持货人真实买齐后交付
  if(PART==='main'&&!triggers.quest.some(t=>t.action==='accept'&&t.status==='committed')&&triggers.quest.filter(t=>t.action==='accept').length<3){
    const q=Object.values(doc.state.quests??{}).find(q=>q.publisher!=='player'&&q.status==='公开'&&!triggers.quest.some(t=>t.quest===q.id));
    if(q){const acc=await L.call(ctx,'world_quest',{operation:'accept',quest:q.id});const row={action:'accept',quest:q.id,publisher:q.publisher,objective:q.objective,status:acc.status,reason:acc.reason,minute:ctx.doc.state.minute};triggers.quest.push(row);
      if(acc.status==='committed'&&q.objective?.type==='deliver'){
        const need=q.objective.quantity??1,item=q.objective.item;
        for(const id of allHolders){if(L.stock(ctx.doc,'player',item)>=need)break;const n=ctx.doc.state.npcs[id];if(!n||L.stock(ctx.doc,id,item)<=0)continue;
          if(ctx.doc.state.location!==n.location)await L.call(ctx,'world_move',{destination:n.location});
          const t=await L.call(ctx,'world_trade',{seller:id,item,quantity:Math.min(need-L.stock(ctx.doc,'player',item),L.stock(ctx.doc,id,item))});(row.buys??=[]).push({seller:id,status:t.status,reason:t.reason});}
        const dest=q.objective.location??q.location??q.board;if(dest&&ctx.doc.state.location!==dest)await L.call(ctx,'world_move',{destination:dest});
        const c=await L.call(ctx,'world_quest',{operation:'complete',quest:q.id});row.complete={status:c.status,reason:c.reason};}
    }
  }
  // 2c. 账本逐物变化：生产者、合法转手链、补货追溯
  const {acc,flow}=L.ledgerDelta(prevDoc,doc);
  const byItem=new Map();
  for(const [k,d] of acc){const {owner,resource}=L.parse(k);if(L.isVirtual(owner)||/^coin_/.test(resource))continue;const m=byItem.get(resource)??new Map();m.set(owner,(m.get(owner)??0)+d);byItem.set(resource,m);}
  const imp=new Map(),prod=new Map();
  const qWriterImport=(()=>{const b=doc.ledger?.budget?.used??{};let n=0;for(const [k,v] of Object.entries(b)){const [w,src,res]=k.split('|');if(src==='src:import'&&WRITER_RE['quest-sources'].test(w)&&!/^coin_/.test(res))n+=v;}return n;})();
  for(const [k,d] of flow){const {owner,resource}=L.parse(k);if(owner==='src:import')imp.set(resource,(imp.get(resource)??0)+d);if(L.PRODUCTION.has(owner))prod.set(resource,(prod.get(resource)??0)+d);}
  // 承运中的货：账户持有人是一条存档记录（如 settlement-trade:…|cargo），记下它从谁手里接的货。
  const isCarrier=o=>!!doc.state.records?.[o]||!!prevDoc.state.records?.[o];
  const recText=new Map(),mentions=(c,o)=>{if(!recText.has(c))recText.set(c,JSON.stringify(doc.state.records?.[c]??prevDoc.state.records?.[c]??''));const t=recText.get(c);return t.includes('"'+o+'"')||t.includes('"'+L.settlementOfOwner(doc,o)+'"');};
  // 承运记录的起点字段（from/seller/origin…）与终点字段（to/buyer/destination…）点名的一方优先；再按"记录里提到"、数量相等、第一个。
  const rec=c=>doc.state.records?.[c]??prevDoc.state.records?.[c]??{};
  const ORIGIN=['from','seller','origin','source','shipper','sender'],DEST=['to','buyer','destination','recipient','consignee'];
  const named=(c,o,keys)=>keys.some(k=>rec(c)[k]===o||rec(c)[k]===L.settlementOfOwner(doc,o));
  const pick=(c,list,m)=>list.find(o=>named(c,o,ORIGIN))??list.find(o=>mentions(c,o))??list.find(o=>Math.abs(m.get(o))===Math.abs(m.get(c)))??list[0];
  for(const [item,m] of byItem){
    const inc=[...m].filter(([,d])=>d>0).map(([o])=>o),dec=[...m].filter(([,d])=>d<0).map(([o])=>o);
    const P=producers.get(item)??new Map(),G=legit.get(item)??new Map();
    if((prod.get(item)??0)>0)for(const o of inc)if(!P.has(o)&&!isCarrier(o))P.set(o,day);
    if(!(imp.get(item)>0)&&dec.some(o=>P.has(o)||G.has(o)))for(const o of inc)if(!G.has(o)&&!P.has(o))G.set(o,day);
    producers.set(item,P);legit.set(item,G);
    for(const c of inc.filter(isCarrier)){const f=pick(c,dec.filter(o=>!isCarrier(o)),m);if(f&&!carrierOrigin.has(c))carrierOrigin.set(c,{owner:f,settlement:L.settlementOfOwner(doc,f),traced:P.has(f)||G.has(f)});}
    if(mutSpec&&item===mutSpec.item){const s=everHeld.get(item)??new Set();for(const o of inc)if(!isCarrier(o))s.add(o);everHeld.set(item,s);}
    // 人手里的进出：用来从账本认出"在甲地进货、到乙地出货"的商人（不依赖成交记录的格式）
    if(!(imp.get(item)>0))for(const o of inc)if(doc.state.npcs?.[o]){const f=dec.find(x=>x!==o&&!isCarrier(x));if(f)(npcFlows.get(o+'|'+item)??npcFlows.set(o+'|'+item,[]).get(o+'|'+item)).push({side:'in',day,minute:doc.state.minute,settlement:L.settlementOfOwner(doc,f)});}
    for(const o of dec)if(doc.state.npcs?.[o]){const t=inc.find(x=>x!==o&&!isCarrier(x));if(t)(npcFlows.get(o+'|'+item)??npcFlows.set(o+'|'+item,[]).get(o+'|'+item)).push({side:'out',day,minute:doc.state.minute,settlement:L.settlementOfOwner(doc,t)});}
    // 跨聚落转手：直接（同一步里两地一减一增）或经承运记录（货从承运账户落到另一聚落）
    if(!(imp.get(item)>0)&&crossTransfers.length<2000){
      const carriersOut=dec.filter(isCarrier),used=new Set();
      for(const t of inc.filter(o=>!isCarrier(o))){
        const via=carriersOut.length?(carriersOut.find(c=>!used.has(c)&&named(c,t,DEST))??carriersOut.find(c=>!used.has(c)&&mentions(c,t)&&carrierOrigin.get(c)?.owner!==t)??null):null;if(via)used.add(via);
        const f=via?carrierOrigin.get(via)?.owner:(carriersOut.length?null:dec.find(o=>!isCarrier(o)));if(!f)continue;
        const a=L.settlementOfOwner(doc,f),z=L.settlementOfOwner(doc,t);if(!a||!z||a===z)continue;
        crossTransfers.push({item,day,from:f,to:t,fromSettlement:a,toSettlement:z,via:via??null,traced:via?!!carrierOrigin.get(via)?.traced:(P.has(f)||G.has(f)),
          carriage:via?[via]:(item==='item_oats'||(mutSpec&&item===mutSpec.item)?carriageCheck(item,[f,t,a,z]):null)});
        if(!via)break;
      }
    }
  }
  // 玩家从自己发的任务收到交付物：当步该物不得有 src:import，且有真实持有人减少
  const myQuest=triggers.quest.find(t=>t.action==='publish'&&t.status==='committed');
  if(myQuest&&!questGoods.length){const it=myQuest.item,dp=(byItem.get(it)??new Map()).get('player')??0;
    if(dp>0)questGoods.push({item:it,qty:dp,day,import:imp.get(it)??0,questWriterImportToday:qWriterImport,counterparts:[...(byItem.get(it)??new Map())].filter(([o,d])=>d<0&&o!=='player').map(([o])=>o),questStatus:doc.state.quests?.[myQuest.quest]?.status??null});}
  // 补货事件：持货人（样本或自然卖空）由 0 变正
  const watch=new Map();for(const s of soldOut)watch.set(`${s.seller}|${s.item}`,'sample');for(const k of naturalSoldOut.keys())if(!watch.has(k))watch.set(k,'natural');
  for(const [key,kind] of watch){
    if(restockEvents.some(e=>`${e.owner}|${e.item}`===key))continue;
    const [owner,item]=key.split('|');const q=L.stock(doc,owner,item);
    const since=kind==='sample'?soldOut.find(s=>`${s.seller}|${s.item}`===key).soldOutMinute:naturalSoldOut.get(key).minute;
    const resold=[...trades.values()].some(t=>t.seller===owner&&t.item===item&&t.minute>since);
    if(q<=0&&!resold)continue;
    const m=byItem.get(item)??new Map();const P=producers.get(item),G=legit.get(item);
    const counterparts=[...m].filter(([o,d])=>d<0&&o!==owner).map(([o])=>o);
    let trace='untraced';
    if((imp.get(item)??0)>0)trace='import';
    else if(counterparts.some(o=>P?.has(o)||G?.has(o)))trace='producer-chain';
    else if((prod.get(item)??0)>0&&(m.get(owner)??0)>0)trace='self-production';
    else if(counterparts.some(o=>earlierLot(doc,o,item)))trace='earlier-production';
    const via=counterparts.filter(isCarrier).find(c=>named(c,owner,DEST))??counterparts.filter(isCarrier).find(c=>mentions(c,owner)&&carrierOrigin.get(c)?.owner!==owner)??counterparts.find(isCarrier)??null;
    const from=via?carrierOrigin.get(via)?.owner??null:counterparts.find(o=>P?.has(o)||G?.has(o))??counterparts[0]??null;
    const fromS=from?L.settlementOfOwner(doc,from):null,toS=L.settlementOfOwner(doc,owner);
    const cross=!!from&&fromS!==toS;
    restockEvents.push({kind,owner,item,day,qty:q,trace,from,via,fromSettlement:fromS,toSettlement:toS,
      import:imp.get(item)??0,cross,carriage:cross?(via?[via]:carriageCheck(item,[owner,from,toS,fromS])):null});
  }
  // 自然卖空：持货人某物由正到 0，且此前有他向第三方的成交
  for(const [key,q0] of stockNow){
    const [owner,item]=key.split('|');const q=L.stock(doc,owner,item);
    if(q===0&&q0>0&&!naturalSoldOut.has(key)&&!soldOut.some(s=>s.seller===owner&&s.item===item)){
      const sold=[...trades.values()].some(t=>t.seller===owner&&t.item===item&&t.buyer!==owner);
      if(sold)naturalSoldOut.set(key,{day,minute:doc.state.minute});
    }
    stockNow.set(key,q);
  }
  prevDoc=doc;
  if(!endOfDay)continue;
  prices.push(readPrices());
  step.push({day,minute:doc.state.minute,ms:Date.now()-started});
  console.log(`day ${day+1}/${DAYS} minute ${doc.state.minute} trades ${trades.size} restocks ${restockEvents.length} ${Math.round((Date.now()-started)/1000)}s`);
  day++;
}
const endDoc=ctx.doc,daysRun=step.filter(s=>!s.stop).length;

// ---------- 3. 判定 ----------
// 季节：窗口覆盖的季节（月序 ÷ 3）；某物"不在季节"= 数据里它只有带 seasons 的采集产地、没有配方产出，且这些季节都不在窗口内。
const DPM=L.world.rules.calendar.daysPerMonth,MPY=L.world.rules.calendar.monthsPerYear;
const windowSeasons=new Set();for(let m=startDoc.state.minute;m<=endDoc.state.minute;m+=L.DAY)windowSeasons.add(Math.floor((Math.floor(Math.floor(m/L.DAY)/DPM)%MPY)/3));
const crafted=new Set(L.world.recipes.flatMap(r=>[r.output?.item,...(r.byproducts??[]).map(b=>b.item)]).filter(Boolean));
function seasonInfo(item){
  const paths=[];for(const l of L.world.locations)for(const r of l.site?.resources??[])if(r.item===item)paths.push({site:l.id,seasons:r.gather?.seasons??null});
  const seasonal=paths.filter(p=>Array.isArray(p.seasons));
  const out=!crafted.has(item)&&seasonal.length>0&&seasonal.length===paths.length&&seasonal.every(p=>!p.seasons.some(x=>windowSeasons.has(x)));
  return {item,outOfSeason:out,windowSeasons:[...windowSeasons],paths,crafted:crafted.has(item)};
}
const short=DAYS<30?`（本次只跑 ${daysRun} 天，30 天窗口未满）`:'';
if(PART==='main'){
  // R 补货
  put('R1-sample','补货',soldOut.length>=5&&new Set(soldOut.map(s=>s.group)).size>=5?'pass':'fail',
    `真实买空 ${soldOut.length} 项（${new Set(soldOut.map(s=>s.group)).size} 个标签组，均非燕麦）`,{sample});
  const sampleRestock=soldOut.map(s=>({...s,restock:restockEvents.find(e=>e.owner===s.seller&&e.item===s.item)??null}));
  const restored=sampleRestock.filter(s=>s.restock);
  // 季节外：没恢复或追溯不到、而该物确实不在季节的，判 blocked 并列明细，不判 pass。
  const notRestored=sampleRestock.filter(s=>!s.restock),nrSeason=notRestored.filter(s=>seasonInfo(s.item).outOfSeason);
  put('R2-restored','补货',!soldOut.length?'fail':restored.length===soldOut.length?'pass':notRestored.length===nrSeason.length?'blocked':'fail',
    `买空的 ${soldOut.length} 项中 ${restored.length} 项在 ${daysRun} 天内恢复上架${short}${nrSeason.length?`；季节外 ${nrSeason.length} 项：${nrSeason.map(s=>s.item).join('，')}`:''}`,{sampleRestock,seasonOut:nrSeason.map(s=>seasonInfo(s.item))});
  const tracedOk=e=>e.trace==='producer-chain'||e.trace==='self-production'||e.trace==='earlier-production';
  const r3=restored.filter(s=>tracedOk(s.restock)),r3bad=restored.filter(s=>!tracedOk(s.restock)),r3season=r3bad.filter(s=>s.restock.trace==='untraced'&&seasonInfo(s.item).outOfSeason);
  put('R3-traced','补货',!restored.length?'fail':!r3bad.length?'pass':r3bad.length===r3season.length?'blocked':'fail',
    `恢复的 ${restored.length} 项中 ${r3.length} 项能追到生产者（当步该物无 src:import，对手方是产出者、其下游、承运账户，或持有窗口外更早的真实产出批次）；其余：${r3bad.map(s=>s.item+':'+(r3season.includes(s)?'季节外':s.restock.trace)).join('，')||'无'}`,{seasonOut:r3season.map(s=>seasonInfo(s.item))});
  const crossAll=restockEvents.filter(e=>e.cross&&tracedOk(e));
  const crossCarried=crossAll.filter(e=>e.carriage?.length);
  put('R4-carriage','补货',crossAll.length&&crossCarried.length===crossAll.length?'pass':crossAll.length?'fail':(restored.length?'fail':'blocked'),
    crossAll.length?`跨聚落进货 ${crossAll.length} 次，其中有真实承运记录 ${crossCarried.length} 次`:restored.length?'没有任何跨聚落进货：补货全在本地完成或来自水龙头':'无可判的补货（R2 未成立）：缺持货人向生产者进货的分销规律',
    {crossAll});
  const natural=[...naturalSoldOut].map(([k,v])=>{const [owner,item]=k.split('|');return {owner,item,soldOutDay:v.day,restock:restockEvents.find(e=>e.owner===owner&&e.item===item)??null};});
  const natOk=natural.filter(n=>n.restock&&tracedOk(n.restock)),natBad=natural.filter(n=>!natOk.includes(n)),natSeason=natBad.filter(n=>(!n.restock||n.restock.trace==='untraced')&&seasonInfo(n.item).outOfSeason);
  put('R5-natural','补货',!natural.length?'blocked':!natBad.length?'pass':natBad.length===natSeason.length?'blocked':'fail',
    natural.length?`自然卖空 ${natural.length} 项（${new Set(natural.map(n=>n.item)).size} 种物），其中恢复且可追溯 ${natOk.length} 项${short}${natSeason.length?`；季节外 ${natSeason.length} 项：${natSeason.map(n=>n.item).join('，')}`:''}`:'窗口内没有自然卖空（无顾客从持货人处买到卖空），无法判定',{natural:natural.slice(0,80)});
  const nonOat=new Set(natOk.concat(restored.filter(s=>tracedOk(s.restock)).map(s=>({item:s.item}))).map(x=>x.item).filter(i=>i!=='item_oats'));
  put('R6-not-only-oats','补货',nonOat.size>=5?'pass':'fail',`可追溯恢复的非燕麦物品 ${nonOat.size} 种：${[...nonOat].slice(0,20).join('，')}`,{});

  // M 商人套利
  const pairs=[];const last=prices[prices.length-1];
  for(let d=0;d<prices.length;d++)for(const [item,p] of Object.entries(prices[d])){
    const ss=Object.keys(p);for(const a of ss)for(const b of ss){if(a===b||!(p[a]>0))continue;const g=p[b]/p[a]-1;
      if(g>=0.25&&!pairs.some(x=>x.item===item&&x.low===a&&x.high===b))pairs.push({item,low:a,high:b,day:d,gap:g});}}
  const tlist=[...trades.values()];
  const npcIds=new Set(Object.keys(endDoc.state.npcs));
  const trips=[];
  for(const buy of tlist){if(!npcIds.has(buy.buyer))continue;
    const sA=L.settlementOf(endDoc,buy.place);
    for(const sell of tlist){if(sell.seller!==buy.buyer||sell.item!==buy.item||!(sell.minute>buy.minute))continue;const sB=L.settlementOf(endDoc,sell.place);if(sB===sA)continue;
      trips.push({merchant:buy.buyer,item:buy.item,from:sA,to:sB,bought:buy.quantity,sold:sell.quantity,buyMinute:buy.minute,sellMinute:sell.minute,buyUnit:buy.totalCoins/buy.quantity,sellUnit:sell.totalCoins/sell.quantity});}}
  for(const [k,list] of npcFlows){const [merchant,item]=k.split('|');
    for(const a of list.filter(x=>x.side==='in'))for(const b of list.filter(x=>x.side==='out'&&x.minute>a.minute))if(a.settlement&&b.settlement&&a.settlement!==b.settlement){
      if(!trips.some(t=>t.merchant===merchant&&t.item===item&&t.from===a.settlement&&t.to===b.settlement))trips.push({merchant,item,from:a.settlement,to:b.settlement,buyDay:a.day,sellDay:b.day,evidence:'ledger'});break;}}
  put('M1-gap','商人套利',pairs.length?'pass':'fail',pairs.length?`出现足够大价差（≥25%）的物品与聚落对 ${pairs.length} 个`:`${daysRun} 天内各聚落的区域价格没有一对相差 ≥25%：价格不随聚落间供需分化`,{pairs:pairs.slice(0,40)});
  const matched=trips.filter(t=>pairs.some(p=>p.item===t.item&&p.low===t.from&&p.high===t.to));
  put('M2-merchant','商人套利',matched.length?'pass':pairs.length?'fail':'blocked',
    matched.length?`商人沿价差方向真实搬运 ${matched.length} 趟：${[...new Set(matched.map(t=>t.merchant))].join('，')}`:pairs.length?`有价差但没有商人从低价地买进、到高价地卖出（跨聚落转卖 ${trips.length} 趟）`:'缺：价格随聚落供需分化（M1 未成立），无从判断商人是否套利',{trips:trips.slice(0,40)});
  const narrowed=matched.map(t=>{const p=pairs.find(p=>p.item===t.item&&p.low===t.from&&p.high===t.to);const e=last[t.item];const now=e?.[t.to]/e?.[t.from]-1;return {...t,gapAtStart:p.gap,gapAtEnd:now,narrowed:now<p.gap};});
  put('M3-narrows','商人套利',narrowed.length&&narrowed.every(n=>n.narrowed)?'pass':narrowed.length?'fail':'blocked',
    narrowed.length?`搬运后价差收窄 ${narrowed.filter(n=>n.narrowed).length}/${narrowed.length}`:'缺：商人套利搬运（M2 未成立）',{narrowed});

  // S 派生商店
  const bySeller=new Map();
  for(const t of tlist){if(!npcIds.has(t.seller)||keepers.has(t.seller)||t.buyer===t.seller||t.buyer==='player')continue;const s=bySeller.get(t.seller)??{buyers:new Set(),items:new Set()};s.buyers.add(t.buyer);s.items.add(t.item);bySeller.set(t.seller,s);}
  const derived=[...bySeller].filter(([id,s])=>s.buyers.size>=2&&[...s.items].some(item=>legit.get(item)?.has(id)||producers.get(item)?.has(id)))
    .map(([id,s])=>({id,buyers:s.buyers.size,items:[...s.items],shopType:world_shopType(id),originallyTrade:sellers.includes(id)}));
  function world_shopType(id){return L.world.npcs.find(n=>n.id===id)?.shopType??null;}
  put('S1-derived','派生商店',derived.length>0&&derived.every(d=>!d.shopType)?'pass':'fail',
    `派生卖家 ${derived.length} 位（非登记店主、无 shopType、向 ≥2 位不同买主出售、所售物由生产补进）；有卖货记录的非店主 ${bySeller.size} 位`,{derived:derived.slice(0,40)});
  let buyTry=null;
  if(derived.length){const d=derived[0],loc=endDoc.state.npcs[d.id]?.location;const item=d.items.find(i=>L.stock(ctx.doc,d.id,i)>0);
    if(loc&&item){await L.call(ctx,'world_move',{destination:loc});const t=await L.call(ctx,'world_trade',{seller:d.id,item,quantity:1});buyTry={seller:d.id,item,status:t.status,reason:t.reason};}}
  put('S2-buy-from-derived','派生商店',buyTry?.status==='committed'?'pass':derived.length?'fail':'blocked',
    buyTry?`玩家向派生卖家 ${buyTry.seller} 买 ${buyTry.item}：${buyTry.status}${buyTry.reason?'，'+buyTry.reason:''}`:derived.length?'派生卖家手上没有可买的货':'缺：派生卖家（S1 未成立）',{buyTry});

  // T 没有水龙头
  for(const [i,w] of IMPORT_WRITERS.entries()){
    if(w!=='shop'){
      const m={};for(const [wr,mm] of Object.entries(importsByWriter))if(WRITER_RE[w].test(wr))for(const [r,v] of Object.entries(mm))m[r]=(m[r]??0)+v;
      const n=Object.values(m).reduce((a,b)=>a+b,0),tr=triggers[w==='works'?'works':'quest'];
      const fired=tr.some(t=>t.status==='committed');
      let status,detail;
      if(n>0){status='fail';detail=`${daysRun} 天里 ${w} 凭空进货 ${n} 件（${Object.keys(m).join('，')}）`;}
      else if(!fired){status='blocked';detail=w==='works'&&study.skill?`开局著作动作被拒（${tr.filter(t=>t.reason).map(t=>t.action+'：'+t.reason).join('；')}）；已走学艺路径：向 ${study.teacher} 学 ${study.skillName}，阶段 ${study.phase}，熟练度 ${Math.max(0,prof())}/${study.threshold}。学到门槛约需 17 天，只有 30 天正式跑能完成${short}`:`玩家动作触发不了 ${w}：${tr.map(t=>t.action+'：'+(t.reason??t.status)).join('；')}`;}
      else if(w==='quest-sources'){
        const g=questGoods[0];const acc=tr.find(t=>t.action==='accept'&&t.status==='committed');
        const delivered=g||acc?.complete?.status==='committed';
        if(!delivered){status='blocked';detail=`已触发（${tr.filter(t=>t.status==='committed').map(t=>t.action+' '+(t.quest??'')).join('，')}），但窗口内没有任何任务交付物流动，无法判断供货来源${short}`;}
        else if(g&&(g.import>0||!g.counterparts.length)){status='fail';detail=`任务交付物 ${g.item}×${g.qty} 没有追到真实持货人（当步 src:import ${g.import}，对手方 ${g.counterparts.join('，')||'无'}）`;}
        else{status='pass';detail=`已触发任务（${tr.filter(t=>t.status==='committed').map(t=>t.action).join('，')}），交付物来自真实持货人 ${g?g.counterparts.join('，'):'（玩家向持货人自购后交付）'}，quest-sources 凭空进货 0`;}
      }else{status='pass';detail=`已触发著作动作（${tr.filter(t=>t.status==='committed').map(t=>t.action).join('，')}），works 凭空进货 0`;}
      put(`T${i+1}-no-import-${w}`,'没有水龙头',status,detail,{byItem:m,triggers:tr,questGoods,study:w==='works'?study:undefined});
      continue;
    }
    const m={};for(const [wr,mm] of Object.entries(importsByWriter))if(WRITER_RE[w].test(wr))for(const [r,v] of Object.entries(mm))m[r]=(m[r]??0)+v;const n=Object.values(m).reduce((a,b)=>a+b,0);
    put(`T${i+1}-no-import-${w}`,'没有水龙头',n===0?'pass':'fail',`${daysRun} 天里 ${w} 凭空进货 ${n} 件（${Object.keys(m).length} 种）`,{byItem:m});
  }
  // 只有数据里带理由、点名具体资源（不是 '*'）的"图外供给方"声明才豁免；没有声明时任何物品进货都是水龙头。
  const decl=declaredBoundaries(L.world);
  const exempt=(w,r)=>decl.some(d=>d.resource===r&&(!d.writer||d.writer===w));
  const others=Object.entries(importsByWriter).filter(([w])=>!Object.values(WRITER_RE).some(re=>re.test(w))).map(([w,m])=>[w,Object.fromEntries(Object.entries(m).filter(([r])=>!exempt(w,r)))]).filter(([,m])=>Object.keys(m).length);
  const flowImport={};for(const [k,v] of Object.entries(endDoc.ledger.flows))if(k.startsWith('src:import|')&&!/\|coin_/.test(k)){const r=k.split('|')[1];flowImport[r]=(flowImport[r]??0)-(startDoc.ledger?.flows?.[k]??0)+v;}
  for(const r of Object.keys(flowImport))if(decl.some(d=>d.resource===r&&!d.writer))delete flowImport[r];
  const flowTotal=Object.values(flowImport).reduce((a,b)=>a+b,0);
  put('T4-only-declared-boundary','没有水龙头',others.length===0&&flowTotal===0?'pass':'fail',
    `其他写入者的物品进货：${others.map(([w,m])=>w+':'+Object.values(m).reduce((a,b)=>a+b,0)).join('，')||'无'}；账本 src:import 物品流入合计 ${flowTotal}；带理由的图外供给声明 ${decl.length} 条${decl.length?'：'+decl.map(d=>(d.writer??'*')+'/'+d.resource).join('，'):''}（军粮等未声明的进货一律算水龙头）`,{others:Object.fromEntries(others),flowImport,declared:decl});
  // 对照（不计入判定）：S5 的燕麦周度承运用同一套追溯量具应当被认出——跨聚落、来源是产出者链、有承运记录。
  const oat=crossTransfers.filter(t=>t.item==='item_oats');
  control={oatCrossTransfers:oat.length,traced:oat.filter(t=>t.traced).length,withCarriage:oat.filter(t=>t.carriage?.length).length,sample:oat.slice(0,5),
    note:'燕麦周贸易第 7 天起才发车，短跑（<8 天）时为 0 属正常'};
  console.log('[control] 燕麦跨聚落转手',JSON.stringify({n:control.oatCrossTransfers,traced:control.traced,carriage:control.withCarriage}));
}else{
  // G 通用性变异
  const item=mutSpec.item;
  const crafted=Object.entries(endDoc.ledger.flows).filter(([k])=>k.startsWith('src:craft|'+item+'|')).reduce((n,[,v])=>n+v,0);
  const P=producers.get(item)??new Map();const prodSettlements=new Set([...P.keys()].map(o=>L.settlementOfOwner(endDoc,o)));
  const held=[...(everHeld.get(item)??new Set())].map(o=>({owner:o,settlement:L.settlementOfOwner(endDoc,o)}));
  const elsewhere=held.filter(h=>!prodSettlements.has(h.settlement));
  const imported=Object.entries(endDoc.ledger.flows).filter(([k])=>k.startsWith('src:import|'+item+'|')).reduce((n,[,v])=>n+v,0)
    +Object.values(importsByWriter).reduce((n,m)=>n+(m[item]??0),0);
  const genesis=Object.entries(endDoc.ledger.flows).filter(([k])=>k.startsWith('src:genesis|'+item+'|')).reduce((n,[,v])=>n+v,0);
  put('G1-novel-produced','分销通用',crafted>0?'pass':'blocked',crafted>0?`新物 ${mutSpec.name} 被生产 ${crafted} 件，产地 ${[...prodSettlements].join('，')}`:`新物 ${mutSpec.name} ${daysRun} 天内无人生产。缺：按需求经配方生产的规律（上游卡 C/K1、劳动卡 D/K3）`,{mutSpec});
  put('G2-novel-distributed','分销通用',elsewhere.length?'pass':crafted>0?'fail':'blocked',
    elsewhere.length?`新物到达产地以外的聚落：${[...new Set(elsewhere.map(h=>h.settlement))].join('，')}`:crafted>0?`新物只停留在产地（持有人 ${held.length} 位）${short}`:'缺：新物的生产（G1 未成立）',{held});
  put('G3-novel-no-tap','分销通用',crafted>0?(imported===0&&genesis===0?'pass':'fail'):'blocked',crafted>0?`新物凭空进货 ${imported}，开局存量 ${genesis}`:'缺：新物的生产（G1 未成立）；没有生产时"无水龙头"为空真，不计 pass',{imported,genesis});
}
// V 守恒（两部分都判）
const audit=L.auditLedger(endDoc.ledger)??[];
const drift=L.driftCounts(endDoc);
let cons=[];try{cons=L.conservation(ctx.engine,startDoc,endDoc)??[];}catch(e){cons=[{error:String(e.message??e)}];}
const driftBad=!!(drift?.gap||drift?.unbooked||drift?.holding||(endDoc.ledger?.drift??[]).length);
put(`V1-audit-${PART}`,'守恒',(Array.isArray(audit)?audit.length:Object.keys(audit).length)===0?'pass':'fail',`账本审计问题 ${Array.isArray(audit)?audit.length:Object.keys(audit).length} 条`,{audit:Array.isArray(audit)?audit.slice(0,20):audit});
put(`V2-conservation-${PART}`,'守恒',cons.length===0&&!driftBad?'pass':'fail',`逐资源守恒偏差 ${cons.length} 种；漂移 ${JSON.stringify(drift)}`,{cons:cons.slice(0,20)});

const summary={part:PART,control,crossTransfers:crossTransfers.slice(0,300),repo:L.REPO,days:DAYS,daysRun,elapsedMs:Date.now()-started,counts:Object.fromEntries(['pass','fail','blocked'].map(s=>[s,results.filter(r=>r.status===s).length])),results,
  importsByWriter,restockEvents:restockEvents.slice(0,200),stepTail:step.slice(-3),actionLog:ctx.log.filter(l=>l.tool!=='world_time').slice(0,60)};
await L.writeJson(`${HERE}/part-${PART}.json`,summary);
// 合并
const merged={generated:new Date().toISOString(),parts:{},results:[]};
for(const p of ['main','mut']){try{const s=JSON.parse(await fs.readFile(`${HERE}/part-${p}.json`,'utf8'));merged.parts[p]={repo:s.repo,days:s.days,daysRun:s.daysRun,elapsedMs:s.elapsedMs,counts:s.counts};merged.results.push(...s.results.map(r=>({part:p,id:r.id,group:r.group,status:r.status,detail:r.detail})));}catch{}}
merged.counts=Object.fromEntries(['pass','fail','blocked'].map(s=>[s,merged.results.filter(r=>r.status===s).length]));
try{const exp=JSON.parse(await fs.readFile(`${HERE}/expected.json`,'utf8'));merged.expected=exp.shouldPass.map(e=>({part:e.part,id:e.id,status:merged.results.find(r=>r.part===e.part&&r.id===e.id)?.status??'not-run'}));
  merged.expectedMet=merged.expected.filter(e=>e.status==='pass').length+'/'+merged.expected.length;}catch{}
await L.writeJson(`${HERE}/acceptance.json`,merged);
console.log(`${PART}: ${JSON.stringify(summary.counts)} 用时 ${Math.round(summary.elapsedMs/1000)}s；合并 ${JSON.stringify(merged.counts)}；期望达成 ${merged.expectedMet}`);
process.exitCode=merged.counts.fail||merged.counts.blocked?1:0;

// 数据里的"图外供给方"声明：在 world.rules 里找键名含 boundar 的数组，条目须点名具体资源（item/resource，不是 '*'）并带理由（reason/why/note）。
function declaredBoundaries(w){
  const out=[];const walk=(o,d=0)=>{if(!o||typeof o!=='object'||d>8)return;for(const [k,v] of Object.entries(o)){
    if(/boundar/i.test(k)&&Array.isArray(v)){for(const e of v){const r=e?.resource??e?.item;const why=e?.reason??e?.why??e?.note;if(typeof r==='string'&&r!=='*'&&typeof why==='string'&&why.trim())out.push({resource:r,writer:e.writer??null,reason:why});}}
    else walk(v,d+1);}};
  walk(w.rules);return out;
}

// 对手方手里该物的批次：入库日早于开局（day<0）且不是开局批次（id 不含 opening/genesis/initial）——窗口外更早的真实产出。
function earlierLot(doc,owner,item){
  for(const [k,list] of Object.entries(doc.ledger?.lots??{})){if(!k.startsWith(owner+'|'+item+'|'))continue;
    if((list??[]).some(l=>(l.day??0)<0&&!/opening|genesis|initial/i.test(l.id??'')&&l.qty>0))return true;}
  return false;
}
