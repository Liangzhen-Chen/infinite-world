// Secondary ranges start empty. Migration transfers existing animals into them.
export function speciesInHabitat(rules,catalog,habitat){
    const visitors=new Set((rules.wildlife?.migration?.routes??[]).filter(r=>r.from===habitat||r.to===habitat).map(r=>r.species));
    return catalog.filter(s=>s.wildlife&&(s.wildlife.habitat===habitat||visitors.has(s.id)));
}
export function migrationPath(){return ['state','records','wildlife:migration'];}
