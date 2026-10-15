// E15 涝灾后疫病，寺观求神迹：灾害时钟有 flood 与 epidemic，世界里没有“黄连”；检查读取传播率公式、据点资源、
// RW-06 诊疗、祭仪限制、公库留底与改宗。
import {src,imp,ok,partial,wrong,missing} from '../harness.mjs';

export default [
 {id:'E15-1',event:'E15',no:1,text:'发病率与饮水污染、人口密度挂钩',async check(){
  const f=src('server-plugin/seasonal-hazards.mjs');
  const density=/density|密度|areaKm2/.test(f),pollution=/flood[\s\S]{0,80}water|污染/.test(f);
  if(density&&pollution)return ok('发病率随饮水污染与人口密度');
  return /disease\.householdRate\/houses\.length/.test(f)?partial('户间传播率 = householdRate/户数 × 防疫 × 净水：未接洪水水质，户数越多单户感染率越低，与密度关系不合理'):missing('无疫病传播');}},
 {id:'E15-2',event:'E15',no:2,text:'药材断货药价上涨；上山采药受野生存量限制',async check(){
  const sites=src('server-plugin/sites.mjs');
  return /herbStock|野生药材存量/.test(sites)?ok('一般草药存量有限'):/remaining|resources/.test(sites)?partial('只有已登记据点的资源有限且不刷新；无一般草药存量；涨价只有灾害时钟通用系数'):missing('采药无限');}},
 {id:'E15-3',event:'E15',no:3,text:'义诊消耗玩家自己的药材和时间，不会凭空出药',async check(){
  const m=src('server-plugin/medicine.mjs');
  if(/doctor\s*===?\s*'player'|patientOf\('player'\)|playerDoctor/.test(m))return ok('玩家行医消耗自有药材与时间');
  return /item_herb/.test(m)&&/义诊/.test(m)?partial('RW-06 义诊消耗医馆/寺观真实药材库存，不凭空出药；但玩家不能亲自行医用自己的药与时间'):missing('无义诊');}},
 {id:'E15-4',event:'E15',no:4,text:'寺观祈求神迹有次数和条件限制，不能无限治愈',async check(){
  const f=src('server-plugin/faith.mjs');
  return /faith_cooldown/.test(f)&&/season/.test(f)?ok('祭仪要求季节、修持、集体人数并有冷却；神迹只是限时征兆，不改疾病'):wrong('神迹无限制');}},
 {id:'E15-5',event:'E15',no:5,text:'镇公库拨款修堤、施粥后余额下降；赤字不能继续拨款',async check(){
  const g=src('server-plugin/governance.mjs');
  const npcRelief=/autoRelief|赈灾|npc.*spendPublic/.test(g+src('server-plugin/seasonal-hazards.mjs'));
  if(!/charter reserve|留底/.test(g))return missing('公库无留底');
  return npcRelief?ok('官府按灾情拨款且守留底'):partial('spendPublic 有月度额度与留底下限；但只能由玩家在任官职动用，NPC 官府不会自动赈灾或修堤');}},
 {id:'E15-6',event:'E15',no:6,text:'部分灾民改宗或入教，寺观香火上升',async check(){
  const f=src('server-plugin/faith.mjs');
  const incense=/incense|香火收入|offering/.test(f)&&/members\.length[\s\S]{0,60}(income|香火)/.test(f);
  return incense?ok('信众增加带来香火'):/convertFaith/.test(f)?partial('受救助的 NPC 会转向该寺观；救助花的是寺观的钱，香火收入不随信众增加'):missing('无改宗');}},
];
