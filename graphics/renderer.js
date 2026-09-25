/* Bounded sun shadows + atmospheric sky for the existing WebGL renderer. No engine dependency. */
(function(root){
'use strict';
const normalize=v=>{const l=Math.hypot(...v);return l>1e-9?v.map(x=>x/l):[0,0,-1];};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const identity=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
const sun=normalize([-.6,.66,.45]);
function multiply(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];return o;}
function lightFrame(eye,target,size){
 const forward=normalize(target.map((v,i)=>v-eye[i]));
 const center=[eye[0]+forward[0]*23,eye[1]+forward[1]*23+12,eye[2]+forward[2]*23];
 const source=center.map((v,i)=>v+sun[i]*300),z=sun,x=normalize(cross([0,1,0],z)),y=cross(z,x),radius=112;
 const view=new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,source),-dot(y,source),-dot(z,source),1]);
 const texel=radius*2/Math.max(1,size);
 view[12]=Math.round(view[12]/texel)*texel;view[13]=Math.round(view[13]/texel)*texel;
 const near=1,far=640,ortho=identity();ortho[0]=ortho[5]=1/radius;ortho[10]=-2/(far-near);ortho[14]=-(far+near)/(far-near);
 return {matrix:multiply(ortho,view),center,radius};
}
function create(gl,mainProgram){
 const S=root.NeonCoastShaders;
 if(!S)throw new Error('NeonCoastShaders must load before the renderer.');
 const vao=gl.getExtension('OES_vertex_array_object'),shadowVAOs=new WeakMap(),staticMeshes=new WeakSet();
 const stats={version:'coast-lighting-1',frames:0,shadowSize:0,shadowEnabled:false,staticShadowDraws:0,dynamicShadowDraws:0,shadowTriangles:0,queuedCasters:0};
 let previous=[],current=[],frame=lightFrame([0,4,8],[0,1,0],2048),worldRegistered=false;
 let framebuffer=null,depth=null,texture=null,shadowSize=0,shadowAvailable=true;
 const maxSize=Math.min(2048,gl.getParameter(gl.MAX_TEXTURE_SIZE));
 const shadowRequested=!(typeof location!=='undefined'&&new URLSearchParams(location.search).get('shadows')==='0');
 function program(vs,fs){
  const shaders=[];const p=gl.createProgram();
  try {
   for(const [type,source] of [[gl.VERTEX_SHADER,vs],[gl.FRAGMENT_SHADER,fs]]){
    const s=gl.createShader(type);shaders.push(s);gl.shaderSource(s,source);gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));gl.attachShader(p,s);
   }
   gl.bindAttribLocation(p,0,'a_position');gl.linkProgram(p);
   if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));return p;
  }catch(error){gl.deleteProgram(p);throw error;}finally{for(const s of shaders)gl.deleteShader(s);}
 }
 const shadowProgram=program(S.shadowVertex,S.shadowFragment),skyProgram=program(S.skyVertex,S.skyFragment);
 const uniform=(p,name)=>gl.getUniformLocation(p,name);
 const shadowLoc={model:uniform(shadowProgram,'u_model'),matrix:uniform(shadowProgram,'u_light_matrix')};
 const mainLoc={matrix:uniform(mainProgram,'u_light_matrix'),sampler:uniform(mainProgram,'u_shadow_map'),texel:uniform(mainProgram,'u_shadow_texel'),enabled:uniform(mainProgram,'u_shadow_enabled'),time:uniform(mainProgram,'u_time')};
 const skyLoc=Object.fromEntries(['forward','right','up','aspect','night','time'].map(k=>[k,uniform(skyProgram,'u_'+k)]));
 const skyBuffer=gl.createBuffer(),skyVAO=vao?vao.createVertexArrayOES():null;
 if(vao)vao.bindVertexArrayOES(skyVAO);
 gl.bindBuffer(gl.ARRAY_BUFFER,skyBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
 gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);if(vao)vao.bindVertexArrayOES(null);
 const modelIdentity=identity();
 function freeTarget(){if(texture)gl.deleteTexture(texture);if(depth)gl.deleteRenderbuffer(depth);if(framebuffer)gl.deleteFramebuffer(framebuffer);texture=depth=framebuffer=null;}
 function allocate(size){
  freeTarget();shadowSize=size;texture=gl.createTexture();gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,size,size,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  depth=gl.createRenderbuffer();gl.bindRenderbuffer(gl.RENDERBUFFER,depth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,size,size);
  framebuffer=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depth);
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE){
   shadowAvailable=false;console.warn('Sun shadow target unavailable; continuing with sky/material lighting.');
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindRenderbuffer(gl.RENDERBUFFER,null);stats.shadowSize=size;
 }
 // A complete sampler binding also exists when shadows are disabled by the URL.
 allocate(Math.max(1,maxSize));gl.useProgram(mainProgram);gl.uniform1i(mainLoc.sampler,2);gl.activeTexture(gl.TEXTURE0);
 function bindShadowMesh(mesh){
  if(vao){let v=shadowVAOs.get(mesh);if(!v){v=vao.createVertexArrayOES();vao.bindVertexArrayOES(v);gl.bindBuffer(gl.ARRAY_BUFFER,mesh.p);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,0,0);shadowVAOs.set(mesh,v);}else vao.bindVertexArrayOES(v);}
  else {gl.bindBuffer(gl.ARRAY_BUFFER,mesh.p);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,0,0);}
 }
 function caster(mesh,transform){if(!mesh?.p||!mesh.count)return;bindShadowMesh(mesh);gl.uniformMatrix4fv(shadowLoc.model,false,transform);gl.drawArrays(gl.TRIANGLES,0,mesh.count);stats.shadowTriangles+=mesh.count/3;}
 function begin(eye,target,night,time,chunks,scale=1){
  stats.frames++;previous=current;current=[];stats.staticShadowDraws=stats.dynamicShadowDraws=stats.shadowTriangles=0;
  if(!worldRegistered){for(const mesh of chunks)staticMeshes.add(mesh);worldRegistered=true;}
  const desired=Math.min(maxSize,scale<.8?1024:2048);
  if(shadowAvailable&&desired!==shadowSize)allocate(desired);
  frame=lightFrame(eye,target,shadowSize);
  const enabled=shadowRequested&&shadowAvailable&&!night;
  stats.shadowEnabled=enabled;
  if(enabled){
   if(vao)vao.bindVertexArrayOES(null);
   gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.viewport(0,0,shadowSize,shadowSize);
   gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.depthFunc(gl.LEQUAL);
   gl.clearColor(1,1,1,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(shadowProgram);
   gl.uniformMatrix4fv(shadowLoc.matrix,false,frame.matrix);
   // Casters are selected independently of the gameplay camera frustum.
   for(const mesh of chunks){const b=mesh.bounds;if(!b)continue;const dx=Math.max(b.minX-frame.center[0],0,frame.center[0]-b.maxX),dz=Math.max(b.minZ-frame.center[2],0,frame.center[2]-b.maxZ);if(dx*dx+dz*dz>190*190)continue;caster(mesh,modelIdentity);stats.staticShadowDraws++;}
   for(const item of previous){if(Math.hypot(item.model[12]-frame.center[0],item.model[14]-frame.center[2])>190)continue;caster(item.mesh,item.model);stats.dynamicShadowDraws++;}
  }
  if(vao)vao.bindVertexArrayOES(null);
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight);gl.useProgram(mainProgram);
  gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(mainLoc.sampler,2);gl.activeTexture(gl.TEXTURE0);
  gl.uniformMatrix4fv(mainLoc.matrix,false,frame.matrix);gl.uniform2f(mainLoc.texel,1/shadowSize,1/shadowSize);gl.uniform1f(mainLoc.enabled,enabled?1:0);gl.uniform1f(mainLoc.time,time);
  stats.queuedCasters=previous.length;
 }
 function sky(eye,target,night,time){
  const forward=normalize(target.map((v,i)=>v-eye[i])),right=normalize(cross(forward,[0,1,0])),up=cross(right,forward);
  gl.useProgram(skyProgram);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.depthMask(false);
  gl.uniform3fv(skyLoc.forward,forward);gl.uniform3fv(skyLoc.right,right);gl.uniform3fv(skyLoc.up,up);
  gl.uniform1f(skyLoc.aspect,gl.drawingBufferWidth/gl.drawingBufferHeight);gl.uniform1f(skyLoc.night,night?1:0);gl.uniform1f(skyLoc.time,time);
  if(vao)vao.bindVertexArrayOES(skyVAO);else{gl.bindBuffer(gl.ARRAY_BUFFER,skyBuffer);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);}
  gl.drawArrays(gl.TRIANGLES,0,3);if(vao)vao.bindVertexArrayOES(null);
  gl.depthMask(true);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.useProgram(mainProgram);
 }
 function record(mesh,transform,material,emission,alpha){
  if(!stats.shadowEnabled||staticMeshes.has(mesh)||material===6||alpha<.99||emission>.05||current.length>=1200)return;
  if(Math.hypot(transform[12]-frame.center[0],transform[14]-frame.center[2])>170)return;
  current.push({mesh,model:new Float32Array(transform)});
 }
 function forget(mesh){const v=shadowVAOs.get(mesh);if(v&&vao)vao.deleteVertexArrayOES(v);shadowVAOs.delete(mesh);}
 function dispose(){freeTarget();gl.deleteBuffer(skyBuffer);gl.deleteProgram(shadowProgram);gl.deleteProgram(skyProgram);if(vao)vao.deleteVertexArrayOES(skyVAO);previous=[];current=[];}
 return {begin,sky,record,forget,dispose,stats:()=>({...stats})};
}
root.NeonCoastRenderer={create,lightFrame};if(typeof module==='object'&&module.exports)module.exports=root.NeonCoastRenderer;
})(typeof globalThis!=='undefined'?globalThis:this);
