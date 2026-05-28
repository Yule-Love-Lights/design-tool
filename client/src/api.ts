export type Yardstick = {
  id: string;
  realFeet: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BulbType = "c9" | "mini" | "permanent" | "bistro";
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
  // Permanent-light-only props (ignored for c9 / mini / bistro).
  beamLengthFt?: number;
  beamWidthFt?: number;
  distanceToSurfaceFt?: number;
  opacity?: number;
  showCoverage?: boolean;
  // Bistro-only: catenary sag amount as a fraction of the horizontal span
  // length. 0 = taut chord, 0.10 = typical real-world droop, 0.25 = heavy.
  // Ignored for non-bistro strands.
  sagFactor?: number;
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

// A spritzer is a procedurally rendered radial "spray" of light rays — many
// thin colored beams emanating from a center point, each with a glowing bulb
// at its tip, plus a halo and bright center cluster. Sits at (x, y) (its
// center) and scales by `sizeIn` (real-world diameter). Color cycles through
// `colorPattern` per ray, so 1-color = monochrome spray, multi-color =
// rainbow spray (like fireworks).
export type SpritzerItem = ItemBase & {
  kind: "spritzer";
  x: number;
  y: number;
  sizeIn: number; // 16 / 24 / 36 / 48
  colorPattern: string[];
};

// A text item is lit-up letters layered on the photo. Sits at (x, y) (its
// center), rendered in `fontFamily` at `sizeIn` real-world height (defaults
// to 60" — matches the biggest wreath). `outline` adds a contrasting stroke
// around each letter; the glow color comes from `colorId`'s palette entry.
// Text sits above the brightness tint layer so it stays visible when the
// photo is darkened — that's the whole point of the lit-up look.
export type TextItem = ItemBase & {
  kind: "text";
  x: number;
  y: number;
  text: string;
  fontFamily: string; // one of the FONT_OPTIONS in editor/text.ts
  sizeIn: number;     // real-world cap height in inches
  rotation?: number;
  colorId: string;
  outline?: boolean;
};

// A user-uploaded graphic placed on the photo. `imagePath` is the on-disk
// filename returned by /api/uploads — stored on the item directly (not via
// upload id) so a scene survives the user removing the graphic from their
// library: the file stays on disk and the placed item keeps rendering.
//
// `widthIn` is the rendered real-world width in inches; height is derived
// from the image's natural aspect at render time. Resized via the Transformer
// (no preset size buttons — user uploads vary too widely to enumerate).
//
// `autoHalo` adds a wide blurred copy underneath the image with a lighten
// composite, giving a glow around bright pixels — useful for lit-up signs
// or decorations, awkward for opaque photos, hence per-item toggle.
export type CustomItem = ItemBase & {
  kind: "custom";
  x: number;
  y: number;
  imagePath: string;
  widthIn: number;
  rotation?: number;
  flipH?: boolean;
  flipV?: boolean;
  autoHalo?: boolean;
};

// A pole is a vertical support for bistro lights. `x, y` is the base on the
// ground; the pole extends upward by `heightIn × pxPerFoot`. `baseType`
// picks the planter/weight at the bottom: "none" for permanent in-ground
// installs or supports attached to existing structure, "cube" for the wooden
// box base, "barrel" for the round wine-barrel-style base. No rotation —
// poles are always vertical.
export type PoleItem = ItemBase & {
  kind: "pole";
  x: number;
  y: number;
  heightIn: number; // 96 / 120 / 144 / 180 typical (8 / 10 / 12 / 15 ft)
  baseType: "none" | "cube" | "barrel";
};

export type SceneItem = StrandItem | WreathItem | BowItem | GarlandItem | SpritzerItem | TextItem | CustomItem | PoleItem;

// One entry in the user's custom-graphic library (persisted server-side under
// app_settings.user_uploads). Designs reference these by `path` so library
// deletes don't break placed items.
export type CustomUpload = {
  id: string;
  filename: string;
  path: string;
  url: string;
  uploadedAt: number;
};

// Convenience alias kept so older imports keep working.
export type Strand = StrandItem;

export type Scene = {
  yardsticks: Yardstick[];
  items: SceneItem[];
  brightness?: number; // 0 = darkest (night), 50 = neutral, 100 = lightest
};

export type Design = {
  id: string;
  projectId: string;
  name: string;
  photoUrl: string | null;
  photoW: number | null;
  photoH: number | null;
  background: string | null;
  scene: Scene;
  createdAt: number;
  updatedAt: number;
};

// Lightweight design row for the project page's tab strip (no scene blob).
export type DesignSummary = {
  id: string;
  projectId: string;
  name: string;
  photoUrl: string | null;
  createdAt: number;
  updatedAt: number;
};

// ----- Clients → Projects → Designs hierarchy -----
export type Project = {
  id: string;
  clientId: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};

export type Client = {
  id: string;
  name: string;
  email: string | null;
  address: string | null;
  phone: string | null;
  createdAt: number;
  updatedAt: number;
  projects: Project[]; // nested for the dashboard
};

// Project page payload: the project + its client (breadcrumb) + design tabs.
export type ProjectView = {
  project: Project;
  client: { id: string; name: string; email: string | null; address: string | null; phone: string | null } | null;
  designs: DesignSummary[];
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
  // ----- Clients -----
  async listClients() {
    return req<Client[]>("/api/clients");
  },
  async createClient(input: { name: string; email?: string; address?: string; phone?: string }) {
    return req<Client>("/api/clients", { method: "POST", body: JSON.stringify(input) });
  },
  async updateClient(
    id: string,
    patch: Partial<{ name: string; email: string | null; address: string | null; phone: string | null }>,
  ) {
    return req<Client>(`/api/clients/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
  },
  async deleteClient(id: string) {
    return req<{ ok: true }>(`/api/clients/${id}`, { method: "DELETE" });
  },
  // ----- Projects -----
  async getProject(id: string) {
    return req<ProjectView>(`/api/projects/${id}`);
  },
  async createProject(clientId: string, name: string) {
    return req<Project>("/api/projects", { method: "POST", body: JSON.stringify({ clientId, name }) });
  },
  async updateProject(id: string, name: string) {
    return req<Project>(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify({ name }) });
  },
  async deleteProject(id: string) {
    return req<{ ok: true }>(`/api/projects/${id}`, { method: "DELETE" });
  },
  // ----- Designs -----
  async getDesign(id: string) {
    return req<Design>(`/api/designs/${id}`);
  },
  async createDesign(projectId: string, name: string) {
    return req<Design>("/api/designs", {
      method: "POST",
      body: JSON.stringify({ projectId, name }),
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
  async listUploads() {
    return req<CustomUpload[]>("/api/uploads");
  },
  async createUpload(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/uploads", {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    if (!res.ok) throw new Error("upload_failed");
    return res.json() as Promise<CustomUpload>;
  },
  async deleteUpload(id: string) {
    return req<{ ok: true }>(`/api/uploads/${id}`, { method: "DELETE" });
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
export function isSpritzer(item: SceneItem): item is SpritzerItem {
  return item.kind === "spritzer";
}
export function isText(item: SceneItem): item is TextItem {
  return item.kind === "text";
}
export function isCustom(item: SceneItem): item is CustomItem {
  return item.kind === "custom";
}
export function isPole(item: SceneItem): item is PoleItem {
  return item.kind === "pole";
}
