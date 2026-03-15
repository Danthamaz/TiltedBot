const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'tilted.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
  }
  return db;
}

function runMigrations(db) {
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  if (!fs.existsSync(migrationsDir)) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const applied = new Set(
    db.prepare('SELECT name FROM migrations').all().map(r => r.name)
  );

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    db.exec(sql);
    db.prepare('INSERT INTO migrations (name) VALUES (?)').run(file);
    console.log(`Migration applied: ${file}`);
  }
}

module.exports = { getDb };
