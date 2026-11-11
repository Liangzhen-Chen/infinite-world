// The advance-system list and its registration function, with no imports. Modules that register a system as they load
// (npc-labor and others) sit in an import cycle with advance-registry; a leaf holding the list keeps registration valid
// whichever module of the cycle is loaded first. advance-registry re-exports both names.
export const advanceRegistry=[];
export function registerAdvance(system){
    if(!system||typeof system.id!=='string'||!Number.isFinite(system.order)||typeof system.advance!=='function')throw new Error('推进系统需要 id、order 和 advance');
    if(advanceRegistry.some(s=>s.id===system.id))throw new Error(`推进系统重复：${system.id}`);
    if(system.nextMinute!==undefined&&typeof system.nextMinute!=='function')throw new Error(`推进系统${system.id}的 nextMinute 必须是函数`);
    advanceRegistry.push(system);advanceRegistry.sort((a,b)=>a.order-b.order);
    return ()=>{const i=advanceRegistry.indexOf(system);if(i>=0)advanceRegistry.splice(i,1);};
}
