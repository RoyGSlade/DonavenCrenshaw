import test from 'node:test';
import assert from 'node:assert/strict';
import { readVsParam } from '../scripts/social.js';

test('?vs= on the weekly page takes exact usernames only', () => {
    assert.equal(readVsParam('?vs=CrispyNacho'), 'CrispyNacho');
    assert.equal(readVsParam('?x=1&vs=nova_ace'), 'nova_ace');
    assert.equal(readVsParam('?vs=%20nova_ace%20'), 'nova_ace');
    for (const bad of ['?vs=ab', `?vs=${'x'.repeat(21)}`, '?vs=<img>', '?vs=a/b', '?vs=a%20b', '?vs=', '', '?friend=nova', undefined, null]) {
        assert.equal(readVsParam(bad), null, String(bad));
    }
});
