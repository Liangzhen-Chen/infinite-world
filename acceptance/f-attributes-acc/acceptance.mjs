// 卡 F 物品属性由规律派生（K4）·独立验收。
// 全部断言写成世界里的现象：只用真实动作驱动（买、学艺、按配方做、吃、钓鱼、资助义诊、捐粮、推进时间），
// 观察只读存档文档（state、ledger）与 tests/helpers/ledger-audit 的守恒对账，不调规律层内部函数，不读 server-plugin 的实现。
// 用法：TEMP=F:/dnd-tmp TMP=F:/dnd-tmp node F:/dnd-tmp/f-attributes-acc/acceptance.mjs [--days N] [--skip-soak]
//   --days N：损耗浸泡天数（缺省 3，本机冒烟）；30 天正式跑见 README。
//   仓库：环境变量 ACC_REPO（缺省 F:/dnd-wt/S5FIX）。变异副本每次从 ACC_REPO 重建到 mut/。
// 输出到 OUT_DIR（缺省为脚本所在目录下的 out/，环境变量 ACC_OUT 可覆盖）：acceptance.json、acceptance-days<N>.json、mutation.json、mut/；全过退出码 0。
// 三种结果：pass / fail / blocked（前提现象没法用真实动作造出来，写明卡在哪条缺失的规律或取得路径上）。
import fs from 'node:fs';
import {BASE,MUT,OUT_DIR,openRepo,fork,call,act,say,have,qtyOf,books,go,buy,learn,craft,hungry,eatProbe} from './lib.mjs';
import {build,NEW} from './mutate.mjs';

const argv=process.argv.slice(2),arg=(k,d)=>{const i=argv.indexOf(k);return i>=0?argv[i+1]:d;};
const DAYS=Number(arg('--days',3)),SKIP_SOAK=argv.includes('--skip-soak');
const results=[];
const check=(id,group,phenomenon,outcome,evidence)=>{results.push({id,group,phenomenon,result:outcome===true?'pass':outcome===false?'fail':outcome,evidence});return outcome===true;};
const blocked=(id,group,phenomenon,why,evidence)=>check(id,group,phenomenon,'blocked',{blockedBy:why,...evidence});
const sat=p=>p?.nutrition?.satiety??(p?.edible?p.dSat:0);
const hyd=p=>p?.nutrition?.hydration??(p?.edible?p.dHyd:0);
const brief=p=>p&&({edible:p.edible,reason:p.reason,nutrition:p.nutrition,dSat:p.dSat,dHyd:p.dHyd,satBefore:p.satBefore});
fs.mkdirSync(OUT_DIR,{recursive:true});const t0=Date.now();const lap=l=>console.log(`[${((Date.now()-t0)/1000).toFixed(0)}s] ${l}`);

// ═════════ 一、基线树：真实数据 ═════════
const B=await openRepo(BASE);
const I=new Map(B.world.items.map(i=>[i.id,i]));
{
  const c=B.newGame('fa-base');const steps=[];
  const need=async(item,n)=>{const r=await buy(c,item,n);steps.push(...r.log);return r.ok;};
  // 取得：材料与器具都向世界里真实持有它们的人买。检定失败会耗掉材料，所以每次动手前按次补料（craft 的 ensure）。
  // 刨屑每次只补 1 份、动手就耗掉，所以做完这三样之后行囊里不再有刨屑（燃料顶替用）。燕麦粉、燕麦各多留 1 份作生食对照。
  await need('item_oat_flour',2);await need('item_oats',3);await need('item_wood_shavings',1);await need('item_salt',1);await need('item_kitchen_knife',1);await need('item_cooking_pot',1);await need('item_water',1);
  for(const r of ['recipe_w3_toasted_oats','recipe_fishing_bait','recipe_w3_oat_crisp'])steps.push(...(await learn(c,r,'npc_hw_linsui')).log);
  const toast=await craft(c,'recipe_w3_toasted_oats','bld_hw_qingdeng',{ensure:[['item_oats',3],['item_wood_shavings',1]]});steps.push(...toast.log);
  const crisp=await craft(c,'recipe_w3_oat_crisp','bld_hw_qingdeng',{ensure:[['item_oat_flour',2],['item_water',1],['item_wood_shavings',1]]});steps.push(...crisp.log);
  const baitC=await craft(c,'recipe_fishing_bait','bld_hw_qingdeng',{ensure:[['item_oats',3]]});steps.push(...baitC.log);
  for(const [i,n] of [['item_oat_flour',2],['item_water',1],['item_oats',1]])if(have(c,i)<n)steps.push(...(await buy(c,i,n-have(c,i))).log);
  await go(c,'bld_hw_qingdeng');
  lap('基线：材料、学艺、制作完成');

  // —— 燃料按类别：行囊里刨屑已用完，只有木炭（fuel 类）时还能不能生火做燕麦脆；盐不能顶替燃料 ——
  const noFuel=fork(c,'nofuel'),saltBefore=have(noFuel,'item_salt');
  const r0=await act(noFuel,'core:craft.manufacture',{recipe:'recipe_w3_oat_crisp'});
  check('U9','用途按类别','没有任何燃料、只有盐时，灶上做不成燕麦脆，盐不会被当燃料烧掉',have(c,'item_wood_shavings')===0&&have(noFuel,'item_salt')===saltBefore&&!(r0.status==='committed'&&have(noFuel,'item_oat_crisp')>have(c,'item_oat_crisp')),
    {shavings:have(c,'item_wood_shavings'),salt:[saltBefore,have(noFuel,'item_salt')],craft:say(r0)});
  const withC=fork(c,'charcoal'),kBefore=have(withC,'item_oat_crisp');
  const r1=await craft(withC,'recipe_w3_oat_crisp','bld_hw_qingdeng',{ensure:[['item_oat_flour',1],['item_water',1],['item_charcoal',1]]});
  const burned=(r1.r?.appliedFull??[]).some(a=>a.op==='transfer'&&JSON.stringify(a).includes('item_charcoal')&&/sink:/.test(JSON.stringify(a)));
  check('U2','用途按类别','配方写的是刨屑，行囊里只有木炭（同属燃料）时，照样生火做成燕麦脆，并烧掉木炭',have(c,'item_wood_shavings')===0&&r1.ok&&burned&&have(withC,'item_oat_crisp')>kBefore,
    {shavings:have(c,'item_wood_shavings'),craft:r1.log,charcoalBurned:burned,crisp:[kBefore,have(withC,'item_oat_crisp')]});

  // —— 营养与生熟：先饿到饱腹 ≤55 给量程，再分支各吃一份，与原地休息同样时长的分支比体征 ——
  const satNow=await hungry(c,55);
  const P={};for(const it of ['item_oat_crisp','item_oats','item_oat_flour','item_toasted_oats','item_ration'])P[it]=have(c,it)>0?await eatProbe(c,it):{item:it,edible:false,reason:'行囊里没有（没取得或没做成）',nutrition:null,dSat:0,dHyd:0};
  lap('基线：吃的探针完成');
  const made=have(c,'item_oat_crisp')>0;
  const ckN1=made?check:(id,g,ph,o,ev)=>blocked(id,g,ph,'检定：燕麦脆 8 次都没做成（制作检定失败，与营养规律无关）',ev);
  ckN1('N1','营养守恒派生','按真实配方做出的燕麦脆（物品表没写营养）吃得下，吃完饱腹上升',made&&P.item_oat_crisp.edible&&sat(P.item_oat_crisp)>0&&P.item_oat_crisp.dSat>0,
    {crisp:brief(P.item_oat_crisp),satBefore:satNow,steps:crisp.log});
  // 燕麦脆的投入里只有一份清水带水分（清水 hydration 25，物品表），产物水分不能超过它；体征变化要和报出的营养一致。
  const pc=P.item_oat_crisp,capRoom=100-(pc.satBefore??100);
  ckN1('N2','营养守恒派生','燕麦脆的营养不超过投入：水分 ≤ 投入的一份清水；吃下去的体征变化与报出的营养一致（不另造营养）',
    made&&pc.edible&&hyd(pc)<=(I.get('item_water')?.nutrition?.hydration??25)+0.01&&Math.abs(pc.dSat-Math.min(sat(pc),capRoom))<=1,
    {crisp:brief(pc),waterHydration:I.get('item_water')?.nutrition?.hydration,capRoom});
  // 生熟：同一种燕麦，生吃 / 只磨成粉（不加热）/ 炒熟，三者的差异只该出在加热这一步。
  const raw=P.item_oats,flour=P.item_oat_flour,toasted=P.item_toasted_oats;
  const ckR=toast.ok?check:(id,g,ph,o,ev)=>blocked(id,g,ph,'检定：烤燕麦 8 次都没做成（制作检定失败，与生熟规律无关）',ev);
  ckR('R1','生熟由加工派生','燕麦炒熟（烤燕麦配方）后可以当一餐吃，饱腹上升',toast.ok&&toasted.edible&&sat(toasted)>0&&toasted.dSat>0,{toasted:brief(toasted),steps:toast.log});
  ckR('R2','生熟由加工派生','同一种燕麦，生的与炒熟的可食性或营养不同',toast.ok&&(raw.edible!==toasted.edible||Math.abs(sat(raw)-sat(toasted))>0.5),{raw:brief(raw),toasted:brief(toasted)});
  ckR('R3','生熟由加工派生','差异来自加热：只磨成粉（不加热）的燕麦粉与生燕麦同属生食，炒熟的才不同',toast.ok&&toasted.edible&&raw.edible===flour.edible&&(toasted.edible!==raw.edible||sat(toasted)>sat(raw)+0.5),
    {raw:brief(raw),flour:brief(flour),toasted:brief(toasted)});
  check('N0','营养守恒派生','对照：物品表写了营养的干粮照样能吃（量具本身是好的）',P.item_ration.edible&&P.item_ration.dSat>0,{ration:brief(P.item_ration)});

  // —— 药：资助义诊时拿一种药性物品（制黄精片，herb 类）而不是名叫"药草"的那一件；盐不算药 ——
  const medLog=[];const hj=await buy(c,'item_s2_huangjing',1,{tries:12});medLog.push(...hj.log);
  const fundAt=async(ctx,item)=>{let r;for(let i=0;i<10;i++){await go(ctx,'bld_hw_herbs');r=await act(ctx,'core:settlement.medicine_fund',{budget:10,quantity:1,item},{commit:false});
    if(!(r.status==='rejected'&&/不在场|营业|时段|闭门|休息|睡/.test(r.reason??'')))break;await act(ctx,'core:time',{minutes:60,activity:'等待'});}return r;};
  if(!hj.ok)blocked('U4','用途按类别','资助义诊拿制黄精片（药性物品）入药，医馆收下','取得路径：买不到制黄精片',{log:medLog});
  else{const m=fork(c,'med'),before=have(m,'item_s2_huangjing'),r=await fundAt(m,'item_s2_huangjing');
    check('U4','用途按类别','资助义诊拿制黄精片（药性物品，不是"药草"那一件）入药，医馆收下',r.status==='committed'&&(r.appliedFull??[]).some(a=>JSON.stringify(a).includes('item_s2_huangjing')),{fund:say(r),applied:r.appliedFull?.slice(0,4),have:before,log:medLog});}
  {const m=fork(c,'med-salt'),r=await fundAt(m,'item_salt');
    check('U6','用途按类别','对照：拿盐资助义诊不被当药收下，拒绝给出世界内原因（药材）',r.status==='rejected'&&/药/.test(r.reason??''),{fund:say(r)});}

  // —— 粮：公仓捐粮时行囊里只有小麦（谷物）没有燕麦。另开一局（开局行囊没有燕麦），只买小麦 ——
  const g=B.newGame('fa-grain');const wheat=await buy(g,'item_wheat_grain',1,{tries:36});const grainLog=[...wheat.log];
  if(!wheat.ok)blocked('U1','用途按类别','公仓捐粮收下小麦（任何谷物都是粮）','取得路径：买不到小麦',{log:grainLog});
  else{let r;for(let i=0;i<12;i++){await go(g,'bld_hw_council');r=await act(g,'core:farm.donate',{settlement:'loc_hw',quantity:1},{commit:false});
      if(!(r.status==='rejected'&&/在场|管理员|柜台/.test(r.reason??'')))break;await act(g,'core:time',{minutes:60,activity:'等待'});}
    check('U1','用途按类别','公仓捐粮：行囊里只有小麦、没有燕麦时，小麦照样当粮收下',have(g,'item_oats')===0&&r.status==='committed'&&(r.appliedFull??[]).some(a=>JSON.stringify(a).includes('item_wheat_grain')),
      {oats:have(g,'item_oats'),wheat:have(g,'item_wheat_grain'),donate:say(r),applied:r.appliedFull?.slice(0,3),log:grainLog});}

  // —— 饵：谷粒钓饵（燕麦按真实配方做的）钓鱼。基线世界要先有竹鱼竿 ——
  const rod=await buy(c,'item_bamboo_fishing_rod',1,{tries:2});
  if(!rod.ok)blocked('U7','用途按类别','谷粒钓饵（按真实配方用燕麦做的）能当饵钓鱼','取得路径：世界里没有竹鱼竿的卖家或配方（K1/K2），钓鱼前提造不出来；"饵按类别"在变异副本 MU7/MU8 里补测',{rod:rod.log,bait:have(c,'item_fishing_bait')});
  else{const f=fork(c,'fish');await go(f,'loc_hw_dock');const b0=have(f,'item_fishing_bait'),r=await call(f,'world_field',{operation:'wildlife_fish',item:'item_fishing_bait'});
    check('U7','用途按类别','谷粒钓饵（按真实配方用燕麦做的）能当饵钓鱼',r.status==='committed'&&have(f,'item_fishing_bait')<b0,{fish:say(r),bait:[b0,have(f,'item_fishing_bait')]});}

  const bk=books(c,null);check('NB','守恒','基线这一局：账本审计为空',bk.ok,{...bk,steps});
  lap('基线：用途完成');
}

// ═════════ 二、变异副本：从没出现过的物品与配方 ═════════
const info=build();lap('变异副本已重建');
const M=await openRepo(MUT);
{
  const c=M.newGame('fa-mut');const steps=[];
  const need=async(item,n)=>{const r=await buy(c,item,n,{prefer:NEW.stocker});steps.push(...r.log);return r.ok;};
  // 刨屑每次动手前只补 1 份、动手就耗掉，做完稀汤、稠汤、第一锅块茎后行囊里不再有刨屑；第二锅块茎只能用泥炭砖。
  await need('item_cooking_pot',1);await need('item_kitchen_knife',1);await need('item_oats',1);await need('item_wood_shavings',1);await need('item_water',1);await need(NEW.bitter,1);await need(NEW.cricket,2);await need('item_bamboo_fishing_rod',1);await need(NEW.tuber,1);
  for(const r of ['recipe_fishing_bait',NEW.rThin,NEW.rThick,NEW.rTuber])steps.push(...(await learn(c,r,NEW.teacher)).log);
  await hungry(c,45);
  const ration=await eatProbe(c,'item_ration'),tuberRaw=await eatProbe(c,NEW.tuber);   // 投入本身：干粮（开局行囊）、生块茎
  const W1=['item_water',1],S1=['item_wood_shavings',1];
  const thin=await craft(c,NEW.rThin,NEW.station,{tries:5,ensure:[['item_ration',1],W1,S1]}),thick=await craft(c,NEW.rThick,NEW.station,{tries:5,ensure:[['item_ration',2],W1,S1]}),
    mash=await craft(c,NEW.rTuber,NEW.station,{tries:5,ensure:[[NEW.tuber,2],W1,S1]});
  steps.push(...thin.log,...thick.log,...mash.log);
  const bait=await craft(c,'recipe_fishing_bait',NEW.station,{tries:5,ensure:[['item_oats',1]]});steps.push(...bait.log);
  if(have(c,NEW.tuber)<1)steps.push(...(await buy(c,NEW.tuber,1)).log);
  lap('变异：制作完成');
  await hungry(c,45);
  const pThin=await eatProbe(c,NEW.thinSop),pThick=await eatProbe(c,NEW.thickSop),pMash=await eatProbe(c,NEW.mash);
  // 检定失败（动作提交了、但 5 次真实重试都没做成）不是规律缺失，记 blocked；被引擎拒绝的照常判。
  const unlucky=(...cs)=>cs.find(x=>!x.ok&&x.r?.status==='committed');
  const ckM=(id,g,ph,o,ev,...cs)=>{const u=unlucky(...cs);return u?blocked(id,g,ph,`检定失败：${u.log.filter(l=>l.startsWith('做')).at(-1)?.split('：')[0]??'制作'} 5 次真实重试都没做成，与被测规律无关`,ev):check(id,g,ph,o,ev);};
  const W=M.world.items.find(i=>i.id==='item_water')?.nutrition?.hydration??25,R=sat(ration);
  ckM('MN1','营养守恒派生（变异）','新配方"煮稀干粮汤"的产物（新物品，没写营养字段）吃得下，吃完饱腹上升',thin.ok&&pThin.edible&&sat(pThin)>0&&pThin.dSat>0,{thin:brief(pThin),steps:thin.log},thin);
  ckM('MN2','营养守恒派生（变异）','稀干粮汤的营养 = 投入之和 − 损耗：饱腹 ≤ 一份干粮、水分 ≤ 一份清水，损耗 ≥ 0',thin.ok&&pThin.edible&&ration.edible&&sat(pThin)<=R+0.01&&hyd(pThin)<=W+0.01&&sat(pThin)>0,
    {thin:brief(pThin),ration:brief(ration),waterHydration:W,loss:{satiety:+(R-sat(pThin)).toFixed(3),hydration:+(W-hyd(pThin)).toFixed(3)}},thin);
  ckM('MN3','营养守恒派生（变异）','营养跟着投入走：稠汤（两份干粮）比稀汤（一份干粮）营养多，且不超过两份干粮',thin.ok&&thick.ok&&pThick.edible&&pThin.edible&&sat(pThick)>sat(pThin)+0.5&&sat(pThick)<=2*R+0.01,
    {thin:brief(pThin),thick:brief(pThick),ration:R},thin,thick);
  ckM('MR1','生熟由加工派生（变异）','新原料灰皮块茎煮熟后可以吃、饱腹上升，与生块茎的可食性或营养不同',mash.ok&&pMash.edible&&sat(pMash)>0&&(tuberRaw.edible!==pMash.edible||Math.abs(sat(tuberRaw)-sat(pMash))>0.5),
    {raw:brief(tuberRaw),cooked:brief(pMash),steps:mash.log},mash);
  // 燃料：刨屑已用完，只有泥炭砖（新物品，fuel 类）。
  {const f=fork(c,'peat'),m0=have(f,NEW.mash);const r=await craft(f,NEW.rTuber,NEW.station,{tries:5,ensure:[[NEW.tuber,1],['item_water',1],[NEW.peat,1]]});
    const burned=(r.r?.appliedFull??[]).some(a=>a.op==='transfer'&&JSON.stringify(a).includes(NEW.peat)&&/sink:/.test(JSON.stringify(a)));
    ckM('MU3','用途按类别（变异）','新燃料泥炭砖能生火：配方写刨屑，行囊里只有泥炭砖时照样煮成块茎泥，并烧掉泥炭砖',have(c,'item_wood_shavings')===0&&r.ok&&burned&&have(f,NEW.mash)>m0,
      {shavings:have(c,'item_wood_shavings'),craft:r.log,peatBurned:burned,mash:[m0,have(f,NEW.mash)]},r);}
  // 药：苦根片（新物品，herb/medicine 类）资助义诊。
  {const f=fork(c,'bitter');let r;for(let i=0;i<10;i++){await go(f,'bld_hw_herbs');r=await act(f,'core:settlement.medicine_fund',{budget:10,quantity:1,item:NEW.bitter},{commit:false});
      if(!(r.status==='rejected'&&/不在场|营业|时段|闭门|休息|睡/.test(r.reason??'')))break;await act(f,'core:time',{minutes:60,activity:'等待'});}
    check('MU5','用途按类别（变异）','新药性物品苦根片能入药：资助义诊时医馆收下',r.status==='committed'&&(r.appliedFull??[]).some(a=>JSON.stringify(a).includes(NEW.bitter)),{fund:say(r),applied:r.appliedFull?.slice(0,4)});}
  // 饵：副本里补了一根竹鱼竿（取得路径补位）。新饵蟋蟀饵、真实配方做的谷粒钓饵都该能用。
  for(const [id,item,label] of [['MU8',NEW.cricket,'新饵蟋蟀饵（bait 类）'],['MU7','item_fishing_bait','谷粒钓饵（燕麦按真实配方做的）']]){
    const f=fork(c,'fish-'+item);await go(f,'loc_hw_dock');const b0=have(f,item),rodOk=have(f,'item_bamboo_fishing_rod')>0;
    const r=await call(f,'world_field',{operation:'wildlife_fish',item});
    if(!rodOk||b0===0)blocked(id,'用途按类别（变异）',`${label}能当饵钓鱼`,!rodOk?'取得路径：副本里也没买到竹鱼竿':(item==='item_fishing_bait'&&unlucky(bait)?'检定失败：揉制谷粒钓饵 5 次真实重试都没做成，与被测规律无关':'取得路径：饵没取得或没做成'),{have:b0,steps:steps.filter(s=>s.includes(item)||s.includes('fishing'))});
    else check(id,'用途按类别（变异）',`${label}能当饵钓鱼：抛竿时消耗它`,r.status==='committed'&&have(f,item)<b0,{fish:say(r),bait:[b0,have(f,item)]});
  }
  const bk=books(c,null);check('MB','守恒','变异这一局：账本审计为空',bk.ok,{...bk,steps});
  lap('变异：完成');
}

// ═════════ 三、损耗产生需求：浸泡 DAYS 天 ═════════
if(!SKIP_SOAK){
  process.chdir(B.repo);const c=B.newGame('fa-soak');
  // "日用品"由验收方按物品数据界定：配方里当工具用（不消耗）的物品，以及 tool/weapon/clothing/container/liquid_container/w3_household/light 类。
  const toolUse=new Set(B.world.recipes.flatMap(r=>r.tools??[]));
  const DAILY=new Set(B.world.items.filter(i=>toolUse.has(i.id)||(i.tags??[]).some(t=>['tool','weapon','clothing','container','liquid_container','w3_household','light'].includes(t))).map(i=>i.id));
  const FOOD=new Set(B.world.items.filter(i=>(i.tags??[]).includes('food')||i.nutrition).map(i=>i.id));
  const split=k=>{const [o,r,p]=k.split('|');return {o,r,p};};
  const snap=()=>{const L=c.doc.ledger??{},A=L.accounts??{},F=L.flows??{};const acc={},sink={},imp={},dur={};
    for(const [k,v] of Object.entries(A)){const {o,r,p}=split(k);if(o.startsWith('npc_')&&p==='inventory'&&DAILY.has(r))acc[k]=v;}
    for(const [k,v] of Object.entries(F)){const {o,r,p}=split(k);if(o.startsWith('sink:'))sink[k]=v;if(o==='src:import')imp[r]=(imp[r]??0)+v;}
    for(const [id,n] of Object.entries(c.doc.state.npcs))for(const [k,v] of Object.entries(n.inventory??{}))if(DAILY.has(k)&&v&&typeof v==='object'&&typeof v.durability==='number')dur[`${id}|${k}`]=v.durability;
    for(const [id,x] of Object.entries(c.doc.state.itemInstances??{}))if(x&&typeof x==='object'&&typeof x.durability==='number'){const who=Object.values(x).find(v=>typeof v==='string'&&v.startsWith('npc_'));if(who)dur[`inst:${id}|${who}`]=x.durability;}
    return {minute:c.doc.state.minute,acc,sink,imp,dur,crafts:(L.crafts??[]).length,player:structuredClone(c.doc.state.inventory.item_clothes??null)};};
  const snaps=[];let first=null;
  for(let d=0;d<DAYS;d++){await act(c,'core:time',{minutes:1440,activity:'休息'});if(!first&&c.doc.ledger)first=c.doc;snaps.push(snap());if((d+1)%5===0||d===DAYS-1)lap(`浸泡第 ${d+1} 天`);}
  const s0=snaps[0],sN=snaps.at(-1);
  // W1 磨损可见
  const worn=Object.entries(sN.dur).filter(([k,v])=>s0.dur[k]!==undefined&&v<s0.dur[k]).map(([k,v])=>({k,from:s0.dur[k],to:v}));
  check('W1','损耗产生需求',`浸泡 ${DAYS} 天：NPC 手里的日用品（工具、衣物、器皿）按使用磨损，耐用度下降`,worn.length>0,{worn:worn.slice(0,10),tracked:Object.keys(s0.dur).length});
  // W2 磨坏离开账本：日用品流进汇（不算作配方投入的那部分）
  const sinkD={};for(const [k,v] of Object.entries(sN.sink)){const {r,p}=split(k);if(!DAILY.has(r)||/craft/.test(p??''))continue;const dv=v-(s0.sink[k]??0);if(dv>0)sinkD[k]=dv;}
  check('W2','损耗产生需求',`浸泡 ${DAYS} 天：磨坏的日用品离开 NPC 手里（流进非配方投入的汇）`,Object.keys(sinkD).length>0,{sinks:sinkD});
  // W3 替换需求：某 NPC 失去一件日用品（同日该物品有非配方的汇流入）后，又取得同种物品，且那天的增量不是凭空进货（src:import）补的。
  const lost=new Map(),repl=[];
  for(let i=1;i<snaps.length;i++){const a=snaps[i-1],b=snaps[i];
    const wearDay={};for(const [k,v] of Object.entries(b.sink)){const {r,p}=split(k);if(DAILY.has(r)&&!/craft/.test(p??''))wearDay[r]=(wearDay[r]??0)+v-(a.sink[k]??0);}
    const keys=new Set([...Object.keys(a.acc),...Object.keys(b.acc)]);
    for(const k of keys){const {o,r}=split(k),dv=(b.acc[k]??0)-(a.acc[k]??0);
      if(dv<0&&(wearDay[r]??0)>0)lost.set(`${o}|${r}`,i);
      if(dv>0&&lost.has(`${o}|${r}`)){const imp=(b.imp[r]??0)-(a.imp[r]??0);if(imp<dv)repl.push({npc:o,item:r,lostDay:lost.get(`${o}|${r}`),gotDay:i,gained:dv,importThatDay:imp});}}}
  check('W3','损耗产生需求',`浸泡 ${DAYS} 天：日用品磨坏后，有 NPC 通过制作或向人购买取得替换品（不是凭空进货）`,repl.length>0,{replacements:repl.slice(0,10),count:repl.length,lostCount:lost.size,craftsLogged:sN.crafts-s0.crafts});
  // W5 玩家随身衣物
  const pc0=s0.player?.durability,pcN=sN.player?.durability;
  check('W5','损耗产生需求',`浸泡 ${DAYS} 天：玩家随身穿的衣物按耐用参数磨损`,typeof pc0==='number'&&typeof pcN==='number'&&pcN<pc0,{clothes:[s0.player,sN.player]});
  // U3 粮（家户侧）：NPC 吃掉的食物不只燕麦、野食
  const ate={};for(const [k,v] of Object.entries(sN.sink)){const {r,p}=split(k);if(!FOOD.has(r)||/craft/.test(p??''))continue;const dv=v-(s0.sink[k]??0);if(dv>0)ate[r]=(ate[r]??0)+dv;}
  const other=Object.keys(ate).filter(k=>!['item_oats','item_wild_food','item_water'].includes(k));
  check('U3','用途按类别',`浸泡 ${DAYS} 天：NPC 家户的口粮按"可食"类别取用，吃掉的食物不只燕麦和野食（≥2 种别的食物）`,other.length>=2,{eaten:ate});
  // W4 守恒
  const bk=books(c,first);check('W4','守恒',`浸泡 ${DAYS} 天：账本审计为空，各资源 Δ总量 = 源净流入 − 汇流出`,bk.ok,bk);
}

// ═════════ 汇总 ═════════
const count=k=>results.filter(r=>r.result===k).length;
const expected=JSON.parse(fs.readFileSync(new URL('./expected.json',import.meta.url),'utf8'));
const exp=new Set(expected.shouldPass.filter(e=>!(e.minDays>DAYS)).map(e=>e.id));
const vsExpected=results.filter(r=>exp.has(r.id)&&r.result!=='pass').map(r=>r.id);
const out={repo:BASE,days:DAYS,skipSoak:SKIP_SOAK,seconds:Math.round((Date.now()-t0)/1000),summary:{total:results.length,pass:count('pass'),fail:count('fail'),blocked:count('blocked')},
  expectedNotYetPass:vsExpected,mutation:info,results};
fs.writeFileSync(`${OUT_DIR}/acceptance.json`,JSON.stringify(out,null,1));
fs.writeFileSync(`${OUT_DIR}/acceptance-days${DAYS}.json`,JSON.stringify(out,null,1));
for(const r of results)console.log(`${r.result.padEnd(7)} ${r.id.padEnd(4)} ${r.phenomenon}`);
console.log(JSON.stringify(out.summary),'未达期望：',vsExpected.join(',')||'无');
process.exit(results.every(r=>r.result==='pass')?0:1);
