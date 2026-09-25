'use strict';
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const out = process.env.QA_OUTPUT || '/tmp/visual-qa';
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.QA_BROWSER || undefined, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  if(process.env.QA_NO_VAO==='1')await page.addInitScript(()=>{const get=WebGLRenderingContext.prototype.getExtension;WebGLRenderingContext.prototype.getExtension=function(name){return name==='OES_vertex_array_object'?null:get.call(this,name);};});
  const errors = [], warnings = [], messages = [], checks = {};
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if(m.type()==='error') errors.push(m.text()); else if(m.type()==='warning') warnings.push(m.text()); else messages.push(m.text()); });
  page.setDefaultTimeout(120000);
  // Deterministic integration fixture: avoid an unbounded GPU queue on a software renderer.
  // Production code is unchanged; every stepped callback is the game's real frame/update/render.
  await page.addInitScript(() => {
    const nativeRAF = window.requestAnimationFrame.bind(window);
    let queue = [], id = 0, clock = performance.now(), seed = 34567;
    window.requestAnimationFrame = callback => { const item={id:++id,callback}; queue.push(item); return item.id; };
    window.cancelAnimationFrame = token => { queue=queue.filter(item=>item.id!==token); };
    window.__qaFrames=0;
    window.__qaAdvance = async count => {
      for(let i=0;i<count;i++) {
        const pending=queue;queue=[];clock+=1000/60;
        for(const item of pending){window.__qaFrames++;item.callback(clock);}
        await new Promise(resolve=>nativeRAF(resolve));
      }
    };
    Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  });
  const step = count => page.evaluate(n=>window.__qaAdvance(n),count);
  const shot = async name => {await step(2);const error=await page.evaluate(()=>document.getElementById('view').getContext('webgl').getError());assert.equal(error,0,'GL error at '+name);await page.screenshot({path:path.join(out,name+'.png'),timeout:120000});};
  try {
    await page.goto(process.env.QA_URL || 'http://127.0.0.1:8765/?debug=1', { waitUntil: 'load', timeout: 120000 });
    await step(3);
    await page.waitForFunction(() => !!window.neonCoastDebug, undefined, {polling:100,timeout:120000});
    await step(2);
    await page.waitForFunction(() => !document.getElementById('loading-screen'), undefined, {polling:100,timeout:120000});
    checks.title = await page.title();assert.match(checks.title,/Neon Coast/);
    await page.locator('#start').click();await step(2);
    checks.started = await page.locator('#menu').evaluate(el => el.classList.contains('gone'));assert.equal(checks.started,true);
    checks.spawn = await page.evaluate(() => neonCoastDebug.state());
    await shot('street');
    await page.keyboard.down('w');await step(6);await page.keyboard.up('w');
    checks.walked = await page.evaluate(() => neonCoastDebug.state());
    checks.walking = Math.hypot(checks.walked.x-checks.spawn.x,checks.walked.z-checks.spawn.z)>.01;
    await page.keyboard.press('m');await step(1);
    checks.map = await page.locator('#map-overlay').evaluate(el => el.classList.contains('show'));
    await page.keyboard.press('Escape');
    await page.evaluate(() => {neonCoastDebug.teleport(0,-175,0,true);neonCoastDebug.aim(2.4,.16);});await step(2);
    checks.car = await page.evaluate(() => neonCoastDebug.state());assert.equal(checks.car.driving,true);
    await shot('car');
    await page.keyboard.down('w');await step(8);await page.keyboard.up('w');
    checks.drove = await page.evaluate(() => neonCoastDebug.state());
    checks.driving = Math.hypot(checks.drove.x-checks.car.x,checks.drove.z-checks.car.z)>.001;
    await page.evaluate(() => {neonCoastDebug.teleport(22,-185,0,false);neonCoastDebug.aimAt(14,-213,.12);});
    await shot('pier');
    await page.evaluate(() => {const site=neonCoastDebug.sunportHotelState().instance;neonCoastDebug.teleport(site.x+10,site.z+30,0,false);neonCoastDebug.aimAt(site.x,site.z,-.1);});
    await shot('hotel');
    await page.evaluate(() => {neonCoastDebug.teleport(3.1,14,0,false);neonCoastDebug.aim(Math.PI,.12);});
    await shot('character');
    if(process.env.QA_DAY_ONLY==='1'){
      assert.ok(checks.walking&&checks.driving&&checks.map,'daytime interactions');assert.deepEqual(errors,[]);
      checks.dayOnly=true;checks.passed=true;return;
    }
    await page.evaluate(() => {neonCoastDebug.teleport(0,-175,0,true);neonCoastDebug.aim(2.4,.16);});
    await page.keyboard.press('t');await step(2);
    checks.night = await page.locator('#time').innerText();await shot('night');
    await page.keyboard.press('t');
    const before = await page.locator('#render-scale-toggle').innerText();
    await page.locator('#render-scale-toggle').click();await step(2);
    checks.renderScale = await page.locator('#render-scale-toggle').innerText();assert.notEqual(checks.renderScale,before);
    checks.glError = await page.evaluate(() => document.getElementById('view').getContext('webgl').getError());assert.equal(checks.glError,0);
    checks.noVAO=process.env.QA_NO_VAO==='1';
    checks.graphics = await page.evaluate(() => window.neonCoastGraphicsStats?.() || null);
    checks.frames = await page.evaluate(()=>window.__qaFrames);
    assert.ok(checks.walking,'walking changes position');assert.ok(checks.driving,'throttle changes car position');assert.ok(checks.map,'map opens');
    assert.match(checks.night,/ON/);
    assert.deepEqual(errors,[],'no runtime or shader errors');
    checks.passed=true;
  } catch(error) {
    checks.passed=false;checks.failure=String(error.stack||error);
    try {await page.screenshot({path:path.join(out,'failure.png'),timeout:30000});} catch(_) {}
    process.exitCode=1;
  } finally {
    fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({checks,errors,warnings,messages},null,2));
    console.log(JSON.stringify({checks,errors,warnings},null,2));await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
