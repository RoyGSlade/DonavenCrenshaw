'use strict';
// Invoked only by the Hub's isolated synthetic PostgreSQL integration fixture.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http');
const {spawnSync}=require('node:child_process');
exports.browserQa=async function({base,users,prisma,siteOrigin,call,check,guardContext}) {
  const {chromium}=require(process.env.POLL_PLAYWRIGHT||'playwright');
  const site=path.resolve(__dirname,'..'),output=process.env.POLL_QA_OUTPUT||path.join(site,'output/voting-qa');await fs.mkdir(output,{recursive:true});
  const built=spawnSync(process.execPath,['scripts/build.mjs'],{cwd:site,env:{...process.env,SITE_BASE:'/',HUB_URL:base},encoding:'utf8'});
  await fs.writeFile(path.join(output,'browser-site-build.txt'),built.stdout+'\n'+built.stderr);assert.equal(built.status,0,built.stderr);
  const publicRoot=path.join(site,'public'),types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.json':'application/json'};
  const server=http.createServer(async(req,res)=>{try{const route=new URL(req.url,siteOrigin).pathname,file=path.resolve(publicRoot,`.${route.endsWith('/')?route+'index.html':route}`);if(!file.startsWith(publicRoot+path.sep)){res.writeHead(404).end();return;}res.setHeader('content-type',types[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));}catch{res.writeHead(404).end();}});
  await new Promise(resolve=>server.listen(Number(new URL(siteOrigin).port),'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true}),contexts=[],errors=[];let browserPoll;
  const title='Synthetic carousel review - fixture only';
  const choices=['Stardust: two-player co-op prototype','Kingdoms & Caravans: refreshed playable build','Stardust: build and share your ship'];
  async function pageFor(user,width=390,route='community/') {
    const context=await browser.newContext({viewport:{width,height:844},hasTouch:true,timezoneId:'America/Los_Angeles'});contexts.push(context);
    await context.route('**/*',r=>/^http:\/\/127\.0\.0\.1:\d+\//.test(r.request().url())?r.continue():r.abort());
    if(user)await context.addCookies([{name:'token',value:users[user].cookie.slice(6),url:base,httpOnly:true,sameSite:'Lax'}]);
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(siteOrigin+'/'+route);
    await page.waitForFunction(()=>!/^(Loading|Checking)/.test(document.querySelector('#voting-status').textContent));return page;
  }
  const cardFor=page=>page.locator('#voting-polls article').filter({hasText:title});
  async function finalSlide(page){const card=cardFor(page);await card.getByRole('button',{name:'Vote and results',exact:true}).click();return card;}
  try {
    if(guardContext)await require('./email-verification-browser.cjs').emailBrowserQa({browser,contexts,base,users,prisma,siteOrigin,check,guardContext,output});
    const owner=await pageFor('owner',390,'community/manage/');
    await check('owner drafts privately, chooses duration and opens through the manager',async()=>{
      await owner.locator('#voting-admin').waitFor({state:'visible'});await owner.locator('#poll-title').fill(title);await owner.locator('#poll-description').fill('Synthetic review, not an actual development commitment.');await owner.locator('#poll-options').fill(choices.join('\n'));await owner.getByRole('button',{name:'Save private draft'}).click();
      const card=owner.locator('#voting-admin-polls article').filter({hasText:title});await card.waitFor();assert.match(await card.textContent(),/DRAFT/);
      const guest=await pageFor();assert.equal(await guest.locator('#voting-polls').getByText(title).count(),0);
      await card.getByLabel('Vote duration').selectOption('60');owner.once('dialog',dialog=>dialog.accept());await card.getByRole('button',{name:'Open this poll'}).click();await card.getByText('OPEN',{exact:true}).waitFor();
      await owner.goto(siteOrigin+'/community/');await cardFor(owner).waitFor();browserPoll=await cardFor(owner).getAttribute('data-poll-id');
      const poll=await prisma.priorityPoll.findUnique({where:{id:browserPoll}});assert.equal(poll.closesAt-poll.openedAt,3600000);
    });
    await check('owner-selected Pacific poll close becomes a server deadline and rejects an invalid time',async()=>{
      await owner.goto(siteOrigin+'/community/manage/');await owner.locator('#voting-admin').waitFor({state:'visible'});
      const customTitle='Synthetic chosen closing time - fixture only';
      await owner.locator('#poll-title').fill(customTitle);await owner.locator('#poll-description').fill('Local-only release integration check.');
      await owner.locator('#poll-options').fill('Fixture A\nFixture B');await owner.getByRole('button',{name:'Save private draft'}).click();
      const card=owner.locator('#voting-admin-polls article').filter({hasText:customTitle});await card.waitFor();
      await card.getByLabel('Vote duration').selectOption('custom');
      const close=card.getByLabel('Close at (your local time)');await close.fill('2000-01-01T00:00');
      await card.getByRole('button',{name:'Open this poll'}).click();
      await card.getByText('Pick a closing time between 5 minutes and 7 days from now.',{exact:true}).waitFor();
      const draft=await prisma.priorityPoll.findFirst({where:{title:customTitle}});assert.equal(draft.state,'DRAFT');
      const chosen=await owner.evaluate(()=>{
        const date=new Date(Date.now()+30*60000);date.setSeconds(0,0);
        const pad=n=>String(n).padStart(2,'0');
        return {text:`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`,time:date.getTime()};
      });
      await close.fill(chosen.text);let prompt;
      owner.once('dialog',dialog=>{prompt=dialog.message();return dialog.accept();});
      await card.getByRole('button',{name:'Open this poll'}).click();await card.getByText('OPEN',{exact:true}).waitFor();
      const poll=await prisma.priorityPoll.findUnique({where:{id:draft.id}});
      assert.match(prompt,/Voting closes/);assert.ok(Math.abs(poll.closesAt.getTime()-chosen.time)<60000,'minute-rounded duration stays within one minute of chosen Pacific instant');
      assert.ok(poll.closesAt>poll.openedAt);await card.screenshot({path:path.join(output,'custom-poll-close-phone.png')});
      await call('POST',`/api/admin/polls/${poll.id}/close`,'owner',{});
    });
    const voter=await pageFor('mod');
    await check('visual proposals, keyboard and real touch swipe reach the final slide',async()=>{
      const card=cardFor(voter);assert.equal(await card.locator('.poll-proposal').count(),3);assert.equal(await card.locator('.poll-slide').count(),4);assert.match(await card.locator('.poll-timer').textContent(),/left/);
      await card.focus();await voter.keyboard.press('ArrowRight');assert.equal(await card.locator('.poll-indicators [aria-current="step"]').textContent(),'2');await voter.keyboard.press('Home');
      await card.scrollIntoViewIfNeeded();const box=await card.locator('.poll-viewport').boundingBox(),cdp=await voter.context().newCDPSession(voter);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width-40,y:box.y+80}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+40,y:box.y+80}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await voter.waitForFunction(id=>document.querySelector(`[data-poll-id="${id}"] .poll-indicators [aria-current="step"]`).textContent==='2',browserPoll);await cdp.detach();
      await card.focus();await voter.keyboard.press('End');assert.equal(await card.locator('.poll-ballot').isVisible(),true);assert.equal(await card.locator('.poll-proposal:visible').count(),0);await voter.screenshot({path:path.join(output,'ballot-phone.png')});
    });
    await check('confirmation can cancel; duplicate submit records one real vote and raises its bar',async()=>{
      const card=await finalSlide(voter);await card.getByRole('radio',{name:/Fly together/}).check();voter.once('dialog',dialog=>dialog.dismiss());await card.getByRole('button',{name:'Vote',exact:true}).click();assert.equal(await prisma.priorityBallot.count({where:{pollId:browserPoll}}),0);
      await voter.route(base+'/api/polls',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"Synthetic read failure"}'}));
      voter.once('dialog',dialog=>dialog.accept());await card.getByRole('button',{name:'Vote',exact:true}).dblclick();await voter.getByText('Your vote is recorded.',{exact:true}).waitFor();assert.equal(await prisma.priorityBallot.count({where:{pollId:browserPoll,userId:users.mod.id}}),1);
      await voter.waitForFunction(id=>document.querySelector(`[data-poll-id="${id}"] .poll-bar-fill`).style.width==='100%',browserPoll);await voter.unroute(base+'/api/polls');await voter.reload();await finalSlide(voter);await cardFor(voter).getByText('Your vote is in',{exact:true}).waitFor();await voter.screenshot({path:path.join(output,'vote-confirmed-phone.png')});
    });
    const bob=await pageFor('bob');
    await check('expired session and errors save no ballot; recovery retains selection and updates totals',async()=>{
      const card=await finalSlide(bob);await card.getByRole('radio',{name:/Bring the city forward/}).check();await bob.context().clearCookies();bob.once('dialog',dialog=>dialog.accept());await card.getByRole('button',{name:'Vote',exact:true}).click();await card.getByText('Your session ended. Sign in again to vote.',{exact:false}).waitFor();assert.equal(await prisma.priorityBallot.count({where:{pollId:browserPoll,userId:users.bob.id}}),0);
      await bob.context().addCookies([{name:'token',value:users.bob.cookie.slice(6),url:base,httpOnly:true,sameSite:'Lax'}]);const endpoint=base+`/api/polls/${browserPoll}/ballot`;
      await bob.route(endpoint,r=>r.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'Synthetic retry error'})}));bob.once('dialog',dialog=>dialog.accept());await card.getByRole('button',{name:'Vote',exact:true}).click();await card.getByText('Synthetic retry error',{exact:true}).waitFor();assert.equal(await card.getByRole('radio',{name:/Bring the city forward/}).isChecked(),true);
      await bob.unroute(endpoint);bob.once('dialog',dialog=>dialog.accept());await card.getByRole('button',{name:'Vote',exact:true}).click();await bob.getByText('Your vote is recorded.',{exact:true}).waitFor();assert.equal(await prisma.priorityBallot.count({where:{pollId:browserPoll}}),2);assert.equal(await cardFor(bob).getByText('2 votes total',{exact:true}).count(),1);assert.ok(!(await cardFor(bob).textContent()).includes('Winner'));
    });
    await check('concurrent accounts and refreshed bars use actual counts without declaring a winner',async()=>{
      const poll=await prisma.priorityPoll.findUnique({where:{id:browserPoll},include:{options:{orderBy:{position:'asc'}}}});
      const response=await Promise.all([call('POST',`/api/polls/${browserPoll}/ballot`,'alice',{optionId:poll.options[2].id,confirmed:true}),call('POST',`/api/polls/${browserPoll}/ballot`,'owner',{optionId:poll.options[0].id,confirmed:true})]);assert.ok(response.every(r=>r.status===201));
      await bob.reload();const card=await finalSlide(bob);await bob.waitForFunction(id=>document.querySelector(`[data-poll-id="${id}"] .poll-bar-fill`).style.width==='50%',browserPoll);assert.equal(await card.getByText('4 votes total',{exact:true}).count(),1);assert.ok(!(await card.textContent()).includes('Winner'));
    });
    await check('server countdown expiry ignores client clock skew and disables voting',async()=>{
      const poll=(await call('POST','/api/admin/polls','owner',{title:'Synthetic expiry carousel',description:'Fixture only',options:['Expiry A','Expiry B']})).data.poll;await call('POST',`/api/admin/polls/${poll.id}/open`,'owner',{durationMinutes:5});await prisma.priorityPoll.update({where:{id:poll.id},data:{closesAt:new Date(Date.now()+2000)}});
      const page=await pageFor('alice');await page.evaluate(()=>{Date.now=()=>1;});const card=page.locator(`[data-poll-id="${poll.id}"]`);await card.getByRole('button',{name:'Vote and results',exact:true}).click();await card.getByText('Voting closed',{exact:true}).waitFor({timeout:10000});assert.equal(await card.getByRole('button',{name:'Vote',exact:true}).count(),0);assert.equal(await prisma.priorityBallot.count({where:{pollId:poll.id}}),0);
    });
    await check('guest/mobile layouts, reduced motion and text injection are safe',async()=>{
      const guest=await pageFor();const card=await finalSlide(guest);assert.equal(await card.locator('input:not(:disabled)').count(),0);assert.equal(await guest.locator('#voting-admin').count(),0);assert.ok(!(await card.textContent()).includes('Your vote is in'));
      for(const width of [320,390,768,1440]){await guest.setViewportSize({width,height:844});assert.ok(await guest.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`overflow ${width}`);await owner.setViewportSize({width,height:844});assert.ok(await owner.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
      await guest.emulateMedia({reducedMotion:'reduce'});assert.ok(Number.parseFloat(await card.locator('.poll-bar-fill').first().evaluate(el=>getComputedStyle(el).transitionDuration))<=0.00002);
      const attack='<img src=x onerror="window.fixtureExecuted=true">',malicious=(await call('POST','/api/admin/polls','owner',{title:'Synthetic text safety',description:'Fixture only',options:[attack,'Safe option']})).data.poll;await call('POST',`/api/admin/polls/${malicious.id}/open`,'owner',{});await guest.reload();assert.equal(await guest.locator('#voting-polls img[src="x"]').count(),0);assert.equal(await guest.evaluate(()=>window.fixtureExecuted),undefined);
      await guest.screenshot({path:path.join(output,'results-desktop.png'),fullPage:true});assert.deepEqual(errors,[]);
    });
    console.log('Browser evidence: '+output);
  } finally {for(const context of contexts)await context.close();await browser.close();await new Promise(resolve=>server.close(resolve));}
};
