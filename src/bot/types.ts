export type BotConfig = {
	roomId: string
	messageHistoryLimit?: number
	commandPrefix?: string
	lastFedWord?: string
}

export type BotStatus = {
	running: boolean
	connected: boolean
}
