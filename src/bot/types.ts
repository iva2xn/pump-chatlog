export type BotConfig = {
	roomId: string
	username?: string
	messageHistoryLimit?: number
	token?: string
	sendIntervalMs?: number
	blacklist?: string[]
	cooldownSeconds?: number
}

export type BotStatus = {
	running: boolean
	connected: boolean
	roomId?: string
	username?: string
}