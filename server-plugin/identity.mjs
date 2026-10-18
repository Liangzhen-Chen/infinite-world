// Identity keys name appearances; they never create a second economic entity.
const actor=(e,s,x)=>x==='player'?s.player:s.npcs?.[x]??s.creatures?.[x]??s.created?.[x]??e.byId?.get(x)??{};
export function identities(engine,state,x,{time=state.minute??0}={}){
    const a=actor(engine,state,x),rows=a.identities??engine.byId?.get(x)?.identities;
    return rows?.length?rows.filter(k=>(k.since??0)<=time&&(k.until===undefined||k.until>time)).map(k=>({...k})):[{key:x,name:a.name??engine.byId?.get(x)?.name??x,look:a.look??x,since:0}];
}
export function identify(engine,document,observer,x,{time=document.state.minute??0}={}){
    const s=document.state,keys=identities(engine,s,x,{time});
    if(observer===x)return keys.at(-1)?.key??null;
    const a=actor(engine,s,observer),known=[...Object.values(document.memories??{}).filter(m=>m.subject===observer),...(a.memoryStream??[]),
        ...Object.values(s.records??{}).filter(r=>r.category==='knowledge'&&r.observer===observer||r.category==='world_event'&&(r.witnesses??[]).includes(observer))]
        .filter(r=>(r.minute??0)<=time&&!r.retracted);
    const seen=new Set(known.flatMap(r=>[r.identityKey,r.actorAs,r.keyA,r.keyB,...r.identities??[]]).filter(Boolean));
    const current=keys.at(-1);
    // An unrecognized appearance remains its own key, never the hidden legal name.
    const links=known.filter(r=>(r.kind??r.verb)==='identity_linked');
    const linked=new Set([current?.key]);
    for(let i=0;i<links.length;i++)for(const link of links)if(linked.has(link.keyA)||linked.has(link.keyB)){linked.add(link.keyA);linked.add(link.keyB);}
    const matched=keys.filter(k=>(k.look===current?.look||linked.has(k.key))&&(seen.has(k.key)||known.some(r=>r.look===k.look)));
    return matched.at(-1)?.key??current?.key??null;
}
