import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import ejs from 'ejs';

const read = name => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const nav = read('src/components/nav.ejs');
const behavior = read('scripts/script.js');
function render(base) {
  return ejs.render(nav, { site:{name:'Donaven Crenshaw',social:{}}, siteLink:route=>`${base}${route ? `${route}/` : ''}` });
}
function activeLinks(html, pathname) {
  const links = [...html.matchAll(/<a\b[^>]*\bdata-route="([^"]+)"[^>]*>/g)].map(match=>({
    dataset:{route:match[1]}, attributes:{},
    classList:{ toggle(_name, active){this.active=active;} },
    setAttribute(name,value){this.attributes[name]=value;},
    removeAttribute(name){delete this.attributes[name];},
  }));
  const document = { documentElement:{classList:{add(){}}}, querySelector:()=>null,
    querySelectorAll:selector=>selector === '.nav-links a[data-route]' ? links : [] };
  vm.runInNewContext(behavior,{document,window:{location:{pathname}},URL});
  return links.filter(link=>link.attributes['aria-current'] === 'page').map(link=>link.dataset.route);
}
test('Voting and Privacy normal navigation resolves at root and a deployed subpath',()=>{
  for(const base of ['/','/DonavenCrenshaw/']){
    const html=render(base);
    assert.ok(html.includes(`href="${base}voting/" data-route="voting"`));
    assert.ok(html.includes(`href="${base}privacy/" data-route="privacy"`));
    assert.ok(!html.includes('data-route="now"'));
    for(const route of ['voting','privacy']) assert.deepEqual(activeLinks(html,base+route+'/'),[route]);
    assert.deepEqual(activeLinks(html,base+'now/'),[]);
  }
});
test('footer Privacy link and archived Now content remain available',()=>{
  const footer=read('src/components/footer.ejs');
  assert.ok(footer.includes("siteLink('privacy')"));
  assert.ok(read('content/now.md').includes('---'));
});
test('guest voting sign-in and voting privacy use the deployed base',()=>{
  const syntax=spawnSync(process.execPath,['--check',fileURLToPath(new URL('../scripts/account.js',import.meta.url))],{encoding:'utf8'});
  assert.equal(syntax.status,0,syntax.stderr);
  new vm.Script(read('scripts/voting.js'));
  for (const siteRoot of ['/','/DonavenCrenshaw/']) {
    const html=ejs.render(read('src/layouts/voting.ejs'), {siteRoot, components:{head:'',nav:'',footer:''}, page:{skin:'default',branch:'community'}});
    assert.ok(html.includes(`href="${siteRoot}account/?next=${encodeURIComponent(siteRoot+'voting/')}"`));
    assert.ok(html.includes(`href="${siteRoot}privacy/#development-votes"`));
    assert.ok(html.includes('to vote when a poll is open.'));
  }
});
