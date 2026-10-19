// Shared by the test files: the compiled package, and a stand-in for the context n8n hands a node's execute().
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);

export const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
export const { Superbot } = require('../dist/nodes/Superbot/Superbot.node.js');
export const { SuperbotApi } = require('../dist/credentials/SuperbotApi.credentials.js');
export const constants = require('../dist/nodes/Superbot/shared/constants.js');
export const session = require('../dist/nodes/Superbot/shared/session.js');
export const turn = require('../dist/nodes/Superbot/shared/turn.js');
export const workflow = require('n8n-workflow');

export const nodeInfo = {
	id: 'node-1',
	name: 'Superbot',
	type: 'n8n-nodes-superbot.superbot',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

/** A chat completion as Superbot answers it. */
export const completion = (text) => ({
	id: 'chatcmpl-test',
	object: 'chat.completion',
	model: 'superbot',
	choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
});

/**
 * A context for Superbot.execute(). `params` is an object, or a function of the item index, of the node parameters;
 * `respond(options, callNumber)` answers each request the node makes (or throws).
 */
export function makeContext({
	params,
	items = [{ json: {} }],
	credentials = { baseUrl: 'https://example.test/v1/', apiKey: 'sbc_test' },
	respond,
	continueOnFail = false,
}) {
	const requests = [];
	const ctx = {
		getInputData: () => items,
		getNodeParameter: (name, itemIndex, fallback) => {
			const set = typeof params === 'function' ? params(itemIndex) : params;
			if (name in set) return set[name];
			if (fallback !== undefined) return fallback;
			throw new Error(`parameter ${name} is not set`);
		},
		getCredentials: async (type) => {
			if (type !== 'superbotApi') throw new Error(`unexpected credential ${type}`);
			return credentials;
		},
		getNode: () => nodeInfo,
		continueOnFail: () => continueOnFail,
		helpers: {
			httpRequestWithAuthentication: async function (type, options) {
				requests.push({ type, options, self: this });
				return respond(options, requests.length - 1);
			},
		},
	};
	return { ctx, requests };
}

/** A full response as n8n's HTTP helper returns it with returnFullResponse. */
export const fullResponse = (body, headers = {}) => ({
	body,
	headers,
	statusCode: 200,
	statusMessage: 'OK',
});
