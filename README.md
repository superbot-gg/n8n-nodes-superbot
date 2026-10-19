# n8n-nodes-superbot

An [n8n](https://n8n.io) community node for [Superbot](https://superbot.gg).
Send a message to your Superbot agent from a workflow, or continue a conversation, and get the answer back as data
the next node can use.

- **Message**: starts a new conversation and returns `{ text, session, request_id }`.
- **Continue conversation**: sends a follow-up into a conversation by its session ID, and returns the same three fields.

The node waits for the whole turn. An agent that works for minutes still answers inside the node: n8n has no 30
second step limit, and Superbot keeps the connection alive while it works.

## Install

On a self-hosted n8n, open **Settings > Community nodes > Install**, enter `n8n-nodes-superbot` and accept the
prompt about community code. Or, from the n8n user folder (`~/.n8n`):

```sh
mkdir -p ~/.n8n/nodes && cd ~/.n8n/nodes
npm install n8n-nodes-superbot
```

and restart n8n. Docker: do the same inside the container's `/home/node/.n8n/nodes` (a volume), then restart it.
[n8n's guide to installing community nodes](https://docs.n8n.io/integrations/community-nodes/installation/) has the
details. n8n Cloud installs only verified community nodes; this package is not verified yet, and the
[HTTP Request recipe](#without-the-package-http-request) below works there.

## Credentials

Add a **Superbot API** credential with two fields:

- **Base URL**: the Superbot API address, `https://api.superbot.gg` by default. No `/v1` at the end (it is dropped if you add it).
- **API Key**: a key that starts with `sbc_`. Make one in your Superbot account under **API** (`/account/api`), with the `gateway:invoke` scope.

**Test** calls `GET /v1/keys/whoami`, which any valid key may read.

## Message

| Field | |
| --- | --- |
| **Message** | What to say to the agent. Map it from an earlier node with an expression. |
| **Options > Model** | `superbot` (default), `superbot-fast` for quicker answers, or `superbot-omni`. |
| **Options > Timeout (Seconds)** | How long to wait for the answer. Default 1800. |

Output, one item per input item:

```json
{
  "text": "The agent's answer.",
  "session": "n8n-mgxq2k1c-3f9a0b7c1d2e",
  "request_id": "9b0d6f3a-1c2e-4a55-8e0f-7d7e1d2c3b4a"
}
```

`session` is the conversation. Every Message starts a new one.

## Continue conversation

Set **Session ID** to `{{ $json.session }}` (or `{{ $('Superbot').item.json.session }}` from further back) and write
the follow-up in **Message**. The agent remembers the earlier turns on Superbot's side, so only the new message is
sent. The output has the same shape, with the same `session`, so you can chain as many follow-ups as you like.

A session ID is letters, digits, `_` and `-`, up to 59 characters, and you can pick your own: a name Superbot has not
seen starts a conversation under that name. That is how to keep one conversation per user, for example
`support-{{ $json.userId }}`. The node refuses a session ID Superbot would ignore, rather than letting the message
land in a shared thread.

## What the node sends

Every request is `POST /v1/chat/completions` with `Authorization: Bearer <key>` and:

| Header | Value |
| --- | --- |
| `x-superbot-client` | `n8n/<package version>` |
| `x-superbot-mode` | `agent` |
| `x-superbot-session` | the conversation |

Superbot records the client header on usage rows so you can tell the automation's spend from your own. The mode
header runs the full Superbot agent, as the Superbot apps do, so `text` can contain the agent's own markdown, and a
Superbot card arrives in it as a fenced `superbot-embed` block.

## Without the package: HTTP Request

On n8n Cloud, or anywhere you would rather not install a community node, the same call is an HTTP Request node:

1. **Chat Trigger** (or any trigger that gives you the user's text).
2. **HTTP Request**: method `POST`, URL `https://api.superbot.gg/v1/chat/completions`, authentication **Header Auth**
   (name `Authorization`, value `Bearer sbc_…`), send headers `x-superbot-client: n8n`, `x-superbot-mode: agent` and
   `x-superbot-session: {{ $json.sessionId }}`, body type JSON:
   `{"model":"superbot","messages":[{"role":"user","content":"{{ $json.chatInput }}"}],"stream":false}`. In Options,
   set a long **Timeout**.
3. Read the answer from `{{ $json.choices[0].message.content }}`.

The chat trigger's `sessionId` is a good conversation name when it is letters, digits, `_` and `-`.

## Support

Bug reports and requests: [open an issue](https://github.com/superbot-gg/n8n-nodes-superbot/issues). Questions: hi@superbot.gg.

The source is at [github.com/superbot-gg/n8n-nodes-superbot](https://github.com/superbot-gg/n8n-nodes-superbot).

## License

[MIT](LICENSE.md)
