/** Stardust visual language. All helpers preserve Canvas state and never mutate simulation. */
import { getCourierAppearance, getCourierExhaustPorts } from '../systems/shipAppearance.js';
import { buildScale } from '../engine/shipStats.js';
const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0.01, r), 0, TAU); }
function glow(ctx, x, y, r, color) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(x-r, y-r, r*2, r*2);
}
// The original sprite's two exhaust ports, for ships drawn as the standard one (ghosts).
const STANDARD_PORTS = [{ x: -0.13, y: 0.38, width: 0.13 }, { x: 0.13, y: 0.38, width: 0.13 }];
export function drawCourier(ctx, player, scene, keys, unit, img, time, scale = 0.66) {
  // A garage build flying its own physics is drawn at its own size (engine/shipStats.js).
  const s = unit * 1.6 * scale * (scene?.ship && !player.standardShip ? buildScale(scene.ship) : 1);
  const active = !scene?.lockedInStart && !scene?.onStartPad && !scene?.showLaunchHint && !scene?.paused;
  const burn = active && scene?.fuel > 0 ? clamp(keys.thrustStrength || 0, 0, 1) : 0;
  const boost = active && player._boostCd > 0.12;
  ctx.save(); ctx.translate(player.x*unit, player.y*unit); ctx.rotate(player.angle + Math.PI/2);
  if (burn || boost) {
    const length = s * ((boost ? 1 : 0.32) + burn*0.25) * (0.94 + Math.sin(time*53)*0.06);
    for (const port of (player.standardShip ? STANDARD_PORTS : getCourierExhaustPorts())) {
      const x = port.x*s, y = port.y*s, halfWidth = port.width*s/2;
      const g = ctx.createLinearGradient(x,y,x,y+length);
      g.addColorStop(0,'#edffff'); g.addColorStop(0.16,'#75e9ff'); g.addColorStop(0.65,'rgba(40,150,255,.6)'); g.addColorStop(1,'rgba(30,100,255,0)');
      ctx.fillStyle=g; ctx.beginPath(); ctx.moveTo(x-halfWidth,y); ctx.quadraticCurveTo(x-halfWidth*1.4,y+length*0.4,x,y+length); ctx.quadraticCurveTo(x+halfWidth*1.4,y+length*0.4,x+halfWidth,y); ctx.fill();
    }
  }
  if (active && scene?.fuel > 0 && keys.backStrength > 0) {
    ctx.strokeStyle='#aaf7ff'; ctx.lineWidth=s*0.035;
    for(const side of [-1,1]) { ctx.beginPath(); ctx.moveTo(side*s*.31,s*.1); ctx.lineTo(side*s*.34,-s*.14); ctx.stroke(); }
  }
  ctx.shadowColor='#44bacc'; ctx.shadowBlur=unit*.12;
  const appearance = (player.standardShip ? null : getCourierAppearance()) || img;
  if(appearance) ctx.drawImage(appearance,-s/2,-s/2,s,s); else { ctx.fillStyle='#bcefff'; ctx.beginPath(); ctx.moveTo(0,-s*.46); ctx.lineTo(s*.35,s*.36); ctx.lineTo(0,s*.22); ctx.lineTo(-s*.35,s*.36); ctx.closePath(); ctx.fill(); }
  ctx.shadowBlur=0;
  if (player.invulnTimer > 0) {
    ctx.strokeStyle=`rgba(255,183,105,${0.45+0.4*Math.sin(time*45)**2})`; ctx.lineWidth=2;
    circle(ctx,0,0,s*.58); ctx.stroke();
    ctx.fillStyle='rgba(255,145,70,.22)'; circle(ctx,0,0,s*.46); ctx.fill();
  }
  if (player.boundaryContact > 0) {
    ctx.strokeStyle='rgba(255,201,126,.8)'; ctx.lineWidth=1.5;
    circle(ctx,0,0,s*.62); ctx.stroke();
  }
  if (active && keys.brake && scene?.flux > 0) {
    ctx.strokeStyle='#a3edff'; ctx.lineWidth=2; ctx.setLineDash([s*.13,s*.07]);
    circle(ctx,0,0,s*(.62+Math.sin(time*22)*.03)); ctx.stroke(); ctx.setLineDash([]);
  }
  if (player.hp < (player.maxHp || 100)*.3) {
    ctx.globalAlpha=.4+.5*Math.sin(time*12)**2; ctx.fillStyle='#ff784b'; circle(ctx,0,s*.12,s*.09); ctx.fill();
  }
  ctx.restore();
}
export function drawRelayGate(ctx, x, y, size, img, time, ready=true, anomaly=false) {
  ctx.save(); ctx.translate(x,y);
  const color=anomaly?'#b2a0ff':ready?'#73edff':'#507380';
  const r=size*.235;
  glow(ctx,0,0,size*.57,ready?'rgba(50,168,212,.2)':'rgba(24,58,80,.15)');
  if(img) ctx.drawImage(img,-size/2,-size/2,size,size);
  ctx.strokeStyle=color; ctx.lineWidth=ready?2:1;
  for(let i=0;i<3;i++) { ctx.globalAlpha=ready?.6:.25; ctx.beginPath(); const a=time*(anomaly?-.65:.65)+i*TAU/3; ctx.arc(0,0,r*(.87+i*.06),a,a+1.35); ctx.stroke(); }
  ctx.globalAlpha=1;
  // Readable approach axis and rear anomaly glyph, both outside the empty aperture.
  ctx.strokeStyle=color; ctx.lineWidth=1.5;
  for(const direction of [-1,1]) { const dx=direction*size*.61; ctx.beginPath(); ctx.moveTo(dx-direction*size*.06,-size*.07); ctx.lineTo(dx,0); ctx.lineTo(dx-direction*size*.06,size*.07); ctx.stroke(); }
  if(anomaly) { ctx.globalAlpha=.35+.4*Math.sin(time*3)**2; circle(ctx,size*.56,0,size*.08); ctx.stroke(); }
  ctx.restore();
}
export function drawShield(ctx,x,y,r,time,hostile=true) {
  ctx.save(); ctx.translate(x,y); ctx.strokeStyle=hostile?'#ffad63':'#6ce5ff';
  ctx.lineWidth=1.5; ctx.globalAlpha=.3; circle(ctx,0,0,r); ctx.stroke();
  ctx.globalAlpha=.65; ctx.rotate(time*.2);
  for(let i=0;i<6;i++) { ctx.beginPath(); ctx.arc(0,0,r*(1+.02*Math.sin(time*3)),i*TAU/6,i*TAU/6+.55); ctx.stroke(); }
  ctx.restore();
}
export function drawExplosion(ctx,x,y,unit,elapsed,duration=2,reducedMotion=false) {
  if(elapsed>=duration) return;
  const t=clamp(elapsed/duration,0,1);
  const spread=reducedMotion?.2:t;
  ctx.save(); ctx.translate(x,y); ctx.globalAlpha=1-t;
  glow(ctx,0,0,unit*(1+spread*5),'rgba(255,124,39,.65)');
  ctx.strokeStyle='#ffdc9c'; ctx.lineWidth=unit*(.04+.14*(1-t)); circle(ctx,0,0,unit*(.3+spread*6)); ctx.stroke();
  for(let i=0;i<22;i++) { const a=i*2.399963, radius=unit*(.5+spread*(3+(i%4))); ctx.fillStyle=i%3?'#ff9d54':'#fff1c8'; const s=unit*(.03+(1-t)*.08); ctx.fillRect(Math.cos(a)*radius,Math.sin(a)*radius,s,s); }
  ctx.restore();
}
export function drawFlightEnvironment(ctx,scene,unit,time,art={}) {
  if(!scene) return;
  ctx.save();
  for(const well of scene.gravityWells || []) {
    const x=well.x*unit,y=well.y*unit,r=well.radius*unit, influence=well.influence*unit;
    ctx.save(); ctx.translate(x,y);
    glow(ctx,0,0,influence,'rgba(45,107,162,.15)');
    ctx.strokeStyle='rgba(108,185,227,.18)'; ctx.lineWidth=1; ctx.setLineDash([5,10]); circle(ctx,0,0,influence); ctx.stroke(); ctx.setLineDash([]);
    for(let i=0;i<5;i++) { const p=((time*.11+i/5)%1); ctx.globalAlpha=(1-p)*.32; ctx.strokeStyle='#7dbbed'; circle(ctx,0,0,r+(influence-r)*p); ctx.stroke(); }
    ctx.globalAlpha=1; glow(ctx,0,0,r*1.8,'rgba(90,169,255,.5)');
    const g=ctx.createRadialGradient(-r*.3,-r*.3,r*.1,0,0,r); g.addColorStop(0,'#b1ddf2'); g.addColorStop(.3,'#4b7894'); g.addColorStop(1,'#0b1629'); ctx.fillStyle=g; circle(ctx,0,0,r); ctx.fill(); ctx.strokeStyle='#79b7df'; ctx.stroke();
    ctx.restore();
  }
  for(const [i,h] of (scene.hazards || []).entries()) {
    if(h.hp <= 0) {
      const age=(scene.elapsed || 0)-(h.destroyedAt ?? -100);
      if(age >= 0 && age < .6) drawExplosion(ctx,h.x*unit,h.y*unit,unit*.45,age,.6,!!scene.reducedMotion);
      continue;
    }
    const r=h.radius*unit;
    if(h.motion) { ctx.save(); ctx.strokeStyle='rgba(154,171,183,.22)'; ctx.setLineDash([3,7]); ctx.beginPath(); const m=h.motion; ctx.moveTo((m.originX-(m.axis==='x'?m.amplitude:0))*unit,(m.originY-(m.axis==='y'?m.amplitude:0))*unit); ctx.lineTo((m.originX+(m.axis==='x'?m.amplitude:0))*unit,(m.originY+(m.axis==='y'?m.amplitude:0))*unit); ctx.stroke(); ctx.restore(); }
    ctx.save(); ctx.translate(h.x*unit,h.y*unit); ctx.rotate(i*1.7);
    if (h.kind!=='wreck' && art.asteroid) {
      ctx.drawImage(art.asteroid,-r*1.05,-r*1.05,r*2.1,r*2.1);
      if(h.hp < h.maxHp) { ctx.strokeStyle='#ffbf8188';ctx.lineWidth=unit*.035;ctx.beginPath();ctx.moveTo(-r*.5,-r*.7);ctx.lineTo(r*.1,-r*.15);ctx.lineTo(-r*.2,r*.2);ctx.lineTo(r*.4,r*.6);ctx.stroke(); }
      ctx.restore(); continue;
    }
    ctx.beginPath();
    const count=h.kind==='wreck'?8:11;
    for(let j=0;j<count;j++) { const a=j*TAU/count,rr=r*(.92+.08*Math.sin(j*13+i*8)**2); const x=Math.cos(a)*rr,y=Math.sin(a)*rr; j?ctx.lineTo(x,y):ctx.moveTo(x,y); } ctx.closePath();
    const g=ctx.createLinearGradient(-r,-r,r,r); g.addColorStop(0,h.kind==='wreck'?'#71808b':'#65717a'); g.addColorStop(.45,'#333f4b'); g.addColorStop(1,'#151e29'); ctx.fillStyle=g; ctx.fill(); ctx.strokeStyle='#8c959b'; ctx.lineWidth=1.4; ctx.stroke();
    ctx.strokeStyle='rgba(12,19,26,.6)'; ctx.lineWidth=2;
    if(h.kind==='wreck') { ctx.strokeRect(-r*.55,-r*.4,r*1.1,r*.8); ctx.fillStyle='#d39a52'; for(let j=0;j<3;j++)ctx.fillRect(-r*.5+j*r*.3,-r*.68,r*.13,r*.08); }
    else { for(let j=0;j<3;j++) { const a=i+j*2; circle(ctx,Math.cos(a)*r*.35,Math.sin(a)*r*.35,r*(.12+j*.035)); ctx.stroke(); } }
    ctx.restore();
  }
  for(const d of scene.drones || []) {
    if(d.hp<=0 || d.state==='dead') continue;
    const x=d.x*unit,y=d.y*unit,r=d.radius*unit;
    if(d.telegraph>0 && Number.isFinite(d.aimX) && Number.isFinite(d.aimY)) {
      ctx.save(); ctx.strokeStyle='rgba(255,147,72,.65)'; ctx.lineWidth=1; ctx.setLineDash([6,6]); ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(d.aimX*unit,d.aimY*unit); ctx.stroke(); ctx.setLineDash([]); circle(ctx,d.aimX*unit,d.aimY*unit,unit*.25);ctx.stroke();ctx.restore();
    }
    ctx.save(); ctx.translate(x,y); ctx.rotate(d.angle+Math.PI/2); ctx.fillStyle='#35404a';ctx.strokeStyle='#b1a293';ctx.lineWidth=1.5;
    if (art.bossShip) { ctx.drawImage(art.bossShip,-r*1.1,-r*1.1,r*2.2,r*2.2); } else { ctx.beginPath();ctx.moveTo(0,-r);ctx.lineTo(r*.95,r*.8);ctx.lineTo(0,r*.35);ctx.lineTo(-r*.95,r*.8);ctx.closePath();ctx.fill();ctx.stroke(); }
    ctx.fillStyle=d.telegraph>0?'#fff1a4':'#ff9447';circle(ctx,0,0,r*.25);ctx.fill(); ctx.restore();
  }
  // Launch platform establishes a precise origin without hiding the ship.
  if(scene.startPos) { const x=scene.startPos.x*unit,y=scene.startPos.y*unit; ctx.strokeStyle='rgba(111,209,227,.38)';ctx.lineWidth=1;circle(ctx,x,y,unit*.9);ctx.stroke(); }
  ctx.restore();
}
export function drawShard(ctx,x,y,size,color,time,scale = 0.66) {
  size *= scale;
  ctx.save();ctx.translate(x,y+Math.sin(time*2.2+x)*size*.07);
  glow(ctx,0,0,size*.95,`${color}40`);
  ctx.rotate(Math.sin(time*1.2)*.16);ctx.beginPath();ctx.moveTo(0,-size*.5);ctx.lineTo(size*.28,0);ctx.lineTo(0,size*.5);ctx.lineTo(-size*.28,0);ctx.closePath();
  ctx.fillStyle=color;ctx.fill();ctx.strokeStyle='#d6f8ff';ctx.lineWidth=1;ctx.stroke();ctx.beginPath();ctx.moveTo(0,-size*.5);ctx.lineTo(-size*.06,0);ctx.lineTo(0,size*.5);ctx.stroke();ctx.restore();
}
