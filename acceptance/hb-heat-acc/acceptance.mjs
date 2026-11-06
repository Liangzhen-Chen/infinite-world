// 卡 HB 热工位绑定热源·独立验收。全部写成世界里的现象：真实动作（world_craft、npc_plan 提案、world_promise、world_time）驱动，
// 读状态、库存、账本；不读 server-plugin 的规律实现。备料（给物品、记配方、定技能）是前置夹具，被测的"能不能做、烧多少、等多久"全走真实调用。
// 用法：ACC_REPO=<被测树> node acceptance.mjs [--days N] [--trials K] [--rebuild] [--no-mut] [--yield-only] [--baseline 基线产量.json]
//   --days   产量浸泡的天数（默认 3；正式跑 30）。--trials 每类热工位抽几个（配方×地点）组合（默认 3）。
//   --yield-only：只跑产量浸泡并写 yield-<days>d-<ACC_TAG>.json（在基线树上跑一次，作为对比基线，ACC_TAG=base）。
// 结果 pass / fail / blocked；全过退出码 0。
import {existsSync,cpSync,rmSync,symlinkSync,readFileSync,writeFileSync} from 'node:fs';
import {openRepo,call,act,say,inv,makerOf,flowDiff,craftsSince,derive,manufactured,realIn,soak,OUT_DIR,BASE as REPO} from './lib.mjs';
const argv=process.argv.slice(2),has=f=>argv.includes(f),arg=(f,d)=>has(f)?argv[argv.indexOf(f)+1]:d;
const DAYS=Number(arg('--days',3)),TRIALS=Number(arg('--trials',3)),TAG=process.env.ACC_TAG??'',T0=Date.now();
const results=[];
function check(id,group,phenomenon,outcome,evidence={}){const r=outcome===true?'pass':outcome===false?'fail':outcome;results.push({id,group,phenomenon,result:r,evidence});console.log(`[${r}] ${id} ${phenomenon}`);return outcome===true;}
const blocked=(id,g,p,law,ev={})=>check(id,g,p,'blocked',{blockedBy:law,...ev});
const jstr=x=>JSON.stringify(x);
const ACCESS=/他人|别人|旁人|不属于你|不是你的|并非你|物主|主人|所有权|无权|没有.{0,8}(权|许可|依据|资格)|使用许可|须经.{0,8}同意|未经.{0,8}同意|未得.{0,6}同意|不同意|拒绝|私宅|住户|居住者|许可|授权|租用|借用/;
const ABSENT=/没有所需工作台|不在所需工坊|没有.{0,6}(工作台|工位|灶|炉|工坊|作坊|设施)|缺少?.{0,4}(工作台|工位|设施|灶|炉)|此处.{0,4}(没有|不能|无法)/;
const z=(a,b)=>(a-b)/Math.sqrt(a+b+1);  // 两个泊松计数之差的标准分
const SIG=2.5;

// —— 夹具：备料（前置，不是被测现象）——
const itemDef=(T,id)=>T.world.items.find(i=>i.id===id);
function give(T,holder,item,q){const d=itemDef(T,item);if(!d)return;const cur=holder.inventory[item];const had=typeof cur==='number'?cur:(cur?.quantity??0);holder.inventory[item]={...(typeof cur==='object'?cur:{}),quantity:had+q,quality:d.quality,durability:d.durability,weight:d.weight};}
const unitsFor=(T,item,kg=9)=>Math.min(160,Math.ceil(kg/(itemDef(T,item)?.weight||0.25)));
function skillUp(doc,r){const need=Math.max(r.minimumProficiency??0,0)+200;doc.state.skills[r.skill]={proficiency:need,daily:{},breakthroughs:[]};for(const p of r.prerequisites??[])if(p.skill)doc.state.skills[p.skill]={proficiency:Math.max(p.minimum??0,need),daily:{},breakthroughs:[]};doc.state.recipes[r.id]={source:{type:'teacher',id:r.teachers?.[0]??'npc_hw_ayan'}};}
function kit(T,r,place,{fuel=[],mats=2,id}={}){
  const c=T.newGame(id??`hb-${r.id}`);const d=c.doc;
  d.state.location=place;d.state.player.coins=2000;skillUp(d,r);
  const holder={inventory:d.state.inventory};
  for(const m of r.materials??[])give(T,holder,m.item,m.amount*mats);
  for(const t of r.tools??[])give(T,holder,t,1);
  for(const [f,q] of fuel)give(T,holder,f,q);
  return c;
}
const snap=c=>({minute:c.doc.state.minute,inventory:structuredClone(c.doc.state.inventory)});
const same=(c,s)=>c.doc.state.minute===s.minute&&jstr(c.doc.state.inventory)===jstr(s.inventory);
const matUnits=(r,item)=>(r.materials??[]).filter(m=>m.item===item).reduce((s,m)=>s+m.amount,0);
function books(T,c,before){const a=T.auditLedger(c.doc.ledger),k=before?T.conservation(c.engine,before,c.doc):[];return {ok:!a.length&&!k.length,audit:a.slice(0,3),conservation:k.slice(0,3)};}

// —— 从数据推出：热工位类别、配方样本、燃料 ——
function setup(T,repo){
  const fx=JSON.parse(readFileSync(`${repo}/world/ontology/fixtures.json`,'utf8')).entries;
  const kinds={};for(const id of ['forge','kiln'])for(const k of [].concat(fx.find(e=>e.id===id)?.affords??[]))kinds[k]=id; // 工位类别 -> 设备类（任务点名：锻炉、窑）
  const fuels=T.world.items.filter(i=>(i.tags??[]).includes('fuel')).map(i=>i.id);
  const sample={};
  for(const K of Object.keys(kinds)){
    const rs=T.world.recipes.filter(r=>r.workstation===K&&r.output?.item&&(r.materials??[]).every(m=>itemDef(T,m.item))&&(r.tools??[]).every(t=>itemDef(T,t))&&r.minutes>0).sort((a,b)=>a.minutes-b.minutes);
    // 输出物品不同、时长拉开：最短、最长、中位，再补均匀点
    const pick=[];const add=r=>{if(r&&!pick.some(p=>p.id===r.id||p.output.item===r.output.item))pick.push(r);};
    add(rs[0]);add(rs[rs.length-1]);add(rs[Math.floor(rs.length/2)]);for(let i=1;i<9&&pick.length<TRIALS+1;i++)add(rs[Math.floor(rs.length*i/9)]);
    sample[K]=pick;
  }
  return {fx,kinds,fuels,sample};
}
// 勘察：哪些地点能做某类配方（备足燃料，只读试探，不落盘）。
async function survey(T,r,fuelItem){
  const c=kit(T,r,T.world.locations[0].id,{fuel:[[fuelItem,unitsFor(T,fuelItem)]]});const ok=[],gated=[];
  for(const L of T.world.locations){const d=structuredClone(c.doc);d.state.location=L.id;const x=await call({...c,doc:d},'world_craft',{recipe:r.id},{commit:false});
    if(x.status==='committed')ok.push(L.id);else if(!ABSENT.test(x.reason??'')&&ACCESS.test(x.reason??''))gated.push(L.id);}
  return {ok,gated};
}
const spread=(a,n)=>a.length<=n?a:Array.from({length:n},(_,i)=>a[Math.floor(i*a.length/n)]);

// —— 主流程 ——
const T=await openRepo(REPO),S=setup(T,REPO);
const Kinds=Object.keys(S.kinds);
const mainFuel=S.fuels.includes('item_charcoal')?'item_charcoal':S.fuels[0];
const heatedRecipeIds=new Set(T.world.recipes.filter(r=>Kinds.includes(r.workstation)).map(r=>r.id));
const outFile=n=>`${OUT_DIR}/${n}`;

// ===== 产量浸泡（--yield-only 与正式断言共用）=====
async function yieldRun(T,days){
  const c=T.newGame('hb-yield');const start=structuredClone(c.doc);
  const s=await soak(c,days);
  const D=derive(T.world),M=manufactured(D),flows=flowDiff(start,c.doc);
  const potteryOut=[...new Set(T.world.recipes.filter(r=>r.workstation==='pottery').map(r=>r.output.item))];
  const sum=items=>items.reduce((n,i)=>n+realIn(flows,i,M).n,0);
  const crafts=craftsSince(start,c.doc);
  return {days,soakOk:s.ok,soak:s,charcoal:sum(['item_charcoal']),iron:sum(['item_iron']),pottery:sum(potteryOut),potteryItems:potteryOut.length,heatedCrafts:crafts.filter(x=>heatedRecipeIds.has(x.recipe)).length,totalCrafts:crafts.length,books:books(T,c,start)};
}
if(has('--yield-only')){
  const y=await yieldRun(T,DAYS);console.log(jstr(y));writeFileSync(outFile(`yield-${DAYS}d-${TAG||'run'}.json`),jstr(y));process.exit(0);
}

// ===== HB1–HB4 玩家：冷炉、燃料、熄火、耗燃料随时长 =====
const placeOf={};
for(const K of Kinds){
  const r0=S.sample[K][0];if(!r0){placeOf[K]={ok:[],gated:[]};continue;}
  placeOf[K]=await survey(T,r0,mainFuel);console.log(`勘察 ${K}：可做 ${placeOf[K].ok.length} 处，受限 ${placeOf[K].gated.length} 处（${Math.round((Date.now()-T0)/1000)}s）`);
}
const combos=[];  // (类别,配方,地点) 组合：每类取 TRIALS 个，配方与地点轮换
for(const K of Kinds){const places=spread(placeOf[K].ok,TRIALS),rs=S.sample[K];for(let i=0;i<places.length;i++)combos.push({K,r:rs[i%rs.length],place:places[i]});}

// HB1 冷炉没燃料：被拒，材料、时间都不动（包里还塞满非燃料物）
{
  const rows=[];for(const {K,r,place} of combos){
    const c=kit(T,r,place,{mats:1});const h={inventory:c.doc.state.inventory};for(const i of ['item_ration','item_clay','item_iron_ore'])give(T,h,i,30);
    const s=snap(c),x=await call(c,'world_craft',{recipe:r.id});
    rows.push({K,recipe:r.id,place,result:say(x),unchanged:same(c,s)});
  }
  check('HB1','玩家','冷炉没有燃料：要火的配方被拒，时间与材料都不动（换类别、配方、地点各抽样；包里的口粮、黏土、矿石不是燃料）',combos.length>0&&rows.every(x=>x.result.startsWith('rejected')&&x.unchanged),{combos:combos.length,rows:rows.slice(0,9)});
}
// HB2 有燃料：做成；工期含升温；烧了配方用料之外的燃料；产物到手；账本守恒。每种燃料类别物品各来一次
const hb2rows=[];
for(let i=0;i<S.fuels.length;i++){
  const F=S.fuels[i],cb=combos[i%Math.max(combos.length,1)];if(!cb)break;const {K,r,place}=cb;
  const c=kit(T,r,place,{fuel:[[F,unitsFor(T,F)]],mats:1}),before=c.doc,s0=snap(c),n0=inv(c.doc.state,r.output.item),f0=inv(c.doc.state,F);
  const x=await call(c,'world_craft',{recipe:r.id});
  const made=craftsSince(before,c.doc).reduce((a,k)=>a+(k.outputs?.[r.output.item]??0),0);
  const used=f0-inv(c.doc.state,F)-matUnits(r,F),bk=books(T,c,before);
  const dif={};for(const k of new Set([...Object.keys(before.state.inventory),...Object.keys(c.doc.state.inventory)])){const a=inv(before.state,k),b=inv(c.doc.state,k);if(a!==b)dif[k]=b-a;}
  hb2rows.push({invDiff:dif,lastResult:jstr(x.result??null).slice(0,500),fuel:F,K,recipe:r.id,place,result:say(x),elapsed:c.doc.state.minute-s0.minute,recipeMinutes:r.minutes,fuelUsedBeyondMaterials:used,gained:inv(c.doc.state,r.output.item)-n0,craftedPerLedger:made,books:bk.ok,
    craftSucceeded:x.result?.success,pass:x.status==='committed'&&c.doc.state.minute-s0.minute>r.minutes&&used>0&&(x.result?.success===false||inv(c.doc.state,r.output.item)>n0||made>0)&&bk.ok,
    weakFuelRefused:x.status==='rejected'&&same(c,s0)});
}
check('HB2','玩家','有燃料就做成（至少两种燃料类别物品）：升温的分钟算进工期，烧掉配方用料之外的燃料，手艺检定成功则产物到手（失败则只损耗材料），账本守恒（每种燃料类别物品各一次）',hb2rows.filter(x=>x.pass).length>=2&&hb2rows.every(x=>x.pass||x.weakFuelRefused),{rows:hb2rows,note:'火绒之类热量太小的燃料，放满包也点不着时允许原样被拒（不动状态），但至少两种燃料须做成'});
// HB3 没燃料就熄：做成后过两天，包里不再有燃料，同一炉再做被拒
{
  const rows=[];for(const {K,r,place} of combos.slice(0,3)){
    const c=kit(T,r,place,{fuel:[[mainFuel,unitsFor(T,mainFuel)]],mats:1});
    const first=await call(c,'world_craft',{recipe:r.id});
    for(let d=0;d<2;d++)await act(c,'core:time',{minutes:1440});
    for(const f of S.fuels)delete c.doc.state.inventory[f];
    const h={inventory:c.doc.state.inventory};for(const m of r.materials??[])give(T,h,m.item,m.amount);for(const t of r.tools??[])if(!c.doc.state.inventory[t])give(T,h,t,1);
    c.doc.state.location=place;const s=snap(c),second=await call(c,'world_craft',{recipe:r.id});
    rows.push({K,recipe:r.id,place,first:say(first),second:say(second),pass:first.status==='committed'&&second.status==='rejected'&&same(c,s)});
  }
  check('HB3','玩家','没燃料就熄：第一次做成，隔两天后包里没燃料，同一座炉再做被拒（炉火不会无燃料自己烧着）',rows.length>0&&rows.every(x=>x.pass),{rows});
}
// HB4 烧得多少随工期：同类别、同燃料、同地点，配方越长耗的燃料不少于短的；最长比最短长一倍以上时必须严格更多
{
  const out=[];let okAll=true;
  for(const K of Kinds){
    const place=placeOf[K].ok[0],rs=[...S.sample[K]].sort((a,b)=>a.minutes-b.minutes);if(!place||rs.length<2)continue;
    const used=[];for(const r of rs){const c=kit(T,r,place,{fuel:[[mainFuel,unitsFor(T,mainFuel,14)]],mats:1}),f0=inv(c.doc.state,mainFuel),x=await call(c,'world_craft',{recipe:r.id});
      used.push({recipe:r.id,minutes:r.minutes,committed:x.status==='committed',used:f0-inv(c.doc.state,mainFuel)-matUnits(r,mainFuel)});}
    const mono=used.every(u=>u.committed&&u.used>0)&&used.every((u,j)=>used.every((v,i)=>i>=j||u.minutes<1.25*v.minutes||u.used>=v.used));
    const lo=used[0],hi=used.at(-1),strict=hi.minutes>=2*lo.minutes?hi.used>lo.used:true;
    out.push({K,place,used,mono,strict});okAll=okAll&&mono&&strict;
  }
  check('HB4','玩家','燃料耗量随工期：配方越长烧得越多（按每分钟烧速，不是固定一份）',out.length>0&&okAll,{rows:out});
}

// ===== HB5–HB6 人物：冷炉同一条，换人、换类别、换种族 =====
const mod=await import(`file:///${T.repo}/server-plugin/npc-autonomy.mjs`);
async function npcPlan(c,npc,recipe){
  const out=await c.engine.reduce(c.doc,{type:'npc_plan',eventId:`hb-plan-${npc}-${recipe}`,plan:{kind:'npc-plan',version:1,minute:c.doc.state.minute,stateFingerprint:mod.npcPlanFingerprint(c.doc),proposals:[{npc,actions:[{kind:'craft',recipe}]}]}});
  c.doc=T.applyPatches(c.doc,out.patches);return out.result.results[0];
}
const npcPlanSafe=async(c,npc,recipe)=>{try{return await npcPlan(c,npc,recipe);}catch(e){return {status:'抛错:'+String(e?.message??e).slice(0,80)};}};
function npcKit(T,r,place,npcId,{fuel=[],mats=2}={}){
  const c=T.newGame(`hb-npc-${npcId}`),d=c.doc,base=c.engine.byId.get(npcId);
  base.schedule={default:[{start:0,end:1440,location:place,activity:'做工',services:[]}]};
  d.state.minute=420;d.state.location='loc_capital';for(const a of Object.values(d.state.npcs))a.activity??='日常活动';
  const n=d.state.npcs[npcId];Object.assign(n,{location:place,activity:'做工',status:'正常',coins:100,inventory:{},skills:{...(n.skills??{}),[r.skill]:2100}});
  for(const m of r.materials??[])give(T,n,m.item,m.amount*mats);for(const t of r.tools??[])n.inventory[t]={quantity:1,durability:90};
  for(const [f,q] of fuel)give(T,n,f,q);
  return c;
}
const adult=n=>(n.age??30)>=16;
const speciesOf=n=>n.species??'人';
// 人选：不同物种各取一个（含精怪、兽类），其余补足不同地点的人
function pickNpcs(want=5){
  const by=new Map();for(const n of T.world.npcs.filter(n=>adult(n)||speciesOf(n)!=='人')){const k=speciesOf(n);if(!by.has(k))by.set(k,[]);by.get(k).push(n);}
  const out=[];for(const [,list] of by){out.push(list[Math.floor(list.length/2)]);if(out.length>=want)break;}
  const humans=by.get('人')??[];for(let i=0;out.length<want&&i<humans.length;i+=Math.max(1,Math.floor(humans.length/want)))if(!out.includes(humans[i]))out.push(humans[i]);
  return out.slice(0,want);
}
const npcs=pickNpcs(5);
{
  const rows=[];
  for(let i=0;i<npcs.length;i++){
    const n=npcs[i],pool=combos.filter(x=>x.r.minutes<=240||S.sample[x.K].some(q=>q.minutes<=240));const cb=pool[i%Math.max(pool.length,1)];if(!cb)break;const {K,place}=cb;const r=S.sample[K].filter(q=>q.minutes<=240).sort((a,b)=>a.minutes-b.minutes)[0]??cb.r; // NPC 单日自主工时有上限，只用 ≤240 分钟的配方
    const cands=placeOf[K].ok;let place2=place,cold,before,rj,refused,lit,f0,m0,rl,used,done;
    for(const pl of [place,...cands.filter(p=>p!==place)]){ // 工位另有主人或准入时换一处公共的再试（探的是燃料规律，不是准入）
      place2=pl;cold=npcKit(T,r,pl,n.id,{mats:1});before=structuredClone(cold.doc.state.npcs[n.id]);rj=await npcPlanSafe(cold,n.id,r.id);
      refused=rj.status==='拒绝'&&jstr(cold.doc.state.npcs[n.id].inventory)===jstr(before.inventory);
      lit=npcKit(T,r,pl,n.id,{fuel:[[mainFuel,unitsFor(T,mainFuel)]],mats:1});f0=inv(lit.doc.state.npcs[n.id],mainFuel);m0=lit.doc.state.minute;rl=await npcPlanSafe(lit,n.id,r.id);
      if(rl.status!=='拒绝')break;
    }
    used=f0-inv(lit.doc.state.npcs[n.id],mainFuel)-matUnits(r,mainFuel);
    done=rl.status==='进行中'&&rl.finish-m0>r.minutes&&used>0;
    rows.push({npc:n.id,species:speciesOf(n),K,recipe:r.id,place:place2,noFuel:rj.status,refused,withFuel:rl.status,withFuelWhy:String(rl.reason??rl.message??rl.error??jstr(rl)).slice(0,160),finishMinusStart:rl.finish!=null?rl.finish-m0:null,recipeMinutes:r.minutes,fuelUsedBeyondMaterials:used,pass:refused&&done});
  }
  check('HB5','人物','人物在冷炉做工同一条：没燃料被拒且行囊不动；有燃料则开工，升温分钟进工期、燃料从自己行囊出（换人、换物种、换类别、换地点）',rows.length>0&&rows.every(x=>x.pass),{rows});
  const sp=new Set(rows.map(x=>x.species));
  check('HB5b','人物','抽样覆盖了非人类（精怪或兽类）NPC，并且它们同样守这条',[...sp].some(s=>s!=='人')&&rows.filter(x=>x.species!=='人').every(x=>x.pass),{speciesCovered:[...sp]});
}
// HB6 NPC 自主：给几位该手艺最好的人备料和燃料，推进时间，他们会去冷炉点火开工（依赖另一卡合入 npc-labor，基线可能 fail）
{
  const picks=[];for(const K of Kinds){const r=S.sample[K][0],place=placeOf[K].ok[0];if(!r||!place)continue;
    const best=T.world.npcs.filter(n=>adult(n)).sort((a,b)=>(b.proficiencies?.[r.skill]??0)-(a.proficiencies?.[r.skill]??0)).slice(0,2);for(const n of best)picks.push({n,K,r,place});}
  const c=T.newGame('hb-auto'),start=structuredClone(c.doc);const seeded=new Set();
  for(const {n,r} of picks){const x=c.doc.state.npcs[n.id];if(!x)continue;seeded.add(n.id);x.inventory??={};
    for(const m of r.materials??[])give(T,x,m.item,m.amount*8);for(const t of r.tools??[])if(!inv(x,t))x.inventory[t]={quantity:1,durability:90};give(T,x,mainFuel,unitsFor(T,mainFuel,12));x.coins=Math.max(x.coins??0,200);
    x.skills={...(x.skills??{}),[r.skill]:2100};}
  const f0=Object.fromEntries([...seeded].map(id=>[id,inv(c.doc.state.npcs[id],mainFuel)]));
  const s=await soak(c,Math.min(DAYS,3));
  const crafts=craftsSince(start,c.doc).filter(x=>heatedRecipeIds.has(x.recipe)&&seeded.has(makerOf(x,c.doc,c.id)));
  let beyond=0;for(const id of seeded){const matF=crafts.filter(x=>makerOf(x,c.doc,c.id)===id).reduce((a,x)=>a+(x.inputs?.[mainFuel]??0),0);beyond+=f0[id]-inv(c.doc.state.npcs[id],mainFuel)-matF;}
  const burnedMg=Object.values(c.doc.state.records??{}).filter(r=>r.category==='physical_feature').reduce((a,r)=>a+(r.state?.thermal?.burnedFuelMg??0),0);
  check('HB6','人物','NPC 自主：备好料和燃料的行家，推进时间后会去冷炉点火开工，且真烧了燃料',s.ok&&crafts.length>0&&(burnedMg>0||beyond>0),{days:Math.min(DAYS,3),seeded:seeded.size,heatedCraftsBySeeded:crafts.length,byRecipe:crafts.map(x=>x.recipe).slice(0,6),fuelBeyondMaterials:beyond,burnedFuelMg:burnedMg,note:'依赖 E2/npc-labor 合入；基线可能 fail。窑的 NPC 行跑不了：NPC 单日工时有上限，跨天的工序还没有规律'});
}

// ===== HB7 产量（对比基线）=====
{
  const y=await yieldRun(T,DAYS);writeFileSync(outFile(`yield-${DAYS}d-${TAG||'run'}.json`),jstr(y));
  const bf=arg('--baseline',outFile(`yield-${DAYS}d-base.json`));
  if(!existsSync(bf))blocked('HB7','产量','木炭、铁、陶器产量对比基线','缺基线产量文件：先在基线树（t-int）上跑 --yield-only --days N，ACC_TAG=base',{want:bf,got:y});
  else{
    const b=JSON.parse(readFileSync(bf,'utf8')),rows={};let ok=y.soakOk;
    for(const k of ['charcoal','iron','pottery']){
      const n=y[k],o=b[k],zz=z(n,o);
      // 基线为 0 的物品：真有产出就算从无到有；基线有产出的：不得显著低于基线（2.5σ，泊松差）
      const pass=o===0?n>0:zz>=-SIG;rows[k]={baseline:o,now:n,z:Number(zz.toFixed(2)),rule:o===0?'基线为 0，现应 >0':`z≥-${SIG}`,pass};ok=ok&&pass;
    }
    check('HB7','产量',`${DAYS} 天木炭、铁、陶器真实产出（非开局、非进货、非漂移）对比基线：基线为 0 的须 >0，其余不得显著降低（${SIG}σ）`,ok,{rows,heatedCrafts:y.heatedCrafts,baselineHeatedCrafts:b.heatedCrafts});
    check('HB7b','产量',`${DAYS} 天浸泡全程能推进，账本审计与守恒为空`,y.soakOk&&y.books.ok,{books:y.books,soak:y.soak});
  }
}

// ===== HB8–HB10 通用性变异：副本里加从没出现的热工位类别、燃料、私炉，只写数据 =====
async function buildMut(){
  const mut=`${REPO}-hbmut`,stamp=`${mut}/.acc-source`;
  if(!has('--rebuild')&&existsSync(stamp))return mut;
  rmSync(mut,{recursive:true,force:true});
  const skip=/(^|\/)(node_modules|\.git|SillyTavern|\.extra|\.out|\.tmp|mut|logs|saves)(\/|$)/;
  cpSync(REPO,mut,{recursive:true,filter:s=>!skip.test(s.split('\\').join('/').slice(REPO.length))});
  symlinkSync(`${REPO}/node_modules`,`${mut}/node_modules`,'junction');
  const rj=f=>JSON.parse(readFileSync(`${mut}/${f}`,'utf8')),wj=(f,j)=>writeFileSync(`${mut}/${f}`,JSON.stringify(j,null,1));
  // 新设备类 acc_smelter（熔炉），能做新工位类别 acc_smelting
  const fx=rj('world/ontology/fixtures.json');fx.entries.push({id:'acc_smelter',label:'验收熔炉',affords:'acc_smelting'});wj('world/ontology/fixtures.json',fx);
  // 热工位属性：新类别只写属性（沿用锻炉的物理参数，换温度要求）
  let hf=null;try{hf=rj('world/meta/mechanics/heat-fixtures.json');}catch{}
  if(hf){const f=structuredClone(hf.classes.forge);f.label='验收熔炉';f.basis='验收变异：新设备类只写属性';f.requirement={minimumC:900,maximumC:1300,burning:true};hf.classes.acc_smelter=f;wj('world/meta/mechanics/heat-fixtures.json',hf);}
  // 新物品：重燃料（同炭类，单件两倍重）、假燃料（像炭、没有燃料类别）、新产物
  const items=rj('world/meta/items.json'),ch=items.find(i=>i.id==='item_charcoal');
  items.push({...structuredClone(ch),id:'item_acc_fuel_heavy',name:'验收重炭',weight:ch.weight*2,aliases:[]},
             {...structuredClone(ch),id:'item_acc_fuel_fake',name:'验收假炭',tags:['carbon'],aliases:[]},
             {...structuredClone(items.find(i=>i.id==='item_iron')),id:'item_acc_ingot',name:'验收锭',aliases:[]});
  wj('world/meta/items.json',items);
  // 新配方：新工位类别
  const rcs=rj('world/meta/recipes.json'),base=structuredClone(rcs.find(r=>r.id==='recipe_kc_tool_chasing_punch'));
  Object.assign(base,{id:'recipe_acc_smelt',name:'验收熔锭',workstation:'acc_smelting',minutes:20,materials:[{item:'item_iron_scrap',amount:1}],tools:[],output:{item:'item_acc_ingot',quantity:1},learningRequired:false,minimumProficiency:0,prerequisites:[]});delete base.processing;
  rcs.push(base);wj('world/meta/recipes.json',rcs);
  // 新建筑：两处公共的新熔炉屋（换工位）
  const locs=rj('world/geo/locations.json'),routes=rj('world/geo/routes.json'),hw=locs.find(l=>l.id==='bld_hw_forge');
  for(const [i,xy] of [[1,[0.41,-0.33]],[2,[0.52,-0.12]]]){
    const b={id:`bld_acc_hb_novel_${i}`,name:`验收熔炉屋${i}`,aliases:[],coordinates:xy,parent:'loc_hw',scope:'loc_hw',terrain:'平地',openHours:[0,1440],owner:null,purpose:'验收试作',access:{mode:'public'},mapHierarchy:hw.mapHierarchy,description:'验收用新屋。',features:[],fixtures:[{fixture:'acc_smelter',id:`station_acc_${i}`,fee:0}]};
    locs.push(b);routes.push({id:`route_${b.id}`,from:'loc_hw',to:b.id,lengthKm:0,terrainMultiplier:1,modes:['walk','horse'],closedSeasons:[],toll:0,risk:0});
  }
  // 私炉：给一户既有私宅加一座锻炉（只加一条设备数据）
  const priv=locs.find(l=>l.access?.mode==='private'&&(l.access.residents??[]).length&&l.id!=='bld_hw_forge');
  if(priv)priv.fixtures=[...(priv.fixtures??[]),{fixture:'forge',id:'station_acc_priv'}];
  wj('world/geo/locations.json',locs);wj('world/geo/routes.json',routes);
  writeFileSync(stamp,'built');return mut;
}
let mutOK=false,M;
const MUTIDS=['HB8','HB8b','HB8c','HB9','HB10'];
if(has('--no-mut'))for(const id of MUTIDS)blocked(id,'变异','通用性变异','--no-mut');
else{
  try{await buildMut();M=await openRepo(`${REPO}-hbmut`);mutOK=true;}catch(e){for(const id of MUTIDS)blocked(id,'变异','通用性变异','变异副本建不起来或载入失败：'+String(e?.message??e).slice(0,300));}
}
if(mutOK){
  const r=M.world.recipes.find(x=>x.id==='recipe_acc_smelt'),places=M.world.locations.filter(l=>l.id.startsWith('bld_acc_hb_novel_')).map(l=>l.id);
  const mkit=(place,fuel)=>kit(M,r,place,{fuel,mats:1,id:'hb-mut'});
  const rows=[];
  for(const place of places){
    const cold=mkit(place,[]),s=snap(cold),x0=await call(cold,'world_craft',{recipe:r.id});
    const hot=mkit(place,[['item_charcoal',60]]),f0=inv(hot.doc.state,'item_charcoal'),m0=hot.doc.state.minute,x1=await call(hot,'world_craft',{recipe:r.id});
    const used=f0-inv(hot.doc.state,'item_charcoal');
    rows.push({place,noFuel:say(x0),unchanged:same(cold,s),withFuel:say(x1),elapsed:hot.doc.state.minute-m0,recipeMinutes:r.minutes,fuelUsed:used,gained:inv(hot.doc.state,'item_acc_ingot'),
      pass:x0.status==='rejected'&&same(cold,s)&&x1.status==='committed'&&hot.doc.state.minute-m0>r.minutes&&used>0&&inv(hot.doc.state,'item_acc_ingot')>0});
  }
  check('HB8','变异','副本里新增热工位类别 acc_smelter（只写设备、属性、配方、建筑数据）：自动有热源规律——无燃料被拒，有炭则含升温地做成并烧燃料（两处新建筑）',rows.length===2&&rows.every(x=>x.pass),{rows});
  {
    const place=places[0],use=async F=>{const c=mkit(place,[[F,unitsFor(M,F,8)]]),f0=inv(c.doc.state,F),x=await call(c,'world_craft',{recipe:r.id});return {F,ok:x.status==='committed',used:f0-inv(c.doc.state,F),reason:x.status==='rejected'?x.reason:null};};
    const a=await use('item_charcoal'),b=await use('item_acc_fuel_heavy'),f=await use('item_acc_fuel_fake');
    const ratioOK=a.ok&&b.ok&&a.used>0&&b.used>0&&a.used>=2*b.used-2&&a.used<=2*b.used+1&&(a.used<3||b.used<a.used);
    check('HB8b','变异','燃料按类别与热值：新燃料物（同炭类、单件两倍重）能烧，耗件数约为炭的一半（取整误差内）',ratioOK,{charcoal:a,heavy:b});
    check('HB8c','变异','只长得像炭、没有燃料类别的新物品点不着炉（不按名字、不按像）',!f.ok,{fake:f});
  }
  {
    const place=places[0],n=npcs[0],cold=npcKit(M,r,place,n.id,{mats:1}),rj0=await npcPlanSafe(cold,n.id,r.id);
    const lit=npcKit(M,r,place,n.id,{fuel:[['item_charcoal',60]],mats:1}),m0=lit.doc.state.minute,rl=await npcPlanSafe(lit,n.id,r.id);
    check('HB9','变异','人物在新类别热工位同样：没燃料被拒，有燃料开工且工期含升温',rj0.status==='拒绝'&&rl.status==='进行中'&&rl.finish-m0>r.minutes,{npc:n.id,noFuel:rj0.status,withFuel:rl.status,why:String(rl.reason??rl.message??'').slice(0,160),noFuelWhy:String(rj0.reason??''),finishMinusStart:rl.finish!=null?rl.finish-m0:null});
  }
  {
    const priv=M.world.locations.find(l=>(l.fixtures??[]).some(f=>f.id==='station_acc_priv')),rf=M.world.recipes.find(x=>x.workstation==='smithing'&&x.minutes>0&&(x.materials??[]).every(m=>itemDef(M,m.item))&&(x.tools??[]).every(t=>itemDef(M,t)));
    if(!priv||!rf)blocked('HB10','变异','私炉要许可','副本里找不到可加私炉的私宅，或没有锻造配方');
    else{
      const resident=priv.access.residents.find(id=>M.world.npcs.find(n=>n.id===id&&adult(n)));
      const c=kit(M,rf,priv.id,{fuel:[['item_charcoal',60]],mats:1,id:'hb-priv'}),s=snap(c),s0doc=structuredClone(c.doc);
      const denied=await call(c,'world_craft',{recipe:rf.id});
      // 与 K6 同口径：先拒；或先发生后定罪：本次用炉事件（sourceEvent）写下 offense 记录，受害人是这户的住户，对象指向这座炉或这户，且回执 consequences 里有指向该记录的 offense 项
      const evId=denied.input?.eventId,recs=Object.values(c.doc.state.records??{}).filter(r=>r.category==='offense'&&r.sourceEvent===evId);
      const cons=(denied.result?.offenses??[]).filter(k=>k&&(k.type==='offense'||k.offense||k.record||k.id));
      const hit=recs.find(r=>priv.access.residents.includes(r.victim)&&(jstr(r).includes(priv.id)||jstr(r).includes('station_acc_priv'))&&cons.some(k=>[k.record,k.id,k.recordId].includes(r.id)||k===r.id)&&(r.offense==='unauthorized_use'||r.offense?.id==='unauthorized_use'));
      const offense=recs.length,conseq=cons.length;
      const deniedOK=(denied.status==='rejected'&&same(c,s)&&ACCESS.test(denied.reason??''))||(denied.status==='committed'&&!!hit);
      
      const t=kit(M,rf,'loc_hw',{fuel:[['item_charcoal',60]],mats:1,id:'hb-priv2'}),trace=[];let allowed=false;
      if(resident){
        t.doc.state.npcs[resident].location='loc_hw';
        const g=await call(t,'world_promise',{operation:'grant_access',promisor:resident,location:priv.id,minutes:180,consent:true,content:'借锻炉打铁',fixtures:['forge']});trace.push(`授权：${say(g)}`);
        if(g.status==='committed'){const auth=g.result?.authorization,mv=await call(t,'world_move',{destination:priv.id,authorization:auth});trace.push(`进屋：${say(mv)}`);
          if(t.doc.state.location===priv.id){const n0=inv(t.doc.state,rf.output.item),before=t.doc,x=await call(t,'world_craft',{recipe:rf.id,authorization:auth});trace.push(`做：${say(x)}`);const bk=books(M,t,before);allowed=x.status==='committed'&&(x.result?.success===false||inv(t.doc.state,rf.output.item)>n0)&&bk.ok;trace.push(`成功=${x.result?.success} 账本=${jstr(bk)}`);}}
      }
      check('HB10','变异','私炉要许可：他人家的锻炉，无许可被拒且不动；经主人结构化许可（写明借锻炉）后做成、账本守恒',deniedOK&&allowed,{home:priv.id,resident,denied:say(denied),deniedUnchanged:same(c,s),offenseRecords:recs.map(r=>({id:r.id,offense:r.offense,victim:r.victim,subject:r.subject})),resultOffenses:cons,matched:!!hit,trace});
    }
  }
}

// ===== 汇总 =====
const tally=results.reduce((a,r)=>(a[r.result]=(a[r.result]??0)+1,a),{});
console.log(jstr(tally),`耗时 ${Math.round((Date.now()-T0)/1000)}s`);
writeFileSync(outFile(`acceptance${TAG?'-'+TAG:''}.json`),jstr({repo:REPO,days:DAYS,trials:TRIALS,tally,results},null,1));
process.exit(results.every(r=>r.result==='pass')?0:1);
