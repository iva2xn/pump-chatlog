import { createServer } from "./server/dashboard"
import { loadConfig } from "./config/store"
import { PumpChatBot } from "./bot/bot"

type CliOptions = {
    roomId: string | null
    username: string | null
    messageHistoryLimit: number | null
    token: string | null
    sendIntervalMs: number | null
    blacklist: string[] | null
    cooldownSeconds: number | null
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
            "  -c, --cooldown-seconds Optional. Per-user cooldown in seconds (0 disables)",
            "",
            "Env vars:",
            "  PUMP_ROOM_ID, PUMP_USERNAME, PUMP_HISTORY_LIMIT, PUMP_TOKEN, PUMP_SEND_INTERVAL_MS, PUMP_BLACKLIST, PUMP_COOLDOWN_SECONDS",
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
    let cooldownSeconds: number | null = process.env.PUMP_COOLDOWN_SECONDS
        ? Number(process.env.PUMP_COOLDOWN_SECONDS)
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
            case "--cooldown-seconds":
            case "-c":
                cooldownSeconds = Number(args[i + 1])
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
                } else if (arg.startsWith("cooldown-seconds=") || arg.startsWith("-c=")) {
                    cooldownSeconds = Number(arg.split("=")[1])
                }
                break
        }
    }

    return { roomId, username, messageHistoryLimit, token, sendIntervalMs, blacklist, cooldownSeconds }
}

async function main() {
    const { roomId, username, messageHistoryLimit, token, sendIntervalMs, blacklist, cooldownSeconds } = parseArgs(
        process.argv.slice(2)
    )

    const initial = loadConfig()
    const merged = {
        ...initial,
        roomId: roomId || initial.roomId,
        username: username || initial.username,
        messageHistoryLimit: messageHistoryLimit ?? initial.messageHistoryLimit,
        token: token || initial.token,
        sendIntervalMs: sendIntervalMs ?? initial.sendIntervalMs,
        blacklist: blacklist ?? initial.blacklist,
        cooldownSeconds: cooldownSeconds ?? initial.cooldownSeconds,
    }

    const bot = new PumpChatBot(merged)
    if (merged.roomId) {
        bot.start()
    } else {
        console.error("No roomId configured. Use the dashboard to set one.")
    }

    const server = createServer(3000, bot)

    // Graceful shutdown
    const shutdown = () => {
        try {
            bot.stop()
            server.close()
        } finally {
            setTimeout(() => process.exit(0), 200)
        }
    }
    process.on("SIGINT", shutdown)
    process.on("SIGTERM", shutdown)
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})


