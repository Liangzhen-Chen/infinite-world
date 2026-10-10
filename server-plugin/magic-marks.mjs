import {environmentFeatures}from'./environment.mjs';
import {heldUnit,trackSingleItem}from'./items.mjs';
export function validateMarkCatalog(catalog){
 const s=catalog.effectSpec,errors=[];
 if(!['fire','soil','ink'].includes(s.medium)||!['normal','dim'].includes(s.visibility))errors.push('痕迹介质或显现条件未登记');
 if(s.power>80||!Number.isSafeInteger(catalog.duration)||catalog.duration<1||catalog.duration>1440)errors.push('痕迹限80字、1至1440分钟');
 if(!Number.isFinite(catalog.rangeMeters)||catalog.rangeMeters<0||catalog.rangeMeters>3)errors.push('痕迹必须在3米内制作或查看');
 if(s.medium==='ink'&&!catalog.materials?.some(x=>x.item==='item_charcoal'&&x.amount>=1))errors.push('暗字必须消耗真实木炭媒介');
 return errors;
}
function targetOf(d,engine,target,args){
 const item=engine.byId.get(target);
 if(item?.kind==='item'||target?.startsWith('item_')){
  if(engine.quantity(d,'player',target)!==1)throw Error('刻记需要自有单件物品');
  return{target,definition:item,held:heldUnit(d,engine,'player',target),location:d.get('state','location')};
 }
 const row=environmentFeatures(engine).find(r=>r.id===target&&r.location===d.get('state','location'));if(!row)throw Error('刻记目标必须是所在地真实非活体');
 const pos=d.get('state','records','local_player_position'),point=pos?.location===row.location?pos.point:[0,0];
 if(Math.hypot(point[0]-row.position[0],point[1]-row.position[1])>(args.rangeMeters??3))throw Error('刻记目标超过实际射程');
 if(row.owner!=='player'&&row.access!=='public'){
  const a=d.get('state','records',args.authorization);if(a?.category!=='authorization'||a.subject!==row.id||a.action!=='environment_use'||a.grantor!==row.owner||a.revoked||a.expires!==undefined&&a.expires<=d.get('state','minute'))throw Error('刻记目标需要所有者授权');
 }
 return{target,definition:row,state:d.get('state','records',`physical_feature:${row.id}`)?.state??row.state,location:row.location};
}
export function prepareMark(d,catalog,args){
 const target=args.target?.startsWith('feature_')?args.target:this.resolve(args.target),row=targetOf(d,this,target,{...args,rangeMeters:catalog.rangeMeters}),s=catalog.effectSpec;
 const text=args.text;if(typeof text!=='string'||!text.trim()||[...text].length>s.power||/[\u0000-\u001f]/u.test(text))throw Error('刻记文字缺失、过长或含控制符');
 if(s.medium==='soil'&&(row.definition.kind!=='soil'||row.state.worked!==true))throw Error('压印须使用已经松动的真实软土');
 if(s.medium==='ink'&&!(row.definition.tags??[]).includes('paper'))throw Error('暗字只适用于纸张');
 if(s.medium==='fire'&&!(row.definition.tags??[]).some(t=>['wood','metal','paper'].includes(t)))throw Error('火纹只作用于可刻记材料');
 return{...row,catalog,spec:s,text:text.trim(),args:{...args,target}};
}
export function applyMark(d,p,eventId){
 try{p=prepareMark.call(this,d,p.catalog,p.args);}catch(error){return{effectFailed:error.message};}
 const key=`magic_mark:${eventId}`;if(d.get('state','records',key))throw Error('痕迹事件已登记');
 const targetInstance=p.held?trackSingleItem(d,this,'player',p.target,eventId):null;
 const r={category:'magic_mark',target:p.target,targetInstance,location:p.location,medium:p.spec.medium,visibility:p.spec.visibility,text:p.text,source:eventId,expires:d.get('state','minute')+p.catalog.duration};
 d.set(['state','records',key],r);return{target:p.target,mark:key,expires:r.expires,note:'只留下可观察字迹，不证明作者身份或法律效力'};
}
export function inspectMagicMarks(d,engine,args,context={}){
 const row=targetOf(d,engine,args.target,args),instance=row.held?.instance;
 return Object.entries(d.get('state','records')??{}).filter(([,r])=>r.category==='magic_mark'&&r.target===row.target&&r.expires>d.get('state','minute')&&(!r.targetInstance||r.targetInstance===instance)&&(!r.location||row.held||r.location===row.location)&&(r.visibility==='normal'||context.illumination==='dim')).map(([id,r])=>({id,text:r.text,medium:r.medium,expires:r.expires,note:'可见字迹不等于认证'}));
}
