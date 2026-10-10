const integer=(value,min=0,max=1e9)=>{if(!Number.isSafeInteger(value)||value<min||value>max)throw new Error(`数值需在${min}到${max}之间`);return value;};
const requiredText=value=>{if(typeof value!=='string'||!value.trim()||value.length>1200)throw new Error('记录文字无效');return value.trim();};
export const activities={
    combat(d,args,id){
        const target=this.resolve(args.target,'npc'),npc=d.get('state','npcs',target),base=this.byId.get(target);
        if(!npc||npc.location!==d.get('state','location'))throw new Error('对手不在场');
        if(npc.status==='死亡')throw new Error('对手已经死亡');
        const weapon=args.weapon?this.resolve(args.weapon,'item'):null;
        if(weapon&&this.quantity(d,'player',weapon)<1)throw new Error('没有这件武器');
        const p=d.get('state','player'),level=base.level??1,maxHp=npc.maxHp??12+level*2,hp=npc.hp??maxHp;
        const offense=this.check(d,{attribute:'力量',difficulty:15},`${id}_attack`),defense=this.check(d,{attribute:'敏捷',difficulty:15},`${id}_defend`);
        const damage=offense.success?Math.max(1,Math.floor(p.attributes.力量/4)+p.level):0;
        const received=defense.success?0:Math.max(1,level+2),remaining=Math.max(0,hp-damage);
        d.set(['state','npcs',target,'hp'],remaining);d.set(['state','npcs',target,'maxHp'],maxHp);
        if(!remaining)d.set(['state','npcs',target,'status'],'死亡');
        else if(remaining<maxHp*0.25)d.set(['state','npcs',target,'activity'],'退让并呼救');
        if(received)this.health(d,{delta:-received},id);this.advance(d,1,id);
        d.set(['state','npcs',target,'trust'],Math.max(-100,npc.trust-5));
        if(weapon){const item=d.get('state','inventory',weapon);d.set(['state','inventory',weapon,'durability'],Math.max(0,item.durability-1));}
        d.say(`交锋结束，对方受伤${damage}，你受伤${received}`);return {target,damage,received,targetHp:remaining,morale:remaining<maxHp*0.25?'撤退':'交战'};
    },
    craft(d,args,id){
        const recipe=this.world.recipes.find(row=>row.id===args.recipe||row.name===args.recipe);
        if(!recipe)throw new Error('未登记这个配方');
        if(recipe.location&&recipe.location!==d.get('state','location'))throw new Error('不在所需工坊');
        if((d.get('state','skills',recipe.skill,'proficiency')??0)<recipe.minimumProficiency)throw new Error('技能不足以使用这个配方');
        for(const row of recipe.materials)if(this.quantity(d,'player',row.item)<row.amount)throw new Error(`缺少${this.byId.get(row.item).name}`);
        for(const row of recipe.materials)this.itemDelta(d,'player',row.item,-row.amount);
        this.advance(d,recipe.minutes,id);const outcome=this.check(d,{attribute:recipe.attribute??'智力',skill:recipe.skill,difficulty:recipe.difficulty},id);
        if(outcome.success){
            this.itemDelta(d,'player',recipe.output.item,recipe.output.quantity);
            d.set(['state','crafted',`crafted_${id}`],{item:recipe.output.item,quantity:recipe.output.quantity,maker:'player',name:d.get('state','player','name'),minute:d.get('state','minute')});
            d.say(`制成${this.byId.get(recipe.output.item).name}`);
        }
        return {recipe:recipe.id,...outcome};
    },
    research(d,args,id){
        if(args.operation==='start'){
            const skills=(args.skills??[]).map(name=>this.resolve(name,'skill'));if(!skills.length)throw new Error('研究缺少相关知识');
            if(skills.some(skill=>!d.get('state','skills',skill)))throw new Error('没有掌握相关技能');
            const key=`research_${id}`;d.set(['state','projects',key],{id:key,type:'研究',name:requiredText(args.name),concept:requiredText(args.concept),skills,stage:'构想',progress:0,investment:0,days:[],result:null});
            return {project:key,stage:'构想'};
        }
        const key=args.project,project=d.get('state','projects',key);if(!project||project.type!=='研究')throw new Error('没有这个研究项目');
        const cost=integer(args.coins??5,1,1000),minutes=integer(args.minutes??120,30,480);
        if(d.get('state','player','coins')<cost)throw new Error('研究资金不足');
        d.set(['state','player','coins'],d.get('state','player','coins')-cost);this.advance(d,minutes,id);
        const outcome=this.check(d,{attribute:'智力',skill:project.skills[0],difficulty:20},id);
        const progress=project.progress+(outcome.success?1:0),days=[...new Set([...project.days,Math.floor(d.get('state','minute')/1440)])];
        const maximum=Math.max(...project.skills.map(skill=>d.get('state','skills',skill,'proficiency')??0));
        const stage=progress>=3&&days.length>=3&&maximum>=300?'打磨':progress>=1?'原型':'构想';
        d.set(['state','projects',key],{...project,progress,days,investment:project.investment+cost,stage});
        return {project:key,stage,...outcome,note:stage==='打磨'?'研究成果需进入受限实体登记，才能获得规则认可':'原型未被系统承认，不能宣称已学会新法术'};
    },
    settlement(d,args,id){
        const settlement=this.resolve(args.settlement,'loc'),row=d.get('state','settlements',settlement);
        if(!row)throw new Error('没有该聚落公共账目');
        const authorization=d.get('state','records',args.authorization);
        if(!authorization||authorization.category!=='authorization'||authorization.settlement!==settlement)throw new Error('公共物资需要已成立的授权');
        if(args.operation==='start_project'){
            const wood=integer(args.wood,1,10000),stone=integer(args.stone??0,0,10000),days=integer(args.days,1,365);
            if(row.wood<wood||row.stone<stone)throw new Error('公共工程材料不足');
            d.set(['state','settlements',settlement,'wood'],row.wood-wood);d.set(['state','settlements',settlement,'stone'],row.stone-stone);
            const project=`project_${id}`;d.set(['state','projects',project],{id:project,type:'工程',name:requiredText(args.name),settlement,remainingDays:days,wood,stone,status:'施工中',beneficiaries:args.beneficiaries??[]});
            return {project};
        }
        throw new Error('未知聚落事务');
    },
    quest(d,args,id){
        if(args.operation==='publish'){
            const publisher=this.resolve(args.publisher,'npc'),npc=d.get('state','npcs',publisher),grade=args.grade;
            if(!(grade in this.rules.quests.quotaUnits))throw new Error('任务等级无效');
            const unit=this.rules.quests.quotaUnits[grade],month=Math.floor(d.get('state','minute')/(1440*30));
            const personal=args.personal===true,quota=this.byId.get(publisher).monthlyQuotaD??0,used=d.get('state','questQuota',`${month}_${publisher}`)??0;
            if(!personal&&used+unit>quota)throw new Error('身份或本月任务发布额度不足');
            if(personal&&grade!=='D')throw new Error('未登记官职的私人任务只能发布D级');
            const reward=integer(args.reward,20,1e6);if(npc.coins<reward)throw new Error('发布者无法托管报酬');
            const objective=args.objective;if(!objective||!['deliver','visit','build'].includes(objective.type))throw new Error('任务完成条件必须可验证');
            const quest=`quest_${id}`;d.set(['state','npcs',publisher,'coins'],npc.coins-reward);
            d.set(['state','quests',quest],{id:quest,publisher,grade,reward,escrow:reward,objective:structuredClone(objective),content:requiredText(args.content),status:'公开',taker:null});
            if(!personal)d.set(['state','questQuota',`${month}_${publisher}`],used+unit);return {quest};
        }
        const quest=d.get('state','quests',args.quest);if(!quest)throw new Error('不存在这个任务');
        if(args.operation==='accept'){
            if(quest.status!=='公开')throw new Error('任务当前不能接受');d.set(['state','quests',quest.id],{...quest,status:'进行中',taker:'player'});return {quest:quest.id,status:'进行中'};
        }
        if(args.operation!=='complete'||quest.status!=='进行中'||quest.taker!=='player')throw new Error('任务不在可结算状态');
        const objective=quest.objective;let done=false;
        if(objective.type==='visit')done=Boolean(d.get('state','discoveries',this.resolve(objective.location)));
        if(objective.type==='build')done=d.get('state','projects',objective.project,'status')==='已完成';
        if(objective.type==='deliver'){
            const item=this.resolve(objective.item,'item'),amount=integer(objective.quantity,1,100000);
            if(d.get('state','location')!==d.get('state','npcs',quest.publisher,'location'))throw new Error('委托人不在场，不能交付');
            if(this.quantity(d,'player',item)<amount)throw new Error('任务交付物品不足');this.itemDelta(d,'player',item,-amount);this.itemDelta(d,quest.publisher,item,amount);done=true;
        }
        if(!done)throw new Error('没有可验证的完成证据');
        d.set(['state','player','coins'],d.get('state','player','coins')+quest.escrow);d.set(['state','quests',quest.id],{...quest,status:'已完成',escrow:0});d.say(`任务完成，获得${quest.reward}铜`);
        return {quest:quest.id,reward:quest.reward};
    },
    create(d,args,id){
        const type=args.type,name=requiredText(args.name);
        if(!['npc','bld','org','item','skill','spell'].includes(type))throw new Error('实体类型无效');
        try{this.resolve(name);throw new Error('名称已存在，请沿用现有编号');}catch(error){if(!error.message.includes('未登记'))throw error;}
        const entity={id:`${type}_created_${id.replace(/[^a-zA-Z0-9_-]/g,'_')}`,name,aliases:[],scope:d.get('state','location'),...args.data};
        if(entity.id!==`${type}_created_${id.replace(/[^a-zA-Z0-9_-]/g,'_')}`||entity.name!==name)throw new Error('不能覆盖系统分配的编号或名称');
        if(['skill','spell'].includes(type)){
            const project=d.get('state','projects',args.project);if(!project||project.stage!=='打磨')throw new Error('新技能或法术需要完成多日研究');
            if(type==='spell')throw new Error('自创法术效果还需按规则目录审查，当前不能直接登记');
            entity.attribute='智力';entity.profession=null;entity.source=args.project;
        }
        if(type==='npc'){
            integer(entity.age,0,150);requiredText(entity.occupation);requiredText(entity.notes);
            entity.location=d.get('state','location');entity.flags={minor:entity.age<18,romanceable:entity.age>=18};entity.coins=0;entity.inventory={};entity.services=[];
            d.set(['state','npcs',entity.id],{id:entity.id,name,location:entity.location,coins:0,inventory:{},trust:0,affection:0,developments:[]});
        }
        if(type==='item')throw new Error('物品只允许由受限配方制造，不能凭空创建');
        if(type==='bld')throw new Error('建筑需要工程完工证明，不能凭空创建');
        if(type==='org'){entity.founder='player';entity.notes=requiredText(entity.notes);}
        d.set(['state','created',entity.id],entity);return {entity:entity.id};
    },
};
