// 05 §5.3 / review 10-22 P1: a corpus office is loaded only as a narrowed instance of
// an office in its organization's charter (「可设职位表」). The shipped world has no
// charter yet for the white-stone watch and registry desks or the Huancheng gate
// (reported to the main session; world data is approved through the content pipeline,
// not here). Legal-request regressions therefore attach this test-local charter to a
// clone of the world, instead of letting corpus rows grant themselves powers.
export function charteredWorld(world,extra={}){
 const clone=structuredClone(world);
 clone.locations.find(l=>l.id==='loc_bs').offices=[
  {id:'office_test_bs_watch_desk',seat:'bld_bs_watch',authority:{operations:['receive_report','collect_fine','handle_case','guard']}},
  {id:'office_test_bs_arrest',seat:'bld_bs_watch',authority:{operations:['holding.open','move']}},
  {id:'office_test_bs_registry',seat:'bld_bs_office',authority:{operations:['receive_appeal','receive_claim']}},
 ];
 clone.locations.find(l=>l.id==='loc_hw').offices=[
  {id:'office_test_hw_gate',seat:'loc_hw_gate',authority:{operations:['receive_surrender']}},
 ];
 for(const [id,offices] of Object.entries(extra)){const place=clone.locations.find(l=>l.id===id);place.offices=[...(place.offices??[]),...offices];}
 return clone;
}
