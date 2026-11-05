// 由数据推出要测的材料族、配方、可降级的工具与原料。不按物品或配方名单。
import fs from 'node:fs';
import path from 'node:path';
import {inv} from './lib.mjs';
// 材料族：按投入物品的性状归族（卡里点名的木、金属、皮、布、石）。
export const FAMILY_TAGS={'木':['timber','wood'],'金属':['metal','iron','ore','steel'],'皮':['leather','hide'],'布':['cloth','fiber','wool','flax','silk','yarn'],'石':['stone','clay','ceramic','slate']};
export function familyOfItem(it){const t=it?.tags??[];for(const [f,tags] of Object.entries(FAMILY_TAGS))if(t.some(x=>tags.includes(x)))return f;return null;}
export function derive(T,doc,home='loc_hw'){
  const W=T.world,I=Object.fromEntries(W.items.map(i=>[i.id,i]));
  const useCfg=JSON.parse(fs.readFileSync(path.join(T.repo,'world/meta/item-use-tags.json'),'utf8'));
  const recipeTools=new Set(W.recipes.flatMap(r=>r.tools??[]));
  // 用途集（与引擎读的用途同一口径，全部从数据推）：命中的用途类别（类别规则的 tags、recipeTool、nutrition）+ 物品性状里的用途标签
  // + 物品带的机制字段 combat（战斗属性）、checkBonus（检定加成）。
  const usesOf=id=>{const it=I[id],t=it?.tags??[],u=new Set();
    for(const [k,cl] of Object.entries(useCfg.classes))if(!(cl.exclude??[]).some(x=>t.includes(x))&&((cl.tags??[]).some(x=>t.includes(x))||cl.recipeTool&&recipeTools.has(id)||cl.nutrition&&it?.nutrition))u.add(k);
    for(const x of t)if(useCfg.tags[x])u.add(x);
    for(const f of ['combat','checkBonus'])if(it?.[f])u.add(f);return [...u];};
  // 可丢的用途：低手艺档（balance/crafting.json 各档 loses）会拿走、而这件物品本来就有的用途。没有可丢用途的物品不能当"缺用途"的样本。
  const crafting=JSON.parse(fs.readFileSync(path.join(T.repo,'world/rules/tables/balance/crafting.json'),'utf8'));
  const losesAll=new Set((crafting.rows??[]).flatMap(r=>r.loses??[]));
  const losable=id=>usesOf(id).filter(u=>losesAll.has(u));
  const code=home.split('_')[1],local=loc=>String(loc??'').split('_')[1]===code;
  const holders=it=>Object.entries(doc.state.npcs).filter(([,n])=>inv(n,it)>0&&local(n.location)).reduce((s,[,n])=>s+inv(n,it),0);
  const sites=it=>W.locations.filter(l=>local(l.id)&&(l.site?.resources??[]).some(r=>r.item===it)).length;
  const obtainable=it=>holders(it)>0||sites(it)>0;
  const knowers=sk=>W.npcs.filter(p=>(p.proficiencies?.[sk]??p.skills?.[sk])&&local(p.location)).map(p=>p.id);
  const stations=kind=>W.locations.filter(l=>(l.workstations??[]).some(w=>w.kind===kind)).map(l=>({id:l.id,local:local(l.id),access:l.workstations.find(w=>w.kind===kind).access}));
  const station=kind=>{if(!kind)return null;const s=stations(kind).sort((a,b)=>(b.local-a.local)||((b.access==='public')-(a.access==='public')));return s[0]?.id??null;};
  const prod={};for(const r of W.recipes)(prod[r.output.item]??=[]).push(r);
  const teachersOf=r=>[...new Set([...(r.teachers??[]),...knowers(r.skill)])].filter(id=>doc.state.npcs[id]);
  const makeable=r=>r.materials.every(m=>obtainable(m.item))&&(r.tools??[]).every(obtainable)&&(!r.workstation||station(r.workstation));
  const familyOf=r=>{const ms=[...r.materials].sort((a,b)=>b.amount-a.amount);for(const m of ms){const t=I[m.item]?.tags??[];if(t.includes('fuel')&&!t.includes('timber'))continue;const f=familyOfItem(I[m.item]);if(f)return f;}return null;};
  const crafted=r=>r.materials.filter(m=>(prod[m.item]??[]).some(makeable)).map(m=>({item:m.item,amount:m.amount,recipe:(prod[m.item]??[]).find(makeable).id}));
  const poorTools=r=>(r.tools??[]).filter(t=>(prod[t]??[]).some(makeable)).map(t=>({item:t,recipe:(prod[t]??[]).find(makeable).id}));
  const ok=r=>r.skill&&teachersOf(r).length&&r.materials.every(m=>obtainable(m.item)||(prod[m.item]??[]).some(makeable))&&(r.tools??[]).every(obtainable)&&(!r.workstation||station(r.workstation))&&(I[r.output.item]?.durability>0)&&usesOf(r.output.item).includes('durable');
  const cost=r=>[...r.materials.map(m=>(I[m.item]?.basePrice??0)*m.amount),...(r.tools??[]).map(t=>I[t]?.basePrice??0)].reduce((a,b)=>a+b,0);
  const score=r=>(usesOf(r.output.item).length?8:0)+(crafted(r).length?4:0)+(poorTools(r).length?4:0)+((r.minimumProficiency??0)===0?2:0)-(r.tools??[]).length*0.5-cost(r)/50;
  const pickXd=(f,X)=>W.recipes.filter(r=>r.id!==X.id&&r.skill&&familyOf(r)===f&&losable(r.output.item).length&&makeable(r))
    .sort((a,b)=>((b.skill===X.skill)-(a.skill===X.skill))||((a.tools??[]).length-(b.tools??[]).length)||(cost(a)-cost(b))||a.id.localeCompare(b.id))[0]??null;
  const byFam={};
  for(const r of W.recipes.filter(ok)){const f=familyOf(r);if(f)(byFam[f]??=[]).push(r);}
  // 逐族贪心挑选：同分时换技能、换工具（避免所有族都落在同一门手艺、同一把工具上）。
  const out={},usedSkill=new Set(),usedTool=new Set();
  const ORDER=Object.keys(FAMILY_TAGS);for(const [f,rs] of Object.entries(byFam).sort((a,b)=>ORDER.indexOf(a[0])-ORDER.indexOf(b[0]))){
    const pen=r=>(usedSkill.has(r.skill)?6:0)+(r.tools??[]).filter(t=>usedTool.has(t)).length*3;
    rs.sort((a,b)=>(score(b)-pen(b))-(score(a)-pen(a))||a.id.localeCompare(b.id));
    const X=rs.find(r=>poorTools(r).length)??rs[0];
    const Xc=crafted(X).length?X:rs.find(r=>crafted(r).length&&r.skill===X.skill)??rs.find(r=>crafted(r).length)??null;
    usedSkill.add(X.skill);for(const t of X.tools??[])usedTool.add(t);
    // Q1d 的样本配方：X 的产物有可丢用途就用 X；否则在同族、取得得到的配方里另选产物有可丢用途的（同技能优先，再换工具、换材料）。
    const Xd=losable(X.output.item).length?X:pickXd(f,X);
    out[f]={family:f,X:X.id,skill:X.skill,station:station(X.workstation),teachers:teachersOf(X),output:X.output.item,uses:usesOf(X.output.item),
      poorTool:poorTools(X)[0]??null,Xc:Xc?.id??null,XcStation:Xc?station(Xc.workstation):null,XcTeachers:Xc?teachersOf(Xc):[],crudeMaterial:Xc?crafted(Xc)[0]:null,candidates:rs.length,
      Xd:Xd?.id??null,XdStation:Xd?station(Xd.workstation):null,usesD:Xd?usesOf(Xd.output.item):[],losableD:Xd?losable(Xd.output.item):[]};
  }
  return {I,usesOf,losable,familyOf,pickXd,makeable,station,teachersOf,prod,families:out,recipe:id=>W.recipes.find(r=>r.id===id)};
}
