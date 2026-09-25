'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
let browser;before(async()=>{browser=await chromium.launch({executablePath:process.env.QA_BROWSER||undefined,headless:true});});after(async()=>browser?.close());
async function pageFor(viewport){const page=await browser.newPage({viewport});const root=path.join(__dirname,'..');let html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'');const css=['styles.css','ui/coastal.css'].map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n').replace(/url\([^)]*\)/g,'none');await page.setContent(html);await page.addStyleTag({content:css});await page.evaluate(()=>{document.getElementById('loading-screen')?.remove();document.getElementById('menu').remove();document.getElementById('hud').style.opacity=1;document.getElementById('map-overlay').classList.add('show');});return page;}
test('atlas header, map, destination and footer fit desktop and mobile without canvas sizing feedback',async()=>{
 for(const viewport of [{width:1280,height:800},{width:900,height:560},{width:390,height:844}]){const p=await pageFor(viewport);try{
  const bounds=await p.evaluate(()=>{const ids=['map-panel','worldmap','map-close','clear-route'];return [...ids.map(id=>document.getElementById(id)),document.querySelector('.map-foot')].map(el=>({id:el.id||el.className,x:el.getBoundingClientRect().x,y:el.getBoundingClientRect().y,w:el.getBoundingClientRect().width,h:el.getBoundingClientRect().height}));});
  for(const q of bounds){assert.ok(q.x>=0&&q.y>=0&&q.w>0&&q.h>0,q.id+' has visible size');assert.ok(q.x+q.w<=viewport.width+.5&&q.y+q.h<=viewport.height+.5,q.id+' fits '+JSON.stringify(viewport)+' '+JSON.stringify(q));}
 }finally{await p.close();}}
});
test('location UI controls update actual view state and restore focus',async()=>{
 const p=await pageFor({width:1280,height:800});try{
  await p.addScriptTag({content:fs.readFileSync(path.join(__dirname,'../ui/interface.js'),'utf8')});
  await p.evaluate(()=>{window.testView={x:0,z:0,zoom:1};window.pins=[];window.testUI=NeonCoastUI.create({canvas:document.getElementById('worldmap'),view:testView,redraw(){},pin(x,z,name){pins.push({x,z,name});return true;},player:()=>({x:100,z:200}),locations:[{name:'SUNPORT',type:'place',x:500,z:600},{name:'Pier',type:'activity',x:10,z:20}],toggleMap(value){document.getElementById('map-overlay').classList.toggle('show',value);testUI.open(value);}});testUI.open(true);});
  await p.locator('#map-zoom-in').click();assert.equal(await p.evaluate(()=>testView.zoom),1.5);
  await p.locator('#map-search').fill('sun');assert.equal(await p.locator('.map-place').count(),1);await p.locator('.map-place').click();assert.deepEqual(await p.evaluate(()=>pins),[{x:500,z:600,name:'SUNPORT'}]);
  await p.locator('#map-player').click();assert.deepEqual(await p.evaluate(()=>testView),{x:100,z:200,zoom:6});
  await p.locator('#map-fit').click();assert.deepEqual(await p.evaluate(()=>testView),{x:0,z:0,zoom:1});
  await p.locator('[data-map-category="service"]').click();assert.equal(await p.locator('.map-place').count(),0);assert.equal(await p.locator('.map-empty').innerText(),'No matching locations.');
 }finally{await p.close();}
});
