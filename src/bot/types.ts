export type BotConfig = {
	roomId: string
	messageHistoryLimit?: number
}

export type BotStatus = {
	running: boolean
	connected: boolean
}
