import type { FastifyInstance } from "fastify";
import { createWriteStream, unlink } from "node:fs";
import { join, extname } from "node:path";
import { pipeline } from "node:stream/promises";
import { nanoid } from "nanoid";
import { db } from "../db.js";

// File extensions accepted for custom-graphic uploads. Mirrors photoRoutes
// allowlist plus SVG (HHC accepts SVG; useful for vector logos).
const ALLOWED = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"]);

// One entry in the user's custom-graphic library. `path` is the on-disk
// filename (rooted at PHOTO_DIR, served at /photos/<path>); `url` is the
// browser-facing URL. We pre-compute it so the client doesn't have to.
type CustomUpload = {
  id: string;
  filename: string;     // original filename, shown in the library UI
  path: string;         // server-side relative path under PHOTO_DIR
  url: string;          // /photos/<path>
  uploadedAt: number;
};

function readUploads(): CustomUpload[] {
  const row = db
    .prepare("SELECT value FROM app_settings WHERE key = 'user_uploads'")
    .get() as { value: string } | undefined;
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.value);
    return Array.isArray(parsed) ? (parsed as CustomUpload[]) : [];
  } catch {
    return [];
  }
}

function writeUploads(list: CustomUpload[]): void {
  db.prepare(
    "INSERT INTO app_settings (key, value) VALUES ('user_uploads', ?)\n     ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(JSON.stringify(list));
}

export async function uploadRoutes(
  app: FastifyInstance,
  opts: { photoDir: string },
) {
  app.get("/api/uploads", async () => {
    // Newest first so freshly-uploaded graphics appear at the top of the library.
    const list = readUploads();
    return list.slice().sort((a, b) => b.uploadedAt - a.uploadedAt);
  });

  app.post("/api/uploads", async (req, reply) => {
    const file = await req.file();
    if (!file) {
      reply.code(400);
      return { error: "no_file" };
    }
    const ext = extname(file.filename || "").toLowerCase() || ".png";
    if (!ALLOWED.has(ext)) {
      reply.code(400);
      return { error: "bad_extension" };
    }
    const stored = `${nanoid(12)}${ext}`;
    const dest = join(opts.photoDir, stored);
    await pipeline(file.file, createWriteStream(dest));

    const entry: CustomUpload = {
      id: nanoid(10),
      filename: file.filename || stored,
      path: stored,
      url: `/photos/${stored}`,
      uploadedAt: Date.now(),
    };
    const list = readUploads();
    list.push(entry);
    writeUploads(list);
    return entry;
  });

  app.delete<{ Params: { id: string } }>("/api/uploads/:id", async (req, reply) => {
    const list = readUploads();
    const idx = list.findIndex((u) => u.id === req.params.id);
    if (idx === -1) {
      reply.code(404);
      return { error: "not_found" };
    }
    const removed = list[idx];
    list.splice(idx, 1);
    writeUploads(list);
    // Best-effort file delete. Designs that referenced this graphic by path
    // will end up showing a broken image, which is the same as if the file
    // were missing for any other reason — acceptable trade-off vs keeping
    // orphaned files around forever.
    unlink(join(opts.photoDir, removed.path), () => {});
    return { ok: true };
  });
}
