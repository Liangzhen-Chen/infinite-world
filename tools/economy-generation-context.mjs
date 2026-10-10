// Scope model context to one item: reading requirements are not manufacturing
// requirements, and constraints about one material must not leak into another.
export function economyGenerationContext(world,bones,item){
 const known=new Map(bones.items.map(row=>[row.id,row])),taught=new Set(item.book?.teaches??[]);
 const relevant=bones.recipes.filter(row=>taught.has(row.id)||row.output.item===item.id);
 const recipes=relevant.map(row=>({...row,process:row.process.split('；')[0],
   workplace:{woodworking:'旧磨坊木工工作台',cooking:'青灯酒馆厨房工作台',smithing:'铁匠铺砧台',weaving:'织坊手工工作台',pottery:'白石镇小窑'}[row.workstation],
   materials:row.materials.filter(material=>!known.get(material.item).tags?.includes('fuel')).map(material=>({...material,name:known.get(material.item).name,role:'加工原料'})),
   fuels:row.materials.filter(material=>known.get(material.item).tags?.includes('fuel')).map(material=>({...material,name:known.get(material.item).name,role:'炉火燃料，只供燃烧'})),
   byproducts:(row.byproducts??[]).map(material=>({...material,name:known.get(material.item).name,unitWeightKg:known.get(material.item).weight})),
   tools:row.tools.map(id=>({id,name:known.get(id).name})),output:{...row.output,name:known.get(row.output.item).name,unitWeightKg:known.get(row.output.item).weight}}));
 const skillIds=new Set([...item.checkBonus?.skills??[],...relevant.map(row=>row.skill)]);
 const notes=[];
 if(item.book)notes.push('这是工序或技能书。description必须明写识字100及阅读时间；阅读可在其他地点，不必坐在制作工作台前。学习检定使用智力而非制作手艺，不承诺读完必会。页数未设定，不给出页数。inspection只核对书页与文字，不要求制造或消耗原料。保存期针对这本书，不针对书中成品。');
 else notes.push('这是普通器物或原料，不是书。只讲它的结构、用途、来源和可观察状态，不给它添加识字或读书要求，不讲制作者学会技能的条件。若给了成品配方，只用它核对已有材质和加工方式。');
 const specific={
   item_herb:'这一束药草未辨明具体种类。没有香草、食材或已批准药方身份，description和inspection只写混合束外观、采收、待辨认与保存，不声称可煮汤、喂动物、洗伤口或配治疗药。',
   item_resin:'普通树脂只有黏接来料或引火用途，此处没有具体胶配方，不自行添加炭粉、木屑或骨胶配比。',
   item_rawhide:'生皮毛尚在、仅刮肉脂，未浸灰或鞣制，只是待进一步处理的来料；不添加绷带用途，不把任何地点写成已登记鞣制服务。',
   item_spindle:'这是无轴承的手持木杆加木盘纺锤，杆盘偏摆可检查，但不能仅凭黑色、磨亮或声音确定内部是否腐朽。',
   item_staff:'磨亮、敲响、颜色都是有限的外观线索，不能从单项表征断定心材已坏或完好。',
   item_wax_candle:'实际工序用麻纤维灯芯反复浸挂蜂蜡，不用棉芯，不浇模。',
   item_grain_sack:'保存上限针对布袋本身；袋中食物按各自期限，不把袋子180天改成所有粮食180天。',
   item_book_sew_sack:'这里是针线手工缝袋，只需织坊手工工作台，不是用织机缝合；织机未列为该配方工具。',
   item_oat_flour:'描述食用做法时对应已登记用途：煮粥为水沸后缓入粉并搅锅底，薄饼用厚锅底烙成；不另写冷水下锅粥或热石板烙饼。',
   item_clay:'含水过少的干裂泥可少量回润，渗水的过湿泥需摊晾去掉过量水，不把两种情况都写成加水回潮。',
   item_book_mill_oats:'本工序的小刀只用于开谷袋；碾磨由已有磨盘完成，不用小刀磨石、修磨盘齿口或碾粉。',
 };
 if(specific[item.id])notes.push(specific[item.id]);
 const locations=new Set([item.origin,...(relevant.length?[...bones.workstations.filter(station=>relevant.some(recipe=>station.kind===recipe.workstation)).map(row=>row.location)]:[])]);
 const input={wantedIds:[item.id],requiredCount:1,item:{...item,use:item.use.split('；')[0]},recipes,
   skills:world.skills.filter(row=>skillIds.has(row.id)).map(({id,name,attribute,stage})=>({id,name,attribute,stage})),
   authors:world.npcs.filter(row=>item.book?.author===row.id).map(({id,name,occupation})=>({id,name,occupation})),
   locations:world.locations.filter(row=>locations.has(row.id)).map(({id,name})=>({id,name})),
   storageFacts:{limitDays:item.shelfLifeDays,condition:item.shelfLifeDays===null?'storage只写环境、收放与损坏征兆；该字段省去数字和天日月年时限，检查频率也不在本字段给出':`storage写${item.shelfLifeDays}天；变质可早于上限，但保存条件不会把上限延长`},
   units:'weight以公斤表示一个单件的重量；minutes是分钟，readingMinutes只表示阅读时间。',notes};
 if(item.book)input.readingRequirements={minimumLiteracy:world.rules.books.minimumLiteracy,minutes:item.book.readingMinutes,checkAttribute:'智力',location:null,pageCount:null,
   prerequisites:(item.book.prerequisites??[]).map(row=>({...row,name:world.skills.find(skill=>skill.id===row.skill)?.name}))};
 return input;
}
