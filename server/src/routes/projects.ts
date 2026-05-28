import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { db, type ClientRow, type ProjectRow, type DesignRow } from "../db.js";
import { toDesignSummary } from "./designs.js";

function toProject(row: ProjectRow) {
  return {
    id: row.id,
    clientId: row.client_id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function projectRoutes(app: FastifyInstance) {
  // Project page payload: the project, its parent client (for the breadcrumb),
  // and its designs (for the tabs). Designs returned as lightweight summaries
  // (no scene blob) — the editor fetches the full design when a tab opens.
  app.get<{ Params: { id: string } }>("/api/projects/:id", async (req, reply) => {
    const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id) as
      | ProjectRow
      | undefined;
    if (!project) {
      reply.code(404);
      return { error: "not_found" };
    }
    const client = db.prepare("SELECT * FROM clients WHERE id = ?").get(project.client_id) as
      | ClientRow
      | undefined;
    const designs = db
      .prepare("SELECT * FROM designs WHERE project_id = ? ORDER BY created_at ASC")
      .all(req.params.id) as DesignRow[];
    return {
      project: toProject(project),
      client: client
        ? { id: client.id, name: client.name, email: client.email, address: client.address, phone: client.phone }
        : null,
      designs: designs.map(toDesignSummary),
    };
  });

  app.post<{ Body: { clientId?: string; name?: string } }>(
    "/api/projects",
    async (req, reply) => {
      const clientId = req.body?.clientId;
      const name = (req.body?.name ?? "").trim();
      if (!clientId || !name) {
        reply.code(400);
        return { error: "client_and_name_required" };
      }
      const client = db.prepare("SELECT id FROM clients WHERE id = ?").get(clientId);
      if (!client) {
        reply.code(404);
        return { error: "client_not_found" };
      }
      const id = nanoid(10);
      const now = Date.now();
      db.prepare(
        `INSERT INTO projects (id, client_id, name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(id, clientId, name, now, now);
      // Touch the client so it floats to the top of the recent-activity sort.
      db.prepare("UPDATE clients SET updated_at = ? WHERE id = ?").run(now, clientId);
      const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as ProjectRow;
      return toProject(row);
    },
  );

  app.patch<{ Params: { id: string }; Body: { name?: string } }>(
    "/api/projects/:id",
    async (req, reply) => {
      const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id) as
        | ProjectRow
        | undefined;
      if (!row) {
        reply.code(404);
        return { error: "not_found" };
      }
      const name = req.body.name === undefined ? row.name : req.body.name.trim() || row.name;
      db.prepare("UPDATE projects SET name=?, updated_at=? WHERE id=?").run(
        name,
        Date.now(),
        req.params.id,
      );
      const updated = db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id) as ProjectRow;
      return toProject(updated);
    },
  );

  // Cascades to designs via ON DELETE CASCADE.
  app.delete<{ Params: { id: string } }>("/api/projects/:id", async (req) => {
    db.prepare("DELETE FROM projects WHERE id = ?").run(req.params.id);
    return { ok: true };
  });
}
