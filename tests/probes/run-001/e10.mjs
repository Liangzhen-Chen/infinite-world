// E10 跨政体婚姻的分产★：有王国与部盟的继承规则，但没有“跨政体婚姻 + 布庄股份”的人物；
// ①③ 用继承规则函数与监护候选的源码核对，其余读取机制。
import {world,src,imp,ok,partial,missing} from '../harness.mjs';

export default [
 {id:'E10-1',event:'E10',no:1,text:'适用法典由财产所在地、婚姻缔结地等规则决定，不由一方说了算',async check(){
  const fi=await imp('server-plugin/family-inheritance.mjs'),body=fi.inheritanceRule.toString();
  const conflict=/propertyLocation|marriagePlace|财产所在|婚姻缔结/.test(body);
  return conflict?ok('按财产所在地与婚姻缔结地选法'):partial('按“死者文化→户籍所在地法典→政体”顺序决定（不由一方选），但不看财产所在地与婚姻缔结地；家族争议不在两套法典之间裁决');}},
 {id:'E10-2',event:'E10',no:2,text:'诉讼期间股份冻结，分红暂存',async check(){
  const fa=src('server-plugin/finance-assets.mjs');
  return /frozen|冻结/.test(fa)?ok('争议期间股份冻结、分红入托管'):missing('股份在死亡当刻按继承人均分（总和不变）；没有冻结，分红继续按月发放');}},
 {id:'E10-3',event:'E10',no:3,text:'幼女的监护人默认是莎尔（母亲）',async check(){
  const fi=src('server-plugin/family-inheritance.mjs');
  return /kind==='parent'&&r\.to===ward/.test(fi)&&/Number\(parents\.includes\(b\)\)-Number\(parents\.includes\(a\)\)/.test(fi)?ok('监护候选父母优先（只有分得遗产的未成年人才建监护记录）'):partial('监护候选未以父母优先');}},
 {id:'E10-4',event:'E10',no:4,text:'败诉一方可以上诉，二审期间不执行原判',async check(){
  const law=src('server-plugin/law.mjs'),fl=src('server-plugin/family-law.mjs');
  const stay=/stayed|暂停执行|suspendExecution/.test(law+fl);
  return stay?ok('上诉期间暂停执行'):/appeal/.test(law)?partial('家族民事案可以上诉，但一审当场恢复产权，上诉不暂停执行'):missing('无上诉');}},
 {id:'E10-5',event:'E10',no:5,text:'判决结果影响部盟对王国的立场',async check(){
  const fl=src('server-plugin/family-law.mjs');
  return /adjustStanding|relations\(/.test(fl)?ok('家族判决产生势力立场后果'):missing('家族判决没有势力层面的立场后果；联姻立场只在成婚时调整一次');}},
];
