/* Original modular coastal architecture. Geometry in meters; no shared random stream.
 * Material IDs travel in a separate GPU attribute, NOT inferred from wall paint colors.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.NeonCoastArchitecture=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const material=(color,kind)=>[color[0],color[1],color[2],kind];
const rgb=(n,kind=0)=>[(n>>16&255)/255,(n>>8&255)/255,(n&255)/255,kind];
const tint=(c,f)=>[Math.min(1,c[0]*f),Math.min(1,c[1]*f),Math.min(1,c[2]*f),c[3]||0];
const hash=(x,z)=>{const n=Math.sin(x*127.1+z*311.7)*43758.5453;return n-Math.floor(n);};
const glyphs={A:['01110','11011','11011','11111','11011','11011','11011'],B:['11110','11011','11011','11110','11011','11011','11110'],C:['01111','11000','11000','11000','11000','11000','01111'],D:['11110','11011','11011','11011','11011','11011','11110'],E:['11111','11000','11000','11110','11000','11000','11111'],F:['11111','11000','11000','11110','11000','11000','11000'],H:['11011','11011','11011','11111','11011','11011','11011'],K:['11011','11011','11110','11100','11110','11011','11011'],L:['11000','11000','11000','11000','11000','11000','11111'],M:['10001','11011','11111','10101','10001','10001','10001'],O:['01110','11011','11011','11011','11011','11011','01110'],R:['11110','11011','11011','11110','11100','11010','11011'],S:['01111','11000','11000','01110','00011','00011','11110'],T:['11111','01110','00100','00100','00100','00100','00100'],V:['11011','11011','11011','11011','11011','01110','00100']};
function lettering(b,text,x,y,z,width,height,col){
 const cell=Math.min(width/(text.length*6-1),height/7),left=x-cell*(text.length*6-1)/2;
 for(let k=0;k<text.length;k++)for(let row=0;row<7;row++){
  const pixels=(glyphs[text[k]]||glyphs.E)[row];
  for(let i=0;i<5;){if(pixels[i]!=='1'){i++;continue;}let j=i+1;while(j<5&&pixels[j]==='1')j++;
   const x0=left+(k*6+i)*cell,x1=left+(k*6+j)*cell,y1=y+(3.5-row)*cell,y0=y1-cell;
   b.quad([x0,y0,z],[x1,y0,z],[x1,y1,z],[x0,y1,z],col,[0,0,1]);i=j;
  }
 }
}
function building(b,x,z,w,d,h,color,variant=0,options={}){
 if(![x,z,w,d,h,variant].every(Number.isFinite)||Math.min(w,d)<2||h<2)throw new RangeError('Finite building dimensions >= 2 meters required.');
 const base=options.baseY||0,style=options.style??((Math.floor(variant)%4+4)%4),shop=options.shop!==false&&!options.highrise;
 const cream=rgb(0xe5dfcf,3),metal=rgb(0x35494c,9),glass=rgb(0x36575e,7),warmGlass=rgb(0x937b58,8),dark=rgb(0x30383a,9);
 const paint=color.slice(0,3).map((v,i)=>v*.62+[.86,.83,.76][i]*.38);
 const wall=style===1?rgb(0x92756a,5):style===3?material(paint,6):material(paint,style===0?1:2);
 const accent=rgb([0xdb8993,0x354b4f,0x6c9c97,0x929983][style],10),floors=Math.max(1,Math.floor(h/3.4)),fh=(h-.48)/floors;
 // Recessed core is a room back, not a wall covering the openings.
 b.box(x,base+h/2,z,w-1.12,h,d-1.12,dark);
 b.box(x,base+.11,z,w,.22,d,cream);
 const sides=[{axis:'z',sign:1,span:w,half:d/2},{axis:'z',sign:-1,span:w,half:d/2},{axis:'x',sign:1,span:d,half:w/2},{axis:'x',sign:-1,span:d,half:w/2}];
 for(const side of sides){
  const {axis,sign,span,half}=side;
  const point=(u,y,out)=>axis==='z'?[x+u,base+y,z+sign*(half+out)]:[x+sign*(half+out),base+y,z+u];
  const box=(u,y,out,bw,bh,bd,c)=>{const p=point(u,y,out);b.box(...p,axis==='z'?bw:bd,bh,axis==='z'?bd:bw,c);};
  const pane=(u,y,out,pw,ph,c)=>{const pts=[point(u-pw/2,y-ph/2,out),point(u+pw/2,y-ph/2,out),point(u+pw/2,y+ph/2,out),point(u-pw/2,y+ph/2,out)];b.quad(...pts,c,axis==='z'?[0,0,sign]:[sign,0,0]);};
  const cols=Math.max(1,Math.min(8,Math.floor(span/(options.highrise?3.1:4.25)))),bay=span/cols;
  for(let f=0;f<floors;f++){
   const low=.24+f*fh,retail=shop&&f===0,ph=retail?Math.min(2.35,fh-.55):Math.min(1.9,fh-.9),pw=bay*(options.highrise?.82:retail?.79:.62),cy=low+(retail?ph/2+.12:fh*.48),bottom=cy-ph/2,top=cy+ph/2;
   // Structural bands and piers form actual holes: glass is 24 cm behind this plane.
   box(0,(low+bottom)/2,-.18,span,Math.max(.05,bottom-low),.36,wall);
   box(0,(top+low+fh)/2,-.18,span,Math.max(.05,low+fh-top),.36,wall);
   if(style===2||options.highrise)box(0,low+fh-.11,.075,span+.12,.18,.22,cream);
   for(let c=0;c<cols;c++){
    const u=-span/2+(c+.5)*bay,lit=hash(x+u+f*9,z+sign*4)>.73,g=lit?warmGlass:glass;
    if(c===0)box(-span/2+(bay-pw)/4,cy,-.18,(bay-pw)/2,ph,.36,wall);
    box(u+pw/2+(c===cols-1?(bay-pw)/4:(bay-pw)/2),cy,-.18,c===cols-1?(bay-pw)/2:bay-pw,ph,.36,wall);
    pane(u,cy,-.24,pw,ph,g);
    for(const s of [-1,1])pane(u+s*(pw/2-.05),cy,-.015,.085,ph+.02,style===1?metal:cream);
    pane(u,top-.04,-.015,pw,.085,cream);box(u,bottom-.035,.02,pw+.15,.11,.27,cream);
    if(pw>1.3)pane(u,cy,-.145,.045,ph,metal);
    if(retail){pane(u,cy-ph*.15,-.135,pw,.055,metal);if(axis==='z'&&sign===1&&c===Math.floor(cols/2))box(u+pw*.18,cy-.2,-.07,.035,.40,.06,cream);}
    else if(style===3&&h<10){for(const s of [-1,1]){box(u+s*(pw/2+.18),cy,.025,.22,ph+.12,.10,accent);for(let slat=0;slat<5;slat++)pane(u+s*(pw/2+.18),cy-ph*.36+slat*ph*.18,.105,.20,.035,cream);}}
    // Usable-looking shallow balconies, constrained to the original reserved footprint.
    if(axis==='z'&&sign===1&&f>0&&style===2&&!options.highrise&&c%2===0){
     const by=bottom-.15,bw=Math.min(bay-.2,pw+.40);
     box(u,by,.23,bw,.14,.62,cream);box(u,by+.8,.52,bw,.045,.05,metal);
     for(const s of [-1,0,1])box(u+s*bw*.43,by+.43,.52,.045,.72,.05,metal);
     box(u,by+.37,.50,bw,.06,.055,cream);
    }
   }
  }
  box(0,h-.20,-.07,span+.08,.32,.22,cream);
  for(const s of [-1,1])box(s*(span/2-.16),h/2,.03,.30,h,.14,cream);
 }
 // Shared roof line is deliberately modest. Original layout/collision heights are preserved.
 b.box(x,base+h-.07,z,w,.14,d,rgb(0x62645d,3));
 if(options.roof!==false){
  for(const s of [-1,1]){b.box(x+s*(w/2-.14),base+h+.26,z,.28,.58,d,cream);b.box(x,base+h+.26,z+s*(d/2-.14),w,.58,.28,cream);}
  b.box(x,base+h+.62,z,w+.22,.16,d+.22,cream);
  b.box(x-w*.23,base+h+.72,z-d*.21,Math.min(2.5,w*.21),.74,Math.min(2.1,d*.20),rgb(0x7f8985,9));
  for(let i=0;i<5;i++)b.box(x-w*.23,base+h+1.10,z-d*.21-.4+i*.2,1.4,.035,.055,metal);
  if(style===0){for(let i=0;i<3;i++)b.box(x,base+h+.65+i*.34,z+d/2-.16,w*(.45-i*.10),.38,.32,i===2?accent:cream);}
 }
 if(shop){
  const signW=Math.min(w*.7,8.5),sy=base+Math.min(fh-.02,3.1),front=z+d/2;
  b.box(x,sy,front+.11,signW,.68,.20,accent);
  lettering(b,['HOTEL','MARKET','CAFE','RECORDS'][style],x,sy,front+.216,signW*.82,.35,rgb(0xffedcb,11));
  b.box(x,sy-.47,front+.26,Math.min(w-.6,signW+.65),.11,.63,cream);
  // Canvas valance and restrained downlights, not texture-free sign blocks.
  b.box(x,sy-.58,front+.54,Math.min(w-.6,signW+.65),.19,.075,accent);
  for(const s of [-1,1])b.box(x+s*signW*.40,sy-.36,front+.27,.16,.045,.18,rgb(0xffe5b4,11));
 }
 return {style,floors};
}
function cottage(b,x,z,w,d,h,color,roofColor,ground=0,stilts=false){
 const base=ground+(stilts?1.35:0),eave=base+h,peak=eave+Math.max(1.35,w*.17),roof=material(roofColor,4),trim=rgb(0xe8dfcc,3),timber=rgb(0x74634c,6);
 if(stilts)for(const sx of [-1,1])for(const sz of [-1,1])b.box(x+sx*w*.37,(ground+base)/2,z+sz*d*.34,.23,base-ground,.23,timber);
 building(b,x,z,w,d,h,color,3,{baseY:base,style:3,shop:false,roof:false});
 const front=z+d/2+.15,back=z-d/2-.15;
 for(const f of [front,back])b.tri([x-w/2,eave,f],[x+w/2,eave,f],[x,peak,f],material(color,6),[0,0,f===front?1:-1]);
 b.quad([x-w/2-.15,eave,front],[x,peak,front],[x,peak,back],[x-w/2-.15,eave,back],roof);
 b.quad([x,peak,front],[x+w/2+.15,eave,front],[x+w/2+.15,eave,back],[x,peak,back],roof);
 for(const s of [-1,1])b.box(x+s*(w/2+.10),eave-.03,z,.12,.14,d+.32,trim);
 b.box(x,peak+.045,z,.18,.13,d+.32,roof);
 if(stilts){b.box(x,base+.04,z+d/2+.82,w*.72,.16,1.8,timber);for(const s of [-1,1]){b.box(x+s*w*.31,base+1.25,z+d/2+1.35,.12,2.5,.12,trim);b.box(x+s*w*.32,base+.58,z+d/2+.88,.07,1.05,1.75,trim);}b.box(x,base+2.54,z+d/2+.80,w*.76,.16,1.9,roof);}
}
function assetSurface(name=''){
 if(/Glass/i.test(name))return 7;if(/Stucco.*Coral/i.test(name))return 2;if(/Stucco/i.test(name))return 1;if(/Terrazzo|Roof/i.test(name))return 3;if(/Timber/i.test(name))return 6;if(/Canvas|Enamel/i.test(name))return 10;return 0;
}
return Object.freeze({building,cottage,assetSurface,material});
});
