// K7 处分矩阵：行、列都从本体与实际世界推出；每格在 master 上用真实动作试一次。
// 用法：TEMP=F:/dnd-tmp TMP=F:/dnd-tmp node F:/dnd-tmp/k7-acc/matrix.mjs [--rows=stock,instance]
// 产出：matrix.json、matrix.md、expected.json（同目录）。
import fs from 'node:fs/promises';
import {execSync} from 'node:child_process';
import {newGame,fork,act,propose,holdingsOf,presentNpcs,acct,REPO} from './lib.mjs';
import {ROWS,ontology,ownableTemplates,excludedTemplates,propertyHoldingKinds,census} from './rows.mjs';
import {COLUMNS,ALIASES,propertyObligationKinds,OWNER_PRIMITIVES} from './columns.mjs';
const OUT='F:/dnd-tmp/k7-acc/';
const only=process.argv.find(a=>a.startsWith('--rows='))?.slice(7).split(',');
const commit=execSync(`git -C ${REPO} rev-parse --short HEAD`).toString().trim(),branch=execSync(`git -C ${REPO} branch --show-current`).toString().trim();

// —— 每格的提案：原语参数名一律取 primitives.json 的 params ——
const sinkOf=(r,s='sink:destroy')=>`${s}|${r}|action`;
function popAccount(doc,S){return Object.keys(doc.ledger?.accounts??{}).find(k=>k.startsWith(S.entity+'|'))??Object.keys(doc.ledger?.accounts??{}).find(k=>k.includes(S.entity)&&k.includes('population'))??`${S.entity}|population|population`;}
function ownsId(doc,S,kind='owns'){return holdingsOf(doc,{subject:S.entity,kind}).sort((a,b)=>(b.holder==='player')-(a.holder==='player'))[0]?.id??`${kind}:${S.entity}`;}
const lethal=S=>({op:'vital',target:S.entity,delta:-(S.hp??999),type:'physical'});
const give=(S,cp)=>S.account?{op:'transfer',from:S.account,to:acct(cp,S.resource),qty:1}:{op:'transfer',resource:S.entity,from:'player',to:cp,qty:1};
const destroyVariants=S=>[[{op:'destroy',entity:S.entity}],...(S.account?[[{op:'transfer',from:S.account,to:sinkOf(S.resource),qty:1}]]:[])];
function primitiveEffects(op,S,doc,cp){
  switch(op){
    case 'destroy':return destroyVariants(S);
    case 'transfer':return [[give(S,cp)]];
    case 'vital':return [[lethal(S)]];
    case 'fact.set':return [[{op:'fact.set',entity:S.entity,field:'condition',value:50}]];
    case 'create':return [[{op:'create',kind:S.kind,template:S.resource??S.species??S.entity}]];
    case 'move':return [[{op:'move',entity:S.entity,to:doc.state.location,mode:'carry'}]];
    case 'status':return [[{op:'status',target:S.entity,status:'束缚',duration:60}]];
    case 'transition':return [[{op:'transition',entity:S.entity,kind:'gone',cause:'destruction'}]];
  }
}
function holdingEffects(op,kind,S,doc,cp){
  switch(op){
    case 'holding.open':return [[{op,kind,holder:cp,subject:S.entity,terms:{},grantedBy:'player'}]];
    case 'holding.close':return [[{op,holding:ownsId(doc,S,kind),reason:'abandoned'}]];
    case 'holding.transfer':return [[{op,holding:ownsId(doc,S,kind),newHolder:cp}]];
    case 'holding.rescale':return [[{op,subject:S.entity,kind,shares:{player:0.5,[cp]:0.5}}]];
  }
}
function obligationEffects(op,kind,S,doc,cp){
  const id=S.obligation&&S.obligationKind===kind?S.obligation:`${kind}:${S.entity}`;
  switch(op){
    case 'obligation.create':return [[{op,kind,debtor:cp,creditor:'player',terms:{subject:S.entity,amount:1}}]];
    case 'obligation.settle':return [[{op,id,amount:1}]];
    case 'obligation.cancel':return [[{op,id,reason:'creditor_waiver'}]];
  }
}
const KEEPER='npc_hw_shendu',BANK_AT='bld_hw_post';
function aliasPlan(id,S,doc,cp){
  const own=ownsId(doc,S),firstOther=Object.keys(doc.state.npcs[cp]?.inventory??{})[0]??'item_ration';
  const P={
    '宰杀':{reg:S.kind==='creature'?{action:'core:combat',slots:{target:S.entity,intent:'attack'}}:null,fx:[[lethal(S)]]},
    '卖':{reg:S.resource?{action:'core:trade.sell_to',slots:{buyer:cp,item:S.resource,quantity:1}}:null,fx:[[give(S,cp),{op:'transfer',from:acct(cp,'coin_river'),to:acct('player','coin_river'),qty:1}],[{op:'holding.transfer',holding:own,newHolder:cp}]]},
    '送':{reg:S.document?{action:'documents:give',slots:{document:S.entity,target:cp}}:null,fx:[[give(S,cp)],[{op:'holding.transfer',holding:own,newHolder:cp}]]},
    '丢弃':{fx:[[{op:'holding.close',holding:own,reason:'abandoned'}],[{op:'move',entity:S.entity,to:doc.state.location,mode:'drop'}]]},
    '毁坏':{fx:destroyVariants(S)},
    '改装':{fx:[[{op:'fact.set',entity:S.entity,field:'condition',value:80}]]},
    '繁育':{fx:[[{op:'create',kind:'creature',template:S.species??S.entity,parents:[S.entity]}]]},
    '挤奶剪毛':{fx:[[{op:'transfer',from:'src:husbandry|item_wool|action',to:acct('player','item_wool'),qty:1}],[{op:'transfer',from:'src:husbandry|item_milk|action',to:acct('player','item_milk'),qty:1}]]},
    '放生':{reg:S.kind==='creature'?{action:'core:pet.release',slots:{target:S.entity}}:null,fx:[[{op:'holding.close',holding:ownsId(doc,S,'tamed_by'),reason:'released'}],[{op:'holding.close',holding:own,reason:'released'}]]},
    '分群':{fx:[[{op:'transfer',from:popAccount(doc,S),to:'sink:individuated|population|action',qty:1},{op:'create',kind:'creature',template:S.species??S.entity}]]},
    '个体化':{fx:[[{op:'transfer',from:popAccount(doc,S),to:'sink:individuated|population|action',qty:2},{op:'create',kind:'creature',template:S.species??S.entity},{op:'create',kind:'creature',template:S.species??S.entity}]]},
    '合群':{fx:[[{op:'transition',entity:S.entity,kind:'gone',cause:'aggregated'}]]},
    '拆解':{fx:[[{op:'destroy',entity:S.entity},{op:'create',kind:'wreck',template:S.resource??S.entity}]]},
    '修理':{reg:S.resource?{action:'core:craft.repair',slots:{item:S.resource,instance:S.entity}}:null,fx:[[{op:'fact.set',entity:S.entity,field:'condition',value:100}]]},
    '种植':{reg:{action:'core:farm.private_sow',slots:{settlement:'loc_hw',areaMu:1}},fx:[[{op:'create',kind:'node',template:'item_oats',location:S.entity}]]},
    '采收':{reg:S.dead?{action:'core:wildlife.gather',slots:{target:S.entity}}:S.crop||S.kind==='loc'?{action:'core:farm.private_harvest',slots:{settlement:'loc_hw'}}:null,fx:[[{op:'transfer',from:'src:harvest|item_oats|action',to:acct('player','item_oats'),qty:1}]]},
    '砍伐':{reg:{action:'core:site.woodcut',slots:{target:S.entity}},fx:[[{op:'destroy',entity:S.entity},{op:'transfer',from:'src:harvest|item_wood|action',to:acct('player','item_wood'),qty:1}]]},
    '出租':{reg:{action:'core:trade.rent_out',slots:{seller:cp,business:S.entity,...(S.resource?{item:S.resource}:{}),days:1}},fx:[[{op:'holding.open',kind:'leases',holder:cp,subject:S.entity,terms:{rent:1},grantedBy:'player'},{op:'obligation.create',kind:'rent',debtor:cp,creditor:'player',terms:{subject:S.entity,amount:1}}]]},
    '抵押':{reg:S.resource?{action:'core:trade.borrow',slots:{seller:KEEPER,coins:5,item:S.resource,quantity:1,days:10},moveTo:BANK_AT}:null,fx:[[{op:'holding.open',kind:'pledged',holder:`loan:${S.entity}`,subject:S.entity},{op:'obligation.create',kind:'loan',debtor:'player',creditor:cp,terms:{amount:5,pledge:S.entity}}]]},
    '典当':{reg:S.resource?{action:'core:trade.pawn',slots:{seller:KEEPER,item:S.resource,quantity:1},moveTo:BANK_AT}:null,fx:[[{op:'holding.open',kind:'pledged',holder:`pawn:${S.entity}`,subject:S.entity},{op:'obligation.create',kind:'loan',debtor:'player',creditor:cp,terms:{amount:5,pledge:S.entity,form:'pawn'}}]]},
    '遗赠':{fx:[[{op:'holding.transfer',holding:own,newHolder:cp,terms:{when:'holder_gone'}}]]},
    '换物':{fx:[[give(S,cp),{op:'transfer',from:acct(cp,firstOther),to:acct('player',firstOther),qty:1}]]},
    '抵债':{fx:[[give(S,cp),{op:'obligation.settle',id:`loan:${S.entity}`,amount:1}]]},
  };
  return P[id];
}
// —— 试一次（必要时换参数形状、检定失败重掷） ——
const intendedOps=effects=>new Set(effects.map(e=>e.op));
async function tryProposal(ctx,intent,effects){
  for(let roll=0;roll<5;roll++){
    const r=await propose(ctx,intent,effects,{},{commit:false});
    if(r.status==='rejected')return {ok:false,via:'world_propose',reason:r.reason,code:r.code};
    // 落地的效果必须是原方案的那一条：同一原语、同一对象（引擎可能把目标换成别人，例如对痕迹的 vital 落到玩家自己身上）。
    const KEYS=['target','entity','subject','holding','from','to','kind','id'];
    const hit=effects.filter(e=>r.appliedFull.some(a=>a.op===e.op&&KEYS.every(k=>e[k]===undefined||a[k]===undefined||a[k]===e[k])));
    if(hit.length)return {ok:true,via:r.routed?`world_propose→${r.routed}`:'world_propose',applied:r.applied};
    if(r.appliedFull.some(a=>effects.some(e=>e.op===a.op)))return {ok:false,via:'world_propose',reason:`提交了，但效果落到了别的对象上：${JSON.stringify(r.appliedFull.map(a=>({op:a.op,target:a.target??a.entity??a.subject})))}`,code:'MISDIRECTED'};
    const failed=r.trimmed.filter(t=>t.reason==='check_failed');
    if(!failed.length)return {ok:false,via:'world_propose',reason:`提交但效果被裁掉：${r.trimmed.map(t=>`${t.op}:${t.reason}`).join('，')||'无效果落地'}`,code:'TRIMMED'};
  }
  return {ok:false,via:'world_propose',reason:'提交但检定 5 次都未过，效果一次也没落地',code:'CHECK_FAILED'};
}
async function tryRegistered(ctx,reg){
  let c=ctx;
  if(reg.moveTo&&ctx.doc.state.location!==reg.moveTo){c=fork(ctx,'mv');const m=await act(c,'core:move',{destination:reg.moveTo});if(m.status==='rejected')return {ok:false,via:reg.action,reason:`去${reg.moveTo}：${m.reason}`};}
  const r=await act(c,reg.action,reg.slots,{commit:false});
  if(r.status==='committed'&&r.applied.length)return {ok:true,via:`world_act ${reg.action}`,applied:r.applied};
  return {ok:false,via:`world_act ${reg.action}`,reason:r.status==='committed'?'提交但没有任何效果落地':r.reason,code:r.code};
}
async function tryCell(ctx,row,col,S,cp){
  const intent=`${row.label}：${col.label}（自有）`;
  let plans;
  if(col.family==='primitive')plans={fx:primitiveEffects(col.op,S,ctx.doc,cp)};
  else if(col.family==='holding')plans={fx:holdingEffects(col.op,col.kind,S,ctx.doc,cp)};
  else if(col.family==='obligation')plans={fx:obligationEffects(col.op,col.kind,S,ctx.doc,cp)};
  else plans=aliasPlan(col.alias.id,S,ctx.doc,cp);
  const tries=[];
  if(plans.reg){const t=await tryRegistered(ctx,plans.reg);tries.push(t);if(t.ok)return {ok:true,via:t.via,tries};}
  for(const fx of plans.fx){const t=await tryProposal(ctx,intent,fx);t.effects=fx;tries.push(t);if(t.ok)return {ok:true,via:t.via,checkOnly:t.checkOnly,tries};}
  return {ok:false,tries,reason:tries.map(t=>t.reason).filter(Boolean)[0]??'无结果',via:tries.map(t=>t.via).join(' / ')};
}
// —— 期望（K7 交付后） ——
const FLIP=new Set(['destroy','transfer','vital','alias:宰杀','alias:毁坏','alias:送','alias:卖','alias:分群','alias:个体化']);
const FLIP_ITEMS=new Set(['alias:丢弃']),ITEM_ROWS=new Set(['stock','instance','document']);
const DESIGN_ALSO=new Set(['holding.transfer:owns','holding.close:owns']);
function missingLaw(col){
  if(col.family==='holding')return '持有族的来源派生（设计稿 3.1，通用门卡 2）';
  if(col.family==='obligation')return '义务族的来源派生（设计稿 3.2，通用门卡 2）';
  const m={create:'按配方制造与创建路由（设计稿 3.5，卡 4）',move:'搬动他物（设计稿 3.4，卡 3）',status:'束缚与状态（设计稿 3.4，卡 3）',transition:'transition 只由协议与判决开立（设计稿 3.3.4，真实限制）','fact.set':'改写事实/修理（设计稿 3.3.1 材质表，卡 3）',
    'alias:出租':'出租：holding.open(租赁)+租金义务（卡 2）','alias:抵押':'质押+借贷（卡 2）','alias:典当':'质押+借贷（卡 2）','alias:繁育':'自有活体繁育、出生归属（src:birth，未排卡）','alias:挤奶剪毛':'畜牧活体产出 husbandry.collect（S5，master 未合入）',
    'alias:合群':'个体并回种群（设计稿 3.3.2 反向，本批只留接口）','alias:修理':'维修工序（卡 4 配方路由）','alias:改装':'缺：配方路由（通用门卡 4），不在 K7 期望','alias:种植':'自有田地的取得（农事认领）','alias:采收':'自有作物/林木的取得与采收','alias:砍伐':'R8 采集通用规律',
    'alias:遗赠':'生前指定继承（未设计）','alias:换物':'以物易物（义务族+交易，卡 2）','alias:抵债':'以物抵债（transfer+settle 同事务，卡 2）','alias:放生':'自有活体的取得（pet.release 已有）','alias:丢弃':'弃权 holding.close(所有)（设计稿 4.1）'};
  return m[col.id]??m[col.op]??'未归类';
}
function expectOf(row,col,cell,acquired){
  if(cell.status==='不适用')return {expected:'不适用',reason:cell.reason};
  const flip=FLIP.has(col.id)||(FLIP_ITEMS.has(col.id)&&ITEM_ROWS.has(row.id));
  if(flip)return {expected:'通',from:cell.status,k7:true,...(acquired?{}:{blockedBy:`缺：取得路径——取不到自有「${row.label}」（K2/K1，不在 K7 期望）`})};
  return {expected:cell.status,keep:true,...(cell.status==='缺'?{missingLaw:missingLaw(col)}:{}),...(DESIGN_ALSO.has(col.id)?{note:'设计稿 4.1 也把它列为所有者缺省可行，卡未列入期望'}:{})};
}
// —— 主流程 ——
const rows=ROWS.filter(r=>!only||only.includes(r.id));
const result={generatedAt:new Date().toISOString(),repo:REPO,branch,commit,derivation:{},rows:[],columns:COLUMNS.map(c=>({id:c.id,label:c.label,family:c.family,op:c.op??null,kind:c.kind??null,maps:c.alias?.maps??null,registered:c.alias?.registered??null})),cells:{}};
const expected={commit,rule:'K7 交付后应从"缺"变"通"的只有：主人对自有物的 destroy、transfer、vital（宰杀）、种群分群与个体化；加验收要求的卖、送、毁坏（各行）与丢弃（物品行）；改装只在有现成配方路径时期望通，否则为『缺：配方路由（通用门卡 4）』，不在 K7 期望。取不到自有实例的行标 blockedBy『缺：取得路径（K2/K1）』，不计入 K7 期望。其余格保持 master 原样。',cells:{}};
const base=newGame('k7m');
result.derivation={ownableTemplates:ownableTemplates.map(t=>t.id),excludedTemplates,propertyHoldingKinds:propertyHoldingKinds.map(h=>h.id),propertyObligationKinds:propertyObligationKinds.map(o=>o.id),ownerPrimitives:OWNER_PRIMITIVES,aliases:ALIASES.map(a=>a.id),census:census(base.doc),
  rules:{holdingKinds:'subjectKinds 含 thing/population/instrument，或 transferable，或 handover.gone=estate',obligationKinds:'onCreditorGone=estate（债权本身是财产）',templates:'entity-templates 中 subject:true 且为上述持有种类之标的者；person 例外排除（owns 注：creature 标的须物种 ownable 且未被承认人格）'}};
const t0=Date.now();
for(const row of rows){
  const ctx=newGame(`k7m-${row.id}`);
  const got=await row.acquire(ctx);
  let S=got.subject,acquired=!!S,refNote=null;
  if(!S&&row.ref){const ref=await row.ref(ctx);if(ref){if(ref.moveTo&&ctx.doc.state.location!==ref.moveTo)await act(ctx,'core:move',{destination:ref.moveTo});S=ref;refNote=`对照实例 ${ref.entity}（${ref.owner?`属 ${ref.owner}`:'无主'}），不是自有`;}}
  const cp=presentNpcs(ctx.doc)[0]??'npc_hw_duanyan';
  result.rows.push({id:row.id,label:row.label,template:row.template,kind:row.kind,from:row.from,acquired,subject:got.subject??null,reference:acquired?null:S,attempts:got.attempts,counterparty:cp,location:ctx.doc.state.location});
  const cells=result.cells[row.id]={};
  for(const col of COLUMNS){
    const na=col.na(row);
    let cell;
    if(!S){cell=na?{status:'不适用',reason:na,tried:false}:{status:'缺',reason:`无自有实例，也无对照实例：${got.attempts.join('；')}`,tried:false};}
    else{
      const t=await tryCell(ctx,row,col,S,cp);
      const engine={ok:t.ok,via:t.via,reason:t.ok?null:t.reason,checkOnly:t.checkOnly||undefined};
      if(na)cell={status:'不适用',reason:na,tried:true,engine,...(t.ok&&acquired?{anomaly:'引擎放行了本体判为不适用的格'}:{})};
      else if(!acquired)cell={status:'缺',reason:`无自有实例（${got.attempts.join('；')}）`,tried:true,ref:{note:refNote,...engine}};
      else cell=t.ok?{status:'通',via:t.via,tried:true,...(t.checkOnly?{note:'检定三次未过，但来源已成立'}:{})}:{status:'缺',reason:t.reason,via:t.via,tried:true};
    }
    cells[col.id]=cell;
    (expected.cells[row.id]??={})[col.id]=expectOf(row,col,cell,acquired);
  }
  const n=Object.values(cells).reduce((m,c)=>(m[c.status]=(m[c.status]??0)+1,m),{});
  console.log(`[${((Date.now()-t0)/1000).toFixed(0)}s] ${row.id} ${row.label} acquired=${acquired}`,JSON.stringify(n));
}
// —— 计数与输出 ——
const all=Object.values(result.cells).flatMap(r=>Object.values(r));
const count=list=>list.reduce((m,c)=>(m[c.status]=(m[c.status]??0)+1,m),{});
result.counts={rows:result.rows.length,columns:COLUMNS.length,cells:all.length,byStatus:count(all),tried:all.filter(c=>c.tried).length,anomalies:all.filter(c=>c.anomaly).length,
  columnsByFamily:COLUMNS.reduce((m,c)=>(m[c.family]=(m[c.family]??0)+1,m),{})};
const ex=Object.values(expected.cells).flatMap(r=>Object.values(r));
expected.counts={cells:ex.length,toFlip:ex.filter(e=>e.k7).length,toFlipBlockedByAcquisition:ex.filter(e=>e.k7&&e.blockedBy).length,alreadyPass:ex.filter(e=>e.k7&&e.from==='通').length,keep:ex.filter(e=>e.keep).length,byExpected:ex.reduce((m,e)=>(m[e.expected]=(m[e.expected]??0)+1,m),{})};
await fs.writeFile(OUT+'matrix.json',JSON.stringify(result,null,1));
await fs.writeFile(OUT+'expected.json',JSON.stringify(expected,null,1));
// matrix.md：总表（符号）+ 每行明细
const sym={'通':'✓','缺':'✗','不适用':'—'};
const fam=[['primitive','原语'],['holding','持有族'],['obligation','义务族'],['alias','日常动词']];
let md=`# K7 处分矩阵（${branch}@${commit}，${REPO}）\n\n生成：${result.generatedAt}。行 ${result.counts.rows}，列 ${result.counts.columns}，格 ${result.counts.cells}。\n\n`;
md+=`| 状态 | 格数 |\n|---|---|\n${Object.entries(result.counts.byStatus).map(([k,v])=>`| ${k} | ${v} |`).join('\n')}\n\n实际调用引擎试过的格：${result.counts.tried}；引擎放行而本体判不适用的异常格：${result.counts.anomalies}。\n\n`;
md+=`## 行（取得情况）\n\n| 行 | 模板/kind | 取得自有实例 | 取得尝试 |\n|---|---|---|---|\n${result.rows.map(r=>`| ${r.label} | ${r.template}/${r.kind} | ${r.acquired?'是':'否'+(r.reference?`（对照 ${r.reference.entity}）`:'')} | ${r.attempts.join('；').replace(/\|/g,'/')} |`).join('\n')}\n\n`;
for(const [f,name] of fam){
  const cols=COLUMNS.filter(c=>c.family===f);
  md+=`## 总表：${name}（${cols.length} 列）\n\n✓通 ✗缺 —不适用；列号见下方图例。\n\n| 行 | ${cols.map((c,i)=>i+1).join(' | ')} |\n|---|${cols.map(()=>'---').join('|')}|\n`;
  for(const r of result.rows)md+=`| ${r.label} | ${cols.map(c=>sym[result.cells[r.id][c.id].status]).join(' | ')} |\n`;
  md+=`\n图例：${cols.map((c,i)=>`${i+1}=${c.label}`).join('；')}\n\n`;
}
md+=`## 每行明细（通走的动作 / 缺的原样拒绝 / 不适用的理由）\n\n`;
for(const r of result.rows){
  md+=`### ${r.label}\n\n| 列 | 状态 | 说明 |\n|---|---|---|\n`;
  for(const c of COLUMNS){const x=result.cells[r.id][c.id];const say=(x.status==='通'?x.via:x.reason)+(x.ref?` ｜对照：${x.ref.ok?'通 '+x.ref.via:x.ref.reason}`:'')+(x.engine&&x.status==='不适用'?` ｜引擎：${x.engine.ok?'放行 '+x.engine.via:x.engine.reason}`:'');md+=`| ${c.label} | ${x.status} | ${String(say).replace(/\|/g,'/').replace(/\n/g,' ')} |\n`;}
  md+='\n';
}
await fs.writeFile(OUT+'matrix.md',md);
console.log(JSON.stringify(result.counts),JSON.stringify(expected.counts));
