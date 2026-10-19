import pkg from '../../../package.json';

/** The package version, read from package.json so the client header can never drift from the release. */
export const PACKAGE_VERSION: string = pkg.version;

/** `x-superbot-client` on every request: the automation client and its version, which Superbot keeps on usage rows for attribution. */
export const CLIENT_HEADER_VALUE = `n8n/${PACKAGE_VERSION}`;

/** `x-superbot-mode` on every turn: the request is a Superbot agent turn. */
export const MODE_HEADER_VALUE = 'agent';

/** The credential type the node asks n8n for (credentials/SuperbotApi.credentials.ts). */
export const CREDENTIAL_TYPE = 'superbotApi';

/** The Superbot API origin the credential starts with. The credential's Base URL overrides it. */
export const DEFAULT_BASE_URL = 'https://api.superbot.gg';

/** The model a turn names when the node's Model option is left alone: the Superbot agent. */
export const DEFAULT_MODEL = 'superbot';

/** How long the node waits for the answer, in seconds: Superbot waits up to this long on a turn, and n8n has no step budget of its own. */
export const DEFAULT_TIMEOUT_SECONDS = 1800;
