import express, { Request, Response } from "express"
import path from "path"
import bodyParser from "body-parser"
import { loadConfig, saveConfig } from "../config/store"
import { PumpChatBot } from "../bot/bot"
import type { Server } from "http"
import fs from "fs"

export function createServer(port: number = 3000, providedBot?: PumpChatBot): Server {
	const app = express()
	app.use(bodyParser.json())

	let bot: PumpChatBot | null = providedBot || null

	app.get("/api/config", (req: Request, res: Response) => {
		res.json(loadConfig())
	})

	app.post("/api/config", (req: Request, res: Response) => {
		const merged = saveConfig(req.body || {})
		if (bot) bot.updateConfig(merged)
		res.json(merged)
	})

	app.post("/api/bot/start", (req: Request, res: Response) => {
		if (!bot) bot = new PumpChatBot(loadConfig())
		bot.start()
		res.json({ ok: true })
	})

	app.post("/api/bot/stop", (req: Request, res: Response) => {
		if (bot) bot.stop()
		res.json({ ok: true })
	})

	app.get("/api/bot/status", (req: Request, res: Response) => {
		if (!bot) return res.json({ running: false, connected: false })
		res.json(bot.getStatus())
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

		if (!bot) bot = new PumpChatBot(loadConfig())
		const unsubscribe = bot.subscribe((msg) => {
			try {
				res.write(`data: ${JSON.stringify({
					id: msg.id,
					username: msg.username,
					userAddress: msg.userAddress,
					message: msg.message,
					timestamp: msg.timestamp,
				})}\n\n`)
			} catch {
                console.log('error');
            }
		})

		req.on("close", () => {
            console.log('bot closed');
			clearInterval(heartbeat)
			unsubscribe()
			try { res.end() } catch {}
            console.log('bot ended');
		})
	})


	// Serve static dashboard
	const distPublic = path.join(__dirname, "public")
	const srcPublic = path.resolve(process.cwd(), "src", "server", "public")
	const staticRoot = fs.existsSync(distPublic) ? distPublic : srcPublic
	app.use(express.static(staticRoot))
	app.get(["/", "/index.html"], (_req: Request, res: Response) => {
		res.sendFile(path.join(staticRoot, "index.html"))
	})

	app.get(["/chat", "/chat.html"], (_req: Request, res: Response) => {
		res.sendFile(path.join(staticRoot, "chat.html"))
	})
	app.get(["/guess", "/guess.html"], (_req: Request, res: Response) => {
		res.sendFile(path.join(staticRoot, "guess.html"))
	})
	// Fallback to index for any route
	app.use((req: Request, res: Response) => {
		res.sendFile(path.join(staticRoot, "index.html"))
	})

	return app.listen(port, () => {
		// eslint-disable-next-line no-console
		console.log(`Dashboard listening on http://localhost:${port}`)
	})
}


