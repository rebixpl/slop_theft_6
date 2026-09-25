'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
let UI;try{UI=require('../ui/interface.js');}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
const ready=()=>assert.ok(UI,'map interface implementation exists');
test('map projection and click coordinates round-trip after pan, zoom and resize',()=>{ready();for(const w of [320,1000,1600])for(const zoom of [1,3,16]){const v={x:430,z:-900,zoom},q=UI.project(300,-172,w,640,v),r=UI.unproject(q[0],q[1],w,640,v);assert.ok(Math.abs(r[0]-300)<1e-9&&Math.abs(r[1]+172)<1e-9);}});
test('map zoom is bounded and keeps point under the pointer stationary',()=>{ready();const v={x:200,z:300,zoom:2},before=UI.unproject(123,321,800,640,v);UI.zoomAt(v,99,123,321,800,640);assert.equal(v.zoom,16);const after=UI.unproject(123,321,800,640,v);assert.ok(Math.hypot(after[0]-before[0],after[1]-before[1])<1e-6);UI.zoomAt(v,.001,123,321,800,640);assert.equal(v.zoom,1);});
test('place search combines category and case-insensitive text without mutating input',()=>{ready();const places=[{name:'Pink Palm Pier',type:'activity'},{name:'Sunport Hospital',type:'service'},{name:'Sunport',type:'place'}];assert.equal(UI.filterPlaces(places,' SUNPORT ','all').length,2);assert.deepEqual(UI.filterPlaces(places,'sun','service'),[places[1]]);assert.equal(places.length,3);});
