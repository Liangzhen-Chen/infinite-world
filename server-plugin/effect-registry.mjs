import {preconditionFailure} from './precondition.mjs';
// Registration must not depend on effect consumers: those systems can import
// each other while registering their kinds at module load time.
export const EFFECT_SOURCES=Object.freeze(['world','faction','festival','season']);
const table=new Map();
export function registerEffect(kind,spec){
 if(typeof kind!=='string'||!kind||typeof spec?.validate!=='function'||typeof spec?.apply!=='function')throw preconditionFailure('效果类型需要 kind、validate 和 apply');
 if(table.has(kind))throw preconditionFailure(`效果类型重复：${kind}`);
 if(spec.sources&&(!Array.isArray(spec.sources)||spec.sources.some(s=>!EFFECT_SOURCES.includes(s))))throw preconditionFailure(`效果来源无效：${kind}`);
 table.set(kind,Object.freeze({...spec,kind}));
 return ()=>table.delete(kind);
}
export const effectKinds=()=>[...table.keys()];
export function effectConsumer(engine,kind,source){
 if(source==='faction'&&engine.factionEffectConsumers?.[kind]&&!table.get(kind)?.sources?.includes('faction'))return engine.factionEffectConsumers[kind];
 const spec=table.get(kind);
 return spec&&(!spec.sources||spec.sources.includes(source))?spec:null;
}
