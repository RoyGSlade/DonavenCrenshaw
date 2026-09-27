import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { mkdir } from "node:fs/promises";
import { createDogfightServer } from "../scripts/serve-stardust-dogfight.mjs";

test("custom ships: saved paint, distinct hulls, two-client damage, moving HP and rematch", {
  skip: !process.env.STARDUST_BROWSER_TEST, timeout: 45000,
}, async t => {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
  const server = await createDogfightServer({port:0}); t.after(() => server.close());
  const browser = await chromium.launch({headless:true}); t.after(() => browser.close());
  const host = await browser.newPage({viewport:{width:1280,height:900}});
  const guest = await browser.newPage({viewport:{width:1280,height:900}});
  const errors=[];
  const url = `http://127.0.0.1:${server.port}/projects/Space-Shooter/dogfight/`;
  for (const page of [host,guest]) {
    page.on("pageerror",e=>errors.push(e.message));
    await page.addInitScript(() => localStorage.setItem("stardust.dogfight.map", "classic"));
    // Keep local gameplay QA independent of the public account service.
      await page.route("https://api.donavencrenshaw.com/**", route => route.fulfill({ json: { user: null } }));
      await page.goto(url);
  }
  const choose = async (page,index,body,accent) => {
    await page.locator(".ship-classes label").nth(index).click();
    await page.evaluate(({body,accent})=>{
      for (const [id,value] of [["ship-body",body],["ship-accent",accent]]) {
        const input=document.getElementById(id); input.value=value;
        input.dispatchEvent(new Event("input",{bubbles:true}));
      }
    },{body,accent});
  };
  const before = await host.locator("#ship-preview").screenshot();
  await choose(host,2,"#804aca","#ffdd44");
  assert.ok(!before.equals(await host.locator("#ship-preview").screenshot()), "preview changes with hull and paint");
  await host.reload();
  assert.equal(await host.locator('[name="ship-class"]:checked').inputValue(),"heavy");
  assert.equal(await host.locator("#ship-body").inputValue(),"#804aca");
  await choose(guest,0,"#1b6278","#fa508a");
  await mkdir("output/stardust",{recursive:true});
  await host.screenshot({path:"output/stardust/custom-ships-lobby.png"});
  for (const page of [host,guest]) {
    await page.evaluate(async()=>{window.shipDiagnostics=(await import("./client.js")).getDiagnostics;});
    // Keep this fixture on the original arena as map features are tested separately.
    if (await page.locator("#map-select").count()) await page.locator("#map-select").selectOption("classic");
    await page.locator("#connection-settings summary").click();
    await page.locator("#relay-url").fill(`ws://127.0.0.1:${server.port}/relay`);
  }
  await host.locator("#create").click();
  await host.waitForFunction(()=>document.getElementById("share-code").textContent.length===8);
  assert.equal(await host.locator("#ship-body").isDisabled(),true);
  await guest.locator("#room-code").fill(await host.locator("#share-code").textContent());
  await guest.locator("#join").click();
  const playing = page => page.waitForFunction(()=>window.shipDiagnostics().phase==="playing");
  await playing(host); await playing(guest);
  const diag = page => page.evaluate(()=>window.shipDiagnostics());
  const expected = [{classId:"heavy",bodyColor:"#804aca",accentColor:"#ffdd44"},
    {classId:"light",bodyColor:"#1b6278",accentColor:"#fa508a"}];
  assert.deepEqual((await diag(host)).ships.map(s=>s.loadout),expected);
  assert.deepEqual((await diag(guest)).ships.map(s=>s.loadout),expected);
  assert.deepEqual((await diag(guest)).hull,[140,80]);
  assert.equal(await guest.locator("#bar0").getAttribute("max"),"140");
  assert.equal(await guest.locator("#bar1").getAttribute("max"),"80");
  assert.equal(await host.locator("#match-hud progress").count(),0);
  const initial = await host.locator("#ship-health0").boundingBox();
  await host.keyboard.down("w");
  await host.waitForFunction(()=>window.shipDiagnostics().ships[0].x>17,{},{timeout:8000});
  await host.keyboard.up("w");
  await host.keyboard.down("x"); await host.waitForTimeout(650); await host.keyboard.up("x");
  const moved = await host.locator("#ship-health0").boundingBox();
  assert.ok(moved.x>initial.x+100,"health bar follows ship movement");
  const pixels = await host.evaluate(()=>{
    const hud=document.getElementById("ship-health0").getBoundingClientRect();
    return {bottom:hud.bottom,top:hud.top,height:innerHeight};
  });
  assert.ok(pixels.top>0 && pixels.bottom<pixels.height);
  await host.screenshot({path:"output/stardust/custom-ships-match.png"});
  await host.keyboard.press("Space",{delay:40});
  await guest.waitForFunction(()=>window.shipDiagnostics().hull[1]===30);
  assert.equal(await guest.locator("#bar1").evaluate(bar=>bar.value),30);
  assert.equal(await guest.locator("#hp1").textContent(),"30 / 80");
  await host.keyboard.down("Space");
  await host.locator("#result").waitFor({state:"visible"}); await host.keyboard.up("Space");
  await guest.locator("#result").waitFor({state:"visible"});
  assert.equal(await host.locator("#result-title").textContent(),"You won.");
  await host.locator("#rematch").click(); await guest.locator("#rematch").click();
  await playing(host); await playing(guest);
  assert.deepEqual((await diag(guest)).hull,[140,80]);
  assert.deepEqual((await diag(guest)).ships.map(s=>s.loadout),expected);
  await guest.setViewportSize({width:844,height:390});
  await guest.waitForTimeout(100);
  const landscape = await guest.locator("#ship-health1").boundingBox();
  assert.ok(landscape.x >= 0 && landscape.x+landscape.width <= 844 && landscape.y > 0);
  await guest.screenshot({path:"output/stardust/custom-ships-phone-match.png"});
  await guest.setViewportSize({width:390,height:844});
  await guest.waitForTimeout(100);
  for (const id of [0,1]) {
    const bar=await guest.locator(`#ship-health${id}`).boundingBox();
    assert.ok(bar.x>=0 && bar.x+bar.width<=390 && bar.y>0 && bar.y+bar.height<844);
  }
  await guest.locator("#leave").click();
  await host.locator("#lobby").waitFor({state:"visible"});
  assert.equal(await host.locator("#ship-body").isEnabled(),true);
  assert.equal(await host.locator("#ship-hud").isHidden(),true);
  await host.setViewportSize({width:390,height:844});
  await host.locator("#ship-builder").scrollIntoViewIfNeeded();
  assert.equal(await host.evaluate(()=>document.documentElement.scrollWidth),390);
  const preview=await host.locator("#ship-preview").boundingBox();
  assert.ok(preview.width>80 && preview.x>=0 && preview.x+preview.width<=390);
  await host.screenshot({path:"output/stardust/custom-ships-phone.png"});
  assert.deepEqual(errors,[]);
});
