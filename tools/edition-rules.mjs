// Rows that later cards hung on entities an edition stripper removes — the far
// polities' military polities, armies and mercenaries, war fronts, recruitment
// places, village quest offers and commissions at removed sites — did not exist
// before that batch either. Like withoutMonsterSociety2, a row goes when any
// quoted id in it names a removed entity.
export function pruneRuleDependents(rules,gone){
 if(!rules)return rules;
 const names=row=>[...JSON.stringify(row).matchAll(/"([a-z]+_[a-z0-9_]+)"/g)].some(m=>gone.has(m[1]));
 const m=rules.military;
 if(m){
  if(Array.isArray(m.recruit?.places))m.recruit.places=m.recruit.places.filter(p=>!gone.has(p));
  for(const k of ['polities','armies','mercenaries'])if(Array.isArray(m[k]))m[k]=m[k].filter(r=>!names(r));
 }
 const w=rules.warDiplomacy;
 if(Array.isArray(w?.sources)){const armies=new Set((m?.armies??[]).map(a=>a.id));w.sources=w.sources.filter(s=>!names(s)&&(s.armies??[]).every(id=>armies.has(id)));}
 const q=rules.questSources;
 if(q)for(const k of ['wildlife','commissions'])if(Array.isArray(q[k]))q[k]=q[k].filter(r=>!names(r));
 if(q)for(const k of ['funds','publishers'])if(q[k])q[k]=Object.fromEntries(Object.entries(q[k]).filter(([board,source])=>!gone.has(board)&&!gone.has(source)));
 return rules;
}
