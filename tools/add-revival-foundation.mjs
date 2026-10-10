import fs from'node:fs/promises';
const read=async path=>JSON.parse(await fs.readFile(path,'utf8'));
const rules=await read('world/meta/rules.json'),locations=await read('world/geo/locations.json'),routes=await read('world/geo/routes.json');
const points=[
    {location:'bld_hw_altar',settlement:'loc_hw',fee:10,minimumLevel:0,minutes:10,name:'河湾石坛',coordinates:[0.1,0.1],distance:0.2,
        description:'村东的低矮石坛，坛沿刻着历年修补者的名字。登记簿保存在遮雨石龛里。冒险者在这里登记复活点，登记费留作清理石坛和维护石龛。'},
    {location:'bld_bs_shrine',settlement:'loc_bs',fee:30,minimumLevel:5,minutes:15,name:'白石归途殿',coordinates:[24.1,0.1],distance:0.2,
        description:'白石镇东门附近的石殿，门廊设有供远行者等候的长凳。殿中登记达到五级的冒险者，登记费供殿舍维护，已登记者可以重新选择这里作为复活点。'},
];
for(const point of points){
    if(!locations.some(row=>row.id===point.location))locations.push({id:point.location,name:point.name,parent:point.settlement,scope:point.settlement,
        aliases:[],coordinates:point.coordinates,terrain:'平地',openHours:[0,1440],description:point.description,purpose:'复活登记祭坛'});
    if(!routes.some(row=>row.id===`route_${point.location}`))routes.push({id:`route_${point.location}`,from:point.settlement,to:point.location,
        lengthKm:point.distance,terrainMultiplier:1,modes:['walk','horse'],closedSeasons:[],toll:0,risk:0});
}
rules.death.points=points.map(({location,settlement,fee,minimumLevel,minutes})=>({location,settlement,fee,minimumLevel,minutes}));
for(const[path,value]of[['world/meta/rules.json',rules],['world/geo/locations.json',locations],['world/geo/routes.json',routes]])await fs.writeFile(path,JSON.stringify(value,null,2)+'\n');
