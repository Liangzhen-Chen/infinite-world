// Only opening knowledge is authored. Travel, presence and social standing are read live.
export const pairs=[['npc_hw_shendu','npc_hw_zhengshuisheng'],['npc_hw_linsui','npc_hw_chenbai'],['npc_hw_luqing','npc_hw_xuling'],['npc_hw_wushuo','npc_hw_gucen'],['npc_hw_duanyan','npc_hw_sulan'],['npc_hw_luowei','npc_hw_meiling']];
export const ref=(collection,id,field)=>({collection,id,field});
export function row(n,i,claim,truth,evidence,fact,verification,stance){
 const [source,to]=pairs[(i+n-1)%pairs.length];
 return{id:`rumor_w5_${n}_${String(i+1).padStart(2,'0')}`,claim,truth,source,carriers:[],delivery:{to,channel:'carry'},evidence,fact,verification,
  stance:stance??['转信者关心出处和回话','做饭人关心来往者的口粮','读书人想把旧例说清','走林人关心边界与安全','匠人留意损坏和责任','田里人关心用水和分份'][(i+n-1)%pairs.length],
  status:'authored-seed',propagation:'pending-event',distortion:truth==='true'?'沿路转述可能省掉地点或核查条件，不能据此当作当前公告。':truth==='half'?'保留一个真细节，省掉限制后下了过宽的判断。':'把旧事的原因、边界或归属说反了，需回到原处核对。'};
}
export async function siteRumors(n,siteGroup,world){
 const {siteClaims}=await import('./w5-rumors-sites.mjs');const out=[];
 for(const [id,a,b]of siteClaims[siteGroup-1]){const l=world.locations.find(l=>l.id===id),e=[ref('locations',id,'site.truths'),ref('locations',id,'site.clues')],f=`${l.name}的调查结论：${l.site.truths[0].text}`;
  const verify=`沿现有道路到${l.name}，处理登记的入口阻碍，再分别查${l.site.clues.map(c=>c.name).join('、')}；不能用听闻代替调查或物主许可。`;
  out.push(row(n,out.length,a,'true',e,f,verify));
  const partial=new Set(['loc_wild_bs_kiln','site_w5_td_trap_shrine','site_w5_halfway_post','site_w5_old_bank_altar','site_w5_stone_markers','site_basalt_steps','site_w5_ll_deep_drift','site_w5_cold_smelter','site_w5_orc_cairn','site_w5_indigo_ditch','site_w5_ferry_shrine','site_w5_reed_salt','site_rainstone_basin','site_w5_tj_kiln_shrine','site_w5_well_camp']);
  out.push(row(n,out.length,b,partial.has(id)?'half':'false',e,f,verify));
 }
 if(n===3)for(let j=0;j<5;j++){const id=siteClaims[0][j][0],l=world.locations.find(l=>l.id===id),c=l.site.clues[1];
  out.push(row(n,out.length,`${l.name}还有个细节：${c.text}`,'true',[ref('locations',id,'site.clues.1')],`所述是${c.name}的登记内容，尚不等于已查清整处旧事。`,`到${l.name}实际调查${c.name}，与另一条线索对读。`));}
 return out;
}
