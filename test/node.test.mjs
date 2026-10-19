import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	Superbot,
	completion,
	fullResponse,
	makeContext,
	pkg,
	session,
	workflow,
} from './helpers.mjs';

const answer = (text, id = 'req-1') =>
	fullResponse(completion(text), { 'x-superbot-request-id': id });

test('the node describes two operations, needs the Superbot credential and can be used as a tool', () => {
	const { description } = new Superbot();
	assert.equal(description.name, 'superbot');
	assert.equal(description.displayName, 'Superbot');
	assert.equal(description.usableAsTool, true);
	assert.deepEqual(description.credentials, [{ name: 'superbotApi', required: true }]);
	const operation = description.properties.find((p) => p.name === 'operation');
	assert.deepEqual(
		operation.options.map((o) => [o.name, o.value]),
		[
			['Continue Conversation', 'continue'],
			['Message', 'message'],
		],
	);
	assert.equal(operation.default, 'message');
	const sessionField = description.properties.find((p) => p.name === 'session');
	assert.deepEqual(sessionField.displayOptions, { show: { operation: ['continue'] } });
});

test('Message sends a new conversation: URL, headers, body, credential, and returns text, session and request_id', async () => {
	const { ctx, requests } = makeContext({
		params: { operation: 'message', message: 'hello superbot' },
		respond: () => answer('hi there', 'req-42'),
	});
	const [out] = await new Superbot().execute.call(ctx);

	assert.equal(requests.length, 1);
	const { type, options, self } = requests[0];
	assert.equal(type, 'superbotApi');
	assert.equal(self, ctx);
	assert.equal(options.method, 'POST');
	assert.equal(options.url, 'https://example.test/v1/chat/completions');
	assert.equal(options.headers['x-superbot-client'], `n8n/${pkg.version}`);
	assert.equal(options.headers['x-superbot-mode'], 'agent');
	assert.equal(session.isSessionId(options.headers['x-superbot-session']), true);
	assert.deepEqual(options.body, {
		model: 'superbot',
		messages: [{ role: 'user', content: 'hello superbot' }],
		stream: false,
	});
	assert.equal(options.timeout, 1_800_000);
	assert.equal(options.returnFullResponse, true);

	assert.equal(out.length, 1);
	assert.deepEqual(out[0].json, {
		text: 'hi there',
		session: options.headers['x-superbot-session'],
		request_id: 'req-42',
	});
	assert.deepEqual(out[0].pairedItem, { item: 0 });
});

test('Continue conversation names the given session and sends only the new message', async () => {
	const { ctx, requests } = makeContext({
		params: {
			operation: 'continue',
			session: '  n8n-abc-123  ',
			message: 'and then?',
			options: { model: 'superbot-fast', timeout: 45 },
		},
		respond: () => answer('then this'),
	});
	const [out] = await new Superbot().execute.call(ctx);

	const { options } = requests[0];
	assert.equal(options.headers['x-superbot-session'], 'n8n-abc-123');
	assert.equal(options.body.model, 'superbot-fast');
	assert.deepEqual(options.body.messages, [{ role: 'user', content: 'and then?' }]);
	assert.equal(options.timeout, 45_000);
	assert.deepEqual(out[0].json, { text: 'then this', session: 'n8n-abc-123', request_id: 'req-1' });
});

test('a Message then a Continue on its output is one conversation', async () => {
	const first = makeContext({
		params: { operation: 'message', message: 'one' },
		respond: () => answer('first'),
	});
	const [[firstItem]] = await new Superbot().execute.call(first.ctx);

	const second = makeContext({
		params: { operation: 'continue', session: firstItem.json.session, message: 'two' },
		respond: () => answer('second'),
	});
	const [[secondItem]] = await new Superbot().execute.call(second.ctx);

	assert.equal(
		second.requests[0].options.headers['x-superbot-session'],
		first.requests[0].options.headers['x-superbot-session'],
	);
	assert.equal(secondItem.json.session, firstItem.json.session);
});

test('a blank model option falls back to superbot', async () => {
	const { ctx, requests } = makeContext({
		params: { operation: 'message', message: 'x', options: { model: '  ' } },
		respond: () => answer('ok'),
	});
	await new Superbot().execute.call(ctx);
	assert.equal(requests[0].options.body.model, 'superbot');
});

test('every input item gets its own request, its own session and a paired item', async () => {
	const { ctx, requests } = makeContext({
		items: [{ json: { q: 'a' } }, { json: { q: 'b' } }, { json: { q: 'c' } }],
		params: (i) => ({ operation: 'message', message: `question ${i}` }),
		respond: (options, n) => answer(`answer ${n}`, `req-${n}`),
	});
	const [out] = await new Superbot().execute.call(ctx);

	assert.equal(requests.length, 3);
	assert.deepEqual(
		out.map((item) => [item.json.text, item.json.request_id, item.pairedItem.item]),
		[
			['answer 0', 'req-0', 0],
			['answer 1', 'req-1', 1],
			['answer 2', 'req-2', 2],
		],
	);
	assert.equal(new Set(out.map((item) => item.json.session)).size, 3);
	assert.deepEqual(
		requests.map((r) => r.options.body.messages[0].content),
		['question 0', 'question 1', 'question 2'],
	);
});

test('the credential base URL decides the host, whatever slash or /v1 it carries', async () => {
	for (const baseUrl of [
		'https://other.test',
		'https://other.test/',
		'https://other.test/v1',
		'https://other.test/v1/',
	]) {
		const { ctx, requests } = makeContext({
			credentials: { baseUrl, apiKey: 'sbc_test' },
			params: { operation: 'message', message: 'x' },
			respond: () => answer('ok'),
		});
		await new Superbot().execute.call(ctx);
		assert.equal(requests[0].options.url, 'https://other.test/v1/chat/completions', baseUrl);
	}
});

test('a session Superbot would ignore stops the item before any request goes out', async () => {
	for (const bad of ['', '   ', 'has space', 'a/b', 'x'.repeat(60)]) {
		const { ctx, requests } = makeContext({
			params: { operation: 'continue', session: bad, message: 'x' },
			respond: () => answer('never'),
		});
		await assert.rejects(
			() => new Superbot().execute.call(ctx),
			(error) =>
				error instanceof workflow.NodeOperationError &&
				/session ID/i.test(error.message) &&
				error.context.itemIndex === 0,
			JSON.stringify(bad),
		);
		assert.equal(requests.length, 0);
	}
});

test("an error envelope inside a 200 fails the item with Superbot's code", async () => {
	const { ctx } = makeContext({
		params: { operation: 'message', message: 'x' },
		respond: () =>
			fullResponse(
				`\n\n${JSON.stringify({ error: { message: 'Superbot restarted', code: 'server_shutdown' } })}`,
			),
	});
	await assert.rejects(
		() => new Superbot().execute.call(ctx),
		(error) =>
			error instanceof workflow.NodeOperationError &&
			error.message === 'Superbot restarted' &&
			error.description === 'server_shutdown',
	);
});

test('an HTTP failure becomes a NodeApiError that keeps the status and message', async () => {
	const failure = Object.assign(new Error('Request failed with status code 401'), {
		response: {
			status: 401,
			data: { error: { message: 'Invalid API key.', code: 'invalid_api_key' } },
		},
		httpCode: '401',
	});
	const { ctx } = makeContext({
		params: { operation: 'message', message: 'x' },
		respond: () => {
			throw failure;
		},
	});
	await assert.rejects(
		() => new Superbot().execute.call(ctx),
		(error) =>
			error instanceof workflow.NodeApiError &&
			error.httpCode === '401' &&
			error.context.itemIndex === 0,
	);
});

test('with continue on fail, a failed item becomes an error item and the others still run', async () => {
	const { ctx, requests } = makeContext({
		continueOnFail: true,
		items: [{ json: {} }, { json: {} }, { json: {} }],
		params: (i) => ({ operation: 'message', message: `m${i}` }),
		respond: (options, n) => {
			if (n === 1) throw new Error('socket hang up');
			return answer(`ok ${n}`);
		},
	});
	const [out] = await new Superbot().execute.call(ctx);

	assert.equal(requests.length, 3);
	assert.equal(out.length, 3);
	assert.equal(out[0].json.text, 'ok 0');
	assert.deepEqual(out[1].json, { error: 'socket hang up' });
	assert.deepEqual(out[1].pairedItem, { item: 1 });
	assert.equal(out[2].json.text, 'ok 2');
});

test('with continue on fail, a Superbot error envelope is an error item too', async () => {
	const { ctx } = makeContext({
		continueOnFail: true,
		params: { operation: 'message', message: 'x' },
		respond: () =>
			fullResponse({ error: { message: 'out of credits', code: 'insufficient_credits' } }),
	});
	const [out] = await new Superbot().execute.call(ctx);
	assert.deepEqual(out[0].json, { error: 'out of credits' });
});
