'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8');
const scope={Math,Float32Array,Map};vm.createContext(scope);
vm.runInContext(`const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));const shade=(c,f)=>c.map(x=>x*f);${src.slice(src.indexOf('    class Builder{'),src.indexOf('    function gpuMesh')).replace(/\s*NeonCoastGeometry\.install\(Builder\);/,'')}globalThis.Builder=Builder;`,scope);
require('../graphics/geometry.js').install(scope.Builder);
let A;try{A=require('../graphics/architecture.js');}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
const ready=()=>{assert.ok(A,'architecture module must exist');return new scope.Builder();};
function bounds(b){let q=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];for(let i=0;i<b.p.length;i++){let k=i%3;q[k]=Math.min(q[k],b.p[i]);q[k+3]=Math.max(q[k+3],b.p[i]);}return q;}
test('four facade styles have finite geometry, material tags and bounded footprints',()=>{
 for(let variant=0;variant<4;variant++){
  const b=ready();A.building(b,20,30,24,20,22,[.8,.6,.5],variant);
  assert.ok(b.p.length>1000);assert.ok(b.p.every(Number.isFinite));assert.equal(b.p.length,b.n.length);assert.equal(b.p.length,b.c.length);
  const q=bounds(b);assert.ok(q[0]>=20-12-.55&&q[3]<=20+12+.55,'preserve X reservation');assert.ok(q[2]>=30-10-.55&&q[5]<=30+10+.65,'preserve Z reservation');assert.ok(q[1]>=-.11&&q[4]<=24.2,'roof height remains bounded');
  const tags=new Set(b.s);assert.ok(tags.has(7)||tags.has(8),'explicit window surface');assert.ok(tags.has(3),'stone/coping surface');assert.ok(b.p.length/9<6500,'per-building triangle budget');
 }
});
test('window panes sit behind front piers instead of floating on a solid facade',()=>{
 const b=ready();A.building(b,0,0,18,16,12,[.8,.6,.5],0);
 let panes=0;for(let i=0;i<b.s.length;i++)if((b.s[i]===7||b.s[i]===8)&&b.n[i*3+2]>.9){assert.ok(b.p[i*3+2]<8-.10,'glass recessed behind outer wall at z=8');panes++;}assert.ok(panes>0);
});
test('architecture is deterministic and does not consume gameplay random numbers',()=>{
 const a=ready(),b=ready(),old=Math.random;try{Math.random=()=>{throw Error('shared RNG used');};A.building(a,0,0,20,18,16,[.7,.8,.7],2);A.building(b,0,0,20,18,16,[.7,.8,.7],2);}finally{Math.random=old;}assert.deepEqual(a.p,b.p);assert.deepEqual(a.s,b.s);
});
test('surface stream is optional, stays aligned and survives world chunking',()=>{
 const b=ready();b.box(0,1,0,1,1,1,[.3,.3,.3]);assert.equal(b.s,null);b.box(2,1,0,1,1,1,[.8,.7,.6,3]);b.box(4,1,0,1,1,1,[.3,.3,.3]);assert.equal(b.s.length,b.p.length/3);assert.equal(b.s[0],0);assert.equal(b.s[b.s.length-1],0);
 const chunks=new scope.Builder(256);A.building(chunks,255,0,20,18,10,[.7,.6,.5],1);assert.ok(chunks.chunks.size>1);for(const c of chunks.chunks.values())assert.equal(c.s.length,c.p.length/3);
});
test('cottage retains ground/stilt elevation and original ridge height',()=>{
 for(const stilts of [false,true]){const b=ready();A.cottage(b,0,0,9,8,4,[.6,.7,.6],[.5,.3,.2],12,stilts);const q=bounds(b);assert.ok(q[1]>=11.95);assert.ok(q[4]<=12+(stilts?1.35:0)+4+Math.max(1.35,9*.17)+.25);assert.ok(new Set(b.s).has(4),'tiled roof material');}
});
test('world construction flushes bounded geometry batches without losing vertices or surface tags',()=>{
 const flushed=[];const b=new scope.Builder(256,false,part=>{const data=part.data();flushed.push({count:data.count,bounds:{...part.bounds},tags:[...new Set(data.s)]});return{count:data.count,bounds:{...part.bounds}};});
 for(let i=0;i<18000;i++)b.tri([0,0,0],[2,0,0],[0,2,0],[.8,.7,.6,2],[0,0,1]);
 assert.ok(flushed.length>=3,'stream geometry before exhausting the browser heap');
 assert.equal(flushed.reduce((n,p)=>n+p.count,0)+[...b.chunks.values()].reduce((n,p)=>n+p.p.length/3,0),54000);
 assert.ok(flushed.every(p=>p.count<=16386&&p.tags.length===1&&p.tags[0]===2));
 assert.ok([...b.chunks.values()].every(p=>p.p.length<49152));
});
