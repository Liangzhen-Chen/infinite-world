// 卡 D 通用性变异（只改副本 F:/dnd-tmp/d-labor-acc/mut/，不动仓库）。
//  --stage 1 ：复制仓库 → mut/（不含 node_modules/.git/SillyTavern/backups/dist/logs/docs/world/drafts，node_modules 用 junction）；
//              加一个从没出现过的职业名，只给它劳动类别属性（从基线浸泡里实际采集某物的人的职业定义上取“劳动”字段），
//              把一个基线里不劳动的同聚落成年人改成这个职业。写 mut-meta.json。
//  --stage 2 ：把 trace-mut1（缺则 trace-base）里所有劳动者的职业名、以及新职业名，全部改成不含任何关键词的随机 ASCII 串（精确字符串替换）。
import fs from 'node:fs';
import path from 'node:path';
const ROOT='F:/dnd-tmp/d-labor-acc',MUT=`${ROOT}/mut`;
const SRC=(process.env.ACC_REPO??'F:/dnd-wt/S5FIX').split('\\').join('/').replace(/\/$/,'');
const stage=Number(process.argv[process.argv.indexOf('--stage')+1]);
const metaFile=`${ROOT}/mut-meta.json`;
const SKIP=new Set(['node_modules','.git','SillyTavern','backups','dist','logs','docs']);
const readJ=f=>JSON.parse(fs.readFileSync(f,'utf8'));
function jsonFiles(dir,out=[]){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name).split('\\').join('/');
  if(e.isDirectory()){if(p.endsWith('/world/drafts'))continue;jsonFiles(p,out);}else if(e.name.endsWith('.json'))out.push(p);}return out;}
// 种子固定的随机 ASCII 串（不含任何中文关键词）
let seed=0x9e3779b1;const rnd=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
const randName=()=>'Zx'+Array.from({length:9},()=>'bcdfghjkmnpqrstvwxz'[Math.floor(rnd()*19)]).join('');
const LABOR_KEY=/labor|labour|劳动|work|gather|采集|duty|duties|task|categor|produce|output|livelihood/i;
const NPC_LIKE=o=>'schedule' in o||'householdId' in o||'home' in o||'inventory' in o;
const meta=fs.existsSync(metaFile)?readJ(metaFile):{};
if(stage===1){
  const base=readJ(`${ROOT}/trace-base.json`);
  const gathers=base.credited.filter(x=>x.phase==='soak').flatMap(x=>x.credits.filter(c=>c.cat==='gather').map(c=>({npc:x.npc,item:c.item,qty:c.qty})));
  const laborers=new Set(base.credited.map(x=>x.npc));
  Object.assign(meta,{stage1:{}});const m=meta.stage1;
  fs.rmSync(MUT,{recursive:true,force:true});
  fs.cpSync(SRC,MUT,{recursive:true,filter:p=>{const b=path.basename(p);if(SKIP.has(b))return false;return !p.split('\\').join('/').endsWith('/world/drafts');}});
  fs.symlinkSync(path.resolve(SRC,'node_modules'),path.join(MUT,'node_modules'),'junction');
  m.copied={from:SRC,to:MUT};
  if(!gathers.length){m.blocked='基线浸泡里没有任何 NPC 的采集被记账归因：没有可供借鉴的“职业 → 劳动类别”属性（缺 R3/R8）';}
  else{
    const by=new Map();for(const g of gathers){const k=g.item;by.set(k,(by.get(k)??0)+g.qty);}
    const item=by.has('item_clay')?'item_clay':[...by].sort((a,b)=>b[1]-a[1])[0][0];
    const gm=new Map();for(const g of gathers)if(g.item===item)gm.set(g.npc,(gm.get(g.npc)??0)+g.qty);
    const G=[...gm].sort((a,b)=>b[1]-a[1]||(a[0]<b[0]?-1:1))[0][0],occOld=base.npcs[G]?.occupation,st=base.npcs[G]?.settlement;
    Object.assign(m,{item,model:G,modelOccupation:occOld,settlement:st});
    const T=Object.entries(base.npcs).filter(([id,n])=>!laborers.has(id)&&n.settlement===st&&!n.minor&&(n.age??30)>=16&&n.occupation!==occOld)
      .sort((a,b)=>(a[1].tier==='full'?0:1)-(b[1].tier==='full'?0:1)||(a[0]<b[0]?-1:1))[0]?.[0];
    m.target=T??null;m.targetOldOccupation=T?base.npcs[T].occupation:null;
    // 找职业定义：以职业名为键的对象，或带该名字段且带劳动字段的非人物对象
    const files=jsonFiles(path.join(MUT,'world'));let def=null;
    const tok=JSON.stringify(occOld);
    for(const f of files){const txt=fs.readFileSync(f,'utf8');if(!txt.includes(tok))continue;const doc=JSON.parse(txt);
      const walk=(o,parent,key,trail)=>{if(def||!o||typeof o!=='object')return;
        if(!Array.isArray(o)){
          if(occOld in o&&o[occOld]&&typeof o[occOld]==='object'&&Object.keys(o[occOld]).some(k=>LABOR_KEY.test(k))){def={file:f,doc,container:o,mode:'key',value:o[occOld],trail:[...trail,occOld]};return;}
          if(!NPC_LIKE(o)&&Object.entries(o).some(([k,v])=>v===occOld)&&Object.keys(o).some(k=>LABOR_KEY.test(k))&&Array.isArray(parent)){def={file:f,doc,container:parent,mode:'item',value:o,trail};return;}
        }
        for(const [k,v] of Object.entries(o))walk(v,o,k,[...trail,k]);};
      walk(doc,null,null,[]);if(def)break;}
    let newOcc='晨钟客';for(let i=0;files.some(f=>fs.readFileSync(f,'utf8').includes(newOcc));i++)newOcc='晨钟客'+'甲乙丙丁戊己庚辛'[i];
    m.newOccupation=newOcc;
    if(!def)m.blocked=`找不到职业“${occOld}”的劳动类别属性：world/ 下没有以该职业名为键、或以该名为字段且带劳动字段的定义（缺 R3：职业 → 劳动类别）`;
    else if(!T)m.blocked=`${st} 没有基线里不劳动的成年人可改职业`;
    else{
      const laborKeys=Object.keys(def.value).filter(k=>LABOR_KEY.test(k));
      const fresh=Object.fromEntries(laborKeys.map(k=>[k,structuredClone(def.value[k])]));
      for(const [k,v] of Object.entries(def.value))if(v===occOld)fresh[k]=newOcc;
      if(def.mode==='key')def.container[newOcc]=fresh;else def.container.push(fresh);
      fs.writeFileSync(def.file,JSON.stringify(def.doc,null,2));
      m.definition={file:path.relative(MUT,def.file).split('\\').join('/'),mode:def.mode,trail:def.trail.join('.'),laborKeys,added:fresh};
      let set=0;for(const f of files.filter(f=>/\/world\/people\//.test(f))){const doc=readJ(f);let hit=false;
        const walk=o=>{if(!o||typeof o!=='object')return;if(!Array.isArray(o)&&o.id===T&&'occupation' in o){o.occupation=newOcc;hit=true;set++;}for(const v of Object.values(o))walk(v);};walk(doc);
        if(hit)fs.writeFileSync(f,JSON.stringify(doc,null,2));}
      m.targetRecordsChanged=set;if(!set)m.blocked=`找不到 ${T} 的人物记录`;
    }
  }
}
if(stage===2){
  const t=fs.existsSync(`${ROOT}/trace-mut1.json`)?readJ(`${ROOT}/trace-mut1.json`):readJ(`${ROOT}/trace-base.json`);
  if(!fs.existsSync(MUT))throw new Error('先跑 --stage 1');
  const occs=new Set(Object.values(t.occupations).filter(Boolean));if(meta.stage1?.newOccupation&&!meta.stage1.blocked)occs.add(meta.stage1.newOccupation);
  const map={};for(const o of [...occs].sort())map[o]=randName();
  const files=jsonFiles(path.join(MUT,'world'));let changed=0;
  for(const f of files){let txt=fs.readFileSync(f,'utf8'),n=txt;for(const [a,b] of Object.entries(map))n=n.split(JSON.stringify(a)).join(JSON.stringify(b));if(n!==txt){fs.writeFileSync(f,n);changed++;}}
  meta.stage2={control:t.tag,renamed:map,filesChanged:changed};
}
fs.writeFileSync(metaFile,JSON.stringify(meta,null,1));
console.error(JSON.stringify(stage===1?meta.stage1:meta.stage2).slice(0,800));
