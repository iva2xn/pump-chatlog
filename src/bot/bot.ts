import { PumpChatClient, IMessage } from "../index"
import { BotConfig, BotStatus } from "./types"

type Recent = { lastAllowedAt: number; messages: { id: string; at: number }[] }

export class PumpChatBot {
	private config: BotConfig
	private client: PumpChatClient | null = null
	private recentByUser: Map<string, Recent> = new Map()
	private giveaway = {
		open: false,
		entrants: new Map<string, { name: string; address?: string; joinedAt: number }>(),
	}
	private connected: boolean = false

	private subscribers: Set<(msg: IMessage) => void> = new Set()

	constructor(config: BotConfig) {
		this.config = { ...config }
	}

	public getStatus(): BotStatus {
		return {
			running: !!this.client,
			connected: this.connected,
			roomId: this.config.roomId,
			username: this.config.username,
		}
	}

	public updateConfig(newConfig: Partial<BotConfig>): void {
		this.config = { ...this.config, ...newConfig }
	}

	public subscribe(handler: (msg: IMessage) => void): () => void {
		this.subscribers.add(handler)
		return () => {
			this.subscribers.delete(handler)
		}
	}

	public start(): void {
		if (this.client) return
		const { roomId, username, messageHistoryLimit, token } = this.config
		this.client = new PumpChatClient({ roomId, username, messageHistoryLimit, token })

		this.client.on("connected", () => {
			this.connected = true
			// eslint-disable-next-line no-console
			console.log(`Connected to room ${roomId}`)
		})

		this.client.on("disconnected", () => {
			this.connected = false
		})

		this.client.on("error", (err) => {
			// eslint-disable-next-line no-console
			console.error(`Error: ${err}`)
		})

		this.client.on("serverError", (err) => {
			// eslint-disable-next-line no-console
			console.error(`Server error: ${JSON.stringify(err)}`)
		})

		this.client.on("message", (msg) => this.onMessage(msg))

		this.client.connect()
	}

	public stop(): void {
		if (!this.client) return
		try {
			this.client.disconnect()
		} finally {
			this.client = null
			this.connected = false
			this.recentByUser.clear()
			this.giveaway.open = false
			this.giveaway.entrants.clear()
		}
	}

	private escapeRegExp(s: string): string {
		// Escape regex metacharacters
		return s.replace(/[.*+?^${}()|\[\]\\]/g, "\\$&")
	}

	private containsExactBlacklistedWord(text: string): boolean {
		const blacklistWords = (this.config.blacklist || []).map((w) => w.toLowerCase())
		if (!text || blacklistWords.length === 0) return false
		for (const word of blacklistWords) {
			const re = new RegExp(`\\b${this.escapeRegExp(word)}\\b`, "i")
			if (re.test(text)) return true
		}
		return false
	}

	private async onMessage(msg: IMessage): Promise<void> {
		const client = this.client
		if (!client) return

		const now = Date.now()
		const key = msg.userAddress || msg.username
		if (!key) return

		const content = String(msg.message || "").trim()
		const lc = content.toLowerCase()

		// !flip command
		if (lc.startsWith("!flip")) {
			const randomNumber = Math.floor(Math.random() * 2)
			if (randomNumber === 0) {
				await client.deleteMessage(msg)
			} else {
				await client.sendMessage(`${msg.username} flipped a coin and and got heads`)
			}
			return
		}

		// Giveaway commands (admin: userAddress must equal configured username)
		if (lc === "!giveaway open" || lc === "!open") {
			if (msg.userAddress !== this.config.username) return
			await client.deleteMessage(msg)
			this.giveaway.open = true
			this.giveaway.entrants.clear()
			await new Promise((resolve) => setTimeout(resolve, 250))
			await client.sendMessage("Giveaway opened. Type !join to enter.")
			return
		}

		if (lc === "!giveaway close" || lc === "!close") {
			if (msg.userAddress !== this.config.username) return
			await client.deleteMessage(msg)
			this.giveaway.open = false
			await new Promise((resolve) => setTimeout(resolve, 250))
			await client.sendMessage("Giveaway closed.")
			return
		}

		if (lc === "!giveaway reset" || lc === "!reset") {
			if (msg.userAddress !== this.config.username) return
			await client.deleteMessage(msg)
			this.giveaway.open = false
			this.giveaway.entrants.clear()
			await new Promise((resolve) => setTimeout(resolve, 250))
			await client.sendMessage("Giveaway reset.")
			return
		}

		if (lc === "!draw" || lc === "!winner" || lc === "!giveaway draw") {
			if (msg.userAddress !== this.config.username) return
			await client.deleteMessage(msg)
			if (this.giveaway.entrants.size === 0) {
				await new Promise((resolve) => setTimeout(resolve, 250))
				await client.sendMessage("No entrants.")
				return
			}
			const entries = Array.from(this.giveaway.entrants.values())
			const winner = entries[Math.floor(Math.random() * entries.length)]
			this.giveaway.open = false
			this.giveaway.entrants.clear()
			await new Promise((resolve) => setTimeout(resolve, 250))
			// eslint-disable-next-line no-console
			console.log(`Winner: ${winner.name} ! Congrats! ${winner.address}`)
			await client.sendMessage(`Winner: ${winner.name} ! Congrats! ${winner.address}`)
			return
		}

		if (lc === "!join") {
			await client.deleteMessage(msg)
			if (!this.giveaway.open) return
			if (!this.giveaway.entrants.has(key)) {
				this.giveaway.entrants.set(key, { name: msg.username, address: msg.userAddress, joinedAt: now })
			}
			return
		}

		// Blacklist check
		if (this.containsExactBlacklistedWord(String(msg.message || ""))) {
			// eslint-disable-next-line no-console
			console.log(`Deleting message ${msg.username} message ${msg.message}`)
			await client.deleteMessage(msg)
			return
		}

		// eslint-disable-next-line no-console
		console.log(`Message ${msg.username} message ${msg.message}`)


		const cooldownMs = this.config.cooldownSeconds != null
			? Math.max(0, Math.floor(this.config.cooldownSeconds * 1000))
			: 5000
		const current: Recent = this.recentByUser.get(key) || { lastAllowedAt: 0, messages: [] }

		// Prune
		if (cooldownMs > 0) {
			current.messages = current.messages.filter((m) => now - m.at <= cooldownMs)
		}

		const delta = current.lastAllowedAt ? now - current.lastAllowedAt : Number.POSITIVE_INFINITY
		current.messages.push({ id: msg.id, at: now })

		if (cooldownMs > 0 && delta <= cooldownMs) {
			// eslint-disable-next-line no-console
			console.log(`Deleting message ${msg.username} message ${msg.message}`)
			await client.deleteMessage(msg)
			this.recentByUser.set(key, current)
		} else {

			// Notify subscribers for live feed
			for (const fn of this.subscribers) {
				try {
					fn(msg)
				} catch {
					console.log('error');
				}
			}
			if (cooldownMs > 0) current.lastAllowedAt = now
			this.recentByUser.set(key, current)
		}
	}
}


