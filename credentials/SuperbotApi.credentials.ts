import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';
import { DEFAULT_BASE_URL } from '../nodes/Superbot/shared/constants';

export class SuperbotApi implements ICredentialType {
	name = 'superbotApi';

	displayName = 'Superbot API';

	icon: Icon = {
		light: 'file:../nodes/Superbot/superbot.svg',
		dark: 'file:../nodes/Superbot/superbot.dark.svg',
	};

	documentationUrl = 'https://superbot.gg/docs';

	properties: INodeProperties[] = [
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: DEFAULT_BASE_URL,
			description:
				'The Superbot API address, without /v1. Leave the default unless Superbot gave you another one.',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			placeholder: 'sbc_…',
			description:
				'A Superbot API key. Make one in your Superbot account under API, with the gateway:invoke scope.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: "={{$credentials.baseUrl.trim().replace(/\\/+$/, '').replace(/\\/v1$/, '')}}",
			url: '/v1/keys/whoami',
			method: 'GET',
		},
	};
}
