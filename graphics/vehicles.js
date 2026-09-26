/* Original modeled vehicles. Meter-scale; compatible with the existing driving rig.
 * High-detail and silhouette LODs share the same profile, wheel wells and cockpit.
 * No external models, shared random numbers, or gameplay changes.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.NeonCoastVehicles=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const TAU=Math.PI*2,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const rgb=h=>[(h>>16&255)/255,(h>>8&255)/255,(h&255)/255];
const shade=(c,k)=>c.map(v=>clamp(v*k,0,1));
const profiles=Object.freeze({
 roadster:{width:2.05,roofWidth:1.50,roofY:1.48,frontBase:-1.12,frontTop:-.79,rearBase:.94,rearTop:.60,wheelY:.46,wheelZ:1.45,convertible:true},
 muscle:{width:2.34,roofWidth:1.73,roofY:1.68,frontBase:-1.00,frontTop:-.42,rearBase:1.12,rearTop:.78,wheelY:.49,wheelZ:1.54},
 coupe:{width:2.14,roofWidth:1.56,roofY:1.64,frontBase:-.96,frontTop:-.51,rearBase:1.43,rearTop:1.04,wheelY:.47,wheelZ:1.49},
 sport:{width:2.26,roofWidth:1.64,roofY:1.54,frontBase:-.83,frontTop:-.61,rearBase:1.27,rearTop:.91,wheelY:.42,wheelZ:1.56}
});
function build(B,G,bodyHex,style='roadster'){
 const p=profiles[style]||profiles.roadster,{width:w,roofWidth:rw,roofY:ry,frontBase:fb,frontTop:ft,rearBase:rb,rearTop:rt,wheelY:wy,wheelZ:wz}=p;
 const bodyColor=rgb(bodyHex),dark=rgb(0x14191d),rubber=rgb(0x121619),metal=rgb(0xb2b5b3),glass=rgb(0x233e46),deep=shade(bodyColor,.55),leather=rgb(style==='roadster'?0x533827:0x282929);
 const details=new B(),lamps=new B(),windows=new B(),wheelX=w*.5-.10;
 const round=(b,x,y,z,bw,bh,bd,c,r=.03,n=3)=>G.roundedBox(b,x,y,z,bw,bh,bd,c,r,n);
 const shape=[[-2.24,style==='muscle'?.88:style==='sport'?.72:.78],[-2.12,.92],[-1.86,.98],[-1.54,1],[-1.05,.98],[-.56,.965],[.50,.97],[1.04,.995],[1.54,1],[1.93,.95],[2.23,.85]];
 function widthAt(z){for(let i=0;i<shape.length-1;i++){const a=shape[i],b=shape[i+1];if(z>=a[0]&&z<=b[0]){const t=(z-a[0])/(b[0]-a[0]),s=t*t*(3-2*t);return w*.5*(a[1]+(b[1]-a[1])*s);}}return w*.5*(z<0?shape[0][1]:shape.at(-1)[1]);}
 function archAt(z){let y=.32;for(const a of [-wz,wz]){const d=Math.abs(z-a);if(d<.525)y=Math.max(y,wy+Math.sqrt(.525*.525-d*d));}return y;}
 function deckAt(z){return 1.025-(z<fb?.065*clamp((-z-1)/1.2,0,1):.035*clamp((z-1.1)/1.2,0,1));}
 function contour(z){const half=widthAt(z),arch=archAt(z),deck=deckAt(z),fender=Math.max(deck,arch+.075);return[[-half*.80,.28],[half*.80,.28],[half,arch],[half*.998,Math.max(arch+.028,.73)],[half*.955,fender-.015],[half*.83,deck+.02],[w*.31,deck+.02],[-w*.31,deck+.02],[-half*.83,deck+.02],[-half*.955,fender-.015],[-half*.998,Math.max(arch+.028,.73)],[-half,arch]];}
 function curve(points,j,t){const N=points.length,P=points[(j+N-1)%N],A=points[j],D=points[(j+1)%N],Q=points[(j+2)%N];return A.map((v,k)=>{const m0=(D[k]-P[k])*.20,m1=(Q[k]-v)*.20;return(2*t*t*t-3*t*t+1)*v+(t*t*t-2*t*t+t)*m0+(-2*t*t*t+3*t*t)*D[k]+(t*t*t-t*t)*m1;});}
 function shell(low){
  const b=new B(),zvalues=shape.map(q=>q[0]),detail=low?1:3;
  for(let z=-2.24;z<2.23;z+=low?.30:.085)zvalues.push(z);
  for(const a of [-wz,wz])for(let i=0;i<=(low?12:32);i++)zvalues.push(a-.525+1.05*i/(low?12:32));
  zvalues.push(ft+.025,rt-.025);
  const zs=[...new Set(zvalues.filter(z=>z>=-2.24&&z<=2.23).map(z=>+z.toFixed(6)))].sort((a,b)=>a-b);
  for(let r=0;r<zs.length-1;r++){
   const za=zs[r],zd=zs[r+1],A=contour(za),D=contour(zd);
   for(let j=0;j<12;j++){
    if(p.convertible&&j===6&&za>=ft+.0249&&zd<=rt-.0249)continue;
    const color=j<2?deep:bodyColor;
    for(let i=0;i<detail;i++){
     const a=curve(A,j,i/detail),b0=curve(A,j,(i+1)/detail),c=curve(D,j,(i+1)/detail),d=curve(D,j,i/detail);
     b.quad([a[0],a[1],za],[b0[0],b0[1],za],[c[0],c[1],zd],[d[0],d[1],zd],color);
    }
   }
  }
  for(const front of [true,false]){const z=front?zs[0]:zs.at(-1),q=contour(z);for(let j=0;j<q.length;j++)for(let i=0;i<detail;i++){const a=curve(q,j,i/detail),d=curve(q,j,(i+1)/detail);b.tri([0,.67,z],[a[0],a[1],z],[d[0],d[1],z],bodyColor,front?[0,0,-1]:[0,0,1]);}}
  const roofEdge=ry-.10;
  for(const side of [-1,1]){
   b.segment([side*w*.43,1.025,fb],[side*rw*.49,roofEdge,ft],.042,bodyColor,low?6:16,.036);
   if(!p.convertible){
    b.segment([side*rw*.49,roofEdge,ft],[side*rw*.49,roofEdge,rt],.035,bodyColor,low?6:12);
    b.segment([side*rw*.49,roofEdge,rt],[side*w*.445,1.035,rb],style==='muscle'?.075:.062,bodyColor,low?6:16,.060);
    const cols=low?8:24,rows=low?3:10;
    if(side===1)for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
     const point=(i,j)=>{const t=i/cols*2-1,v=j/rows;return[t*rw*.5,ry-.095+.095*(1-t*t)+.026*Math.sin(v*Math.PI),ft+(rt-ft)*v];};
     b.quad(point(c,r),point(c,r+1),point(c+1,r+1),point(c+1,r),bodyColor);
    }
   }
  }
  if(!p.convertible){const mid=(ft+rt)*.5;for(const side of [-1,1])b.segment([side*w*.438,1.025,mid],[side*rw*.48,roofEdge,mid],.037,dark,low?6:12);}
  // Profile-matched nose and rear shells: bumpers no longer extend beyond narrow noses.
  round(b,0,.46,-2.24,widthAt(-2.24)*2+.035,.24,.18,style==='muscle'?metal:bodyColor,.075,low?1:4);
  round(b,0,.47,2.21,widthAt(2.23)*2+.055,.25,.20,style==='muscle'?metal:bodyColor,.075,low?1:4);
  if(style==='coupe')round(b,0,1.055,2.08,w*.76,.08,.28,bodyColor,.033,low?1:3);
  if(style==='sport'){
   for(const side of [-1,1])b.segment([side*.63,1.02,1.78],[side*.63,ry-.06,1.87],.030,dark,8);
   round(b,0,ry-.04,1.89,w*.77,.075,.31,deep,.030,low?1:3);
  }
  G.smoothNormals(b,.55);return b;
 }
 const body=shell(false),bodyLow=shell(true);
 // Curved glass follows the raked frame; normals are derived from geometry.
 function patch(b,point,cols,rows,color){for(let j=0;j<rows;j++)for(let i=0;i<cols;i++)b.quad(point(i/cols,j/rows),point((i+1)/cols,j/rows),point((i+1)/cols,(j+1)/rows),point(i/cols,(j+1)/rows),color);}
 patch(windows,(u,t)=>{const x=(u*2-1)*(w*.402*(1-t)+rw*.472*t);return[x,1.033+(ry-.10-1.033)*t,fb+(ft-fb)*t-.018*(1-(u*2-1)**2)];},18,7,glass);
 if(!p.convertible){
  patch(windows,(u,t)=>[(u*2-1)*(rw*.472*(1-t)+w*.402*t),ry-.10+(1.033-(ry-.10))*t,rt+(rb-rt)*t+.015*(1-(u*2-1)**2)],18,7,glass);
  for(const side of [-1,1])patch(windows,(u,t)=>{const z=(fb+.055+(rb-fb-.11)*u)*(1-t)+(ft+.04+(rt-ft-.08)*u)*t;return[side*(w*.437*(1-t)+rw*.474*t+.009*Math.sin(u*Math.PI)),1.034+(ry-.125-1.034)*t,z];},16,6,glass);
 }
 G.smoothNormals(windows,.80);
 // Window gaskets, belt lines, shaped mirrors and panel gaps.
 for(const side of [-1,1]){
  const x=side*w*.484;
  details.segment([side*w*.412,1.026,fb],[side*rw*.483,ry-.102,ft],.015,rubber,10);
  details.segment([side*rw*.483,ry-.102,ft],[-side*rw*.483,ry-.102,ft],.019,metal,12);
  for(let i=0;i<16;i++){
   const z=-.86+i*1.72/16,z2=z+1.72/16;
   details.segment([side*(widthAt(z)+.002),.905,z],[side*(widthAt(z2)+.002),.905,z2],.009,metal,6);
  }
  for(const z of [fb+.12,rb-.15])details.segment([side*(widthAt(z)+.005),.46,z],[side*(widthAt(z)+.005),.91,z],.006,rubber,6);
  round(details,x,.92,.46,.053,.046,.20,metal,.02,3);
  details.segment([side*w*.45,1.07,fb+.12],[side*w*.54,1.10,fb+.08],.022,dark,12);
  round(details,side*w*.56,1.105,fb+.08,.24,.14,.20,bodyColor,.057,4);
  round(details,side*w*.56,1.108,fb+.187,.19,.097,.012,glass,.025,3);
  round(details,side*w*.473,.405,.02,.12,.105,1.74,deep,.035,3);
 }
 // Real lens housings and inset projector lamps. Distinct fascia for each class.
 const headY=style==='sport'?.79:.78,headX=w*(style==='sport'?.29:.285),headWidth=style==='muscle'?.52:.46;
 for(const side of [-1,1]){
  round(details,side*headX,headY,-2.239,headWidth+.075,.21,.09,dark,.048,3);
  if(style==='muscle'||style==='roadster'){
   const count=style==='muscle'?2:1;for(let l=0;l<count;l++){
    const x=side*headX+(l-(count-1)/2)*.23;
    details.segment([x,headY,-2.255],[x,headY,-2.28],.085,metal,24);
    lamps.sphere(x,headY,-2.294,.065,.063,.017,rgb(0xf0e1be),20,10);
   }
  }else{
   round(lamps,side*headX,headY,-2.291,headWidth-.04,.058,.018,rgb(0xe5eddf),.024,3);
   for(let l=0;l<3;l++)round(lamps,side*headX+(l-1)*.105,headY-.059,-2.29,.066,.032,.015,rgb(0xb3c5c6),.012,2);
  }
  round(details,side*headX,.775,2.239,.62,.19,.075,dark,.045,3);
  round(lamps,side*headX,.785,2.286,.55,.108,.018,rgb(0x8e1127),.023,3);
  round(lamps,side*headX,.78,2.303,.49,.023,.012,rgb(0xf1534f),.009,2);
  for(let j=0;j<8;j++)details.box(side*headX-.23+j*.065,.783,2.315,.009,.094,.006,rgb(0x502024));
  details.segment([side*.55,.29,2.12],[side*.55,.29,2.36],.079,metal,24,.085);
  details.segment([side*.55,.29,2.355],[side*.55,.29,2.369],.062,dark,24);
 }
 round(details,0,.64,-2.286,.62,.16,.025,dark,.035,3);
 for(let j=0;j<4;j++)details.box(0,.587+j*.03,-2.307,.55,.010,.012,metal);
 round(details,0,.351,-2.287,w*.58,.07,.045,dark,.028,3);
 // Original fictional plate; actual raised glyph strokes, no borrowed badge artwork.
 round(details,0,.61,2.285,.39,.16,.014,rgb(0xd5d4bc),.009,2);
 for(let i=0;i<6;i++)for(let j=0;j<3;j++)if((i+j)%3!==0)details.box(-.14+i*.055,.61+(j-1)*.027,2.296,.024,.011,.006,rgb(0x39444b));
 details.box(0,.667,2.296,.29,.013,.006,rgb(0x47786b));
 // Seats are stitched volumes inside a recessed cockpit, not unrounded cubes.
 const driverX=p.convertible?-.32:-.37,driverZ=.08,steeringY=1.13,steeringZ=fb+.47,gaugeY=1.34,gaugeZ=steeringZ-.17;
 details.box(0,.58,.03,w*.66,.07,1.37,dark);
 for(const side of [-1,1]){
  const x=side*Math.abs(driverX);
  round(details,x,.71,.05,.44,.16,.53,leather,.065,4);
  round(details,x,.92,.36,.43,.50,.17,leather,.075,4);
  round(details,x,1.205,.365,.27,.17,.125,leather,.050,4);
  for(const s of [-1,1]){
   details.segment([x+s*.155,.795,-.15],[x+s*.155,.795,.23],.006,shade(leather,1.6),6);
   details.segment([x+s*.14,.83,.265],[x+s*.14,1.10,.265],.006,shade(leather,1.6),6);
  }
  for(let j=0;j<4;j++)details.segment([x-.105,.823+j*.065,.268],[x+.105,.823+j*.065,.268],.003,shade(leather,.55),5);
 }
 round(details,0,1.07,fb+.30,w*.66,.22,.29,dark,.064,3);
 round(details,0,.70,.035,.14,.19,.54,dark,.035,3);
 details.segment([0,.78,-.06],[0,.91,-.085],.015,metal,12);
 details.sphere(0,.92,-.085,.029,.027,.028,dark,16,8);
 // Instrument hood grows out of the dash instead of floating over the windshield.
 round(details,driverX,gaugeY-.105,gaugeZ-.065,.30,.33,.18,dark,.068,4);
 round(details,driverX,gaugeY,gaugeZ,.26,.21,.025,dark,.030,3);
 for(const side of [-1,1])details.segment([driverX+side*.064,gaugeY,gaugeZ+.01],[driverX+side*.064,gaugeY,gaugeZ+.024],.050,rgb(0x10161c),24);
 if(style==='muscle'){
  round(body,0,1.085,-1.44,.46,.105,.70,deep,.045,3);
  for(const side of [-1,1])for(let i=0;i<20;i++){const z=-2.13+i*1.02/20,z2=z+1.02/20;body.quad([side*.29-.065,deckAt(z)+.027,z],[side*.29+.065,deckAt(z)+.027,z],[side*.29+.065,deckAt(z2)+.027,z2],[side*.29-.065,deckAt(z2)+.027,z2],rgb(0xede1ba),[0,1,0]);}
 }
 if(style==='sport')for(const side of [-1,1]){
  round(details,side*w*.482,.80,.50,.025,.20,.53,dark,.01,2);
  for(let j=0;j<5;j++)details.box(side*w*.497,.72+j*.038,.50,.012,.012,.46,metal);
 }
 return {body,bodyLow,details,lamps,glass:windows,cockpit:{driverX,driverZ,wheelX:driverX,wheelY:steeringY,wheelZ:steeringZ,gaugeX:driverX,gaugeY,gaugeZ},wheelX,wheelY:wy,wheelZ:wz,wheelIndex:{roadster:0,muscle:1,coupe:2,sport:3}[style]??0};
}
return Object.freeze({build,profiles});
});
