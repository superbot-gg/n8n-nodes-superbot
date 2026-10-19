import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SuperbotApi, constants } from './helpers.mjs';

const credential = new SuperbotApi();

test('the credential asks for a base URL and an API key, and hides the key', () => {
	const [baseUrl, apiKey] = credential.properties;
	assert.equal(credential.name, 'superbotApi');
	assert.equal(baseUrl.name, 'baseUrl');
	assert.equal(baseUrl.default, constants.DEFAULT_BASE_URL);
	assert.equal(apiKey.name, 'apiKey');
	assert.equal(apiKey.typeOptions.password, true);
	assert.equal(apiKey.required, true);
	assert.equal(credential.properties.length, 2);
});

test('the key travels as a Bearer token', () => {
	assert.deepEqual(credential.authenticate, {
		type: 'generic',
		properties: { headers: { Authorization: '=Bearer {{$credentials.apiKey}}' } },
	});
});

test('the credential test reads /v1/keys/whoami', () => {
	const { request } = credential.test;
	assert.equal(request.url, '/v1/keys/whoami');
	assert.equal(request.method, 'GET');
});

test('the credential test base URL expression gives the origin whatever slash or /v1 the user typed', () => {
	const expression = credential.test.request.baseURL;
	assert.match(expression, /^=\{\{.*\}\}$/);
	const body = expression.slice(3, -2);
	const evaluate = (baseUrl) =>
		new Function('$credentials', `return ${body}`)({ baseUrl, apiKey: 'sbc_test' });
	for (const typed of [
		'https://example.test',
		'https://example.test/',
		'https://example.test/v1',
		' https://example.test/v1/ ',
	]) {
		assert.equal(evaluate(typed), 'https://example.test', JSON.stringify(typed));
	}
});

test('the icons are the Superbot mark, light and dark', () => {
	assert.deepEqual(credential.icon, {
		light: 'file:../nodes/Superbot/superbot.svg',
		dark: 'file:../nodes/Superbot/superbot.dark.svg',
	});
});
