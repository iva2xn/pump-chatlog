declare module "better-sqlite3" {
	namespace Database {
		interface Statement<Params extends any[] = any[], Result = any> {
			get(...params: Params): Result
			run(...params: Params): { changes: number; lastInsertRowid: number }
			all(...params: Params): Result[]
		}
		interface Database {
			prepare<Params extends any[] = any[], Result = any>(sql: string): Statement<Params, Result>
			exec(sql: string): void
			close(): void
		}
	}
	const Database: {
		new (filename: string): Database.Database
	}
	export = Database
}


