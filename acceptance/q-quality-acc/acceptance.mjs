// 卡 Q 手艺档位与品质链·现象验收。
// 用法：node acceptance.mjs [--days N] [--trials K] [--families 木,布,...] [--no-mut] [--rebuild]
//   --days：熟练档逐日练习的天数（本机冒烟 ≤3；正式 30）。--trials：每档从同一快照分叉做几次（默认 16）。
import fs from 'node:fs';
import path from 'node:path';
import {BASE,MUT,OUT_DIR,openRepo,argDays,has,write} from './lib.mjs';
import {derive} from './spec.mjs';
import {scales,lineage} from './run.mjs';

const days=argDays(3);
const argv=k=>{const i=process.argv.indexOf(k);return i>=0?process.argv[i+1]:null;};
const K=Number(argv('--trials')??16);
const onlyFam=argv('--families')?.split(',')??null;
const t0=Date.now();
const results=[];
const put=(id,status,evidence,group)=>{results.push({id,group,status,evidence});console.log(`${status.padEnd(7)} ${id}  ${typeof evidence==='string'?evidence:JSON.stringify(evidence).slice(0,240)}`);};

const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const prods=tr=>(tr??[]).flatMap(t=>t.units);
// 只取投入原料是标准品质（grade 1）的试做：比工具、比技能时原料品质必须相同。
const STD=t=>t.inputGrade==null||t.inputGrade>=1-1e-9;
const stdOnly=tr=>(tr??[]).filter(STD);
const inputs=tr=>count((tr??[]).filter(t=>t.status==='committed').map(t=>t.inputGrade));
const nonNull=a=>a.filter(x=>x!=null);
const PHYS={材料:/缺少|不足|不够|没有.{0,8}(料|材)|材料|原料/,工具:/工具|器具|刀|锤|钳|针/,工位:/工位|作坊|工作台|台|炉|织机|场所|设施|此处|这里|此地|需在|须在/};
const SKILLY=/学会|技能|熟练|掌握|手艺|资格|尚未|不会/;

// —— 一个材料族的全部断言 ——
function judge(prefix,spec,L,S,D){
  const A=L.A,B=L.B,C=L.C,fam=spec.family,item=spec.output,cat=D.I[item];
  const P=`${prefix}${fam}`;
  const blockedA=A.blocked&&!A.tiers['缺技能'];
  const tier=(lin,t)=>lin?.tiers?.[t]?.trials??[];
  const U=tier(A,'缺技能'),N=tier(A,'刚入门'),Pf=tier(A,'熟练');
  // Q1 外行做出降级品
  if(blockedA)put(`${P}.Q1a 外行动手不被拒、产出同一种物品`,'blocked',A.blocked,'Q1');
  else{
    const rej=U.filter(t=>t.status==='rejected');
    const made=U.filter(t=>t.qtyGain>0);
    put(`${P}.Q1a 外行动手不被拒、产出同一种物品`,rej.length===0&&made.length>0?'pass':'fail',{recipe:spec.X,trials:U.length,rejected:rej.length,firstReason:rej[0]?.reason??null,made:made.length},'Q1');
    const us=prods(U);
    put(`${P}.Q1b 外行产物手艺档为仿制或粗陋`,us.length&&us.every(u=>u.tier==='仿制'||u.tier==='粗陋')?'pass':(us.length?'fail':'blocked'),us.length?{tiers:count(us.map(u=>u.tier))}:'外行没有做出产物',`Q1`);
    const dU=mean(nonNull(us.map(u=>u.maxDur))),cap=(cat?.durability??0)*0.8;
    put(`${P}.Q1c 外行产物耐久明显低于真货（≤ 物品表耐久 × 0.8）`,us.length?(dU!=null&&dU<=cap?'pass':'fail'):'blocked',us.length?{meanMaxDur:dU,catalog:cat?.durability,threshold:cap}:'外行没有做出产物','Q1');
    // 样本：产物本身有可丢用途的配方（X 本身，或同族另选的 Xd），缺技能、刚入门两档里落在低档（该档 loses 与物品用途有交集）的单件。
    // 缺掉的用途读引擎 unitLostUses；每件都必须缺掉该档应缺的全部用途。
    const xdTr=A.xd?[...(A.xd.tiers['缺技能']?.trials??[]),...(A.xd.tiers['刚入门']?.trials??[])]:[...U,...N];
    const dUses=spec.Xd===spec.X?spec.uses:spec.usesD??[];
    const samples=prods(xdTr).map(u=>({...u,expectLost:S.loses(u.tier).filter(x=>dUses.includes(x))})).filter(u=>u.expectLost.length);
    const short=samples.filter(u=>!u.expectLost.every(x=>u.lost.includes(x)));
    if(!spec.Xd)put(`${P}.Q1d 外行产物部分用途缺失`,'blocked',`族内没有产物带可丢用途（${[...new Set(S.table.rows.flatMap(r=>r.loses??[]))].join('、')}）且取得到的配方`,'Q1');
    else if(A.xd?.blocked)put(`${P}.Q1d 外行产物部分用途缺失`,'blocked',A.xd.blocked,'Q1');
    else put(`${P}.Q1d 外行产物部分用途缺失`,samples.length?(short.length?'fail':'pass'):'blocked',samples.length?{recipe:spec.Xd,baseUses:dUses,samples:samples.length,byTier:count(samples.map(u=>u.tier)),short:short.length,example:(short[0]??samples[0])&&{tier:(short[0]??samples[0]).tier,expectLost:(short[0]??samples[0]).expectLost,lost:(short[0]??samples[0]).lost}}:{recipe:spec.Xd,why:'缺技能、刚入门两档没有落在会缺用途的低档的产物',tiers:count(prods(xdTr).map(u=>u.tier))},'Q1');
    const pr=A.probes,phys=Object.entries(pr).map(([k,v])=>{const want=k==='noMaterial'?'材料':k==='noTool'?'工具':'工位';return {probe:k,status:v.status??'skipped',reason:v.reason??v.skipped,ok:v.status==='rejected'&&PHYS[want].test(v.reason??'')&&!SKILLY.test(v.reason??'')};});
    put(`${P}.Q1e 只有物理不可行才拒绝，理由是物理理由`,phys.length&&phys.every(x=>x.ok)?'pass':'fail',phys,'Q1');
  }
  // Q2 档位分层
  if(!Pf.length)put(`${P}.Q2 三档逐档变好`,'blocked',A.blocked??'熟练档未做',`Q2`);
  else{
    const st=[U,N,Pf].map(t=>stdOnly(t)).map(t=>{const us=prods(t);return {n:t.length,made:us.length,rank:mean(nonNull(us.map(u=>u.rank))),dur:mean(nonNull(us.map(u=>u.maxDur))),uses:mean(us.map(u=>u.uses.length)),tiers:count(us.map(u=>u.tier)),inputGrades:inputs(t)};});
    const tol=0.15,slack=(k,x)=>k==='rank'?tol:Math.abs(x)*0.1,mono=k=>st.every(x=>x[k]!=null)&&st[1][k]>=st[0][k]-slack(k,st[0][k])&&st[2][k]>=st[1][k]-slack(k,st[1][k]);
    const ok=mono('rank')&&mono('dur')&&mono('uses')&&st[2].rank>st[0].rank;
    put(`${P}.Q2 三档逐档变好（手艺档、耐久、保留用途单调不减，熟练严格好于缺技能）`,ok?'pass':'fail',{缺技能:st[0],刚入门:st[1],熟练:st[2],proficiency:[A.tiers['缺技能']?.proficiency,A.tiers['刚入门']?.proficiency,A.tiers['熟练']?.proficiency]},'Q2');
  }
  // Q3 失败有结构
  const all=[...U,...N,...Pf],fails=all.filter(t=>t.failed);
  if(!all.length)put(`${P}.Q3a 失败分档齐全`,'blocked',A.blocked,'Q3');
  else{
    const cats=count(fails.map(t=>t.cat));
    const need=['无损','损耗','报废','部分功能'];
    put(`${P}.Q3a 失败落在无损、损耗、报废、部分功能四类，每类都出现过`,need.every(k=>cats[k])?'pass':'fail',{attempts:all.length,failures:fails.length,byCategory:cats,engineReported:count(fails.map(t=>t.engineCat))},'Q3');
    // 期望按本次实际出现的（检定档, 技能状况）组合逐次加权：每次失败按它那一行的四类概率计期望次数，方差为各次 p(1−p) 之和（二项标准差的逐次推广）；
    // 观测次数与期望之差 ≤ 2.5σ。表里没有那一行的失败（烧制裂损、工坊停用等物理原因）不进比较，单列。
    const tab=failureTable(S.table);
    const inTab=tab?fails.filter(t=>tab.rows[t.degree]?.[t.standing]):[];
    if(!tab)put(`${P}.Q3b 失败频率与数据表参数大致相符`,'fail','balance/crafting.json 里找不到按检定档、技能状况分行的失败分档参数',`Q3`);
    else if(inTab.length<8)put(`${P}.Q3b 失败频率与数据表参数大致相符`,'blocked',`表内失败只有 ${inTab.length} 次，样本不足 8`,'Q3');
    else{
      const n=inTab.length,oc=count(inTab.map(t=>t.cat));
      const cmp=Object.keys(tab.cats).map(k=>{let e=0,v=0;for(const t of inTab){const p=tab.rows[t.degree][t.standing][k]??0;e+=p;v+=p*(1-p);}
        const o=oc[k]??0,sd=Math.sqrt(v),tol=2.5*sd;return {cat:k,expected:+e.toFixed(2),observed:o,sd:+sd.toFixed(2),tol:+tol.toFixed(2),ok:Math.abs(o-e)<=tol+1e-9};});
      put(`${P}.Q3b 失败频率与数据表参数大致相符（按实际出现的检定档×技能状况加权，2.5σ）`,cmp.every(x=>x.ok)?'pass':'fail',{param:tab.id,failures:n,outsideTable:fails.length-n,combos:count(inTab.map(t=>`${t.degree}/${t.standing}`)),cmp},'Q3');
    }
    const bad=fails.filter(t=>!t.books.ok);
    put(`${P}.Q3c 失败消耗的材料账本守恒`,fails.length?(bad.length?'fail':'pass'):'blocked',fails.length?{failures:fails.length,bad:bad.length,example:bad[0]?.books}:'没有失败样本','Q3');
  }
  // Q4 品质沿链传递（分别控制变量）
  const cp=prods(tier(C,'熟练')),crude=C?.crude?.units??[];
  if(C?.blocked||!cp.length)put(`${P}.Q4a 低品质原料：成品不超过原料品质下限`,'blocked',C?.blocked??'C 谱系熟练档没有产物','Q4');
  else{
    // 品质是实例的 grade（数值，标准件 1），不是目录 quality。成品 grade ≤ 劣原料 grade 的下限；且平均 grade 低于真原料对照。
    const minG=Math.min(...crude.map(u=>u.grade??1));
    const capOk=cp.every(u=>u.grade!=null&&u.grade<=minG+1e-9);
    const ctl=prods(stdOnly(spec.Xc===spec.X?tier(A,'熟练'):(A.xc?.['熟练']??[])));
    const ctlG=mean(nonNull(ctl.map(u=>u.grade))),cG=mean(nonNull(cp.map(u=>u.grade)));
    put(`${P}.Q4a 低品质原料：成品品质（grade）不超过原料品质下限（且比真原料对照差）`,capOk&&ctlG!=null&&cG<ctlG?'pass':'fail',{crudeMaterial:C.crude,products:count(cp.map(u=>u.tier)),capGrade:minG,maxProductGrade:Math.max(...cp.map(u=>u.grade??0)),controlMeanGrade:ctlG,crudeMeanGrade:cG,controlMeanRank:mean(nonNull(ctl.map(u=>u.rank))),crudeMeanRank:mean(nonNull(cp.map(u=>u.rank)))},'Q4');
  }
  const bpAll=[...tier(B,'缺技能'),...tier(B,'刚入门'),...tier(B,'熟练')],bp=stdOnly(bpAll),ap=stdOnly(all);
  if(B?.blocked||!prods(bp).length)put(`${P}.Q4b 换更好的工具，期望品质上升`,'blocked',B?.blocked??'B 谱系没有产物','Q4');
  else{
    const ra=mean(nonNull(prods(ap).map(u=>u.rank))),rb=mean(nonNull(prods(bp).map(u=>u.rank)));
    put(`${P}.Q4b 换更好的工具，期望品质上升（真工具 vs 外行自制的劣工具，三档合计）`,ra!=null&&rb!=null&&ra>rb?'pass':'fail',{poorTool:B.poorTool,genuineMeanRank:ra,poorMeanRank:rb,genuineMeanGrade:mean(nonNull(prods(ap).map(u=>u.grade))),poorMeanGrade:mean(nonNull(prods(bp).map(u=>u.grade))),inputGrades:{genuine:inputs(all),poor:inputs(bpAll)},excludedNonStandard:{genuine:all.length-ap.length,poor:bpAll.length-bp.length},genuine:count(prods(ap).map(u=>u.tier)),poor:count(prods(bp).map(u=>u.tier))},'Q4');
  }
  if(!Pf.length)put(`${P}.Q4c 技能更高，期望品质上升`,'blocked',A.blocked??'熟练档未做','Q4');
  else{
    const r=[U,N,Pf].map(t=>mean(nonNull(prods(stdOnly(t)).map(u=>u.rank))));
    put(`${P}.Q4c 技能更高，期望品质上升（同工具同原料）`,r.every(x=>x!=null)&&r[2]>r[0]&&r[1]>=r[0]-0.15?'pass':'fail',{meanRank:{缺技能:r[0],刚入门:r[1],熟练:r[2]},meanGrade:Object.fromEntries(['缺技能','刚入门','熟练'].map((k,i)=>[k,mean(nonNull(prods(stdOnly([U,N,Pf][i])).map(u=>u.grade)))])),inputGrades:{缺技能:inputs(U),刚入门:inputs(N),熟练:inputs(Pf)}},'Q4');
  }
  // Q5 按实例品质报价
  const sl=A.sales;
  if(!sl||sl.blocked||!sl.buyer){const why=sl?.blocked??(sl?`没有买家肯收：${sl.tried.join('；')}`:A.blocked??'无留样');put(`${P}.Q5a 真货报价高于仿制、粗陋`,'blocked',why,'Q5');put(`${P}.Q5b 卖给 NPC 的成交价随实例品质变化`,'blocked',why,'Q5');}
  if(sl?.buyer){
    const rows=k=>Object.values(sl[k]).filter(x=>x.status==='committed');
    for(const [k,label] of [['quotes','Q5a 真货报价高于仿制、粗陋'],['deals','Q5b 卖给 NPC 的成交价随实例品质变化']]){
      const rs=rows(k),gen=rs.filter(x=>x.rank!=null&&x.rank>=S.genuineMin),imi=rs.filter(x=>x.tier==='仿制'||x.tier==='粗陋');
      if(!gen.length||!imi.length){put(`${P}.${label}`,'blocked',{why:'同一时刻没有同时持有真货和仿制/粗陋留样',held:rs.map(x=>x.tier)},'Q5');continue;}
      const ok=Math.min(...gen.map(x=>x.price))>Math.max(...imi.map(x=>x.price));
      // 单件价格按实例品质变化：按 grade × 手艺档价格倍率（balance/crafting rows 的 price）排序，价格单调不减（价格取整允许相等）。
      const idx=x=>(x.grade??1)*S.price(x.tier),ord=[...rs].sort((a,b)=>idx(a)-idx(b));
      const mono=ord.every((x,i)=>i===0||idx(x)<=idx(ord[i-1])+1e-9||x.price>=ord[i-1].price);
      put(`${P}.${label}`,ok&&mono?'pass':'fail',{buyer:sl.buyer,genuineOverImitation:ok,priceFollowsGrade:mono,rows:rs.map(x=>({...x,index:+idx(x).toFixed(4)}))},'Q5');
    }
  }
  // Q7 守恒（每条谱系的全程账本）
  const lb=['A','B','C'].map(k=>L[k]).filter(x=>x?.books);
  put(`${P}.Q7 账本审计为空`,lb.length?(lb.every(x=>x.books.ok)?'pass':'fail'):'blocked',lb.map(x=>({kind:x.kind,...x.books})),'Q7');
}
const count=a=>a.reduce((m,x)=>(m[x??'无']=(m[x??'无']??0)+1,m),{});
// 失败分档参数：在 balance/crafting.json 的 params 里找 id 含 fail/失败/mishap/outcome、值为"检定档 → 技能状况 → 各类概率"的条目；
// 各类键（intact/wear/ruin/partial 等）按名归到四类。返回 rows[检定档][技能状况][类] = 概率。
const KEYCAT=k=>['部分功能','无损','报废','损耗'].find(n=>({无损:/none|intact|lossless|noloss|safe|无损/i,损耗:/wear|damage|loss|损耗|durab|degrad/i,报废:/ruin|scrap|destroy|wreck|break|报废/i,部分功能:/partial|部分|function|half/i})[n].test(k)&&!(n==='损耗'&&/none|noloss|无损/i.test(k)))??null;
function failureTable(tab){
  for(const p of (tab.params??[]).filter(x=>/fail|失败|mishap|outcome/i.test(x.id??''))){
    const v=p.value;if(!v||typeof v!=='object')continue;
    const rows={},cats={};let ok=true;
    for(const [deg,byStanding] of Object.entries(v)){if(!byStanding||typeof byStanding!=='object'){ok=false;break;}rows[deg]={};
      for(const [st,w] of Object.entries(byStanding)){if(!w||typeof w!=='object'){ok=false;break;}const r={};for(const [k,x] of Object.entries(w)){const c=KEYCAT(k);if(c&&typeof x==='number'){r[c]=(r[c]??0)+x;cats[c]=1;}}rows[deg][st]=r;}}
    if(ok&&Object.keys(cats).length>=3)return {id:p.id,rows,cats};
  }
  return null;
}

async function runTree(repo,prefix,{mutSpec}={}){
  const T=await openRepo(repo),S=scales(T);
  const g=T.newGame('spec'),D=derive(T,g.doc);
  let specs=Object.values(D.families);
  if(mutSpec)specs=[mutSpec(D)].filter(Boolean);
  else if(onlyFam)specs=specs.filter(s=>onlyFam.includes(s.family));
  specs.forEach((s,i)=>s.key=`${prefix}${i}`);
  console.log(`[${prefix}] 树 ${repo}；手艺档 ${S.tiers.join('<')}；材料族 ${specs.map(s=>`${s.family}:${s.X}`).join('，')}`);
  const out=[];
  for(const spec of specs){
    const L={};
    for(const kind of ['A','B','C']){
      L[kind]=await lineage(T,S,D,spec,kind,{days,K});
      console.log(`  [${spec.family}/${kind}] ${L[kind].blocked??'完成'}（${L[kind].seconds??'-'} 秒）`);
    }
    judge(prefix,spec,L,S,D);
    out.push({spec,lineages:L});
  }
  return {T,S,specs,out};
}

// —— 基线树 ——
const base=await runTree(BASE,'');
const fams=new Set(base.specs.map(s=>s.family));
put('Q0 数据推出的材料族不少于 3 个',fams.size>=3?'pass':'fail',[...fams],'Q0');
// 每组断言至少覆盖 3 个材料族
for(const g of ['Q1','Q2','Q3','Q4','Q5']){
  const byFam={};for(const r of results.filter(r=>r.group===g&&!/^V/.test(r.id))){const f=r.id.split('.')[0];(byFam[f]??=[]).push(r.status);}
  const okF=Object.entries(byFam).filter(([,s])=>s.every(x=>x==='pass')).map(([f])=>f);
  put(`${g}* 该组断言在至少 3 个材料族上全部成立`,okF.length>=3?'pass':'fail',{passingFamilies:okF,families:Object.keys(byFam)},'cover');
}

// —— 通用性变异 ——
let mut=null;
if(!has('--no-mut')){
  const {build,NEW}=await import('./mutate.mjs');
  const info=await build({rebuild:has('--rebuild')});
  let ok=true,err=null;try{mut=await runTree(MUT,'V',{mutSpec:D=>{const f=Object.values(D.families).find(s=>s.X===NEW.recipe);if(f)return f;
    // 选族时没被挑中也照样测它：按同一规则补出它的规格。
    const r=D.recipe(NEW.recipe);return {family:`新(${info.family})`,X:r.id,skill:r.skill,station:D.station(r.workstation),teachers:D.teachersOf(r),output:r.output.item,uses:D.usesOf(r.output.item),
      poorTool:(r.tools??[]).map(t=>({item:t,recipe:(D.prod[t]??[])[0]?.id})).find(x=>x.recipe)??null,Xc:r.id,
      ...(()=>{const Xd=D.losable(r.output.item).length?r:D.pickXd(D.familyOf(r),r);return {Xd:Xd?.id??null,usesD:Xd?D.usesOf(Xd.output.item):[]};})(),crudeMaterial:r.materials.map(m=>({item:m.item,amount:m.amount,recipe:(D.prod[m.item]??[])[0]?.id})).find(x=>x.recipe)??null};}});}
  catch(e){ok=false;err=String(e?.stack??e).slice(0,600);}
  put('V0 变异副本只改数据就能载入并跑通',ok?'pass':'fail',ok?info:err,'V');
}

const summary={pass:0,fail:0,blocked:0};for(const r of results)summary[r.status]++;
const report={tree:BASE,days,trials:K,tiers:base.S.tiers,seconds:Math.round((Date.now()-t0)/1000),summary,results,
  specs:base.specs,detail:base.out.map(o=>({spec:o.spec,lineages:Object.fromEntries(Object.entries(o.lineages).map(([k,v])=>[k,{...v,steps:v.steps.slice(0,60)}]))})),
  mutation:mut?{specs:mut.specs,detail:mut.out.map(o=>({spec:o.spec,lineages:Object.fromEntries(Object.entries(o.lineages).map(([k,v])=>[k,{...v,steps:v.steps.slice(0,60)}]))}))}:null};
write(process.env.ACC_TAG?`acceptance-${process.env.ACC_TAG}.json`:'acceptance.json',report);
console.log(JSON.stringify(summary),`${report.seconds} 秒`);
process.exitCode=summary.fail||summary.blocked?1:0;
