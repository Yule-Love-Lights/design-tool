import { api, type BulbColor, type ToolDefaults } from "../api";
import { COLORS, DEFAULT_COLORS, setPalette, suggestGlow } from "../editor/colors";

let palette: BulbColor[] = [];
let defaults: ToolDefaults = {};

// Factory defaults — kept in lockstep with server's DEFAULT_TOOL_DEFAULTS.
// The server already returns these merged-in, but we need them client-side too
// for the per-type "Reset" buttons.
const FACTORY_DEFAULTS: ToolDefaults = {
  c9: { spacingIn: 12, drawingStyle: "strand", colorPattern: ["warm-white"] },
  mini: { spacingIn: 6, drawingStyle: "strand", colorPattern: ["warm-white"] },
  permanent: {
    spacingIn: 8,
    drawingStyle: "strand",
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
  garland: {
    sizeIn: 12,
    withLights: true,
    drawingStyle: "strand",
  },
};

// Spec for what a section knows how to render for a given item-type key.
// Adding a new item type means adding a SECTION entry; rendering is data-driven.
type FieldSpec =
  | { key: string; label: string; kind: "spacing"; options: number[]; unit?: string }
  | { key: string; label: string; kind: "style"; options: string[] }
  | { key: string; label: string; kind: "color-pattern" }
  | { key: string; label: string; kind: "number"; min: number; max: number; step: number; unit?: string }
  | { key: string; label: string; kind: "bool" };

type SectionSpec = { key: string; label: string; fields: FieldSpec[] };

const SPACINGS_BY_TYPE: Record<string, number[]> = {
  c9: [6, 9, 12, 15, 18, 24, 36],
  mini: [4, 6, 9, 12, 18],
  permanent: [4, 6, 8, 9, 12, 15, 18, 24],
};

const SECTIONS: SectionSpec[] = [
  {
    key: "c9",
    label: "C9 Lights",
    fields: [
      { key: "spacingIn", label: "Default spacing", kind: "spacing", options: SPACINGS_BY_TYPE.c9, unit: "\"" },
      { key: "drawingStyle", label: "Default drawing style", kind: "style", options: ["strand", "trace", "single"] },
      { key: "colorPattern", label: "Default color", kind: "color-pattern" },
    ],
  },
  {
    key: "mini",
    label: "Mini Lights",
    fields: [
      { key: "spacingIn", label: "Default spacing", kind: "spacing", options: SPACINGS_BY_TYPE.mini, unit: "\"" },
      { key: "drawingStyle", label: "Default drawing style", kind: "style", options: ["strand", "trace", "single"] },
      { key: "colorPattern", label: "Default color", kind: "color-pattern" },
    ],
  },
  {
    key: "permanent",
    label: "Permanent Lights",
    fields: [
      { key: "spacingIn", label: "Default spacing", kind: "spacing", options: SPACINGS_BY_TYPE.permanent, unit: "\"" },
      { key: "drawingStyle", label: "Default drawing style", kind: "style", options: ["strand", "trace", "single"] },
      { key: "colorPattern", label: "Default color", kind: "color-pattern" },
      { key: "beamLengthFt", label: "Default beam length", kind: "number", min: 0.5, max: 12, step: 0.1, unit: " ft" },
      { key: "beamWidthFt", label: "Default beam width", kind: "number", min: 0.2, max: 6, step: 0.1, unit: " ft" },
      { key: "distanceToSurfaceFt", label: "Default distance to surface", kind: "number", min: 0, max: 5, step: 0.1, unit: " ft" },
      { key: "opacity", label: "Default opacity", kind: "number", min: 0.1, max: 1, step: 0.01 },
      { key: "showCoverage", label: "Show floor coverage by default", kind: "bool" },
    ],
  },
  {
    key: "wreath",
    label: "Wreaths",
    fields: [
      { key: "sizeIn", label: "Default size", kind: "spacing", options: [24, 36, 48, 60], unit: "\"" },
      { key: "withLights", label: "With lights by default", kind: "bool" },
      { key: "withBow", label: "Include bow by default", kind: "bool" },
    ],
  },
  {
    key: "bow",
    label: "Bows",
    fields: [
      { key: "sizeIn", label: "Default size", kind: "spacing", options: [12, 18, 24, 36, 48], unit: "\"" },
    ],
  },
  {
    key: "garland",
    label: "Garland",
    fields: [
      { key: "sizeIn", label: "Default size", kind: "spacing", options: [6, 9, 12, 18, 24], unit: "\"" },
      { key: "withLights", label: "With lights by default", kind: "bool" },
      { key: "drawingStyle", label: "Default drawing style", kind: "style", options: ["strand", "trace", "single"] },
    ],
  },
];

export async function renderSettings(root: HTMLElement) {
  root.innerHTML = `
    <div class="settings">
      <header>
        <button class="icon" id="back" title="Back to designs">←</button>
        <h1>Settings</h1>
      </header>
      <section class="card">
        <div class="card-head">
          <h2>Color Palette</h2>
          <div class="actions">
            <button id="reset-palette">Reset to defaults</button>
            <button id="add-color" class="primary">+ Add color</button>
          </div>
        </div>
        <p class="hint">
          These colors are available wherever you can pick a color (lights, spritzers, etc.).
          Changes persist across every project and design. Built-in colors can be edited but not deleted.
        </p>
        <div class="palette" id="palette">Loading…</div>
        <div class="saving" id="palette-status"></div>
      </section>

      <section class="card">
        <h2 style="margin:0 0 4px">Default Item Settings</h2>
        <p class="hint">
          These are the values applied automatically when you start drawing a new item.
          You can still tweak them per-strand in the editor — this only changes the starting point.
        </p>
        <div id="defaults-sections">Loading…</div>
        <div class="saving" id="defaults-status"></div>
      </section>
    </div>
  `;
  (root.querySelector("#back") as HTMLElement).addEventListener("click", () => {
    // Return to wherever the user came from (the editor, dashboard, etc).
    // history.back() pops the entry the Settings link pushed. If somehow
    // there's nothing to go back to (direct deep link), fall through to the dashboard.
    const before = window.location.hash;
    window.history.back();
    window.setTimeout(() => {
      if (window.location.hash === before) {
        window.location.hash = "#/";
      }
    }, 60);
  });

  // Load palette + defaults in parallel.
  await Promise.all([
    api.getColors().then((c) => { palette = c; setPalette(palette); }).catch(() => { palette = [...DEFAULT_COLORS]; }),
    api.getDefaults().then((d) => { defaults = d; }).catch(() => { defaults = FACTORY_DEFAULTS; }),
  ]);

  renderPalette(root);
  renderDefaults(root);

  (root.querySelector("#add-color") as HTMLElement).addEventListener("click", async () => {
    const id = `custom-${Date.now().toString(36)}`;
    const hex = "#ffaaff";
    palette = [...palette, { id, label: "New color", hex, glow: suggestGlow(hex) }];
    await savePalette(root);
    renderPalette(root);
    renderDefaults(root); // color-pattern pickers reference the palette
  });

  (root.querySelector("#reset-palette") as HTMLElement).addEventListener("click", async () => {
    if (!confirm("Reset the palette to the factory defaults? Your custom colors will be removed.")) return;
    palette = DEFAULT_COLORS.map((c) => ({ ...c }));
    await savePalette(root);
    renderPalette(root);
    renderDefaults(root);
  });
}

function renderPalette(root: HTMLElement) {
  const wrap = root.querySelector("#palette") as HTMLElement;
  wrap.innerHTML = palette.map((c) => `
    <div class="color-row" data-id="${c.id}">
      <input type="color" class="hex" value="${c.hex}" />
      <input type="text" class="label" value="${escapeAttr(c.label)}" placeholder="Label" />
      <input type="color" class="glow" value="${c.glow}" title="Glow color (brightness halo)" />
      <button class="delete" title="${c.builtin ? "Built-in colors can't be deleted" : "Delete this color"}" ${c.builtin ? "disabled" : ""}>×</button>
    </div>
  `).join("");

  wrap.querySelectorAll(".color-row").forEach((row) => {
    const id = (row as HTMLElement).dataset.id!;
    const hexInput = row.querySelector(".hex") as HTMLInputElement;
    const labelInput = row.querySelector(".label") as HTMLInputElement;
    const glowInput = row.querySelector(".glow") as HTMLInputElement;
    const updateAndSave = async () => {
      palette = palette.map((c) =>
        c.id === id
          ? { ...c, hex: hexInput.value, label: labelInput.value.trim() || c.label, glow: glowInput.value }
          : c,
      );
      setPalette(palette);
      await savePalette(root);
    };
    hexInput.addEventListener("input", () => {
      const prev = palette.find((c) => c.id === id);
      if (prev && prev.glow.toLowerCase() === suggestGlow(prev.hex).toLowerCase()) {
        glowInput.value = suggestGlow(hexInput.value);
      }
    });
    hexInput.addEventListener("change", updateAndSave);
    labelInput.addEventListener("change", updateAndSave);
    glowInput.addEventListener("change", updateAndSave);
    row.querySelector(".delete")?.addEventListener("click", async () => {
      const c = palette.find((x) => x.id === id);
      if (!c || c.builtin) return;
      palette = palette.filter((x) => x.id !== id);
      await savePalette(root);
      renderPalette(root);
      renderDefaults(root);
    });
  });
}

function renderDefaults(root: HTMLElement) {
  const wrap = root.querySelector("#defaults-sections") as HTMLElement;
  wrap.innerHTML = SECTIONS.map((sec) => renderSection(sec)).join("");

  for (const sec of SECTIONS) {
    const secEl = wrap.querySelector(`[data-section="${sec.key}"]`) as HTMLElement;
    secEl.querySelector(".reset-section")?.addEventListener("click", async () => {
      defaults = { ...defaults, [sec.key]: { ...FACTORY_DEFAULTS[sec.key] } };
      await saveDefaults(root);
      renderDefaults(root);
    });
    for (const field of sec.fields) {
      wireField(secEl, sec.key, field, root);
    }
  }
}

function renderSection(sec: SectionSpec): string {
  return `
    <div class="defaults-section" data-section="${sec.key}">
      <div class="defaults-head">
        <h3>${sec.label}</h3>
        <button class="reset-section">Reset to defaults</button>
      </div>
      ${sec.fields.map((f) => renderField(sec.key, f)).join("")}
    </div>
  `;
}

function valueOf(typeKey: string, fieldKey: string): unknown {
  const stored = (defaults[typeKey] as Record<string, unknown> | undefined)?.[fieldKey];
  if (stored !== undefined) return stored;
  return (FACTORY_DEFAULTS[typeKey] as Record<string, unknown> | undefined)?.[fieldKey];
}

function renderField(typeKey: string, f: FieldSpec): string {
  const val = valueOf(typeKey, f.key);
  if (f.kind === "spacing") {
    return `
      <div class="defaults-field">
        <label>${f.label}</label>
        <div class="spacing-row" data-field="${f.key}">
          ${f.options.map((o) => `<button data-v="${o}" class="${val === o ? "active" : ""}">${o}${f.unit ?? ""}</button>`).join("")}
        </div>
      </div>`;
  }
  if (f.kind === "style") {
    return `
      <div class="defaults-field">
        <label>${f.label}</label>
        <div class="style-row" data-field="${f.key}">
          ${f.options.map((o) => `<button data-v="${o}" class="${val === o ? "active" : ""}">${o[0]?.toUpperCase() + o.slice(1)}</button>`).join("")}
        </div>
      </div>`;
  }
  if (f.kind === "color-pattern") {
    const current = Array.isArray(val) ? (val as string[])[0] : undefined;
    return `
      <div class="defaults-field">
        <label>${f.label}</label>
        <div class="colors" data-field="${f.key}">
          ${COLORS.map((c) => `<button data-v="${c.id}" title="${c.label}" style="background:${c.hex}" class="${current === c.id ? "active" : ""}"></button>`).join("")}
        </div>
      </div>`;
  }
  if (f.kind === "number") {
    const v = typeof val === "number" ? val : 0;
    const decimals = f.step >= 1 ? 0 : 2;
    return `
      <div class="defaults-field">
        <label>${f.label} <span style="float:right;color:var(--text-dim)">${v.toFixed(decimals)}${f.unit ?? ""}</span></label>
        <input type="range" data-field="${f.key}" min="${f.min}" max="${f.max}" step="${f.step}" value="${v}" />
      </div>`;
  }
  // bool
  return `
    <div class="defaults-field">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
        <input type="checkbox" data-field="${f.key}" ${val ? "checked" : ""} />
        <span>${f.label}</span>
      </label>
    </div>`;
}

function wireField(
  secEl: HTMLElement,
  typeKey: string,
  f: FieldSpec,
  root: HTMLElement,
) {
  const update = async (v: unknown) => {
    defaults = {
      ...defaults,
      [typeKey]: { ...(defaults[typeKey] ?? {}), [f.key]: v },
    };
    await saveDefaults(root);
    renderDefaults(root);
  };

  if (f.kind === "spacing" || f.kind === "style") {
    secEl.querySelectorAll(`[data-field="${f.key}"] button`).forEach((b) =>
      b.addEventListener("click", () => {
        const raw = (b as HTMLElement).dataset.v!;
        update(f.kind === "spacing" ? Number(raw) : raw);
      }),
    );
  } else if (f.kind === "color-pattern") {
    secEl.querySelectorAll(`[data-field="${f.key}"] button`).forEach((b) =>
      b.addEventListener("click", () => {
        update([(b as HTMLElement).dataset.v!]);
      }),
    );
  } else if (f.kind === "number") {
    const input = secEl.querySelector(`[data-field="${f.key}"]`) as HTMLInputElement;
    input.addEventListener("change", () => update(Number(input.value)));
  } else {
    const input = secEl.querySelector(`[data-field="${f.key}"]`) as HTMLInputElement;
    input.addEventListener("change", () => update(input.checked));
  }
}

async function savePalette(root: HTMLElement) {
  const status = root.querySelector("#palette-status") as HTMLElement;
  status.textContent = "Saving…";
  try {
    await api.setColors(palette);
    setPalette(palette);
    status.textContent = "Saved";
    window.setTimeout(() => { if (status.textContent === "Saved") status.textContent = ""; }, 1500);
  } catch (err) {
    status.textContent = `Save failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function saveDefaults(root: HTMLElement) {
  const status = root.querySelector("#defaults-status") as HTMLElement;
  status.textContent = "Saving…";
  try {
    await api.setDefaults(defaults);
    status.textContent = "Saved";
    window.setTimeout(() => { if (status.textContent === "Saved") status.textContent = ""; }, 1500);
  } catch (err) {
    status.textContent = `Save failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
