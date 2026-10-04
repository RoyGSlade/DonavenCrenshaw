'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
exports.emailBrowserQa=async({browser,contexts,base,users,prisma,siteOrigin,check,guardContext,output})=>{
  const {messages,mailUser,freshRequest}=guardContext;
  const token=()=>/#verify=([A-Za-z0-9_-]{43})/.exec(messages.at(-1).text)[1];
  const context=await browser.newContext({viewport:{width:390,height:844}});contexts.push(context);
  await context.route('**/*',r=>/^http:\/\/127\.0\.0\.1:\d+\//.test(r.request().url())?r.continue():r.abort());
  await context.addCookies([{name:'token',value:users.mod.cookie.slice(6),url:base,httpOnly:true,sameSite:'Lax'}]);
  const page=await context.newPage();let confirmations=0,tokenRequests=0;
  page.on('request',request=>{if(request.url().includes('/email-verification/confirm'))confirmations++;if(request.url().includes('#verify=')||/[?&]token=/.test(request.url()))tokenRequests++;});
  const section=()=>page.locator('[data-email-verification]');
  await check('phone account page removes token from URL and requires explicit authenticated confirmation',async()=>{
    await prisma.user.update({where:{id:mailUser},data:{emailVerifiedAt:null},select:{id:true}});await freshRequest(mailUser);
    await page.goto(siteOrigin+'/account/#verify='+token());
    await section().getByRole('button',{name:'Confirm my email',exact:true}).waitFor({state:'visible'});
    assert.equal(new URL(page.url()).hash,'');assert.equal(confirmations,0);assert.equal(tokenRequests,0);
    await section().getByRole('button',{name:'Confirm my email',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('[data-email-verification-state]').textContent==='Email confirmed');
    assert.equal(confirmations,1);assert.ok((await prisma.user.findUnique({where:{id:mailUser},select:{emailVerifiedAt:true}})).emailVerifiedAt);
    assert.equal(await section().getByRole('button',{name:'Confirm my email',exact:true}).isVisible(),false);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    await section().screenshot({path:path.join(output,'email-confirmed-phone.png')});
  });
  await check('resend invalidates an old browser token; mail errors keep account unconfirmed',async()=>{
    await prisma.user.update({where:{id:mailUser},data:{emailVerifiedAt:null},select:{id:true}});await freshRequest(mailUser);const old=token();
    await page.goto(siteOrigin+'/account/#verify='+old);await section().getByRole('button',{name:'Confirm my email',exact:true}).waitFor({state:'visible'});
    await prisma.emailVerification.update({where:{userId:mailUser},data:{createdAt:new Date(Date.now()-61000)}});
    await section().getByRole('button',{name:'Send confirmation email',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('[data-email-verification-feedback]').textContent.startsWith('Check your email'));
    assert.equal(await section().getByRole('button',{name:'Confirm my email',exact:true}).isVisible(),false);
    await assert.rejects(guardContext.verification.confirm(mailUser,{token:old}),e=>e.code==='INVALID_VERIFICATION');
    await page.route('**/api/users/email-verification/request',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'MAIL_UNAVAILABLE',error:'Email confirmation is not available yet.'})}));
    await section().getByRole('button',{name:'Send confirmation email',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('[data-email-verification-feedback]').textContent==='Email confirmation is not available yet.');
    assert.equal(await section().locator('[data-email-verification-state]').textContent(),'Confirm your email to vote');
    assert.equal((await prisma.user.findUnique({where:{id:mailUser},select:{emailVerifiedAt:true}})).emailVerifiedAt,null);
    await section().screenshot({path:path.join(output,'email-unavailable-phone.png')});
  });
};
