import test from 'node:test';import assert from 'node:assert/strict';
import {PROPOSALS,remainingTime,timeLabel,votePercentage} from '../scripts/voting-carousel.js';
test('three approved proposals have short scoped deliverables and honest project visuals',()=>{
  assert.equal(Object.keys(PROPOSALS).length,3);
  for(const proposal of Object.values(PROPOSALS)){assert.equal(proposal.deliverables.length,3);assert.ok(proposal.summary.length<80);assert.match(proposal.visual,/proposed|Current gameplay/i);}
});
test('display percentages reflect actual server totals including zero and small shares',()=>{
  assert.equal(votePercentage(0,0),'0%');assert.equal(votePercentage(2,4),'50%');assert.equal(votePercentage(1,3),'33.3%');assert.equal(votePercentage(1,1000),'0.1%');
});
test('countdown uses the server instant and monotonic elapsed time rather than the client calendar',()=>{
  const poll={state:'OPEN',serverTime:'2026-10-04T17:00:00Z',closesAt:'2026-10-05T10:00:00-07:00'};
  assert.equal(remainingTime(poll),86400000);assert.equal(timeLabel(poll),'1d 0h 00m 00s left');
  assert.equal(timeLabel(poll,3600000),'23h 00m 00s left');
  assert.equal(remainingTime(poll,86400001),0);assert.equal(timeLabel(poll,86400001),'Voting time ended');
});
test('unset, draft and closed clocks never imply a made-up voting duration',()=>{
  assert.equal(timeLabel({state:'OPEN'}),'Closing time not set');
  assert.equal(timeLabel({state:'DRAFT'}),'Draft · clock not started');
  assert.equal(timeLabel({state:'CLOSED'}),'Voting closed');
});
