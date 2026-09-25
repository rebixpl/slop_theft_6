'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
// Exercise the production loader; only its browser/GL boundary is substituted.
function fixture(){
 const source=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8');
 const code=source.slice(source.indexOf('    function makeWorldTexture('),source.indexOf("    makeWorldTexture(0,"));
 const images=[],microtasks=[],timers=[],uploads=[],warnings=[];
 class Image{constructor(){images.push(this);this.complete=false;this.naturalWidth=0;this.naturalHeight=0;}set src(value){this.request=value;}}
 const gl={TEXTURE0:0,createTexture:()=>({}),activeTexture(){},bindTexture(){},texParameteri(){},texImage2D(...args){uploads.push(args);},generateMipmap(){},pixelStorei(){}};
 const context={Image,gl,URL,Uint8Array,Math,console:{warn:m=>warnings.push(m)},queueMicrotask:fn=>microtasks.push(fn),window:{setTimeout:fn=>(timers.push(fn),timers.length),clearTimeout(){}},document:{baseURI:'http://127.0.0.1:8765/'}};
 vm.createContext(context);vm.runInContext(`let totalWorldTextures=0,loadedWorldTextures=0;const materialLoadTimeoutMs=12000,worldTextureReport={},anisotropyExtension=null;function finishLoadingCheck(){}${code}\nglobalThis.status=()=>({count:loadedWorldTextures,report:worldTextureReport});`,context);
 context.makeWorldTexture(0,'test.png',[1,2,3,255]);return{context,images,microtasks,timers,uploads,warnings};
}
test('texture deadline starts with the deferred request, not before synchronous world construction',()=>{
 const f=fixture();assert.equal(f.images[0].request,undefined);assert.equal(f.timers.length,0);assert.equal(f.microtasks.length,1);f.microtasks[0]();assert.equal(f.images[0].request,'http://127.0.0.1:8765/test.png');assert.equal(f.timers.length,1);
});
test('a decoded image queued behind other work is uploaded instead of falsely timing out',()=>{
 const f=fixture();f.microtasks.forEach(fn=>fn());Object.assign(f.images[0],{complete:true,naturalWidth:64,naturalHeight:64});f.timers[0]();assert.equal(f.context.status().report['test.png'].state,'loaded');assert.equal(f.context.status().count,1);assert.equal(f.warnings.length,0);assert.equal(f.uploads.at(-1).at(-1),f.images[0]);
});
test('late success repairs fallback status without double-counting loading progress',()=>{
 const f=fixture();f.microtasks.forEach(fn=>fn());f.timers[0]();assert.equal(f.context.status().report['test.png'].state,'fallback');assert.equal(f.context.status().count,1);Object.assign(f.images[0],{complete:true,naturalWidth:64,naturalHeight:64});f.images[0].onload();assert.equal(f.context.status().report['test.png'].state,'loaded');assert.equal(f.context.status().count,1);f.images[0].onerror();assert.equal(f.context.status().report['test.png'].state,'loaded');
});
