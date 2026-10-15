// E09 催熟术冲击粮市：生长类生活魔法 + 村管理田可替代，但 NPC 学会法术后不会施法，邻村产量传导不能构造；
// 以下检查读取规则与机制。
import {world,src,ok,partial,missing,codeHas} from '../harness.mjs';

export default [
 {id:'E09-1',event:'E09',no:1,text:'法术未登记就公开教授按法典处理，登记后才可合法授课',async check(){
  const r=src('server-plugin/spell-research.mjs')+src('server-plugin/magic-economy.mjs')+src('server-plugin/education.mjs');
  return /unlicensed_teaching|无照授法|未登记.*授/.test(r)?ok('未登记授课按法典处理'):missing('“登记”只把研究成果写进目录；法规只管施法收费、执照与次数，不管授课');}},
 {id:'E09-2',event:'E09',no:2,text:'学会人数受资质和识字率限制，书本只在识字的人里传播',async check(){
  const learning=src('server-plugin/learning.mjs'),edu=src('server-plugin/education-state.mjs');
  return /minimumLiteracy/.test(learning)&&/literacy|识字/.test(edu)?ok(`读技能书要求识字熟练度 ≥ ${world.rules.books.minimumLiteracy}；NPC 书本教育同样有识字门槛`):missing('无识字门槛');}},
 {id:'E09-3',event:'E09',no:3,text:'粮食供给上升，粮价下跌，种粮农户收入下降',async check(){
  const me=src('server-plugin/magic-economy.mjs');
  return /npc.*cast|npcCast/.test(me)?ok('NPC 施法传导到产量与价格'):/price|价格/.test(me)?partial('只有玩家施法写入村账并压价（有上限）；NPC 学会后不施法，影响传不到邻村，农户收入未建模'):missing('无价格传导');}},
 {id:'E09-4',event:'E09',no:4,text:'粮商商会对玩家好感下降，并传播给成员',async check(){
  const me=src('server-plugin/magic-economy.mjs');
  return /organization|商会/.test(me)?ok('商会整体立场与成员传导'):/standing|立场|competitor|竞争/.test(me)?partial('有竞争者立场下降、投诉与舆论；商会整体对玩家的立场与传给成员未接'):missing('无竞争反应');}},
 {id:'E09-5',event:'E09',no:5,text:'产量加成有上限，受地力和天气约束，不会无限翻倍',async check(){
  const cap=world.rules.magicGrowth?.maximumBonusPermille??JSON.stringify(world.rules).match(/"maximumBonusPermille":\s*(\d+)/)?.[1];
  return cap&&Number(cap)<=1000&&codeHas(/maximumBonusPermille/)?ok(`每批累计加成上限 ${cap}‰，消耗水分养分、低温停长`):missing('无加成上限');}},
];
