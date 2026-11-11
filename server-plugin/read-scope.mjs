// Read-only planning scope. Inside withReadScope nothing writes state or ledger (candidate generators receive a
// view and a projected document, never a draft), so derived household/market reads that go through a reader's
// memo (budgetRead in household-budget.mjs, shop.mjs reach list) are shared by state object, ledger object and
// the campaign random seed and their own key. The scope is dropped when the outermost call returns; outside it a reader has no memo.
// 约定：作用域内不得原地改写 state/ledger；memo 以状态、账本、种子的对象身份分键，原地改写不会使其失效。投影文档都应新建 state 对象。
// 没有加运行时检查：普通对象没有 revision，进入时记身份、退出时核对只能发现“换了对象”，发现不了原地改写；全量哈希代价过高。
// 唯一可行的是 FIELDS_INDEX_CHECK 式的命中重建复核（同 stateMemo），其代价在本机 1 天探针里超过 25 分钟仍未跑完，未采用；
// 等价测试（tests/household-cache-equivalence.test.mjs）在作用域内换 state 对象后重读，覆盖“换对象”这一类。
import {withReadIndex} from './storage.mjs';
let scope=null;
const value=Symbol('read scope value');
export function withReadScope(task){
 if(scope)return task();
 scope=new Map();
 // Same read-only promise, so the record index and stateMemo apply too (stateReader memos are no-ops outside one).
 try{return withReadIndex(task);}finally{scope=null;}
}
export function documentReader(document){
 const read={document,get:(...p)=>p.reduce((v,k)=>v?.[k],document)},active=scope;
 if(!active)return read;
 return {...read,memo:(key,inputs,build)=>{
  let at=active;
  for(const part of [document?.state,document?.ledger,document?.randomSeed,key,...inputs]){let next=at.get(part);if(!next)at.set(part,next=new Map());at=next;}
  if(!at.has(value))at.set(value,build());
  return at.get(value);
 }};
}
