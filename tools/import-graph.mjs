// S0 import 图（I19 依赖方向）：解析 server-plugin/ 与 extension/ 全部模块的静态与动态 import，
// 按 tools/arch-layers.mjs（第 10 章归组表）标层，统计违例：向上依赖（低层 import 高层）与包间 import。
// 现有违例登记在 tests/metrics/import-graph.baseline.json；测试只拦新增违例。
// 用法：node tools/import-graph.mjs [--dir <包目录>] [--json] [--write-baseline]
//   --dir：只扫描一个包目录（第三方内容包自测）；包内模块记为 L2、包名取目录名，依赖目标按全局表标层。
import fs from 'node:fs';
import path from 'node:path';
import {layerOf,LAYERS} from './arch-layers.mjs';

const ROOT=path.resolve(import.meta.dirname,'..');
const rel=p=>path.relative(ROOT,p).split(path.sep).join('/');
export const BASELINE_FILE='tests/metrics/import-graph.baseline.json';
const walk=dir=>fs.existsSync(dir)?fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?(e.name==='node_modules'?[]:walk(path.join(dir,e.name))):/\.m?js$/.test(e.name)?[path.join(dir,e.name)]:[]):[];

export function importsOf(absFile){
 const text=fs.readFileSync(absFile,'utf8'),dir=path.dirname(absFile),out=new Set();
 const add=spec=>{if(spec.startsWith('.'))out.add(rel(path.resolve(dir,spec)));};
 for(const m of text.matchAll(/(?:^|[;\s])import\s*(?:[\w$*{}\s,]+?\s*from\s*)?['"]([^'"]+)['"]/gm))add(m[1]);
 for(const m of text.matchAll(/\bexport\s*(?:\*|\{[^}]*\})\s*from\s*['"]([^'"]+)['"]/g))add(m[1]);
 for(const m of text.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g))add(m[1]);
 // ui-*.mjs directory loaders import every sibling ui-*.mjs through import(new URL(...)).
 if(/\/\^ui-/.test(text)&&/import\(\s*new URL/.test(text))for(const f of fs.readdirSync(dir))if(/^ui-.*\.mjs$/.test(f)&&path.join(dir,f)!==absFile&&!['ui-routes.mjs','ui-shell.mjs'].includes(f))out.add(rel(path.join(dir,f)));
 return [...out].filter(t=>/\.m?js$/.test(t)).sort();
}

const rank=l=>LAYERS.indexOf(l);
export function violationOf(from,to){
 if(!from||!to)return null;
 if(rank(to.layer)>rank(from.layer))return 'upward';
 if(from.layer==='L2'&&to.layer==='L2'&&from.pack!==to.pack)return 'cross-pack';
 return null;
}

export function buildGraph({dir=null}={}){
 const files=dir?walk(path.resolve(ROOT,dir)):[...walk(path.join(ROOT,'server-plugin')),...walk(path.join(ROOT,'extension')),...walk(path.join(ROOT,'packs'))];// packs/<名>/ 为内容包（12 §12.9）
 const packName=dir?path.basename(path.resolve(ROOT,dir)):null;
 const info=f=>dir&&f.startsWith(rel(path.resolve(ROOT,dir))+'/')?{layer:'L2',pack:packName}:layerOf(f);
 const modules=[],edges=[],violations=[],unassigned=[];
 for(const abs of files){
  const file=rel(abs),from=info(file);
  if(!from){unassigned.push(file);continue;}
  modules.push({file,...from});
  for(const target of importsOf(abs)){
   if(!target.startsWith('server-plugin/')&&!target.startsWith('extension/')&&!target.startsWith('packs/')&&!(dir&&target.startsWith(rel(path.resolve(ROOT,dir))+'/')))continue;// world/ design data, tools
   const to=info(target);if(!to){unassigned.push(target);continue;}
   const edge={from:file,to:target,fromLayer:from.layer,toLayer:to.layer,fromPack:from.pack,toPack:to.pack};
   edges.push(edge);const kind=violationOf(from,to);if(kind)violations.push({...edge,kind,key:`${file} -> ${target}`});
  }
 }
 return {scope:dir?rel(path.resolve(ROOT,dir)):'server-plugin+extension+packs',modules,edges,violations,unassigned:[...new Set(unassigned)].sort()};
}

export function readBaseline(){
 const p=path.join(ROOT,BASELINE_FILE);
 return fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):{violations:[]};
}
export function compareBaseline(graph,baseline=readBaseline()){
 const known=new Set(baseline.violations),now=new Set(graph.violations.map(v=>v.key));
 return {added:graph.violations.filter(v=>!known.has(v.key)),removed:[...known].filter(k=>!now.has(k))};
}

if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
 const args=process.argv.slice(2),dirIndex=args.indexOf('--dir'),dir=dirIndex>=0?args[dirIndex+1]:null;
 const g=buildGraph({dir}),byKind={},byLayer={};
 for(const v of g.violations){byKind[v.kind]=(byKind[v.kind]??0)+1;const k=`${v.fromLayer}->${v.toLayer}`;byLayer[k]=(byLayer[k]??0)+1;}
 const layerCounts=Object.fromEntries(LAYERS.map(l=>[l,g.modules.filter(m=>m.layer===l).length]));
 if(args.includes('--write-baseline')&&!dir){
  fs.mkdirSync(path.join(ROOT,'tests/metrics'),{recursive:true});
  fs.writeFileSync(path.join(ROOT,BASELINE_FILE),JSON.stringify({metric:'import-graph',note:'S0 登记的现有违例（向上依赖与包间 import）。只允许减少；新增违例由 tests/metrics.test.mjs 拦截。',count:g.violations.length,violations:g.violations.map(v=>v.key).sort()},null,1)+'\n');
 }
 const cmp=dir?{added:g.violations,removed:[]}:compareBaseline(g);
 const report={metric:'import-graph',scope:g.scope,modules:g.modules.length,layers:layerCounts,edges:g.edges.length,violations:g.violations.length,byKind,byLayer,unassigned:g.unassigned,newViolations:cmp.added.map(v=>v.key),resolvedSinceBaseline:cmp.removed.length};
 if(args.includes('--json'))console.log(JSON.stringify({...report,list:g.violations.map(v=>({key:v.key,kind:v.kind}))},null,1));
 else{
  console.log(`import-graph: ${g.scope} ${g.modules.length} 模块（${Object.entries(layerCounts).map(([l,n])=>`${l} ${n}`).join('，')}），${g.edges.length} 条边；违例 ${g.violations.length}（${Object.entries(byKind).map(([k,n])=>`${k} ${n}`).join('，')||'无'}）；未归层 ${g.unassigned.length}；${dir?'包内违例':'新增违例'} ${cmp.added.length}${dir?'':`，较基线已消除 ${cmp.removed.length}`}`);
  for(const v of cmp.added.slice(0,40))console.log(`  + ${v.key} [${v.kind} ${v.fromLayer}->${v.toLayer}]`);
  for(const f of g.unassigned)console.log(`  未归层：${f}`);
 }
 if(cmp.added.length||g.unassigned.length)process.exitCode=1;
}
