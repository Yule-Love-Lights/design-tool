import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const DB_PATH = process.env.DB_PATH ?? "data/app.db";
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS designs (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    photo_path   TEXT,
    photo_w      INTEGER,
    photo_h      INTEGER,
    background   TEXT,
    scene        TEXT NOT NULL DEFAULT '{"yardsticks":[],"items":[]}',
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
  );
`);

// Tiny key/value bag for app-wide settings (color palette today; more later).
db.exec(`
  CREATE TABLE IF NOT EXISTS app_settings (
    key    TEXT PRIMARY KEY,
    value  TEXT NOT NULL
  );
`);

// Normalize old scene shape: { strands: [...] } → { items: [...] } with kind tags.
// Run once at boot; idempotent.
const allDesigns = db
  .prepare("SELECT id, scene FROM designs")
  .all() as { id: string; scene: string }[];
const updateStmt = db.prepare("UPDATE designs SET scene = ? WHERE id = ?");
for (const row of allDesigns) {
  try {
    const s = JSON.parse(row.scene);
    if (Array.isArray(s.items)) continue; // already migrated
    const items = (s.strands || []).map((st: Record<string, unknown>) => ({
      ...st,
      kind: "strand",
    }));
    const next = { ...s, items };
    delete (next as { strands?: unknown }).strands;
    updateStmt.run(JSON.stringify(next), row.id);
  } catch {
    // Skip malformed rows — they'd already be unrecoverable.
  }
}

export type DesignRow = {
  id: string;
  name: string;
  photo_path: string | null;
  photo_w: number | null;
  photo_h: number | null;
  background: string | null;
  scene: string;
  created_at: number;
  updated_at: number;
};
