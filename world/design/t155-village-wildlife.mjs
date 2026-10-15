// Eight offers, plus two local explanations. No new people, species or spells.
export const revision='t155-v1';
const offer=(id,name,board,objective,content)=>({id,name,board,grade:'D',reward:60,days:10,objective,content});
export const offers=[
 offer('t155_hw_tower','废塔骨架清理','loc_hw',{type:'creature',location:'site_beilin_tower',species:'monster_tower_footing_skeleton',outcomes:['death']},
  '陈柏收废观测塔林隙的清理单。只核对告示指定的塔基骷髅，须有该个体死亡的实据；绕塔走一圈不算完工。'),
 offer('t155_wt_soul','雾滩送离','loc_bs_weiting',{type:'creature',location:'loc_wild_wt_mist',species:'monster_mist_flat_soul',outcomes:['expelled','ferried']},
  '郑汐收下游雾滩的送离单。指定汀雾游魂可用驱邪符驱离，也可用度亡送往安魂牌；只伤它或见过它都不交割。'),
 offer('t155_bs_lamp','废窑驱灯','loc_bs',{type:'creature',location:'loc_wild_bs_kiln',species:'monster_tile_lamp_wraith',outcomes:['expelled']},
  '白石镇公告栏收西郊废窑的驱灯单。核清指定瓦灯魅后用驱邪符送离；灯挪到另一堆碎瓦上，还不算驱净。'),
 offer('t155_sb_corpse','荒冢止尸','loc_bs_sangban',{type:'creature',location:'loc_wild_sb_barrow',species:'monster_barrow_stiff_corpse',outcomes:['death']},
  '张洛收西坡荒冢的止尸单。告示指向一具已现身的冢坡硬尸，核验其死亡才付酬；活人、遗体与别的个体均不能顶替。'),
 offer('t155_yp_offering','榆根守界供物','loc_bs_yupo',{type:'pact',location:'site_ms_yg_gate',target:'npc_ms_yg_jiecang',pact:'respect_territory',offer:[{item:'item_ration',quantity:1}],request:[]},
  '赵枫托人向节苍交一份自备干粮，并议定守界。供物从携带的实物中交出；节苍不收的东西不可强塞，供奉也不使他归人役使。'),
 offer('t155_lq_trade','裂炉换铁','loc_bs_liquan',{type:'pact',location:'site_ms_ll_forge',target:'npc_ms_ll_yayue',pact:'respect_territory',offer:[{item:'item_ration',quantity:1}],request:[{item:'item_iron',quantity:1}]},
  '栾佩托人向牙钺议守界，以自备干粮参与换铁，至少交一份干粮并带回一份铁料。交出的目录价值须够，铁料也须仍在对方库存里。'),
 offer('t155_hw_avoid','北林守界商谈','loc_hw',{type:'pact',location:'site_ms_td_commons',target:'npc_ms_td_liheng',pact:'respect_territory',offer:[],request:[]},
  '陈柏托人到苔灯坞与栗衡议定守界，彼此避让领地。须由栗衡当面接受；不能把在林口留话当成双方立约，也不因狐族身份先定敌我。'),
 offer('t155_bs_material','公署备药','loc_bs',{type:'deliver',location:'loc_bs',item:'item_herb',quantity:2},
  '白石镇公告栏收两份药草作往来备料。当面交给告示主事人，药草从承接人的行囊移入收件人的库存；口头报有货不能领酬。'),
];
export const localFacts=[
 {id:'t155_hw_notice',board:'loc_hw',name:'河湾清理告示说明',text:'陈柏的生物清理告示只列已在指定栖地现身的个体，写明对象后再托管公款。告示到期未交割，余款回公账；不能拿另一只同名生物替数。'},
 {id:'t155_wt_rites',board:'loc_bs_weiting',name:'苇汀送离说明',text:'郑汐的送离单指定无主的低阶汀雾游魂，它是非神性的恶灵，可用驱邪符驱离，也可度亡送至安魂牌。只伤它不能交割，度亡也不使它复活。'},
];
export const entries=[...offers.map(o=>({id:o.id,kind:'offer',name:o.name,board:o.board,grade:o.grade,reward:o.reward,days:o.days,objective:o.objective})),...localFacts.map(f=>({id:f.id,kind:'fact',name:f.name,board:f.board}))].map(e=>({...e,rev:['t155_wt_soul','t155_sb_corpse','t155_wt_rites'].includes(e.id)?2:1}));
export function draftFor(e){return {id:e.id,text:offers.find(o=>o.id===e.id)?.content??localFacts.find(f=>f.id===e.id).text};}
export function applyBatch(world){
 const w=structuredClone(world);w.rules.questSources.wildlife=structuredClone(offers);
 for(const f of localFacts){const p=w.settlementProfiles.find(p=>p.id===f.board);p.facts=[...p.facts.filter(t=>!localFacts.some(x=>x.text===t)),f.text];}
 return w;
}
