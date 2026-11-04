// 卡 B 畜牧规律·独立验收。全部断言写成世界里的现象：用 world_time 推进、world_act / world_propose 真实动作驱动，
// 只读存档（state、ledger）。前提（玩家仓里有多少饲料）用 applyIntentSetup.inventory 设，和 tests/s5-06 相同，不造结果。
// 用法：TEMP=F:/dnd-tmp TMP=F:/dnd-tmp node F:/dnd-tmp/b-husbandry-acc/acceptance.mjs --days N   （默认 3；正式 30）
// 环境变量 ACC_REPO 指定被测仓库（默认 F:/dnd-wt/S5FIX）。结果写 acceptance.json；全过退出码 0。
import fs from 'node:fs/promises';
import {world,newGame,act,propose,wait,premise,say,auditLedger,conservation,loadWorld,readJson,REPO,HERE} from './lib.mjs';
import {buildMut} from './mutate.mjs';

const arg=(k,d)=>{const i=process.argv.indexOf(k);return i>0?process.argv[i+1]:d;};
const DAYS=Math.max(1,Number(arg('--days',3))),OUT=arg('--out',`${HERE}/acceptance.json`);
const DAY=1440,T0=Date.now();
const results=[];
function check(group,phenomenon,outcome,evidence){results.push({group,phenomenon,result:outcome===true?'pass':outcome===false?'fail':outcome,evidence});console.log(`[${outcome===true?'pass':outcome===false?'fail':outcome}] ${group}｜${phenomenon}`);return outcome===true;}
const blocked=(g,p,e)=>check(g,p,'blocked',e);
const log=(...a)=>console.log(`  (${((Date.now()-T0)/1000).toFixed(0)}s)`,...a);

// —— 物品分类：先看物品的 tags，没有 tags 再看名字。只用于给"奶、毛、皮、蛋、肉、骨"归类，不是产物名单。——
const CLASS={
  奶:{tags:/^(milk)$/,name:/乳|奶/},
  毛:{tags:/^(hair|wool|fleece|fur)$/,name:/毛|绒/},
  皮:{tags:/^(hide|pelt|skin|rawhide)$/,name:/生皮|兽皮|皮张/},
  蛋:{tags:/^(egg)$/,name:/蛋|卵/},
  肉:{tags:/^(meat|flesh)$/,name:/肉/},
  骨:{tags:/^(bone)$/,name:/骨/}
};
function itemIndex(w){return new Map(w.items.map(i=>[i.id,i]));}
function classOf(I,id){
  const it=I.get(id),tags=it?.tags??[];
  return Object.keys(CLASS).filter(c=>tags.length?tags.some(t=>CLASS[c].tags.test(t)):CLASS[c].name.test(it?.name??''));
}
const weightOf=(I,id)=>I.get(id)?.weight??0;
// 账本：flows 键形如 "src:husbandry|item|purpose"；accounts 键形如 "owner|resource|purpose"。
const parse=k=>{const [a,b,c]=k.split('|');return {a,b,c};};
// 开局存量（src:genesis|*|opening，有的在第一天才落账）既不算新增，也不算畜群产出，单独列出。
const OPENING=(src,purpose)=>src==='src:genesis'&&purpose==='opening';
const FORBIDDEN_RE=/^src:(import|regrowth|genesis|setup|premise|fixture)/;
const FORBIDDEN={test:k=>FORBIDDEN_RE.test(k)};
const HERD_SRC=(src,purpose)=>src==='src:husbandry'||/^src:(harvest|slaughter|butcher)/.test(src)&&/husbandry|herd|population|slaught|宰/.test(purpose??'');
function flowDelta(before,after){const d={};for(const [k,v] of Object.entries(after.ledger?.flows??{})){const x=v-(before.ledger?.flows?.[k]??0);if(x)d[k]=x;}return d;}
function stockOf(doc,ids){const s={};for(const [k,v] of Object.entries(doc.ledger?.accounts??{})){const {b}=parse(k);if(ids.has(b)&&v>0)s[b]=(s[b]??0)+v;}return s;}
function books(engine,before,after){const a=auditLedger(after.ledger),k=conservation(engine,before,after);return {ok:!a.length&&!k.length,audit:a.slice(0,3),conservation:k.slice(0,3)};}
const herdRec=(doc,id)=>doc.state.records[`husbandry:${id}`]??Object.values(doc.state.records).find(r=>r.id===id&&r.category==='husbandry');
const herds=doc=>Object.values(doc.state.records).filter(r=>r.category==='husbandry');
// 饲料流：汇流出且用途是喂养/放牧的（不看具体物品 id）。
const FEED=/feed|fodder|graz|pasture|饲|牧/;
const feedFlows=d=>Object.entries(d).filter(([k,v])=>{const {a,c}=parse(k);return a.startsWith('sink:')&&FEED.test(c??'')&&v>0;});
// 饥饿/死亡信号：畜群记录里名字带饥饿、饿死、死亡的计数字段（病死不算），或头数下降。
const STARVE=/starv|hunger|famine|饥|饿|death|dead|died/i;
const starveSignal=(r0,r1)=>Object.keys(r1??{}).filter(k=>STARVE.test(k)&&!/disease/i.test(k)&&typeof r1[k]==='number'&&r1[k]>(r0?.[k]??0));
// 饲料前提：world.items 里 tags 属于谷物/草料一类的物品（不看 id），每天把玩家仓里的这些物品设成 q。
const feedBasket=w=>w.items.filter(i=>(i.tags??[]).some(t=>/^(grain|fodder|feed|hay|forage|grass|straw)$/.test(t))).map(i=>i.id);
const setFeed=(c,ids,q)=>premise(c,{inventory:Object.fromEntries(ids.map(i=>[i,q]))});
// 放牧来源：畜群所在地（或其栖地）相关的记录里，名字像草场/可食生物量的数值字段。断料时一并清零（只在副本测试档上做）。
const FORAGE=/grass|forage|pasture|graz|biomass|fodder|herbage|草/i;
function pastureFacts(doc,herdIds){
  const locs=new Set(herdIds.map(h=>herdRec(doc,h)?.location).filter(Boolean)),facts=[];
  const walk=(o,path,depth)=>{if(!o||typeof o!=='object'||depth>4)return;for(const [k,v] of Object.entries(o)){
    if(typeof v==='number'&&v>0&&FORAGE.test(k))facts.push({path:[...path,k],value:0});else if(v&&typeof v==='object')walk(v,[...path,k],depth+1);}};
  for(const [key,r] of Object.entries(doc.state.records??{})){
    if(r?.category==='husbandry')continue;
    const here=[r?.location,r?.place,r?.at,r?.site].some(x=>locs.has(x))||[...locs].some(l=>key.includes(l));
    if(here)walk(r,['state','records',key],0);
  }
  return facts;
}
// 断掉一群畜的全部饲料来源：仓里饲料清零；若有放牧来源，把所在地的草场/可食生物量也清零。
function cutFeed(c,ids,herdIds){const facts=pastureFacts(c.doc,herdIds);const u=setFeed(c,ids,0);const u2=facts.length?premise(c,{facts}):[];return {pasture:facts.map(f=>f.path.join('.')),unmet:[...u,...u2]};}
// 某畜群当天"在产"的物品：record.produce、record.accruals 里 yield:<item> 的正余数、账本 <herd>|<item>|<非 population> 账户。
function producing(doc,hid){
  const r=herdRec(doc,hid)??{},out={};
  for(const [i,q] of Object.entries(r.produce??{}))if(q>0)out[i]=Math.max(out[i]??0,q);
  for(const [k,v] of Object.entries(r.accruals??{})){const m=/^yield:(.+)$/.exec(k);if(m&&Number(v?.numerator??v)>0)out[m[1]]=Math.max(out[m[1]]??0,1e-9);}
  for(const [k,v] of Object.entries(doc.ledger?.accounts??{})){const {a,b,c}=parse(k);if(a===hid&&c!=='population'&&!/^population_/.test(b)&&v>0)out[b]=Math.max(out[b]??0,v);}
  return out;
}

// ========== A 30 天产出（原仓库世界，玩家不动，只推进时间）==========
async function groupA(){
  const G='A 30天产出',E='E 饲料来源',c=newGame('acc-A'),I=itemIndex(world),start=c.doc;
  const watched=new Set([...I.keys()].filter(id=>classOf(I,id).some(x=>['奶','毛','皮','蛋'].includes(x))));
  const days=[];let prev=c.doc;
  for(let d=1;d<=DAYS;d++){
    const r=await wait(c,DAY);if(r.status==='rejected'){log('推进时间被拒',r.reason);break;}
    const fd=flowDelta(prev,c.doc);
    for(const k of Object.keys(fd)){const {a,b}=parse(k);if(a==='src:husbandry'&&!I.has(b))watched.add(b);} // 运行中新出现的产物也纳入
    days.push({day:d,stock:stockOf(c.doc,watched),flows:Object.fromEntries(Object.entries(fd).filter(([k])=>watched.has(parse(k).b))),feed:feedFlows(fd),
      herds:herds(c.doc).filter(h=>h.owner!=='player').map(h=>({id:h.id,count:h.count,produce:h.produce}))});
    prev=c.doc;if(d%5===0||d===DAYS)log(`A 第 ${d} 天`);
  }
  const W=Math.max(1,Math.floor(days.length/3)),tail=days.slice(-W);
  const classStock=(day,cls)=>Object.entries(day?.stock??{}).filter(([i])=>classOf(I,i).includes(cls)).reduce((n,[,q])=>n+q,0);
  const classInflow=(ds,cls,pred)=>ds.flatMap(x=>Object.entries(x.flows)).filter(([k,v])=>{const {a,b,c}=parse(k);return v>0&&a.startsWith('src:')&&classOf(I,b).includes(cls)&&pred(a,c);}).reduce((n,[,v])=>n+v,0);
  for(const cls of ['奶','毛','皮','蛋']){
    const end=classStock(days.at(-1),cls),herdTail=classInflow(tail,cls,HERD_SRC);
    check(G,`${cls}：${days.length} 天后世界总存量不为零，且最后 ${W} 天仍有畜群新产出`,end>0&&herdTail>0,
      {series:days.map(x=>classStock(x,cls)),herdInflowLastWindow:herdTail,herdInflowTotal:classInflow(days,cls,HERD_SRC),otherRealInflow:classInflow(days,cls,(a,c)=>!HERD_SRC(a,c)&&!FORBIDDEN.test(a)),openingStock:classInflow(days,cls,OPENING)});
  }
  const all=flowDelta(start,c.doc),inflows=Object.entries(all).filter(([k,v])=>v>0&&parse(k).a.startsWith('src:')&&watched.has(parse(k).b));
  const opening=inflows.filter(([k])=>OPENING(parse(k).a,parse(k).c));
  const bad=inflows.filter(([k])=>FORBIDDEN.test(parse(k).a)&&!OPENING(parse(k).a,parse(k).c)),herd=inflows.filter(([k])=>HERD_SRC(parse(k).a,parse(k).c));
  check(G,'奶毛皮蛋的新增量全部有真实产出来源（畜群产出为主），没有进货、再生或开局补货',herd.length>0&&!bad.length,{herdSources:Object.fromEntries(herd),forbidden:Object.fromEntries(bad),openingStock:Object.fromEntries(opening),other:Object.fromEntries(inflows.filter(x=>!bad.includes(x)&&!herd.includes(x)&&!opening.includes(x)))});
  check(G,`${days.length} 天浸泡后账本审计为空、资源守恒`,books(c.engine,start,c.doc).ok,books(c.engine,start,c.doc));
  // E：别人家的畜群（玩家不插手）有没有吃的，吃的从哪来。
  const npcHerds=herds(start).filter(h=>h.owner!=='player');
  const fedDays=days.filter(x=>x.feed.length).length;
  check(E,`别人家的畜群（${npcHerds.map(h=>h.name).join('、')}）在玩家不插手时有饲料：${days.length} 天里至少八成日子有喂养或放牧的消耗`,npcHerds.length>0&&fedDays>=Math.ceil(days.length*0.8),{fedDays,days:days.length,sample:days.slice(0,3).map(x=>x.feed),herdCounts:days.map(x=>x.herds.map(h=>h.count).join('/'))});
  const eaten={};for(const x of days)for(const [k,v] of x.feed){const {b}=parse(k);eaten[b]=(eaten[b]??0)+v;}
  const traced=Object.entries(eaten).map(([item,q])=>{
    const ins=Object.entries(all).filter(([k,v])=>v>0&&parse(k).b===item&&parse(k).a.startsWith('src:'));
    const real=ins.filter(([k])=>!/^src:(import|genesis|setup|premise|fixture)/.test(parse(k).a)).reduce((n,[,v])=>n+v,0);
    const imp=ins.filter(([k])=>/^src:import/.test(parse(k).a)).reduce((n,[,v])=>n+v,0);
    return {item,eaten:q,realInflow:real,importInflow:imp,ok:imp===0&&real>=q};
  });
  check(E,'畜群吃掉的饲料都能追到真实来源（草场、作物、采集），同期真实产出不少于被吃掉的量，且没有进货',traced.length>0&&traced.every(x=>x.ok),{traced,note:traced.length?undefined:'这段时间没有任何喂养或放牧消耗'});
}

// ========== B 繁育受约束（副本世界：玩家名下的现有物种畜群；饲料是玩家仓里的前提）==========
async function groupB(){
  const G='B 繁育受约束';
  let info,w;
  try{info=await buildMut({set:'B'});w=await loadWorld(info.root);}
  catch(e){for(const p of ['有饲料、有空栏：畜群繁育，头数增加','断掉饲料：繁育下降','断掉饲料：出现饥饿或死亡','断掉饲料：活体产量下降','栏圈满：有饲料也不再增长，头数不超过栏圈','饲料恢复：头数回升','繁育实验后账本审计为空、资源守恒'])blocked(G,p,`副本世界加载失败：${e.message}`);return null;}
  const c=newGame('acc-B',w),start=c.doc,basket=feedBasket(w),P=Math.max(1,Math.floor(DAYS/3)),I=itemIndex(w);
  const B='population_acc_breed',PEN='population_acc_pen';
  const rows=[];
  const pastureLog=[];
  const run=async(phase,n,q)=>{for(let i=0;i<n;i++){let u;if(phase==='cut'){const r=cutFeed(c,basket,[B,PEN]);pastureLog.push(r.pasture);u=r.unmet;}else u=setFeed(c,basket,q);const before=c.doc;await wait(c,DAY);const fd=flowDelta(before,c.doc);
    const out=Object.entries(fd).filter(([k,v])=>v>0&&parse(k).a==='src:husbandry').reduce((n,[,v])=>n+v,0);
    rows.push({phase,breed:{...pick(herdRec(c.doc,B))},pen:{...pick(herdRec(c.doc,PEN))},produced:out,feed:feedFlows(fd),unmet:u.length?u:undefined});}};
  const pick=r=>r&&Object.fromEntries(Object.entries(r).filter(([k,v])=>typeof v==='number'));
  const r0=pick(herdRec(c.doc,B)),pen0=pick(herdRec(c.doc,PEN));
  await run('fed',P,60);await run('cut',P,0);await run('restore',P,60);log('B 完成');
  const ph=p=>rows.filter(r=>r.phase===p),endOf=p=>ph(p).at(-1)?.breed??r0,startOf=p=>p==='fed'?r0:endOf({cut:'fed',restore:'cut'}[p]);
  const births=p=>(endOf(p).born??0)-(startOf(p).born??0);
  const ev={basket,phaseDays:P,pastureCut:pastureLog.flat().length?[...new Set(pastureLog.flat())]:'未发现放牧来源，只清零仓里饲料',start:r0,rows:rows.map(r=>({phase:r.phase,count:r.breed?.count,born:r.breed?.born,penCount:r.pen?.count,produced:r.produced,fed:r.feed.length>0}))};
  check(G,'有饲料、有空栏：畜群繁育，头数增加',births('fed')>0&&endOf('fed').count>r0.count,ev);
  check(G,'断掉饲料：繁育下降（断料期出生数少于有料期）',births('cut')<births('fed'),{fedBirths:births('fed'),cutBirths:births('cut')});
  const sig=starveSignal(endOf('fed'),endOf('cut'));
  check(G,'断掉饲料：出现饥饿或死亡（头数下降，或记录里饥饿/死亡计数上升）',endOf('cut').count<endOf('fed').count||sig.length>0,{fedEnd:endOf('fed'),cutEnd:endOf('cut'),signals:sig});
  const perDay=p=>ph(p).reduce((n,r)=>n+r.produced,0)/Math.max(1,ph(p).length);
  check(G,'断掉饲料：活体产量下降',perDay('cut')<perDay('fed'),{fedPerDay:perDay('fed'),cutPerDay:perDay('cut')});
  const penMax=Math.max(...ph('fed').map(r=>r.pen?.count??0)),penEnd=ph('fed').at(-1)?.pen;
  check(G,'栏圈满：有饲料也不再增长，头数不超过栏圈',!!penEnd&&penMax<=pen0.capacity&&penEnd.count<=pen0.count,{capacity:pen0.capacity,start:pen0.count,series:ph('fed').map(r=>r.pen?.count),penBorn:(penEnd?.born??0)-(pen0.born??0)});
  check(G,'饲料恢复：头数回升（恢复期末头数高于断料期末）',endOf('restore').count>endOf('cut').count,{cutEnd:endOf('cut').count,restoreEnd:endOf('restore').count,restoreBirths:births('restore')});
  const bk=books(c.engine,start,c.doc);check(G,'繁育实验后账本审计为空、资源守恒',bk.ok,bk);
  return {w,info};
}

// ========== C 由属性派生（副本世界：新物种，只给属性、不给产物名单；以及去掉属性的对照）==========
async function groupC(){
  const G='C 由属性派生';
  const info=await buildMut({set:'C'});let w;
  const desc=info.novel.map(n=>`${n.name}（${n.id}，克隆自 ${n.src}，${n.withAttributes?'保留全部属性':'去掉属性'}，tags=${JSON.stringify(n.monster.tags??null)}）`);
  try{w=await loadWorld(info.root);check(G,'只给属性、不写产物名单的新物种能进世界（加载不拒绝）',true,{novel:desc});}
  catch(e){
    check(G,'只给属性、不写产物名单的新物种能进世界（加载不拒绝）',false,{novel:desc,loadError:e.message});
    for(const p of ['新的产乳兽类（雾鬃兽）照样产奶','新的有毛被兽类（雾鬃兽）照样产毛','新的产卵禽类（苇冠禽）照样产蛋'])check(G,p,false,{why:'新物种没能进世界：加载要求手写产物名单（缺：由属性派生产物的规律）',loadError:e.message});
    for(const p of ['去掉属性的兽类（素雾兽）不产奶、不产毛','去掉属性的禽类（素苇禽）不产蛋','产量随饲料：同一群有料日产奶多于断料日','新物种的产物能用真实动作采到手'])blocked(G,p,'前提未成立：新物种没能进世界（缺：由属性派生产物的规律）');
    return null;
  }
  const c=newGame('acc-C',w),I=itemIndex(w),basket=feedBasket(w),N=Math.min(10,Math.max(2,DAYS));
  const H={x:'population_acc_x',x0:'population_acc_x0',y:'population_acc_y',y0:'population_acc_y0'};
  const seen=Object.fromEntries(Object.keys(H).map(k=>[k,{}]));const milkDay=[];
  const note=()=>{for(const [k,h] of Object.entries(H))for(const [i,q] of Object.entries(producing(c.doc,h)))seen[k][i]=Math.max(seen[k][i]??0,q);};
  const milkOf=hid=>Object.entries(herdRec(c.doc,hid)?.produce??{}).filter(([i])=>classOf(I,i).includes('奶')).reduce((n,[,q])=>n+q,0);
  for(let d=0;d<N;d++){setFeed(c,basket,60);await wait(c,DAY);note();milkDay.push({fed:true,milk:milkOf(H.x)});}
  const cutC=cutFeed(c,basket,Object.values(H));await wait(c,DAY);note();milkDay.push({fed:false,milk:milkOf(H.x)});log('C 完成');
  const has=(k,cls)=>Object.keys(seen[k]).filter(i=>classOf(I,i).includes(cls));
  const ev=k=>({herd:H[k],producing:Object.fromEntries(Object.entries(seen[k]).map(([i,q])=>[i,{q,class:classOf(I,i),name:I.get(i)?.name}]))});
  check(G,'新的产乳兽类（雾鬃兽）照样产奶',has('x','奶').length>0,ev('x'));
  check(G,'新的有毛被兽类（雾鬃兽）照样产毛（成件，或产毛余数在累积）',has('x','毛').length>0,ev('x'));
  check(G,'新的产卵禽类（苇冠禽）照样产蛋',has('y','蛋').length>0,ev('y'));
  check(G,'去掉属性的兽类（素雾兽）不产奶、不产毛',!has('x0','奶').length&&!has('x0','毛').length,ev('x0'));
  check(G,'去掉属性的禽类（素苇禽）不产蛋',!has('y0','蛋').length,ev('y0'));
  const fedAvg=milkDay.filter(x=>x.fed).reduce((n,x)=>n+x.milk,0)/Math.max(1,milkDay.filter(x=>x.fed).length),cut=milkDay.at(-1).milk;
  check(G,"产量随饲料：同一群有料日产奶多于断料日",fedAvg>cut,{milkDay,pastureCut:cutC.pasture.length?cutC.pasture:"未发现放牧来源，只清零仓里饲料"});
  // 采到手：新物种畜群里任一奶类产物，走 core:husbandry.collect。
  const item=Object.keys(herdRec(c.doc,H.x)?.produce??{}).find(i=>classOf(I,i).includes('奶')&&herdRec(c.doc,H.x).produce[i]>0)
    ??(()=>{return null;})();
  if(!item){
    // 断料日奶已过期，再喂一天
    setFeed(c,basket,60);await wait(c,DAY);setFeed(c,basket,0);
  }
  const it2=Object.keys(herdRec(c.doc,H.x)?.produce??{}).find(i=>classOf(I,i).includes('奶')&&herdRec(c.doc,H.x).produce[i]>0);
  if(!it2)check(G,'新物种的产物能用真实动作采到手',false,{why:'雾鬃兽群当前没有可采的奶类产物',produce:herdRec(c.doc,H.x)?.produce});
  else{const q0=c.doc.state.inventory?.[it2]?.quantity??0,r=await act(c,'core:husbandry.collect',{target:H.x,item:it2,quantity:1});
    check(G,'新物种的产物能用真实动作采到手',r.status==='committed'&&(c.doc.state.inventory?.[it2]?.quantity??0)===q0+1,{item:it2,name:I.get(it2)?.name,collect:say(r)});}
  return {w,info};
}

// ========== D 宰杀自家畜群（依赖 K7 处分权）==========
async function actionsCatalog(root){const out=[];for(const f of await fs.readdir(`${root}/actions`))if(f.endsWith('.json')){const j=await readJson(`${root}/actions/${f}`);out.push(...(Array.isArray(j)?j:j.actions??[]));}return out;}
async function slaughterOne(c,hid){
  const tries=[],n0=herdRec(c.doc,hid)?.count;
  const acts=(await actionsCatalog(`${REPO}/world`)).filter(a=>/宰|屠|slaught|butcher|cull/i.test(JSON.stringify([a.id,a.label,a.verb,a.synonyms])));
  for(const a of acts){const r=await act(c,a.id,{target:hid,quantity:1});tries.push(`${a.id}：${say(r)}`);if(herdRec(c.doc,hid)?.count===n0-1)return {ok:true,tries,via:a.id};}
  for(const eff of [[{op:'vital',target:hid,delta:-1,type:'physical'}],[{op:'vital',target:hid,delta:-999,type:'physical'}]]){
    const r=await propose(c,'宰一头自家畜群里的牲口',eff);tries.push(`world_propose ${JSON.stringify(eff)}：${say(r)}`);if(herdRec(c.doc,hid)?.count===n0-1)return {ok:true,tries,via:'world_propose'};}
  return {ok:false,tries};
}
// 宰后所得：玩家行囊增加的物品；若留下尸体，再用 core:wildlife.gather 取材（买不到工具就记下）。
async function slaughterYield(c,hid,I){
  const inv0=structuredClone(c.doc.state.inventory),cr0=new Set(Object.keys(c.doc.state.creatures??{})),before=c.doc;
  const s=await slaughterOne(c,hid);if(!s.ok)return s;
  const corpse=Object.keys(c.doc.state.creatures??{}).find(id=>!cr0.has(id));
  if(corpse)s.gather=say(await act(c,'core:wildlife.gather',{target:corpse}));
  const gained={};for(const [i,v] of Object.entries(c.doc.state.inventory??{})){const d=(v?.quantity??v)-(inv0[i]?.quantity??inv0[i]??0);if(d>0)gained[i]=d;}
  return {...s,corpse,gained,classes:Object.fromEntries(Object.keys(gained).map(i=>[i,classOf(I,i)])),kg:Object.entries(gained).reduce((n,[i,q])=>n+q*weightOf(I,i),0),before};
}
async function groupD(cw,bw){
  const G='D 宰杀自家畜群';
  const ps=['宰杀自家畜群里的一只：畜群少一只，留下尸体或产物','没有掉落名单的新兽类宰后得到肉和皮（产出由属性派生）','体型大的兽类宰后产出重于禽类（产量由体型派生）','宰杀后种群账与头数一致，账本审计为空、资源守恒'];
  const w=cw?.w??bw?.w;if(!w){for(const p of ps)blocked(G,p,'K7（且副本世界没能加载）');return;}
  const c=newGame('acc-D',w),I=itemIndex(w),basket=feedBasket(w);setFeed(c,basket,60);await wait(c,DAY);setFeed(c,basket,0);
  const big=cw?'population_acc_x':'population_acc_flock',small=cw?'population_acc_y':'population_acc_breed';
  const a=await slaughterYield(c,big,I);
  if(!a.ok){for(const p of ps)blocked(G,p,{why:'K7：所有者宰杀自有畜群没有路径（目录里没有宰杀动作；world_propose 致死 vital 被拒或提交后畜群头数不变）',herd:big,tries:a.tries});return;}
  const n1=herdRec(c.doc,big)?.count;
  check(G,ps[0],!!a.corpse||Object.keys(a.gained).length>0,{via:a.via,corpse:a.corpse,gather:a.gather,gained:a.gained});
  if(cw)check(G,ps[1],Object.values(a.classes).some(x=>x.includes('肉'))&&Object.values(a.classes).some(x=>x.includes('皮')),{classes:a.classes});
  else blocked(G,ps[1],'前提未成立：新物种没能进世界（见 C 组）');
  const b=await slaughterYield(c,small,I);
  check(G,ps[2],b.ok&&a.kg>b.kg,{bigKg:a.kg,smallKg:b.ok?b.kg:null,small:b.ok?b.gained:b.tries});
  const sp=herdRec(c.doc,big)?.species,popAcct=Object.entries(c.doc.ledger.accounts).find(([k])=>k.startsWith(`${big}|`)&&/population/.test(k));
  const bk=books(c.engine,a.before,c.doc);
  check(G,ps[3],!!popAcct&&popAcct[1]===herdRec(c.doc,big)?.count&&n1===herdRec(c.doc,big)?.count&&bk.ok,{popAcct,count:herdRec(c.doc,big)?.count,species:sp,...bk});
}

console.log(`仓库 ${REPO}，天数 ${DAYS}`);
await groupA();
const bw=await groupB();
const cw=await groupC();
await groupD(cw,bw);
const count=r=>results.filter(x=>x.result===r).length;
const summary={repo:REPO,days:DAYS,total:results.length,pass:count('pass'),fail:count('fail'),blocked:count('blocked'),seconds:Math.round((Date.now()-T0)/1000)};
await fs.writeFile(OUT,JSON.stringify({summary,results},null,1));
console.log(JSON.stringify(summary));
process.exit(summary.pass===summary.total?0:1);
