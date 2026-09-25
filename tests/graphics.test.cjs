const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'game.js'), 'utf8');
const start = source.indexOf('    class Builder{');
const end = source.indexOf('    function gpuMesh', start);
const sandbox = { Math, Float32Array, Map };
vm.createContext(sandbox);
vm.runInContext(`const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)); const shade=(c,f)=>c.map(v=>clamp(v*f,0,1));\n${source.slice(start, end).replace(/\s*NeonCoastGeometry\.install\(Builder\);/, '')}\nglobalThis.Builder=Builder;`, sandbox);
const modPath = path.join(root, 'graphics', 'geometry.js');
let G;
try { G = require(modPath); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
function ready() { assert.ok(G, 'The shared graphics geometry implementation must exist'); G.install(sandbox.Builder); return sandbox.Builder; }
function check(b) {
 assert.equal(b.p.length,b.n.length); assert.equal(b.p.length,b.c.length);
 assert.ok(b.p.length > 0); assert.ok(b.p.every(Number.isFinite));
 for(let i=0;i<b.n.length;i+=3) assert.ok(Math.abs(Math.hypot(...b.n.slice(i,i+3))-1)<1e-5,'unit normal');
}
function bounds(b) { const r=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity]; for(let i=0;i<b.p.length;i++) {const a=i%3;r[a]=Math.min(r[a],b.p[i]);r[a+3]=Math.max(r[a+3],b.p[i]);} return r; }
test('smooth ellipsoid has finite analytic normals, outward winding and no degenerate poles',()=>{
 const B=ready(), b=new B(); b.sphere(2,3,4,1,2,3,[.5,.6,.7],12,8);check(b);
 for(let i=0;i<b.p.length;i+=9){const p=b.p.slice(i,i+9),u=[p[3]-p[0],p[4]-p[1],p[5]-p[2]],v=[p[6]-p[0],p[7]-p[1],p[8]-p[2]],cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];assert.ok(Math.hypot(...cross)>1e-9);assert.ok(cross.reduce((s,x,j)=>s+x*b.n[i+j],0)>0);}
 assert.deepEqual(bounds(b).map(x=>Math.round(x*1e6)/1e6),[1,1,1,3,5,7]);
});
test('smooth primitives retain chunk bounds and normalized tapered segment normals',()=>{
 const B=ready(), b=new B(256);b.sphere(300,2,-300,2,1,3,[1,0,0],12,8);assert.ok(b.chunks.size>0);
 for(const c of b.chunks.values()){check(c);assert.ok(Number.isFinite(c.bounds.minX));}
 const s=new B();s.segment([0,0,0],[1,2,3],.4,[1,0,0],12,.1);check(s);
});
test('character replacement preserves animation anchors and places sole at ground',()=>{
 const B=ready();const leg=G.personLeg(B,0x293f52),arm=G.personArm(B,0x327d78,0xc68b69),body=G.personBody(B,0x327d78,0x293f52,0xc68b69,0x302726);[leg,arm,body].forEach(check);
 assert.ok(Math.abs(bounds(leg)[1]+.92)<.006,'hip y=.92 must meet ground');
 assert.ok(bounds(body)[4]<2.23 && bounds(body)[4]>2.1);assert.ok(bounds(arm)[1]<-.72);
 assert.ok(body.p.length/9<6500 && leg.p.length/9<2500);
});
test('wheel retains original rolling radius and axle orientation for every class',()=>{
 const B=ready();for(const type of ['roadster','muscle','coupe','sport']){const b=G.wheel(B,type);check(b);const q=bounds(b);assert.ok(Math.abs(q[4]-.47)<.002);assert.ok(Math.abs(q[2]+.47)<.002);assert.ok(q[3]<.21);assert.ok(b.p.length/9<7000);}
});
test('palm consumes exactly the original 18 random samples and stays deterministic',()=>{
 const B=ready();let calls=0;const b=new B();G.palm(b,10,20,1,2,()=>{calls++;return .5});check(b);assert.equal(calls,18);
 const b2=new B();G.palm(b2,10,20,1,2,()=>.5);assert.deepEqual(b.p,b2.p);assert.ok(b.p.length/9<1600);
});
test('car smoothing changes only normals and preserves creases and mesh data',()=>{
 const B=ready(),b=new B();b.box(0,0,0,1,1,1,[.4,.5,.6]);const oldP=[...b.p],oldC=[...b.c];G.smoothNormals(b,.75);check(b);assert.deepEqual(Array.from(b.p),oldP);assert.deepEqual(Array.from(b.c),oldC);assert.equal(Math.abs(b.n[2]),1);
});
test('forward shader stays inside WebGL 1 minimum eight texture units',()=>{
 const shader=require('../graphics/shaders.js');const uniforms=[...shader.fragment.matchAll(/uniform sampler2D (\w+)/g)].map(m=>m[1]);assert.equal(new Set(uniforms).size,8);assert.ok(uniforms.includes('u_shadow_map'));assert.match(shader.vertex,/cross\(m\[1\],m\[2\]\)/);
});
test('shadow view is finite at coincident camera/target and uses texel-snapped translation',()=>{
 let renderer;try{renderer=require('../graphics/renderer.js');}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
 assert.ok(renderer,'the graphics renderer must exist');
 const a=renderer.lightFrame([0,4,8],[0,1,0],2048);const b=renderer.lightFrame([0,4,8],[0,4,8],1024);
 assert.ok(Array.from(a.matrix).every(Number.isFinite));assert.ok(Array.from(b.matrix).every(Number.isFinite));assert.equal(a.matrix.length,16);assert.equal(a.radius,112);
});
