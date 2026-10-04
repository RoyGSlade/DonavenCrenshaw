'use strict';
// Run against a synthetic preview only. authenticate is optional; no polls,
// ballots or accounts are created or changed by these checks.
const assert = require('node:assert/strict');
const path = require('node:path');
exports.navigationQa = async function({browser,base,output,authenticate,authenticateVoter}) {
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const errors=[], outside=[], writes=[];
  await context.route('**/*', async route=>{
    const request=route.request(), url=request.url();
    if (request.method()==='POST' && /\/api\/(?:admin\/polls|polls\/)/.test(url)) writes.push(url);
    if (url.startsWith(base)) return route.continue();
    // The subpath fixture has no database and uses read-only synthetic responses.
    if (!authenticate && url.startsWith('http://127.0.0.1:59224/api/')) {
      return route.fulfill({contentType:'application/json',body:JSON.stringify(url.endsWith('/polls') ? {polls:[],account:{signedIn:false,admin:false}} : {user:null})});
    }
    outside.push(url); return route.abort();
  });
  const page=await context.newPage(); page.on('pageerror', error=>errors.push(error.message));
  const url=route=>new URL(route,base).href;
  const voting=()=>page.locator('.nav-links a[data-route="community"]');
  const privacy=()=>page.locator('.nav-links a[data-route="privacy"]');
  async function readyVoting() { await page.waitForFunction(()=>!/^(Loading|Checking)/.test(document.querySelector('#voting-status').textContent)); }
  async function menu() { const toggle=page.locator('.nav-toggle'); if(await toggle.isVisible() && await toggle.getAttribute('aria-expanded')!=='true') await toggle.click(); }
  async function privacyDestination(hash='') {
    await page.waitForURL(url('privacy/')+hash);
    await page.getByRole('heading',{name:'Privacy',exact:true,level:1}).waitFor();
    assert.equal(await privacy().getAttribute('aria-current'),'page');
    if(hash) assert.ok(await page.locator(hash).count());
  }
  try {
    for(const width of [320,390,768,1440]) {
      await page.setViewportSize({width,height:844}); await page.goto(base);
      assert.equal(await voting().getAttribute('href'),new URL(url('community/')).pathname);
      assert.equal(await privacy().getAttribute('href'),new URL(url('privacy/')).pathname);
      assert.equal(await page.locator('.nav-links a[data-route="now"]').count(),0);
      assert.equal(await page.locator('.nav-links > li').first().locator('a').getAttribute('data-route'),'community');
      await menu(); await voting().focus(); await page.keyboard.press('Enter'); await page.waitForURL(url('community/')); await readyVoting();
      assert.equal(await voting().getAttribute('aria-current'),'page');
      assert.equal(await page.getByRole('heading',{name:'Community',exact:true,level:1}).count(),1);
      assert.equal(await page.getByRole('heading',{name:'Try the current builds',exact:true}).count(),1);
      assert.ok(await page.evaluate(()=>!!(document.querySelector('#voting-polls').compareDocumentPosition(document.querySelector('.now-page'))&Node.DOCUMENT_POSITION_FOLLOWING)));
      assert.equal(await page.locator('#voting-manage-link').isVisible(),false);
      assert.equal(await page.locator('#voting-admin').isVisible(),false);
      assert.ok(await page.locator('#voting-signin').isVisible());
      if(!(await page.locator('#voting-polls article').count())) assert.match(await page.locator('#voting-status').textContent(),/No polls have been opened yet/);
      await menu(); await privacy().focus(); await page.keyboard.press('Enter'); await privacyDestination();
      if(width<960) assert.equal(await page.locator('.nav-toggle').getAttribute('aria-expanded'),'false');
      await page.goBack(); await page.waitForURL(url('community/')); assert.equal(await voting().getAttribute('aria-current'),'page');
      await page.goForward(); await privacyDestination();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`overflow at ${width}`);
    }
    await page.setViewportSize({width:390,height:844}); await page.goto(base); await menu();
    await privacy().scrollIntoViewIfNeeded(); await page.screenshot({path:path.join(output,'navigation-phone.png')});
    await page.keyboard.press('Escape'); assert.equal(await page.locator('.nav-toggle').getAttribute('aria-expanded'),'false');
    assert.equal(await page.locator('.nav-toggle').evaluate(el=>el===document.activeElement),true);
    await page.locator('.footer-links').getByRole('link',{name:'Privacy',exact:true}).click(); await privacyDestination();
    await page.goto(url('community/')); await readyVoting();
    await page.getByRole('link',{name:'Voting privacy',exact:true}).click(); await privacyDestination('#development-votes');
    await page.goto(url('community/')); await readyVoting();
    const signIn=page.locator('#voting-signin a');
    assert.equal(await signIn.getAttribute('href'),new URL(url('account/')).pathname+'?next='+encodeURIComponent(new URL(url('community/')).pathname));
    await signIn.click(); await page.locator('[data-acct-form="signin"]').waitFor({state:'visible'});
    assert.ok((await page.locator('[data-acct-form="signin"]').textContent()).includes("You'll return to Community after signing in."));
    await page.getByRole('link',{name:'Privacy and account data',exact:true}).click(); await privacyDestination('#accounts');
    await page.goBack(); await page.locator('[data-acct-form="signin"]').waitFor({state:'visible'});
    await page.getByRole('tab',{name:'Create account',exact:true}).click();
    await page.getByRole('link',{name:'privacy notice',exact:true}).click(); await privacyDestination();
    await page.goto(url('account/')); await page.locator('[data-acct-form="signin"]').waitFor({state:'visible'});
    await page.locator('.acct-aside').getByRole('link',{name:'Details',exact:true}).click(); await privacyDestination('#accounts');
    const nowResponse=await page.goto(url('now/')); assert.equal(nowResponse.status(),200); await page.waitForURL(url('community/'));
    await page.goto(url('voting/')); await page.waitForURL(url('community/')); await readyVoting();
    await page.goto(url('community/manage/')); await readyVoting();
    assert.equal(await page.locator('#voting-admin').isVisible(),false);
    assert.equal(await page.locator('#voting-admin-polls article').count(),0);
    assert.match(await page.locator('#voting-status').textContent(),/Sign in with the owner account/);
    if(authenticate) assert.equal(await page.evaluate(async()=>(await fetch('/api/admin/polls')).status),401);
    if(authenticate) {
      await page.goto(url('community/')); await readyVoting();
      const publicIds=await page.locator('#voting-polls article').evaluateAll(cards=>cards.map(card=>card.dataset.pollId));
      await page.locator('#voting-signin a').click();
      await authenticate(page); await page.waitForURL(url('community/')); await readyVoting();
      await page.locator('#voting-manage-link a').click(); await page.waitForURL(url('community/manage/'));
      await page.locator('#voting-admin').waitFor({state:'visible'});
      assert.equal(await page.locator('#voting-signin').isVisible(),false);
      const polls=await page.evaluate(async()=> (await fetch('/api/admin/polls',{credentials:'include'})).json());
      for(const poll of polls.polls.filter(p=>p.state==='DRAFT')) assert.ok(!publicIds.includes(poll.id),'draft exposed to guest');
      await page.screenshot({path:path.join(output,'owner-voting-phone.png'),fullPage:true});
      await page.goto(url('account/')); await page.getByRole('link',{name:'Privacy and account data',exact:true}).click(); await privacyDestination('#accounts');
      await page.goto(url('account/')); await page.locator('[data-acct-signout]').click();
      if(authenticateVoter) {
        await page.goto(url('community/manage/')); await readyVoting(); await page.locator('#voting-signin a').click();
        await authenticateVoter(page); await page.waitForURL(url('community/manage/')); await readyVoting();
        assert.equal(await page.locator('#voting-admin').isVisible(),false);
        assert.equal(await page.locator('#voting-admin-polls article').count(),0);
        assert.match(await page.locator('#voting-status').textContent(),/only to the owner/);
        assert.equal(await page.evaluate(async()=>(await fetch('/api/admin/polls',{credentials:'include'})).status),403);
        await page.goto(url('account/')); await page.locator('[data-acct-signout]').click();
      }
      await page.goto(url('community/')); await readyVoting(); assert.equal(await page.locator('#voting-admin').isVisible(),false);
    }
    await page.screenshot({path:path.join(output,'guest-voting-phone.png'),fullPage:true});
    assert.deepEqual(errors,[]); assert.deepEqual(outside,[]); assert.deepEqual(writes,[]);
    return {base,passed:true,widths:[320,390,768,1440],keyboard:true,history:true,privacyLinks:['primary','footer','voting','account header','signup','account details'],privateDrafts:true,ownerLogin:!!authenticate,ownerManager:true,nonOwnerDenied:!!authenticateVoter,ballotWrites:0,votingBeforeRetainedWork:true,legacyRedirects:['now/','voting/']};
  } finally {await context.close();}
};
