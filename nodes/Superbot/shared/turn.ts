import type { IDataObject, IHttpRequestOptions, IN8nHttpFullResponse } from 'n8n-workflow';
import { CLIENT_HEADER_VALUE, DEFAULT_BASE_URL, MODE_HEADER_VALUE } from './constants';

/** What one turn sends. */
export interface TurnInput {
	baseUrl: string;
	message: string;
	model: string;
	session: string;
	timeoutSeconds: number;
}

/** What one turn returns to the workflow: the next node continues the conversation with `session`. */
export interface TurnResult {
	text: string;
	session: string;
	request_id: string | null;
}

/** Superbot answered, but with an error (or with nothing readable). `code` is Superbot's own error code when it sent one. */
export class TurnError extends Error {
	readonly code: string;

	constructor(code: string, message: string) {
		super(message);
		this.name = 'TurnError';
		this.code = code;
	}
}

/**
 * The API origin a credential names, ready to append `/v1/...` to: trimmed, trailing slashes dropped, and a trailing `/v1`
 * dropped too (an OpenAI-style base URL pasted as it stands). Blank falls back to the default host.
 */
export function baseUrlOf(raw: unknown): string {
	let url = typeof raw === 'string' ? raw.trim() : '';
	const dropSlashes = () => {
		while (url.endsWith('/')) url = url.slice(0, -1);
	};
	dropSlashes();
	if (url.endsWith('/v1')) url = url.slice(0, -3);
	dropSlashes();
	return url === '' ? DEFAULT_BASE_URL : url;
}

/**
 * The request for one turn: the OpenAI chat-completions door with the Superbot headers. The call waits for the whole
 * answer (`stream: false`). The conversation is named by `x-superbot-session`, so only the new message is sent.
 */
export function turnRequestOf(input: TurnInput): IHttpRequestOptions {
	return {
		method: 'POST',
		url: `${input.baseUrl}/v1/chat/completions`,
		headers: {
			'x-superbot-client': CLIENT_HEADER_VALUE,
			'x-superbot-mode': MODE_HEADER_VALUE,
			'x-superbot-session': input.session,
		},
		body: {
			model: input.model,
			messages: [{ role: 'user', content: input.message }],
			stream: false,
		},
		json: true,
		returnFullResponse: true,
		timeout: input.timeoutSeconds * 1000,
	};
}

function recordOf(value: unknown): IDataObject | undefined {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as IDataObject)
		: undefined;
}

/**
 * The body as an object. Superbot holds a slow answer open with a status 200 and a newline every 15 seconds before the
 * JSON, so a body can arrive as text with leading whitespace.
 */
function bodyOf(body: unknown): IDataObject | undefined {
	if (typeof body === 'string') {
		const trimmed = body.trim();
		if (trimmed === '') return undefined;
		try {
			return recordOf(JSON.parse(trimmed));
		} catch {
			return undefined;
		}
	}
	return recordOf(body);
}

function headerOf(headers: IDataObject | undefined, name: string): string | undefined {
	const value = headers?.[name];
	const first = Array.isArray(value) ? value[0] : value;
	return typeof first === 'string' && first !== '' ? first : undefined;
}

/** The text of the first choice: a string, or the text parts of a content array. */
function replyTextOf(body: IDataObject): string | undefined {
	const choices = body.choices;
	if (!Array.isArray(choices)) return undefined;
	const message = recordOf(recordOf(choices[0])?.message);
	if (message === undefined) return undefined;
	const content = message.content;
	if (typeof content === 'string') return content;
	if (content === null || content === undefined) return '';
	if (!Array.isArray(content)) return undefined;
	return content
		.map((part) => {
			const text = recordOf(part)?.text;
			return typeof text === 'string' ? text : '';
		})
		.join('');
}

/**
 * The workflow item for a finished turn. Throws a TurnError when Superbot answered with an error envelope inside a
 * status 200 (a held answer cannot change its status once the first newline went out) or with no reply at all.
 */
export function turnResultOf(response: IN8nHttpFullResponse, session: string): TurnResult {
	const body = bodyOf(response.body);
	const headers = recordOf(response.headers);
	if (body === undefined) {
		throw new TurnError(
			'unreadable_response',
			'Superbot answered with something that is not a JSON reply.',
		);
	}
	const error = body.error;
	if (error !== undefined && error !== null) {
		const detail = recordOf(error);
		const code = detail?.code ?? detail?.type;
		const message = detail?.message;
		throw new TurnError(
			typeof code === 'string' && code !== '' ? code : 'error',
			typeof message === 'string' && message !== ''
				? message
				: typeof error === 'string'
					? error
					: 'Superbot ended the turn with an error.',
		);
	}
	const text = replyTextOf(body);
	if (text === undefined) {
		throw new TurnError('no_reply', 'Superbot answered without a reply to read.');
	}
	return {
		text,
		session,
		request_id:
			headerOf(headers, 'x-superbot-request-id') ?? headerOf(headers, 'x-request-id') ?? null,
	};
}
