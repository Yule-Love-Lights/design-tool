import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { db, type ClientRow, type ProjectRow } from "../db.js";

// A client plus its projects, shaped for the dashboard (which lists every
// client with their projects nested underneath). Designs are NOT included
// here — the project page fetches those on demand.
function toClient(row: ClientRow, projects: ProjectRow[]) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    address: row.address,
    phone: row.phone,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    projects: projects.map(toProject),
  };
}

function toProject(row: ProjectRow) {
  return {
    id: row.id,
    clientId: row.client_id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function clientRoutes(app: FastifyInstance) {
  // Dashboard payload: every client with their projects nested. Sorted by
  // most-recent-activity (updated_at desc) so freshly-touched clients float up;
  // the client can re-sort/search in the browser.
  app.get("/api/clients", async () => {
    const clients = db
      .prepare("SELECT * FROM clients ORDER BY updated_at DESC")
      .all() as ClientRow[];
    const projects = db
      .prepare("SELECT * FROM projects ORDER BY created_at ASC")
      .all() as ProjectRow[];
    const byClient = new Map<string, ProjectRow[]>();
    for (const p of projects) {
      const list = byClient.get(p.client_id) ?? [];
      list.push(p);
      byClient.set(p.client_id, list);
    }
    return clients.map((c) => toClient(c, byClient.get(c.id) ?? []));
  });

  app.post<{
    Body: { name?: string; email?: string; address?: string; phone?: string };
  }>("/api/clients", async (req, reply) => {
    const name = (req.body?.name ?? "").trim();
    if (!name) {
      reply.code(400);
      return { error: "name_required" };
    }
    const id = nanoid(10);
    const now = Date.now();
    db.prepare(
      `INSERT INTO clients (id, name, email, address, phone, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      name,
      req.body.email?.trim() || null,
      req.body.address?.trim() || null,
      req.body.phone?.trim() || null,
      now,
      now,
    );
    const row = db.prepare("SELECT * FROM clients WHERE id = ?").get(id) as ClientRow;
    return toClient(row, []);
  });

  app.patch<{
    Params: { id: string };
    Body: { name?: string; email?: string | null; address?: string | null; phone?: string | null };
  }>("/api/clients/:id", async (req, reply) => {
    const row = db.prepare("SELECT * FROM clients WHERE id = ?").get(req.params.id) as
      | ClientRow
      | undefined;
    if (!row) {
      reply.code(404);
      return { error: "not_found" };
    }
    const name = req.body.name === undefined ? row.name : req.body.name.trim() || row.name;
    const email = req.body.email === undefined ? row.email : (req.body.email?.trim() || null);
    const address = req.body.address === undefined ? row.address : (req.body.address?.trim() || null);
    const phone = req.body.phone === undefined ? row.phone : (req.body.phone?.trim() || null);
    db.prepare(
      `UPDATE clients SET name=?, email=?, address=?, phone=?, updated_at=? WHERE id=?`,
    ).run(name, email, address, phone, Date.now(), req.params.id);
    const updated = db.prepare("SELECT * FROM clients WHERE id = ?").get(req.params.id) as ClientRow;
    const projects = db
      .prepare("SELECT * FROM projects WHERE client_id = ? ORDER BY created_at ASC")
      .all(req.params.id) as ProjectRow[];
    return toClient(updated, projects);
  });

  // Cascades to projects + designs via ON DELETE CASCADE.
  app.delete<{ Params: { id: string } }>("/api/clients/:id", async (req) => {
    db.prepare("DELETE FROM clients WHERE id = ?").run(req.params.id);
    return { ok: true };
  });
}
