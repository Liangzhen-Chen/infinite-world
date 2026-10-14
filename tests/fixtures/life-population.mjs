// T131/T132: deaths, births and migrations change settlement population and record
// before/after on each event. Famine losses are not recorded here, so a ledger that
// equals base + recorded life changes still proves no unexplained (famine) loss.
const net=change=>change?change.after-change.before:0;
export function recordedLifeChange(state,settlement){
 const family=state.family??{};
 let total=0;
 for(const row of [...Object.values(family.births??{}),...Object.values(family.deaths??{})])if(row.settlement===settlement)total+=net(row.population);
 for(const m of Object.values(family.migrations??{})){
  if(m.from?.settlement===settlement)total+=net(m.population?.from);
  if(m.to?.settlement===settlement)total+=net(m.population?.to);
 }
 return total;
}
