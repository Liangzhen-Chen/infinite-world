const pending=new WeakMap();
const KEY='fields_map',NS='http://www.w3.org/2000/svg';
const knowledgeText={experienced:'亲历',reliable:'可靠转述',rumor:'传闻'};
const modeText={walk:'步行',horse:'骑马',cart:'乘车',boat:'乘船'};

export function zoomBounds(box,factor,anchor={x:box.x+box.width/2,y:box.y+box.height/2}){
    const width=Math.max(.02,Math.min(10000,box.width/factor)),ratio=width/box.width,height=box.height*ratio;
    return {x:anchor.x-(anchor.x-box.x)*ratio,y:anchor.y-(anchor.y-box.y)*ratio,width,height};
}

// Layout uses screen pixels. Geography remains unchanged; leaders show the
// original positions when coincident markers or their labels need separating.
export function layoutMapLabels(rows,{width,height}){
    const margin=12,gap=4,radius=7,markers=[];
    const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
    const intersects=(a,b)=>a.x<b.x+b.width+gap&&a.x+a.width+gap>b.x&&a.y<b.y+b.height+gap&&a.y+a.height+gap>b.y;
    const onScreen=row=>row.x>=0&&row.x<=width&&row.y>=0&&row.y<=height;
    const placed=rows.map(row=>{
        if(!onScreen(row))return {...row,label:null};
        const origin={x:clamp(row.x,margin,width-margin),y:clamp(row.y,margin,height-margin)};
        let marker=origin;
        for(let ring=0;ring<=8;ring++){
            const distance=ring*20,candidates=ring?[[0,distance],[0,-distance],[distance,0],[-distance,0],[distance,distance],[-distance,-distance]]:[[0,0]];
            const free=candidates.map(([dx,dy])=>({x:clamp(origin.x+dx,margin,width-margin),y:clamp(origin.y+dy,margin,height-margin)}))
                .find(point=>markers.every(other=>Math.hypot(point.x-other.x,point.y-other.y)>=radius*2+gap));
            if(free){marker=free;break;}
        }
        markers.push(marker);return {...row,marker};
    });
    const occupied=markers.map(point=>({x:point.x-radius,y:point.y-radius,width:radius*2,height:radius*2}));
    for(const row of placed){
        if(!row.marker)continue;
        const w=row.width,h=row.height,point=row.marker,candidates=[];
        const xs=[point.x+12,point.x-w-12,point.x-w/2];
        for(let step=0;step<Math.ceil(height/(h+gap));step++)for(const y of [point.y-h-12-step*(h+gap),point.y+12+step*(h+gap)])
            for(const x of xs)candidates.push({x:clamp(x,margin,width-margin-w),y:clamp(y,margin,height-margin-h),width:w,height:h});
        row.label=candidates.find(rect=>rect.x>=margin&&rect.y>=margin&&rect.x+w<=width-margin&&rect.y+h<=height-margin&&!occupied.some(other=>intersects(rect,other)))??null;
        if(row.label)occupied.push(row.label);
    }
    return placed;
}

// Pointer events cover mouse dragging and two-finger pinch on the same viewport.
export function bindMapGestures(svg,getBox,setBox){
    const pointers=new Map();let previous=null,suppressClick=false;
    const sample=()=>{
        const rows=[...pointers.values()],center={x:rows.reduce((v,p)=>v+p.x,0)/rows.length,y:rows.reduce((v,p)=>v+p.y,0)/rows.length};
        return {...center,distance:rows.length>1?Math.hypot(rows[1].x-rows[0].x,rows[1].y-rows[0].y):0};
    };
    const point=(x,y)=>{const rect=svg.getBoundingClientRect(),box=getBox();return {x:box.x+(x-rect.left)/rect.width*box.width,y:box.y+(y-rect.top)/rect.height*box.height};};
    svg.addEventListener('wheel',event=>{event.preventDefault();setBox(zoomBounds(getBox(),Math.exp(-event.deltaY*.002),point(event.clientX,event.clientY)));},{passive:false});
    svg.addEventListener('pointerdown',event=>{
        if(event.button!==0)return;if(!pointers.size)suppressClick=false;
        pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});previous=sample();
        if(pointers.size>1)suppressClick=true;
        (event.target.setPointerCapture?event.target:svg).setPointerCapture(event.pointerId);
    });
    svg.addEventListener('pointermove',event=>{
        if(!pointers.has(event.pointerId))return;
        pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});const next=sample(),rect=svg.getBoundingClientRect();let box=getBox();
        if(previous){
            if(Math.hypot(next.x-previous.x,next.y-previous.y)>3)suppressClick=true;
            box={...box,x:box.x-(next.x-previous.x)/rect.width*box.width,y:box.y-(next.y-previous.y)/rect.height*box.height};
            if(previous.distance>0&&next.distance>0){const anchor={x:box.x+(next.x-rect.left)/rect.width*box.width,y:box.y+(next.y-rect.top)/rect.height*box.height};box=zoomBounds(box,next.distance/previous.distance,anchor);}
            setBox(box);
        }
        previous=next;
    });
    const release=event=>{pointers.delete(event.pointerId);previous=pointers.size?sample():null;};
    svg.addEventListener('pointerup',release);svg.addEventListener('pointercancel',release);
    svg.addEventListener('click',event=>{if(suppressClick){event.preventDefault();event.stopPropagation();}},{capture:true});
}

export function renderMapPanel(container,data,{api,chatContext=null,isCurrent=()=>true}={}){
    const doc=container.ownerDocument,fragment=doc.createDocumentFragment();
    const node=(tag,text)=>{const e=doc.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
    const button=(text,action)=>{const e=node('button',text);e.type='button';e.onclick=action;return e;};
    const svgNode=(tag,attrs={},text)=>{const e=doc.createElementNS(NS,tag);for(const [key,value]of Object.entries(attrs))e.setAttribute(key,value);if(text!==undefined)e.textContent=text;return e;};
    const campaignId=data.reference?.campaignId;
    const saved=chatContext?.chatMetadata?.[KEY],marks=structuredClone(saved?.campaignId===campaignId?saved.marks??{}:{});
    const current=()=>container.isConnected&&isCurrent()&&chatContext?.chatMetadata?.infinite_fields?.campaignId===campaignId;
    fragment.append(node('p',`${data.time} · ${data.weather}`));
    const toolbar=node('div');toolbar.className='fields-map-toolbar';fragment.append(toolbar);
    const level=node('select');level.setAttribute('aria-label','地图层级');
    for(const [index,name]of data.levels.entries()){const e=node('option',name);e.value=index;level.append(e);}level.value='2';
    const levelLabel=node('label','层级');levelLabel.append(level);toolbar.append(levelLabel);
    const area=node('select');area.setAttribute('aria-label','地图片区');const areaLabel=node('label','片区');areaLabel.append(area);toolbar.append(areaLabel);
    const destination=node('select');destination.setAttribute('aria-label','地图目的地');const destinationLabel=node('label','地点');destinationLabel.append(destination);toolbar.append(destinationLabel);
    destination.onchange=()=>{const row=byId.get(destination.value);if(row)return select(row);};
    const svg=svgNode('svg',{role:'group','aria-label':'已知地点地图',preserveAspectRatio:'none',tabindex:'0'});svg.classList.add('fields-map-viewport');fragment.append(svg);
    const legend=node('div');legend.className='fields-map-legend';for(const [kind,text]of Object.entries(knowledgeText)){const e=node('span',text);e.className=`map-${kind}`;legend.append(e);}fragment.append(legend);
    fragment.append(node('p','滚轮或双指缩放，拖动平移；封路以红色虚线表示。未获知地点不显示。'));
    const details=node('section');details.className='fields-map-details';fragment.append(details);
    let box={x:0,y:0,width:10,height:6},selected=null,requestNumber=0,shown=[],roadPoints=[],symbols=[];
    const byId=new Map([...data.locations,...data.transit??[]].map(row=>[row.id,row]));
    const viewport=()=>{const rect=svg.getBoundingClientRect();return {width:svg.clientWidth||rect.width||800,height:svg.clientHeight||rect.height||450};};
    const setBox=next=>{
        box=next;svg.setAttribute('viewBox',`${box.x} ${box.y} ${box.width} ${box.height}`);
        const size=viewport(),sx=box.width/size.width,sy=box.height/size.height;
        const rows=symbols.map(({row,label})=>{
            const bounds=label.getBBox?.(),measured=bounds?.width?bounds:{x:0,y:-12,width:[...label.textContent].length*14,height:16};
            return {id:row.id,x:(row.coordinates[0]-box.x)/sx,y:(-row.coordinates[1]-box.y)/sy,width:measured.width,height:measured.height,measured};
        });
        for(const [index,placement]of layoutMapLabels(rows,size).entries()){
            const {row,label,circle,ring,leader}=symbols[index],point=placement.marker??placement;
            const x=box.x+point.x*sx,y=box.y+point.y*sy;
            circle.setAttribute('cx',x);circle.setAttribute('cy',y);circle.setAttribute('r',5*sx);
            if(ring){ring.setAttribute('cx',x);ring.setAttribute('cy',y);ring.setAttribute('r',8*sx);}
            label.style.display=placement.label?'':'none';
            if(placement.label){
                const rect=placement.label,bounds=placement.measured;
                label.setAttribute('transform',`matrix(${sx} 0 0 ${sy} ${box.x+(rect.x-bounds.x)*sx} ${box.y+(rect.y-bounds.y)*sy})`);
                const endX=box.x+Math.max(rect.x,Math.min(point.x,rect.x+rect.width))*sx,endY=box.y+Math.max(rect.y,Math.min(point.y,rect.y+rect.height))*sy;
                leader.setAttribute('d',`M ${row.coordinates[0]} ${-row.coordinates[1]} L ${x} ${y} L ${endX} ${endY}`);
            }else leader.setAttribute('d','');
        }
    };
    const fit=()=>{
        const xs=roadPoints.map(row=>row.coordinates[0]),ys=roadPoints.map(row=>-row.coordinates[1]);
        if(!xs.length){setBox({x:-1,y:-1,width:2,height:1.2});return;}
        const width=Math.max(.02,Math.max(...xs)-Math.min(...xs)),height=Math.max(.02,Math.max(...ys)-Math.min(...ys)),pad=[1.4,1.25,1.1,1][Number(level.value)];
        const size=viewport(),aspect=size.width/size.height,w=Math.max(width*size.width/Math.max(1,size.width-112),height*size.width/Math.max(1,size.height-96))*pad,h=w/aspect;
        setBox({x:(Math.min(...xs)+Math.max(...xs)-w)/2,y:(Math.min(...ys)+Math.max(...ys)-h)/2,width:w,height:h});
    };
    const draw=()=>{
        const index=Number(level.value);shown=data.locations.filter(row=>row.hierarchy[index].id===area.value);
        const ids=new Set(shown.map(row=>row.id));
        roadPoints=[...shown,...(index<3?(data.transit??[]).filter(stop=>data.routes.some(edge=>edge.from===stop.id&&ids.has(edge.to)||edge.to===stop.id&&ids.has(edge.from))):[])];
        const roadIds=new Set(roadPoints.map(row=>row.id));svg.classList.toggle('map-sparse',shown.length<=5);svg.replaceChildren();destination.replaceChildren();symbols=[];
        const placeholder=node('option','选择已知地点');placeholder.value='';destination.append(placeholder);
        for(const row of shown){const option=node('option',`${row.name} · ${knowledgeText[row.knowledge]}`);option.value=row.id;destination.append(option);}destination.value=selected&&ids.has(selected.id)?selected.id:'';
        for(const edge of data.routes.filter(row=>roadIds.has(row.from)&&roadIds.has(row.to))){
            const from=byId.get(edge.from).coordinates,to=byId.get(edge.to).coordinates;
            const line=svgNode('line',{x1:from[0],y1:-from[1],x2:to[0],y2:-to[1],class:`map-road${edge.closed?' map-closed':''}`,'vector-effect':'non-scaling-stroke'});
            line.append(svgNode('title',{},`${byId.get(edge.from).name} → ${byId.get(edge.to).name} · ${edge.closed?'封路':edge.condition} · ${edge.lengthKm.toFixed(2)}公里`));svg.append(line);
        }
        for(const row of shown){
            const g=svgNode('g',{'data-place':row.id,role:'button',tabindex:'0','aria-label':`${row.name} · ${knowledgeText[row.knowledge]}`});
            const circle=svgNode('circle',{cx:row.coordinates[0],cy:-row.coordinates[1],class:`map-${row.knowledge}`,'vector-effect':'non-scaling-stroke'});
            const label=svgNode('text',{x:0,y:0},`${marks[row.id]?'⚑ ':''}${row.name}${row.current?' · 当前':''}`),leader=svgNode('path',{class:'map-label-leader','vector-effect':'non-scaling-stroke'});
            g.append(leader,circle,label);g.onclick=()=>select(row);g.onkeydown=event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();select(row);}};svg.append(g);
            const ring=selected?.id===row.id?svgNode('circle',{class:'map-selected','vector-effect':'non-scaling-stroke'}):null;if(ring)g.append(ring);
            symbols.push({row,label,circle,ring,leader});
        }
        setBox(box);
    };
    const changeArea=()=>{
        const index=Number(level.value),groups=new Map(data.locations.map(row=>[row.hierarchy[index].id,row.hierarchy[index].name]));area.replaceChildren();
        for(const [id,name]of groups){const e=node('option',name);e.value=id;area.append(e);}
        area.value=(selected??byId.get(data.location))?.hierarchy[index].id??groups.keys().next().value??'';
        draw();fit();
    };
    level.onchange=changeArea;area.onchange=()=>{draw();fit();};
    toolbar.append(button('放大',()=>setBox(zoomBounds(box,1.4))),button('缩小',()=>setBox(zoomBounds(box,1/1.4))),button('复位',fit));
    bindMapGestures(svg,()=>box,setBox);
    svg.addEventListener('keydown',event=>{if(['+','=','-'].includes(event.key)){event.preventDefault();setBox(zoomBounds(box,event.key==='-'?1/1.4:1.4));}});
    const select=async row=>{
        selected=row;draw();const request=++requestNumber;details.replaceChildren(node('h3',row.name),node('p',`获知方式：${knowledgeText[row.knowledge]}`));
        const label=node('label','地点标记'),input=node('input');input.setAttribute('aria-label','地点标记');input.maxLength=120;input.value=marks[row.id]??'';label.append(input);details.append(label);
        const status=node('p');status.setAttribute('role','status');
        const save=button('保存标记',async()=>{
            if(!current()||!chatContext.saveChat){status.textContent='聊天已切换或当前聊天不能保存标记，请重新打开地图。';return;}
            save.disabled=true;const previous=chatContext.chatMetadata[KEY],next=previous?.campaignId===campaignId?structuredClone(previous):{campaignId,marks:{}};next.marks??={};
            if(input.value.trim())next.marks[row.id]=input.value.trim();else delete next.marks[row.id];chatContext.chatMetadata[KEY]=next;
            try{await chatContext.saveChat();if(next.marks[row.id])marks[row.id]=next.marks[row.id];else delete marks[row.id];status.textContent='标记已保存';draw();}
            catch{if(chatContext.chatMetadata[KEY]===next)chatContext.chatMetadata[KEY]=previous;status.textContent='保存失败，文字仍保留，请重试。';}finally{save.disabled=false;}
        });details.append(save,status);
        if(row.current){details.append(node('p','你已在这里。'));return;}
        const preview=node('div');preview.textContent='正在比较路线…';details.append(preview);
        try{
            const result=await api('ui/routes',{destination:row.id});if(request!==requestNumber||!container.isConnected||!isCurrent())return;
            if(result.reference?.sequence!==data.reference?.sequence)throw Error('存档已变化，请重新打开地图。');
            preview.replaceChildren(node('p','按当前季节与天气估算，出发时重新核算。'));
            for(const option of result.options){
                const card=node('article');card.className='fields-map-route';card.dataset.routeId=option.id;
                card.append(node('h4',`${modeText[option.mode]} · ${option.minutes}分钟 · ${option.cost}铜`),node('p',`经由：${option.via.join(' → ')}`),
                    node('p',option.risk===null?'风险：未知，尚无这条路的可靠风险记录。':`已知路段最高风险：${option.risk}`));
                card.append(button('填入出行意图',()=>{
                    if(!current()){status.textContent='聊天已切换，请重新打开地图。';return;}
                    const field=doc.querySelector('#send_textarea');if(!field){status.textContent='未找到输入框。';return;}
                    field.value=option.intent;field.dispatchEvent(new doc.defaultView.Event('input',{bubbles:true}));
                    doc.querySelector('#fields-dialog .fields-ledger-header button')?.click();field.focus();
                }));preview.append(card);
            }
            if(!result.options.length)preview.append(node('p','没有已知且当前可通行的路线。'));
            for(const unavailable of result.unavailable)preview.append(node('p',`${modeText[unavailable.mode]}：${unavailable.reason}`));
        }catch(error){if(request===requestNumber&&container.isConnected)preview.textContent=`路线读取失败：${error.message}`;}
    };
    container.classList.add('fields-map');container.replaceChildren(fragment);changeArea();
    const Observer=doc.defaultView?.ResizeObserver;
    if(Observer){const observer=new Observer(()=>{if(svg.isConnected)fit();else observer.disconnect();});observer.observe(svg);}
    if(!data.locations.length)details.textContent='尚无可显示的已发布地点。';
}

export function registerMapPanel({registerPanel}){
    registerPanel({id:'map',title:'地图',render:async(container,context)=>{
        const request={};pending.set(container,request);container.textContent='正在读取已知地图…';
        const getCurrent=context.getChatContext??(()=>null),chatContext=getCurrent(),chatId=chatContext?.chatId,metadata=chatContext?.chatMetadata,campaignId=metadata?.infinite_fields?.campaignId;
        const isCurrent=()=>{const current=getCurrent();return current?.chatId===chatId&&current?.chatMetadata===metadata&&current?.chatMetadata?.infinite_fields?.campaignId===campaignId;};
        try{const data=await context.api('ui/map');if(container.isConnected&&pending.get(container)===request&&isCurrent())renderMapPanel(container,data,{api:context.api,chatContext,isCurrent});}
        catch{if(container.isConnected&&pending.get(container)===request)container.textContent='地图读取失败，请关闭面板后重试。';}
    }});
}
