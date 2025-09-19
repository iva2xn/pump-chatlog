import fs from "fs"
import path from "path"
import { BotConfig } from "../bot/types"

const configPath = path.resolve(process.cwd(), "config.json")

const defaultConfig: BotConfig = {
	roomId: "",
	messageHistoryLimit: 100,
}

export function loadConfig(): BotConfig {
	if (!fs.existsSync(configPath)) {
		return defaultConfig
	}
	try {
		const data = fs.readFileSync(configPath, "utf-8")
		return { ...defaultConfig, ...JSON.parse(data) }
	} catch {
		return defaultConfig
	}
}

export function saveConfig(cfg: Partial<BotConfig>): BotConfig {
	const current = loadConfig()
	const merged: BotConfig = { ...current, ...cfg }
	try {
		fs.writeFileSync(configPath, JSON.stringify(merged, null, 2))
	} catch (err) {
		console.error("Failed to save config:", err)
	}
	return merged
}
