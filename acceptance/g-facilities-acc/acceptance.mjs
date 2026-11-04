// 卡 G 设施与工位派生（K5）·独立验收。全部断言写成世界里的现象：真实学艺、买料、走路、借、租、付费、制造；
// 观察只读存档（state、ledger、holdings）与 tests/helpers/ledger-audit 的守恒对账，不调规律层内部函数，不读 server-plugin 实现。
// 用法：TEMP=F:/dnd-tmp TMP=F:/dnd-tmp node F:/dnd-tmp/g-facilities-acc/acceptance.mjs [--days N] [--skip-mut]
//   ACC_REPO=<仓库>（默认基线 F:/dnd-wt/S5FIX）。产物 acceptance.json；全过退出码 0。
// 结果：pass / fail / blocked（前提现象没法用真实动作造出来，写明卡在哪条缺失的规律上）。
import fs from 'node:fs/promises';
import {existsSync,cpSync,symlinkSync} from 'node:fs';
import path from 'node:path';
import {execSync} from 'node:child_process';
import {makeEnv,REPO,OUTDIR,say,inv,ACCESS,OFFTOPIC} from './lib.mjs';
import {kindsOf,equip,learnRecipe} from './kit.mjs';
const argv=process.argv.slice(2),DAYS=argv.includes('--days')?Number(argv[argv.indexOf('--days')+1]):0,SKIPMUT=argv.includes('--skip-mut');
const SELFTEST=argv.includes('--selftest-mut'); // 量具自检：把手写 workstations 当成"属性"，只验变异机器本身能跑通（不计入验收）
const T0=Date.now(),results=[];
function check(group,phenomenon,outcome,evidence){results.push({group,phenomenon,result:outcome===true?'pass':outcome===false?'fail':outcome,evidence});console.log(`[${outcome===true?'pass':outcome===false?'fail':outcome}] ${group} ${phenomenon}`);return outcome===true;}
const blocked=(g,p,law,evidence)=>check(g,p,'blocked',{blockedBy:law,...evidence});
// "此处根本没有该工位"一类的拒绝（与"有，但要主人同意/付费/立约"区分；其余原因记为"有工位但另有条件"，原样留证）。
const ABSENT=/没有所需工作台|不在所需工坊|没有.{0,6}(工作台|工位|灶|炉|工坊|作坊|设施)|缺少?.{0,4}(工作台|工位|设施|灶|炉)|此处.{0,4}(没有|不能|无法)/;
const NOT_A_PLACE=/尚未学会|没有所需工具|材料|不足|技能/; // 与地点无关的前提没备齐：探针本身坏了
const at=async(env,c,dest,extra={})=>(c.doc.state.location===dest?null:env.act(c,'core:move',{destination:dest,...extra}));
function books(env,c,before){const a=env.auditLedger(c.doc.ledger),k=before?env.conservation(c.engine,before,c.doc):[];return {ok:!a.length&&!k.length,audit:a.slice(0,3),conservation:k.slice(0,3)};}
const isPrivate=L=>L?.access?.mode==='private'||L?.purpose==='私宅';
const handListed=(L,K)=>(L?.workstations??[]).some(w=>w.kind===K);

// —— 勘察：工位在哪 ——
// 只读探针：在备齐配方的存档副本上逐地点试一次 world_craft（commit:false，不落盘）。为了覆盖全世界 458 处地点，
// 探针把副本的所在地点设为该处（瞬移只用于这次只读试探，结果丢弃）；每类另用真实走路做成一次，核对探针与实地一致。
async function survey(env,c,recipe){
  const by={};
  for(const L of env.world.locations){
    const d=structuredClone(c.doc);d.state.location=L.id;
    const r=await env.call({...c,doc:d},'world_craft',{recipe},{commit:false});
    const cls=r.status==='committed'?'ok':ABSENT.test(r.reason??'')?'absent':ACCESS.test(r.reason??'')?'gated':'other';
    by[L.id]={cls,reason:r.reason};
  }
  const stations=Object.keys(by).filter(id=>by[id].cls!=='absent');
  const reasons={};for(const v of Object.values(by))reasons[`${v.cls}:${v.reason??'成'}`]=(reasons[`${v.cls}:${v.reason??'成'}`]??0)+1;
  const broken=Object.values(by).filter(v=>v.cls==='other'&&NOT_A_PLACE.test(v.reason??'')).length>env.world.locations.length/2;
  return {by,stations,reasons,broken};
}

// —— 属性发现（通用性变异的前半）——
// 在内存世界副本里新建一座从没出现过的建筑，只给它某一处工位所在地的某一项数据（逐项、逐元素试，再贪心删到最小），
// 看哪一项单独就能让该处可做 K 类配方。手写 workstations 名单不算属性，不参与。文字字段（名称、描述、用途）不参与。
const IDENT=new Set(['id','name','aliases','coordinates','parent','scope','mapHierarchy','description','authoredFacts','purpose','owner','access','openHours','terrain','workstations']);
if(SELFTEST)IDENT.delete('workstations');
const NEWID=K=>`bld_acc_g_${K}_novel`;
function skeleton(env,K){
  const base=env.world.locations.find(l=>l.id==='loc_hw')?{parent:'loc_hw',scope:'loc_hw'}:{parent:env.world.locations[0].id,scope:env.world.locations[0].id};
  const mh=env.world.locations.find(l=>l.parent===base.parent&&l.mapHierarchy)?.mapHierarchy;
  return {id:NEWID(K),name:'验收试作屋',aliases:[],coordinates:[0.37,-0.41],parent:base.parent,scope:base.scope,terrain:'平地',openHours:[0,1440],owner:null,purpose:'验收试作',access:{mode:'public'},rooms:[],inventory:{},description:'一间新起的空屋，验收用。',...(mh?{mapHierarchy:mh}:{})};
}
const routeFor=B=>({id:`route_${B.id}`,from:B.parent,to:B.id,lengthKm:0,terrainMultiplier:1,modes:['walk','horse'],closedSeasons:[],toll:0,risk:0});
function candidates(L){
  const out=[];
  for(const [k,v] of Object.entries(L)){
    if(IDENT.has(k))continue;
    if(Array.isArray(v))v.forEach(e=>out.push({key:k,shape:'array',value:e}));
    else if(v&&typeof v==='object')Object.entries(v).forEach(([sk,sv])=>out.push({key:k,shape:'object',sub:sk,value:sv}));
    else out.push({key:k,shape:'scalar',value:v});
  }
  return out;
}
// 由若干项属性拼出新屋（以及可选的新人家）。数组项合并、对象子键合并、标量直接给。
function build(B0,items,K){
  const b=structuredClone(B0);let household=null;
  for(const it of items){
    if(it.shape==='household'){household={...structuredClone(it.value),id:`house_acc_g_${K}`,homeLocation:b.id};continue;}
    if(it.shape==='array'){if(!Array.isArray(b[it.key]))b[it.key]=[];b[it.key].push(structuredClone(it.value));}
    else if(it.shape==='object'){if(!b[it.key]||typeof b[it.key]!=='object'||Array.isArray(b[it.key]))b[it.key]={};b[it.key][it.sub]=structuredClone(it.value);}
    else b[it.key]=it.value;
  }
  return {building:b,household};
}
const itemName=it=>it.shape==='household'?'household':`${it.key}${it.sub?'.'+it.sub:''}${it.shape==='array'?'[]':''}`;
async function probeAt(env,doc,world2,recipe,locId){
  const {WorldEngine}=await import(`file:///${env.repo}/server-plugin/engine.mjs`);
  const engine=new WorldEngine(world2),d=structuredClone(doc);d.state.location=locId;
  return env.call({engine,doc:d,id:'disc',log:[]},'world_craft',{recipe},{commit:false});
}
// 先把该处全部结构化属性（含该处家户）拷给新屋，能开工后逐项去掉，求最小必需属性集（可以多项）；对象元素再逐字段删到最小。
async function discover(env,c,recipe,K,L0){
  const B0=skeleton(env,K);
  const tryWith=async items=>{const {building,household}=build(B0,items,K);const w2=structuredClone(env.world);w2.locations.push(building);w2.routes.push(routeFor(building));if(household)w2.households.push(household);return probeAt(env,c.doc,w2,recipe,building.id);};
  const bare=await tryWith([]);
  if(bare.status==='committed')return {ok:false,why:'空屋本身就能做（工位不依赖任何属性）',bare:say(bare)};
  let items=candidates(L0);
  const H=(env.world.households??[]).find(h=>h.homeLocation===L0.id);if(H)items.push({shape:'household',value:H});
  const full=await tryWith(items);
  if(full.status!=='committed')return {ok:false,why:'把该处全部结构化属性（不含手写 workstations 与文字字段）拷给新屋仍不能开工',from:L0.id,items:items.map(itemName).slice(0,30),full:say(full),bare:say(bare)};
  for(let i=items.length-1;i>=0;i--){const t=items.filter((_,j)=>j!==i);if((await tryWith(t)).status==='committed')items=t;}
  for(let i=0;i<items.length;i++){const it=items[i];if(!it.value||typeof it.value!=='object'||Array.isArray(it.value)||it.shape==='household')continue;
    for(const f of Object.keys(it.value)){const v=structuredClone(items[i].value);delete v[f];const t=items.map((x,j)=>j===i?{...x,value:v}:x);if((await tryWith(t)).status==='committed')items=t;}}
  return {ok:true,signature:{items},from:L0.id,bare:say(bare)};
}
const subset=(a,b)=>{if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object')return JSON.stringify(a)===JSON.stringify(b);return Object.entries(a).every(([k,v])=>subset(v,b[k]));};
function hasItem(env,L,s){
  if(s.shape==='household')return (env.world.households??[]).some(h=>h.homeLocation===L.id);
  const v=L[s.key];if(v===undefined)return false;
  if(s.shape==='array')return Array.isArray(v)&&v.some(e=>subset(s.value,e));
  if(s.shape==='object')return v&&typeof v==='object'&&subset(s.value,v[s.sub]);
  return v===s.value;
}
const hasSignature=(env,L,sig)=>sig.items.every(it=>hasItem(env,L,it));

// —— 主流程 ——
const env=await makeEnv(REPO),W=env.world,LOC=new Map(W.locations.map(l=>[l.id,l]));
const kinds=SELFTEST?['cooking']:kindsOf(W);
const kits={},surveys={},discovery={};
for(const K of kinds){
  const c=env.newGame(`kit-${K}`),k=await equip(env,c,K,2);kits[K]={...k,ctx:c};
  if(k.ok)surveys[K]=await survey(env,c,k.recipe.id);
}
// G1 工位由属性派生
for(const K of kinds){
  const k=kits[K],s=surveys[K];
  if(!k.ok){blocked('G1',`${K}：世界里此类工位数 > 1`,'缺学艺或材料路径：备不齐任何一条该类配方，无法试工位',{kit:k.log.slice(-6)});continue;}
  if(s.broken){blocked('G1',`${K}：世界里此类工位数 > 1`,'探针坏：拒绝原因与地点无关',{reasons:s.reasons});continue;}
  check('G1',`${K}：世界里此类工位数 > 1`,s.stations.length>1,{recipe:k.recipe.id,stations:s.stations.length,list:s.stations.slice(0,30),handListed:s.stations.filter(id=>handListed(LOC.get(id),K)),reasons:s.reasons});
}
// G1/G3 属性发现：从每一处工位出发找它靠哪项属性；全部工位都要能归到某项可分离的属性上，计数一致。
for(const K of kinds){
  const k=kits[K],s=surveys[K];if(!k.ok||s.broken)continue;
  const sigs=[],unexplained=[],tries=[];
  const order=[...s.stations].sort((a,b)=>(handListed(LOC.get(a),K)?1:0)-(handListed(LOC.get(b),K)?1:0));
  for(const id of order){
    if(sigs.some(g=>hasSignature(env,LOC.get(id),g.signature)))continue;
    if(sigs.length+tries.length>=8){unexplained.push(id);continue;}
    const d=await discover(env,k.ctx,k.recipe.id,K,LOC.get(id));
    if(d.ok)sigs.push(d);else{tries.push(d);unexplained.push(id);}
  }
  const matched=W.locations.filter(L=>sigs.some(g=>hasSignature(env,L,g.signature))).map(L=>L.id);
  discovery[K]={sigs,unexplained,tries:tries.slice(0,3),matched};
  const same=matched.length===s.stations.length&&matched.every(id=>s.stations.includes(id));
  if(!sigs.length)check('G1',`${K}：工位数 = 具备该属性的建筑数`,false,{why:'没有任何一处工位能归到结构化属性集上（只有手写 workstations 名单）',tries:tries.slice(0,2),stations:s.stations});
  else check('G1',`${K}：工位数 = 具备该属性的建筑数`,same&&!unexplained.length,{stations:s.stations.length,withAttribute:matched.length,signatures:sigs.map(g=>g.signature),unexplained:unexplained.slice(0,10),attributeButNoStation:matched.filter(id=>!s.stations.includes(id)).slice(0,10)});
}
// G1 实地核对：真实走到一处不在手写名单上的公共工位并做成，产物与账本守恒。
for(const K of kinds){
  const k=kits[K],s=surveys[K];if(!k.ok||s.broken)continue;
  const pick=s.stations.filter(id=>!handListed(LOC.get(id),K)&&!isPrivate(LOC.get(id))&&s.by[id].cls==='ok');
  if(!pick.length){check('G1',`${K}：实地走到一处名单外的工位做成`,false,{why:'除手写名单外没有可直接使用的公共工位',stations:s.stations});continue;}
  const c={...k.ctx,doc:structuredClone(k.ctx.doc),log:[]},id=pick[0],out=W.recipes.find(r=>r.id===k.recipe.id).output;
  const m=await at(env,c,id),before=c.doc,n0=inv(c.doc,out.item);
  let r;for(let i=0;i<5;i++){r=await env.call(c,'world_craft',{recipe:k.recipe.id});if(r.status==='rejected'||inv(c.doc,out.item)>n0)break;}
  const b=books(env,c,before);
  check('G1',`${K}：实地走到一处名单外的工位做成`,m?.status!=='rejected'&&r.status==='committed'&&inv(c.doc,out.item)>n0&&b.ok,{place:id,move:say(m),craft:say(r),gained:inv(c.doc,out.item)-n0,books:b});
}

// G2 借、租、付费
const KC='cooking',kc=kits[KC],sc=surveys[KC];
if(!kc?.ok||sc?.broken){for(const p of ['借邻居的灶台做成饭','未经主人同意用别人的工位：被拒，或发生后定擅用并有后果（不许无声成功）','租下工坊后在那里做成','付费使用工位（钱到主人手里，账本守恒）'])blocked('G2',p,'备不齐烹饪配方',{kit:kc?.log?.slice(-6)});}
else{
  // 借：邻居家（私宅）的灶。先在公共处遇到成年住户，请其允许进屋借灶，再进屋做饭。
  const homes=sc.stations.filter(id=>isPrivate(LOC.get(id)));
  const c={...kc.ctx,doc:structuredClone(kc.ctx.doc),log:[]},trace=[];let ok=false,where=null;
  const adult=id=>(W.npcs.find(n=>n.id===id)?.age??30)>=16;
  for(let hour=0;hour<30&&!ok&&homes.length;hour++){
    const meet=[];for(const H of homes)for(const id of (LOC.get(H).access?.residents??[])){const n=c.doc.state.npcs[id];if(n&&!(n.hp<=0)&&adult(id)&&n.location!==H&&!isPrivate(LOC.get(n.location)))meet.push([H,id,n.location]);}
    for(const [H,id,loc] of meet.slice(0,3)){
      const t={...c,doc:structuredClone(c.doc),log:[]};
      const m=await at(env,t,loc);if(m?.status==='rejected'){trace.push(`去 ${loc}：${say(m)}`);continue;}
      const g=await env.call(t,'world_promise',{operation:'grant_access',promisor:id,location:H,minutes:180,consent:true,content:'借灶台做饭'});trace.push(`请 ${id} 允许进 ${H} 借灶：${say(g)}`);
      if(g.status!=='committed')continue;
      const auth=g.result?.authorization;const e=await env.call(t,'world_move',{destination:H,authorization:auth});trace.push(`进 ${H}：${say(e)}`);
      if(t.doc.state.location!==H)continue;
      const out=W.recipes.find(r=>r.id===kc.recipe.id).output,before=t.doc,n0=inv(t.doc,out.item);
      let r;for(let i=0;i<5;i++){r=await env.call(t,'world_craft',{recipe:kc.recipe.id,authorization:auth});if(r.status==='rejected'||inv(t.doc,out.item)>n0)break;}
      trace.push(`在 ${H} 用灶做 ${kc.recipe.id}：${say(r)}`);
      const b=books(env,t,before);
      if(r.status==='committed'&&inv(t.doc,out.item)>n0&&b.ok){ok=true;where={home:H,lender:id,gained:inv(t.doc,out.item)-n0,books:b};break;}
    }
    if(!ok)await env.call(c,'world_time',{minutes:60});
  }
  check('G2','借邻居的灶台做成饭',ok,ok?{...where,trace:trace.slice(-4)}:{why:homes.length?'有灶的私宅借不成':'世界里没有一户私宅有灶',homesWithHearth:homes.length,trace:trace.slice(-8)});

  // 拒（与 K6 同口径）：去用别人的工位而不经主人同意。三种结果：
  //   pass —— 主人在场并拒绝（理由是别人的 / 不同意）；或者物理上先发生了，同时记下擅用一类罪名并产生后果；
  //   fail —— 无声无息地成功（既没被拒，也没有罪名与后果）。
  const others=[];for(const K of kinds){const s=surveys[K];if(!kits[K].ok||!s||s.broken)continue;for(const id of s.stations)if(s.by[id].cls==='gated'||isPrivate(LOC.get(id)))others.push([K,id]);}
  others.sort((a,b)=>(isPrivate(LOC.get(a[1]))?1:0)-(isPrivate(LOC.get(b[1]))?1:0));
  const ownersOf=(doc,id)=>[...new Set([...(LOC.get(id).access?.residents??[]),LOC.get(id).owner,...Object.values(doc.holdings?.rows??{}).filter(h=>h.subject===id&&['owns','operates','leases','resides'].includes(h.kind)&&h.until===undefined).map(h=>h.holder)].filter(x=>x&&x!=='player'&&doc.state.npcs[x]))];
  const OFFENSE=/offense:[a-z_:]+|擅用|侵占|盗用|私用/g,CONSEQ=/compensation|judgment|fine|wanted|bounty|罚|赔|通缉|立案|案件|追究/g;
  const count=(re,x)=>(JSON.stringify(x).match(re)??[]).length;
  let refused=null,silent=[];const rtrace=[];
  for(const [K,id] of others.slice(0,6)){
    const t={...kits[K].ctx,doc:structuredClone(kits[K].ctx.doc),log:[]},L=LOC.get(id);let auth;
    if(isPrivate(L)){ // 只取得"进屋拜访"的许可，不提借用
      for(let hour=0;hour<24&&!auth;hour++){
        const r0=(L.access?.residents??[]).find(n=>t.doc.state.npcs[n]&&adult(n)&&t.doc.state.npcs[n].location!==id&&!isPrivate(LOC.get(t.doc.state.npcs[n].location)));
        if(r0){await at(env,t,t.doc.state.npcs[r0].location);const g=await env.call(t,'world_promise',{operation:'grant_access',promisor:r0,location:id,minutes:120,consent:true,content:'登门拜访'});rtrace.push(`请 ${r0} 允许拜访 ${id}：${say(g)}`);
          if(g.status==='committed')auth=g.result?.authorization;else if(ACCESS.test(g.reason??'')&&!OFFTOPIC.test(g.reason??'')){refused={place:id,kind:K,via:'主人在场拒绝（不许进屋）',reason:g.reason};break;}}
        if(!auth)await env.call(t,'world_time',{minutes:60});
      }
      if(refused)break;if(!auth)continue;
    }
    const m=await at(env,t,id,auth?{authorization:auth}:{});rtrace.push(`到 ${id}：${say(m)}`);if(t.doc.state.location!==id)continue;
    const before=t.doc,coins=t.doc.state.player.coins,owners=ownersOf(t.doc,id);
    const r=await env.call(t,'world_craft',{recipe:kits[K].recipe.id});rtrace.push(`不经主人同意在 ${id} 做 ${K}：${say(r)}`);
    if(r.status==='rejected'){
      if(ACCESS.test(r.reason??'')&&!OFFTOPIC.test(r.reason??'')&&t.doc.state.player.coins===coins){refused={place:id,kind:K,via:'主人拒绝（用工位被拒）',reason:r.reason};break;}
      continue;
    }
    const offense=count(OFFENSE,t.doc)-count(OFFENSE,before);
    const signals=[];
    if(count(CONSEQ,t.doc)>count(CONSEQ,before))signals.push('出现赔偿、罚、追究或案件类记录');
    for(const o of owners){const a0=before.state.npcs[o],a1=t.doc.state.npcs[o];if((a1.trust??0)<(a0.trust??0)||(a1.affection??0)<(a0.affection??0))signals.push(`${o} 对玩家的信任或好感下降`);
      if(JSON.stringify(a1.relationships?.player??null)!==JSON.stringify(a0.relationships?.player??null))signals.push(`${o} 与玩家的关系记录变化`);}
    if(offense>0&&signals.length){refused={place:id,kind:K,via:'先发生后定效：记下擅用罪名并有后果',offenseMarks:offense,consequences:signals,owners};break;}
    silent.push({place:id,kind:K,owners,offenseMarks:offense,consequences:signals});
  }
  check('G2','未经主人同意用别人的工位：被拒，或发生后定擅用并有后果（不许无声成功）',!!refused,refused?{...refused,trace:rtrace.slice(-4)}:{why:silent.length?'用别人的工位无声无息地成功了':others.length?'到不了别人的工位，或被拒理由不是"别人的 / 主人不同意"':'世界里没有任何属于别人且需同意的工位（全是公共收费工位）',others:others.length,silent,trace:rtrace.slice(-8)});

  // 租：租下一处有工位的铺面或房屋（真实租约、真实付租），在那里做成；租约留下 leases 持有。
  let rented=null;const ltrace=[];
  const rentable=[];for(const K of kinds){const s=surveys[K];if(!kits[K].ok||!s||s.broken)continue;for(const id of s.stations)if(!isPrivate(LOC.get(id)))rentable.push([K,id]);}
  rentable.sort((a,b)=>(surveys[b[0]].by[b[1]].cls==='gated'?1:0)-(surveys[a[0]].by[a[1]].cls==='gated'?1:0));
  for(const [K,id] of rentable.slice(0,6)){
    const t={...kits[K].ctx,doc:structuredClone(kits[K].ctx.doc),log:[]};
    const m=await at(env,t,id);if(m?.status==='rejected'){ltrace.push(`到 ${id}：${say(m)}`);continue;}
    const pre=await env.call(t,'world_craft',{recipe:kits[K].recipe.id},{commit:false});
    const coins=t.doc.state.player.coins,l=await env.act(t,'core:trade.rent_in',{location:id,days:1});ltrace.push(`租 ${id}：${say(l)}`);
    if(l.status!=='committed')continue;
    const lease=Object.values(t.doc.holdings?.rows??{}).find(h=>h.holder==='player'&&h.subject===id&&['leases','operates'].includes(h.kind)&&h.until===undefined);
    const out=W.recipes.find(r=>r.id===kits[K].recipe.id).output,before=t.doc,n0=inv(t.doc,out.item);
    let r;for(let i=0;i<5;i++){r=await env.call(t,'world_craft',{recipe:kits[K].recipe.id});if(r.status==='rejected'||inv(t.doc,out.item)>n0)break;}
    ltrace.push(`租后在 ${id} 做 ${K}：${say(r)}`);const b=books(env,t,before);
    if(lease&&r.status==='committed'&&inv(t.doc,out.item)>n0&&b.ok&&coins>t.doc.state.player.coins){rented={place:id,kind:K,lease:lease.kind,rentPaid:coins-before.state.player.coins,beforeRent:say(pre),books:b};break;}
  }
  check('G2','租下工坊后在那里做成',!!rented,rented?{...rented,trace:ltrace.slice(-3)}:{why:'租不成有工位的地方，或租后仍做不成',trace:ltrace.slice(-8)});

  // 付费：在收费工位做成，钱从玩家流到工位主人一方，账本审计与守恒为空。
  let paid=null;const ftrace=[];
  for(const K of kinds){if(paid)break;const s=surveys[K];if(!kits[K].ok||!s||s.broken)continue;
    for(const id of s.stations.filter(x=>!isPrivate(LOC.get(x))&&s.by[x].cls==='ok').slice(0,4)){
      const t={...kits[K].ctx,doc:structuredClone(kits[K].ctx.doc),log:[]};await at(env,t,id);
      const before=t.doc,coins=t.doc.state.player.coins,out=W.recipes.find(r=>r.id===kits[K].recipe.id).output,n0=inv(t.doc,out.item);
      let r;for(let i=0;i<5;i++){r=await env.call(t,'world_craft',{recipe:kits[K].recipe.id});if(r.status==='rejected'||inv(t.doc,out.item)>n0)break;}
      const fee=coins-t.doc.state.player.coins,b=books(env,t,before);ftrace.push(`${id} ${K}：${say(r)}，付 ${fee}`);
      if(r.status==='committed'&&inv(t.doc,out.item)>n0&&fee>0&&b.ok){paid={place:id,kind:K,fee,books:b};break;}
    }}
  check('G2','付费使用工位（钱到主人手里，账本守恒）',!!paid,paid??{trace:ftrace});
}

// G3 通用性变异：在仓库副本里新建一座从没出现过的建筑，只给它发现的那项属性 → 可做；去掉 → 不可做。真实走路、真实制造。
async function makeMut(){
  const mut=`${OUTDIR}/mut`,stamp=`${mut}/.acc-source`;
  const src=REPO;let head='';try{head=execSync(`git -C "${src}" rev-parse HEAD`).toString().trim()+execSync(`git -C "${src}" status --porcelain world`).toString();}catch{}
  if(!existsSync(stamp)||(await fs.readFile(stamp,'utf8'))!==src+'@'+head){
    const SKIP=new Set(['node_modules','.git','SillyTavern']);
    if(process.platform==='win32'){
      try{execSync(`robocopy "${src}" "${mut}" /MIR /XD node_modules .git SillyTavern /NFL /NDL /NJH /NJS /NP /R:1 /W:1`,{stdio:'ignore'});}catch(e){if((e.status??8)>=8)throw e;}
      if(!existsSync(`${mut}/node_modules`))execSync(`cmd /c mklink /J "${path.win32.normalize(mut)}\\node_modules" "${path.win32.normalize(src)}\\node_modules"`,{stdio:'ignore'});
    }else{
      await fs.rm(mut,{recursive:true,force:true});
      cpSync(src,mut,{recursive:true,filter:p=>!SKIP.has(path.basename(p))||path.resolve(path.dirname(p))!==path.resolve(src)});
      symlinkSync(path.resolve(src,'node_modules'),`${mut}/node_modules`,'dir');
    }
    await fs.writeFile(stamp,src+'@'+head);
  }
  return mut;
}
async function writeMut(mut,K,building,household){
  const lp=`${mut}/world/geo/locations.json`,rp=`${mut}/world/geo/routes.json`,hp=`${mut}/world/people/households.json`;
  const orig=async p=>{if(!existsSync(p+'.orig'))await fs.copyFile(p,p+'.orig');return JSON.parse(await fs.readFile(p+'.orig','utf8'));};
  const put=(data,key,row)=>{const arr=Array.isArray(data)?data:data[key];arr.push(row);return data;};
  const L=await orig(lp),R=await orig(rp);
  await fs.writeFile(lp,JSON.stringify(put(L,'locations',building),null,1));await fs.writeFile(rp,JSON.stringify(put(R,'routes',routeFor(building)),null,1));
  const H=await orig(hp);await fs.writeFile(hp,JSON.stringify(household?put(H,'households',household):H,null,1));
}
async function restoreMut(mut){for(const p of ['world/geo/locations.json','world/geo/routes.json','world/people/households.json'])if(existsSync(`${mut}/${p}.orig`))await fs.copyFile(`${mut}/${p}.orig`,`${mut}/${p}`);}
async function mutTrial(mut,K,items,label){
  const {building:B,household}=build(skeleton(env,K),items,K);
  await writeMut(mut,K,B,household);
  const menv=await makeEnv(mut),c=menv.newGame(`mut-${K}-${label}`),k=await equip(menv,c,K,1);
  if(!k.ok)return {status:'blocked',why:'副本里备不齐配方',kit:k.log.slice(-4)};
  const m1=await at(menv,c,B.parent),m2=await at(menv,c,B.id);
  const r=await menv.call(c,'world_craft',{recipe:k.recipe.id},{commit:false});
  return {label,status:r.status,reason:r.reason,items:items.map(itemName),move:[say(m1),say(m2)],at:c.doc.state.location};
}
if(SKIPMUT)for(const K of kinds)blocked('G3',`${K}：新建筑具备最小属性集就能做，去掉其中任何一项就不能`,'--skip-mut',{});
else{
  let mut=null;
  for(const K of kinds){
    const k=kits[K],s=surveys[K],d=discovery[K];
    if(!k.ok||s?.broken){blocked('G3',`${K}：新建筑具备最小属性集就能做，去掉其中任何一项就不能`,'备不齐该类配方',{});continue;}
    if(!d?.sigs?.length){check('G3',`${K}：新建筑具备最小属性集就能做，去掉其中任何一项就不能`,false,{why:'除手写 workstations 名单与文字字段外，该处全部结构化属性都不能让新屋开工，无从变异',tries:d?.tries?.slice(0,2)});continue;}
    mut??=await makeMut();
    const items=d.sigs[0].signature.items;
    const yes=await mutTrial(mut,K,items,'最小集');
    const minus=[];for(let i=0;i<items.length;i++)minus.push(await mutTrial(mut,K,items.filter((_,j)=>j!==i),`去掉 ${itemName(items[i])}`));
    const all=[yes,...minus],placed=all.every(x=>x.at===NEWID(K));
    check('G3',`${K}：新建筑具备最小属性集就能做，去掉其中任何一项就不能`,all.some(x=>x.status==='blocked')?'blocked':placed&&yes.status==='committed'&&minus.every(x=>x.status==='rejected'),{minimalSet:items.map(itemName),signature:items,withSet:yes,minusEach:minus});
  }
  if(mut)await restoreMut(mut);
}

// G4 师傅分布：每类配方的师傅不集中在单一地点；有工位且有合格手艺人的地点都有人教。
async function teachers(K){
  const rs=W.recipes.filter(r=>r.workstation===K&&!(r.minimumProficiency>0)&&!(r.prerequisites?.length));
  const r=kits[K].recipe??rs[0];if(!r)return null;
  const c=env.newGame(`teach-${K}`),found=new Map();
  for(const when of [0,360]){ // 上午、下午各探一次（真实推进时间）
    if(when)await env.call(c,'world_time',{minutes:when});
    for(const [id,n] of Object.entries(c.doc.state.npcs)){
      if(n.hp<=0||!n.location||found.has(id))continue;
      const d=structuredClone(c.doc);d.state.location=n.location;
      const x=await env.call({...c,doc:d},'world_learn',{kind:'recipe',entity:r.id,source:id},{commit:false});
      if(x.status==='committed')found.set(id,n.location);
    }
  }
  const P=id=>W.npcs.find(n=>n.id===id);
  const places=new Set([...found].flatMap(([id,loc])=>[loc,P(id)?.workplace?.location,P(id)?.home?.location].filter(Boolean)));
  const qualified=W.npcs.filter(n=>(n.proficiencies?.[r.skill]??0)>(r.minimumProficiency??0));
  const st=surveys[K]?.stations??[];
  const condition=st.filter(id=>qualified.some(n=>n.workplace?.location===id||n.home?.location===id));
  const covered=condition.filter(id=>places.has(id));
  const teachPlaces=new Set([...found].map(([id,loc])=>P(id)?.workplace?.location??loc));
  return {recipe:r.id,teachers:[...found.keys()],teachPlaces:[...teachPlaces],condition,covered,stations:st.length};
}
for(const K of kinds){
  const t=await teachers(K);
  if(!t){blocked('G4',`${K}：师傅不集中在单一地点`,'该类没有入门配方',{});continue;}
  check('G4',`${K}：师傅不集中在单一地点`,t.teachPlaces.length>1,t);
  if(!kits[K].ok||!surveys[K]||surveys[K].broken)blocked('G4',`${K}：有工位且有合格手艺人的地点都有人教`,'备不齐该类配方，无法勘察工位',{});
  else check('G4',`${K}：有工位且有合格手艺人的地点都有人教`,t.condition.length>1&&t.covered.length===t.condition.length,{condition:t.condition,covered:t.covered,teachPlaces:t.teachPlaces});
}

// 浸泡（--days N）：推进 N 天后工位分布不塌缩、账本仍守恒。
if(DAYS>0){
  if(!kc?.ok)blocked('G5',`浸泡 ${DAYS} 天后烹饪工位数不减、账本守恒`,'备不齐烹饪配方',{});
  else{
    const c={...kc.ctx,doc:structuredClone(kc.ctx.doc),log:[]},before=c.doc;const t=Date.now();
    for(let d=0;d<DAYS;d++)await env.call(c,'world_time',{until:{dayOffset:1,hour:9,minute:0},activity:'睡眠'});
    const s2=await survey(env,c,kc.recipe.id),b=books(env,c,before);
    check('G5',`浸泡 ${DAYS} 天后烹饪工位数不减、账本守恒`,s2.stations.length>=sc.stations.length&&sc.stations.length>1&&b.ok,{day0:sc.stations.length,dayN:s2.stations.length,books:b,ms:Date.now()-t});
  }
}

const summary={repo:REPO,days:DAYS,ms:Date.now()-T0,pass:results.filter(r=>r.result==='pass').length,fail:results.filter(r=>r.result==='fail').length,blocked:results.filter(r=>r.result==='blocked').length,total:results.length};
await fs.writeFile(`${OUTDIR}/${SELFTEST?'selftest-mut':'acceptance'}.json`,JSON.stringify({summary,kits:Object.fromEntries(Object.entries(kits).map(([K,k])=>[K,{ok:k.ok,recipe:k.recipe?.id,log:k.log.slice(-12)}])),results},null,1));
console.log(JSON.stringify(summary));
process.exitCode=summary.pass===summary.total?0:1;
