// S0 函数级差距清单：在第 10 章模块归组（tools/arch-layers.mjs）基础上，把每个模块的顶层函数归为
// 保留 / 改造 / 替换，并标对应迁移阶段，写 docs/架构设计/差距清单.md。
// 归类方法：先看人工覆盖表（第 10 章与 run-001 点名的关键函数），再按函数体启发式（是否写状态、写什么）归类。
// 启发式是近似：它回答“这个函数在哪一阶段会被动到、怎么动”，迁移卡开工时以实际调用链为准。
// 用法：node tools/gap-list.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';
import {layerOf,LAYER_NAMES} from './arch-layers.mjs';

const ROOT=path.resolve(import.meta.dirname,'..');
export const OUTPUT='docs/架构设计/差距清单.md';
const src=f=>fs.readFileSync(path.join(ROOT,f),'utf8');

function braceBody(text,index){
 const open=text.indexOf('{',index);if(open<0)return '';
 let depth=0;for(let i=open;i<text.length;i++){const c=text[i];if(c==='{')depth++;else if(c==='}'){depth--;if(!depth)return text.slice(open,i+1);}}
 return text.slice(open);
}
export function functionsOf(file){
 const text=src(file),out=[];
 const re=/^(export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(|^(export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/gm;
 for(const m of text.matchAll(re)){
  const name=m[2]??m[4],exported=Boolean(m[1]??m[3]);
  const close=/\)\s*(?:=>\s*)?\{/g;close.lastIndex=m.index;const c=close.exec(text);
  const body=c&&c.index-m.index<400?braceBody(text,c.index):text.slice(m.index,text.indexOf('\n',m.index+m[0].length));
  out.push({name,exported,line:text.slice(0,m.index).split('\n').length,body});
 }
 // WorldEngine / activities methods (four-space indented); those taking (d,args,...) are tool handlers.
 for(const m of text.matchAll(/^ {4}(?:async\s+)?([a-z][\w$]*)\s*\(([^)]*)\)\s*\{/gm))if(!['if','for','while','switch','catch','return','function'].includes(m[1]))
  out.push({name:m[1],exported:true,method:/^d\s*,\s*args/.test(m[2]),line:text.slice(0,m.index).split('\n').length,body:braceBody(text,m.index)});
 return out;
}

// 人工覆盖：第 10 章 §10.2 与 run-001 核对点名的函数。
const OVERRIDES={
 'server-plugin/npc-life.mjs#recordEntityDeath':['替换','S2','死亡只在转移协议处理（04 §4.2），三种死亡入口改为 transition(gone)'],
 'server-plugin/family-inheritance.mjs#settleFamilyEstate':['替换','S2','遗产实体化；先清偿后分配（E02③）'],
 'server-plugin/family-inheritance.mjs#advanceGuardianships':['替换','S2','guardian_of 交接类 succeed 按族谱顺位（E02④）'],
 'server-plugin/entity-transitions.mjs#entityTransition':['替换','S2','协议步骤 6 发布；协议进 L1，交接类由包注册'],
 'server-plugin/finance-assets.mjs#rentDue':['改造','S3','租金义务金额由建筑 condition 派生（E06③）'],
 'server-plugin/finance-bank.mjs#advanceBankFinance':['改造','S3','分期逐期逾期、罚息、accruedTo 闭式（E12②）'],
 'server-plugin/credit.mjs#advanceCredit':['改造','S3','41 处债务处理合并为义务种类'],
 'server-plugin/wildlife.mjs#wildlifePriceFactor':['替换','S5','野味价格改读市场投影（可售存量与流量，E07⑥）'],
 'server-plugin/settlement-trade.mjs#regionalTradePrice':['替换','S5','22 处价格计算合并为市场投影'],
 'server-plugin/war-diplomacy.mjs#endWar':['改造','S5','封关是 controls 持有按阶段解除，价格不存（E13③）'],
 'server-plugin/nation-founding.mjs#advanceNations':['改造','S2','叛离走 fief 交接类 retain_disputed，不自动分裂（E14③）'],
 'server-plugin/pets.mjs#petCapacity':['改造','S2','名额由职业被动派生，不写死两个职业（E17②）'],
 'server-plugin/entity-view.mjs#personOffices':['改造','S2','任命的授予者是职位，免职不影响任命（E03⑤）'],
 'server-plugin/entity-view.mjs#settlementGovernment':['改造','S2','职位空缺走继任规则（E02①）'],
 'server-plugin/promotion.mjs#promotionConditions':['改造','S2','升格条件按设施种类（E03③）'],
 'server-plugin/law-codes.mjs#legalCodeAt':['改造','S4','法域沿地点包含树找 governs；缺数据拒绝（I9）'],
 'server-plugin/law-codes.mjs#miningJurisdiction':['改造','S4','并入统一法域派生'],
 'server-plugin/world-events.mjs#deriveWorldEvents':['改造','S8','事件主写后只留作迁移期校验（I16），S8 删除'],
 'server-plugin/engine.mjs#reduce':['改造','S1','抽出事务与原语执行器（kernel/transaction、kernel/primitives），签名不变'],
 'server-plugin/effects.mjs#applyEffects':['改造','A3','K6 效果改为原语适配器，三表合一'],
 'server-plugin/magic-effects.mjs#registerMagicEffect':['改造','A3','effectSpec 经适配器映射原语'],
 'server-plugin/standing.mjs#adjustStanding':['改造','S6','立场改为 impress 事件 + 可重建缓存'],
 'server-plugin/npc-crime.mjs#advanceNpcCrime':['改造','A2','自治包用同一决策规则与原语：vital 可致死、move 可逃亡、transfer 可挪用（E16/E18）'],
 'server-plugin/duels.mjs#duelAction':['改造','A2','参与者模板 agent，NPC 之间可约斗（E11①）'],
 'server-plugin/facilities.mjs#advanceFacilities':['改造','S5','火势反应规则：风向、间距、存货转 sink:destroy（E06）'],
 'server-plugin/organizations.mjs#organization':['改造','S2','首领是职位持有，公库是账户（V4 已同账户）'],
 'server-plugin/group-account.mjs#ensureGroupAccount':['改造','S1','推广为全部实体的账户（I15）'],
 'server-plugin/engine.mjs#itemDelta':['改造','S1','数量改账户转移，单件进实体'],
 'extension/tools.mjs#resolveToolCall':['保留','A1','别名永久保留供回放；world_act 经同一映射'],
 'extension/tools.mjs#toolDefinitions':['改造','A1','枚举移出静态提示，动作目录检索'],
};

const PACK_STAGE={economy:'S3',law:'S4',governance:'S2',family:'S2',organizations:'S2',ecology:'S5',magic:'A3',character:'A3',npc:'A2',military:'S4',companion:'S2',remote:'S7',medicine:'S2',quests:'S3',facilities:'S5'};
const LAYER_STAGE={L0:'S1',L1:'S2',L3:'S6',L4:'A1'};
// 启发式：写状态的函数按“写的是什么”定阶段；只读函数保留（价格计算除外）。
function classify(file,fn,info){
 const key=`${file}#${fn.name}`;
 if(OVERRIDES[key]){const [d,s,why]=OVERRIDES[key];return{disposition:d,stage:s,why,manual:true};}
 const b=fn.body,writes=/\b(?:d|draft)\.(?:set|remove)\(/.test(b)||/\bthis\.(?:itemDelta|advance)\(/.test(b);
 if(/recordEntityDeath\(|status\s*[:=]=?\s*'死亡'|'战斗身亡'/.test(b)&&writes)return{disposition:'替换',stage:'S2',why:'死亡/消失结算 → 转移协议'};
 if(/[Pp]rice|[Qq]uote|priceFactor/.test(fn.name))return{disposition:'替换',stage:'S5',why:'价格计算 → 市场投影'};
 if(!writes){
  if(/^(?:advance|next)\w*|Minute$/.test(fn.name))return{disposition:'改造',stage:'S7',why:'推进/到期计算 → 到期项与时钟规则'};
  return{disposition:'保留',stage:info.layer==='L1'||info.layer==='L3'?'S2':'—',why:info.layer==='L1'||info.layer==='L3'?'只读派生，S2 起改读持有索引':'只读'};
 }
 if(/debt|loan|rent|wage|salary|interest|installment|lease|dividend|['_]tax|arrears|contract|obligation|pledge|pawn/i.test(b))return{disposition:'改造',stage:'S3',why:'债务/契约写入 → 义务种类'};
 if(/governance_office|organization|member|guardianship|appoint|household|title|authorization|custody|employ|residence|citizen|certif/i.test(b))return{disposition:'改造',stage:'S2',why:'身份/归属写入 → 持有'};
 if(/coins|inventory|itemDelta|treasury|bagPath|quantity\(/.test(b))return{disposition:'改造',stage:'S1',why:'钱物写入 → 账户与转移'};
 if(/memory|rumor|standing|relationships|reputation|cognition|knowers/i.test(b))return{disposition:'改造',stage:'S6',why:'记忆/传闻/立场写入 → 知情投影与事件'};
 if(/legal_case|jurisdiction|legalCode|location/.test(b)&&info.pack==='law')return{disposition:'改造',stage:'S4',why:'案件/法域 → case 实体与法域派生'};
 if(/^(?:advance|settle|tick)\w*/.test(fn.name))return{disposition:'改造',stage:'S7',why:'推进项写入 → 到期项/时钟规则'};
 if(fn.method||/Action$/.test(fn.name))return{disposition:'改造',stage:'A1',why:'工具处理器 → 注册动作'};
 return{disposition:'改造',stage:info.layer==='L2'?PACK_STAGE[info.pack]??'S8':LAYER_STAGE[info.layer]??'S8',why:'其他状态写入 → 提案与原语'};
}

export function buildGapList(){
 const files=[...fs.readdirSync(path.join(ROOT,'server-plugin')).filter(f=>f.endsWith('.mjs')).map(f=>`server-plugin/${f}`),
  ...fs.readdirSync(path.join(ROOT,'extension')).filter(f=>/\.m?js$/.test(f)).map(f=>`extension/${f}`)];
 const rows=[];
 for(const file of files){const info=layerOf(file);if(!info)continue;
  for(const fn of functionsOf(file))rows.push({file,layer:info.layer,pack:info.pack,name:fn.name,line:fn.line,exported:fn.exported,...classify(file,fn,info)});}
 const absent=Object.keys(OVERRIDES).filter(key=>{const [file,name]=key.split("#");return !rows.some(r=>r.file===file&&r.name===name);});if(absent.length)throw Error(`覆盖表函数不存在：${absent.join(" ")}`);
 return rows;
}

export function render(rows){
 const L=[],count=(f)=>rows.filter(f).length;
 const stages=['S1','S2','S3','S4','S5','S6','S7','S8','A1','A2','A3','—'];
 L.push('# 函数级差距清单（S0，AR-2 细化）','',
  `由 \`node tools/gap-list.mjs\` 生成，勿手改；改归类请改 tools/gap-list.mjs 的人工覆盖表。模块归组与层见 tools/arch-layers.mjs（第 10 章 §10.2）。`,'',
  '归类方法：人工覆盖表（第 10 章与 run-001 核对点名的关键函数，标“★”）优先；其余按函数体启发式——写状态的函数按写入内容定阶段（死亡→S2 协议替换；价格计算→S5 市场投影替换；债务契约→S3 义务；身份归属→S2 持有；钱物→S1 账户；记忆立场→S6 知情；推进→S7 到期项；工具处理器→A1 注册动作），只读函数保留（L1/L3 的视图在 S2 改读持有索引）。启发式是近似，迁移卡开工时以实际调用链为准。','',
  '处置含义同第 10 章：保留 = 接口与职责不变；改造 = 职责保留、内部按目标重写；替换 = 由新机制承接后删除。','');
 L.push('## 汇总','',`共 ${rows.length} 个顶层函数/处理器（${count(r=>r.manual)} 个人工归类）。`,'',
  '| 处置 | '+stages.join(' | ')+' | 合计 |','|---|'+stages.map(()=>'---:').join('|')+'|---:|');
 for(const d of['保留','改造','替换'])L.push(`| ${d} | `+stages.map(s=>count(r=>r.disposition===d&&r.stage===s)||'').join(' | ')+` | ${count(r=>r.disposition===d)} |`);
 L.push('','| 层 | 模块数 | 保留 | 改造 | 替换 |','|---|---:|---:|---:|---:|');
 for(const layer of['L0','L1','L2','L3','L4']){const rs=rows.filter(r=>r.layer===layer);L.push(`| ${layer} ${LAYER_NAMES[layer]} | ${new Set(rs.map(r=>r.file)).size} | ${rs.filter(r=>r.disposition==='保留').length} | ${rs.filter(r=>r.disposition==='改造').length} | ${rs.filter(r=>r.disposition==='替换').length} |`);}
 L.push('','## 关键函数（人工归类）','','| 函数 | 处置 | 阶段 | 说明 |','|---|---|---|---|');
 for(const r of rows.filter(r=>r.manual))L.push(`| ${r.file}:${r.line} \`${r.name}\` | ${r.disposition} | ${r.stage} | ${r.why} |`);
 L.push('','## 逐模块','','每行：模块（目标层/包）——按处置与阶段列出函数名（行号）。只读且保留的函数只计数不逐一列出。','');
 const groups=[['L0',null],['L1',null],...[...new Set(rows.filter(r=>r.layer==='L2').map(r=>r.pack))].sort().map(p=>['L2',p]),['L3',null],['L4',null]];
 for(const [layer,pack]of groups){
  L.push(`### ${layer} ${LAYER_NAMES[layer]}${pack?` · ${pack}`:''}`,'');
  const files=[...new Set(rows.filter(r=>r.layer===layer&&r.pack===pack).map(r=>r.file))].sort();
  for(const file of files){
   const rs=rows.filter(r=>r.file===file),keep=rs.filter(r=>r.disposition==='保留'&&!r.manual);
   const parts=[];
   for(const d of['替换','改造','保留'])for(const s of stages){const xs=rs.filter(r=>r.disposition===d&&r.stage===s&&!(d==='保留'&&!r.manual));if(xs.length)parts.push(`${d}·${s}：${xs.map(r=>`${r.manual?'★':''}${r.name}(${r.line})`).join('、')}`);}
   L.push(`- **${file}**（${rs.length} 函数；只读保留 ${keep.length}）${parts.length?'——'+parts.join('；'):''}`);
  }
  L.push('');
 }
 return L.join('\n');
}

if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
 const rows=buildGapList(),text=render(rows),out=path.join(ROOT,OUTPUT);
 if(process.argv.includes('--check')){const same=fs.existsSync(out)&&fs.readFileSync(out,'utf8').replace(/\r\n/g,'\n')===text;console.log(`gap-list: ${OUTPUT} ${same?'已是最新':'过期'}`);if(!same)process.exitCode=1;}
 else{fs.writeFileSync(out,text);const c=d=>rows.filter(r=>r.disposition===d).length;console.log(`gap-list: ${rows.length} 个函数（保留 ${c('保留')}，改造 ${c('改造')}，替换 ${c('替换')}）→ ${OUTPUT}`);}
}
