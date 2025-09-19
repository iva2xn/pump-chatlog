import { getDb } from "./db"
import { BotConfig } from "../bot/types"

export function loadConfig(): BotConfig {
	const db = getDb()
	const row = db.prepare("SELECT * FROM settings WHERE id = 1").get() as any
	return {
		roomId: row.roomId || "",
		username: row.username || undefined,
		messageHistoryLimit: row.messageHistoryLimit ?? 100,
		token: row.token || undefined,
		sendIntervalMs: row.sendIntervalMs ?? 60000,
		blacklist: row.blacklist ? JSON.parse(row.blacklist) : [],
		cooldownSeconds: row.cooldownSeconds ?? 5,
	}
}

export function saveConfig(cfg: Partial<BotConfig>): BotConfig {
	const current = loadConfig()
	const merged: BotConfig = { ...current, ...cfg }
	const db = getDb()
	db.prepare(
		`UPDATE settings SET roomId=@roomId, username=@username, messageHistoryLimit=@messageHistoryLimit,
		 token=@token, sendIntervalMs=@sendIntervalMs, blacklist=@blacklist, cooldownSeconds=@cooldownSeconds WHERE id = 1`
	).run({
		roomId: merged.roomId,
		username: merged.username ?? null,
		messageHistoryLimit: merged.messageHistoryLimit ?? null,
		token: merged.token ?? null,
		sendIntervalMs: merged.sendIntervalMs ?? null,
		blacklist: JSON.stringify(merged.blacklist || []),
		cooldownSeconds: merged.cooldownSeconds ?? null,
	})
	return merged
}


