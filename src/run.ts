import { PumpChatClient } from "./index"

type CliOptions = {
    roomId: string | null
    username: string | null
    messageHistoryLimit: number | null
    token: string | null
    sendIntervalMs: number | null
    blacklist: string[] | null
}

function printUsage(): void {
    console.log(
        [
            "Usage: node dist/run.js --room <TOKEN_ADDRESS> [--username <NAME>] [--limit <N>] [--token <JWT>] [--send-interval <MS>]",
            "",
            "Options:",
            "  -r, --room         Required. Token address (room id) to connect to",
            "  -u, --username     Optional. Display name (default: anonymous)",
            "  -l, --limit        Optional. Message history limit (default: 100)",
            "  -h, --help         Show this help",
            "  -t, --token        Optional. JWT auth token for sending messages",
            "  -s, --send-interval Optional. Min ms between auto-sends (default: 60000)",
            "  -b, --blacklist    Optional. Comma-separated exact words to delete",
            "",
            "Env vars:",
            "  PUMP_ROOM_ID, PUMP_USERNAME, PUMP_HISTORY_LIMIT, PUMP_TOKEN, PUMP_SEND_INTERVAL_MS, PUMP_BLACKLIST",
        ].join("\n")
    )
}

function parseArgs(argv: string[]): CliOptions {
    const args = [...argv]
    let roomId: string | null = process.env.PUMP_ROOM_ID || null
    let username: string | null = process.env.PUMP_USERNAME || null
    let messageHistoryLimit: number | null = process.env.PUMP_HISTORY_LIMIT
        ? Number(process.env.PUMP_HISTORY_LIMIT)
        : null
    let token: string | null = process.env.PUMP_TOKEN || null
    let sendIntervalMs: number | null = process.env.PUMP_SEND_INTERVAL_MS
        ? Number(process.env.PUMP_SEND_INTERVAL_MS)
        : null
    let blacklist: string[] | null = process.env.PUMP_BLACKLIST
        ? process.env.PUMP_BLACKLIST.split(",").map((w) => w.trim()).filter(Boolean)
        : null

    for (let i = 0; i < args.length; i++) {
        const arg = args[i]
        switch (arg) {
            case "--help":
            case "-h":
                printUsage()
                process.exit(0)
                break
            case "--room":
            case "-r":
                roomId = args[i + 1] || null
                i++
                break
            case "--username":
            case "-u":
                username = args[i + 1] || null
                i++
                break
            case "--limit":
            case "-l":
                messageHistoryLimit = Number(args[i + 1])
                i++
                break
            case "--token":
            case "-t":
                token = args[i + 1] || null
                i++
                break
            case "--send-interval":
            case "-s":
                sendIntervalMs = Number(args[i + 1])
                i++
                break
            case "--blacklist":
            case "-b":
                blacklist = (args[i + 1] || "").split(",").map((w) => w.trim()).filter(Boolean)
                i++
                break
            default:
                // Support "key=value" style as well
                if (arg.startsWith("room=") || arg.startsWith("-r=")) {
                    roomId = arg.split("=")[1] || null
                } else if (arg.startsWith("username=") || arg.startsWith("-u=")) {
                    username = arg.split("=")[1] || null
                } else if (arg.startsWith("limit=") || arg.startsWith("-l=")) {
                    const value = Number(arg.split("=")[1])
                    if (!Number.isNaN(value)) messageHistoryLimit = value
                } else if (arg.startsWith("token=") || arg.startsWith("-t=")) {
                    token = arg.split("=")[1] || null
                } else if (arg.startsWith("send-interval=") || arg.startsWith("-s=")) {
                    sendIntervalMs = Number(arg.split("=")[1])
                } else if (arg.startsWith("blacklist=") || arg.startsWith("-b=")) {
                    blacklist = (arg.split("=")[1] || "").split(",").map((w) => w.trim()).filter(Boolean)
                }
                break
        }
    }

    return { roomId, username, messageHistoryLimit, token, sendIntervalMs, blacklist }
}

async function main() {
    const { roomId, username, messageHistoryLimit, token, sendIntervalMs, blacklist } = parseArgs(
        process.argv.slice(2)
    )

    if (!roomId) {
        console.error("Error: --room <TOKEN_ADDRESS> is required.")
        printUsage()
        process.exit(1)
    }

    const client = new PumpChatClient({
        roomId,
        username: username || undefined,
        messageHistoryLimit: messageHistoryLimit || undefined,
        token: token || undefined,
    })

    client.on("connected", () => {
        console.log(`Connected to room ${roomId}`)
    })

    // Maintain per-user cooldown since the last allowed message (5s)
    type Recent = { lastAllowedAt: number; messages: { id: string; at: number }[] }
    const recentByUser: Map<string, Recent> = new Map()
    const cooldownMs = 5000
    const blacklistWords = (blacklist || []).map((w) => w.toLowerCase())

    const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const containsExactBlacklistedWord = (text: string): boolean => {
        if (!text || blacklistWords.length === 0) return false
        for (const word of blacklistWords) {
            const re = new RegExp(`\\b${escapeRegExp(word)}\\b`, "i")
            if (re.test(text)) return true
        }
        return false
    }

    client.on("message", async (msg) => {
        const now = Date.now()
        const key = msg.userAddress || msg.username
        if (!key) return

        // Blacklist check: delete immediately on exact word match
        if (containsExactBlacklistedWord(String(msg.message || ""))) {
            await client.deleteMessage(msg)
            return
        }

        const current: Recent = recentByUser.get(key) || { lastAllowedAt: 0, messages: [] }

        // Prune entries older than cooldown window
        current.messages = current.messages.filter((m) => now - m.at <= cooldownMs)

        // Time since last allowed message for this user
        const delta = current.lastAllowedAt ? now - current.lastAllowedAt : Number.POSITIVE_INFINITY
        // Record this message id and timestamp (for optional future use/inspection)
        current.messages.push({ id: msg.id, at: now })

        if (delta <= cooldownMs) {
            // Within cooldown: delete the message
            await client.deleteMessage(msg)
            recentByUser.set(key, current)
        } else {
            // Outside cooldown: allow and update lastAllowedAt
            current.lastAllowedAt = now
            recentByUser.set(key, current)
        }
    })

    client.on("userLeft", (payload) => {
        console.log(`User left: ${JSON.stringify(payload)}`)
    })

    client.on("serverError", (err) => {
        console.error(`Server error: ${JSON.stringify(err)}`)
    })

    client.on("error", (err) => {
        console.error(`Error: ${err}`)
    })

    client.on("disconnected", () => {
        console.log("Disconnected from chat")
    })

    client.on("maxReconnectAttemptsReached", () => {
        console.error("Max reconnection attempts reached. Exiting.")
        process.exit(1)
    })

    // Graceful shutdown
    const shutdown = () => {
        try {
            client.disconnect()
        } finally {
            // Give a brief moment for clean close frames
            setTimeout(() => process.exit(0), 200)
        }
    }
    process.on("SIGINT", shutdown)
    process.on("SIGTERM", shutdown)

    client.connect()
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})


