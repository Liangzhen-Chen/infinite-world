// RX data expressions, 12 §12.8.1 / 14 §14.6. No host object or JS evaluation.
const SCALE=10000n, forbidden=new Set(['__proto__','prototype','constructor']);
const own=(o,k)=>o!=null&&Object.hasOwn(o,k);
export class RXError extends Error { constructor(code,message){super(message);this.code=code;} }
const fail=(code,message)=>{throw new RXError(code,message);};
function fixed(s){
 const m=/^(-?)(\d+)(?:\.(\d+))?$/.exec(String(s));
 if(!m)fail('E-RX-NUMBER',`Invalid fixed number: ${s}`);
 return bounded((m[1]?-1n:1n)*(BigInt(m[2])*SCALE+BigInt((m[3]??'').padEnd(4,'0').slice(0,4))));
}
const LIMIT=BigInt(Number.MAX_SAFE_INTEGER);
function bounded(v){if(v>LIMIT||v< -LIMIT)fail('E-RX-NUMBER','Fixed number overflow');return v;}
function input(v){
 if(typeof v==='number'){if(!Number.isFinite(v))fail('E-RX-NUMBER','Nonfinite view number');return fixed(v);}
 if(v===null||typeof v==='string'||typeof v==='boolean'||v===undefined)return v;
 if(Array.isArray(v))return v.map(input);
 if(typeof v==='object'){const r=Object.create(null);for(const k of Object.keys(v)){if(forbidden.has(k))fail('E-RX-FIELD',k);const desc=Object.getOwnPropertyDescriptor(v,k);if(!own(desc,'value'))fail('E-RX-VIEW','View accessors are forbidden');r[k]=input(desc.value);}return r;}
 fail('E-RX-VIEW','Only JSON view data is permitted');
}
function output(v){if(typeof v==='bigint')return Number(bounded(v))/10000;if(Array.isArray(v))return v.map(output);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,output(x)]));return v;}
const prec={'??':1,'||':2,'&&':3,'==':4,'!=':4,'===':4,'!==':4,'<':5,'<=':5,'>':5,'>=':5,'+':6,'-':6,'*':7,'/':7,'%':7};
function tokenize(source){
 if(typeof source!=='string'||source.length>16000)fail('E-RX-SYNTAX','Expression must be a bounded string');
 const ts=[];let i=0;
 while(i<source.length){if(/\s/.test(source[i])){i++;continue;}
  const rest=source.slice(i),m=/^(?:\d+(?:\.\d+)?|[A-Za-z_$][\w$]*|=>|===|!==|==|!=|<=|>=|&&|\|\||\?\?|[+*/%<>()?:.,!\[\]-])/.exec(rest);
  if(source[i]==="'"||source[i]==='"'){const quote=source[i++];let value='';while(i<source.length&&source[i]!==quote){if(source[i]==='\\'){i++;const c=source[i++];if(!['n','r','t','\\',"'",'"'].includes(c))fail('E-RX-SYNTAX','Invalid string escape');value+=({n:'\n',r:'\r',t:'\t'}[c]??c);}else value+=source[i++];}if(source[i++]!==quote)fail('E-RX-SYNTAX','Unclosed string');ts.push({t:'literal',v:value});continue;}
  if(!m)fail('E-RX-SYNTAX',`Unexpected token at ${i}`);const t=m[0];i+=t.length;ts.push(/^\d/.test(t)?{t:'literal',v:fixed(t)}:{t});
 }
 ts.push({t:'eof'});return ts;
}
function parse(source){
 const ts=tokenize(source);let at=0,depth=0;const peek=()=>ts[at].t,take=t=>{if(peek()!==t)fail('E-RX-SYNTAX',`Expected ${t}, got ${peek()}`);return ts[at++];};
 function expr(min=0){
  if(++depth>100)fail('E-RX-BUDGET','Expression nesting exceeds budget');
  let a,t=ts[at++];
  if(t.t==='literal')a={type:'literal',value:t.v};
  else if(['true','false','null'].includes(t.t))a={type:'literal',value:t.t==='null'?null:t.t==='true'};
  else if(['!','-','+'].includes(t.t))a={type:'unary',op:t.t,arg:expr(8)};
  else if(t.t==='('){a=expr();take(')');}
  else if(/^[A-Za-z_$][\w$]*$/.test(t.t)&&t.t!=='eof'){
   if(forbidden.has(t.t))fail('E-RX-FIELD',t.t);
   a={type:'name',name:t.t};if(peek()==='=>'){at++;a={type:'lambda',name:t.t,body:expr()};}
  }else fail('E-RX-SYNTAX',`Unexpected ${t.t}`);
  for(;;){
   if(peek()==='.'||peek()==='['){const bracket=peek()==='[';at++;let key;
    if(bracket){const k=take('literal');if(!['string','bigint'].includes(typeof k.v)||typeof k.v==='bigint'&&k.v%SCALE!==0n)fail('E-RX-FIELD','Static field required');key=typeof k.v==='bigint'?String(k.v/SCALE):k.v;take(']');}
    else{key=ts[at++].t;if(!/^[A-Za-z_$][\w$]*$/.test(key))fail('E-RX-FIELD','Static field required');}
    if(forbidden.has(key))fail('E-RX-FIELD',key);a={type:'member',object:a,key};continue;
   }
   if(peek()==='('){if(a.type!=='name')fail('E-RX-CALL','Only library calls are permitted');at++;const args=[];if(peek()!==')')do{args.push(expr());if(peek()!==',')break;at++;}while(true);take(')');a={type:'call',name:a.name,args};continue;}
   const op=peek(),p=prec[op];if(p===undefined||p<min)break;at++;a={type:'binary',op,left:a,right:expr(p+1)};
  }
  if(min===0&&peek()==='?'){at++;const yes=expr();take(':');a={type:'conditional',test:a,yes,no:expr()};}
  depth--;return a;
 }
 const ast=expr();take('eof');return ast;
}
const collections=new Set(['filter','map','some','every','sum','count']);
const maths=new Set(['min','max','clamp','round','floor','abs']);
const number=v=>{if(typeof v!=='bigint')fail('E-RX-TYPE','Expected a fixed number');return v;};
const truth=v=>typeof v==='bigint'?v!==0n:Boolean(v);
function pathOf(n){if(n.type==='name')return n.name;if(n.type==='member'){const p=pathOf(n.object);return p?`${p}.${n.key}`:null;}return null;}
function freeze(v){if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;}
// schema maps root names to nested field schemas; function result schemas are
// supplied as functions[name].returns. Unknown domains are an explicit error.
export function compileRX(source,{schema={},functions={},budget=2000,maxCollection=32}={}){
 if(!Number.isSafeInteger(budget)||budget<1||!Number.isSafeInteger(maxCollection)||maxCollection<1)fail('E-RX-BUDGET','Invalid limits');
 const ast=parse(source),fields=new Set(),calls=new Set();
 function visit(n,scope,lambdaAllowed=false){
  if(n.type==='literal')return {cost:1,schema:typeof n.value==='bigint'?'number':typeof n.value};
  if(n.type==='name'){if(!own(scope,n.name))fail('E-RX-NAME',`Unknown name ${n.name}`);return {cost:1,schema:scope[n.name]};}
  if(n.type==='member'){const o=visit(n.object,scope);if(!own(o.schema,n.key))fail('E-RX-FIELD',`Unknown view field ${pathOf(n)??n.key}`);fields.add(pathOf(n)??n.key);return {cost:o.cost+1,schema:o.schema[n.key]};}
  if(n.type==='lambda'){if(!lambdaAllowed)fail('E-RX-LAMBDA','Lambda only permitted as a collection argument');return visit(n.body,{...scope,[n.name]:scope.$element??{}});}
  if(n.type==='call'){
   calls.add(n.name);if(!collections.has(n.name)&&!maths.has(n.name)&&n.name!=='roll'&&!own(functions,n.name))fail('E-RX-FUNCTION',`Missing domain function ${n.name}`);
   if(collections.has(n.name)){
    if(n.args.length<1||n.args.length>2)fail('E-RX-TYPE','Collection takes a list and optional lambda');const a=visit(n.args[0],scope);
    if(!Array.isArray(a.schema))fail('E-RX-TYPE','Bounded collection required');
    if(n.args[1]?.type!=='lambda'&&n.args.length===2)fail('E-RX-LAMBDA','Expected lambda');
    const b=n.args[1]?visit(n.args[1],{...scope,$element:a.schema[0]},true):{cost:1,schema:a.schema[0]};
    if(n.name==='sum'&&b.schema!=='number'||['filter','some','every'].includes(n.name)&&(!n.args[1]||b.schema!=='boolean')||n.name==='count'&&n.args[1]&&b.schema!=='boolean')fail('E-RX-TYPE','Invalid collection lambda result type');
    return {cost:1+a.cost+maxCollection*(b.cost+1),schema:n.name==='filter'?a.schema:n.name==='map'?[b.schema]:['some','every'].includes(n.name)?'boolean':'number'};
   }
   const args=n.args.map(x=>visit(x,scope));
   if(maths.has(n.name)){
    const arity={clamp:3,round:1,floor:1,abs:1}[n.name];if((arity?args.length!==arity:args.length===0)||args.some(x=>x.schema!=='number'))fail('E-RX-TYPE','Math requires numeric arguments with correct arity');
   }
   if(n.name==='roll'&&(args.length!==1||args[0].schema!=='string'))fail('E-RX-TYPE','roll requires one string key');
   const signature=functions[n.name]?.args;if(signature&&(signature.length!==args.length||signature.some((s,i)=>s!==args[i].schema)))fail('E-RX-TYPE',`Wrong arguments to ${n.name}`);
   return {cost:1+args.reduce((s,x)=>s+x.cost,0),schema:functions[n.name]?.returns??'number'};
  }
  const kids=n.type==='binary'?[n.left,n.right]:n.type==='unary'?[n.arg]:[n.test,n.yes,n.no],values=kids.map(x=>visit(x,scope));
  if(n.type==='binary'&&['+','-','*','/','%'].includes(n.op)&&values.some(x=>x.schema!=='number'))fail('E-RX-TYPE','Arithmetic requires numeric operands');
  if(n.type==='unary'&&n.op!=='!'&&values[0].schema!=='number')fail('E-RX-TYPE','Unary arithmetic requires a number');
  if(n.type==='binary'&&['<','<=','>','>='].includes(n.op)&&(values[0].schema!==values[1].schema||!['number','string'].includes(values[0].schema)))fail('E-RX-TYPE','Comparison requires matching scalar types');
  return {cost:1+values.reduce((s,x)=>s+x.cost,0),schema:n.type==='binary'&&['==','!=','===','!==','<','<=','>','>=','&&','||'].includes(n.op)||n.op==='!'?'boolean':values.at(-1).schema};
 }
 const result=visit(ast,schema);if(result.cost>budget)fail('E-RX-BUDGET',`Worst-case steps ${result.cost} exceed ${budget}`);
 return freeze({format:1,source,ast,budget,maxCollection,worstCase:result.cost,fields:[...fields].sort(),functions:[...calls].sort()});
}
export function evaluateRX(compiled,bindings={}, {functions={},rollKey=null,budget=compiled.budget,explain=false}={}){
 let steps=0;const trace=[];
 const tick=()=>{if(++steps>Math.min(budget,compiled.budget))fail('E-RX-BUDGET','Runtime step budget exhausted');};
 function run(n,env){tick();
  if(n.type==='literal')return n.value;
  if(n.type==='name'){if(!own(env,n.name))fail('E-RX-NAME',n.name);return env[n.name];}
  if(n.type==='member'){const v=run(n.object,env);if(!own(v,n.key))fail('E-RX-VIEW',`Missing view field ${n.key}`);return v[n.key];}
  if(n.type==='unary'){const v=run(n.arg,env);return n.op==='!'?!truth(v):n.op==='-'?-number(v):number(v);}
  if(n.type==='conditional')return run(truth(run(n.test,env))?n.yes:n.no,env);
  if(n.type==='binary'){
   const a=run(n.left,env);if(n.op==='&&')return truth(a)?run(n.right,env):a;if(n.op==='||')return truth(a)?a:run(n.right,env);if(n.op==='??')return a??run(n.right,env);
   const b=run(n.right,env);switch(n.op){case '==':case '===':return a===b;case '!=':case '!==':return a!==b;case '<':return a<b;case '<=':return a<=b;case '>':return a>b;case '>=':return a>=b;}
   number(a);number(b);if((n.op==='/'||n.op==='%')&&b===0n)fail('E-RX-NUMBER','Division by zero');
   return bounded(n.op==='+'?a+b:n.op==='-'?a-b:n.op==='*'?a*b/SCALE:n.op==='/'?a*SCALE/b:a%b);
  }
  if(n.type==='call'){
   if(collections.has(n.name)){
    const list=run(n.args[0],env);if(!Array.isArray(list)||list.length>compiled.maxCollection)fail('E-RX-BUDGET','Collection bound exceeded');const l=n.args[1],vals=[];
    for(const item of list){tick();vals.push(l?run(l.body,{...env,[l.name]:item}):item);}
    if(n.name==='filter')return list.filter((_,i)=>truth(vals[i]));if(n.name==='map')return vals;if(n.name==='some')return vals.some(truth);if(n.name==='every')return vals.every(truth);if(n.name==='count')return BigInt(l?vals.filter(truth).length:list.length)*SCALE;return vals.reduce((s,v)=>s+number(v),0n);
   }
   const a=n.args.map(x=>run(x,env));let v;
   if(maths.has(n.name)){
    a.forEach(number);const arity={clamp:3,round:1,floor:1,abs:1}[n.name];if(arity?a.length!==arity:a.length===0)fail('E-RX-TYPE','Wrong math arity');
    if(n.name==='min')v=a.reduce((s,x)=>x<s?x:s);else if(n.name==='max')v=a.reduce((s,x)=>x>s?x:s);else if(n.name==='clamp')v=a[0]<a[1]?a[1]:a[0]>a[2]?a[2]:a[0];else if(n.name==='abs')v=a[0]<0n?-a[0]:a[0];else if(n.name==='floor')v=(a[0]/SCALE-(a[0]<0n&&a[0]%SCALE!==0n?1n:0n))*SCALE;else v=(a[0]+(a[0]<0n?-5000n:5000n))/SCALE*SCALE;
   }else if(n.name==='roll'){
    if(!rollKey||!['seed','pack','rule','object','date'].every(k=>own(rollKey,k))||a.length!==1||typeof a[0]!=='string')fail('E-RX-ROLL','Complete kernel roll key required');
    let hash=2166136261;for(const c of JSON.stringify([...['seed','pack','rule','object','date'].map(k=>rollKey[k]),a[0]]))hash=Math.imul(hash^c.charCodeAt(0),16777619)>>>0;v=BigInt(hash%20+1)*SCALE;
   }else{if(typeof functions[n.name]!=='function')fail('E-RX-FUNCTION',`Missing domain function ${n.name}`);v=input(functions[n.name](...a.map(output)));}
   if(explain)trace.push({function:n.name,value:output(v)});return v;
  }
  fail('E-RX-SYNTAX','Invalid expression node');
 }
 const value=output(run(compiled.ast,input(bindings)));return explain?{value,steps,trace}:value;
}
// Only necessary conjuncts may prefilter. OR / NOT / arbitrary functions
// deliberately yield no guard: the full predicate is always evaluated later.
export function extractGuards(compiled){
 const guards=[];function walk(n){if(n.type==='binary'&&n.op==='&&'){walk(n.left);walk(n.right);return;}if(n.type==='binary'&&['==','==='].includes(n.op)){let path=pathOf(n.left),lit=n.right;if(!path){path=pathOf(n.right);lit=n.left;}if(path&&lit.type==='literal')guards.push({path,value:output(lit.value)});}}walk(compiled.ast);return guards;
}
