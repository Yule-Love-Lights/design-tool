import Fastify from "fastify";
import cookie from "@fastify/cookie";
import session from "@fastify/session";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { mkdirSync, existsSync } from "node:fs";
import { authRoutes, requireAuth } from "./routes/auth.js";
import { clientRoutes } from "./routes/clients.js";
import { projectRoutes } from "./routes/projects.js";
import { designRoutes } from "./routes/designs.js";
import { photoRoutes } from "./routes/photos.js";
import { uploadRoutes } from "./routes/uploads.js";
import { settingsRoutes } from "./routes/settings.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);
const APP_PASSWORD = process.env.APP_PASSWORD;
const SESSION_SECRET =
  process.env.SESSION_SECRET ?? "dev-secret-change-in-prod-at-least-32-chars-ok";

if (!APP_PASSWORD) {
  console.error("APP_PASSWORD env var is required");
  process.exit(1);
}

const PHOTO_DIR = resolve(process.env.PHOTO_DIR ?? "data/photos");
mkdirSync(PHOTO_DIR, { recursive: true });

const app = Fastify({ logger: true, bodyLimit: 50 * 1024 * 1024 });

await app.register(cookie);
await app.register(session, {
  secret: SESSION_SECRET,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  },
});
await app.register(multipart, {
  limits: { fileSize: 25 * 1024 * 1024 },
});

await app.register(fastifyStatic, {
  root: PHOTO_DIR,
  prefix: "/photos/",
  decorateReply: false,
});

await authRoutes(app, { password: APP_PASSWORD });
await app.register(async (api) => {
  api.addHook("preHandler", requireAuth);
  await clientRoutes(api);
  await projectRoutes(api);
  await designRoutes(api);
  await photoRoutes(api, { photoDir: PHOTO_DIR });
  await uploadRoutes(api, { photoDir: PHOTO_DIR });
  await settingsRoutes(api);
});

const CLIENT_DIST = join(__dirname, "..", "..", "client", "dist");
if (existsSync(CLIENT_DIST)) {
  await app.register(fastifyStatic, {
    root: CLIENT_DIST,
    prefix: "/",
    decorateReply: false,
    wildcard: false,
  });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith("/api/") || req.url.startsWith("/photos/")) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    reply.type("text/html").sendFile("index.html");
  });
}

await app.listen({ host: "0.0.0.0", port: PORT });
