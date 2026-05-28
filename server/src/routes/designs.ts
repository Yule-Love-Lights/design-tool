import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { db, type DesignRow } from "../db.js";

// Convert an old-style scene (with `strands[]`) to the new shape (`items[]` with kind tags)
// so the client never has to know the legacy format existed.
function normalizeScene(raw: string): {
  yardsticks: unknown[];
  items: unknown[];
  brightness?: number;
} {
  let s: Record<string, unknown>;
  try {
    s = JSON.parse(raw);
  } catch {
    return { yardsticks: [], items: [] };
  }
  const yardsticks = Array.isArray(s.yardsticks) ? s.yardsticks : [];
  let items: unknown[];
  if (Array.isArray(s.items)) {
    items = s.items;
  } else if (Array.isArray(s.strands)) {
    items = (s.strands as Record<string, unknown>[]).map((st) => ({
      ...st,
      kind: "strand",
    }));
  } else {
    items = [];
  }
  const out: { yardsticks: unknown[]; items: unknown[]; brightness?: number } = {
    yardsticks,
    items,
  };
  if (typeof s.brightness === "number") out.brightness = s.brightness;
  return out;
}

function toDesign(row: DesignRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    photoUrl: row.photo_path ? `/photos/${row.photo_path}` : null,
    photoW: row.photo_w,
    photoH: row.photo_h,
    background: row.background,
    scene: normalizeScene(row.scene),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Lightweight design row for the project page's tab strip — no scene blob.
// Exported for projectRoutes to reuse.
export function toDesignSummary(row: DesignRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    photoUrl: row.photo_path ? `/photos/${row.photo_path}` : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function designRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>("/api/designs/:id", async (req, reply) => {
    const row = db
      .prepare(`SELECT * FROM designs WHERE id = ?`)
      .get(req.params.id) as DesignRow | undefined;
    if (!row) {
      reply.code(404);
      return { error: "not_found" };
    }
    return toDesign(row);
  });

  // Designs are always created inside a project now.
  app.post<{ Body: { projectId?: string; name?: string } }>("/api/designs", async (req, reply) => {
    const projectId = req.body?.projectId;
    if (!projectId) {
      reply.code(400);
      return { error: "project_required" };
    }
    const project = db.prepare("SELECT client_id FROM projects WHERE id = ?").get(projectId) as
      | { client_id: string }
      | undefined;
    if (!project) {
      reply.code(404);
      return { error: "project_not_found" };
    }
    const id = nanoid(10);
    const now = Date.now();
    const name = (req.body?.name ?? "").trim() || "Untitled Design";
    db.prepare(
      `INSERT INTO designs (id, project_id, name, scene, created_at, updated_at)
       VALUES (?, ?, ?, '{"yardsticks":[],"items":[]}', ?, ?)`,
    ).run(id, projectId, name, now, now);
    // Touch the client so the dashboard's recent-activity sort reflects this.
    db.prepare("UPDATE clients SET updated_at = ? WHERE id = ?").run(now, project.client_id);
    return toDesign(
      db.prepare(`SELECT * FROM designs WHERE id = ?`).get(id) as DesignRow,
    );
  });

  app.patch<{
    Params: { id: string };
    Body: {
      name?: string;
      background?: string | null;
      scene?: unknown;
      photoPath?: string | null;
      photoW?: number | null;
      photoH?: number | null;
    };
  }>("/api/designs/:id", async (req, reply) => {
    const row = db
      .prepare(`SELECT * FROM designs WHERE id = ?`)
      .get(req.params.id) as DesignRow | undefined;
    if (!row) {
      reply.code(404);
      return { error: "not_found" };
    }
    const next = {
      name: req.body.name ?? row.name,
      background:
        req.body.background === undefined ? row.background : req.body.background,
      scene:
        req.body.scene === undefined ? row.scene : JSON.stringify(req.body.scene),
      photo_path:
        req.body.photoPath === undefined ? row.photo_path : req.body.photoPath,
      photo_w: req.body.photoW === undefined ? row.photo_w : req.body.photoW,
      photo_h: req.body.photoH === undefined ? row.photo_h : req.body.photoH,
    };
    db.prepare(
      `UPDATE designs SET name=?, background=?, scene=?, photo_path=?, photo_w=?, photo_h=?, updated_at=?
       WHERE id=?`,
    ).run(
      next.name,
      next.background,
      next.scene,
      next.photo_path,
      next.photo_w,
      next.photo_h,
      Date.now(),
      req.params.id,
    );
    const updated = db
      .prepare(`SELECT * FROM designs WHERE id = ?`)
      .get(req.params.id) as DesignRow;
    return toDesign(updated);
  });

  app.delete<{ Params: { id: string } }>(
    "/api/designs/:id",
    async (req) => {
      db.prepare(`DELETE FROM designs WHERE id = ?`).run(req.params.id);
      return { ok: true };
    },
  );
}
