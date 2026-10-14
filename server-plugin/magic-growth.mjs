import {registerMagicEffect}from'./magic-effects.mjs';
import {environmentFeatures,localPlayerPoint,localSightClear} from './environment.mjs';

const unit=1440000,clone=x=>structuredClone(x);
const integer=(n,min,max,label)=>{if(!Number.isSafeInteger(n)||n<min||n>max)throw Error(`${label}无效或缺失`);return n;};
export function validateGrowthCatalog(c){
 const s=c.effectSpec,errors=[];
 if(s?.kind!=='growth'||s.unit!=='permille'||Object.keys(s).some(k=>!['kind','power','unit'].includes(k)))errors.push('生长只支持有限比例加速，不治疗病理');
 if(!Number.isSafeInteger(s?.power)||s.power<1||s.power>250)errors.push('生长比例须在1至250千分比');
 if(!Number.isSafeInteger(c.duration)||c.duration<1||c.duration>10080)errors.push('生长持续须在1至10080分钟');
 if(!Number.isFinite(c.rangeMeters)||c.rangeMeters<0||c.rangeMeters>3)errors.push('生长须在实际3米内');
 return errors;
}
export function validateGrowthRules(r){
 if(!r)return[];
 try{
  if(r.version!==1||typeof r.source!=='string'||!r.source)throw Error('生长规则须有版本和来源');
  integer(r.maximumBonusPermille,1,200,'批次累计加速上限');integer(r.cooldownMinutes,10080,43200,'田块冷却');
  integer(r.waterMlPerAreaDay,1,1000000,'每面积日水耗');integer(r.nutrientMgPerAreaDay,1,1000000,'每面积日营养耗');
  if(!Array.isArray(r.stageLimits)||r.stageLimits.length!==9)throw Error('生长须列出九阶段边界');
  for(const s of r.stageLimits){integer(s.power,1,250,'阶段比例');integer(s.duration,1,10080,'阶段持续');}
  return[];
 }catch(e){return[e.message];}
}
function rules(engine){const r=engine.rules.magicGrowth,errors=validateGrowthRules(r);if(!r||errors.length)throw Error(errors.join('；')||'缺少生长资源规则');return r;}
function binding(engine,target){
 const features=environmentFeatures(engine),p=engine.rules.agriculture?.settlements.find(p=>p.fieldId===target);
 const matches=p?features.filter(f=>f.growth?.field===p.fieldId&&f.growth?.settlement===p.settlement):features.filter(f=>f.id===target);
 const f=p?.growthFeature?matches.find(f=>f.id===p.growthFeature):matches.length===1?matches[0]:null;
 const profile=p??engine.rules.agriculture?.settlements.find(p=>p.settlement===f?.growth?.settlement&&p.fieldId===f?.growth?.field);
 if(!profile||!f||!['soil','plant'].includes(f.kind)||f.growth?.field!==profile.fieldId||f.growth?.settlement!==profile.settlement||f.location!==profile.fieldLocation)throw Error('田块或植物缺少已登记的农事批次和资源绑定');
 const owner=profile.fieldOwner??profile.settlement;
 if(f.owner!==owner||owner!=='player'&&owner!==profile.settlement&&owner!==profile.manager)throw Error('生长资源与田主登记不符');
 return{p:profile,f,key:`agriculture:${profile.settlement}`};
}
export function validateGrowthWorld(world){
 const errors=[],engine={world,rules:world.rules};
 for(const target of new Set([...(world.rules.agriculture?.settlements??[]).filter(p=>p.growthFeature).map(p=>p.fieldId),...environmentFeatures(engine).filter(f=>f.growth).map(f=>f.id)])){
  try{
   const {f}=binding(engine,target),d={get:()=>undefined};readResource(d,f);
  }catch(e){errors.push(`${target}: ${e.message}`);}
 }
 return errors;
}
function permission(d,p,f,args,minute){
 if(f.owner==='player')return null;
 const a=d.get('state','records',args.authorization);
 if(a?.category!=='authorization'||a.action!=='growth_magic'||a.subject!==p.fieldId||a.grantor!==(f.owner===p.settlement?p.manager:f.owner)||a.grantee!=='player'||a.revoked||!Number.isSafeInteger(a.expires)||a.expires<=minute)throw Error('田块生长需要田主有效同意；公用访问不授权施法');
 const owner=d.get('state','npcs',a.grantor);
 if(!owner||['死亡','濒死'].includes(owner.status))throw Error('田主无法继续履约');
 return a;
}
function readResource(d,f){
 const record=d.get('state','records',`physical_feature:${f.id}`);
 if(record&&(record.category!=='physical_feature'||record.id!==f.id||record.location!==f.location))throw Error('生长资源登记键冲突');
 const s=clone(record?.state??f.state);
 integer(s?.waterMl,0,Number.MAX_SAFE_INTEGER,'实际水量');integer(s?.nutrientMg,0,Number.MAX_SAFE_INTEGER,'实际营养量');
 integer(s?.capacityMl,1,Number.MAX_SAFE_INTEGER,'水容量');if(s.waterMl>s.capacityMl)throw Error('实际水量超过容量');
 return s;
}
function auditLease(l,engine){
 const config=rules(engine);
 integer(l.started,0,Number.MAX_SAFE_INTEGER,'生长开始');integer(l.until,l.started+1,l.started+10080,'生长期限');integer(l.power,1,250,'生长比例');
 if(l.maximumTicks!==Math.floor(engine.rules.agriculture.crop.growthDays*unit*config.maximumBonusPermille/1000)||l.waterMlPerAreaDay!==config.waterMlPerAreaDay||l.nutrientMgPerAreaDay!==config.nutrientMgPerAreaDay||typeof l.source!=='string'||!l.source||!Array.isArray(l.cohorts)||new Set(l.cohorts).size!==l.cohorts.length||!Array.isArray(l.entries))throw Error('生长资源规则或批次登记不一致');
 let ticks=0,water=0,nutrient=0;const days=new Set();
 for(const e of l.entries){
  integer(e.day,0,Number.MAX_SAFE_INTEGER,'消费日期');integer(e.ticks,0,Number.MAX_SAFE_INTEGER,'消费额度');
  if(days.has(e.day))throw Error('生长重复日结');days.add(e.day);
  const parts=e.parts??[];let t=0,w=0,n=0;
  for(const part of parts){
   integer(part.ticks,1,Number.MAX_SAFE_INTEGER,'批次额度');integer(part.areaUnits,1,100000,'批次面积');
   if(!l.cohorts.includes(part.cohort)||part.waterMl!==Math.ceil(part.ticks*part.areaUnits*l.waterMlPerAreaDay/unit)||part.nutrientMg!==Math.ceil(part.ticks*part.areaUnits*l.nutrientMgPerAreaDay/unit))throw Error('生长水和营养转换不守恒');
   t+=part.ticks;w+=part.waterMl;n+=part.nutrientMg;
  }
  if(t!==e.ticks||w!==(e.waterMl??0)||n!==(e.nutrientMg??0))throw Error('生长消费明细不守恒');
  ticks+=t;water+=w;nutrient+=n;
 }
 if(l.usedTicks!==ticks||l.waterMl!==water||l.nutrientMg!==nutrient)throw Error('生长消费总账不守恒');
}
function auditResources(s,leases,resource){
 const own=leases.filter(l=>l.resource===resource),water=own.reduce((n,l)=>n+l.waterMl,0),nutrient=own.reduce((n,l)=>n+l.nutrientMg,0);
 if((s.growthConsumedWaterMl??0)!==water||(s.growthConsumedNutrientMg??0)!==nutrient)throw Error('生长资源消费与农田账不守恒');
}
function auditCohort(c,leases){
 const ticks=leases.flatMap(l=>l.entries).flatMap(e=>e.parts??[]).filter(p=>p.cohort===c.id).reduce((n,p)=>n+p.ticks,0);
 if((c.growthBonusTicks??0)!==ticks)throw Error('播种批次生长额度不守恒');
}
function cohorts(r,f){
 const rows=r.field.cohorts.filter(c=>!c.ready&&c.harvestedUnits===0&&(!f.growth.cohort||c.id===f.growth.cohort));
 if(!rows.length||rows.some(c=>!Number.isSafeInteger(c.seedSpent)||c.seedSpent<1||!Array.isArray(c.seedSources)||c.seedSources.reduce((n,b)=>n+b.amount,0)!==c.seedSpent))throw Error('没有已投入真实种粮且可追溯的生长批次');
 return rows;
}
export function prepareGrowthMagic(d,catalog,args){
 const errors=validateGrowthCatalog(catalog);if(errors.length)throw Error(errors.join('；'));
 const config=rules(this),limit=config.stageLimits[catalog.stage];
 if(!limit||catalog.effectSpec.power>limit.power||catalog.duration>limit.duration)throw Error('超过本阶段生长界限');
 const {p,f,key}=binding(this,args.target),r=d.get('state','records',key),now=d.get('state','minute');
 if(r?.mode!=='managed'||r.field.id!==p.fieldId)throw Error('旧账或缺失农事状态不能补发生长');
 if(d.get('state','location')!==f.location||!Array.isArray(f.position)||f.position.length!==2||f.position.some(x=>!Number.isFinite(x))||Math.hypot(...f.position.map((x,i)=>x-localPlayerPoint(d)[i]))>catalog.rangeMeters||!localSightClear(d,this,f.location,localPlayerPoint(d),f.position))throw Error('生长目标不在实际距离或视线内');
 permission(d,p,f,args,now);const rows=cohorts(r,f),s=readResource(d,f);
 if(s.waterMl<1||s.nutrientMg<1)throw Error('缺少实际水或营养资源');
 const leases=r.field.growthLeases??[];
 for(const l of leases)auditLease(l,this);
 auditResources(s,leases,f.id);for(const c of rows)auditCohort(c,leases);
 if(leases.some(l=>l.until>now||l.started+config.cooldownMinutes>now))throw Error('同田生长不可叠加，尚在持续或冷却额度内');
 const maximum=Math.floor(this.rules.agriculture.crop.growthDays*unit*config.maximumBonusPermille/1000);
 if(rows.every(c=>(c.growthBonusTicks??0)>=maximum))throw Error('本批次累计生长额度已用尽');
 return{target:args.target,spec:catalog.effectSpec,catalog,growthArgs:{...args},key,resource:f.id};
}
export function applyGrowthMagic(d,prepared,eventId){
 let valid;try{valid=prepareGrowthMagic.call(this,d,prepared.catalog,prepared.growthArgs);}catch(e){return{target:prepared.target,effectFailed:e.message};}
 const {p,f}=binding(this,valid.target),r=clone(d.get('state','records',valid.key)),started=d.get('state','minute'),config=rules(this);
 r.field.growthLeases??=[];if(r.field.growthLeases.some(l=>l.source===eventId))throw Error('生长来源编号冲突');
 const lease={source:eventId,spell:valid.catalog.id,resource:f.id,started,until:started+valid.catalog.duration,power:valid.spec.power,
  authorization:valid.growthArgs.authorization??null,cohorts:cohorts(r,f).map(c=>c.id),maximumTicks:Math.floor(this.rules.agriculture.crop.growthDays*unit*config.maximumBonusPermille/1000),
  waterMlPerAreaDay:config.waterMlPerAreaDay,nutrientMgPerAreaDay:config.nutrientMgPerAreaDay,usedTicks:0,waterMl:0,nutrientMg:0,entries:[]};
 r.field.growthLeases.push(lease);d.set(['state','records',valid.key],r);
 return{target:valid.target,field:p.fieldId,sourceEvent:eventId,expires:lease.until,bonusPermille:lease.power,note:'已登记有限加速；农事日结按实际水和营养消费，不直接发放收成'};
}
// Run on the canonical agricultural day, before maturity/harvest. Leases live in
// the farm ledger so ordinary effect expiry cannot erase an unsettled partial day.
export function consumeGrowthDay(d,engine,r,p,day,weather){
 for(const l of r.field.growthLeases??[]){
  auditLease(l,engine);
  const start=Math.max(day*1440,l.started),end=Math.min((day+1)*1440,l.until);
  if(end<=start)continue;
  const {f}=binding(engine,l.resource);let cutoff=end;
  try{const a=permission(d,p,f,{authorization:l.authorization},start);if(a)cutoff=Math.min(cutoff,a.expires);}catch(e){l.entries.push({day,reason:e.message,ticks:0});continue;}
  if((weather?.temperatureC??10)<engine.rules.agriculture.crop.minimumTemperatureC){l.entries.push({day,reason:'低温停止生长',ticks:0});continue;}
  integer(l.power,1,250,'已登记比例');integer(l.maximumTicks,1,Math.floor(engine.rules.agriculture.crop.growthDays*unit*.2),'已登记批次额度');
  integer(l.waterMlPerAreaDay,1,1000000,'已登记水耗');integer(l.nutrientMgPerAreaDay,1,1000000,'已登记营养耗');
  const s=readResource(d,f);auditResources(s,r.field.growthLeases,l.resource);let used=0,water=0,nutrient=0;const parts=[];
  for(const c of r.field.cohorts.filter(c=>l.cohorts.includes(c.id)&&!c.ready&&c.harvestedUnits===0)){
   auditCohort(c,r.field.growthLeases);
   const old=c.growthBonusTicks??0;integer(old,0,l.maximumTicks,'累计生长消费');
   const cap=Math.min((cutoff-start)*l.power,l.maximumTicks-old,Math.max(0,Math.round((engine.rules.agriculture.crop.growthDays-c.grownDays)*unit)));
   const ticks=Math.max(0,Math.min(cap,Math.floor(s.waterMl*unit/(c.areaUnits*l.waterMlPerAreaDay)),Math.floor(s.nutrientMg*unit/(c.areaUnits*l.nutrientMgPerAreaDay))));
   if(!ticks)continue;
   const w=Math.ceil(ticks*c.areaUnits*l.waterMlPerAreaDay/unit),n=Math.ceil(ticks*c.areaUnits*l.nutrientMgPerAreaDay/unit);
   parts.push({cohort:c.id,areaUnits:c.areaUnits,ticks,waterMl:w,nutrientMg:n});
   s.waterMl-=w;s.nutrientMg-=n;water+=w;nutrient+=n;used+=ticks;c.growthBonusTicks=old+ticks;
   c.grownDays+=ticks/unit;c.qualityDays+=ticks/unit;c.qualitySum+=(weather?.cropMultiplier??1)*ticks/unit;
   c.growthSources??=[];if(!c.growthSources.includes(l.source))c.growthSources.push(l.source);
  }
  s.growthConsumedWaterMl=(s.growthConsumedWaterMl??0)+water;s.growthConsumedNutrientMg=(s.growthConsumedNutrientMg??0)+nutrient;
  if(Number.isFinite(s.baseMoisturePercent))s.moisturePercent=Math.min(100,s.baseMoisturePercent+100*s.waterMl/s.capacityMl);
  l.usedTicks+=used;l.waterMl+=water;l.nutrientMg+=nutrient;l.entries.push({day,ticks:used,waterMl:water,nutrientMg:nutrient,parts,...(!used?{reason:'资源或批次额度不足；未补发生长'}:{})});
  d.set(['state','records',`physical_feature:${f.id}`],{id:f.id,category:'physical_feature',location:f.location,state:s});
 }
}
// Spell effect family (dispatched by magic.mjs through magic-effects.mjs).
registerMagicEffect({kinds:['growth'],validateSpec:validateGrowthCatalog,prepare(d,c,args){return prepareGrowthMagic.call(this,d,c,args);},apply(d,p,id){return applyGrowthMagic.call(this,d,p,id);}});
