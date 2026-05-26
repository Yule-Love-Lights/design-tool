export type Yardstick = {
  id: string;
  realFeet: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BulbType = "c9" | "mini" | "permanent";
export type DrawingStyle = "strand" | "trace" | "single";

// ----- Items -----
// Every drawable thing on a Design's scene lives in `scene.items[]` as a
// discriminated union. New item types (decor, text, custom, …) get added
// here as new variants without touching the strand code.

export type ItemBase = {
  id: string;
  yardstickId: string | null;
};

export type StrandItem = ItemBase & {
  kind: "strand";
  bulbType: BulbType;
  spacingIn: number;
  drawingStyle: DrawingStyle;
  colorPattern: string[];
  points: number[];
  // Permanent-light-only props (ignored for c9 / mini).
  beamLengthFt?: number;
  beamWidthFt?: number;
  distanceToSurfaceFt?: number;
  opacity?: number;
  showCoverage?: boolean;
};

// A wreath sits at (x, y) (its center) and renders as a green ring of greenery
// scaled to `sizeIn` (real-world diameter in inches). Optional ring of light
// bulbs around the perimeter when `withLights` is true.
export type WreathItem = ItemBase & {
  kind: "wreath";
  x: number;
  y: number;
  sizeIn: number; // 24 / 36 / 48 / 60
  withLights: boolean;
  withBow?: boolean; // defaults to true if undefined (back-compat for older designs)
  colorId?: string;   // legacy — no longer used; kept for back-compat
  rotation?: number;
};

// A bow sits at (x, y) (its center) and renders as a fixed image scaled to
// `sizeIn` (real-world width in inches). One asset variant for now.
export type BowItem = ItemBase & {
  kind: "bow";
  x: number;
  y: number;
  sizeIn: number; // 12 / 18 / 24 / 36 / 48
  rotation?: number;
};

// A garland is a strand-like polyline that gets the chosen garland PNG stamped
// along its length, rotated to the local tangent. No spacing setting (it's
// continuous greenery rope, not discrete bulbs); no color picker (the lights
// are baked into the with-lights asset variant).
//
// `sizeIn` is the rendered thickness of the greenery rope, in inches of
// real-world space. Older garlands without this field fall back to ~9.6"
// (the previous global default) so they don't suddenly change appearance.
export type GarlandItem = ItemBase & {
  kind: "garland";
  points: number[];
  drawingStyle: DrawingStyle;
  withLights: boolean;
  sizeIn?: number; // 6 / 9 / 12 / 18 / 24
};

export type SceneItem = StrandItem | WreathItem | BowItem | GarlandItem;

// Convenience alias kept so older imports keep working.
export type Strand = StrandItem;

export type Scene = {
  yardsticks: Yardstick[];
  items: SceneItem[];
  brightness?: number; // 0 = darkest (night), 50 = neutral, 100 = lightest
};

export type Design = {
  id: string;
  name: string;
  photoUrl: string | null;
  photoW: number | null;
  photoH: number | null;
  background: string | null;
  scene: Scene;
  createdAt: number;
  updatedAt: number;
};

// ----- Color palette (editable, persisted server-side) -----
export type BulbColor = {
  id: string;
  label: string;
  hex: string;
  glow: string;
  builtin?: boolean;
};

// ----- Per-item-type tool defaults (editable in Settings) -----
// Keyed by item type identifier. For strands today the key is the BulbType
// (`c9`, `mini`, `permanent`). New item kinds (`wreath`, `garland`, …) get
// their own key with their own field set.
export type ToolDefaults = Record<string, Record<string, unknown>>;

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  // Only attach a JSON Content-Type when we actually have a body. Sending
  // `Content-Type: application/json` with an empty body (as DELETE/GET used to)
  // makes Fastify's JSON parser fail with 400 Bad Request.
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string> ?? {}) };
  if (init?.body !== undefined && init.body !== null) {
    headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
  }
  const res = await fetch(path, {
    credentials: "include",
    ...init,
    headers,
  });
  if (!res.ok) {
    if (res.status === 401) {
      window.dispatchEvent(new CustomEvent("auth:expired"));
    }
    throw new Error(`${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  async session() {
    return req<{ authed: boolean }>("/api/session");
  },
  async login(password: string) {
    const res = await fetch("/api/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    return res.ok;
  },
  async logout() {
    await fetch("/api/logout", { method: "POST", credentials: "include" });
  },
  async listDesigns() {
    return req<Design[]>("/api/designs");
  },
  async getDesign(id: string) {
    return req<Design>(`/api/designs/${id}`);
  },
  async createDesign(name: string) {
    return req<Design>("/api/designs", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  },
  async updateDesign(
    id: string,
    patch: Partial<{
      name: string;
      background: string | null;
      scene: Scene;
      photoPath: string | null;
      photoW: number | null;
      photoH: number | null;
    }>,
  ) {
    return req<Design>(`/api/designs/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  },
  async deleteDesign(id: string) {
    return req<{ ok: true }>(`/api/designs/${id}`, { method: "DELETE" });
  },
  async uploadPhoto(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/photos", {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    if (!res.ok) throw new Error("upload_failed");
    return res.json() as Promise<{ path: string; url: string }>;
  },
  async getColors() {
    return req<BulbColor[]>("/api/settings/colors");
  },
  async setColors(colors: BulbColor[]) {
    return req<{ ok: true }>("/api/settings/colors", {
      method: "PUT",
      body: JSON.stringify({ colors }),
    });
  },
  async getDefaults() {
    return req<ToolDefaults>("/api/settings/defaults");
  },
  async setDefaults(defaults: ToolDefaults) {
    return req<{ ok: true }>("/api/settings/defaults", {
      method: "PUT",
      body: JSON.stringify({ defaults }),
    });
  },
};

// Type guards used throughout the editor.
export function isStrand(item: SceneItem): item is StrandItem {
  return item.kind === "strand";
}
export function isWreath(item: SceneItem): item is WreathItem {
  return item.kind === "wreath";
}
export function isBow(item: SceneItem): item is BowItem {
  return item.kind === "bow";
}
export function isGarland(item: SceneItem): item is GarlandItem {
  return item.kind === "garland";
}
