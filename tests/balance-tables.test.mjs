// S1 数值参数表：22 个文件的形状、加载期校验（界内、必填、来源类别、可推算重算）、包只能在界内覆盖、目标表。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {TABLE_NAMES,BASES,loadBalanceTablesSync,validateBalanceTables,applyBalanceOverrides,recomputeDerived,indexBalanceTables,balanceValue,parameterHash,summarizeBalanceTables,BALANCE_DIR} from '../tools/balance-tables.mjs';

const loaded=loadBalanceTablesSync(),tables=loaded.tables;
const copy=()=>structuredClone(tables);
const errorsOf=t=>validateBalanceTables(t);
const find=(t,name,id)=>t[name].params.find(p=>p.id===id);

test('数值方案 §2.1 的 22 个文件齐全，随 world 加载且校验通过',async()=>{
 assert.equal(TABLE_NAMES.length,22);
 assert.deepEqual(loaded.errors,[]);
 assert.deepEqual(Object.keys(tables).sort(),[...TABLE_NAMES].sort());
 for(const name of TABLE_NAMES){
  const doc=tables[name];
  assert.equal(doc.schema,`balance/${name}@1`);
  for(const area of ['params','rows','curves'])assert.ok(Array.isArray(doc[area]),`${name}.${area} 三区都在（可空）`);
 }
 const world=await loadWorld();
 assert.deepEqual(Object.keys(world.balance).sort(),[...TABLE_NAMES].sort());
 assert.equal(Object.keys(world).includes('balance'),false,'不进可枚举键：世界的序列化形式与哈希不变');
 assert.equal(JSON.stringify(world).includes('xp.time.H20'),false);
});

test('每个条目都带来源类别、出处、界与待标定标注；硬设定封闭；玩法决定带决定记录',()=>{
 let entries=0;
 for(const [name,doc] of Object.entries(tables)){
  if(name==='targets')continue;
  for(const e of [...doc.params,...doc.rows,...doc.curves]){
   entries++;
   const id=e.id??e.key;
   assert.ok(BASES.includes(e.basis),`${name}/${id} 来源类别`);
   assert.ok(typeof e.source==='string'&&e.source.length>0,`${name}/${id} 出处`);
   const payload=e.points??e.saturation??e.value??Object.fromEntries(Object.entries(e).filter(([k])=>!['key','id','basis','source','note','bounds','closed','playDecision','decisionRef','calibration','from','formula','output','tolerance','unit'].includes(k)));
   if(/-?\d/.test(JSON.stringify(payload)))assert.ok(e.bounds&&(Array.isArray(e.bounds)||Object.keys(e.bounds).length),`${name}/${id} 含数值的条目带上下界`);
   if(e.basis==='hard'){assert.equal(e.closed,true,`${name}/${id} 硬设定封闭`);assert.equal(e.calibration,'fixed');}
   if(e.basis==='calibrate')assert.equal(e.calibration,'pending',`${name}/${id} 待标定`);
   if(e.basis==='play'){assert.equal(e.playDecision,true);assert.match(e.decisionRef,/^docs\/待用户确认\.md 2026-10-16/);}
   if(e.basis==='derived')assert.ok(e.from.length,`${name}/${id} 可推算带上游`);
  }
 }
 assert.ok(entries>250,`条目数 ${entries}`);
 const summary=summarizeBalanceTables(tables);
 for(const basis of BASES)assert.ok(Object.values(summary).some(s=>s.byBasis[basis]>0),`每类来源都有条目：${basis}`);
});

test('与现行规则表一致的硬设定：收入表八阶、无技能工钱、每日上限、阶宽、技能加值除数',async()=>{
 const rules=(await loadWorld()).rules;
 const bands=rules.economy.dailyIncomeBySkillStage.slice(0,8);
 bands.forEach(([lo,hi],i)=>{const row=tables.yields.rows.find(r=>r.selector===`skill:*@${['初级','中级','高级','特级','专家','大师','宗师','圣级'][i]}`&&r.perUnit);assert.deepEqual([row.bandLow,row.bandHigh],[lo,hi]);assert.deepEqual(row.bounds['perUnit.qty'],[lo,hi]);assert.ok(row.perUnit.qty>=lo&&row.perUnit.qty<=hi);});
 const labor=tables.yields.rows.find(r=>r.key==='labor:unskilled');
 assert.deepEqual([labor.halfDayLow,labor.halfDayHigh],rules.economy.wageCopperPerHalfDay);
 assert.deepEqual(tables.learning.rows.find(r=>r.key==='skill:*/dailyCap').dailyCap,rules.practice.dailyCaps);
 assert.deepEqual(tables.learning.rows.find(r=>r.key==='skill:*/tierThresholds').tierThresholds.map(n=>n-300),[0,300,600,900,1200,1500,1800,2100,2400]);
 assert.equal(rules.practice.stageSize,300);
 assert.equal(find(tables,'learning','skill.bonus.divisor').value,rules.check.skillDivisor);
});

test('可推算行：阶对照表与日经验参照由 H20、a 重算一致；上游改值后刷新',()=>{
 assert.deepEqual(errorsOf(tables),[]);
 const t=copy();
 const before=find(t,'progression','xp.dailyRef.coef').value;
 find(t,'progression','xp.time.H20').value=90;
 const e=errorsOf(t);
 assert.ok(e.some(x=>/params\[xp\.dailyRef\.coef\].*不一致/.test(x)),'上游变了而可推算值没跟着变：报错并指出字段');
 assert.ok(e.some(x=>/rows\[tier:4\].*不一致/.test(x)));
 assert.ok(recomputeDerived(t)>0);
 assert.deepEqual(errorsOf(t),[]);
 assert.ok(find(t,'progression','xp.dailyRef.coef').value<before);
 const tier4=t.progression.rows.find(r=>r.key==='tier:4');
 assert.ok(Math.abs(tier4.fullTimeDays-90*(55/20)**2.5)<1e-6);
 // 数值方案 §0.3 的阶对照表（约值）：20 级 60 日，30 级约 5.5 个月，100 级约 9.3 年
 const h=L=>60*(L/20)**2.5;
 assert.equal(Math.round(h(30)),165);assert.equal(Math.round(h(100)),3354);
});

test('校验指出文件与字段：越界、缺出处、非法来源类别、缺决定记录、硬设定未封闭、主键重复、重复 id',()=>{
 let t=copy();find(t,'progression','xp.time.a').value=3;
 assert.ok(errorsOf(t).includes('rules/tables/balance/progression.json: params[xp.time.a]: =3 超出界 [2.3, 2.7]'.replace('=3','=3')),errorsOf(t).join('\n'));
 t=copy();delete find(t,'tax','land.rate').source;
 assert.ok(errorsOf(t).some(x=>x.startsWith('rules/tables/balance/tax.json: params[land.rate]')&&/source/.test(x)));
 t=copy();find(t,'tax','market.rate').basis='guess';
 assert.ok(errorsOf(t).some(x=>x.startsWith('rules/tables/balance/tax.json: params[market.rate] .basis')||/market\.rate.*basis/.test(x)));
 t=copy();delete find(t,'progression','xp.time.H20').decisionRef;
 assert.ok(errorsOf(t).some(x=>/params\[xp\.time\.H20\].*decisionRef/.test(x)));
 t=copy();delete find(t,'progression','xp.required.highPow').closed;
 assert.ok(errorsOf(t).some(x=>/params\[xp\.required\.highPow\].*closed/.test(x)));
 t=copy();t.yields.rows.push(structuredClone(t.yields.rows[0]));
 assert.ok(errorsOf(t).some(x=>/yields\.json: rows\[skill:\*@初级\] 主键重复/.test(x)));
 t=copy();t.tax.params.push({...structuredClone(find(t,'tax','land.rate')),id:'hp.base'});
 assert.ok(errorsOf(t).some(x=>/tax\.json: params\[hp\.base\].*combat\.json.*冲突/.test(x)));
 t=copy();t.yields.rows.find(r=>r.key==='skill:*@宗师/workDays').workDaysPerYear=999;
 assert.ok(errorsOf(t).some(x=>/rows\[skill:\*@宗师\/workDays\].*workDaysPerYear=999 超出界 \[60, 180\]/.test(x)));
 t=copy();t.learning.rows.find(r=>r.key==='skill:*/perHour').perHour.work=9;
 assert.ok(errorsOf(t).some(x=>/learning\.json: rows\[skill:\*\/perHour\].*perHour\.work=9 超出界 \[0\.5, 3\]/.test(x)));
});

test('校验：缺上下界、界对不上字段、曲线 x 不递增或 y 越界、饱和参数越界、未知公式、未知字段、未登记文件',()=>{
 let t=copy();delete find(t,'combat','armor.k').bounds;
 assert.ok(errorsOf(t).some(x=>/params\[armor\.k\]/.test(x)));
 t=copy();t.combat.params.find(p=>p.id==='morale').bounds.nothing=[0,1];
 assert.ok(errorsOf(t).some(x=>/morale.*bounds\.nothing.*对应不到/.test(x)));
 t=copy();t.attributes.curves[0].points.push([5,0]);
 assert.ok(errorsOf(t).some(x=>/curves\[attr\.mod\].*x 必须严格递增/.test(x)));
 t=copy();t.attributes.curves[0].points[2][1]=50;
 assert.ok(errorsOf(t).some(x=>/curves\[attr\.mod\].*y 超出界/.test(x)));
 t=copy();t.progression.curves.find(c=>c.id==='xp.repeat').saturation.q=0.9;
 assert.ok(errorsOf(t).some(x=>/curves\[xp\.repeat\].*saturation\.q=0\.9 超出界/.test(x)));
 t=copy();find(t,'progression','xp.dailyRef.coef').formula='nope';
 assert.ok(errorsOf(t).some(x=>/未登记的重算公式：nope/.test(x)));
 t=copy();find(t,'tax','land.rate').typo=1;
 assert.ok(errorsOf(t).some(x=>/params\[land\.rate\] 未知字段 typo/.test(x)));
 t=copy();t.extra=structuredClone(t.tax);
 assert.ok(errorsOf(t).some(x=>/extra\.json: 未登记的参数表/.test(x)));
 t=copy();delete t.pace;
 assert.ok(errorsOf(t).some(x=>/pace\.json: 缺少参数表/.test(x)));
});

test('随 world 加载：坏表让加载失败并指出文件与字段；不带参数表的世界照常加载',async()=>{
 const dir=fs.mkdtempSync(path.join(tmpRoot(),'balance-'));
 try{
  const root=path.join(dir,'world');
  fs.cpSync(path.resolve(import.meta.dirname,'..','world','rules'),path.join(root,'rules'),{recursive:true});
  const file=path.join(root,BALANCE_DIR,'tax.json'),doc=JSON.parse(fs.readFileSync(file,'utf8'));
  doc.params.find(p=>p.id==='market.rate').value=0.5;fs.writeFileSync(file,JSON.stringify(doc));
  const bad=loadBalanceTablesSync(root);
  assert.ok(bad.errors.some(x=>/tax\.json: params\[market\.rate\]: =0\.5 超出界 \[0\.01, 0\.05\]/.test(x)),bad.errors.join('\n'));
  const empty=path.join(dir,'none');fs.mkdirSync(empty);
  assert.deepEqual(loadBalanceTablesSync(empty),{tables:{},errors:[],files:[],present:false});
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('包只能在上下界内覆盖：界内可改并刷新可推算值；越界、改界、封闭、可推算、玩法决定缺记录都被拒绝',()=>{
 const ok=applyBalanceOverrides(tables,[{table:'combat',id:'armor.k',value:6},{table:'learning',key:'skill:*/perHour',field:'perHour.work',value:2.0},{table:'progression',id:'xp.time.H20',value:80,decisionRef:'docs/决策.md 示例'}],{pack:'demo'});
 assert.deepEqual(ok.errors,[]);
 assert.equal(balanceValue(ok.tables,'armor.k'),6);
 assert.equal(ok.tables.learning.rows.find(r=>r.key==='skill:*/perHour').perHour.work,2.0);
 assert.equal(balanceValue(tables,'armor.k'),5,'原表不变');
 assert.ok(Math.abs(balanceValue(ok.tables,'xp.dailyRef.coef')-20**2.5/(10*80*2.5))<1e-9,'可推算值随上游刷新');
 assert.notEqual(parameterHash(ok.tables),parameterHash(tables));
 const reject=(o,re)=>{const r=applyBalanceOverrides(tables,[o],{pack:'demo'});assert.ok(r.errors.some(x=>re.test(x)),`${JSON.stringify(o)} → ${r.errors.join('|')}`);assert.equal(parameterHash(r.tables),parameterHash(tables));};
 reject({table:'combat',id:'armor.k',value:11},/armor\.k.*11 超出界 \[3, 10\]/);
 reject({table:'combat',id:'armor.k',value:6,bounds:[1,99]},/不能改 bounds/);
 reject({table:'progression',id:'xp.required.highPow',value:5},/closed.*硬设定.*不能改值/);
 reject({table:'progression',id:'xp.dailyRef.coef',value:1.3},/可推算条目由上游重算/);
 reject({table:'progression',id:'xp.time.H20',value:80},/玩法决定条目改值必须带决定记录/);
 reject({table:'combat',id:'no.such',value:1},/找不到该条目/);
 reject({table:'learning',key:'skill:*/perHour',field:'perHour.work',value:3.5},/perHour\.work.*3\.5 超出界 \[0\.5, 3\]/);
 reject({table:'learning',key:'skill:*/uncertifiedCap',field:'cap',value:300},/closed/);
 reject({table:'targets',key:'NUM-W1',field:'x',value:1},/目标表不接受包覆盖/);
});

test('目标表：全部 NUM-* 与 BAL-*，带目标区间、容差、标杆编号、检验方法，附 schema',()=>{
 const rows=tables.targets.rows,ids=rows.map(r=>r.metric);
 const expected=[...['G1','G2','G3','G4','G5','G6'],...['S1','S2','S3','S4'],...['P1','P2','P3','P4','P5'],...['W1','W2','W3','W4','W5','W6','W7','W8','W9','W10'],...['Q1','Q2','Q3','Q4','Q5','Q6'],...['D1','D2','D3','D4','D5'],...['Z1','Z2','Z3','Z4','Z5','Z6','Z7'],...['J1','J2','J3','J4','J5','J6']].map(s=>`NUM-${s}`);
 for(const id of expected)assert.ok(ids.includes(id),`缺 ${id}`);
 assert.equal(ids.filter(i=>i.startsWith('NUM-')).length,49);
 assert.equal(new Set(ids).size,ids.length);
 for(const r of rows){
  assert.ok(['G','T'].includes(r.grade));assert.ok(r.method.length>=3);assert.ok(r.source&&r.basis);
  if(r.metric.startsWith('NUM-')&&r.metric!=='NUM-D4')assert.ok(r.benchmarks.length,`${r.metric} 对应标杆编号`);
  if(r.kind==='range')assert.ok(Array.isArray(r.target));
 }
 const byId=Object.fromEntries(rows.map(r=>[r.metric,r]));
 assert.deepEqual(byId['NUM-W1'].target,[20,80]);assert.equal(byId['NUM-W1'].hardFloor,10);
 assert.deepEqual(byId['NUM-G3'].target,[2,5]);assert.deepEqual(byId['NUM-G4'].target,[20,50]);
 assert.deepEqual(byId['NUM-G1'].tolerance,{kind:'rel',value:0.3});
 assert.equal(byId['NUM-Z1'].pace.length,5);
 assert.equal(byId['NUM-P1'].grade,'G');
 assert.deepEqual(byId['NUM-D5'].target,[0.25,0.4]);
 assert.equal(byId['NUM-W10'].bands.length,11);
 assert.equal(find(tables,'learning','seats.saint.perSkill').value,2);assert.deepEqual(find(tables,'learning','seats.saint.perSkill').bounds,[2,3]);
 // 越界/缺字段的目标行被拒绝
 const t=copy();t.targets.rows[0].grade='X';
 assert.ok(errorsOf(t).some(x=>/targets\.json: rows\[NUM-G1\]/.test(x)));
 const u=copy();u.targets.rows.find(r=>r.metric==='NUM-G2').target=[3,1];
 assert.ok(errorsOf(u).some(x=>/rows\[NUM-G2\].*下界 ≤ 上界/.test(x)));
 const v=copy();v.targets.rows.push(structuredClone(v.targets.rows[0]));
 assert.ok(errorsOf(v).some(x=>/rows\[NUM-G1\]: metric 重复/.test(x)));
 assert.ok(fs.existsSync(new URL('../schemas/balance-targets.schema.json',import.meta.url))&&fs.existsSync(new URL('../schemas/balance-table.schema.json',import.meta.url)));
});

test('索引与参数哈希稳定',()=>{
 const index=indexBalanceTables(tables);
 assert.equal(index.get('hp.base').table,'combat');assert.equal(index.get('tier:4')?.kind,undefined);
 assert.equal(index.get('progression/tier:4').kind,'row');
 assert.equal(parameterHash(tables),parameterHash(copy()));
});
