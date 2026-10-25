// One conserved split/mix for ordinary carrying, summoned carriers and magic.
// Feature water and bound item portions are two views of the same liquid.
export function transferWaterState(source,destination,amount,{odor=false}={}){
 if(!Number.isSafeInteger(amount)||amount<=0||amount>source.waterMl||amount>destination.capacityMl-destination.waterMl-(destination.reservedWaterMl??0))throw Error('Invalid conserved water transfer');
 const src=structuredClone(source),dst=structuredClone(destination),total=dst.waterMl+amount;
 dst.turbidity=((dst.turbidity??0)*dst.waterMl+(src.turbidity??0)*amount)/total;
 dst.pathogenRisk=Math.max(dst.pathogenRisk??0,src.pathogenRisk??0);
 for(const field of ['saltMg','toxinUg']){
  const moved=(src[field]??0)*amount/src.waterMl;
  src[field]=(src[field]??0)-moved;dst[field]=(dst[field]??0)+moved;
 }
 if(odor)dst.odor=src.odor;
 src.waterMl-=amount;dst.waterMl=total;
 return {source:src,destination:dst};
}
