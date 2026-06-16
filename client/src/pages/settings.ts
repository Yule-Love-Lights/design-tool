import { api, type BulbColor, type CustomUpload, type ToolDefaults } from "../api";
import { COLORS, DEFAULT_COLORS, setPalette, suggestGlow } from "../editor/colors";
import { DEFAULT_RENDER_SETTINGS, setRenderSettings, type RenderSettings } from "../editor/renderSettings";
// Keep the Google Fonts link in index.html — that's what actually loads the
// Bebas Neue / Oswald / Pacifico / Inter faces used by the settings font
// preview buttons here.

let palette: BulbColor[] = [];
let defaults: ToolDefaults = {};
let uploads: CustomUpload[] = [];
let render: RenderSettings = { ...DEFAULT_RENDER_SETTINGS };

// Settings is split into tabs so the user isn't scrolling through one
// long stack of every-item-type defaults. Tab persists in module state
// across renders during a single visit; resets to "palette" on remount.
type SettingsTab = "palette" | "render" | "lights" | "decor" | "text" | "custom" | "poles";
let activeTab: SettingsTab = "palette";
const TABS: { id: SettingsTab; label: string }[] = [
  { id: "palette", label: "Palette" },
  { id: "render", label: "Render" },
  { id: "lights", label: "Lights" },
  { id: "decor", label: "Decor" },
  { id: "text", label: "Text" },
  { id: "custom", label: "Custom" },
  { id: "poles", label: "Poles" },
];

// Maps each defaults-section key to the tab it lives under. Categories
// match the editor's top-level category bar so users have one mental
// model for "where does this item live".
const SECTION_TAB: Record<string, SettingsTab> = {
  c9: "lights",
  mini: "lights",
  permanent: "lights",
  bistro: "lights",
  wreath: "decor",
  bow: "decor",
  garland: "decor",
  spritzer: "decor",
  text: "text",
  custom: "custom",
  pole: "poles",
};

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
  bistro: {
    spacingIn: 12,
    drawingStyle: "strand",
    colorPattern: ["warm-white"],
    sagFactor: 0.10,
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
  spritzer: {
    sizeIn: 24,
    colorPattern: ["warm-white"],
  },
  text: {
    fontFamily: "Oswald",
    colorPattern: ["black"],
    outline: false,
  },
  custom: {
    autoHalo: false,
  },
  pole: {
    heightIn: 120,
    baseType: "cube",
  },
};

// Spec for what a section knows how to render for a given item-type key.
// Adding a new item type means adding a SECTION entry; rendering is data-driven.
type FieldSpec =
  | { key: string; label: string; kind: "spacing"; options: number[]; unit?: string }
  | { key: string; label: string; kind: "style"; options: string[] }
  | { key: string; label: string; kind: "color-pattern" }
  | { key: string; label: string; kind: "number"; min: number; max: number; step: number; unit?: string }
  | { key: string; label: string; kind: "bool" }
  | { key: string; label: string; kind: "font"; options: string[] };

type SectionSpec = { key: string; label: string; fields: FieldSpec[] };

const SPACINGS_BY_TYPE: Record<string, number[]> = {
  c9: [6, 9, 12, 15, 18, 24, 36],
  mini: [4, 6, 9, 12, 18],
  permanent: [4, 6, 8, 9, 12, 15, 18, 24],
  bistro: [9, 12, 15, 18, 24, 36],
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
    key: "bistro",
    label: "Bistro Lights",
    fields: [
      { key: "spacingIn", label: "Default spacing", kind: "spacing", options: [9, 12, 15, 18, 24, 36], unit: "\"" },
      { key: "drawingStyle", label: "Default drawing style", kind: "style", options: ["strand", "trace", "single"] },
      { key: "colorPattern", label: "Default color", kind: "color-pattern" },
      { key: "sagFactor", label: "Default sag", kind: "number", min: 0, max: 0.25, step: 0.005 },
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
  {
    key: "spritzer",
    label: "Spritzers",
    fields: [
      { key: "sizeIn", label: "Default size", kind: "spacing", options: [16, 24, 36, 48], unit: "\"" },
      { key: "colorPattern", label: "Default color", kind: "color-pattern" },
    ],
  },
  {
    key: "text",
    label: "Text",
    fields: [
      { key: "fontFamily", label: "Default font", kind: "font", options: ["Bebas Neue", "Oswald", "Pacifico", "Inter"] },
      { key: "colorPattern", label: "Default color", kind: "color-pattern" },
      { key: "outline", label: "Outline by default", kind: "bool" },
    ],
  },
  {
    key: "custom",
    label: "Custom uploads",
    fields: [
      { key: "autoHalo", label: "Glow by default", kind: "bool" },
    ],
  },
  {
    key: "pole",
    label: "Poles",
    fields: [
      { key: "heightIn", label: "Default height", kind: "spacing", options: [96, 120, 144, 180], unit: "\"" },
      { key: "baseType", label: "Default base type", kind: "style", options: ["none", "cube", "barrel"] },
    ],
  },
];

export async function renderSettings(root: HTMLElement) {
  // Shell: header + tab bar + a content container that gets replaced when
  // the active tab changes. The file input is always in the DOM but hidden
  // so the click handler can reach it regardless of which tab is visible.
  root.innerHTML = `
    <div class="settings">
      <header>
        <button class="icon" id="back" title="Back to designs">←</button>
        <h1>Settings</h1>
      </header>
      <div class="settings-tabs" id="settings-tabs" style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap"></div>
      <input type="file" id="library-upload-input" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" style="display:none" />
      <div id="settings-content"></div>
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

  // Load palette + defaults + library in parallel.
  await Promise.all([
    api.getColors().then((c) => { palette = c; setPalette(palette); }).catch(() => { palette = [...DEFAULT_COLORS]; }),
    api.getDefaults().then((d) => { defaults = d; }).catch(() => { defaults = FACTORY_DEFAULTS; }),
    api.listUploads().then((u) => { uploads = u; }).catch(() => { uploads = []; }),
    api.getRenderSettings().then((r) => { render = r; setRenderSettings(r); }).catch(() => { render = { ...DEFAULT_RENDER_SETTINGS }; }),
  ]);

  renderTabs(root);
  renderActiveTab(root);

  // The library's hidden file input lives outside the swappable tab content
  // so its change handler stays bound across tab switches. The corresponding
  // + Upload button is inside the Custom tab; we wire it during that tab's
  // render and click() this input from there.
  const libInput = root.querySelector("#library-upload-input") as HTMLInputElement;
  libInput.addEventListener("change", async () => {
    const file = libInput.files?.[0];
    if (!file) return;
    libInput.value = "";
    const status = root.querySelector("#library-status") as HTMLElement | null;
    if (status) status.textContent = "Uploading…";
    let entry: CustomUpload;
    try {
      entry = await api.createUpload(file);
    } catch (err) {
      console.error("library-upload failed:", err);
      alert(`Upload failed: ${err instanceof Error ? err.message : String(err)}`);
      if (status) status.textContent = "";
      return;
    }
    try {
      uploads = [entry, ...uploads];
      // Only re-render if we're still on the Custom tab — the library lives
      // there and the user may have switched away mid-upload.
      if (activeTab === "custom") renderActiveTab(root);
      const s = root.querySelector("#library-status") as HTMLElement | null;
      if (s) {
        s.textContent = "Uploaded";
        window.setTimeout(() => { if (s.textContent === "Uploaded") s.textContent = ""; }, 1500);
      }
    } catch (err) {
      console.error("library-upload post-success error:", err);
      try {
        uploads = await api.listUploads();
      } catch { /* swallow */ }
      if (activeTab === "custom") renderActiveTab(root);
      alert(`Saved on server, but re-rendering threw: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
}

// Tab bar at the top. Clicking a tab swaps the content area below; the
// settings shell (header, tab bar, hidden file input) stays put so we
// don't lose the file input's change-event binding mid-upload.
function renderTabs(root: HTMLElement) {
  const bar = root.querySelector("#settings-tabs") as HTMLElement;
  bar.innerHTML = TABS.map(
    (t) => `<button class="settings-tab${activeTab === t.id ? " active" : ""}" data-tab="${t.id}" style="padding:8px 14px;border-radius:6px;border:1px solid var(--border);background:${activeTab === t.id ? "var(--accent, #4f8cff)" : "var(--surface-2)"};color:${activeTab === t.id ? "white" : "var(--text)"};cursor:pointer;font-weight:${activeTab === t.id ? "600" : "400"}">${t.label}</button>`,
  ).join("");
  bar.querySelectorAll<HTMLButtonElement>("button[data-tab]").forEach((b) => {
    b.addEventListener("click", () => {
      const next = b.dataset.tab as SettingsTab;
      if (next === activeTab) return;
      activeTab = next;
      renderTabs(root); // update active-state styling
      renderActiveTab(root);
    });
  });
}

// Renders the content for the currently-selected tab into #settings-content.
// Each branch is responsible for its own DOM + event wiring; previous
// listeners die with the old DOM when innerHTML is replaced.
function renderActiveTab(root: HTMLElement) {
  const wrap = root.querySelector("#settings-content") as HTMLElement;
  if (activeTab === "palette") {
    wrap.innerHTML = `
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
    `;
    renderPalette(root);
    (root.querySelector("#add-color") as HTMLElement).addEventListener("click", async () => {
      const id = `custom-${Date.now().toString(36)}`;
      const hex = "#ffaaff";
      palette = [...palette, { id, label: "New color", hex, glow: suggestGlow(hex) }];
      await savePalette(root);
      renderPalette(root);
    });
    (root.querySelector("#reset-palette") as HTMLElement).addEventListener("click", async () => {
      if (!confirm("Reset the palette to the factory defaults? Your custom colors will be removed.")) return;
      palette = DEFAULT_COLORS.map((c) => ({ ...c }));
      await savePalette(root);
      renderPalette(root);
    });
    return;
  }

  if (activeTab === "render") {
    const v = render.spritzerRayDensity;
    wrap.innerHTML = `
      <section class="card">
        <div class="card-head">
          <h2>Render Settings</h2>
          <div class="actions">
            <button id="reset-render">Reset to defaults</button>
          </div>
        </div>
        <p class="hint">
          App-wide rendering tunables. Unlike the per-type defaults, these change how items
          are drawn in <em>every</em> design — including ones already made — the moment you save.
        </p>
        <div class="defaults-field">
          <label>Spritzer ray density <span style="float:right;color:var(--text-dim)" id="render-rd-val">${v.toFixed(2)}</span></label>
          <input type="range" id="render-rd" min="0.1" max="1.5" step="0.05" value="${v}" />
          <div class="hint" style="margin-top:4px">Rays per pixel of a spritzer's rendered radius — higher is a denser spray. The final ray count is still capped between 7 and 36.</div>
        </div>
        <div class="saving" id="render-status"></div>
      </section>
    `;
    const slider = root.querySelector("#render-rd") as HTMLInputElement;
    const label = root.querySelector("#render-rd-val") as HTMLElement;
    slider.addEventListener("input", () => { label.textContent = Number(slider.value).toFixed(2); });
    slider.addEventListener("change", async () => {
      render = { ...render, spritzerRayDensity: Number(slider.value) };
      setRenderSettings(render);
      await saveRender(root);
    });
    (root.querySelector("#reset-render") as HTMLElement).addEventListener("click", async () => {
      render = { ...DEFAULT_RENDER_SETTINGS };
      setRenderSettings(render);
      renderActiveTab(root);
      await saveRender(root);
    });
    return;
  }

  if (activeTab === "custom") {
    wrap.innerHTML = `
      <section class="card">
        <h2 style="margin:0 0 4px">Custom Defaults</h2>
        <p class="hint">Starting settings applied when you place a new custom upload.</p>
        <div id="defaults-sections">Loading…</div>
        <div class="saving" id="defaults-status"></div>
      </section>
      <section class="card">
        <div class="card-head">
          <h2>Custom Graphic Library</h2>
          <div class="actions">
            <button id="library-upload-btn" class="primary">+ Upload image</button>
          </div>
        </div>
        <p class="hint">
          Your uploaded graphics live here and are available in every design.
          Removing a graphic from the library doesn't affect copies already placed on designs.
        </p>
        <div id="library-grid">Loading…</div>
        <div class="saving" id="library-status"></div>
      </section>
    `;
    renderDefaults(root);
    renderLibrary(root);
    (root.querySelector("#library-upload-btn") as HTMLElement).addEventListener("click", () => {
      (root.querySelector("#library-upload-input") as HTMLInputElement).click();
    });
    return;
  }

  // Lights / Decor / Text — all share the same shape: just the defaults
  // sections that belong to this tab.
  const tabLabel = TABS.find((t) => t.id === activeTab)?.label ?? "";
  wrap.innerHTML = `
    <section class="card">
      <h2 style="margin:0 0 4px">${tabLabel} Defaults</h2>
      <p class="hint">
        Starting values applied when you place a new ${tabLabel.toLowerCase()} item.
        You can still tweak any item after placing it.
      </p>
      <div id="defaults-sections">Loading…</div>
      <div class="saving" id="defaults-status"></div>
    </section>
  `;
  renderDefaults(root);
}

function renderPalette(root: HTMLElement) {
  const wrap = root.querySelector("#palette") as HTMLElement;
  wrap.innerHTML = palette.map((c) => `
    <div class="color-row" data-id="${c.id}">
      <input type="color" class="hex" value="${c.hex}" />
      <input type="text" class="label" value="${escapeAttr(c.label)}" placeholder="Label" />
      <button class="delete" title="${c.builtin ? "Built-in colors can't be deleted" : "Delete this color"}" ${c.builtin ? "disabled" : ""}>×</button>
    </div>
  `).join("");

  wrap.querySelectorAll(".color-row").forEach((row) => {
    const id = (row as HTMLElement).dataset.id!;
    const hexInput = row.querySelector(".hex") as HTMLInputElement;
    const labelInput = row.querySelector(".label") as HTMLInputElement;
    // Glow is auto-derived from hex via suggestGlow() — there's no separate
    // glow input. The renderer still uses color.glow internally, it just
    // always tracks the chosen hex so users only think about one color.
    const updateAndSave = async () => {
      palette = palette.map((c) =>
        c.id === id
          ? { ...c, hex: hexInput.value, label: labelInput.value.trim() || c.label, glow: suggestGlow(hexInput.value) }
          : c,
      );
      setPalette(palette);
      await savePalette(root);
    };
    hexInput.addEventListener("change", updateAndSave);
    labelInput.addEventListener("change", updateAndSave);
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

// Renders the Custom Graphic Library grid: every uploaded image as a thumbnail
// with the original filename, an Active/Total count, and an × button to
// remove from the library (file is deleted server-side; placed copies on
// designs keep working since they reference the file path directly).
function renderLibrary(root: HTMLElement) {
  const wrap = root.querySelector("#library-grid") as HTMLElement;
  if (uploads.length === 0) {
    wrap.innerHTML = `<div style="color:var(--text-dim);font-size:13px;padding:18px;text-align:center;border:1px dashed var(--border);border-radius:8px">No graphics uploaded yet. Click + Upload image to add one.</div>`;
    return;
  }
  wrap.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px">
      ${uploads.map((u) => `
        <div class="library-tile" data-id="${u.id}" style="position:relative;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:6px">
          <div style="aspect-ratio:1;background:var(--surface);border-radius:6px;display:flex;align-items:center;justify-content:center;overflow:hidden">
            <img src="${u.url}" alt="" style="max-width:100%;max-height:100%;object-fit:contain" />
          </div>
          <div style="font-size:11px;color:var(--text-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeAttr(u.filename)}">${escapeAttr(u.filename)}</div>
          <button class="library-tile-del" title="Remove from library" style="position:absolute;top:4px;right:4px;width:22px;height:22px;border-radius:50%;background:rgba(0,0,0,0.7);color:white;border:none;font-size:14px;line-height:1;cursor:pointer;padding:0">×</button>
        </div>
      `).join("")}
    </div>
  `;

  wrap.querySelectorAll<HTMLElement>(".library-tile").forEach((tile) => {
    const id = tile.dataset.id!;
    const filename = uploads.find((u) => u.id === id)?.filename ?? "this graphic";
    tile.querySelector<HTMLButtonElement>(".library-tile-del")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm(`Remove "${filename}" from your library? Already-placed copies stay on their designs.`)) return;
      const status = root.querySelector("#library-status") as HTMLElement;
      status.textContent = "Deleting…";
      try {
        await api.deleteUpload(id);
      } catch (err) {
        console.error("library-delete failed:", err);
        status.textContent = `Delete failed: ${err instanceof Error ? err.message : String(err)}`;
        return;
      }
      try {
        uploads = uploads.filter((u) => u.id !== id);
        renderLibrary(root);
        status.textContent = "Deleted";
        window.setTimeout(() => { if (status.textContent === "Deleted") status.textContent = ""; }, 1500);
      } catch (err) {
        console.error("library-delete post-success error:", err);
        status.textContent = `Deleted on server, but re-rendering threw: ${err instanceof Error ? err.message : String(err)}`;
      }
    });
  });
}

function renderDefaults(root: HTMLElement) {
  const wrap = root.querySelector("#defaults-sections") as HTMLElement | null;
  // Palette tab doesn't have a defaults container — bail rather than throw.
  if (!wrap) return;
  // Only show sections that belong to the active tab.
  const visible = SECTIONS.filter((sec) => SECTION_TAB[sec.key] === activeTab);
  wrap.innerHTML = visible.map((sec) => renderSection(sec)).join("");

  for (const sec of visible) {
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
  if (f.kind === "font") {
    // Each button previews the font in its own typeface so the picker is
    // self-explanatory (no need to actually know what "Pacifico" looks like).
    return `
      <div class="defaults-field">
        <label>${f.label}</label>
        <div class="style-row" data-field="${f.key}" style="flex-wrap:wrap">
          ${f.options.map((o) => `<button data-v="${o}" class="${val === o ? "active" : ""}" style="font-family:'${o}',sans-serif;font-size:14px">${o}</button>`).join("")}
        </div>
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

  if (f.kind === "spacing" || f.kind === "style" || f.kind === "font") {
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

async function saveRender(root: HTMLElement) {
  const status = root.querySelector("#render-status") as HTMLElement | null;
  if (status) status.textContent = "Saving…";
  try {
    await api.updateRenderSettings(render);
    if (status) {
      status.textContent = "Saved";
      window.setTimeout(() => { if (status.textContent === "Saved") status.textContent = ""; }, 1500);
    }
  } catch (err) {
    if (status) status.textContent = `Save failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
