// YG-1 妖怪志事实索引。资料：张云《中国妖怪故事》整理表（生物列表.json，仓库外只读）。
// 版权边界：资料“介绍”是现代作者的白话文字，只在内存中读取；本脚本写进仓库的只有事实字段
// （名称、类别、朝代、古籍出处）与 world/drafts/yaoguai/tagging/ 中的自拟标签。
//   node tools/yaoguai-index.mjs prep --out <仓库外目录>   清洗合并 → 供标注用的条目（含原文，只写到仓库外）
//   node tools/yaoguai-index.mjs build [--force]            合并清洗事实与自拟标注 → index.json / motifs.json / stats.json
// 核验保护（WM-2a）：index.json 已含“核验”字段时 build 拒绝覆盖，须显式 --force；build 总是先套用 world/drafts/yaoguai/overrides.json
// （排除名单 + 按 id 记录的核正字段与核验结论），使重跑结果与核验后的索引一致。
// 资料路径默认取下列 SRC，可用 --src 或环境变量 YAOGUAI_SRC 覆盖。
import fs from 'node:fs';
import path from 'node:path';

const ROOT=path.resolve(import.meta.dirname,'..');
export const SRC_DEFAULT='D:/学不完学不会想睡觉/游戏/东周/生物列表.json';
const OUT_DIR=path.join(ROOT,'world/drafts/yaoguai');
const arg=(k)=>{const i=process.argv.indexOf(k);return i>0?process.argv[i+1]:undefined;};
export const srcPath=()=>arg('--src')||process.env.YAOGUAI_SRC||SRC_DEFAULT;

const HEADER=/中国妖怪故事/;
const CITE=/此(?:二|三|两)?(?:妖|精|鬼|怪)(?:均|皆|亦|也)?(?:载|见|出)于/;

// 名字栏的非条目行：书眉页码、脚注、编者注。带正文的并入前一条（排版跨页造成的续文）。
function isJunkName(n){
 if(HEADER.test(n))return true;
 if(/编者注|作者所(?:加|取)|^这是两个/.test(n))return true;
 if(/[，。]/.test(n)&&n.length>8)return true;// 脚注句
 return false;
}
const authorNamed=n=>/作者所(?:加|取)/.test(n);

function cleanName(raw){
 let n=raw.replace(/^[\/\d\s]+/,'').replace(/[⑴⑵\[\]]|\s*1+1$|\s*\d+$/g,'').replace(/(?<=[\u4e00-\u9fff])[a-z]$/,'').trim();
 return n;
}

// 出处：取“此X载于……”到句末，按顿号切分为 {朝代, 作者, 书, 卷, 转引}
export function parseCitations(text){
 const out=[];const re=new RegExp(CITE.source+'(.*?)(?=$|。|\\s此(?:二)?(?:妖|精|鬼|怪)(?:载|见))','g');let m;
 const raw=[];
 while((m=re.exec(text)))raw.push(m[1]);
 for(let s of raw){
  s=s.replace(/(?:等)?\s*(?:妖|精|鬼|怪)部\s*$/,'').replace(/[a-zA-Z0-9\s]+$/,'').replace(/等$/,'').trim();
  const unit=/([^《》]*?)《([^》]+)》\s*(?:[（(]引([^）)]*)[）)])?/g;let u;
  while((u=unit.exec(s))){
   const pre=u[1].replace(/[、，,\s]/g,'');
   const em=pre.match(/^(南朝宋|南朝梁|南北朝|南朝|北朝|五代十国|五代|春秋|战国|三国|东汉|西汉|东晋|西晋|北宋|南宋|先秦|当代|金|汉|晋|隋|唐|宋|元|明|清|秦|周)(?:代|时期)?/);
   const era=em?em[1]:'';const author=em?pre.slice(em[0].length):pre;
   const [book,...vol]=u[2].split(/[•·\-－：:]/);
   const cites=u[3]?[...u[3].matchAll(/《([^》]+)》/g)].map(x=>x[1].split(/[•·]/)[0]):[];
   out.push({朝代:era,作者:author,书:book.trim(),卷:vol.join('•').trim(),转引:cites});
  }
 }
 return out;
}

export function loadSource(p=srcPath()){
 const d=JSON.parse(fs.readFileSync(p,'utf8'));
 const entries=[];
 d.forEach((x,i)=>{
  const name=String(x.名字||'').trim();const text=String(x.介绍||'').trim();
  if(isJunkName(name)||!/[\u4e00-\u9fff]/.test(cleanName(name))&&!text){
   const prev=entries.at(-1);
   if(prev){if(text)prev.text+=' '+text;prev.parts.push(i);
    // 编者注挂在带脚注记号（⑴、[1]，OCR 后常成 111、e、口、闵）的条目上，不一定是紧邻的上一条
    if(authorNamed(name)){const quoted=(name.match(/“([^”]+)”/)||[])[1];
     const target=entries.slice(-3).reverse().find(e=>quoted?e.rawName.includes(quoted):/[⑴⑵]|\[\d\]|\s1+$|[a-z口闵]$/.test(e.rawName))||prev;target.authorNamed=true;}}
   return;
  }
  entries.push({src:i,seq:String(x.序号),rawName:name,name:cleanName(name),kind:x.种类,era:x.朝代,text,parts:[i],authorNamed:false});
 });
 for(const e of entries){e.cites=parseCitations(e.text);e.noCite=!CITE.test(e.text);}
 return entries;
}

function prep(){
 const out=arg('--out');if(!out)throw new Error('prep 需要 --out <仓库外目录>');
 const abs=path.resolve(out);if(abs.startsWith(ROOT))throw new Error('含原文的标注输入不得写进仓库');
 fs.mkdirSync(abs,{recursive:true});
 const es=loadSource();
 fs.writeFileSync(path.join(abs,'entries.json'),JSON.stringify(es,null,1));
 const n=+(arg('--batches')||10),size=Math.ceil(es.length/n);
 for(let b=0;b<n;b++){
  const slice=es.slice(b*size,(b+1)*size).map(e=>({key:'s'+e.src,序号:e.seq,原名栏:e.rawName,清洗名:e.name,种类:e.kind,朝代:e.era,作者拟名:e.authorNamed||undefined,text:e.text}));
  fs.writeFileSync(path.join(abs,`batch-${String(b).padStart(2,'0')}.json`),JSON.stringify(slice,null,1));
 }
 const kinds={};for(const e of es)kinds[e.kind]=(kinds[e.kind]||0)+1;
 console.log(JSON.stringify({entries:es.length,kinds,noCite:es.filter(e=>e.noCite).length,authorNamed:es.filter(e=>e.authorNamed).length,batches:n,size}));
}

// ---------- 出处规范化（修 OCR 造成的作者、书名讹字） ----------
const AUTHOR_FIX={谢肇制:'谢肇淛',谢肇洌:'谢肇淛',谢肇涮:'谢肇淛',谢肇湖:'谢肇淛',谢肇潮:'谢肇淛',谢肇測:'谢肇淛',裴剝:'裴铏',裴鍋:'裴铏',
 赵滑:'赵溍',赵潛:'赵溍',俞槌:'俞樾',俞槻:'俞樾',俞機:'俞樾',俞檄:'俞樾',俞欄:'俞樾',张驚:'张鷟',张鷲:'张鷟',张鸞:'张鷟',李亢:'李冗',
 纪旳:'纪昀',杨街之:'杨衒之',宗懷:'宗懔',钮瘠:'钮琇',钮琢:'钮琇',钮臻:'钮琇',苏翳:'苏鹗',郑縈:'郑綮',蔡條:'蔡絛',邙露:'邝露',杨璃:'杨瑀',
 顾峪:'顾岕',陈棊:'陈纂',田艺荷:'田艺蘅',采祷子:'采蘅子',张满:'张澍',许缆曾:'许缵曾',李庆辰的:'李庆辰',的:'李昉等','）宋代李昉等':'李昉等',
 王圻王思义:'王圻、王思义',曾公亮和丁度:'曾公亮、丁度',沈云骏刘玉森:'沈云骏、刘玉森',及:'','（注引':'','（吕湛恩注引':'',末民初况周颐:'况周颐',民国柴小梵:'柴小梵'};
const BOOK_FIX={捜神记:'搜神记',续捜神记:'续搜神记',繩剩续编:'觚剩续编',瓠剩续编:'觚剩续编',瓠剩:'觚剩',艇剩:'觚剩',翼駒稗编:'翼駉稗编',
 乾腰子:'乾𦠆子',乾膜子:'乾𦠆子',独异记:'独异志',甄异录:'甄异传',述异志:'述异记',巳疟编:'已疟编',挪阳府志:'郧阳府志'};
const ERA_FIX={南朝宋:'南北朝',南朝梁:'南北朝',南朝:'南北朝',北朝:'南北朝',五代十国:'五代'};
const AUTHOR_ERA={况周颐:'清末民初',柴小梵:'民国',谈迁:'明',郭璞:'晋'};
// 现代著作（非公有领域）：只记为出处线索，后续撰写不得以其文字为依据
export const MODERN_WORKS=new Set(['中国神怪大辞典','中国鬼文化大辞典','台湾之寺庙与神明']);
const MODERN_EDITION=/校注|校释|笺疏$/;// 现代或清人校注本：底本为公有领域古籍
export function normCite(c){
 const 作者=AUTHOR_FIX[c.作者]??c.作者;let 书=BOOK_FIX[c.书]??c.书;let 卷=c.卷;
 const 朝代=AUTHOR_ERA[作者]||ERA_FIX[c.朝代]||c.朝代||'';
 return {书,作者,朝代,卷,转引:(c.转引||[]).map(b=>BOOK_FIX[b]??b)};
}

// ---------- 构建 ----------
const TAG_DIR=path.join(OUT_DIR,'tagging');
const uniq=a=>[...new Set(a.filter(x=>x!==undefined&&x!==null&&x!==''))];

export function loadTags(){
 const m=new Map();
 if(!fs.existsSync(TAG_DIR))return m;
 for(const f of fs.readdirSync(TAG_DIR).filter(f=>/^tag-\d+\.json$/.test(f)).sort())
  for(const t of JSON.parse(fs.readFileSync(path.join(TAG_DIR,f),'utf8')))m.set(t.key,t);
 return m;
}

export async function build(){
 const idxPath=path.join(OUT_DIR,'index.json');
 if(fs.existsSync(idxPath)&&!process.argv.includes('--force')){
  const cur=JSON.parse(fs.readFileSync(idxPath,'utf8'));
  if((cur.entries||[]).some(e=>e.核验)){console.error('index.json 已含核验结果（核验字段），拒绝覆盖。核验结论记录在 world/drafts/yaoguai/overrides.json，确需重建请加 --force（会先套用 overrides）。');process.exitCode=1;return;}
 }
 const ovPath=path.join(OUT_DIR,'overrides.json');
 const overrides=fs.existsSync(ovPath)?JSON.parse(fs.readFileSync(ovPath,'utf8')):{排除:[],条目:{}};
 const {MOTIFS,ENV_MAP,SYSTEMS,DEDUP}=await import('./yaoguai-defs.mjs');
 const es=loadSource();const tags=loadTags();const pinyin=JSON.parse(fs.readFileSync(path.join(OUT_DIR,'pinyin.json'),'utf8')).map;
 const missing=es.filter(e=>!tags.has('s'+e.src));if(missing.length)throw new Error(`缺标注 ${missing.length} 条：${missing.slice(0,5).map(e=>'s'+e.src).join(',')}`);
 // 1) 逐条合成
 let rows=es.map(e=>{
  const t=tags.get('s'+e.src);const cites=e.cites.map(normCite);
  return {key:'s'+e.src,名称:t.名称||e.name,别名:uniq(t.别名||[]),成员:t.成员,类别:e.kind,朝代:e.era,
   出处:cites,特征标签:uniq(t.特征||[]),母题标签:uniq(t.母题||[]),traits:uniq(t.traits||[]),本质:t.本质,
   原型大类:t.原型大类,原型:t.原型||'',环境:uniq(t.环境||[]),倾向:t.倾向,危害:uniq(t.危害||[]),互动:uniq(t.互动||[]),
   简述:t.简述||'',备注:uniq([t.备注,e.noCite?'资料未注古籍出处':'',e.authorNamed?'名称为整理者拟名，原典无确切名称':'']),
   来源序号:[e.seq],来源行:e.parts,名称存疑:!!t.名称存疑,无法识别:!!t.无法识别,OCR修正:t.OCR修正||undefined,作者拟名:e.authorNamed||undefined};
 });
 // 2) 合并同名与登记为同一妖怪的条目（DEDUP 记录人工判定的异名同物）
 const canon=n=>DEDUP.alias[n]||n;const groups=new Map();
 for(const r of rows){const k=canon(r.名称);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r);}
 const keepApart=new Set(DEDUP.keepApart);const merged=[];
 for(const [k,g] of groups){
  if(g.length===1||keepApart.has(k)){merged.push(...g);continue;}
  const [a,...rest]=g;const all=[a,...rest];
  merged.push({...a,名称:k,别名:uniq([...all.flatMap(r=>[r.名称,...r.别名])]).filter(x=>x!==k),
   出处:dedupCites(all.flatMap(r=>r.出处)),特征标签:uniq(all.flatMap(r=>r.特征标签)),母题标签:uniq(all.flatMap(r=>r.母题标签)),
   traits:uniq(all.flatMap(r=>r.traits)),环境:uniq(all.flatMap(r=>r.环境)),危害:uniq(all.flatMap(r=>r.危害)),互动:uniq(all.flatMap(r=>r.互动)),
   本质:all.every(r=>r.本质===a.本质)?a.本质:'两可',简述:uniq(all.map(r=>r.简述)).join(' | '),
   备注:uniq([...all.flatMap(r=>r.备注),`合并自序号 ${all.map(r=>r.来源序号[0]).join('、')}`]),
   来源序号:all.flatMap(r=>r.来源序号),来源行:all.flatMap(r=>r.来源行),合并来源:all.map(r=>r.key),
   类别:a.类别,名称存疑:all.every(r=>r.名称存疑),无法识别:all.every(r=>r.无法识别)});
 }
 // 3) 稳定 id：yg_ + 名称拼音（无调），重名加序号
 const used=new Map();
 for(const r of merged){
  let base='yg_'+[...r.名称].map(ch=>pinyin[ch]??'').filter(Boolean).join('_');
  if(base==='yg_')base='yg_x'+r.来源序号[0];
  const n=(used.get(base)||0)+1;used.set(base,n);r.id=n===1?base:`${base}_${n}`;
 }
 // 3b) 套用核验 overrides：排除名单移出；核正字段覆盖（出处为完整新值）
 const 合并后条目=merged.length;
 {const byId=new Map(merged.map(r=>[r.id,r]));
  for(const id of [...overrides.排除.map(x=>x.id),...Object.keys(overrides.条目)])if(!byId.has(id))throw new Error('overrides 引用了不存在的 id '+id);
  const out=new Set(overrides.排除.map(x=>x.id));
  for(const [id,o] of Object.entries(overrides.条目)){const r=byId.get(id);
   for(const [k,v] of Object.entries(o.字段||{}))r[k]=k==='出处'?v.map(c=>({书:c.书,作者:c.作者,朝代:c.朝代,卷:c.卷,转引:c.转引||[]})):v;
   for(const k of o.删字段||[]){if(k==='名称存疑')r.名称存疑=false;else if(k==='备注')r.备注=[];else r[k]=undefined;}
   r.核验=o.核验;r.核验说明=o.核验说明;}
  for(let i=merged.length-1;i>=0;i--)if(out.has(merged[i].id))merged.splice(i,1);}
 const ids=new Map(merged.map(r=>[r.key,r.id]));
 // 4) 输出 index.json
 const index=merged.map(r=>({id:r.id,名称:r.名称,别名:r.别名,成员:r.成员,类别:r.类别,朝代:r.朝代,
  出处:r.出处.map(c=>({书:c.书,作者:c.作者,朝代:c.朝代||undefined,卷:c.卷||undefined,转引:c.转引.length?c.转引:undefined,现代著作:MODERN_WORKS.has(c.书)||undefined})),
  特征标签:r.特征标签,traits:r.traits,母题标签:r.母题标签,本质:r.本质,原型动物或物类:{大类:r.原型大类,物类:r.原型},
  栖息或出没环境:r.环境,危害或善恶倾向:{倾向:r.倾向,危害:r.危害},与人互动方式:r.互动,简述:r.简述,
  备注:r.备注.length?r.备注:undefined,来源序号:r.来源序号,合并来源:r.合并来源,名称存疑:r.名称存疑||undefined,无法识别:r.无法识别||undefined,
  OCR修正:r.OCR修正,作者拟名:r.作者拟名,核验:r.核验,核验说明:r.核验说明}));
 const write=(f,v)=>fs.writeFileSync(path.join(OUT_DIR,f),JSON.stringify(v,null,1)+'\n');
 write('index.json',{kind:'yaoguai-index',namespace:'core',version:1,
  note:'妖怪志事实索引（YG-1）。只含事实：名称、类别、朝代、古籍出处与自拟标签；不含整理本（张云《中国妖怪故事》）的文字。traits 复用 server-plugin/traits.mjs 的性状词；母题见 motifs.json；环境与互动词见 vocab-proposal.json。',
  sourceNote:{整理本:'张云《中国妖怪故事（全集）》条目表，仓库外只读',原始行数:JSON.parse(fs.readFileSync(srcPath(),'utf8')).length,清洗后条目:es.length,合并后条目,...(overrides.排除.length||Object.keys(overrides.条目).length?{核验后条目:index.length}:{})},
  entries:index,...(Object.keys(overrides.条目).length?{核验报告:'docs/妖怪志/核验报告.md（WM-2a 出处核验；条目上的 核验/核验说明 字段）'}:{})});
 // 5) 母题目录
 const count={};const reps={};
 for(const r of merged)for(const m of r.母题标签){count[m]=(count[m]||0)+1;(reps[m]??=[]).push(r);}
 const motifs=[];const seen=new Set();
 for(const def of MOTIFS){
  const keys=[def.id,...(def.absorbs||[])];seen.add(def.id);for(const k of def.absorbs||[])seen.add(k);
  const rs=uniq(keys.flatMap(k=>reps[k]||[]));
  const pick=[...rs].sort((a,b)=>(a.本质==='具名个体'?0:1)-(b.本质==='具名个体'?0:1)||a.母题标签.length-b.母题标签.length).slice(0,8);
  motifs.push({id:def.id,名称:def.label,触发条件:def.trigger,过程:def.process,结局分支:def.outcomes,涉及系统:def.systems,规则形状:def.shapes,迁移阶段:def.stage,
   出现频次:rs.length,代表条目:pick.map(r=>r.id),吸收标签:def.absorbs});
 }
 const unmapped=Object.entries(count).filter(([k])=>!seen.has(k)).sort((a,b)=>b[1]-a[1]);
 write('motifs.json',{kind:'yaoguai-motifs',namespace:'core',version:1,
  note:'情节母题目录（YG-1）。由 index.json 的母题标签归纳；频次=含该母题（及其吸收的标注变体）的条目数；涉及系统用 SYSTEMS 键。',
  systems:SYSTEMS,motifs,未归类标签:unmapped.map(([k,n])=>({标签:k,频次:n,条目:reps[k].map(r=>r.id).slice(0,5)}))});
 // 6) 统计
 const tally=(f)=>{const o={};for(const r of merged)for(const v of [].concat(f(r)??[]))o[v]=(o[v]||0)+1;return Object.fromEntries(Object.entries(o).sort((a,b)=>b[1]-a[1]));};
 const books={};for(const r of merged)for(const c of r.出处){const k=c.书;(books[k]??={书:k,作者:new Set(),朝代:new Set(),条目:new Set(),现代著作:MODERN_WORKS.has(k),校注本:MODERN_EDITION.test(k)});
  if(c.作者)books[k].作者.add(c.作者);if(c.朝代)books[k].朝代.add(c.朝代);books[k].条目.add(r.id);
  for(const b of c.转引){(books[b]??={书:b,作者:new Set(),朝代:new Set(),条目:new Set(),转引自:new Set(),现代著作:MODERN_WORKS.has(b)});books[b].条目.add(r.id);(books[b].转引自??=new Set()).add(k);}}
 const bookList=Object.values(books).map(b=>({书:b.书,作者:[...b.作者],朝代:[...b.朝代],条目数:b.条目.size,转引自:b.转引自?[...b.转引自]:undefined,现代著作:b.现代著作||undefined,校注本:b.校注本||undefined})).sort((a,b)=>b.条目数-a.条目数||a.书.localeCompare(b.书,'zh'));
 const stats={条目:merged.length,类别:tally(r=>r.类别),本质:tally(r=>r.本质),类别x本质:tally(r=>`${r.类别}/${r.本质}`),朝代:tally(r=>r.朝代),
  出处朝代:tally(r=>uniq(r.出处.map(c=>c.朝代||'未注'))),环境:tally(r=>r.环境),原型大类:tally(r=>r.原型大类),原型:tally(r=>r.原型),倾向:tally(r=>r.倾向),
  危害:tally(r=>r.危害),互动:tally(r=>r.互动),traits:tally(r=>r.traits),母题:tally(r=>r.母题标签),
  名称存疑:merged.filter(r=>r.名称存疑).map(r=>r.id),无法识别:merged.filter(r=>r.无法识别).map(r=>r.id),
  合并:merged.filter(r=>r.合并来源).map(r=>({id:r.id,来源序号:r.来源序号})),无出处:merged.filter(r=>!r.出处.length).map(r=>r.id),
  古籍数:bookList.filter(b=>!b.现代著作).length,书目:bookList,envMap:ENV_MAP};
 write('stats.json',stats);
 writeBibliography(bookList,merged);
 // 6b) 物种 / 具名个体候选（映射草案用；规则见 docs/妖怪志/映射方案.md §3）
 const FAR=new Set(['异域','阴间','梦境','天空']);
 const local=r=>r.环境.some(v=>!FAR.has(v));
 const BEASTLY=new Set(['兽','禽','水族','鳞虫','虫豸','植物','混合异兽']);
 const SPIRIT_M=new Set(['化形修炼','年久成精','妖怪聚落','论学交谈','人妖婚配','交易往来','报恩']);
 const envProv=r=>uniq(r.环境.flatMap(v=>ENV_MAP[v]?.provinces||[]).filter(p=>p!=='*'));
 // 宗教敏感初筛（PLAN 收录标准：真实宗教受崇拜的神圣存在不收、不改编）：神祇类、佛典饿鬼地狱诸鬼、出自佛道经典者，YG-2 逐条裁定
 const RELIGIOUS_BOOKS=/法苑珠林|释禅波罗蜜|经$|云笈七签|天妃显圣录|寺庙与神明/;
 const sensitive=r=>r.原型大类==='神祇'||r.母题标签.includes('饿鬼果报')||r.出处.some(c=>RELIGIOUS_BOOKS.test(c.书)&&!/山海经|神异经|水经/.test(c.书)&&!c.转引.some(b=>/白泽图|搜神/.test(b)));
 const brief=r=>({id:r.id,名称:r.名称,类别:r.类别,原型:r.原型||r.原型大类,环境:r.环境,倾向:r.倾向,省份建议:envProv(r),宗教敏感待审:sensitive(r)||undefined});
 const cand={野外种群:[],精怪族群:[],亡魂类型:[],器物与宅精:[],具名个体:{首领或聚居地成员:[],亡魂个体:[],神祇或地方神:[],其他:[]},只作书本与传闻:[]};
 for(const r of merged){
  const spirit=r.母题标签.some(m=>SPIRIT_M.has(m))||r.类别==='精';
  if(r.无法识别){cand.只作书本与传闻.push(brief(r));continue;}
  if(r.本质==='物种'||r.本质==='两可'){
   if(!local(r)){cand.只作书本与传闻.push(brief(r));continue;}
   if(BEASTLY.has(r.原型大类))(spirit?cand.精怪族群:cand.野外种群).push(brief(r));
   else if(r.原型大类==='亡魂'||r.原型大类==='尸身')cand.亡魂类型.push(brief(r));
   else if(['器物','建筑物件','自然物','无形'].includes(r.原型大类))cand.器物与宅精.push(brief(r));
   else if(r.原型大类==='人形异族')(spirit?cand.精怪族群:cand.野外种群).push(brief(r));
   else cand.只作书本与传闻.push(brief(r));
  }
  if(r.本质==='具名个体'||r.本质==='两可'){
   const b=brief(r);
   if(r.原型大类==='神祇')cand.具名个体.神祇或地方神.push(b);
   else if(r.原型大类==='亡魂'||r.原型大类==='尸身')cand.具名个体.亡魂个体.push(b);
   else if(local(r)&&(BEASTLY.has(r.原型大类)||['器物','人形异族'].includes(r.原型大类)))cand.具名个体.首领或聚居地成员.push(b);
   else cand.具名个体.其他.push(b);
  }
 }
 write('candidates.json',{kind:'yaoguai-candidates',version:1,note:'YG-1 初筛，YG-2 逐条复核；“两可”条目同时列入物种侧与个体侧；省份建议由环境→ENV_MAP 派生，不是定案。',
  宗教敏感待审:merged.filter(sensitive).map(r=>r.id),counts:{宗教敏感待审:merged.filter(sensitive).length,野外种群:cand.野外种群.length,精怪族群:cand.精怪族群.length,亡魂类型:cand.亡魂类型.length,器物与宅精:cand.器物与宅精.length,
   具名个体:Object.fromEntries(Object.entries(cand.具名个体).map(([k,v])=>[k,v.length])),只作书本与传闻:cand.只作书本与传闻.length},...cand});
 // 7) 建议词汇清单
 const {INTERACT_VERBS,HARM_TAGS}=await import('./yaoguai-defs.mjs');
 const TRAITS=new Set((await import('../server-plugin/traits.mjs')).CREATURE_TAGS.concat((await import('../server-plugin/traits.mjs')).ELEMENTS));
 write('vocab-proposal.json',{kind:'yaoguai-vocab-proposal',version:1,
  note:'YG-1 建议的词汇扩展，尚未登记进 world/ontology（登记在 YG-2/YG-4 随规则或数据接入时做，避免未被代码使用的词进入词表）。',
  复用traits:Object.fromEntries(Object.entries(stats.traits).filter(([k])=>TRAITS.has(k))),
  traits外的性状词:Object.fromEntries(Object.entries(stats.traits).filter(([k])=>!TRAITS.has(k))),
  新标签族:[
   {id:'motif:*',family:'motif',note:'妖怪志情节母题，见 motifs.json 各条 tag',entries:MOTIFS.map(m=>({id:m.tag,label:m.label}))},
   {id:'habitat:*',family:'habitat',note:'出没环境；能落到 biome 的复用 biomes.json 群落词，其余是地点类型谓词',entries:Object.entries(ENV_MAP).map(([k,v])=>({label:k,biome:v.biome,provinces:v.provinces,note:v.note}))},
   {id:'harm:*',family:'harm',note:'危害类型；new: 为建议新增',entries:Object.entries(HARM_TAGS).map(([k,v])=>({label:k,tag:v}))}
  ],
  互动动词映射:INTERACT_VERBS,
  建议新动词:uniq(Object.values(INTERACT_VERBS).flat().filter(v=>v.startsWith('new:'))).map(v=>v.slice(4)),
  建议id前缀:{prefix:'yg_',note:'妖怪志条目（书本与传闻可知的知识条目），不是实体；物种成为野外种群时用 monster_/pop_，个体成为首领或居民时用 boss_/npc_，并以 yaoguai 字段回指 yg_ id'},
  特征前缀:{'形':'外形','能':'能力','弱':'克制与禁忌（→修正项/弱点）','习':'习性与活动时间（→activeHours、栖地）','化':'化形或成精条件（→灵智累积参数）'}});
 console.log(JSON.stringify({entries:merged.length,merged:stats.合并.length,motifs:motifs.length,unmapped:unmapped.length,books:bookList.length,本质:stats.本质}));
 return {merged,stats,motifs};
}

function dedupCites(cs){const s=new Set();return cs.filter(c=>{const k=c.书+'|'+c.作者+'|'+c.卷;if(s.has(k))return false;s.add(k);return true;});}

function writeBibliography(list,merged){
 const L=[];
 L.push('# 妖怪志古籍书目','',`由 \`node tools/yaoguai-index.mjs build\` 生成，勿手改。统计口径：妖怪志事实索引（world/drafts/yaoguai/index.json）${merged.length} 条中，出处列出该书（含经类书转引）的条目数。`,'',
  '这些古籍是公有领域原典，YG-3 原创撰写以原典记载为依据；张云《中国妖怪故事》只作线索，不作文字来源。标“现代著作”的是当代工具书，不是公有领域，只能用来回查它所依据的古籍，不能作为撰写依据；标“校注本”的以其底本古籍为准，不用校注者的现代注释文字。“转引”指资料在类书（如《太平广记》《法苑珠林》《太平御览》）里注明的原始出处。','',
  `共 ${list.length} 种（公有领域古籍 ${list.filter(b=>!b.现代著作).length} 种，现代著作 ${list.filter(b=>b.现代著作).length} 种）。`,'',
  '| 书名 | 作者 | 朝代 | 条目数 | 说明 |','|---|---|---|---|---|');
 for(const b of list)L.push(`| ${b.书} | ${b.作者.join('、')||'—'} | ${b.朝代.join('、')||'—'} | ${b.条目数} | ${[b.现代著作?'现代著作，非公有领域':'',b.校注本?'校注本，以底本为准':'',b.转引自?'亦有经'+b.转引自.map(x=>'《'+x+'》').join('')+'转引的条目':''].filter(Boolean).join('；')} |`);
 fs.mkdirSync(path.join(ROOT,'docs/妖怪志'),{recursive:true});
 fs.writeFileSync(path.join(ROOT,'docs/妖怪志/古籍书目.md'),L.join('\n')+'\n');
}

const cmd=process.argv[2];
if(process.argv[1]?.endsWith('yaoguai-index.mjs')){
 if(cmd==='prep')prep();
 else if(cmd==='build')await build();
 else if(cmd)console.error('未知命令 '+cmd);
}
