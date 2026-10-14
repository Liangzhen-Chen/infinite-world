import {environmentCatalog}from'./environment.mjs';
import {publicLore}from'./lore.mjs';
import {publicSettlement}from'./settlement-profile.mjs';
import {siteKnowledge}from'./sites.mjs';
const publicKinds=new Set(['profession','skill','spell','recipe','item','loc','bld','site','culture','deity','faction','history']);
export function catalogDefinition(engine,document,{entity,kind,offset=0}={}){
    const selected=engine.scoped(document);
    if(!Number.isSafeInteger(offset)||offset<0)throw new Error('目录 offset 必须为非负整数');
    const locationKinds=new Set(['loc','bld','site']);
    if(kind==='feature'||entity?.startsWith('feature_'))return environmentCatalog(selected,document,{entity});
    if(!entity){
        if(!publicKinds.has(kind)&&kind!=='location')throw new Error('目录列表需指定profession、skill、spell、recipe、item、location、culture、deity、faction或history');
        const rows=selected.entities.filter(row=>(kind==='location'?locationKinds.has(row.id.split('_')[0]):row.id.startsWith(`${kind}_`))&&!(kind==='profession'&&row.kind==='hidden'));
        const end=offset+40;
        return{kind,count:rows.length,entries:rows.slice(offset,end).map(row=>({id:row.id,name:row.name})),truncated:rows.length>end,nextOffset:rows.length>end?end:null};
    }
    const id=selected.resolve(entity,kind==='location'?undefined:kind),row=selected.byId.get(id),category=id.split('_')[0];
    if(!publicKinds.has(category))throw new Error('这个实体不属于公开规则目录');
    if(category==='history'){
        const known=siteKnowledge(selected.world,document).filter(truth=>truth.history===id);
        if(known.length)return{...publicLore(row),description:known.map(truth=>truth.text).join('\n'),verified:true,source:'遗迹发现',evidence:known.flatMap(truth=>truth.evidence)};
    }
    if(['culture','deity','faction','history'].includes(category))return publicLore(row);
    if(kind==='location'&&!locationKinds.has(category))throw new Error('需要地点名称或编号');
    if(locationKinds.has(category))return{id,name:row.name,description:row.description??'',parent:row.parent??null,
        ...(publicSettlement(selected.world,id,document)?{settlement:publicSettlement(selected.world,id,document)}:{}),
        routes:engine.world.routes.filter(route=>[route.from,route.to].includes(id)).map(route=>({destination:route.from===id?route.to:route.from,modes:route.modes,lengthKm:route.lengthKm,closedSeasons:route.closedSeasons}))};
    if(category==='profession'&&row.kind==='hidden'&&!document.state.professions.hidden.includes(id))return document.state.careerMetrics?.opportunities?.[id]
        ?{id,name:row.name,available:false,opportunity:true,initiation:row.initiation,note:'已感到契机；完成这段经历（profession certify）才取得'}
        :{id,available:false,note:'隐藏身份的条件与能力尚未识别'};
    if(category==='profession'&&row.kind==='hidden'){
        const{id,name,ability,cost}=row;return{id,name,ability,cost};
    }
    // Combat career data (entry task, variant routes, ultimate task) is public.
    if(category==='profession'&&engine.world.careers?.[id])return{...structuredClone(row),career:structuredClone(engine.world.careers[id])};
    if(category==='item')return{...structuredClone(row),repairs:structuredClone(selected.rules.repairs?.filter(plan=>plan.item===id)??[])};
    if(category==='spell')return{...structuredClone(row),learned:Object.hasOwn(document.state.spells??{},id),
        learningStatus:Object.hasOwn(document.state.spells??{},id)?'玩家已经学会此法术，可按当前魔力与施法条件尝试；无需重复学习':'玩家尚未学会此法术；查到目录不等于学会'};
    return structuredClone(row);
}
