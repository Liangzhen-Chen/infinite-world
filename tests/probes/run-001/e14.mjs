// E14 玩家建国，同伴叛变★：建国前提是已持男爵以上爵位与领地，不能占据废城直接建国；也没有给同伴封伯爵的操作。
// 检查读取建国承认、法典生效范围、爵位操作枚举与下辖主官叛变的处理。
import {src,imp,ok,partial,wrong,missing} from '../harness.mjs';
import {toolDefinitions} from '../../../extension/tools.mjs';

const nf=()=>src('server-plugin/nation-founding.mjs');
const settlementOps=()=>toolDefinitions().find(t=>t.function.name==='world_settlement').function.parameters.properties.operation.enum;
export default [
 {id:'E14-1',event:'E14',no:1,text:'建国后是否获得承认取决于周边政体立场，不自动获得',async check(){
  const m=await imp('server-plugin/nation-founding.mjs'),body=m.recognitions?.toString()??'';
  return /standing\(/.test(body)&&/activeWar/.test(body)?ok('承认需外部势力的 diplomacy 记录、立场达门槛且不在交战'):missing('无承认机制');}},
 {id:'E14-2',event:'E14',no:2,text:'新法典只在本国疆域内生效',async check(){
  const lc=src('server-plugin/law-codes.mjs');
  return /nationlaw:/.test(lc)&&/locations/.test(lc)?ok('修订只并入位于本国领地内的法典地点'):partial('法典生效范围未按疆域');}},
 {id:'E14-3',event:'E14',no:3,text:'叛变者的伯爵权限由玩家决定剥夺；剥夺之前保留实际控制',async check(){
  const ops=settlementOps(),strip=ops.some(o=>/title_(grant|strip|revoke)|domain_strip/.test(o));
  const auto=/standing\(e,s,o\.holder,n\.ruler\)<=r\.npc\.hostility/.test(nf())&&/split/.test(nf());
  if(auto)return wrong(`下辖主官立场低于敌对线时复核自动带辖区分裂，无玩家裁决；授爵/除爵操作=${strip}`);
  return strip?ok('除爵经玩家裁决'):missing('无授爵/除爵操作');}},
 {id:'E14-4',event:'E14',no:4,text:'封地归属以实际控制和战争或外交结果为准',async check(){
  return /territory:/.test(src('server-plugin/war-diplomacy.mjs'))&&/territory:/.test(nf())?partial('territory 记录由战争结果和分裂改写，但分裂是全自动的'):missing('封地归属不随控制改变');}},
 {id:'E14-5',event:'E14',no:5,text:'叛变者的部下按各自对两边的好感决定跟谁走',async check(){
  return /followers|部下|retinue/.test(nf())?partial('分裂带人员'):missing('分裂只转移辖区，没有按个人立场分流的人员归属');}},
];
