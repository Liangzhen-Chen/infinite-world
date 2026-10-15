// 示例包模块（S0 测试夹具，不被任何代码加载）：故意含一条包间 import 与两处派生字段写入，供 import 图与黑名单扫描的包目录模式自测。
import {lawAction} from '../../../../server-plugin/law.mjs';
import {traitsOf} from '../../../../server-plugin/traits.mjs';
export function brew(d,id){
 d.set(['state','records',`brew:${id}`],{category:'brew',id,brewQuota:3,salary:10});
 return [lawAction,traitsOf];
}
