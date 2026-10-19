/**
 * Conversation ids, as Superbot reads them from the `x-superbot-session` header.
 *
 * `isSessionId` is the rule Superbot applies to the header (a native id of letters, digits, `_` and `-`, at most 59
 * characters, or an imported chat's `vendor-` id). A header value that fails it is not refused by Superbot, it is ignored,
 * and the turn lands on the key's shared thread: the node checks first so a typo cannot merge two conversations.
 */

const NATIVE = /^[\w-]{1,59}$/;
const VENDOR = /^vendor-[a-z0-9][ !#-;=?-[\]-_a-~]{0,192}$/;

/** True when Superbot accepts `value` as a conversation id. */
export function isSessionId(value: unknown): value is string {
	if (typeof value !== 'string') return false;
	if (NATIVE.test(value)) return true;
	return VENDOR.test(value) && !value.endsWith(' ');
}

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

function randomChars(count: number): string {
	let out = '';
	for (let i = 0; i < count; i++) {
		out += ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length));
	}
	return out;
}

/**
 * A fresh conversation id for the Message operation: `n8n-<time in base 36>-<12 random characters>`, 25 characters, a
 * native id. The time part keeps ids ordered in Superbot's lists; the random part keeps two runs in one millisecond apart.
 */
export function newSessionId(now: number = Date.now()): string {
	return `n8n-${now.toString(36)}-${randomChars(12)}`;
}
