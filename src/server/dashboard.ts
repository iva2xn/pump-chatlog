import express, { Request, Response } from "express"
import path from "path"
import bodyParser from "body-parser"
import { loadConfig, saveConfig } from "../config/store"
import { PumpChatBot } from "../bot/bot"
import type { Server } from "http"
import fs from "fs"

export function createServer(port: number = 3000): Server {
	const app = express()
	app.use(bodyParser.json())

	let bot: PumpChatBot | null = null

	const restartBot = () => {
		if (bot) {
			bot.stop()
			bot = null
		}
		const config = loadConfig()
		if (config.roomId) {
			bot = new PumpChatBot(config)
			bot.start()
		}
	}

	app.get("/api/config", (req: Request, res: Response) => {
		res.json(loadConfig())
	})

	app.post("/api/config", (req: Request, res: Response) => {
		const merged = saveConfig(req.body || {})
		res.json(merged)
		restartBot()
	})

	// Server-Sent Events stream for live messages
	app.get("/api/stream", (req: Request, res: Response) => {
		res.setHeader("Content-Type", "text/event-stream")
		res.setHeader("Cache-Control", "no-cache, no-transform")
		res.setHeader("Connection", "keep-alive")
		res.setHeader("X-Accel-Buffering", "no")
		// Keep the TCP connection alive and disable timeouts for SSE
		req.socket.setTimeout?.(0)
		req.socket.setKeepAlive?.(true)
		res.flushHeaders?.()

		// Suggest client retry interval and send initial comment to open the stream
		try {
			res.write("retry: 2000\n\n")
			res.write(": connected\n\n")
		} catch {}

		const heartbeat = setInterval(() => {
			res.write(`: ping\n\n`)
		}, 10000)

		if (!bot) restartBot()

		const unsubscribe = bot!.subscribe((msg) => {
			try {
				res.write(`data: ${JSON.stringify({
					id: msg.id,
					username: msg.username,
					userAddress: msg.userAddress,
					message: msg.message,
					timestamp: msg.timestamp,
				})}\n\n`)
			} catch {}
		})

		req.on("close", () => {
			clearInterval(heartbeat)
			unsubscribe()
			try { res.end() } catch {}
		})
	})


	// Serve static dashboard
	const distPublic = path.join(__dirname, "public")
	const srcPublic = path.resolve(process.cwd(), "src", "server", "public")
	const staticRoot = fs.existsSync(distPublic) ? distPublic : srcPublic
	// eslint-disable-next-line no-console
	console.log(`[dashboard] static root: ${staticRoot}`)
	// eslint-disable-next-line no-console
	console.log(`[dashboard] index exists: ${fs.existsSync(path.join(staticRoot, "index.html"))}`)
	app.use(express.static(staticRoot))
	app.get(["/", "/index.html"], (_req: Request, res: Response) => {
		res.sendFile(path.join(staticRoot, "index.html"))
	})

	app.get(["/chat", "/chat.html"], (_req: Request, res: Response) => {
		res.sendFile(path.join(staticRoot, "chat.html"))
	})
	// Fallback to index for any route
	app.use((req: Request, res: Response) => {
		res.sendFile(path.join(staticRoot, "index.html"))
	})

	// Start bot on server startup
	restartBot()

	return app.listen(port, () => {
		// eslint-disable-next-line no-console
		console.log(`Dashboard listening on http://localhost:${port}`)
	})
}
