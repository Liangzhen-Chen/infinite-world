import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {digest} from './storage.mjs';

// The single source of the "rule-state hash" exclusion scope
// (world/rules/tables/digest-exclude.json, AI-05 §4.2). storage.mjs digest()
// still hashes the whole document for integrity; this module only removes the
// listed string values first, so a hash of the result moves when rule state
// moves and stays put when only narration or display names change.
export const DIGEST_EXCLUDE_FILE=path.join(path.dirname(fileURLToPath(import.meta.url)),'..','world','rules','tables','digest-exclude.json');

export function validateDigestExclude(table){
 const fail=m=>{throw Error(`E-DIGEST-EXCLUDE ${m}`);};
 if(!table||table.version!==1||!table.layers||typeof table.layers!=='object'||!Array.isArray(table.rules))fail('表格式无效（需要 version:1、layers、rules）');
 const seen=new Set();
 for(const [i,rule] of table.rules.entries()){
  if(!Object.hasOwn(table.layers,rule?.layer))fail(`第 ${i} 条 layer 未在 layers 中声明`);
  if(!Array.isArray(rule.prefix)||!rule.prefix.length||rule.prefix.some(s=>typeof s!=='string'||!s))fail(`第 ${i} 条 prefix 须为非空字符串数组`);
  if(!Array.isArray(rule.keys)||!rule.keys.length||rule.keys.some(k=>typeof k!=='string'||!k))fail(`第 ${i} 条 keys 须为非空字符串数组`);
  if(typeof rule.source!=='string'||!rule.source.trim())fail(`第 ${i} 条缺少数据出处 source`);
  const id=JSON.stringify([rule.layer,rule.prefix]);
  if(seen.has(id))fail(`第 ${i} 条与前面的条目路径与层重复，请合并 keys`);
  seen.add(id);
 }
 return table;
}
export function loadDigestExclude(file=DIGEST_EXCLUDE_FILE){return validateDigestExclude(JSON.parse(fs.readFileSync(file,'utf8')));}

const under=(path,prefix)=>path.length===prefix.length&&prefix.every((s,i)=>s==='*'||s===path[i]);

// A copy of the document without the excluded string values. layers: which
// layers apply (default all). A key is dropped only when its object sits exactly at
// a rule's prefix AND its value is a string.
export function excludeFromDigest(document,{table=loadDigestExclude(),layers=Object.keys(table.layers)}={}){
 const rules=table.rules.filter(r=>layers.includes(r.layer));
 const walk=(value,path)=>{
  if(Array.isArray(value))return value.map((item,i)=>walk(item,[...path,String(i)]));
  if(!value||typeof value!=='object')return value;
  const dropped=new Set(rules.filter(r=>under(path,r.prefix)).flatMap(r=>r.keys)),out={};
  for(const [key,child] of Object.entries(value)){
   if(dropped.has(key)&&typeof child==='string')continue;
   out[key]=walk(child,[...path,key]);
  }
  return out;
 };
 return walk(document,[]);
}

export const ruleStateDigest=(document,options)=>digest(excludeFromDigest(document,options));
