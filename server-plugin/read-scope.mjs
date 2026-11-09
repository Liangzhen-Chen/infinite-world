// Read-only planning scope. Inside withReadScope nothing writes state or ledger (candidate generators receive a
// view and a projected document, never a draft), so derived household/market reads that go through a reader's
// memo (budgetRead in household-budget.mjs, shop.mjs reach list) are shared by state object, ledger object and
// their own key. The scope is dropped when the outermost call returns; outside it a reader has no memo.
let scope=null;
const value=Symbol('read scope value');
export function withReadScope(task){
 if(scope)return task();
 scope=new Map();
 try{return task();}finally{scope=null;}
}
export function documentReader(document){
 const read={document,get:(...p)=>p.reduce((v,k)=>v?.[k],document)},active=scope;
 if(!active)return read;
 return {...read,memo:(key,inputs,build)=>{
  let at=active;
  for(const part of [document?.state,document?.ledger,key,...inputs]){let next=at.get(part);if(!next)at.set(part,next=new Map());at=next;}
  if(!at.has(value))at.set(value,build());
  return at.get(value);
 }};
}
