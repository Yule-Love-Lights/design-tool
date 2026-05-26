import type { FastifyInstance } from "fastify";
import { createWriteStream } from "node:fs";
import { join, extname } from "node:path";
import { pipeline } from "node:stream/promises";
import { nanoid } from "nanoid";

const ALLOWED = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic"]);

export async function photoRoutes(
  app: FastifyInstance,
  opts: { photoDir: string },
) {
  app.post("/api/photos", async (req, reply) => {
    const file = await req.file();
    if (!file) {
      reply.code(400);
      return { error: "no_file" };
    }
    const ext = extname(file.filename || "").toLowerCase() || ".jpg";
    if (!ALLOWED.has(ext)) {
      reply.code(400);
      return { error: "bad_extension" };
    }
    const stored = `${nanoid(12)}${ext}`;
    const dest = join(opts.photoDir, stored);
    await pipeline(file.file, createWriteStream(dest));
    return { path: stored, url: `/photos/${stored}` };
  });
}
