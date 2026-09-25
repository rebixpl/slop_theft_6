/* Code-native game HUD and cartography controls. No network, SDK or map-image dependency. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.NeonCoastUI=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const scale=(w,h,v)=>Math.min(w/4400,h/4400)*v.zoom;
function project(x,z,w,h,v){const s=scale(w,h,v);return[w/2+(x-v.x)*s,h/2+(z-v.z)*s];}
function unproject(x,y,w,h,v){const s=scale(w,h,v);return[v.x+(x-w/2)/s,v.z+(y-h/2)/s];}
function zoomAt(v,factor,x,y,w,h){const anchor=unproject(x,y,w,h,v);v.zoom=clamp(v.zoom*factor,1,16);const moved=unproject(x,y,w,h,v);v.x+=anchor[0]-moved[0];v.z+=anchor[1]-moved[1];}
function filterPlaces(places,query,category){const q=query.trim().toLowerCase();return places.filter(p=>(category==='all'||p.type===category)&&p.name.toLowerCase().includes(q));}
// Select whole labels in screen space. Zooming reveals names as they separate.
function placeMapLabels(labels,width,height,padding=5){
 const placed=[],rects=[];
 for(const label of [...labels].sort((a,b)=>(b.priority||0)-(a.priority||0))){
  const q={left:label.x-label.width/2-padding,right:label.x+label.width/2+padding,top:label.y-label.height-padding,bottom:label.y+padding};
  if(q.left<0||q.top<0||q.right>width||q.bottom>height)continue;
  if(rects.some(r=>q.left<r.right&&q.right>r.left&&q.top<r.bottom&&q.bottom>r.top))continue;
  rects.push(q);placed.push(label);
 }
 return placed;
}
function create({canvas,view,redraw,pin,player,locations,toggleMap}){
 const $=id=>document.getElementById(id),overlay=$('map-overlay'),list=$('map-locations'),search=$('map-search');
 let dragging=null,dragged=false,category='all',previousFocus=null;
 function coordinates(event){const r=canvas.getBoundingClientRect();return[(event.clientX-r.left)*canvas.width/r.width,(event.clientY-r.top)*canvas.height/r.height];}
 function updateScale(){const label=$('map-zoom-level');label.textContent=view.zoom.toFixed(1)+'×';$('map-zoom-out').disabled=view.zoom<=1;$('map-zoom-in').disabled=view.zoom>=16;}
 function refresh(){if(!overlay.classList.contains('show'))return;const r=canvas.parentElement.getBoundingClientRect(),ratio=Math.min(window.devicePixelRatio||1,1.5),w=Math.max(1,Math.round(r.width*ratio)),h=Math.max(1,Math.round(r.height*ratio));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}updateScale();redraw();}
 function zoom(factor,position=[canvas.width/2,canvas.height/2]){zoomAt(view,factor,...position,canvas.width,canvas.height);refresh();}
 function renderPlaces(){
  list.replaceChildren();const matches=filterPlaces(locations,search.value,category);$('map-result-count').textContent=matches.length+' locations';
  for(const place of matches){
   const button=document.createElement('button');button.type='button';button.className='map-place';button.dataset.place=place.name;
   const icon=document.createElement('span');icon.className='place-symbol '+place.type;icon.setAttribute('aria-hidden','true');icon.textContent=place.type==='service'?'+':place.type==='activity'?'◇':'◉';
   const name=document.createElement('span');name.textContent=place.name;const type=document.createElement('small');type.textContent=place.type==='place'?'District':place.type==='service'?'Service':'Activity';name.append(type);button.append(icon,name);
   button.addEventListener('click',()=>{if(pin(place.x,place.z,place.name)!==false){for(const el of list.children)el.classList.toggle('selected',el===button);view.x=place.x;view.z=place.z;view.zoom=Math.max(3,view.zoom);refresh();}});
   list.append(button);
  }
  if(!matches.length){const p=document.createElement('p');p.className='map-empty';p.textContent='No matching locations.';list.append(p);}
 }
 search.addEventListener('input',renderPlaces);
 document.querySelectorAll('[data-map-category]').forEach(button=>button.addEventListener('click',()=>{category=button.dataset.mapCategory;document.querySelectorAll('[data-map-category]').forEach(el=>el.setAttribute('aria-pressed',String(el===button)));renderPlaces();}));
 canvas.addEventListener('wheel',event=>{event.preventDefault();zoom(event.deltaY<0?1.2:1/1.2,coordinates(event));},{passive:false});
 canvas.addEventListener('pointerdown',event=>{if(event.button!==0)return;dragged=false;dragging={id:event.pointerId,x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY};canvas.setPointerCapture(event.pointerId);});
 canvas.addEventListener('pointermove',event=>{
  const q=coordinates(event),world=unproject(...q,canvas.width,canvas.height,view);$('map-coordinates').textContent=Math.round(world[0])+' / '+Math.round(world[1]);
  if(!dragging||dragging.id!==event.pointerId)return;
  if(Math.hypot(event.clientX-dragging.startX,event.clientY-dragging.startY)>5)dragged=true;
  if(dragged){const r=canvas.getBoundingClientRect(),s=scale(canvas.width,canvas.height,view);view.x-=(event.clientX-dragging.x)*canvas.width/r.width/s;view.z-=(event.clientY-dragging.y)*canvas.height/r.height/s;refresh();}
  dragging.x=event.clientX;dragging.y=event.clientY;
 });
 const endDrag=event=>{if(dragging?.id===event.pointerId)dragging=null;};canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',endDrag);canvas.addEventListener('lostpointercapture',endDrag);
 $('map-zoom-in').addEventListener('click',()=>zoom(1.5));$('map-zoom-out').addEventListener('click',()=>zoom(1/1.5));
 $('map-fit').addEventListener('click',()=>{Object.assign(view,{x:0,z:0,zoom:1});refresh();});
 $('map-player').addEventListener('click',()=>{const p=player();Object.assign(view,{x:p.x,z:p.z,zoom:6});refresh();});
 $('map-open').addEventListener('click',()=>toggleMap(true));
 // Keep the gameplay handlers/IDs intact, but move utility controls out of the play area.
 const settings=$('game-settings'),tray=$('settings-controls');
 for(const id of ['vehicle-toggle','sound-toggle','render-scale-toggle','horn-button'])tray.append($(id));
 settings.addEventListener('toggle',()=>{if(settings.open){const report=window.neonCoastMaterials?.(),textures=report?.textures||[],loaded=textures.filter(t=>t.state==='loaded').length;const status=$('texture-status');status.textContent='Materials '+loaded+' / '+textures.length+' loaded';status.dataset.state=loaded===textures.length?'loaded':'fallback';}});
 document.addEventListener('pointerdown',event=>{if(settings.open&&!settings.contains(event.target))settings.open=false;});
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&settings.open){settings.open=false;event.stopImmediatePropagation();settings.querySelector('summary').focus();return;}
  if(event.target.matches('input,textarea,[contenteditable="true"]')){
   if(event.key==='Escape'){event.preventDefault();toggleMap(false);}if(event.key!=='Tab')event.stopImmediatePropagation();
  }
  if(overlay.classList.contains('show')&&!event.target.matches('input,textarea,[contenteditable="true"]')&&['+','=','-','_'].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();zoom(event.key==='+'||event.key==='='?1.5:1/1.5);return;}
  if(event.key==='Tab'&&overlay.classList.contains('show')){
   const nodes=[...overlay.querySelectorAll('button:not(:disabled),input,[tabindex="0"]')].filter(el=>el.getClientRects().length);const first=nodes[0],last=nodes[nodes.length-1];
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
 },true);
 new ResizeObserver(refresh).observe(canvas.parentElement);renderPlaces();
 return Object.freeze({refresh,consumeDrag(){const value=dragged;dragged=false;return value;},open(value){settings.open=false;if(value){previousFocus=document.activeElement;refresh();$('map-close').focus();}else previousFocus?.focus?.();}});
}
return Object.freeze({project,unproject,zoomAt,filterPlaces,placeMapLabels,create});
});
