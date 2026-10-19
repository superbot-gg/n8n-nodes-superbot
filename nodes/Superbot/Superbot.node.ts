import type {
	IExecuteFunctions,
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { CREDENTIAL_TYPE, DEFAULT_MODEL, DEFAULT_TIMEOUT_SECONDS } from './shared/constants';
import { isSessionId, newSessionId } from './shared/session';
import { baseUrlOf, TurnError, turnRequestOf, turnResultOf } from './shared/turn';

interface SuperbotOptions {
	model?: string;
	timeout?: number;
}

export class Superbot implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Superbot',
		name: 'superbot',
		icon: { light: 'file:superbot.svg', dark: 'file:superbot.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Send a message to your Superbot agent and get the answer back',
		defaults: {
			name: 'Superbot',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: CREDENTIAL_TYPE,
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Continue Conversation',
						value: 'continue',
						action: 'Continue a conversation',
						description:
							'Send a follow-up message in a conversation, by its session ID. A session ID Superbot has not seen starts a new conversation under that name.',
					},
					{
						name: 'Message',
						value: 'message',
						action: 'Send a message',
						description:
							'Send a message to your Superbot agent in a new conversation. The output carries the session ID to continue it.',
					},
				],
				default: 'message',
			},
			{
				displayName: 'Session ID',
				name: 'session',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'e.g. {{ $json.session }}',
				description:
					'The conversation to continue. Use the session from a previous Superbot node, or any name of your own: letters, digits, _ and -, up to 59 characters.',
				displayOptions: {
					show: {
						operation: ['continue'],
					},
				},
			},
			{
				displayName: 'Message',
				name: 'message',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				required: true,
				default: '',
				description: 'What to say to your Superbot agent',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				options: [
					{
						displayName: 'Model',
						name: 'model',
						type: 'string',
						default: DEFAULT_MODEL,
						description:
							'Which model answers: superbot (the default), superbot-fast for quicker answers, or superbot-omni',
					},
					{
						displayName: 'Timeout (Seconds)',
						name: 'timeout',
						type: 'number',
						typeOptions: {
							minValue: 1,
						},
						default: DEFAULT_TIMEOUT_SECONDS,
						description:
							'How long to wait for the answer. The node waits for the whole turn, so an agent that works for minutes still returns here.',
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const operation = this.getNodeParameter('operation', 0) as string;
		const credentials = await this.getCredentials(CREDENTIAL_TYPE);
		const baseUrl = baseUrlOf(credentials.baseUrl);

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const message = this.getNodeParameter('message', itemIndex) as string;
				const options = this.getNodeParameter('options', itemIndex, {}) as SuperbotOptions;

				let session: string;
				if (operation === 'continue') {
					session = (this.getNodeParameter('session', itemIndex) as string).trim();
					if (!isSessionId(session)) {
						throw new NodeOperationError(
							this.getNode(),
							'The session ID is not one Superbot accepts',
							{
								itemIndex,
								description:
									'Use letters, digits, _ and - only, up to 59 characters. Take it from the session field of a previous Superbot node, or pick a name of your own.',
							},
						);
					}
				} else {
					session = newSessionId();
				}

				const response = await this.helpers.httpRequestWithAuthentication.call(
					this,
					CREDENTIAL_TYPE,
					turnRequestOf({
						baseUrl,
						message,
						model: options.model?.trim() || DEFAULT_MODEL,
						session,
						timeoutSeconds: options.timeout ?? DEFAULT_TIMEOUT_SECONDS,
					}),
				);

				returnData.push({
					json: { ...turnResultOf(response, session) },
					pairedItem: { item: itemIndex },
				});
			} catch (error) {
				const failure =
					error instanceof TurnError
						? new NodeOperationError(this.getNode(), error.message, {
								itemIndex,
								description: error.code,
							})
						: error;
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: failure.message } as IDataObject,
						pairedItem: { item: itemIndex },
					});
					continue;
				}
				if (failure instanceof NodeOperationError || failure instanceof NodeApiError) {
					if (failure.context) failure.context.itemIndex = itemIndex;
					throw failure;
				}
				throw new NodeApiError(this.getNode(), failure as JsonObject, { itemIndex });
			}
		}

		return [returnData];
	}
}
