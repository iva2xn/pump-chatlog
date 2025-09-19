import { createServer } from "./server/dashboard"

async function main() {
    const server = createServer(3000)

    // Graceful shutdown
    const shutdown = () => {
        try {
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
