import Database from "better-sqlite3"
import path from "path"
import fs from "fs"

let db: Database.Database | null = null

function ensureDir(dir: string) {
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true })
	}
}

export function getDb(): Database.Database {
	if (db) return db
	const dataDir = path.resolve(process.cwd(), ".data")
	ensureDir(dataDir)
	const dbPath = path.join(dataDir, "pump-chat.db")
	db = new Database(dbPath)
	// Migrate
	db.exec(`
		CREATE TABLE IF NOT EXISTS settings (
			id INTEGER PRIMARY KEY CHECK (id = 1),
			roomId TEXT NOT NULL,
			username TEXT,
			messageHistoryLimit INTEGER,
			token TEXT,
			sendIntervalMs INTEGER,
			blacklist TEXT,
			cooldownSeconds INTEGER
		);
		INSERT OR IGNORE INTO settings (id, roomId, username, messageHistoryLimit, token, sendIntervalMs, blacklist, cooldownSeconds)
		VALUES (1, '', NULL, 100, NULL, 60000, '[]', 5);
	`)
	return db
}


