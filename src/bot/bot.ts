import { PumpChatClient, IMessage } from "../index"
import { BotConfig, BotStatus } from "./types"

export class PumpChatBot {
	private config: BotConfig
	private client: PumpChatClient | null = null
	private connected: boolean = false

	private subscribers: Set<(msg: IMessage) => void> = new Set()

	constructor(config: BotConfig) {
		this.config = { ...config }
	}

	public getStatus(): BotStatus {
		return {
			running: !!this.client,
			connected: this.connected,
		}
	}

	public subscribe(handler: (msg: IMessage) => void): () => void {
		this.subscribers.add(handler)
		return () => {
			this.subscribers.delete(handler)
		}
	}

	public start(): void {
		if (this.client) return
		const { roomId, messageHistoryLimit } = this.config
		this.client = new PumpChatClient({ roomId, messageHistoryLimit })

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
		}
	}

	private onMessage(msg: IMessage): void {
		// Notify subscribers for live feed
		for (const fn of this.subscribers) {
			try {
				fn(msg)
			} catch {
				// ignore
			}
		}
	}
}
