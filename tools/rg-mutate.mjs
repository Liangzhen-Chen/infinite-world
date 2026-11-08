// Mutation check for server-plugin/renewable.mjs against tests/rg-renewable.test.mjs.
// Mutants target server-plugin/renewable.mjs, plus the pure logisticStock function of server-plugin/stock.mjs (patches with a fifth field 'stock').
// Read-only: every mutant is built in memory and written under the system temp directory (the module copy and a copy of the test file whose
// relative imports are rewritten to absolute file URLs); nothing in the repository is touched. Each mutant runs `node --test` on its temp copy.
//
//   node tools/rg-mutate.mjs [jobs=N] [only=3,17,40-75] [list]     (`--jobs N`, `--only ...`, `--list` also work)
//
// Output, one line per mutant: number, KILLED / SURVIVED / EQUIVALENT (expected survivor, with its reason) / INVALID / PATCH-MISS / TIMEOUT,
// the patch note and, for killed mutants, the first failing test. Exit code 0 only when every non-equivalent mutant is killed and the
// unmutated module passes. Intended to run in the cloud (tests run there, not locally).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const root=path.resolve(import.meta.dirname,'..');
const rootUrl=pathToFileURL(root).href+'/';
const moduleFile=path.join(root,'server-plugin/renewable.mjs'),testFile=path.join(root,'tests/rg-renewable.test.mjs');
const original=fs.readFileSync(moduleFile,'utf8'),testSource=fs.readFileSync(testFile,'utf8');
// logisticStock is pure: mutants of it are built as a small stand-alone module (the real stock.mjs registers ledger hooks and must not be loaded twice)
const stockFile=path.join(root,'server-plugin/stock.mjs'),stockText=fs.readFileSync(stockFile,'utf8');
const stockStart=stockText.indexOf('export function logisticStock('),stockEnd=stockText.indexOf('\n}\n',stockStart)+3;
const stockFunction=stockText.slice(stockStart,stockEnd);
// only= takes numbers and ranges (only=1-77 then only=78-155 splits a run in two); options are written `--jobs 4` or, because the gate refuses script arguments that start with a dash, `jobs=4`
const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name),bare=args.find(x=>x.startsWith(name.slice(2)+'='));return i>=0?args[i+1]:bare?bare.slice(name.length-1):null;};
const JOBS=Number(option('--jobs'))||4,ONLY=option('--only')?new Set(option('--only').split(',').flatMap(x=>{const [a,b=a]=x.split('-').map(Number);return Array.from({length:b-a+1},(_,k)=>a+k);})):null,TIMEOUT_MS=15*60*1000;

// [note, from, to, equivalent-reason?]   `from` must occur exactly once in the module source
const PATCHES=[
 // num / baseRate / capacityOf / restartOf
 ['num never rejects','if(!Number.isFinite(v))fail(','if(false)fail('],
 ['num rejects the finite values','if(!Number.isFinite(v))fail(','if(Number.isFinite(v))fail('],
 ['rate and maturity both given: no error','if(hasRate&&hasSpan)fail(','if(false)fail('],
 ['rate or maturity given: error','if(hasRate&&hasSpan)fail(','if(hasRate||hasSpan)fail('],
 ['ratePerDay 0 accepted','props.ratePerDay>0)return','props.ratePerDay>=0)return'],
 ['maturityDays 0 accepted','props.maturityDays>0)return','props.maturityDays>=0)return'],
 ['ratePerDay not checked finite','hasRate&&Number.isFinite(props.ratePerDay)&&','hasRate&&'],
 ['maturityDays not checked finite','hasSpan&&Number.isFinite(props.maturityDays)&&','hasSpan&&'],
 ['rate from maturity: multiply instead of divide','LOGISTIC_SPAN/props.maturityDays','LOGISTIC_SPAN*props.maturityDays'],
 ['span constant ln19 instead of ln361','ln(361)','ln(19)'],
 ['span from platform Math.log','ln(361)','Math.log(361)'],
 ['hasRate ignores null','props?.ratePerDay!==null&&props?.ratePerDay!==undefined','props?.ratePerDay!==undefined'],
 ['hasSpan ignores null','props?.maturityDays!==null&&props?.maturityDays!==undefined','props?.maturityDays!==undefined'],
 ['capacity rounds up','Math.floor(num(areaKm2','Math.ceil(num(areaKm2'],
 ['capacity divides by standing stock','*num(props?.standingPerKm2','/num(props?.standingPerKm2'],
 ['area not checked','num(areaKm2,\'areaKm2\')','areaKm2'],
 ['standing stock not checked','num(props?.standingPerKm2,\'standingPerKm2\')','props?.standingPerKm2'],
 ['restartUnits 0 accepted','props.restartUnits<1)fail','props.restartUnits<0)fail'],
 ['restartUnits integer check dropped','!Number.isSafeInteger(props?.restartUnits)||',''],
 ['restartUnits 1 rejected','props.restartUnits<1)fail','props.restartUnits<2)fail'],
 // breedingLoss
 ['regrowFrom not validated','if(![\'root\',\'seed\'].includes(props.regrowFrom))fail(','if(false)fail('],
 ['harvest effect not validated','if(![\'root\',\'shoot\',\'none\'].includes(method?.kills))fail(','if(false)fail('],
 ['effect none no longer allowed','[\'root\',\'shoot\',\'none\']','[\'root\',\'shoot\']'],
 ['seed season: <= instead of <','season<num(props.seedSeason,\'seedSeason\')','season<=num(props.seedSeason,\'seedSeason\')'],
 ['seed season: > instead of <','season<num(props.seedSeason,\'seedSeason\')','season>num(props.seedSeason,\'seedSeason\')'],
 ['before-seed test ignores regrowFrom','before=seeds&&season<num(','before=season<num('],
 ['seedSeason not checked','season<num(props.seedSeason,\'seedSeason\')','season<props.seedSeason'],
 ['root pull: any seed species loses nothing','return seeds&&!before?0:1;','return seeds?0:1;'],
 ['root pull: loss only before the seed season','return seeds&&!before?0:1;','return !before?0:1;'],
 ['root pull: inverted','return seeds&&!before?0:1;','return seeds&&!before?1:0;'],
 ['shoot cut: root species loses','return props.regrowFrom===\'root\'?0:before?1:0;','return props.regrowFrom===\'root\'?1:before?1:0;'],
 ['shoot cut: seed species never loses','?0:before?1:0;','?0:0;'],
 ['shoot cut: seed species always loses','?0:before?1:0;','?0:1;'],
 ['none: takesSeed or before','return method.takesSeed&&before?1:0;','return method.takesSeed||before?1:0;'],
 ['none: before only','return method.takesSeed&&before?1:0;','return before?1:0;'],
 ['none: takesSeed only','return method.takesSeed&&before?1:0;','return method.takesSeed?1:0;'],
 ['none: never loses','return method.takesSeed&&before?1:0;','return 0;'],
 ['none: inverted','return method.takesSeed&&before?1:0;','return method.takesSeed&&before?0:1;'],
 // applyHarvest
 ['unknown method not checked','if(!method)fail(','if(false)fail('],
 ['quantity not validated','if(!Number.isSafeInteger(ev.quantity)||ev.quantity<0)fail(','if(false)fail('],
 ['quantity 0 rejected','ev.quantity<0)fail(','ev.quantity<=0)fail('],
 ['quantity integer check dropped','!Number.isSafeInteger(ev.quantity)||',''],
 ['spare function not checked','if(typeof spareOf!==\'function\')fail(','if(false)fail('],
 ['spare lower bound -1','spare<0||spare>1)fail(','spare<-1||spare>1)fail('],
 ['spare upper bound 2','spare<0||spare>1)fail(','spare<0||spare>2)fail('],
 ['spare 0 rejected','spare<0||spare>1)fail(','spare<=0||spare>1)fail('],
 ['spare 1 rejected','spare<0||spare>1)fail(','spare<0||spare>=1)fail('],
 ['spare finiteness not checked','!Number.isFinite(spare)||',''],
 ['harvest season read at day number instead of minute','calendar(ev.day*MINUTES).season','calendar(ev.day).season'],
 ['taken not limited to stock','Math.min(ev.quantity,before)','ev.quantity'],
 ['taken: max instead of min','Math.min(ev.quantity,before)','Math.max(ev.quantity,before)'],
 ['zero take proceeds','if(!taken)return 0;',''],
 ['population without /PPM','population=ctx.capacity*persistence/PPM','population=ctx.capacity*persistence'],
 ['keep = 1+spare','keep=1-spare;','keep=1+spare;'],
 ['keep = spare','keep=1-spare;','keep=spare;'],
 ['branch: taken<=population','if(taken<population){','if(taken<=population){','at taken == population the two branches give the same mathematical loss; their doubles (PPM*loss*keep vs persistence*loss*keep) can differ by one ulp when keep is not binary-exact, which can move the floored loss only when the exact total is an integer, by at most 1 ppm; on keep=0.5, 0.9 and 0.95 the boundary-tie test pins the exact integer loss, in general the difference is at most 1 ppm'],
 ['branch: taken>population','if(taken<population){','if(taken>population){'],
 ['linear branch: periods 1','PPM*loss*keep,taken,ctx.capacity)','PPM*loss*keep,1,ctx.capacity)'],
 ['linear branch: divisor 1','PPM*loss*keep,taken,ctx.capacity)','PPM*loss*keep,taken,1)'],
 ['linear branch: loss dropped','PPM*loss*keep,taken,ctx.capacity)','PPM*keep,taken,ctx.capacity)'],
 ['linear branch: keep dropped','PPM*loss*keep,taken,ctx.capacity)','PPM*loss,taken,ctx.capacity)'],
 ['capped branch: keep dropped','persistence*loss*keep)','persistence*loss)'],
 ['capped branch: loss dropped','persistence*loss*keep)','persistence*keep)'],
 ['capped branch: periods taken','persistence*loss*keep)','persistence*loss*keep,taken)'],
 ['loss not clamped to persistence','persistence-Math.min(persistence,lost)','persistence-lost','the clamp is redundant: the exact loss is below persistence in the linear branch (taken < population) and at most persistence*loss*keep in the capped one, and the accrual carry is below one unit'],
 ['no damage applied','persistence-Math.min(persistence,lost)','persistence'],
 ['visible not reduced by a take','row.visible=before-taken;','row.visible=before;'],
 ['visible increased by a take','row.visible=before-taken;','row.visible=before+taken;'],
 ['applyHarvest returns 0','row.visible=before-taken;\n    return taken;','row.visible=before-taken;\n    return 0;'],
 // settle
 ['no working copy (not atomic)','const row=structuredClone(target);','const row=target;'],
 ['no write-back','Object.assign(target,row);',''],
 ['no key deletion before write-back','for(const key of Object.keys(target))delete target[key];','','the working copy holds every key of the target, so assigning it back leaves nothing stale'],
 ['calendar not checked','if(typeof calendar!==\'function\')fail(','if(false)fail('],
 ['empty interval rejected','||toDay<fromDay)fail(','||toDay<=fromDay)fail('],
 ['fromDay integer check dropped','!Number.isSafeInteger(fromDay)||',''],
 ['toDay integer check dropped','!Number.isSafeInteger(toDay)||',''],
 ['reversed interval accepted','||toDay<fromDay)fail(',')fail('],
 ['visible not validated','if(!Number.isSafeInteger(row.visible)||row.visible<0)fail(','if(false)fail('],
 ['visible 0 rejected','row.visible<0)fail(','row.visible<=0)fail('],
 ['visible integer check dropped','!Number.isSafeInteger(row.visible)||',''],
 ['capacity finiteness not checked','num(capacity,\'capacity\');',''],
 ['capacity 0 accepted','capacity<1)fail(','capacity<0)fail('],
 ['capacity integer check dropped','!Number.isSafeInteger(capacity)||',''],
 ['seasonDensity not checked as array','if(!Array.isArray(density))fail(','if(false)fail('],
 ['harvest on fromDay rejected','ev.day<fromDay||','ev.day<=fromDay||'],
 ['harvest on toDay accepted','ev.day>=toDay)fail(','ev.day>toDay)fail('],
 ['harvest day integer check dropped','!Number.isSafeInteger(ev.day)||',''],
 ['persistence check applies to undefined too','row.persistence!==undefined&&(','('],
 ['persistence 0 rejected','row.persistence<0||row.persistence>PPM','row.persistence<=0||row.persistence>PPM'],
 ['persistence 1e6 rejected','row.persistence<0||row.persistence>PPM','row.persistence<0||row.persistence>=PPM'],
 ['persistence above 1e6 by one accepted','row.persistence<0||row.persistence>PPM','row.persistence<0||row.persistence>PPM+1'],
 ['persistence -1 accepted','row.persistence<0||row.persistence>PPM','row.persistence<-1||row.persistence>PPM'],
 ['persistence integer check dropped','(!Number.isSafeInteger(row.persistence)||','('],
 ['persistence not defaulted','row.persistence??=PPM;',''],
 ['harvests not sorted','.sort((a,b)=>a.ev.day-b.ev.day||a.i-b.i)',''],
 ['sort without index tie-break','||a.i-b.i)',')','Array.prototype.sort is stable (ES2019), so equal days keep their input order without the explicit index'],
 ['sort: same-day order reversed','||a.i-b.i)','||b.i-a.i)'],
 ['sort: days descending','a.ev.day-b.ev.day','b.ev.day-a.ev.day'],
 ['day loop includes toDay','day<toDay;day++','day<=toDay;day++'],
 ['day loop skips the first day','for(let day=fromDay;','for(let day=fromDay+1;'],
 ['event loop without bound check','next<events.length&&',''],
 ['event loop takes earlier days too','events[next].ev.day===day','events[next].ev.day<=day','events are validated inside [fromDay,toDay) and consumed in order, so none is ever earlier than the current day'],
 ['day take total overwritten','taken+=t;','taken=t;'],
 ['zero takes posted','if(t)ledger.push({day,from:\'reserve\'','ledger.push({day,from:\'reserve\''],
 ['ledger actor lost','actor:events[next].ev.actor','actor:undefined'],
 ['season read at day end','season=calendar(from).season','season=calendar(to).season'],
 ['season read at the day number','season=calendar(from).season','season=calendar(day).season'],
 ['density always season 0','factor=density[season]','factor=density[0]'],
 ['density 0 rejected','factor<0)fail(','factor<=0)fail('],
 ['density finiteness not checked','!Number.isFinite(factor)||',''],
 ['rate adds density','rate=rate0*factor','rate=rate0+factor'],
 ['persistence ignores density','capacity:PPM,rate,from,to})','capacity:PPM,rate:rate0,from,to})'],
 ['persistence capacity off by one','capacity:PPM,rate,from,to})','capacity:PPM-1,rate,from,to})'],
 ['restart base even when extinct','base=row.persistence>0?restart:0','base=restart'],
 ['restart base at persistence 0 (>=)','row.persistence>0?restart:0','row.persistence>=0?restart:0'],
 ['limit ignores persistence','limit=capacity*row.persistence/PPM+base','limit=capacity+base'],
 ['limit without restart base','limit=capacity*row.persistence/PPM+base','limit=capacity*row.persistence/PPM'],
 ['base not subtracted from grown stock','rate,from,to})-base;','rate,from,to});'],
 ['base not added to the reserve','reserve:row.visible+base','reserve:row.visible'],
 ['regrown without subtracting visible','regrown=grown-row.visible;','regrown=grown;'],
 ['zero regrowth posted','if(regrown)ledger.push','ledger.push'],
 ['regrown total overwritten','regrownTotal+=regrown','regrownTotal=regrown'],
 ['taken total overwritten','takenTotal+=taken','takenTotal=taken'],
 ['PPM 1e5','const PPM=1e6,MINUTES=1440;','const PPM=1e5,MINUTES=1440;'],
 ['minutes per day 1000','const PPM=1e6,MINUTES=1440;','const PPM=1e6,MINUTES=1000;'],
 ['result taken is regrown','taken:takenTotal','taken:regrownTotal'],
 ['spare function lost in context','spareOf:spare,','spareOf:undefined,'],
 ['capacity doubled in context','spareOf:spare,capacity}','spareOf:spare,capacity:capacity*2}'],
 // day numbers and ledger postings
 ['ledger: gatherer posting day fixed at 0','{day,from:\'reserve\'','{day:0,from:\'reserve\''],
 ['ledger: regrowth posting day is fromDay','{day,from:\'src:regrowth\'','{day:fromDay,from:\'src:regrowth\''],
 ['days entry day fixed at 0','days.push({day,visible','days.push({day:0,visible'],
 ['ledger: gatherer posting direction reversed','from:\'reserve\',to:\'gatherer\'','from:\'gatherer\',to:\'reserve\''],
 ['ledger: gatherer posting to reserve','to:\'gatherer\',actor','to:\'reserve\',actor'],
 ['ledger: gatherer amount 0','amount:t}','amount:0}'],
 ['ledger: regrowth posted to the gatherer','from:\'src:regrowth\',to:\'reserve\'','from:\'src:regrowth\',to:\'gatherer\''],
 ['ledger: regrowth amount is the grown stock','amount:regrown}','amount:grown}'],
 // remaining arithmetic and literals
 ['persistence logistic starts from PPM','{reserve:row.persistence,','{reserve:PPM,'],
 ['persistence logistic result not stored','row.persistence=logisticStock(','logisticStock('],
 ['limit without /PPM','limit=capacity*row.persistence/PPM+base','limit=capacity*row.persistence+base'],
 ['restart base only above 1 ppm','row.persistence>0?restart:0','row.persistence>1?restart:0'],
 ['stock growth ignores density','{reserve:row.visible+base,capacity:limit,rate,from,to}','{reserve:row.visible+base,capacity:limit,rate:rate0,from,to}'],
 ['day length 1 minute','to=from+MINUTES','to=from+1'],
 ['root pull test inverted','if(method.kills===\'root\')','if(method.kills!==\'root\')'],
 ['shoot cut test inverted','if(method.kills===\'shoot\')','if(method.kills!==\'shoot\')'],
 ['shoot cut: resprout test on seed','props.regrowFrom===\'root\'?0:before?1:0','props.regrowFrom===\'seed\'?0:before?1:0'],
 ['shoot cut: before inverted','?0:before?1:0;','?0:before?0:1;'],
 ['methods default dropped','methods={},','methods,'],
 ['harvests default dropped','harvests=[],','harvests,'],

 // logisticStock (stock.mjs): the exact cases of the curve
 ['stock: reserve not returned when the exponential is exactly 1','return e===1?a.reserve:a.capacity/','return a.capacity/',undefined,'stock'],
 ['stock: only the anchor minute and rate 0 are exact (the previous two special cases)','return e===1?a.reserve:','return (t===a.minute||a.rate===0)?a.reserve:',undefined,'stock'],
 ['stock: only rate 0 is exact','return e===1?a.reserve:','return a.rate===0?a.reserve:',undefined,'stock'],
 ['stock: only the anchor minute is exact','return e===1?a.reserve:','return t===a.minute?a.reserve:',undefined,'stock'],
 ['stock: the curve is always the reserve (no growth at all)','e===1?a.reserve:a.capacity/(1+(a.capacity/a.reserve-1)*e)','a.reserve',undefined,'stock'],
 ['stock: rebase only when the capacity changes','visible!==reserve||a.capacity!==capacity||a.rate!==rate','a.capacity!==capacity||a.rate!==rate',undefined,'stock'],
 ['stock: result without the reserve floor','return Math.max(reserve,Math.floor(at(a,to)));','return Math.floor(at(a,to));',undefined,'stock'],
];

const MUTANTS=PATCHES.map(([note,from,to,equivalent,target],i)=>({n:i+1,note,from,to,equivalent,target:target??'renewable'}));
if(args.includes('--list')||args.includes('list')){for(const m of MUTANTS)console.log(`M${String(m.n).padStart(3,'0')} ${m.equivalent?'(equivalent) ':''}${m.note}`);process.exit(0);}

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'rg-mutate-'));
function build(id,source,stockSource=null){
 const moduleCopy=path.join(tmp,`renewable.${id}.mjs`);
 let stubUrl=null;
 if(stockSource!==null){
  const stub=path.join(tmp,`stock-pure.${id}.mjs`);stubUrl=pathToFileURL(stub).href;
  fs.writeFileSync(stub,`import {exp} from '${rootUrl}server-plugin/det-math.mjs';\n${stockSource}\n`);
 }
 const renewableSource=stubUrl===null?source:source.replace("import {logisticStock,accrueStock} from './stock.mjs';",`import {logisticStock} from '${stubUrl}';\nimport {accrueStock} from './stock.mjs';`);
 fs.writeFileSync(moduleCopy,renewableSource.split("from './stock.mjs'").join(`from '${rootUrl}server-plugin/stock.mjs'`).split("from './det-math.mjs'").join(`from '${rootUrl}server-plugin/det-math.mjs'`));
 // the source-scan test reads the mutated module text as written (imports not rewritten)
 const scanCopy=path.join(tmp,`scan.${id}.mjs`);fs.writeFileSync(scanCopy,source);
 let test=testSource.split("'../server-plugin/renewable.mjs'").join(`'${pathToFileURL(moduleCopy).href}'`);
 test=test.split("read('server-plugin/renewable.mjs')").join(`fs.readFileSync(${JSON.stringify(scanCopy)},'utf8')`);
 if(stubUrl!==null)test=test.replace("import {logisticStock} from '../server-plugin/stock.mjs';",`import {logisticStock} from '${stubUrl}';`);
 test=test.split("from '../").join(`from '${rootUrl}`).split('import.meta.url').join(JSON.stringify(pathToFileURL(testFile).href));
 const testCopy=path.join(tmp,`test.${id}.mjs`);fs.writeFileSync(testCopy,test);
 return {moduleCopy,testCopy};
}
function run(testCopy){
 return new Promise(resolve=>{
  const child=spawn(process.execPath,['--test','--test-isolation=none','--test-reporter=tap',testCopy],{cwd:root,stdio:['ignore','pipe','pipe']});
  let out='',timedOut=false;const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},TIMEOUT_MS);
  child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>out+=d);
  child.on('close',code=>{clearTimeout(timer);resolve({code,out,timedOut});});
 });
}
const firstFailure=out=>(out.match(/^not ok \d+ - (.*)$/m)??[])[1]??'(no failing test name; the file did not load or crashed)';

async function main(){
 console.log(`rg-mutate: ${MUTANTS.length} mutants, ${JOBS} at a time, temp ${tmp}`);
 const base=build('base',original),baseline=await run(base.testCopy);
 if(baseline.code!==0){console.log('BASELINE FAILS: the unmutated module does not pass the tests; no mutant was run.\n'+baseline.out.split('\n').slice(-40).join('\n'));return 2;}
 console.log('baseline passes');
 const stubBase=build('stubbase',original,stockFunction),stubBaseline=await run(stubBase.testCopy);
 if(stubBaseline.code!==0){console.log('BASELINE WITH THE STAND-ALONE logisticStock FAILS; no mutant was run.\n'+stubBaseline.out.split('\n').slice(-40).join('\n'));return 2;}
 console.log('stand-alone logisticStock baseline passes');

 const results=[];let next=0;
 async function worker(){
  for(;;){
   const m=MUTANTS[next++];if(!m)return;
   if(ONLY&&!ONLY.has(m.n))continue;
   const target=m.target==='stock'?stockFunction:original,count=target.split(m.from).length-1,tag=`M${String(m.n).padStart(3,'0')}`;
   let status,detail='';
   if(count!==1){status='PATCH-MISS';detail=` (pattern occurs ${count} times)`;}
   else{
    const built=m.target==='stock'?build(String(m.n),original,stockFunction.replace(m.from,()=>m.to)):build(String(m.n),original.replace(m.from,()=>m.to));
    const check=spawnSync(process.execPath,['--check',m.target==='stock'?path.join(tmp,`stock-pure.${m.n}.mjs`):built.moduleCopy],{encoding:'utf8'});
    if(check.status!==0){status='INVALID';detail=` (${(check.stderr||'').split('\n').find(l=>l.includes('Error'))??'syntax error'})`;}
    else{
     const r=await run(built.testCopy);
     if(r.timedOut){status='TIMEOUT';}
     else if(r.code!==0){status=m.equivalent?'EQUIVALENT-KILLED':'KILLED';detail=`  <- ${firstFailure(r.out).slice(0,110)}`;}
     else status=m.equivalent?'EQUIVALENT':'SURVIVED';
    }
   }
   results.push({m,status});
   console.log(`${tag} ${status.padEnd(18)} ${m.note}${detail}${status==='EQUIVALENT'?`  [${m.equivalent}]`:''}`);
  }
 }
 await Promise.all(Array.from({length:JOBS},worker));
 const count=s=>results.filter(r=>r.status===s).length;
 const bad=results.filter(r=>['SURVIVED','INVALID','PATCH-MISS','TIMEOUT'].includes(r.status));
 console.log(`\nmutants run ${results.length}: killed ${count('KILLED')}, equivalent (survived as expected) ${count('EQUIVALENT')}, equivalent but killed ${count('EQUIVALENT-KILLED')}, survived ${count('SURVIVED')}, invalid ${count('INVALID')}, patch-miss ${count('PATCH-MISS')}, timeout ${count('TIMEOUT')}`);
 if(bad.length)console.log('NOT KILLED OR NOT RUN: '+bad.map(r=>`M${String(r.m.n).padStart(3,'0')} ${r.status}`).join(', '));
 return bad.length?1:0;
}
let code=2;
try{code=await main();}finally{fs.rmSync(tmp,{recursive:true,force:true});}
process.exit(code);
