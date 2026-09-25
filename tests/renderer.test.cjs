'use strict';
// Real WebGL regression fixtures. No game URL/network or mocks of GL calls.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
let browser;
before(async()=>{browser=await chromium.launch({executablePath:process.env.QA_BROWSER||undefined,headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});});
after(async()=>{await browser?.close();});
async function fixture(options){
 const page=await browser.newPage();
 try{
  await page.setContent('<canvas id="view" width="256" height="256"></canvas>');
  for(const name of ['shaders','renderer'])await page.addScriptTag({content:fs.readFileSync(path.join(__dirname,'../graphics',name+'.js'),'utf8')});
  return await page.evaluate(options=>{
   const gl=document.querySelector('canvas').getContext('webgl',{antialias:false,preserveDrawingBuffer:true});
   if(!gl)throw new Error('WebGL is required for renderer regression checks');
   const originalGetExtension=gl.getExtension.bind(gl);
   if(options.noVAO)gl.getExtension=name=>name==='OES_vertex_array_object'?null:originalGetExtension(name);
   const S=NeonCoastShaders,program=gl.createProgram();
   const fragment=options.shadowOnly?S.fragment.replace('gl_FragColor=vec4(displayColor(mix(color,fog,haze)),u_alpha);','gl_FragColor=vec4(vec3(visibility),1.0);'):S.fragment;
   for(const [type,text] of [[gl.VERTEX_SHADER,S.vertex],[gl.FRAGMENT_SHADER,fragment]]){
    const shader=gl.createShader(type);gl.shaderSource(shader,text);gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));gl.attachShader(program,shader);
   }
   gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));gl.useProgram(program);
   const renderer=NeonCoastRenderer.create(gl,program);
   const units={ground_texture:0,road_texture:1,architecture_texture:3,hardscape_texture:4,nature_texture:5,vehicle_atlas:6,paint_texture:7};
   for(const [name,unit] of Object.entries(units)){
    gl.activeTexture(gl.TEXTURE0+unit);const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([180,180,180,255]));gl.uniform1i(gl.getUniformLocation(program,'u_'+name),unit);
   }
   function mesh(p,n,c,bounds){const result={count:p.length/3,bounds};for(const [k,data]of Object.entries({p,n,c})){result[k]=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,result[k]);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);}return result;}
   const groundP=[-80,0,-80,80,0,80,80,0,-80,-80,0,-80,-80,0,80,80,0,80];
   const ground=mesh(groundP,Array.from({length:6},()=>[0,1,0]).flat(),Array(18).fill(.5),{minX:-80,maxX:80,minY:0,maxY:0,minZ:-80,maxZ:80});
   const identity=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
   function draw(m){for(const [k,name]of Object.entries({p:'a_position',n:'a_normal',c:'a_color'})){const loc=gl.getAttribLocation(program,name);if(loc<0)continue;gl.bindBuffer(gl.ARRAY_BUFFER,m[k]);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,3,gl.FLOAT,false,0,0);}gl.uniformMatrix4fv(gl.getUniformLocation(program,'u_model'),false,identity);gl.drawArrays(gl.TRIANGLES,0,m.count);}
   const errors=[];function check(stage){let code;while((code=gl.getError())!==gl.NO_ERROR)errors.push({stage,code});}
   // A small previous draw leaves short normal/color streams in non-VAO global state.
   const tiny=mesh([0,0,0,1,0,0,0,0,1],[0,1,0,0,1,0,0,1,0],Array(9).fill(.5));draw(tiny);check('small previous draw');
   const ditherBefore=gl.isEnabled(gl.DITHER),polygonBefore=gl.isEnabled(gl.POLYGON_OFFSET_FILL);
   renderer.begin([0,24,24],[0,0,0],false,1,[ground],1);check('shadow pass');
   const ditherAfter=gl.isEnabled(gl.DITHER),polygonAfter=gl.isEnabled(gl.POLYGON_OFFSET_FILL);
   gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
   renderer.sky([0,24,24],[0,0,0],false,1);check('sky pass');
   gl.uniformMatrix4fv(gl.getUniformLocation(program,'u_vp'),false,new Float32Array([1/60,0,0,0,0,0,-1/100,0,0,-1/60,0,0,0,0,0,1]));
   gl.uniform3f(gl.getUniformLocation(program,'u_eye'),0,40,0);gl.uniform1f(gl.getUniformLocation(program,'u_alpha'),1);gl.uniform1f(gl.getUniformLocation(program,'u_material'),4);
   draw(ground);check('main pass');
   const pixels=new Uint8Array(64*64*4);gl.readPixels(96,96,64,64,gl.RGBA,gl.UNSIGNED_BYTE,pixels);check('read pixels');
   let darkPixels=0,min=255,max=0;for(let i=0;i<pixels.length;i+=4){min=Math.min(min,pixels[i]);max=Math.max(max,pixels[i]);if(pixels[i]<250)darkPixels++;}
   const stats=renderer.stats();renderer.dispose();
   return {errors,darkPixels,min,max,ditherBefore,ditherAfter,polygonBefore,polygonAfter,stats};
  },options);
 }finally{await page.close();}
}
test('a sunlit plane does not shadow itself with striped PCF bands',async()=>{
 const result=await fixture({shadowOnly:true});console.log('plane',JSON.stringify(result));
 assert.deepEqual(result.errors,[]);assert.equal(result.stats.shadowEnabled,true);assert.equal(result.darkPixels,0,'every interior pixel must be unoccluded on an otherwise empty plane');
 assert.equal(result.ditherAfter,result.ditherBefore);assert.equal(result.polygonAfter,result.polygonBefore);
});
test('non-VAO path resets short attribute buffers between shadow, sky and main passes',async()=>{
 const result=await fixture({noVAO:true});console.log('noVAO',JSON.stringify(result));
 assert.deepEqual(result.errors,[]);assert.ok(result.max>30,'actual geometry must render');
});
