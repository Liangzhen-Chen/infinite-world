// 真实学习驯兽并驯服：去白石镇等梁驯开课→学驯兽师基础手艺→逐日练到 100→回河湾买饲料→追踪→接近、喂食攒信任→驯服。
import {act,trackOne} from './lib.mjs';
const say=r=>`${r.status}${r.reason?'：'+r.reason:''}`;
export async function learnTaming(c,log){
  await act(c,'core:move',{destination:'loc_bs'});
  await act(c,'core:time.sleep',{until:{dayOffset:1,hour:8,minute:30}});
  // 学艺有检定：没学会就再上一课（每次真实付学费、耗时）。
  let l;for(let i=0;i<6&&!c.doc.state.skills?.skill_life_15_core;i++){l=await act(c,'core:learn',{entity:'skill_life_15_core',source:'npc_a3_exam_life_15'});if(l.status==='rejected'&&/此刻不提供/.test(l.reason??''))await act(c,'core:time.sleep',{until:{dayOffset:1,hour:8,minute:30}});}
  log.push(`core:learn 向梁驯学驯兽师基础手艺：${c.doc.state.skills?.skill_life_15_core?'学会':'没学会：'+(l?.reason??'检定未过')}`);
  if(!c.doc.state.skills?.skill_life_15_core)return false;
  const prof=()=>c.doc.state.skills?.skill_life_15_core?.proficiency??0;
  let day=0;while(prof()<100&&day<30){for(let i=0;i<3;i++){const p=await act(c,'core:practice.session',{skill:'skill_life_15_core',minutes:180});if(p.status==='rejected'){if(day===0&&i===0)log.push('练习被拒：'+p.reason);break;}}
    await act(c,'core:time.sleep',{until:{dayOffset:1,hour:7,minute:0}});day++;}
  log.push(`core:practice.session 逐日练习 ${day} 天，熟练度 ${prof()}`);return prof()>=100;
}
export async function buyFood(c,food,log,want=8){
  const have=()=>c.doc.state.inventory?.[food]?.quantity??0;
  for(const [id,n] of Object.entries(c.doc.state.npcs).filter(([,n])=>/_hw/.test(String(n.location))&&(n.inventory?.[food]?.quantity??n.inventory?.[food]??0)>0)){if(have()>=want)break;
    await act(c,'core:move',{destination:n.location});for(let i=0;i<4&&have()<want;i++){const b=await act(c,'core:trade.buy',{seller:id,item:food,quantity:1});if(b.status==='rejected'){log.push(`向 ${id} 买 ${food}：${say(b)}`);break;}}}
  log.push(`饲料 ${food} 备了 ${have()} 份`);
}
export async function tameOne(c,species,food,habitatLoc,log){
  await act(c,'core:move',{destination:habitatLoc});
  let g=await trackOne(c,species,10);if(!g){log.push(`追踪 ${species}：未遇到`);return null;}
  // 信任按日累积（每天的接近、喂食、梳理各算一次）：逐日照料，每天试一次驯服。
  let days=0,retracks=0;for(;days<12;days++){
    if(c.doc.state.creatures?.[g]?.location&&c.doc.state.creatures[g].location!==c.doc.state.location)await act(c,'core:move',{destination:c.doc.state.creatures[g].location});
    const ct=await act(c,'core:pet.contact',{target:g}),f=await act(c,'core:pet.feed',{target:g,item:food}),gr=await act(c,'core:pet.groom',{target:g});
    if(days===0)log.push(`第1天 contact：${say(ct)}；feed：${say(f)}；groom：${say(gr)}`);
    const t=await act(c,'core:pet.tame',{target:g,item:food});if(t.status==='committed'){log.push(`照料 ${days+1} 天后 core:pet.tame：成功`);return g;}
    if(ct.status==='rejected'&&f.status==='rejected'){log.push(`第${days+1}天照料都被拒：${ct.reason}／${f.reason}`);
      if(/死亡|不在场/.test(ct.reason??'')&&retracks++<2){await act(c,'core:move',{destination:habitatLoc});g=await trackOne(c,species,10);log.push(`换一只重新追踪：${g?'找到':'未遇到'}`);if(!g)break;continue;}
      break;}
    await act(c,'core:time.sleep',{until:{dayOffset:1,hour:9,minute:0}});}
  const fed=days;
  const ins=await act(c,'core:pet.inspect',{target:g},{commit:false});log.push(`共喂 ${fed} 次仍未驯服；pet.inspect：${JSON.stringify(ins.result).slice(0,600)}`);return null;
}
