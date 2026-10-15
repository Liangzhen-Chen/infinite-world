// E18 掌柜卷款，股东连坐：没有 NPC 卷款或挪用经营款的机制（侵吞只在家族监护代管），入股与当铺可构造；
// 检查读取雇佣欠薪、股东责任、当铺流当、引渡、店铺会籍与股份估值。
import {src,ok,partial,wrong,missing,codeHas} from '../harness.mjs';

export default [
 {id:'E18-1',event:'E18',no:1,text:'雇工停工讨薪，股东按章程或法典承担有限或无限责任',async check(){
  const strike=/罢工|strike/.test(src('server-plugin/labor-market.mjs')),liability=codeHas(/limitedLiability|有限责任|无限责任/);
  return strike&&liability?ok('欠薪停工与股东责任'):strike?partial('雇佣有欠薪停工、投诉离职；没有股东有限/无限责任'):missing('无欠薪停工');}},
 {id:'E18-2',event:'E18',no:2,text:'当物逾期绝当归当铺，过期后不能原价赎回',async check(){
  const b=src('server-plugin/finance-bank.mjs'),npcPawn=/npc[\s\S]{0,40}pawn|embezzle|挪用/.test(src('server-plugin/npc-crime.mjs'));
  if(!/流当/.test(b))return wrong('当物逾期仍可赎回');
  return npcPawn?ok('逾期流当，NPC 也能当物'):partial('逾期转“流当”后不能赎回只能拍卖；但只有玩家能当物，掌柜不能拿店里财物去当');}},
 {id:'E18-3',event:'E18',no:3,text:'追诉掌柜受城邦法典和引渡关系约束',async check(){
  const flee=/flee|逃亡/.test(src('server-plugin/npc-crime.mjs'));
  return flee?ok('NPC 卷款逃亡后按引渡追诉'):/extradition/.test(src('server-plugin/law-codes.mjs'))?partial('通缉与协查机制存在、城邦有法典模板；但掌柜不会逃亡，无从触发'):missing('无引渡');}},
 {id:'E18-4',event:'E18',no:4,text:'米行信誉随传闻下降，商会可能开除这家米行的会籍',async check(){
  const o=src('server-plugin/organizations.mjs');
  return /business[\s\S]{0,40}member|商号会籍/.test(o)?partial('店铺可为商会成员'):missing('组织只能除名人物，店铺不是商会成员，也没有店铺信誉账');}},
 {id:'E18-5',event:'E18',no:5,text:'玩家的股份价值重新估算，不能保持原值',async check(){
  const f=src('server-plugin/finance-assets.mjs');
  return /function netAssets/.test(f)?ok('转让价按当前净资产计算，分红按经营利润增量，亏损时为 0'):wrong('股份价值固定');}},
];
