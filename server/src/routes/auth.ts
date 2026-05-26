import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { timingSafeEqual } from "node:crypto";

declare module "fastify" {
  interface Session {
    authed?: boolean;
  }
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  if (!req.session.authed) {
    reply.code(401).send({ error: "unauthorized" });
  }
}

export async function authRoutes(
  app: FastifyInstance,
  opts: { password: string },
) {
  app.post<{ Body: { password?: string } }>("/api/login", async (req, reply) => {
    const supplied = req.body?.password ?? "";
    if (!safeEqual(supplied, opts.password)) {
      reply.code(401);
      return { ok: false };
    }
    req.session.authed = true;
    return { ok: true };
  });

  app.post("/api/logout", async (req) => {
    await req.session.destroy();
    return { ok: true };
  });

  app.get("/api/session", async (req) => {
    return { authed: !!req.session.authed };
  });
}
