import { test } from 'node:test';
import assert from 'node:assert/strict';
import { session } from './helpers.mjs';

test('isSessionId accepts the ids Superbot accepts', () => {
	for (const id of [
		'a',
		'my-chat-1',
		'my_chat',
		'N8N-123',
		'x'.repeat(59),
		'sb_0a1b2c',
		'vendor-hermes-a:b',
		'vendor-gemini-cli-checkpoint:dir:tag',
	]) {
		assert.equal(session.isSessionId(id), true, id);
	}
});

test('isSessionId rejects what Superbot would ignore', () => {
	const rejected = [
		'',
		' ',
		'x'.repeat(60),
		'has space',
		'a/b',
		'a:b',
		'new\nline',
		'quote"d',
		'vendor-a<b',
		'vendor-a ',
		'vendor-' + 'a'.repeat(200),
		undefined,
		null,
		42,
		{},
	];
	for (const id of rejected) assert.equal(session.isSessionId(id), false, JSON.stringify(id));
});

test('newSessionId makes a native id of 25 characters that carries the time', () => {
	const id = session.newSessionId(Date.UTC(2026, 9, 18));
	assert.match(id, /^n8n-[0-9a-z]+-[0-9a-z]{12}$/);
	assert.equal(id.length, 25);
	assert.equal(session.isSessionId(id), true);
	assert.ok(id.startsWith(`n8n-${Date.UTC(2026, 9, 18).toString(36)}-`));
});

test('newSessionId does not repeat across a thousand calls in one millisecond', () => {
	const seen = new Set();
	for (let i = 0; i < 1000; i++) seen.add(session.newSessionId(1_700_000_000_000));
	assert.equal(seen.size, 1000);
});
