// S0 派生黑名单扫描（I10）：按 world/ontology/derived-fields.json（及包的 derived-fields 词汇）扫描
//  1) 存档写入点：server-plugin/ 中 .set([...'state'...],值) 调用，路径末段或值对象的键命中黑名单字段；
//  2) 作者数据：world/ 下（不含 drafts、ontology）JSON 的对象键命中 scope=all 的字段。
// 字段名带 Override 后缀视为标注过的覆盖项，不计。现有命中登记在 tests/metrics/derived-scan.baseline.json，
// 按“文件|字段”计数，只拦新增（某文件某字段的命中数超过基线即失败）。
// 用法：node tools/derived-scan.mjs [--dir <包目录>] [--json] [--write-baseline]
import fs from 'node:fs';
import path from 'node:path';
import {loadOntology} from './ontology.mjs';

const ROOT=path.resolve(import.meta.dirname,'..');
const rel=p=>path.relative(ROOT,p).split(path.sep).join('/');
export const BASELINE_FILE='tests/metrics/derived-scan.baseline.json';
const walk=(dir,re,skip=[])=>fs.existsSync(dir)?fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const p=path.join(dir,e.name);
 if(e.isDirectory())return skip.includes(rel(p))||e.name==='node_modules'?[]:walk(p,re,skip);return re.test(e.name)?[p]:[];}):[];

export function blacklist(packs=[]){
 const o=loadOntology({packs});
 return [...o.entries['derived-fields'].values()].map(e=>({field:e.id,scope:e.scope,source:e.source,derive:e.derive}));
}

// Balanced slice of a call's argument text starting right after `(`.
function callArgs(text,start){
 let depth=1,i=start,quote=null;
 for(;i<text.length&&depth;i++){const c=text[i];
  if(quote){if(c==='\\')i++;else if(c===quote)quote=null;continue;}
  if(c==='\''||c==='"'||c==='`')quote=c;else if(c==='('||c==='['||c==='{')depth++;else if(c===')'||c===']'||c==='}')depth--;}
 return text.slice(start,i-1);
}
function splitFirstArg(args){
 let depth=0,quote=null;
 for(let i=0;i<args.length;i++){const c=args[i];
  if(quote){if(c==='\\')i++;else if(c===quote)quote=null;continue;}
  if(c==='\''||c==='"'||c==='`')quote=c;else if('([{'.includes(c))depth++;else if(')]}'.includes(c))depth--;else if(c===','&&!depth)return [args.slice(0,i),args.slice(i+1)];}
 return [args,''];
}

export function scanWritePoints(files,fields){
 const hits=[],names=new Set(fields.map(f=>f.field));
 for(const abs of files){
  const text=fs.readFileSync(abs,'utf8'),file=rel(abs);
  // S2a：旧写入点经 holdingSet(d, engine, path, value, writer) 包装后照样计入（路径是第三个参数）。
  const calls=[...[...text.matchAll(/\.set\(\s*\[/g)].map(m=>({m,args:callArgs(text,m.index+5)})),
   ...[...text.matchAll(/(?<![\w$.])holdingSet\(/g)].map(m=>{const [,rest]=splitFirstArg(callArgs(text,m.index+'holdingSet('.length));const [,tail]=splitFirstArg(rest);return {m,args:tail.trimStart()};}).filter(c=>c.args.startsWith('['))];
  for(const {m,args} of calls){
   const [pathArg,value]=splitFirstArg(args);
   if(!/['"]state['"]/.test(pathArg))continue;
   const line=text.slice(0,m.index).split('\n').length;
   const segs=[...pathArg.matchAll(/'([A-Za-z_]\w*)'/g)].map(x=>x[1]),last=segs.at(-1);
   const found=new Set();
   if(last&&names.has(last)&&pathArg.trim().endsWith(`'${last}']`))found.add(last);
   for(const k of value.matchAll(/(?:[{,]\s*)([A-Za-z_]\w*)\s*:/g))if(names.has(k[1]))found.add(k[1]);
   for(const field of found)hits.push({kind:'write',file,line,field});
  }
  // Record literals built before the write ({category:'x',...} assigned to a variable, then d.set(path,row)).
  const seen=new Set(hits.filter(h=>h.file===file).map(h=>`${h.line}|${h.field}`));
  for(const m of text.matchAll(/[{,]\s*category\s*:\s*['`]/g)){
   let depth=0,open=-1;
   for(let i=m.index;i>=0;i--){const c=text[i];if(c==='}')depth++;else if(c==='{'){if(!depth){open=i;break;}depth--;}}
   if(open<0)continue;
   const body=callArgs(text,open+1),line=text.slice(0,open).split('\n').length;
   let d=0,quote=null,top='';
   for(let i=0;i<body.length;i++){const c=body[i];
    if(quote){if(c==='\\')i++;else if(c===quote)quote=null;continue;}
    if(c==='\''||c==='"'||c==='`'){quote=c;continue;}
    if('([{'.includes(c))d++;else if(')]}'.includes(c))d--;else if(!d)top+=c;}
   for(const k of(','+top).matchAll(/,\s*([A-Za-z_]\w*)\s*:/g))if(names.has(k[1])&&!seen.has(`${line}|${k[1]}`)){seen.add(`${line}|${k[1]}`);hits.push({kind:'write',file,line,field:k[1]});}
  }
 }
 return hits;
}

export function scanAuthored(files,fields){
 const hits=[],names=new Set(fields.filter(f=>f.scope==='all').map(f=>f.field));
 for(const abs of files){
  let json;try{json=JSON.parse(fs.readFileSync(abs,'utf8'));}catch{continue;}
  const counts=new Map(),seen=node=>{if(Array.isArray(node))node.forEach(seen);else if(node&&typeof node==='object')for(const [k,v]of Object.entries(node)){if(names.has(k))counts.set(k,(counts.get(k)??0)+1);seen(v);}};
  seen(json);
  for(const [field,n]of counts)for(let i=0;i<n;i++)hits.push({kind:'authored',file:rel(abs),field});
 }
 return hits;
}

export function scan({dir=null,packs=[]}={}){
 const fields=blacklist(dir?[dir,...packs]:packs);
 const base=dir?path.resolve(ROOT,dir):null;
 const codeFiles=dir?walk(base,/\.m?js$/):walk(path.join(ROOT,'server-plugin'),/\.m?js$/,['server-plugin/legacy','server-plugin/compat']);
 const dataFiles=dir?walk(base,/\.json$/).filter(f=>!/[\\/]vocabulary[\\/]/.test(f)):walk(path.join(ROOT,'world'),/\.json$/,['world/drafts','world/ontology','world/art','world/audio','world/design'])
  .filter(f=>rel(f)!=='world/meta/rules.json');// rules.json 是派生用的数值表（俸禄表、额度表），不是实体数据
 const hits=[...scanWritePoints(codeFiles,fields),...scanAuthored(dataFiles,fields)];
 const tally={};for(const h of hits){const k=`${h.kind}|${h.file}|${h.field}`;tally[k]=(tally[k]??0)+1;}
 return {scope:dir?rel(base):'server-plugin+world',fields,hits,tally,writes:hits.filter(h=>h.kind==='write').length,authored:hits.filter(h=>h.kind==='authored').length};
}

export function readBaseline(){const p=path.join(ROOT,BASELINE_FILE);return fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):{tally:{}};}
export function compareBaseline(result,baseline=readBaseline()){
 const added=[],removed=[];
 for(const [k,n]of Object.entries(result.tally))if(n>(baseline.tally[k]??0))added.push({key:k,now:n,baseline:baseline.tally[k]??0});
 for(const [k,n]of Object.entries(baseline.tally))if((result.tally[k]??0)<n)removed.push({key:k,now:result.tally[k]??0,baseline:n});
 return {added,removed};
}

if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
 const args=process.argv.slice(2),dirIndex=args.indexOf('--dir'),dir=dirIndex>=0?args[dirIndex+1]:null;
 const r=scan({dir});
 if(args.includes('--write-baseline')&&!dir){
  fs.mkdirSync(path.join(ROOT,'tests/metrics'),{recursive:true});
  fs.writeFileSync(path.join(ROOT,BASELINE_FILE),JSON.stringify({metric:'derived-scan',note:'S0 登记的派生黑名单现有命中，键为 kind|文件|字段。只允许减少；新增命中由 tests/metrics.test.mjs 拦截。',hits:r.hits.length,writes:r.writes,authored:r.authored,tally:Object.fromEntries(Object.entries(r.tally).sort())},null,1)+'\n');
 }
 const cmp=dir?{added:Object.entries(r.tally).map(([key,now])=>({key,now,baseline:0})),removed:[]}:compareBaseline(r);
 const byField={};for(const h of r.hits)byField[h.field]=(byField[h.field]??0)+1;
 const report={metric:'derived-scan',scope:r.scope,fields:r.fields.length,hits:r.hits.length,writes:r.writes,authored:r.authored,byField,newHits:cmp.added,reducedSinceBaseline:cmp.removed.length};
 if(args.includes('--json'))console.log(JSON.stringify({...report,list:r.hits},null,1));
 else{
  console.log(`derived-scan: ${r.scope} 黑名单 ${r.fields.length} 字段；命中 ${r.hits.length}（存档写入点 ${r.writes}，作者数据 ${r.authored}）；${dir?'包内命中':'新增'} ${cmp.added.length} 处${dir?'':`，较基线减少 ${cmp.removed.length} 处`}`);
  console.log('  按字段：'+Object.entries(byField).sort((a,b)=>b[1]-a[1]).map(([k,n])=>`${k} ${n}`).join('，'));
  for(const a of cmp.added.slice(0,40))console.log(`  + ${a.key}: ${a.baseline} → ${a.now}`);
 }
 if(cmp.added.length)process.exitCode=1;
}
