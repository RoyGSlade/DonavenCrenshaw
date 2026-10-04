import test from 'node:test';
import assert from 'node:assert/strict';
import { emailConfirmationToken } from '../scripts/email-verification.js';
test('confirmation fragment is removed from history before requests and never retained in query', () => {
    const token='A'.repeat(43),writes=[];
    assert.equal(emailConfirmationToken({hash:`#verify=${token}`,pathname:'/review/account/',search:'?next=%2Freview%2Fcommunity%2F'},{replaceState:(...args)=>writes.push(args)}),token);
    assert.equal(writes[0][2],'/review/account/?next=%2Freview%2Fcommunity%2F');
    assert.equal(emailConfirmationToken({hash:'#verify=bad',pathname:'/account/',search:''},{replaceState:(...args)=>writes.push(args)}),null);
    assert.equal(writes.at(-1)[2],'/account/');
    assert.equal(emailConfirmationToken({hash:'#profile',pathname:'/account/',search:''},{replaceState:()=>assert.fail()}),null);
});
