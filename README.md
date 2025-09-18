## Pump Helper (Open Source)

An open-source version of PumpHelper you can run yourself. It connects to pump.fun live chat over WebSocket (socket.io/Engine.IO v4), fetches message history, and includes optional moderation helpers (exact-word blacklist, per-user 5s cooldown, message delete).

### Highlights

- Automatic reconnection with heartbeat watchdog
- Socket.io framing with ack tracking (Engine.IO v4)
- Chronological message history with configurable limits
- Optional moderation helpers (CLI): exact-word blacklist, per-user cooldown
- HTTP moderation delete with 429-aware retries
- TypeScript with strong types (timestamps are Date)

---

## Run it yourself (CLI)

Windows PowerShell (recommended on Windows):

```powershell
# In the project directory
npm install

# Set your room and token, then start
$env:PUMP_ROOM_ID="<ROOM_ID>"; $env:PUMP_TOKEN="<JWT>"; npm start

# Optional extras
# - Set history limit (default 100)
$env:PUMP_HISTORY_LIMIT="200"
# - Exact-word blacklist (comma-separated). Case-insensitive, word-boundary matched
$env:PUMP_BLACKLIST="word1,word2,word3"
# - Throttle auto-send if you enable it in src/run.ts (default 60000 ms)
$env:PUMP_SEND_INTERVAL_MS="60000"

npm start
```

Generic shells (bash/zsh):

```bash
npm install
PUMP_ROOM_ID="<ROOM_ID>" PUMP_TOKEN="<JWT>" \
PUMP_HISTORY_LIMIT=200 PUMP_BLACKLIST="word1,word2" \
PUMP_SEND_INTERVAL_MS=60000 npm start
```

Or pass flags directly:

```bash
npm start -- \
  --room <ROOM_ID> \
  --token <JWT> \
  [--username <NAME>] \
  [--limit <N>] \
  [--send-interval <MS>] \
  [--blacklist word1,word2]
```

Flags and environment variables:

- `--room`, `-r` (required) / `PUMP_ROOM_ID`
- `--username`, `-u` / `PUMP_USERNAME`
- `--token`, `-t` / `PUMP_TOKEN` (JWT; required for sending/deleting)
- `--limit`, `-l` / `PUMP_HISTORY_LIMIT` (default 100)
- `--send-interval`, `-s` / `PUMP_SEND_INTERVAL_MS` (throttle auto-send; default 60000)
- `--blacklist`, `-b` / `PUMP_BLACKLIST` (comma-separated words; exact word match, case-insensitive)

What the CLI does by default:

- Connects to `wss://livechat.pump.fun/socket.io/?EIO=4&transport=websocket`
- Prints connection lifecycle events
- Requests and emits message history (sorted oldest → newest)
- If blacklist provided, deletes messages containing any exact blacklisted word
- Enforces a per-user 5s cooldown: if a user posts within 5s of their last allowed message, the message is deleted

Note: automatic send is commented out by default in `src/run.ts` to avoid rate limits. You can enable it locally if needed.

---

## Library usage (programmatic)

```typescript
import { PumpChatClient, IMessage } from 'pump-chat-client'

const client = new PumpChatClient({
  roomId: 'YOUR_TOKEN_ADDRESS',
  username: 'your-username',
  messageHistoryLimit: 100,
  token: process.env.PUMP_TOKEN, // optional but required for send/delete
})

client.on('connected', () => {
  console.log('Connected to pump.fun chat!')
})

client.on('messageHistory', (messages: IMessage[]) => {
  console.log(`History (oldest→newest): ${messages.length} items`)
})

client.on('message', (message: IMessage) => {
  // message.timestamp is a Date
  console.log(`${message.timestamp.toISOString()} ${message.username}: ${message.message}`)
})

client.on('error', (err) => console.error('Chat error:', err))
client.on('serverError', (err) => console.error('Server error:', err))
client.on('disconnected', () => console.log('Disconnected'))

client.connect()

// Send a message (requires valid token)
client.sendMessage('Hello everyone!')

// Delete a message (requires valid token)
// Note: deleteMessage accepts the full IMessage so it can build the correct URL
async function moderate(msg: IMessage) {
  const res = await client.deleteMessage(msg, 'TOXIC')
  if (!res.ok) console.error('Delete failed:', res.status, res.body)
}

// Access buffered messages
const last10 = client.getMessages(10)
const latest = client.getLatestMessage()

// Disconnect when done
client.disconnect()
```

---

## API reference

### PumpChatClient(options)

Options:

```typescript
interface PumpChatClientOptions {
  roomId: string
  username?: string
  messageHistoryLimit?: number // default 100
  token?: string // JWT used for Authorization and auth-token headers
}
```

Events:

- `connected`
- `disconnected`
- `message` (IMessage)
- `messageHistory` (IMessage[])
- `error` (Error)
- `serverError` (unknown)
- `userLeft`
- `maxReconnectAttemptsReached`

Methods:

- `connect(): void`
- `disconnect(): void`
- `sendMessage(message: string): void` (requires token)
- `deleteMessage(msg: IMessage, reason = 'TOXIC'): Promise<{ ok: boolean; status: number; body?: unknown }>`
  - Retries on HTTP 429 using Retry-After or exponential backoff with jitter (up to 5 attempts)
- `getMessages(limit?: number): IMessage[]`
- `getLatestMessage(): IMessage | null`
- `isActive(): boolean`

Types:

```typescript
interface IMessage {
  id: string
  roomId: string
  username: string
  userAddress: string
  message: string
  profile_image: string
  timestamp: Date // normalized to Date
  messageType: string
  expiresAt: number
}
```

---

## Moderation notes

- Deleting or sending requires a valid pump.fun JWT token. Provide it via `token` in code, `--token` flag, or `PUMP_TOKEN` env.
- The library sets both `Authorization: Bearer <token>` and `auth-token` headers and also includes the token in the initial socket handshake payload.
- The CLI moderation helpers (blacklist and cooldown) are examples; adjust logic in `src/run.ts` to fit your needs.

---

## Development

Build:

```bash
npm run build
```

Run CLI locally:

```bash
npm start -- --room <ROOM_ID> --token <JWT>
```

---

## License

MIT