// P3 工具报废：玩家用真实动作反复使用一件工具，直到它磨损报废。
// 选法全从数据推出：有师傅可学、要用工具、带磨损的配方；它的工具世界里有人卖。
// 排序：投入全是自然物的优先（不依赖制成品的存量），再按"磨坏要做几批"（工具耐久 ÷ 每批磨损）从少到多。
// 每轮：缺料就向持有人买、去带这种料的据点采；什么都弄不到就真实等一天（最多 waitDays 天），再做尽可能多的批次。
import {act,at,say,inv,pinv} from './lib.mjs';

async function buyN(c,seller,item,n){
  let r=null;
  for(let i=0;i<3;i++){
    const s=c.doc.state.npcs[seller];if(!s||inv(s,item)<=0)break;
    await at(c,s.location);
    r=await act(c,'core:trade.buy',{seller,item,quantity:Math.min(n,inv(s,item))});
    if(r.status==='committed')break;
    if(!/此刻不提供|不在场|不在此/.test(r.reason??''))break;
    await act(c,'core:time',{minutes:60});
  }
  return r;
}
const toolState=(doc,tool)=>{const e=doc.state.inventory?.[tool];return {qty:e?.quantity??0,durability:e?.durability??null};};
const broken=(doc,tool,startQty)=>{const s=toolState(doc,tool);return s.qty<startQty||(s.durability!==null&&s.durability<=0);};

// 上限：每次最多 maxActions 个动作、wallMs 毫秒墙钟（本机单次运行不超 15 分钟的约束）；到上限按"驱动不出来"记。
export async function wearOut(c,{D,world,M,waitDays=3,maxRounds=40,maxActions=300,wallMs=180000}){
  const a0=c.log.length,t0=Date.now(),over=()=>c.log.length-a0>maxActions||Date.now()-t0>wallMs;
  const refused=new Set();
  const avail=it=>Object.values(c.doc.state.npcs).some(n=>inv(n,it)>0);
  const cands=[];
  for(const r of D.recipes){
    if(!r.toolWear||!r.tools?.length||!r.teachers?.length||!r.workstation)continue;
    if(!r.tools.every(avail))continue;
    const target=[...r.tools].sort((a,b)=>(D.items[a]?.durability??100)-(D.items[b]?.durability??100))[0];
    cands.push({recipe:r,target,batches:Math.ceil((D.items[target]?.durability??100)/r.toolWear),natural:r.materials.every(m=>!M.has(m.item))});
  }
  cands.sort((a,b)=>(b.natural-a.natural)||(a.batches-b.batches));
  const report={candidates:cands.slice(0,5).map(x=>({recipe:x.recipe.id,tool:x.target,batches:x.batches,naturalInputs:x.natural})),runs:[]};
  for(const cand of cands.slice(0,4)){if(over())break;
    const r=cand.recipe,tool=cand.target,run={recipe:r.id,tool,steps:[],durability:[]};report.runs.push(run);
    // 工具
    for(const t of r.tools){if(pinv(c.doc,t)>0)continue;const h=Object.entries(c.doc.state.npcs).find(([,n])=>inv(n,t)>0);const b=await buyN(c,h[0],t,1);run.steps.push(`买工具 ${t}（${h[0]}）：${say(b)}`);}
    if(!r.tools.every(t=>pinv(c.doc,t)>0)){run.result='买不到工具';continue;}
    // 学
    const teacher=r.teachers[0];
    for(let i=0;i<8;i++){const p=await act(c,'core:craft.manufacture',{recipe:r.id},{commit:false});if(!/尚未学会|技能/.test(p.reason??''))break;
      const t=c.doc.state.npcs[teacher];if(t)await at(c,t.location);const l=await act(c,'core:learn',{kind:'recipe',entity:r.id,source:teacher,mode:'acquire'});run.steps.push(`学 ${r.id}：${say(l)}`);if(l.status==='rejected'){if(/前置|资格|没有/.test(l.reason??''))break;await act(c,'core:time',{minutes:120});}}
    if(/尚未学会|技能/.test((await act(c,'core:craft.manufacture',{recipe:r.id},{commit:false})).reason??'')){run.result='学不会';continue;}
    const station=Object.values(world.locations).find(l=>(l.workstations??[]).some(w=>w.kind===r.workstation))?.id;
    const startQty=toolState(c.doc,tool).qty;run.durability.push(toolState(c.doc,tool).durability);
    let waited=0;
    for(let round=0;round<maxRounds&&!broken(c.doc,tool,startQty)&&!over();round++){
      // 缺料：买、采
      const left=Math.ceil((toolState(c.doc,tool).durability??0)/r.toolWear)||1;
      for(const m of r.materials){
        const need=m.amount*left-pinv(c.doc,m.item);if(need<=0)continue;
        for(const [id,n] of Object.entries(c.doc.state.npcs).filter(([id,n])=>inv(n,m.item)>0&&!(n.hp<=0)&&!refused.has(id+m.item)).slice(0,4)){if(pinv(c.doc,m.item)>=m.amount*left||over())break;const b=await buyN(c,id,m.item,m.amount*left-pinv(c.doc,m.item));run.steps.push(`买料 ${m.item}（${id}）：${say(b)}`);if(b?.status!=='committed')refused.add(id+m.item);}
        for(const l of Object.values(world.locations).filter(l=>(l.site?.resources??[]).some(x=>x.item===m.item&&!x.requires&&!x.mechanisms)).filter(l=>!refused.has(l.id+m.item)).slice(0,2)){
          if(pinv(c.doc,m.item)>=m.amount*left||over())break;
          const res=l.site.resources.find(x=>x.item===m.item);await at(c,l.id);await act(c,'core:site.enter',{});
          const g=await act(c,'core:site.gather',{target:res.id,quantity:m.amount*left-pinv(c.doc,m.item)});run.steps.push(`采料 ${m.item}（${l.id}）：${say(g)}`);if(g.status!=='committed')refused.add(l.id+m.item);}
      }
      const can=Math.min(left,...r.materials.map(m=>Math.floor(pinv(c.doc,m.item)/m.amount)));
      if(can<=0){if(waited>=waitDays){run.steps.push(`料不够，已等 ${waited} 天`);break;}await act(c,'core:time',{minutes:1440});waited++;continue;}
      if(station)await at(c,station);
      const k=await act(c,'core:craft.manufacture',{recipe:r.id,batches:can});run.steps.push(`做 ${can} 批：${say(k)}`);
      run.durability.push(toolState(c.doc,tool).durability);
      if(k.status!=='committed'&&!/失败/.test(k.reason??''))break;
    }
    run.broken=broken(c.doc,tool,startQty);run.actions=c.log.length-a0;run.capped=over();run.steps=run.steps.slice(-25);
    if(run.broken)return {...report,broke:true,tool,recipe:r.id};
  }
  return {...report,broke:false};
}
