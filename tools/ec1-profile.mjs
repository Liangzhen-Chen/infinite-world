// EC-1 性能剖析（只读：不改引擎、不写存档、不写文件；输出到 stdout；云上用 run-script 运行，本机不要运行）。
// 场景：同 tests/npc-life-health.test.mjs 最后一个用例（正式参数下全世界离屏推进）——只用 world 与引擎 API 构造，不 import tests：
//   new WorldEngine(loadWorld())，createCharacter(种子)，各聚落 starvation=-100，然后一次 world_time 推进 <天数> 天。
// 采样：node:inspector 的 Profiler 程序化采样（采样间隔 1 毫秒，不靠命令行 flag），只覆盖这一次推进。
// 用法：node tools/ec1-profile.mjs <天数，整数 1 到 90，默认 30> [函数名,函数名…]
// 输出（JSON Lines）：start / run（推进墙钟毫秒、采样总毫秒）/ self（按函数自身耗时前 60）/ total（按累计耗时前 60，含被调用者，同一栈里同一函数只计一次）/
//   callee（给了函数名时，每个函数的直接被调用者累计耗时前 60，字段 of、targetMs）/ done。
// 每行字段：rank、fn（函数名）、at（文件:行）、ms、pct（占采样总时间的百分比）。函数按 函数名+文件+行 归并。
import inspector from 'node:inspector';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadWorld} from './load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';

const out=o=>console.log(JSON.stringify(o));
const days=Number(process.argv[2]??30);
if(!Number.isInteger(days)||days<1||days>90){out({type:'error',message:'天数必须是 1 到 90 的整数'});process.exit(1);}
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const DAY=1440,TOP=60;
// 第二个参数（可选）：逗号分隔的函数名，输出这些函数的直接被调用者累计耗时（调用树一层），如 settleCustomerFlow,advanceShops。
const targets=(process.argv[3]??'').split(',').filter(Boolean);
if(targets.some(name=>!/^[A-Za-z0-9_$]+$/.test(name))){out({type:'error',message:'函数名只能含字母数字下划线'});process.exit(1);}

const world=await loadWorld(),seed=JSON.parse(await fs.readFile(path.join(root,'tests/fixtures/legacy/seed.json'),'utf8'));
const engine=new WorldEngine(world),doc=engine.createCharacter(seed,{name:'试'},'ec1-profile');
for(const row of Object.values(doc.state.settlements))row.starvation=-100;
out({type:'start',days,npcs:Object.keys(doc.state.npcs).length,minute:doc.state.minute});

const session=new inspector.Session();session.connect();
const post=(method,params)=>new Promise((resolve,reject)=>session.post(method,params,(error,result)=>error?reject(error):resolve(result)));
await post('Profiler.enable');await post('Profiler.setSamplingInterval',{interval:1000});await post('Profiler.start');
const began=performance.now();
let after=null,failure=null;
try{const result=await engine.reduce(doc,{tool:'world_time',args:{minutes:days*DAY},eventId:`profile-${days}`});after=applyPatches(doc,result.patches);}
catch(error){failure=String(error?.stack??error);}
const wall=performance.now()-began;
const {profile}=await post('Profiler.stop');session.disconnect();

const label=node=>{const f=node.callFrame,url=String(f.url??'').replace(/^file:\/\//,''),rel=url.startsWith('/')&&url.startsWith(root)?path.relative(root,url):url;return {key:`${f.functionName||'(anonymous)'}|${rel}:${f.lineNumber+1}`,fn:f.functionName||'(anonymous)',at:`${rel||'(native)'}:${f.lineNumber+1}`};};
const nodes=new Map(profile.nodes.map(n=>[n.id,n])),parent=new Map();
for(const n of profile.nodes)for(const c of n.children??[])parent.set(c,n.id);
const self=new Map(),total=new Map(),callees=new Map(targets.map(name=>[name,new Map()])),calleeSum=new Map(targets.map(name=>[name,0]));let sum=0;
profile.samples.forEach((id,i)=>{
 const dt=(profile.timeDeltas[i]??0)/1000;sum+=dt;
 const seen=new Set(),stack=[];// stack：叶 → 根
 for(let at=id,first=true;at!==undefined;at=parent.get(at)){
  const l=label(nodes.get(at)),{key,fn,at:where}=l;stack.push(l);
  if(first){const r=self.get(key)??{fn,at:where,ms:0};r.ms+=dt;self.set(key,r);first=false;}
  if(!seen.has(key)){seen.add(key);const r=total.get(key)??{fn,at:where,ms:0};r.ms+=dt;total.set(key,r);}
 }
 // 调用树：目标函数在这条栈上最靠近根的那一次，取它在栈上的直接被调用者（朝叶的下一帧）；目标本身就是叶则记为 (self)。
 for(const name of targets){
  let idx=-1;for(let k=stack.length-1;k>=0;k--)if(stack[k].fn===name){idx=k;break;}
  if(idx<0)continue;
  const child=idx>0?stack[idx-1]:{key:`(self)|${name}`,fn:'(self)',at:name},map=callees.get(name),r=map.get(child.key)??{fn:child.fn,at:child.at,ms:0};
  r.ms+=dt;map.set(child.key,r);calleeSum.set(name,calleeSum.get(name)+dt);
 }
});
out({type:'run',wallMs:Math.round(wall),sampledMs:Math.round(sum),failure,minuteAfter:after?after.state.minute:null});
const emit=(type,map,total_=sum,extra={})=>[...map.values()].sort((a,b)=>b.ms-a.ms).slice(0,TOP).forEach((r,i)=>out({type,...extra,rank:i+1,fn:r.fn,at:r.at,ms:Math.round(r.ms),pct:Number((100*r.ms/Math.max(1,total_)).toFixed(1))}));
emit('self',self);emit('total',total);
// callee 行的 pct 是占该目标函数累计耗时的百分比；of 是目标函数名，targetMs 是目标函数累计毫秒。
for(const name of targets)emit('callee',callees.get(name),calleeSum.get(name),{of:name,targetMs:Math.round(calleeSum.get(name))});
out({type:'done'});
