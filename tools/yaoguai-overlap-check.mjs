// YG-1 版权重合检查：扫描妖怪志输出，确认没有与资料“介绍”（张云现代白话文字）连续 8 个汉字以上重合的片段。
// 比对口径：两侧都只保留汉字（标点、空白、字母不算间隔），资料去掉“此X载于……”古籍出处句（书名卷次是事实），
// 输出侧按每个 JSON 字符串值 / 每行文本分别取 8 字窗口，命中资料任一条目的 8 字片段即报。
//   node tools/yaoguai-overlap-check.mjs [--src 资料路径] [--n 8] [文件或目录...]
// 默认扫描 world/drafts/yaoguai、docs/妖怪志 与 tools/yaoguai-*.mjs。资料不存在时报错退出（不静默通过）。
import fs from 'node:fs';
import path from 'node:path';
import {srcPath} from './yaoguai-index.mjs';

const ROOT=path.resolve(import.meta.dirname,'..');
const CJK=/[㐀-鿿豈-﫿]/g;
const onlyCjk=s=>(String(s).match(CJK)||[]).join('');
const CITE_SENT=/此(?:二|三|两)?(?:妖|精|鬼|怪)(?:均|皆|亦|也)?(?:载|见|出)于[^。]*/g;

export function sourceGrams(p=srcPath(),n=8){
 const d=JSON.parse(fs.readFileSync(p,'utf8'));const set=new Set();
 for(const x of d){const t=onlyCjk(String(x.介绍||'').replace(CITE_SENT,''));for(let i=0;i+n<=t.length;i++)set.add(t.slice(i,i+n));}
 return set;
}

function* strings(v,where){
 if(typeof v==='string')yield [v,where];
 else if(Array.isArray(v))for(let i=0;i<v.length;i++)yield* strings(v[i],`${where}[${i}]`);
 else if(v&&typeof v==='object')for(const [k,x] of Object.entries(v)){yield [k,`${where}.<key>`];yield* strings(x,`${where}.${k}`);}
}

export function checkFiles(files,grams,n=8){
 const hits=[];let scanned=0;
 for(const f of files){
  const raw=fs.readFileSync(f,'utf8');const r=path.relative(ROOT,f).split(path.sep).join('/');
  const units=f.endsWith('.json')?[...strings(JSON.parse(raw),'$')]:raw.split(/\r?\n/).map((l,i)=>[l,`L${i+1}`]);
  for(const [s,where] of units){
   const t=onlyCjk(s);scanned++;
   for(let i=0;i+n<=t.length;i++){const g=t.slice(i,i+n);if(grams.has(g)){hits.push({file:r,where,gram:g});break;}}
  }
 }
 return {files:files.length,units:scanned,hits};
}

function walk(p){
 if(!fs.existsSync(p))return [];
 if(fs.statSync(p).isFile())return [p];
 return fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>walk(path.join(p,e.name)));
}

if(process.argv[1]?.endsWith('yaoguai-overlap-check.mjs')){
 const args=process.argv.slice(2);const opt=k=>{const i=args.indexOf(k);if(i<0)return;const v=args[i+1];args.splice(i,2);return v;};
 const src=opt('--src')||srcPath(),n=+(opt('--n')||8);
 if(!fs.existsSync(src)){console.error(`资料不存在：${src}（用 --src 或 YAOGUAI_SRC 指定）`);process.exit(2);}
 const targets=args.length?args:[path.join(ROOT,'world/drafts/yaoguai'),path.join(ROOT,'docs/妖怪志'),
  ...fs.readdirSync(path.join(ROOT,'tools')).filter(f=>/^yaoguai-.*\.mjs$/.test(f)).map(f=>path.join(ROOT,'tools',f))];
 const files=targets.flatMap(t=>walk(path.resolve(t))).filter(f=>/\.(json|md|mjs|txt)$/.test(f));
 const grams=sourceGrams(src,n);const r=checkFiles(files,grams,n);
 console.log(JSON.stringify({n,sourceGrams:grams.size,files:r.files,units:r.units,hits:r.hits.length}));
 for(const h of r.hits.slice(0,50))console.log(`${h.file} ${h.where} 「${h.gram}」`);
 process.exit(r.hits.length?1:0);
}
