// 只读剖析用的加载钩子：在加载时给指定函数声明套一层计数包装（不改磁盘上的引擎文件）。
// 被 tools/prof-day.mjs 通过 module.register 注册；包装调用 globalThis.__PROF.wrap。
const TARGETS={
  'server-plugin/npc-labor.mjs':['laborCandidates','route'],
  'server-plugin/market.mjs':['marketSupply'],
  'server-plugin/household-budget.mjs':['householdBudget','readHouseholdResources'],
  'server-plugin/building-maintenance.mjs':['route'],
};
export async function load(url,context,nextLoad){
  const r=await nextLoad(url,context);
  if(r.format!=='module'||r.source==null)return r;
  const hit=Object.keys(TARGETS).find(k=>url.endsWith('/'+k));
  if(!hit)return r;
  let src=String(r.source),tail='';
  const label=hit.split('/').pop().replace('.mjs','');
  for(const name of TARGETS[hit]){
    const re=new RegExp(`(^|\\n)(export )?(async )?function ${name}\\(`);
    const m=re.exec(src);if(!m)continue;
    src=src.replace(re,(all,a,b,c)=>`${a}${c??''}function __orig_${name}(`);
    tail+=`\n${m[2]??''}${m[3]??''}function ${name}(...a){return globalThis.__PROF?globalThis.__PROF.wrap('${name}@${label}',a,__orig_${name}):__orig_${name}(...a);}`;
  }
  return {...r,source:src+tail};
}
