import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completion, constants, fullResponse, pkg, turn } from './helpers.mjs';

test('baseUrlOf drops trailing slashes and a trailing /v1', () => {
	for (const raw of [
		'https://example.test',
		'https://example.test/',
		'https://example.test//',
		'https://example.test/v1',
		'https://example.test/v1/',
		'  https://example.test/v1/  ',
	]) {
		assert.equal(turn.baseUrlOf(raw), 'https://example.test', JSON.stringify(raw));
	}
	assert.equal(turn.baseUrlOf('https://example.test/proxy/v1'), 'https://example.test/proxy');
	assert.equal(turn.baseUrlOf('https://example.test/v10'), 'https://example.test/v10');
});

test('baseUrlOf falls back to the default host when the credential leaves it blank', () => {
	for (const raw of ['', '   ', '/', undefined, null, 5]) {
		assert.equal(turn.baseUrlOf(raw), constants.DEFAULT_BASE_URL);
	}
});

test('the default host is https and has no path', () => {
	const url = new URL(constants.DEFAULT_BASE_URL);
	assert.equal(url.protocol, 'https:');
	assert.equal(url.pathname, '/');
});

test('turnRequestOf is the chat-completions door with the Superbot headers and a buffered reply', () => {
	const request = turn.turnRequestOf({
		baseUrl: 'https://example.test',
		message: 'ping',
		model: 'superbot-fast',
		session: 'my-chat-1',
		timeoutSeconds: 90,
	});
	assert.equal(request.method, 'POST');
	assert.equal(request.url, 'https://example.test/v1/chat/completions');
	assert.deepEqual(request.headers, {
		'x-superbot-client': `n8n/${pkg.version}`,
		'x-superbot-mode': 'agent',
		'x-superbot-session': 'my-chat-1',
	});
	assert.deepEqual(request.body, {
		model: 'superbot-fast',
		messages: [{ role: 'user', content: 'ping' }],
		stream: false,
	});
	assert.equal(request.json, true);
	assert.equal(request.returnFullResponse, true);
	assert.equal(request.timeout, 90_000);
});

test('the client header carries the package version', () => {
	assert.equal(constants.PACKAGE_VERSION, pkg.version);
	assert.equal(constants.CLIENT_HEADER_VALUE, `n8n/${pkg.version}`);
	assert.match(constants.CLIENT_HEADER_VALUE, /^n8n\/\d+\.\d+\.\d+/);
});

test('turnResultOf reads the text, keeps the session and takes the request id from the response', () => {
	const result = turn.turnResultOf(
		fullResponse(completion('hello'), {
			'x-superbot-request-id': 'req-a',
			'x-request-id': 'req-b',
		}),
		'sess-1',
	);
	assert.deepEqual(result, { text: 'hello', session: 'sess-1', request_id: 'req-a' });
});

test('turnResultOf falls back to x-request-id, then to null', () => {
	assert.equal(
		turn.turnResultOf(fullResponse(completion('a'), { 'x-request-id': 'req-b' }), 's').request_id,
		'req-b',
	);
	assert.equal(
		turn.turnResultOf(fullResponse(completion('a'), { 'x-request-id': ['req-c', 'req-d'] }), 's')
			.request_id,
		'req-c',
	);
	assert.equal(turn.turnResultOf(fullResponse(completion('a'), {}), 's').request_id, null);
	assert.equal(turn.turnResultOf({ body: completion('a'), statusCode: 200 }, 's').request_id, null);
});

test('turnResultOf reads a held answer: leading whitespace before the JSON, delivered as text', () => {
	const held = `\n\n\n${JSON.stringify(completion('late answer'))}`;
	assert.equal(
		turn.turnResultOf(fullResponse(held, { 'x-superbot-request-id': 'req-h' }), 's').text,
		'late answer',
	);
});

test('turnResultOf joins the text parts of a content array and reads null content as empty', () => {
	const parts = {
		choices: [
			{
				message: {
					content: [
						{ type: 'text', text: 'one ' },
						{ type: 'image', url: 'x' },
						{ type: 'text', text: 'two' },
					],
				},
			},
		],
	};
	assert.equal(turn.turnResultOf(fullResponse(parts), 's').text, 'one two');
	assert.equal(
		turn.turnResultOf(fullResponse({ choices: [{ message: { content: null } }] }), 's').text,
		'',
	);
	assert.equal(turn.turnResultOf(fullResponse(completion('')), 's').text, '');
});

test('turnResultOf throws a TurnError for an error envelope inside a 200', () => {
	const envelope = {
		error: { message: 'The turn was interrupted.', type: 'api_error', code: 'server_shutdown' },
	};
	for (const body of [envelope, `\n\n${JSON.stringify(envelope)}`]) {
		assert.throws(
			() => turn.turnResultOf(fullResponse(body), 's'),
			(error) =>
				error instanceof turn.TurnError &&
				error.code === 'server_shutdown' &&
				error.message === 'The turn was interrupted.',
		);
	}
	assert.throws(
		() =>
			turn.turnResultOf(fullResponse({ error: { message: 'no code', type: 'api_error' } }), 's'),
		(error) => error instanceof turn.TurnError && error.code === 'api_error',
	);
	assert.throws(
		() => turn.turnResultOf(fullResponse({ error: 'plain text error' }), 's'),
		(error) =>
			error instanceof turn.TurnError &&
			error.code === 'error' &&
			error.message === 'plain text error',
	);
});

test('turnResultOf throws a TurnError when there is nothing to read', () => {
	for (const [body, code] of [
		['', 'unreadable_response'],
		['<html>Bad gateway</html>', 'unreadable_response'],
		[undefined, 'unreadable_response'],
		[{}, 'no_reply'],
		[{ choices: [] }, 'no_reply'],
		[{ choices: [{}] }, 'no_reply'],
	]) {
		assert.throws(
			() => turn.turnResultOf(fullResponse(body), 's'),
			(error) => error instanceof turn.TurnError && error.code === code,
			JSON.stringify(body),
		);
	}
});
