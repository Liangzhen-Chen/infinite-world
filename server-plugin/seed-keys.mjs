import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Seed-key registry (AI-04 §6.1). Every place in server-plugin that turns the
// campaign seed into a draw, a stream or a derived id is listed in
// world/rules/tables/seed-keys.json; E-SEED-KEY compares code and table both
// ways. This is a static code check run by tests/seed-keys.test.mjs, not part
// of world loading. The table never enters the world document, so the world
// hash and every existing roll are unchanged.
//
// Counting rule: a hash call is one site. A template literal that merely wraps a
// recorded site (e.g. `unit_${createHash(..).update(..)...}`) is not counted again.
//
// Known blind spots (not covered, no wildcard added):
//  - a hash object kept in a variable and fed later (const h=createHash(..); h.update(..));
//  - hash algorithms other than sha256, randomBytes, crypto.getRandomValues, Date.now() as entropy;
//  - hand-written PRNGs/hashes whose input does not mention a seed name (seededRandom's xorshift itself);
//  - seed variables not named seed/randomSeed/campaignSeed/template.seed (e.g. rootSeed).
const HERE=path.dirname(fileURLToPath(import.meta.url));
export const SEED_KEYS_FILE=path.join(HERE,'..','world','rules','tables','seed-keys.json');
export const SEED_KEY_ROLES=Object.freeze(['seed','id','fingerprint','entropy']);

// Seed-bearing wrappers whose key is given by the caller.
const WRAPPERS=['hazardRoll','clockDiceKey','clockDraw','unitRoll','hashValue'];
const HASH_HELPERS=['digest','hash','sha256','hashText'];
// A seed name: the bare identifier seed, randomSeed, campaignSeed or template.seed (not seedEvent, stock.seed...).
const SEEDISH=/(?<![\w$.])seed\b|\brandomSeed\b|\bcampaignSeed\b|\btemplate\.seed\b/;
const call=name=>new RegExp(`(?<![.\\w$])${name}\\(`,'g');
const FORMS=[
 {kind:'sha256',re:/createHash\(\s*['"]sha256['"]\s*\)\s*\.update\(/g},
 {kind:'stream',re:call('stream')},
 {kind:'seededRandom',re:call('seededRandom'),skipIf:arg=>arg.includes('createHash')},
 ...WRAPPERS.map(name=>({kind:`wrapper:${name}`,re:call(name)})),
 {kind:'seed-hash',re:new RegExp(`(?<![.\\w$])(?:${HASH_HELPERS.join('|')})\\(`,'g'),keepIf:arg=>SEEDISH.test(arg)&&!arg.includes('createHash')},
 {kind:'inline-hash',re:/Math\.imul\(/g},
 {kind:'math-random',re:/Math\.random\(/g}
];

// A "/" starts a regex literal when the last significant character cannot end an expression.
const REGEX_AFTER=new Set(['','(',',','=',':','[','!','&','|','?','{','}',';','+','-','*','%','<','>','~','^']);
function regexEnd(src,i){
 let inClass=false;
 for(i++;i<src.length;i++){
  const c=src[i];
  if(c==='\\'){i++;continue;}
  if(c==='\n')return i;
  if(c==='[')inClass=true;else if(c===']')inClass=false;
  else if(c==='/'&&!inClass){i++;while(/[a-z]/i.test(src[i]??''))i++;return i;}
 }
 return i;
}

// One pass over a source text: comments become blanks (newlines kept, so
// offsets and line numbers stay), and the outermost template literals are listed.
function lex(src){
 const out=[...src],templates=[];let prev='';
 const blank=(a,b)=>{for(let k=a;k<b;k++)if(out[k]!=='\n')out[k]=' ';};
 function template(i){
  for(i++;i<src.length;i++){
   const c=src[i];
   if(c==='\\'){i++;continue;}
   if(c==='$'&&src[i+1]==='{'){i=code(i+2,true)-1;continue;}
   if(c==='`'){prev='`';return i+1;}
  }
  return i;
 }
 function code(i,inBrace){
  let depth=0;
  while(i<src.length){
   const c=src[i];
   if(c==='/'&&src[i+1]==='/'){const e=src.indexOf('\n',i),end=e<0?src.length:e;blank(i,end);i=end;continue;}
   if(c==='/'&&src[i+1]==='*'){const e=src.indexOf('*/',i+2),end=e<0?src.length:e+2;blank(i,end);i=end;continue;}
   if(c==="'"||c==='"'){let j=i+1;while(j<src.length&&src[j]!==c){if(src[j]==='\\')j++;j++;}i=j+1;prev=c;continue;}
   if(c==='`'){const start=i;i=template(i);if(!inBrace)templates.push([start,i]);continue;}
   if(c==='/'&&REGEX_AFTER.has(prev)){i=regexEnd(src,i);prev='a';continue;}
   if(c==='{')depth++;
   if(c==='}'){if(inBrace&&depth===0)return i+1;depth--;}
   if(!/\s/.test(c))prev=c;
   i++;
  }
  return i;
 }
 code(0,false);
 return {masked:out.join(''),templates};
}

// Text-level helpers on comment-free source.
function skipQuoted(src,i){
 const q=src[i];
 for(i++;i<src.length;i++){
  const c=src[i];
  if(c==='\\'){i++;continue;}
  if(q==='`'&&c==='$'&&src[i+1]==='{'){i=skipGroup(src,i+1)-1;continue;}
  if(c===q)return i+1;
 }
 throw Error('E-SEED-KEY 源码引号未闭合');
}
// src[i] is an opening bracket; returns the index just after its partner.
function skipGroup(src,i){
 let depth=0,prev='';
 for(;i<src.length;i++){
  const c=src[i];
  if(c==="'"||c==='"'||c==='`'){i=skipQuoted(src,i)-1;prev=c;continue;}
  if(c==='/'&&REGEX_AFTER.has(prev)){i=regexEnd(src,i)-1;prev='a';continue;}
  if(c==='('||c==='['||c==='{')depth++;
  else if(c===')'||c===']'||c==='}'){depth--;if(depth===0)return i+1;}
  if(!/\s/.test(c))prev=c;
 }
 throw Error('E-SEED-KEY 源码括号未闭合');
}
const squash=text=>text.replace(/\s+/g,'');
const lineOf=(src,index)=>src.slice(0,index).split('\n').length;
// A definition is `function name(` or a method `name(...) {`.
function isDefinition(src,start,end){
 if(/function\s*\*?\s*$/.test(src.slice(Math.max(0,start-12),start)))return true;
 return /^\s*\{/.test(src.slice(end,end+8));
}

// Pure: the seed-related sites of one source text, as {kind,expr,line}.
export function scanSource(source){
 const {masked:src,templates}=lex(source),sites=[],covered=[];
 const take=(kind,start,end,expr)=>{sites.push({kind,expr:squash(expr),line:lineOf(src,start)});covered.push([start,end]);};
 for(const form of FORMS){
  form.re.lastIndex=0;
  for(let m;(m=form.re.exec(src));){
   const open=m.index+m[0].length-1,end=skipGroup(src,open),arg=src.slice(open+1,end-1);
   if(form.kind.startsWith('wrapper:')||form.kind==='stream'||form.kind==='seededRandom'||form.kind==='seed-hash'){if(isDefinition(src,m.index,end))continue;}
   if(form.skipIf?.(arg)||form.keepIf&&!form.keepIf(arg))continue;
   take(form.kind,m.index,end,form.kind==='inline-hash'||form.kind==='math-random'?'':arg);
  }
 }
 const inside=index=>covered.some(([a,b])=>index>=a&&index<b);
 // seed property or variable holding a template literal (the seed handed to the stream).
 for(const m of src.matchAll(/(?<![\w.$])seed\s*[:=]\s*`/g)){
  const open=m.index+m[0].length-1;if(inside(open))continue;
  const end=skipQuoted(src,open);take('seed-template',open,end,src.slice(open,end));
 }
 // Any other template literal that interpolates a seed name.
 for(const [start,end] of templates){
  const text=src.slice(start,end);
  if(![...text.matchAll(/\$\{[^}]*\}/g)].some(x=>SEEDISH.test(x[0]))||inside(start)||covered.some(([a,b])=>a>=start&&b<=end))continue;
  take('seed-template',start,end,text);
 }
 return sites.sort((a,b)=>a.line-b.line);
}

export function scanSeedSites(dir=HERE){
 const rows=[],walk=current=>{
  for(const entry of fs.readdirSync(current,{withFileTypes:true})){
   const full=path.join(current,entry.name);
   if(entry.isDirectory()){if(entry.name!=='node_modules')walk(full);}
   else if(/\.(mjs|js)$/.test(entry.name)){
    const file=path.relative(dir,full).split(path.sep).join('/');
    for(const site of scanSource(fs.readFileSync(full,'utf8')))rows.push({file,...site});
   }
  }
 };
 walk(dir);return rows;
}

export function loadSeedKeys(file=SEED_KEYS_FILE){return JSON.parse(fs.readFileSync(file,'utf8'));}

const keyOf=row=>JSON.stringify([row.file,row.kind,row.expr]);
// Pure: E-SEED-KEY messages for a table against scanned sites (empty = consistent).
export function checkSeedKeys(table,sites){
 const errors=[],fail=m=>errors.push(`E-SEED-KEY ${m}`);
 if(!table||table.version!==1||!Array.isArray(table.entries)){fail('登记表格式无效（需要 version:1 与 entries 数组）');return errors;}
 const registered=new Map(),found=new Map();
 for(const row of table.entries){
  if(typeof row.file!=='string'||typeof row.kind!=='string'||typeof row.expr!=='string'||!Number.isSafeInteger(row.count)||row.count<1||typeof row.prefix!=='string'||!SEED_KEY_ROLES.includes(row.role)||typeof row.purpose!=='string'||!row.purpose.trim()){fail(`登记项字段不全或无效：${JSON.stringify(row).slice(0,160)}`);continue;}
  if(registered.has(keyOf(row)))fail(`登记项重复：${row.file} ${row.kind} ${row.expr}`);
  registered.set(keyOf(row),row);
 }
 for(const site of sites){
  if(site.kind==='math-random'&&!site.file.startsWith('legacy/'))fail(`Math.random 只允许在 legacy/：${site.file}:${site.line}`);
  const entry=found.get(keyOf(site))??{...site,count:0};entry.count++;found.set(keyOf(site),entry);
 }
 for(const [key,site] of found){
  const row=registered.get(key);
  if(!row)fail(`代码里有而表里没有：${site.file}:${site.line} ${site.kind} ${site.expr}`);
  else if(row.count!==site.count)fail(`出现次数不符（表 ${row.count}，代码 ${site.count}）：${site.file} ${site.kind} ${site.expr}`);
 }
 for(const [key,row] of registered)if(!found.has(key))fail(`表里有而代码里没有：${row.file} ${row.kind} ${row.expr}`);
 return errors;
}

// Throws every E-SEED-KEY message at once; used by tests/seed-keys.test.mjs.
export function validateSeedKeys({table,sites}={}){
 const errors=checkSeedKeys(table??loadSeedKeys(),sites??scanSeedSites());
 if(errors.length)throw Error(errors.slice(0,20).join('\n')+(errors.length>20?`\n…另有 ${errors.length-20} 条`:''));
}
