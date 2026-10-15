// E20 伐木建房，触怒林地议会：没有伐木或林木存量（RW-04 未合入），“灵芝”只在已登记据点资源里，情境不可构造；
// 检查读取林木、精怪立场传导、林盟法典罪名、工程木料与立场回升的实现。
import {src,world,ok,partial,wrong,missing,codeHas} from '../harness.mjs';

const forestLaw=()=>Object.values(world.rules.law.templates).find(t=>t.id==='law_forest'||/forest|林/.test(`${t.id}${t.name??''}`));
export default [
 {id:'E20-1',event:'E20',no:1,text:'砍伐扣减林木存量，古树再生周期以年计',async check(){
  return codeHas(/logging|timberStock|林木存量/)?partial('出现伐木机制，需补实测'):missing('没有伐木或林木存量（RW-04 在做）');}},
 {id:'E20-2',event:'E20',no:2,text:'精怪好感下降，并沿关系传到林地议会',async check(){
  const s=src('server-plugin/standing.mjs');
  return /spiritSociety/.test(s)?partial('精怪社群按 spiritSociety 0.5 传递立场；但没有伐木事件来触发'):missing('精怪立场不传到所属势力');}},
 {id:'E20-3',event:'E20',no:3,text:'议会按自己的法典认定玩家违法，向人类王国递交照会',async check(){
  const law=forestLaw();
  const logging=law&&Object.keys(law.penalties??{}).some(k=>/logging|伐/.test(k));
  return logging?partial('林盟法典有滥伐罪，照会未核'):missing(`林盟法典 ${law?.id??'(未找到)'} 罪名无滥伐，也没有照会机制`);}},
 {id:'E20-4',event:'E20',no:4,text:'缺少木材时扩建停工，木价上涨',async check(){
  const p=src('server-plugin/public-projects.mjs');
  return /wood/.test(p)&&codeHas(/timberStock|林木存量/)?ok('木料不足停工，木价随林木存量'):/wood/.test(p)?partial('工程与建房要玩家自备真实木料，不够就拒绝开工；没有林木供给，木价不随存量上涨'):missing('工程不耗木料');}},
 {id:'E20-5',event:'E20',no:5,text:'补植或赔偿后好感缓慢回升，不会瞬间清零',async check(){
  return codeHas(/replant|补植|standingRecovery/)?partial('有补植/赔偿入口'):missing('没有补植或赔偿入口，也没有立场缓慢回升机制');}},
];
