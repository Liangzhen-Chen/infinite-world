// Existing authorization records govern entry; the route alone is not consent.
export function assertLocationAccess(d,engine,destination,{authorization,companions=[],arrivalMinute=d.get('state','minute')}={}){
 const place=engine.byId.get(destination),access=place?.access;
 if(access?.mode!=='private'||access.requiresConsent!==true)return;
 const permission=authorization?d.get('state','records',authorization):null;
 const residents=new Set(access.residents??[]),grantor=engine.byId.get(permission?.grantor);
 const allowed=permission?.category==='authorization'&&permission.subject===destination&&permission.action==='enter_home'
  &&permission.grantee==='player'&&residents.has(permission.grantor)&&(grantor?.age??0)>=18
  &&permission.revoked!==true&&Number.isSafeInteger(permission.expires)&&permission.expires>arrivalMinute
  &&companions.every(id=>residents.has(id)||permission.guests?.includes(id));
 if(!allowed)throw new Error(`进入${place.name}需要成年住户给本人及同行者的有效许可；许可须覆盖抵达时刻，未进入或扣除路费`);
}
