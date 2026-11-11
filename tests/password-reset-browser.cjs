'use strict';
// Browser check for forgot-password, written for the same QA harness as email-verification-browser.cjs
// (hub + site served on 127.0.0.1, mail captured in guardContext.messages). Not run in the
// offline lane that wrote it; run it with the harness before release.
const assert=require('node:assert/strict'),path=require('node:path');
exports.passwordResetBrowserQa=async({browser,contexts,base,users,prisma,siteOrigin,check,guardContext,output})=>{
  const {messages,mailUser}=guardContext;
  const token=()=>/#reset=([A-Za-z0-9_-]{43})/.exec(messages.at(-1).text)[1];
  const context=await browser.newContext({viewport:{width:390,height:844}});contexts.push(context);
  await context.route('**/*',r=>/^http:\/\/127\.0\.0\.1:\d+\//.test(r.request().url())?r.continue():r.abort());
  const page=await context.newPage();let confirms=0,tokenRequests=0;
  page.on('request',request=>{if(request.url().includes('/password-reset/confirm'))confirms++;if(request.url().includes('#reset=')||/[?&]token=/.test(request.url()))tokenRequests++;});
  await check('forgot form shows one message for a known and an unknown email',async()=>{
    await page.goto(siteOrigin+'/account/');
    const status=page.locator('[data-password-forgot-status]');
    await page.locator('[data-password-forgot] summary').click();
    const want='If that email has an account, a reset link is on its way. It lasts 30 minutes.';
    for(const email of ['nobody-here@example.test',users.mod.email]){
      await page.locator('[data-password-forgot] input[name=email]').fill(email);
      await page.getByRole('button',{name:'Send reset link',exact:true}).click();
      await page.waitForFunction(w=>document.querySelector('[data-password-forgot-status]').textContent===w,want);
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  });
  await check('reset link removes the token from the URL and sets a new password',async()=>{
    await prisma.passwordReset.updateMany({where:{userId:mailUser},data:{createdAt:new Date(Date.now()-61000)}});
    await page.goto(siteOrigin+'/account/');await page.locator('[data-password-forgot] summary').click();
    await page.locator('[data-password-forgot] input[name=email]').fill(users.mod.email);
    await page.getByRole('button',{name:'Send reset link',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('[data-password-forgot-status]').textContent.startsWith('If that email'));
    await page.waitForTimeout(500);
    await page.goto(siteOrigin+'/account/#reset='+token());
    const form=page.locator('[data-password-reset-choose]');await form.waitFor({state:'visible'});
    assert.equal(new URL(page.url()).hash,'');assert.equal(confirms,0);assert.equal(tokenRequests,0);
    await form.locator('input[name=password]').fill('brand-new-pass-77');await form.locator('input[name=repeat]').fill('brand-new-pass-77');
    await form.getByRole('button',{name:'Set new password',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('[data-acct-form=signin] [data-acct-status]').textContent==='Password changed. Sign in with your new password.');
    assert.equal(confirms,1);
    await page.screenshot({path:path.join(output,'password-reset-phone.png')});
  });
};
