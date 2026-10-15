// Secondary ranges start empty. Migration transfers existing animals into them.
// K8 derived ranges list their own species (see wildlife-habitats.mjs).
export function speciesInHabitat(rules,catalog,habitat){
    const visitors=new Set((rules.wildlife?.migration?.routes??[]).filter(r=>r.from===habitat||r.to===habitat).map(r=>r.species));
    const derived=rules.wildlife?.habitats?.find(h=>h.id===habitat&&h.derived)?.species??{};
    return catalog.filter(s=>s.wildlife&&(s.wildlife.habitat===habitat||visitors.has(s.id)||Object.hasOwn(derived,s.id)));
}
export function migrationPath(){return ['state','records','wildlife:migration'];}
