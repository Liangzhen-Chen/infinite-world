// E05 冬季托运到远方：远方郡只在玩家本人到达时生成，无法在去之前向星湾下单托运，情境不可完整构造；
// 以下检查读取承运、关税、汇票与远方生成的现有机制（核对者亦按代码判断）。
import {src,ok,partial,wrong,missing} from '../harness.mjs';

const transport=()=>src('server-plugin/transport.mjs');
export default [
 {id:'E05-1',event:'E05',no:1,text:'货物超出船的载量要拒运或分批',async check(){
  return /load\.kg>a\.capacityKg/.test(transport())&&/货舱重量、体积或座/.test(transport())?ok('重量、体积或座位超出即拒运（不分批）'):missing('无载量校验');}},
 {id:'E05-2',event:'E05',no:2,text:'滞留天数按天气结算，护卫工资按天累计',async check(){
  const delay=/kind:'wait'[\s\S]{0,40}道路或天气不通/.test(src('server-plugin/transport-route.mjs'));
  const perDay=/escort[\s\S]{0,200}(perDay|days\s*\*|dailyCopper)/.test(transport());
  return delay&&perDay?ok('滞留按天气，护卫费按天'):delay?partial('天气/季节/灾害封路插入等待段（delayed），护卫费下单时一次算定，不随滞留增加'):missing('无滞留');}},
 {id:'E05-3',event:'E05',no:3,text:'两道关卡分别按各自政体的税率收税',async check(){
  return /tradeTax/.test(transport())&&/polity|adminLevel/.test(src('server-plugin/finance-tax.mjs'))?ok('每段按目的地结算 tradeTax，政体类型与级别参与'):partial('关税未按政体分段');}},
 {id:'E05-4',event:'E05',no:4,text:'受潮那箱降价，或按托运契约索赔',async check(){
  return /受潮|damp|cargoDamage|索赔|claim/.test(transport())?partial('有货损或索赔'):missing('没有货损、受潮或索赔机制');}},
 {id:'E05-5',event:'E05',no:5,text:'玩家首次到达时才生成星湾骨架，此前当地价格未知',async check(){
  const engine=src('server-plugin/engine.mjs');
  return /unfoldRemoteAt/.test(engine)?partial('到达才生成、此前无细节（符合）；但正因无骨架，去之前无法向当地托运，题设情境构造不出来'):missing('无远方生成');}},
 {id:'E05-6',event:'E05',no:6,text:'汇票只能在有兑付网点的地方兑现',async check(){
  const bank=src('server-plugin/finance-bank.mjs');
  return /cash_bill|cashBill/.test(bank)&&/兑付|柜面|branch/.test(bank)?ok('须指定异地真实钱庄柜面，兑付地不符报错'):wrong('汇票不检兑付网点');}},
];
