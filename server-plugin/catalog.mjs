import {environmentCatalog}from'./environment.mjs';
const publicKinds=new Set(['profession','skill','spell','recipe','item']);
export function catalogDefinition(engine,document,{entity,kind}={}){
    const selected=engine.scoped(document);
    if(kind==='feature'||entity?.startsWith('feature_'))return environmentCatalog(selected,document,{entity});
    if(!entity){
        if(!publicKinds.has(kind))throw new Error('目录列表需指定profession、skill、spell、recipe或item');
        const rows=selected.entities.filter(row=>row.id.startsWith(`${kind}_`)&&!(kind==='profession'&&row.kind==='hidden'));
        return{kind,count:rows.length,entries:rows.slice(0,40).map(row=>({id:row.id,name:row.name})),truncated:rows.length>40};
    }
    const id=selected.resolve(entity,kind),row=selected.byId.get(id),category=id.split('_')[0];
    if(!publicKinds.has(category))throw new Error('这个实体不属于公开规则目录');
    if(category==='profession'&&row.kind==='hidden'&&!document.state.professions.hidden.includes(id))return{id,available:false,note:'隐藏身份的条件与能力尚未识别'};
    if(category==='profession'&&row.kind==='hidden'){
        const{id,name,ability,cost}=row;return{id,name,ability,cost};
    }
    if(category==='item')return{...structuredClone(row),repairs:structuredClone(selected.rules.repairs?.filter(plan=>plan.item===id)??[])};
    if(category==='spell')return{...structuredClone(row),learned:Object.hasOwn(document.state.spells??{},id),
        learningStatus:Object.hasOwn(document.state.spells??{},id)?'玩家已经学会此法术，可按当前魔力与施法条件尝试；无需重复学习':'玩家尚未学会此法术；查到目录不等于学会'};
    return structuredClone(row);
}
