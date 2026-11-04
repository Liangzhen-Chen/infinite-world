// 真实备齐某类工位的一条配方：向会这门手艺的人学（world_learn），向有货的人买工具和材料（core:trade.buy）。
// 配方、师傅候选、卖家全部从世界数据与当前存档推出，不写名单。
import {say,inv,npcInv} from './lib.mjs';
export const kindsOf=world=>[...new Set(world.recipes.map(r=>r.workstation).filter(Boolean))].sort();
const at=async(env,c,dest)=>(c.doc.state.location===dest?null:env.act(c,'core:move',{destination:dest}));
const nextMorning=async(env,c)=>env.call(c,'world_time',{until:{dayOffset:1,hour:9,minute:0},activity:'睡眠'});
const TIMEY=/时间|时段|休息|离开前|营业|当班|不在|此刻|服务/;
export async function learnRecipe(env,c,r,log){
  const npcs=c.doc.state.npcs,P=id=>(env.world.npcs.find(n=>n.id===id)?.proficiencies?.[r.skill]??0);
  // 先用只读探针找出此刻愿意教的人（副本上试 world_learn，不落盘），再真实走过去学。
  const willing=[];for(const [id,n] of Object.entries(npcs)){if(n.hp<=0||!n.location)continue;const d=structuredClone(c.doc);d.state.location=n.location;if((await env.call({...c,doc:d},'world_learn',{kind:'recipe',entity:r.id,source:id},{commit:false})).status==='committed')willing.push(id);}
  const cands=[...new Set([...willing,...(r.teachers??[]),...Object.keys(npcs).filter(id=>P(id)>(r.minimumProficiency??0)&&!(npcs[id].hp<=0)).sort((a,b)=>P(b)-P(a))])].filter(id=>npcs[id]).slice(0,6);
  for(const t of cands){
    for(let day=0;day<3&&!c.doc.state.recipes?.[r.id];day++){
      for(let k=0;k<4&&!c.doc.state.recipes?.[r.id];k++){
        const loc=c.doc.state.npcs[t]?.location;if(!loc)break;
        const m=await at(env,c,loc);if(m&&m.status==='rejected'){log.push(`去 ${loc} 找 ${t}：${say(m)}`);break;}
        const x=await env.call(c,'world_learn',{kind:'recipe',entity:r.id,source:t});log.push(`向 ${t} 学 ${r.id}：${say(x)}`);
        if(x.status==='rejected'){if(TIMEY.test(x.reason??''))break;else{day=9;break;}}
      }
      if(!c.doc.state.recipes?.[r.id]&&day<3)await nextMorning(env,c);
    }
    if(c.doc.state.recipes?.[r.id])return true;
  }
  return false;
}
export async function buy(env,c,item,n,log){
  for(let tries=0;tries<2&&inv(c.doc,item)<n;tries++){
    const sellers=Object.entries(c.doc.state.npcs).filter(([,x])=>npcInv(x,item)>=n-inv(c.doc,item)&&!(x.hp<=0)).slice(0,5);
    if(!sellers.length){log.push(`世界里没有人库存有 ${item}`);return false;}
    for(const [id,x] of sellers){
      if(inv(c.doc,item)>=n)break;
      const m=await at(env,c,x.location);if(m&&m.status==='rejected'){log.push(`去 ${x.location}：${say(m)}`);continue;}
      let q=n-inv(c.doc,item),b=await env.act(c,'core:trade.buy',{seller:id,item,quantity:q});log.push(`向 ${id} 买 ${item}×${q}：${say(b)}`);
      // 当天成交深度不够时按件买（真实逐笔交易）。
      for(let j=0;j<n&&b.status==='rejected'&&/深度|没有那么多/.test(b.reason??'')&&inv(c.doc,item)<n;j++){const r1=await env.act(c,'core:trade.buy',{seller:id,item,quantity:1});log.push(`向 ${id} 买 ${item}×1：${say(r1)}`);if(r1.status==='rejected')break;}
    }
    if(inv(c.doc,item)<n)await nextMorning(env,c);
  }
  return inv(c.doc,item)>=n;
}
// 备齐 K 类的一条配方（学会 + 工具 + 材料，材料备 copies 份）。返回 {ok, recipe, log}。
export async function equip(env,c,K,copies=1){
  const log=[];
  const rs=env.world.recipes.filter(r=>r.workstation===K&&!(r.minimumProficiency>0)&&!(r.prerequisites?.length)).sort((a,b)=>(b.teachers?.length?1:0)-(a.teachers?.length?1:0)||a.materials.length-b.materials.length);
  for(const r of rs.slice(0,4)){
    if(!await learnRecipe(env,c,r,log)){log.push(`未学会 ${r.id}`);continue;}
    let ok=true;
    for(const t of r.tools??[])ok=ok&&await buy(env,c,t,1,log);
    for(const m of r.materials??[])ok=ok&&await buy(env,c,m.item,m.amount*copies,log);
    if(ok)return {ok:true,recipe:r,log};
    log.push(`${r.id} 工具或材料没备齐`);
  }
  return {ok:false,recipe:null,log};
}
