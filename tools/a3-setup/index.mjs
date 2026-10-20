// Domain loaders for A3 corpus setup fields beyond the built-in scene fields.
// Each loader establishes corpus premises through native engine interfaces
// (never by writing a "this already happened" conclusion into state) and
// reports anything it cannot establish with ctx.unmet(item, reason).
//
// A loader module exports {fields:[...], order:Number, load(ctx, setup)}.
// ctx: engine, setup, bindings, ref(id), actor(id), unmet(item,reason),
//      note(text), native(item, write(draft)) and a live ctx.document.
// Lower order runs first: history/accounts/obligations before documents,
// zones/paths before placements/positions.
const modules=[];
export function registerSetupLoader(module){modules.push(module);modules.sort((a,b)=>a.order-b.order);}
export const setupLoaderFields=()=>modules.flatMap(m=>m.fields);
export function runSetupLoaders(ctx,setup){
 for(const module of modules){
  const fields=module.fields.filter(field=>Object.hasOwn(setup,field)&&(!module.rows?.[field]||Array.isArray(setup[field])&&setup[field].some(module.rows[field])));
  if(!fields.length)continue;
  const input={...setup};
  for(const field of fields)if(Array.isArray(setup[field])){
   const routes=modules.filter(m=>m.rows?.[field]);
   if(routes.length)input[field]=setup[field].filter(row=>{
    const target=routes.find(m=>m.rows[field](row));return target?target===module:!module.rows?.[field];
   });
  }
  module.load(ctx,input,fields);
 }
}
