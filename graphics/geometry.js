/* Original, dependency-free geometry for Neon Coast. Units and rig anchors match game.js. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.NeonCoastGeometry = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const TAU = Math.PI * 2;
  const hex = h => [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255];
  const tint = (c, f) => c.map((v,i) => i<3?Math.min(1, Math.max(0, v * f)):v);
  const add = (a, b) => a.map((v, i) => v + b[i]);
  const sub = (a, b) => a.map((v, i) => v - b[i]);
  const mul = (a, s) => a.map(v => v * s);
  const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
  const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const unit = v => { const l=Math.hypot(...v); return l>1e-12?mul(v,1/l):[0,1,0]; };
  const hash = (x,z) => { const v=Math.sin(x*127.1+z*311.7)*43758.5453; return v-Math.floor(v); };

  function sphere(x,y,z,rx,ry,rz,col,seg=12,rings=8) {
    if (Math.min(rx,ry,rz)<=0) return;
    seg=Math.max(6,Math.floor(seg)); rings=Math.max(4,Math.floor(rings));
    const point=(t,p)=>[x+rx*Math.sin(t)*Math.cos(p),y+ry*Math.cos(t),z+rz*Math.sin(t)*Math.sin(p)];
    const normal=(t,p)=>unit([Math.sin(t)*Math.cos(p)/rx,Math.cos(t)/ry,Math.sin(t)*Math.sin(p)/rz]);
    for(let j=0;j<rings;j++) for(let i=0;i<seg;i++) {
      const t0=Math.PI*j/rings,t1=Math.PI*(j+1)/rings,p0=TAU*i/seg,p1=TAU*(i+1)/seg;
      const a=point(t0,p0),b=point(t1,p0),c=point(t1,p1),d=point(t0,p1);
      const na=normal(t0,p0),nb=normal(t1,p0),nc=normal(t1,p1),nd=normal(t0,p1);
      if(j<rings-1) this.tri(a,c,b,col,[na,nc,nb]);
      if(j>0) this.tri(a,d,c,col,[na,nd,nc]);
    }
  }
  function segment(a,b,r,col,seg=9,r2=r) {
    const delta=sub(b,a),length=Math.hypot(...delta);
    if(length<1e-7 || Math.max(r,r2)<=0) return;
    const axis=mul(delta,1/length),ref=Math.abs(axis[1])<.89?[0,1,0]:[1,0,0];
    const u=unit(cross(axis,ref)),v=cross(axis,u),slope=(r-r2)/length;
    seg=Math.max(5,Math.floor(seg));
    const radial=t=>add(mul(u,Math.cos(t)),mul(v,Math.sin(t)));
    for(let i=0;i<seg;i++) {
      const v0=radial(TAU*i/seg),v1=radial(TAU*(i+1)/seg),n0=unit(add(v0,mul(axis,slope))),n1=unit(add(v1,mul(axis,slope)));
      const p0=add(a,mul(v0,r)),p1=add(a,mul(v1,r)),p2=add(b,mul(v1,r2)),p3=add(b,mul(v0,r2));
      if(r>0) this.tri(p0,p1,p2,col,[n0,n1,n1]);
      if(r2>0) this.tri(p0,p2,p3,col,[n0,n1,n0]);
      if(r>0) this.tri(a,p1,p0,col,mul(axis,-1));
      if(r2>0) this.tri(b,p3,p2,col,axis);
    }
  }
  function install(Builder) {
    Builder.prototype.sphere=sphere;
    Builder.prototype.segment=segment;
    Builder.prototype.cylinder=function(x,y,z,rt,rb,h,c,n=12){this.segment([x,y-h/2,z],[x,y+h/2,z],rb,c,n,rt);};
    Builder.prototype.coneY=function(x,y,z,r,h,c,n=12){this.segment([x,y-h/2,z],[x,y+h/2,z],r,c,n,0);};
  }

  // Crease-aware, area-weighted smoothing. Positions, winding, colors and bounds are untouched.
  function smoothNormals(b, minimumDot=.72) {
    const groups=new Map(),faces=[];
    for(let i=0;i<b.p.length;i+=9) {
      const normal=cross(sub(b.p.slice(i+3,i+6),b.p.slice(i,i+3)),sub(b.p.slice(i+6,i+9),b.p.slice(i,i+3)));
      // Respect legacy meshes whose winding and explicit lighting normal disagree.
      if(dot(normal,b.n.slice(i,i+3))<0) for(let j=0;j<3;j++) normal[j]*=-1;
      faces.push(normal);
      for(let j=0;j<9;j+=3){const k=b.p.slice(i+j,i+j+3).map(v=>Math.round(v*1e5)).join(',');if(!groups.has(k))groups.set(k,[]);groups.get(k).push(i+j);}
    }
    const result=b.n.slice();
    for(const indices of groups.values()) for(const i of indices) {
      const original=unit(b.n.slice(i,i+3)),sum=[0,0,0];
      for(const j of indices){const f=faces[Math.floor(j/9)];if(dot(unit(f),original)>=minimumDot)for(let k=0;k<3;k++)sum[k]+=f[k];}
      const n=Math.hypot(...sum)>1e-10?unit(sum):original;for(let k=0;k<3;k++)result[i+k]=n[k];
    }
    b.n=result; return b;
  }

  // Smooth elliptical loft. Rings: [height, half-width, half-depth, z-center?, x-center?].
  function loft(b,rings,col,segments=16,cap=true) {
    const p=(r,t)=>[(r[4]||0)+r[1]*Math.cos(t),r[0],(r[3]||0)+r[2]*Math.sin(t)];
    const n=(j,t)=>{
      const r=rings[j],a=rings[Math.max(0,j-1)],d=rings[Math.min(rings.length-1,j+1)];
      const tangent=[-r[1]*Math.sin(t),0,r[2]*Math.cos(t)];
      const along=[(d[1]-a[1])*Math.cos(t)+(d[4]||0)-(a[4]||0),d[0]-a[0],(d[2]-a[2])*Math.sin(t)+(d[3]||0)-(a[3]||0)];
      return unit(cross(along,tangent));
    };
    for(let j=0;j<rings.length-1;j++) for(let i=0;i<segments;i++) {
      const a=TAU*i/segments,d=TAU*(i+1)/segments;
      b.tri(p(rings[j],a),p(rings[j+1],a),p(rings[j+1],d),col,[n(j,a),n(j+1,a),n(j+1,d)]);
      b.tri(p(rings[j],a),p(rings[j+1],d),p(rings[j],d),col,[n(j,a),n(j+1,d),n(j,d)]);
    }
    if(cap)for(let i=0;i<segments;i++){
      const a=TAU*i/segments,d=TAU*(i+1)/segments,r0=rings[0],r1=rings[rings.length-1];
      b.tri([r0[4]||0,r0[0],r0[3]||0],p(r0,a),p(r0,d),col,[0,-1,0]);
      b.tri([r1[4]||0,r1[0],r1[3]||0],p(r1,d),p(r1,a),col,[0,1,0]);
    }
  }
  function bevelBox(b,x,y,z,w,h,d,col,bevel=.02) {
    const H=[w/2,h/2,d/2],center=[x,y,z],r=Math.max(0,Math.min(bevel,...H.map(v=>v*.45)));
    if(!r){b.box(x,y,z,w,h,d,col);return;}
    const face=(points,n)=>{
      points=points.map(p=>add(p,center));
      if(dot(cross(sub(points[1],points[0]),sub(points[2],points[0])),n)<0)points.reverse();
      b.tri(points[0],points[1],points[2],col,n);if(points.length===4)b.tri(points[0],points[2],points[3],col,n);
    };
    for(let a=0;a<3;a++)for(const s of [-1,1]){
      const u=(a+1)%3,v=(a+2)%3,n=[0,0,0];n[a]=s;
      face([[-1,-1],[1,-1],[1,1],[-1,1]].map(q=>{const p=[0,0,0];p[a]=s*H[a];p[u]=q[0]*(H[u]-r);p[v]=q[1]*(H[v]-r);return p;}),n);
    }
    for(let a=0;a<3;a++)for(const su of [-1,1])for(const sv of [-1,1]){
      const u=(a+1)%3,v=(a+2)%3,n=[0,0,0];n[u]=su/Math.SQRT2;n[v]=sv/Math.SQRT2;
      face([[-1,0],[1,0],[1,1],[-1,1]].map(q=>{const p=[0,0,0];p[a]=q[0]*(H[a]-r);p[u]=su*(H[u]-(q[1]?r:0));p[v]=sv*(H[v]-(q[1]?0:r));return p;}),n);
    }
    for(const sx of [-1,1])for(const sy of [-1,1])for(const sz of [-1,1]){
      const s=[sx,sy,sz];face([0,1,2].map(a=>H.map((h,i)=>s[i]*(h-(i===a?0:r)))),unit(s));
    }
  }
  // Smooth radius, not a single flat bevel. Faces meet with shared analytic normals.
  function roundedBox(b,x,y,z,w,h,d,col,radius=.03,segments=3) {
    const half=[w/2,h/2,d/2],center=[x,y,z];
    if(!half.every(v=>Number.isFinite(v)&&v>0))throw new RangeError('Positive finite box dimensions required');
    const r=Math.max(0,Math.min(radius,...half.map(v=>v*.95))),steps=Math.max(1,Math.floor(segments));
    if(r<1e-6){b.box(x,y,z,w,h,d,col);return b;}
    const knots=H=>{const a=[];for(let i=0;i<=steps;i++)a.push(-H+r*i/steps);for(let i=0;i<=steps;i++)a.push(H-r+r*i/steps);return a;};
    for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){
      const u=(axis+1)%3,v=(axis+2)%3,U=knots(half[u]),V=knots(half[v]);
      const vertex=(a,c)=>{const q=[0,0,0];q[axis]=sign*half[axis];q[u]=a;q[v]=c;
        const inner=q.map((t,i)=>Math.max(-half[i]+r,Math.min(half[i]-r,t))),normal=unit(sub(q,inner));
        return{p:add(add(inner,mul(normal,r)),center),n:normal};};
      for(let i=0;i<U.length-1;i++)for(let j=0;j<V.length-1;j++){
        const q=[vertex(U[i],V[j]),vertex(U[i+1],V[j]),vertex(U[i+1],V[j+1]),vertex(U[i],V[j+1])];
        if(sign<0)q.reverse();b.tri(q[0].p,q[1].p,q[2].p,col,q.slice(0,3).map(t=>t.n));b.tri(q[0].p,q[2].p,q[3].p,col,[q[0].n,q[2].n,q[3].n]);
      }
    }return b;
  }
  // Shape-preserving interpolation adds real silhouette resolution to anatomical lofts.
  function interpolateRings(rings,subdivisions=2){
    const out=[];
    for(let i=0;i<rings.length-1;i++)for(let j=0;j<subdivisions;j++){
      const t=j/subdivisions,a=rings[i],b=rings[i+1],p=rings[Math.max(0,i-1)],q=rings[Math.min(rings.length-1,i+2)];
      out.push(Array.from({length:5},(_,k)=>{
        const A=a[k]||0,B=b[k]||0;if(k===0)return A+(B-A)*t;
        const m0=(B-(p[k]||0))*.35,m1=((q[k]||0)-A)*.35;
        return Math.max(Math.min(A,B),Math.min(Math.max(A,B),(2*t*t*t-3*t*t+1)*A+(t*t*t-2*t*t+t)*m0+(-2*t*t*t+3*t*t)*B+(t*t*t-t*t)*m1));
      }));
    }out.push(rings[rings.length-1]);return out;
  }
  function bevelBuilder(b,r=.02) {
    const old=b.box.bind(b);b.box=function(x,y,z,w,h,d,c){if(Math.min(w,h,d)<r*2)return old(x,y,z,w,h,d,c);bevelBox({tri:b.tri.bind(b),box:old},x,y,z,w,h,d,c,r);};return b;
  }

  function personBody(B,jacketColor=0x327d78,pantsColor=0x293f52,skinColor=0xc68b69,hairColor=0x302726) {
    const b=new B(),coat=[...hex(jacketColor),13],skin=[...hex(skinColor),12],hair=hex(hairColor),dark=tint(coat,.72);
    loft(b,[[.94,.20,.14],[1.03,.24,.16],[1.19,.235,.145],[1.42,.285,.18],[1.57,.32,.17],[1.67,.275,.135],[1.72,.13,.095]],coat,20);
    loft(b,[[.89,.20,.14],[.97,.232,.158],[1.015,.238,.16]],hex(pantsColor),16);
    loft(b,[[.985,.239,.164],[1.025,.239,.164]],hex(0x302a28),16);
    bevelBox(b,0,1.008,-.169,.072,.04,.018,hex(0xafa18b),.006);
    b.segment([0,1.65,0],[0,1.85,0],.087,skin,12,.085);
    // Anatomical jaw / cheek / brow / skull silhouette rather than a spherical head.
    loft(b,interpolateRings([[1.80,.064,.070,-.021],[1.835,.102,.093,-.006],[1.91,.143,.124],[2.015,.149,.137,.008],[2.09,.137,.123,.014],[2.14,.102,.093,.018],[2.16,.04,.04,.019]],3),skin,32);
    loft(b,[[2.066,.143,.129,.018],[2.12,.136,.12,.025],[2.17,.094,.085,.023],[2.185,.022,.022,.023]],hair,32);
    for(const side of [-1,1]) {
      b.sphere(side*.146,1.987,.008,.024,.043,.022,skin,8,6);
      b.sphere(side*.052,2.022,-.124,.020,.009,.009,hex(0xdfd9cd),8,5);
      b.sphere(side*.052,2.022,-.132,.007,.008,.004,hex(0x252923),8,5);
      b.segment([side*.03,2.042,-.125],[side*.079,2.040,-.116],.006,hair,6,.005);
      b.segment([side*.091,1.715,-.10],[side*.049,1.61,-.173],.018,dark,8,.012);
      bevelBox(b,side*.17,1.405,-.169,.105,.12,.012,dark,.005);
      b.segment([side*.12,1.456,-.169],[side*.22,1.456,-.169],.003,tint(coat,1.1),5);
    }
    b.sphere(0,1.987,-.139,.022,.033,.032,skin,10,7);
    b.segment([-.031,1.902,-.108],[.031,1.902,-.108],.004,tint(skin,.64),6);
    b.segment([0,1.605,-.180],[0,1.038,-.162],.0035,hex(0xb1a18b),5);
    return b;
  }
  function personArm(B,jacketColor=0x327d78,skinColor=0xc68b69) {
    const b=new B(),coat=[...hex(jacketColor),13],skin=[...hex(skinColor),12];
    b.sphere(0,-.045,0,.11,.13,.115,coat,12,8);
    loft(b,[[-.34,.077,.077,-.027],[-.27,.091,.09,-.018],[-.10,.106,.105,0],[.015,.083,.088,0]],coat,14);
    loft(b,[[-.37,.079,.078,-.032],[-.33,.081,.08,-.027]],tint(coat,.68),14);
    b.segment([0,-.36,-.032],[0,-.66,-.073],.073,skin,14,.046);
    b.sphere(0,-.695,-.081,.047,.082,.033,skin,12,8);
    b.segment([-.04,-.677,-.07],[-.05,-.723,-.09],.019,skin,8,.015);
    for(let i=0;i<4;i++)b.segment([(i-1.5)*.021,-.735,-.083],[(i-1.5)*.020,-.776+Math.abs(i-1.5)*.008,-.087],.009,skin,6,.007);
    loft(b,[[-.622,.052,.052,-.068],[-.602,.054,.054,-.065]],hex(0x24282b),12);
    bevelBox(b,0,-.612,-.126,.04,.033,.008,hex(0xb1b9ba),.004);
    return b;
  }
  function personLeg(B,pantsColor=0x293f52) {
    const b=new B(),pants=hex(pantsColor),shoe=hex(0x303539),sole=hex(0xc6c2b6);
    loft(b,[[-.805,.058,.061,-.017],[-.69,.065,.069,-.02],[-.54,.083,.079,-.018],[-.435,.082,.09,-.025],[-.32,.103,.109,-.005],[-.08,.135,.134],[.015,.129,.13]],pants,16);
    b.segment([.078,-.42,-.023],[.062,-.77,-.022],.003,tint(pants,1.2),5);
    loft(b,[[-.92,.086,.153,-.072],[-.897,.096,.16,-.079],[-.872,.095,.157,-.077]],sole,16);
    loft(b,[[-.875,.094,.155,-.079],[-.837,.091,.145,-.071],[-.799,.074,.106,-.043],[-.766,.059,.07,-.019]],shoe,16);
    for(let i=0;i<4;i++)b.segment([-.034,-.791-i*.013,-.101-i*.018],[.034,-.791-i*.013,-.101-i*.018],.004,hex(0xc5c4b9),5);
    return b;
  }

  // Revolved cross-section around the X axle; rounded shoulder, sidewall and inset alloy barrel.
  function latheX(b,profile,c,segments=32) {
    for(let j=0;j<profile.length-1;j++) for(let i=0;i<segments;i++) {
      const p=profile[j],q=profile[j+1],a=TAU*i/segments,d=TAU*(i+1)/segments;
      const normal=(k,t)=>{const l=profile[Math.max(0,k-1)],r=profile[Math.min(profile.length-1,k+1)];return unit([-(r[1]-l[1]),(r[0]-l[0])*Math.cos(t),(r[0]-l[0])*Math.sin(t)]);};
      const point=(r,t)=>[r[0],r[1]*Math.cos(t),r[1]*Math.sin(t)],pa=point(p,a),pb=point(p,d),pc=point(q,d),pd=point(q,a);
      const ns=[normal(j,a),normal(j,d),normal(j+1,d),normal(j+1,a)];
      b.tri(pa,pb,pc,c,[ns[0],ns[1],ns[2]]);b.tri(pa,pc,pd,c,[ns[0],ns[2],ns[3]]);
    }
  }
  function wheel(B,style='roadster',radius=.47,width=.32) {
    const b=new B(),k=radius/.47,w=width/2,rubber=hex(0x25272b),metal=hex(0xb1b7b9),dark=hex(0x3c4148);
    const profile=[[-w*.88,.30],[-w,.35],[-w*.94,.415],[-w*.70,.459],[-w*.40,.469],[0,.47],[w*.40,.469],[w*.70,.459],[w*.94,.415],[w,.35],[w*.88,.30]];
    latheX(b,profile.map(p=>[p[0],p[1]*k]),rubber,32);
    const spokes=style==='sport'?10:style==='muscle'?5:style==='coupe'?8:6;
    for(const side of [-1,1]) {
      latheX(b,[[side*w*.55,.29*k],[side*w*.86,.31*k],[side*(w+.005),.312*k],[side*(w+.008),.292*k],[side*w*.72,.272*k]].sort((a,d)=>a[0]-d[0]),metal,32);
      b.segment([side*w*.40,0,0],[side*w*.46,0,0],.243*k,hex(0x6d7376),32);
      bevelBox(b,side*w*.57,.185*k,0,.048,.17*k,.085*k,hex(style==='sport'?0xb93726:0x585c60),.009);
      for(let i=0;i<spokes;i++) {
        const a=TAU*i/spokes+.18,da=.17;
        const at=(r,t,x)=>[side*x,r*k*Math.cos(t),r*k*Math.sin(t)];
        b.quad(at(.076,a-da,w+.012),at(.28,a-da*.4,w*.90),at(.28,a+da*.4,w*.90),at(.076,a+da,w+.012),metal,[side,0,0]);
        b.segment(at(.09,a,w+.012),at(.278,a,w*.92),.011*k,metal,6);
      }
      b.segment([side*w*.80,0,0],[side*(w+.018),0,0],.078*k,dark,16);
      for(let i=0;i<5;i++){const a=TAU*i/5;b.sphere(side*(w+.021),.053*k*Math.cos(a),.053*k*Math.sin(a),.008,.009*k,.009*k,metal,6,4);}
      // Concentric sidewall ridges, not a bright flat coin covering the wheel.
      latheX(b,[[side*w*.94,.357*k],[side*(w+.001),.362*k],[side*w*.96,.367*k]].sort((a,d)=>a[0]-d[0]),tint(rubber,1.14),32);
    }
    return b;
  }

  function palm(b,x,z,s=1,ground=0,rnd=Math.random) {
    // Keep exactly 18 calls: this function shares the legacy world's random stream.
    const samples=Array.from({length:18},()=>rnd());
    const top=[x+.6*s,ground+6.4*s,z-.15*s],bark=hex(0x77614b);
    for(let i=0;i<7;i++){
      const t=i/7,u=(i+1)/7,point=v=>[x+.6*s*v*v,ground+6.4*s*v,z-.15*s*v];
      b.segment(point(t),point(u),(.25-.105*t)*s,bark,9,(.25-.105*u)*s);
    }
    for(let i=1;i<11;i++){
      const t=i/11,yy=ground+6.4*s*t,tx=x+.6*s*t*t,tz=z-.15*s*t,r=(.25-.105*t)*s;
      b.cylinder(tx,yy,tz,r*1.035,r*1.07,.038*s,tint(bark,i%3===0?.81:1.12),6);
    }
    for(let i=0;i<9;i++) {
      const a=TAU*i/9+hash(x,z)*.5,dx=Math.cos(a),dz=Math.sin(a),len=(3.1+samples[i*2]*1.25)*s,drop=(.55+samples[i*2+1]*.55)*s;
      const point=t=>[top[0]+dx*len*t,top[1]+Math.sin(t*Math.PI)*.9*s-drop*t*t,top[2]+dz*len*t];
      const c=hex(i%3===0?0x59834b:0x426e43);
      for(let j=0;j<3;j++)b.segment(point(j/3),point((j+1)/3),(.021-.003*j)*s,hex(0x829355),5,(.018-.003*j)*s);
      for(let j=1;j<13;j++)for(const side of [-1,1]){
        const t=j/14,root=point(t),length=(.11+.79*Math.sin(t*Math.PI)**.75)*s,width=.045*s;
        const tip=[root[0]+dx*.18*s-dz*length*side,root[1]-.14*s-length*.35,root[2]+dz*.18*s+dx*length*side];
        const fold=[root[0]+(tip[0]-root[0])*.52,root[1]-.04*s,root[2]+(tip[2]-root[2])*.52];
        b.tri(root,add(fold,[dx*width,0,dz*width]),tip,c);
        b.tri(root,tip,add(fold,[-dx*width,-.012*s,-dz*width]),tint(c,.87));
      }
    }
    for(let i=0;i<3;i++){const a=TAU*i/3;b.sphere(top[0]+Math.cos(a)*.12*s,top[1]-.18*s,top[2]+Math.sin(a)*.12*s,.11*s,.14*s,.11*s,hex(0x696749),6,4);}
  }
  function pine(b,x,z,s=1,y=0,kind='pine') {
    const H=kind==='cypress'?2.3:1.8,phase=hash(x,z)*TAU,trunk=hex(0x665440),c=hex(kind==='cypress'?0x426d55:0x3c614f);
    b.cylinder(x,y+2.75*s*H,z,.105*s,.23*s,5.5*s*H,trunk,9);
    for(let layer=0;layer<6;layer++){
      const h=(2.0+layer*.73)*s*H,reach=(1.92-layer*.25)*s;
      for(let branch=0;branch<7;branch++){
        const a=phase+branch*TAU/7+layer*.49,dx=Math.cos(a),dz=Math.sin(a),tip=[x+dx*reach,y+h-.27*s*H,z+dz*reach],base=[x,y+h+.55*s*H,z],side=[-dz*reach*.25,0,dx*reach*.25];
        b.tri(base,add(tip,side),tip,tint(c,.88+hash(layer,branch)*.25));
        b.tri(base,tip,sub(tip,side),tint(c,.82+hash(branch,layer)*.2));
        b.tri(add(tip,side),sub(tip,side),[x,y+h-.12*s,z],tint(c,.78));
      }
    }
    b.coneY(x,y+6.05*s*H,z,.32*s,.9*s*H,tint(c,1.08),7);
  }
  function roofDetail(b,x,z,w,d,h,col) {
    const r=hex(0xc7c2b4),roof=hex(0x747b7b);
    b.box(x,h+.055,z,Math.max(1,w-.28),.10,Math.max(1,d-.28),roof);
    for(const side of [-1,1]){
      b.box(x+side*(w*.5-.12),h+.27,z,.24,.48,d,r);
      b.box(x,h+.27,z+side*(d*.5-.12),w,.48,.24,r);
    }
  }
  return {install,smoothNormals,loft,bevelBox,roundedBox,interpolateRings,bevelBuilder,personBody,personArm,personLeg,wheel,palm,pine,roofDetail};
});
