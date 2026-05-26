import type { FastifyInstance } from "fastify";
import { db } from "../db.js";

// The factory-default palette. Used the first time the app starts and as
// the target of the "reset palette" button on the client.
const DEFAULT_COLORS = [
  { id: "warm-white", label: "Warm White", hex: "#ffdca8", glow: "#fff2d4", builtin: true },
  { id: "cool-white", label: "Cool White", hex: "#e0eaff", glow: "#ffffff", builtin: true },
  { id: "red",        label: "Red",        hex: "#ff2a2a", glow: "#ff6a6a", builtin: true },
  { id: "green",      label: "Green",      hex: "#1aff6f", glow: "#6affac", builtin: true },
  { id: "blue",       label: "Blue",       hex: "#3a7bff", glow: "#7faaff", builtin: true },
  { id: "orange",     label: "Orange",     hex: "#ff8a1f", glow: "#ffb766", builtin: true },
  { id: "yellow",     label: "Yellow",     hex: "#ffe61f", glow: "#fff080", builtin: true },
  { id: "pink",       label: "Pink",       hex: "#ff44b1", glow: "#ff85cf", builtin: true },
  { id: "purple",     label: "Purple",     hex: "#a042ff", glow: "#c585ff", builtin: true },
  { id: "teal",       label: "Teal",       hex: "#26e6c8", glow: "#6cf2dd", builtin: true },
];

type BulbColor = (typeof DEFAULT_COLORS)[number] & { builtin?: boolean };

function readColors(): BulbColor[] {
  const row = db
    .prepare("SELECT value FROM app_settings WHERE key = 'colors'")
    .get() as { value: string } | undefined;
  if (!row) return DEFAULT_COLORS;
  try {
    const parsed = JSON.parse(row.value);
    if (!Array.isArray(parsed)) return DEFAULT_COLORS;
    return parsed as BulbColor[];
  } catch {
    return DEFAULT_COLORS;
  }
}

function writeColors(colors: BulbColor[]): void {
  db.prepare(
    "INSERT INTO app_settings (key, value) VALUES ('colors', ?)\n       ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(JSON.stringify(colors));
}

// Factory-default per-type tool settings. These get returned when the user
// hasn't customized defaults yet; they also seed the "Reset to defaults" buttons.
export const DEFAULT_TOOL_DEFAULTS = {
  c9: {
    spacingIn: 12,
    drawingStyle: "strand" as const,
    colorPattern: ["warm-white"],
  },
  mini: {
    spacingIn: 6,
    drawingStyle: "strand" as const,
    colorPattern: ["warm-white"],
  },
  permanent: {
    spacingIn: 8,
    drawingStyle: "strand" as const,
    colorPattern: ["warm-white"],
    beamLengthFt: 4,
    beamWidthFt: 1.7,
    distanceToSurfaceFt: 0,
    opacity: 1,
    showCoverage: false,
  },
  wreath: {
    sizeIn: 36,
    withLights: true,
    withBow: true,
    colorPattern: ["warm-white"],
  },
  bow: {
    sizeIn: 24,
  },
};

type ToolDefaults = Record<string, Record<string, unknown>>;

function readDefaults(): ToolDefaults {
  const row = db
    .prepare("SELECT value FROM app_settings WHERE key = 'defaults'")
    .get() as { value: string } | undefined;
  if (!row) return DEFAULT_TOOL_DEFAULTS;
  try {
    const parsed = JSON.parse(row.value);
    if (!parsed || typeof parsed !== "object") return DEFAULT_TOOL_DEFAULTS;
    // Merge with the factory defaults so new fields appear automatically as we
    // add them in code, without forcing users to reset.
    return mergeDefaults(DEFAULT_TOOL_DEFAULTS as ToolDefaults, parsed as ToolDefaults);
  } catch {
    return DEFAULT_TOOL_DEFAULTS;
  }
}

function mergeDefaults(base: ToolDefaults, override: ToolDefaults): ToolDefaults {
  const out: ToolDefaults = {};
  for (const key of new Set([...Object.keys(base), ...Object.keys(override)])) {
    out[key] = { ...(base[key] ?? {}), ...(override[key] ?? {}) };
  }
  return out;
}

function writeDefaults(d: ToolDefaults): void {
  db.prepare(
    "INSERT INTO app_settings (key, value) VALUES ('defaults', ?)\n       ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(JSON.stringify(d));
}

export async function settingsRoutes(app: FastifyInstance) {
  app.get("/api/settings/colors", async () => {
    return readColors();
  });

  app.put<{ Body: { colors?: BulbColor[] } }>(
    "/api/settings/colors",
    async (req, reply) => {
      const colors = req.body?.colors;
      if (!Array.isArray(colors) || colors.length === 0) {
        reply.code(400);
        return { error: "colors_required" };
      }
      // Light validation — every entry needs id + hex.
      for (const c of colors) {
        if (!c || typeof c.id !== "string" || typeof c.hex !== "string") {
          reply.code(400);
          return { error: "bad_color" };
        }
      }
      writeColors(colors);
      return { ok: true };
    },
  );

  app.get("/api/settings/defaults", async () => {
    return readDefaults();
  });

  app.put<{ Body: { defaults?: ToolDefaults } }>(
    "/api/settings/defaults",
    async (req, reply) => {
      const d = req.body?.defaults;
      if (!d || typeof d !== "object") {
        reply.code(400);
        return { error: "defaults_required" };
      }
      writeDefaults(d);
      return { ok: true };
    },
  );
}

export const FALLBACK_COLORS = DEFAULT_COLORS;
