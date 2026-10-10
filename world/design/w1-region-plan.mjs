// Reserved design identifiers, not published locations or generated residents.
export const w1RegionPlan={
 version:1,scope:'白石镇辖区LOD0',counting:'full与roster为互斥档级；人口册仅计常住者，访客与通勤者另列。',
 settlements:[
  {id:'loc_hw',prefix:'hw',name:'河湾村',population:58,full:30,roster:28,households:22,status:'本批设计'},
  {id:'loc_bs_yupo',prefix:'yp',name:'榆坡村',population:80,full:30,roster:50,status:'预留，未起草'},
  {id:'loc_bs_weiting',prefix:'wt',name:'苇汀村',population:100,full:30,roster:70,status:'预留，未起草'},
  {id:'loc_bs_liquan',prefix:'lq',name:'砾泉村',population:96,full:30,roster:66,status:'预留，未起草'},
  {id:'loc_bs_sangban',prefix:'sb',name:'桑坂村',population:110,full:30,roster:80,status:'预留，未起草'},
  {id:'loc_bs',prefix:'bs',name:'白石镇',population:1000,full:100,roster:206,status:'预留，未起草；严辙计入本地full'}
 ],
 identifiers:{person:'npc_<settlement prefix>_<stable romanized name>',household:'house_<prefix>_<stable number>',privateHome:'bld_<prefix>_home_<stable number>'},
 kinship:'亲属先进入同一人口册或明确外居索引，父母与子女差至少15岁。迁出者不占常住人口；单方面新关系不得修改既有档原文。',
 geography:'既有河湾到白石24公里官道及6小时约束保留。新村坐标、地势与道路在各自骨架阶段定稿，未定地点不能被人物作息引用。',
 totals:{full:250,roster:500},
};
