import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const DB_PATH = process.env.DB_PATH ?? "data/app.db";
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

// ---- Clients → Projects → Designs hierarchy ----
// Dashboard lists Clients. Each Client has 0+ Projects. Each Project has
// unlimited Designs (a Design = one photo + its light-overlay scene).
// Cascade deletes: removing a client wipes its projects + designs; removing
// a project wipes its designs.

db.exec(`
  CREATE TABLE IF NOT EXISTS clients (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    email       TEXT,
    address     TEXT,
    phone       TEXT,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id          TEXT PRIMARY KEY,
    client_id   TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
  );
`);

// One-time migration: the pre-clients schema had a `designs` table without a
// `project_id` column. Jason opted to discard those throwaway test designs, so
// if we detect the old shape we drop the table and let the CREATE below
// rebuild it under the new hierarchy. (Orphaned photo files on disk are
// harmless and left as-is.)
{
  const cols = db.prepare("PRAGMA table_info(designs)").all() as { name: string }[];
  const designsExists = cols.length > 0;
  const hasProjectId = cols.some((c) => c.name === "project_id");
  if (designsExists && !hasProjectId) {
    db.exec("DROP TABLE designs");
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS designs (
    id           TEXT PRIMARY KEY,
    project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
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

db.exec("CREATE INDEX IF NOT EXISTS idx_projects_client ON projects(client_id)");
db.exec("CREATE INDEX IF NOT EXISTS idx_designs_project ON designs(project_id)");

// Tiny key/value bag for app-wide settings (color palette, per-type defaults,
// custom-upload library).
db.exec(`
  CREATE TABLE IF NOT EXISTS app_settings (
    key    TEXT PRIMARY KEY,
    value  TEXT NOT NULL
  );
`);

// Normalize old scene shape: { strands: [...] } → { items: [...] } with kind
// tags. Idempotent; runs over whatever designs survive (none, after a fresh
// migration, but kept so re-imported/older scenes stay safe).
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

export type ClientRow = {
  id: string;
  name: string;
  email: string | null;
  address: string | null;
  phone: string | null;
  created_at: number;
  updated_at: number;
};

export type ProjectRow = {
  id: string;
  client_id: string;
  name: string;
  created_at: number;
  updated_at: number;
};

export type DesignRow = {
  id: string;
  project_id: string;
  name: string;
  photo_path: string | null;
  photo_w: number | null;
  photo_h: number | null;
  background: string | null;
  scene: string;
  created_at: number;
  updated_at: number;
};
