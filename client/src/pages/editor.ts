import Konva from "konva";
import { api, isStrand, isWreath, isBow, isGarland, type Design, type Scene, type Strand, type StrandItem, type WreathItem, type BowItem, type GarlandItem, type Yardstick, type BulbType, type DrawingStyle } from "../api";
import { COLORS, setPalette } from "../editor/colors";
import { renderStrand, strandLengthPx } from "../editor/strand";
import { createWreath } from "../editor/wreath";
import { createBow } from "../editor/bow";
import { renderGarland, garlandLengthPx } from "../editor/garland";
import { preloadAssets } from "../editor/assets";
import { renderYardstick, pxPerFoot, yardstickLabel } from "../editor/yardstick";

const BULB_TYPES: { id: BulbType; label: string }[] = [
  { id: "c9", label: "C9" },
  { id: "permanent", label: "Permanent" },
  { id: "mini", label: "Mini" },
];

const SPACINGS: Record<BulbType, number[]> = {
  c9: [6, 9, 12, 15, 18, 24, 36],
  mini: [4, 6, 9, 12, 18],
  permanent: [4, 6, 8, 9, 12, 15, 18, 24],
};

const STYLES: { id: DrawingStyle; label: string }[] = [
  { id: "strand", label: "Strand" },
  { id: "trace", label: "Trace" },
  { id: "single", label: "Single" },
];

const STYLE_HELP: Record<DrawingStyle, string> = {
  strand: "Click and drag a straight line of lights.",
  trace: "Click to start. Click each bend. Press Enter or move off the photo to finish.",
  single: "Click to place a single bulb.",
};

type ItemCategory = "lights" | "decor";
type DecorType = "wreath" | "bow" | "garland";

type ToolState = {
  category: ItemCategory;
  bulbType: BulbType;
  spacingIn: number;
  drawingStyle: DrawingStyle;
  colorPattern: string[];
  pickerColorId: string;
  // Type-specific defaults that get baked into new strands at creation time.
  // Lets users pre-configure the look BEFORE drawing — matches HHC's UX.
  beamLengthFt: number;
  beamWidthFt: number;
  distanceToSurfaceFt: number;
  opacity: number;
  showCoverage: boolean;
  // Decor sub-type
  decorType: DecorType;
  // Decor — wreath
  wreathSizeIn: number;
  wreathWithLights: boolean;
  wreathWithBow: boolean;
  wreathColorId: string;
  // Decor — bow
  bowSizeIn: number;
  // Decor — garland (drawn strand-like, sized like wreath/bow)
  garlandSizeIn: number;
  garlandWithLights: boolean;
};

const WREATH_SIZES = [24, 36, 48, 60];
const BOW_SIZES = [12, 18, 24, 36, 48];
const GARLAND_SIZES = [6, 9, 12, 18, 24];

export async function renderEditor(root: HTMLElement, designId: string) {
  let design: Design;
  try {
    design = await api.getDesign(designId);
  } catch {
    window.location.hash = "#/";
    return;
  }

  root.innerHTML = `
    <div class="editor">
      <div class="topbar">
        <button class="icon" id="back" title="Back">←</button>
        <input class="title" id="name" />
        <span class="saving" id="saving"></span>
        <span class="spacer"></span>
        <div class="tool-toggle">
          <button id="tool-draw" class="active" title="Draw new strands">✎ Draw</button>
          <button id="tool-select" title="Drag a box to select multiple strands">⛶ Select</button>
        </div>
        <button id="undo-btn" title="Undo (Ctrl+Z)" disabled>↶ Undo</button>
        <button id="redo-btn" title="Redo (Ctrl+Shift+Z)" disabled>↷ Redo</button>
        <button id="ys-btn">+ Yardstick</button>
        <button id="zoom-out-btn" title="Zoom out (ctrl + scroll)">−</button>
        <button id="zoom-reset-btn" title="Reset zoom">100%</button>
        <button id="zoom-in-btn" title="Zoom in (ctrl + scroll)">+</button>
        <button id="settings-btn" title="App settings (palette, defaults)">⚙ Settings</button>
        <button id="dl-btn">Download</button>
      </div>
      <div class="stage-wrap" id="stage-wrap">
        <div id="stage-host" style="position:absolute;inset:0"></div>
        <div class="brightness" id="brightness-ui">
          <span class="icon" title="Darker">${moonSvg()}</span>
          <div class="slider-wrap">
            <input type="range" min="0" max="100" value="50" id="brightness" title="Double-click to reset to neutral" />
            <div class="neutral-tick" title="Neutral — original photo brightness"></div>
          </div>
          <span class="icon" title="Brighter">${sunSvg()}</span>
        </div>
        <div class="stage-empty" id="empty"${design.photoUrl ? ' style="display:none"' : ""}>
          <div>Upload a photo of the house to get started.</div>
          <button class="upload" id="upload-btn">Upload Photo</button>
          <input type="file" id="upload-file" accept="image/*" style="display:none" />
        </div>
      </div>
      <aside class="sidebar" id="sidebar"></aside>
      <div class="bottombar">
        <div class="total" id="total">No strands yet</div>
      </div>
    </div>
  `;

  // --- State ---
  let scene: Scene = { ...design.scene, brightness: design.scene.brightness ?? 50 };
  const tool: ToolState = {
    category: "lights",
    bulbType: "c9",
    spacingIn: 12,
    drawingStyle: "strand",
    colorPattern: ["warm-white"],
    pickerColorId: "warm-white",
    beamLengthFt: 4,
    beamWidthFt: 1.7,
    distanceToSurfaceFt: 0,
    opacity: 1,
    showCoverage: false,
    decorType: "wreath",
    wreathSizeIn: 36,
    wreathWithLights: true,
    wreathWithBow: true,
    wreathColorId: "warm-white",
    bowSizeIn: 24,
    garlandSizeIn: 12,
    garlandWithLights: true,
  };
  let activeYardstickId: string | null = scene.yardsticks[0]?.id ?? null;
  let creatingYardstick = false;
  let pendingYsFeet = 0;
  let ysDragStart: { x: number; y: number } | null = null;

  // Strand drag state (for "strand" mode)
  let dragPts: number[] | null = null;
  // Trace polyline state (for "trace" mode) — accumulates committed points; last entry tracks the cursor.
  let tracePts: number[] | null = null;
  let drawPreview: Konva.Line | null = null;

  // --- Tool mode ---
  // "draw" = clicks/drags create new strands (current behavior).
  // "select" = clicks/drags create a marquee rectangle to multi-select existing strands.
  type ToolMode = "draw" | "select";
  let toolMode: ToolMode = "draw";
  let marqueeStart: { x: number; y: number } | null = null;
  let marqueePreview: Konva.Rect | null = null;

  // --- Selection ---
  // Strands and yardsticks are mutually exclusive: selecting one clears the other.
  let selectedIds = new Set<string>();
  let selectedYardstickId: string | null = null;

  // Persisted per-type defaults loaded from /api/settings/defaults at init.
  // We re-read this whenever the user switches bulb type so the relevant fields
  // (spacing, drawing style, color, perm-specific) jump to that type's defaults.
  let savedDefaults: Record<string, Record<string, unknown>> = {};

  // Look up a strand's yardstick (or fall back to the first yardstick if its own
  // was deleted; or null if no yardsticks exist).
  function yardstickForStrand(strand: Strand): Yardstick | null {
    const tied = strand.yardstickId
      ? scene.yardsticks.find((y) => y.id === strand.yardstickId)
      : undefined;
    return tied ?? scene.yardsticks[0] ?? null;
  }
  function ppfForStrand(strand: Strand): number {
    return pxPerFoot(yardstickForStrand(strand));
  }

  // Helper: filter scene.items down to strand items.
  // Used in many read paths where we need strand-specific props (bulbType, colorPattern, etc).
  function allStrands(): StrandItem[] {
    return scene.items.filter(isStrand);
  }

  // --- Undo / redo history ---
  // past[] holds snapshots in chronological order; the current `scene` is the latest.
  // future[] is filled by undo() so we can redo.
  // We snapshot via structuredClone (JSON-safe deep clone).
  const snap = (s: Scene): Scene => JSON.parse(JSON.stringify(s)) as Scene;
  let past: Scene[] = [snap(scene)];
  let future: Scene[] = [];
  const HISTORY_LIMIT = 100;

  function commit() {
    // Push the CURRENT scene state. Only called after discrete user actions
    // (button click, slider drag end, strand drag end, etc.) — never per-frame.
    past.push(snap(scene));
    if (past.length > HISTORY_LIMIT) past.shift();
    future = [];
    updateUndoRedoButtons();
  }

  function undo() {
    if (past.length < 2) return;
    future.unshift(past.pop()!);
    scene = snap(past[past.length - 1]);
    selectedIds.clear();
    scheduleSave();
    redrawScene();
    updateUndoRedoButtons();
  }

  function redo() {
    const next = future.shift();
    if (!next) return;
    past.push(next);
    scene = snap(next);
    selectedIds.clear();
    scheduleSave();
    redrawScene();
    updateUndoRedoButtons();
  }

  function updateUndoRedoButtons() {
    const ub = root.querySelector("#undo-btn") as HTMLButtonElement | null;
    const rb = root.querySelector("#redo-btn") as HTMLButtonElement | null;
    if (ub) ub.disabled = past.length < 2;
    if (rb) rb.disabled = future.length === 0;
  }

  // --- rAF-coalesced canvas redraw ---
  // Slider drags fire many `input` events per second; calling redrawScene() each time
  // is too heavy when rendering hundreds of permanent-light cones. We coalesce to one
  // redraw per animation frame.
  let redrawHandle = 0;
  function requestCanvasRedraw() {
    if (redrawHandle) return;
    redrawHandle = requestAnimationFrame(() => {
      redrawHandle = 0;
      redrawCanvas();
    });
  }

  // --- Konva stage ---
  const stageWrap = root.querySelector("#stage-wrap") as HTMLDivElement;
  const stageHost = root.querySelector("#stage-host") as HTMLDivElement;
  const stage = new Konva.Stage({
    container: stageHost,
    width: stageWrap.clientWidth,
    height: stageWrap.clientHeight,
  });
  const emptyEl = root.querySelector("#empty") as HTMLElement | null;
  if (emptyEl) emptyEl.style.zIndex = "10";
  const bgLayer = new Konva.Layer();
  const tintLayer = new Konva.Layer({ listening: false });
  const drawLayer = new Konva.Layer();
  // Dedicated UI layer on top so transformer + handles are never washed out by the bulb glow.
  const uiLayer = new Konva.Layer();
  stage.add(bgLayer);
  stage.add(tintLayer);
  stage.add(drawLayer);
  stage.add(uiLayer);

  // Konva Transformer — handles resize/rotate/drag on selected strand group(s).
  const transformer = new Konva.Transformer({
    rotateEnabled: true,
    anchorSize: 12,
    anchorStroke: "#4f8cff",
    anchorStrokeWidth: 2,
    anchorFill: "#ffffff",
    anchorCornerRadius: 2,
    borderStroke: "#4f8cff",
    borderStrokeWidth: 2,
    borderDash: [8, 5],
    keepRatio: false,
    rotateAnchorOffset: 30,
    enabledAnchors: ["top-left", "top-right", "bottom-left", "bottom-right", "middle-left", "middle-right", "top-center", "bottom-center"],
  });
  uiLayer.add(transformer);

  // Yardsticks get their own transformer — no rotation (they're axis-aligned),
  // and a different accent color to match the yardstick selection styling.
  const yardstickTransformer = new Konva.Transformer({
    rotateEnabled: false,
    anchorSize: 12,
    anchorStroke: "#ffb454",
    anchorStrokeWidth: 2,
    anchorFill: "#ffffff",
    anchorCornerRadius: 2,
    borderStroke: "#ffb454",
    borderStrokeWidth: 2,
    borderDash: [8, 5],
    keepRatio: false,
    enabledAnchors: ["top-left", "top-right", "bottom-left", "bottom-right", "middle-left", "middle-right", "top-center", "bottom-center"],
  });
  uiLayer.add(yardstickTransformer);

  let bgImageNode: Konva.Image | null = null;
  let tintRect: Konva.Rect | null = null;
  let fitScale = 1;          // scale to fit photo into stage
  let userZoom = 1;          // ctrl+wheel zoom multiplier
  let panOffset = { x: 0, y: 0 }; // user pan offset (px, in stage coords)
  let stageOffset = { x: 0, y: 0 };  // computed = centering + panOffset
  let stageScale = 1;        // computed = fitScale * userZoom

  async function loadPhoto(url: string, w: number, h: number) {
    const img = await loadHTMLImage(url);
    bgImageNode?.destroy();
    bgImageNode = new Konva.Image({ image: img, width: w, height: h });
    bgLayer.add(bgImageNode);
    fitStage(w, h);
    bgLayer.batchDraw();
    drawTint();
  }

  function fitStage(imgW: number, imgH: number) {
    const cw = stageWrap.clientWidth;
    const ch = stageWrap.clientHeight;
    fitScale = Math.min(cw / imgW, ch / imgH);
    applyTransform(imgW, imgH);
  }

  function applyTransform(imgW?: number, imgH?: number) {
    const w = imgW ?? bgImageNode?.width() ?? 0;
    const h = imgH ?? bgImageNode?.height() ?? 0;
    const cw = stageWrap.clientWidth;
    const ch = stageWrap.clientHeight;
    stageScale = fitScale * userZoom;
    stageOffset = {
      x: (cw - w * stageScale) / 2 + panOffset.x,
      y: (ch - h * stageScale) / 2 + panOffset.y,
    };
    stage.size({ width: cw, height: ch });
    const s = { x: stageScale, y: stageScale };
    bgLayer.position(stageOffset).scale(s);
    tintLayer.position(stageOffset).scale(s);
    drawLayer.position(stageOffset).scale(s);
    uiLayer.position(stageOffset).scale(s);
    bgLayer.batchDraw();
    tintLayer.batchDraw();
    drawLayer.batchDraw();
    uiLayer.batchDraw();
  }

  function zoomAt(screenX: number, screenY: number, factor: number) {
    if (!bgImageNode) return;
    const oldZoom = userZoom;
    const newZoom = Math.max(0.5, Math.min(8, oldZoom * factor));
    if (newZoom === oldZoom) return;
    // Keep the image point under the cursor stationary in screen space.
    const imgX = (screenX - stageOffset.x) / stageScale;
    const imgY = (screenY - stageOffset.y) / stageScale;
    userZoom = newZoom;
    const newStageScale = fitScale * userZoom;
    const cw = stageWrap.clientWidth;
    const ch = stageWrap.clientHeight;
    const w = bgImageNode.width();
    const h = bgImageNode.height();
    const baseOffsetX = (cw - w * newStageScale) / 2;
    const baseOffsetY = (ch - h * newStageScale) / 2;
    panOffset.x = screenX - imgX * newStageScale - baseOffsetX;
    panOffset.y = screenY - imgY * newStageScale - baseOffsetY;
    applyTransform();
  }

  function resetZoom() {
    userZoom = 1;
    panOffset = { x: 0, y: 0 };
    applyTransform();
  }

  function drawTint() {
    tintRect?.destroy();
    tintRect = null;
    if (!bgImageNode) {
      tintLayer.batchDraw();
      return;
    }
    const b = scene.brightness ?? 50;
    if (b === 50) {
      tintLayer.batchDraw();
      return;
    }
    const w = bgImageNode.width();
    const h = bgImageNode.height();
    let fill: string;
    if (b < 50) {
      // Darken: heavy black-blue overlay so the photo can read as a true night scene.
      // t=0 → fully overlaid (~0.94 alpha, essentially pitch-black with a hint of blue);
      // t=50 → no overlay.
      const t = (50 - b) / 50;
      const a = Math.pow(t, 0.9) * 0.94;
      fill = `rgba(0,4,12,${a})`;
    } else {
      // Lighten: white-ish overlay (subtle wash).
      const a = ((b - 50) / 50) * 0.25;
      fill = `rgba(255,250,235,${a})`;
    }
    tintRect = new Konva.Rect({
      width: w,
      height: h,
      fill,
      listening: false,
    });
    tintLayer.add(tintRect);
    tintLayer.batchDraw();
  }

  function imagePoint(): { x: number; y: number } | null {
    const p = stage.getPointerPosition();
    if (!p) return null;
    return {
      x: (p.x - stageOffset.x) / stageScale,
      y: (p.y - stageOffset.y) / stageScale,
    };
  }

  function inPhoto(p: { x: number; y: number }): boolean {
    if (!bgImageNode) return false;
    return p.x >= 0 && p.y >= 0 && p.x <= bgImageNode.width() && p.y <= bgImageNode.height();
  }

  function activeYs(): Yardstick | null {
    return scene.yardsticks.find((y) => y.id === activeYardstickId) ?? scene.yardsticks[0] ?? null;
  }

  function redrawScene() {
    redrawCanvas();
    renderSidebar();
  }

  function redrawCanvas() {
    // Detach transformers before destroying children so they don't hold stale refs.
    transformer.nodes([]);
    yardstickTransformer.nodes([]);
    drawLayer.destroyChildren();

    let selectedYardstickNode: Konva.Group | null = null;
    scene.yardsticks.forEach((ys, idx) => {
      const isSel = selectedYardstickId === ys.id;
      const g = renderYardstick(ys, yardstickLabel(idx), isSel);
      g.on("click tap", (e) => {
        e.cancelBubble = true;
        selectedIds.clear();
        selectedYardstickId = ys.id;
        redrawScene();
      });
      g.on("dragend", () => {
        // Bake new position into the yardstick state.
        scene = {
          ...scene,
          yardsticks: scene.yardsticks.map((y) =>
            y.id === ys.id ? { ...y, x: g.x(), y: g.y() } : y,
          ),
        };
        scheduleSave();
        commit();
        renderSidebar();
      });
      g.on("transformend", () => {
        bakeYardstickTransform(g, ys.id);
      });
      drawLayer.add(g);
      if (isSel) selectedYardstickNode = g;
    });

    const selectedItemNodes: Konva.Node[] = [];
    for (const item of scene.items) {
      let g: Konva.Group;
      if (isStrand(item)) {
        g = renderStrand(item, ppfForStrand(item));
        g.draggable(true);
        g.on("transformend dragend", () => bakeTransformIntoStrand(g, item.id));
      } else if (isWreath(item)) {
        g = createWreath(item, ppfForActiveYardstick(), requestCanvasRedraw);
        g.on("transformend dragend", () => bakeTransformIntoWreath(g, item.id));
      } else if (isBow(item)) {
        g = createBow(item, ppfForActiveYardstick(), requestCanvasRedraw);
        g.on("transformend dragend", () => bakeTransformIntoBow(g, item.id));
      } else if (isGarland(item)) {
        g = renderGarland(item, ppfForGarland(item), requestCanvasRedraw);
        g.draggable(true);
        g.on("transformend dragend", () => bakeTransformIntoGarland(g, item.id));
      } else {
        continue;
      }
      g.on("click tap", (e) => {
        e.cancelBubble = true;
        // While tracing, clicks must continue the polyline — never select.
        if (tracePts) return;
        selectedYardstickId = null;
        const additive = e.evt.shiftKey || e.evt.metaKey || e.evt.ctrlKey;
        if (!additive) selectedIds.clear();
        if (additive && selectedIds.has(item.id)) selectedIds.delete(item.id);
        else selectedIds.add(item.id);
        redrawScene();
      });
      drawLayer.add(g);
      if (selectedIds.has(item.id)) selectedItemNodes.push(g);
    }
    transformer.nodes(selectedItemNodes);
    // Image-backed items (wreath, bow) preserve aspect ratio while resizing so
    // they don't get squished. Strands (line geometry) get free non-uniform scale.
    // Garland-only selection gets rotate-only — no resize anchors at all
    // (resizing would distort the tiled PNG stamps).
    const allImageItems =
      selectedItemNodes.length > 0 &&
      selectedItemNodes.every((n) => {
        const name = (n as Konva.Group).name();
        return name === "wreath" || name === "bow";
      });
    const allGarland =
      selectedItemNodes.length > 0 &&
      selectedItemNodes.every((n) => (n as Konva.Group).name() === "garland");
    transformer.keepRatio(allImageItems);
    transformer.enabledAnchors(
      allGarland
        ? []
        : ["top-left", "top-right", "bottom-left", "bottom-right", "middle-left", "middle-right", "top-center", "bottom-center"],
    );
    yardstickTransformer.nodes(selectedYardstickNode ? [selectedYardstickNode] : []);
    drawLayer.batchDraw();
    uiLayer.batchDraw();
  }

  // Wreaths size themselves using whatever yardstick is "active" right now.
  // (They don't have an own-yardstick concept yet — that'd be an easy add later.)
  function ppfForActiveYardstick(): number {
    return pxPerFoot(activeYs());
  }

  function allWreaths(): WreathItem[] {
    return scene.items.filter(isWreath);
  }

  function allBows(): BowItem[] {
    return scene.items.filter(isBow);
  }

  function allGarlands(): GarlandItem[] {
    return scene.items.filter(isGarland);
  }

  // Garlands size themselves using their own yardstick (or the first one as
  // fallback if their own was deleted), same fall-back behavior as strands.
  function yardstickForGarland(g: GarlandItem): Yardstick | null {
    const tied = g.yardstickId
      ? scene.yardsticks.find((y) => y.id === g.yardstickId)
      : undefined;
    return tied ?? scene.yardsticks[0] ?? null;
  }
  function ppfForGarland(g: GarlandItem): number {
    return pxPerFoot(yardstickForGarland(g));
  }

  // After a Transformer move/rotate (no resize — anchors disabled for garland),
  // bake the group's transform back into the garland's point coordinates so
  // the next render uses an identity transform on the group again.
  function bakeTransformIntoGarland(group: Konva.Group, garlandId: string) {
    const cur = scene.items.find((i) => i.id === garlandId);
    if (!cur || !isGarland(cur)) return;
    const tx = group.x();
    const ty = group.y();
    const sx = group.scaleX();
    const sy = group.scaleY();
    const rot = (group.rotation() * Math.PI) / 180;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const newPts: number[] = [];
    for (let i = 0; i < cur.points.length; i += 2) {
      const x = cur.points[i] * sx;
      const y = cur.points[i + 1] * sy;
      newPts.push(tx + x * cos - y * sin, ty + x * sin + y * cos);
    }
    scene = {
      ...scene,
      items: scene.items.map((i) =>
        i.id === garlandId && isGarland(i) ? { ...i, points: newPts } : i,
      ),
    };
    scheduleSave();
    commit();
    redrawScene();
  }

  // Bake the Transformer's scale into the wreath's stored sizeIn so the next
  // render uses a clean identity transform on the group (just x/y/rotation).
  function bakeTransformIntoWreath(group: Konva.Group, wreathId: string) {
    const cur = scene.items.find((i) => i.id === wreathId);
    if (!cur || !isWreath(cur)) return;
    const sx = group.scaleX();
    const sy = group.scaleY();
    const avgScale = (sx + sy) / 2; // wreath is round, average for safety
    const newSize = Math.max(6, cur.sizeIn * avgScale);
    scene = {
      ...scene,
      items: scene.items.map((i) =>
        i.id === wreathId && isWreath(i)
          ? { ...i, x: group.x(), y: group.y(), sizeIn: newSize, rotation: group.rotation() }
          : i,
      ),
    };
    group.scaleX(1);
    group.scaleY(1);
    scheduleSave();
    commit();
    redrawScene();
  }

  // Same as bakeTransformIntoWreath but for bows. keepRatio is on for bows too,
  // so sx ≈ sy; we average for safety.
  function bakeTransformIntoBow(group: Konva.Group, bowId: string) {
    const cur = scene.items.find((i) => i.id === bowId);
    if (!cur || !isBow(cur)) return;
    const sx = group.scaleX();
    const sy = group.scaleY();
    const avgScale = (sx + sy) / 2;
    const newSize = Math.max(6, cur.sizeIn * avgScale);
    scene = {
      ...scene,
      items: scene.items.map((i) =>
        i.id === bowId && isBow(i)
          ? { ...i, x: group.x(), y: group.y(), sizeIn: newSize, rotation: group.rotation() }
          : i,
      ),
    };
    group.scaleX(1);
    group.scaleY(1);
    scheduleSave();
    commit();
    redrawScene();
  }

  // After the user drags a Transformer anchor on a yardstick, bake the scale into
  // width/height and reset scale to 1. Also commit the new position.
  function bakeYardstickTransform(group: Konva.Group, ysId: string) {
    const rect = group.findOne<Konva.Rect>(".yardstick-rect");
    if (!rect) return;
    const sx = group.scaleX();
    const sy = group.scaleY();
    const newWidth = Math.max(8, rect.width() * sx);
    const newHeight = Math.max(4, rect.height() * sy);
    scene = {
      ...scene,
      yardsticks: scene.yardsticks.map((y) =>
        y.id === ysId
          ? { ...y, x: group.x(), y: group.y(), width: newWidth, height: newHeight }
          : y,
      ),
    };
    // Reset the group transform so the next redraw uses identity scale.
    group.scaleX(1);
    group.scaleY(1);
    scheduleSave();
    commit();
    redrawScene();
  }

  // After a Transformer move/scale/rotate, fold the group's transform back into the strand's
  // point coordinates so re-render produces an identity transform on the group again.
  function bakeTransformIntoStrand(group: Konva.Group, strandId: string) {
    const strand = scene.items.find((s) => s.id === strandId);
    if (!strand || !isStrand(strand)) return;
    const tx = group.x();
    const ty = group.y();
    const sx = group.scaleX();
    const sy = group.scaleY();
    const rot = (group.rotation() * Math.PI) / 180;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const newPts: number[] = [];
    for (let i = 0; i < strand.points.length; i += 2) {
      const x = strand.points[i] * sx;
      const y = strand.points[i + 1] * sy;
      newPts.push(tx + x * cos - y * sin, ty + x * sin + y * cos);
    }
    scene = {
      ...scene,
      items: scene.items.map((s) => (s.id === strandId ? { ...s, points: newPts } : s)),
    };
    scheduleSave();
    commit();
    redrawScene();
  }

  function clearSelection() {
    if (selectedIds.size === 0 && !selectedYardstickId) return;
    selectedIds.clear();
    selectedYardstickId = null;
    redrawScene();
  }

  // Find every strand of the active bulb type whose path intersects (or has any
  // point inside) the rectangle, and add them to the selection.
  function selectMatchingInRect(x1: number, y1: number, x2: number, y2: number) {
    selectedYardstickId = null;
    let matchIds: string[];
    if (tool.category === "decor" && tool.decorType === "wreath") {
      // In decor → wreath mode, marquee picks wreaths whose center is inside the box.
      matchIds = allWreaths()
        .filter((w) => w.x >= x1 && w.x <= x2 && w.y >= y1 && w.y <= y2)
        .map((w) => w.id);
    } else if (tool.category === "decor" && tool.decorType === "bow") {
      matchIds = allBows()
        .filter((b) => b.x >= x1 && b.x <= x2 && b.y >= y1 && b.y <= y2)
        .map((b) => b.id);
    } else if (tool.category === "decor" && tool.decorType === "garland") {
      // Decor → Garland: pick garlands that have any polyline point in the box.
      matchIds = allGarlands()
        .filter((g) => {
          for (let i = 0; i < g.points.length; i += 2) {
            const px = g.points[i];
            const py = g.points[i + 1];
            if (px >= x1 && px <= x2 && py >= y1 && py <= y2) return true;
          }
          return false;
        })
        .map((g) => g.id);
    } else {
      // Default: strand items whose bulbType matches AND have any point in the box.
      matchIds = allStrands()
        .filter((s) => {
          if (s.bulbType !== tool.bulbType) return false;
          for (let i = 0; i < s.points.length; i += 2) {
            const px = s.points[i];
            const py = s.points[i + 1];
            if (px >= x1 && px <= x2 && py >= y1 && py <= y2) return true;
          }
          return false;
        })
        .map((s) => s.id);
    }
    selectedIds = new Set(matchIds);
    redrawScene();
  }

  function deleteSelected() {
    if (selectedIds.size === 0) return;
    scene = { ...scene, items: scene.items.filter((s) => !selectedIds.has(s.id)) };
    selectedIds.clear();
    scheduleSave();
    commit();
    redrawScene();
  }

  // --- Save (debounced) ---
  let saveTimer: number | null = null;
  const savingEl = root.querySelector("#saving") as HTMLElement;
  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    savingEl.textContent = "Saving…";
    saveTimer = window.setTimeout(async () => {
      await api.updateDesign(design.id, {
        scene,
        name: design.name,
      });
      savingEl.textContent = "Saved";
      window.setTimeout(() => {
        if (savingEl.textContent === "Saved") savingEl.textContent = "";
      }, 1500);
    }, 600);
  }

  // --- Sidebar ---
  function renderSidebar() {
    const sb = root.querySelector("#sidebar") as HTMLElement;
    if (selectedYardstickId) {
      renderYardstickSidebar(sb);
      renderTotal();
      return;
    }
    if (selectedIds.size > 0) {
      renderSelectedSidebar(sb);
      renderTotal();
      return;
    }
    sb.innerHTML = `
      <section>
        <h3>Category</h3>
        <div class="bulb-types" id="categories">
          <button data-cat="lights" class="${tool.category === "lights" ? "active" : ""}">Lights</button>
          <button data-cat="decor" class="${tool.category === "decor" ? "active" : ""}">Decor</button>
        </div>
      </section>
      ${tool.category === "lights" ? `
      <section>
        <h3>Bulb Type</h3>
        <div class="bulb-types" id="bulb-types">
          ${BULB_TYPES.map((b) => `<button data-type="${b.id}" class="${tool.bulbType === b.id ? "active" : ""}">${b.label}</button>`).join("")}
        </div>
        ${(() => {
          const count = allStrands().filter((s) => s.bulbType === tool.bulbType).length;
          const typeLabel = BULB_TYPES.find((b) => b.id === tool.bulbType)?.label ?? tool.bulbType;
          return `<button id="select-all-type" style="margin-top:8px;width:100%" ${count === 0 ? "disabled" : ""}>
            Select All ${typeLabel} Lights${count > 0 ? ` (${count})` : ""}
          </button>`;
        })()}
      </section>
      <section>
        <h3>Spacing (in)</h3>
        <div class="spacing-row" id="spacings">
          ${SPACINGS[tool.bulbType].map((s) => `<button data-s="${s}" class="${tool.spacingIn === s ? "active" : ""}">${s}"</button>`).join("")}
        </div>
      </section>
      <section>
        <h3>Drawing Style</h3>
        <div class="style-row" id="styles">
          ${STYLES.map((s) => `<button data-style="${s.id}" class="${tool.drawingStyle === s.id ? "active" : ""}">${s.label}</button>`).join("")}
        </div>
        <div class="style-help">${STYLE_HELP[tool.drawingStyle]}</div>
      </section>
      ${tool.bulbType === "permanent" ? `
      <section>
        <h3>Beam Length <span id="tool-beam-len-val" style="float:right;color:var(--text);font-weight:400"></span></h3>
        <input type="range" id="tool-beam-len" min="0.5" max="12" step="0.1" value="${tool.beamLengthFt}" />
      </section>
      <section>
        <h3>Beam Width <span id="tool-beam-wid-val" style="float:right;color:var(--text);font-weight:400"></span></h3>
        <input type="range" id="tool-beam-wid" min="0.2" max="6" step="0.1" value="${tool.beamWidthFt}" />
      </section>
      <section>
        <h3>Distance to Surface <span id="tool-dist-val" style="float:right;color:var(--text);font-weight:400"></span></h3>
        <input type="range" id="tool-dist" min="0" max="5" step="0.1" value="${tool.distanceToSurfaceFt}" />
      </section>
      <section>
        <h3>Opacity <span id="tool-opacity-val" style="float:right;color:var(--text);font-weight:400"></span></h3>
        <input type="range" id="tool-opacity" min="0.1" max="1" step="0.01" value="${tool.opacity}" />
      </section>
      <section>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="tool-coverage" ${tool.showCoverage ? "checked" : ""} />
          <span>Show floor coverage</span>
        </label>
        <div style="margin-top:4px;font-size:11px;color:var(--text-dim)">These settings apply to every new perm-light strand you draw.</div>
      </section>
      ` : ""}
      <section>
        <h3>Color</h3>
        <div class="colors" id="colors">
          ${COLORS.map((c) => `<button data-c="${c.id}" title="${c.label}" style="background:${c.hex}" class="${tool.pickerColorId === c.id ? "active" : ""}"></button>`).join("")}
        </div>
        <div style="margin-top:8px;display:flex;gap:6px">
          <button id="add-color">+ Add to pattern</button>
          <button id="clear-pattern">Clear</button>
        </div>
        <div class="pattern-row" id="pattern">
          ${tool.colorPattern.map((id, i) => {
            const c = COLORS.find((cc) => cc.id === id);
            return `<div class="swatch" data-i="${i}" style="background:${c?.hex ?? "#333"}"><button>×</button></div>`;
          }).join("")}
        </div>
      </section>
      <section>
        <h3>Strands (${allStrands().length})</h3>
        <div class="strands-list" id="strands">
          ${allStrands().map((s) => {
            const ft = strandLengthPx(s) / ppfForStrand(s);
            const swatch = COLORS.find((c) => c.id === s.colorPattern[0]);
            const label = s.bulbType === "permanent" ? "PERM" : s.bulbType.toUpperCase();
            return `<div class="strand-row" data-id="${s.id}">
              <span><span class="swatch" style="background:${swatch?.hex ?? "#888"}"></span>${label} @ ${s.spacingIn}" — ${ft.toFixed(1)} ft</span>
              <button title="Delete">×</button>
            </div>`;
          }).join("")}
        </div>
      </section>
      ` : `
      <section>
        <h3>Decor</h3>
        <div class="bulb-types" id="decor-types">
          <button data-decor="wreath" class="${tool.decorType === "wreath" ? "active" : ""}">Wreath</button>
          <button data-decor="bow" class="${tool.decorType === "bow" ? "active" : ""}">Bow</button>
          <button data-decor="garland" class="${tool.decorType === "garland" ? "active" : ""}">Garland</button>
        </div>
        ${(() => {
          if (tool.decorType === "wreath") {
            const count = allWreaths().length;
            return `<button id="select-all-wreaths" style="margin-top:8px;width:100%" ${count === 0 ? "disabled" : ""}>
              Select All Wreaths${count > 0 ? ` (${count})` : ""}
            </button>`;
          }
          if (tool.decorType === "bow") {
            const count = allBows().length;
            return `<button id="select-all-bows" style="margin-top:8px;width:100%" ${count === 0 ? "disabled" : ""}>
              Select All Bows${count > 0 ? ` (${count})` : ""}
            </button>`;
          }
          const count = allGarlands().length;
          return `<button id="select-all-garlands" style="margin-top:8px;width:100%" ${count === 0 ? "disabled" : ""}>
            Select All Garlands${count > 0 ? ` (${count})` : ""}
          </button>`;
        })()}
      </section>
      ${tool.decorType === "wreath" ? `
      <section>
        <h3>Size (in)</h3>
        <div class="spacing-row" id="wreath-sizes">
          ${WREATH_SIZES.map((s) => `<button data-s="${s}" class="${tool.wreathSizeIn === s ? "active" : ""}">${s}"</button>`).join("")}
        </div>
      </section>
      <section>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="wreath-with-lights" ${tool.wreathWithLights ? "checked" : ""} />
          <span>With lights</span>
        </label>
        <div style="margin-top:4px;font-size:11px;color:var(--text-dim)">Pre-lit vs. greenery only.</div>
      </section>
      <section>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="wreath-with-bow" ${tool.wreathWithBow ? "checked" : ""} />
          <span>Include bow</span>
        </label>
        <div style="margin-top:4px;font-size:11px;color:var(--text-dim)">Adds a red bow to the wreath. The bow moves and resizes with it.</div>
      </section>
      <section>
        <div class="style-help">Click anywhere on the photo to place a wreath.</div>
      </section>
      ` : tool.decorType === "bow" ? `
      <section>
        <h3>Size (in)</h3>
        <div class="spacing-row" id="bow-sizes">
          ${BOW_SIZES.map((s) => `<button data-s="${s}" class="${tool.bowSizeIn === s ? "active" : ""}">${s}"</button>`).join("")}
        </div>
      </section>
      <section>
        <div class="style-help">Click anywhere on the photo to place a bow.</div>
      </section>
      ` : `
      <section>
        <h3>Size (in)</h3>
        <div class="spacing-row" id="garland-sizes">
          ${GARLAND_SIZES.map((s) => `<button data-s="${s}" class="${tool.garlandSizeIn === s ? "active" : ""}">${s}"</button>`).join("")}
        </div>
        <div style="margin-top:4px;font-size:11px;color:var(--text-dim)">Thickness of the greenery rope on the photo.</div>
      </section>
      <section>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="garland-with-lights" ${tool.garlandWithLights ? "checked" : ""} />
          <span>With lights</span>
        </label>
        <div style="margin-top:4px;font-size:11px;color:var(--text-dim)">Pre-lit greenery vs. plain greenery.</div>
      </section>
      <section>
        <h3>Drawing Style</h3>
        <div class="style-row" id="garland-styles">
          ${STYLES.map((s) => `<button data-style="${s.id}" class="${tool.drawingStyle === s.id ? "active" : ""}">${s.label}</button>`).join("")}
        </div>
        <div class="style-help">${STYLE_HELP[tool.drawingStyle]}</div>
      </section>
      `}
      `}
    `;

    sb.querySelectorAll("#categories button").forEach((b) =>
      b.addEventListener("click", () => {
        tool.category = (b as HTMLElement).dataset.cat as ItemCategory;
        cancelInProgress();
        applyDefaultsForCurrentType();
        renderSidebar();
      }),
    );
    sb.querySelectorAll("#bulb-types button").forEach((b) =>
      b.addEventListener("click", () => {
        tool.bulbType = (b as HTMLElement).dataset.type as BulbType;
        // Pull the user's saved defaults for the newly-active type. Falls back to
        // factory values for anything not overridden in Settings.
        applyDefaultsForCurrentType();
        const spacings = SPACINGS[tool.bulbType];
        if (!spacings.includes(tool.spacingIn)) tool.spacingIn = spacings[Math.floor(spacings.length / 2)];
        renderSidebar();
      }),
    );
    sb.querySelectorAll("#decor-types button").forEach((b) =>
      b.addEventListener("click", () => {
        tool.decorType = (b as HTMLElement).dataset.decor as DecorType;
        // Switching decor sub-type mid-trace would orphan the polyline; bail out.
        cancelInProgress();
        applyDefaultsForCurrentType();
        renderSidebar();
      }),
    );
    sb.querySelectorAll("#garland-sizes button").forEach((b) =>
      b.addEventListener("click", () => {
        tool.garlandSizeIn = Number((b as HTMLElement).dataset.s);
        renderSidebar();
      }),
    );
    const garlandWl = sb.querySelector("#garland-with-lights") as HTMLInputElement | null;
    garlandWl?.addEventListener("change", () => {
      tool.garlandWithLights = garlandWl.checked;
      renderSidebar();
    });
    sb.querySelectorAll("#garland-styles button").forEach((b) =>
      b.addEventListener("click", () => {
        cancelInProgress();
        tool.drawingStyle = (b as HTMLElement).dataset.style as DrawingStyle;
        renderSidebar();
      }),
    );
    sb.querySelector("#select-all-garlands")?.addEventListener("click", () => {
      const ids = allGarlands().map((g) => g.id);
      if (ids.length === 0) return;
      selectedIds = new Set(ids);
      selectedYardstickId = null;
      redrawScene();
    });
    sb.querySelectorAll("#wreath-sizes button").forEach((b) =>
      b.addEventListener("click", () => {
        tool.wreathSizeIn = Number((b as HTMLElement).dataset.s);
        renderSidebar();
      }),
    );
    const withLightsCb = sb.querySelector("#wreath-with-lights") as HTMLInputElement | null;
    withLightsCb?.addEventListener("change", () => {
      tool.wreathWithLights = withLightsCb.checked;
      renderSidebar();
    });
    const withBowCb = sb.querySelector("#wreath-with-bow") as HTMLInputElement | null;
    withBowCb?.addEventListener("change", () => {
      tool.wreathWithBow = withBowCb.checked;
      renderSidebar();
    });
    sb.querySelector("#select-all-wreaths")?.addEventListener("click", () => {
      const ids = allWreaths().map((w) => w.id);
      if (ids.length === 0) return;
      selectedIds = new Set(ids);
      selectedYardstickId = null;
      redrawScene();
    });
    sb.querySelectorAll("#bow-sizes button").forEach((b) =>
      b.addEventListener("click", () => {
        tool.bowSizeIn = Number((b as HTMLElement).dataset.s);
        renderSidebar();
      }),
    );
    sb.querySelector("#select-all-bows")?.addEventListener("click", () => {
      const ids = allBows().map((b) => b.id);
      if (ids.length === 0) return;
      selectedIds = new Set(ids);
      selectedYardstickId = null;
      redrawScene();
    });
    sb.querySelector("#select-all-type")?.addEventListener("click", () => {
      const ids = allStrands().filter((s) => s.bulbType === tool.bulbType).map((s) => s.id);
      if (ids.length === 0) return;
      selectedIds = new Set(ids);
      selectedYardstickId = null;
      redrawScene();
    });

    // Pre-draw config for perm lights. Updates tool state (no scene mutation; these
    // values get baked into newly-created strands only). Labels update inline.
    if (tool.bulbType === "permanent") {
      const wireToolSlider = (
        id: string,
        key: "beamLengthFt" | "beamWidthFt" | "distanceToSurfaceFt" | "opacity",
        suffix: string,
        decimals: number,
      ) => {
        const input = sb.querySelector(`#${id}`) as HTMLInputElement;
        const label = sb.querySelector(`#${id}-val`) as HTMLElement;
        const write = () => {
          label.textContent = `${Number(input.value).toFixed(decimals)}${suffix}`;
        };
        write();
        input.addEventListener("input", () => {
          write();
          tool[key] = Number(input.value);
        });
      };
      wireToolSlider("tool-beam-len", "beamLengthFt", " ft", 1);
      wireToolSlider("tool-beam-wid", "beamWidthFt", " ft", 1);
      wireToolSlider("tool-dist", "distanceToSurfaceFt", " ft", 1);
      wireToolSlider("tool-opacity", "opacity", "", 2);
      const cov = sb.querySelector("#tool-coverage") as HTMLInputElement;
      cov.addEventListener("change", () => {
        tool.showCoverage = cov.checked;
      });
    }
    sb.querySelectorAll("#spacings button").forEach((b) =>
      b.addEventListener("click", () => {
        tool.spacingIn = Number((b as HTMLElement).dataset.s);
        renderSidebar();
      }),
    );
    sb.querySelectorAll("#styles button").forEach((b) =>
      b.addEventListener("click", () => {
        cancelInProgress();
        tool.drawingStyle = (b as HTMLElement).dataset.style as DrawingStyle;
        renderSidebar();
      }),
    );
    sb.querySelectorAll("#colors button").forEach((b) =>
      b.addEventListener("click", () => {
        const id = (b as HTMLElement).dataset.c!;
        tool.pickerColorId = id;
        // Replace the pattern when it's a single-color pattern (the common case).
        // Multi-color patterns are preserved — user can hit "+ Add to pattern" or "Clear" to extend.
        if (tool.colorPattern.length <= 1) tool.colorPattern = [id];
        renderSidebar();
      }),
    );
    sb.querySelector("#add-color")!.addEventListener("click", () => {
      tool.colorPattern = [...tool.colorPattern, tool.pickerColorId];
      renderSidebar();
    });
    sb.querySelector("#clear-pattern")!.addEventListener("click", () => {
      tool.colorPattern = [tool.pickerColorId];
      renderSidebar();
    });
    sb.querySelectorAll(".swatch button").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const i = Number((btn.parentElement as HTMLElement).dataset.i);
        tool.colorPattern = tool.colorPattern.filter((_, idx) => idx !== i);
        if (tool.colorPattern.length === 0) tool.colorPattern = [tool.pickerColorId];
        renderSidebar();
      });
    });
    sb.querySelectorAll("#strands .strand-row button").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const row = (btn as HTMLElement).closest(".strand-row") as HTMLElement | null;
        const id = row?.dataset.id;
        if (!id) return;
        scene = { ...scene, items: scene.items.filter((s) => s.id !== id) };
        scheduleSave();
        commit();
        redrawScene();
      });
    });
    // Clicking anywhere on a strand row (not the × button) selects that strand
    // on the canvas, same as clicking the strand directly. The × button's
    // stopPropagation above prevents double-handling.
    sb.querySelectorAll<HTMLElement>("#strands .strand-row").forEach((row) => {
      row.style.cursor = "pointer";
      row.addEventListener("click", () => {
        const id = row.dataset.id;
        if (!id) return;
        selectedYardstickId = null;
        selectedIds = new Set([id]);
        redrawScene();
      });
    });

    renderTotal();
  }

  function renderTotal() {
    const strs = allStrands();
    const gars = allGarlands();
    const totalStrandFt = strs.reduce((acc, s) => acc + strandLengthPx(s) / ppfForStrand(s), 0);
    const totalGarlandFt = gars.reduce((acc, g) => acc + garlandLengthPx(g) / ppfForGarland(g), 0);
    const ysCount = scene.yardsticks.length;
    if (ysCount === 0) {
      (root.querySelector("#total") as HTMLElement).innerHTML =
        `<span style="color:var(--warn)">Drop a Yardstick to get real-world measurements.</span>`;
      return;
    }
    const parts: string[] = [];
    parts.push(`<strong>${totalStrandFt.toFixed(1)} ft</strong> across ${strs.length} strand${strs.length === 1 ? "" : "s"}`);
    if (gars.length > 0) {
      parts.push(`<strong>${totalGarlandFt.toFixed(1)} ft</strong> across ${gars.length} garland${gars.length === 1 ? "" : "s"}`);
    }
    parts.push(`${ysCount} yardstick${ysCount === 1 ? "" : "s"}`);
    (root.querySelector("#total") as HTMLElement).innerHTML = parts.join(" · ");
  }

  // ============================================================
  // Sidebar — edit panel for the currently selected strand(s)
  // ============================================================
  function renderSelectedSidebar(sb: HTMLElement) {
    const selectedItems = scene.items.filter((i) => selectedIds.has(i.id));
    if (selectedItems.length === 0) {
      // Shouldn't happen, but guard anyway.
      renderSidebar();
      return;
    }
    const wreathSel = selectedItems.filter(isWreath);
    const bowSel = selectedItems.filter(isBow);
    const strandSel = selectedItems.filter(isStrand);
    const garlandSel = selectedItems.filter(isGarland);

    // All-of-one-kind → dedicated edit panel.
    if (wreathSel.length === selectedItems.length) {
      renderSelectedWreathSidebar(sb, wreathSel);
      return;
    }
    if (bowSel.length === selectedItems.length) {
      renderSelectedBowSidebar(sb, bowSel);
      return;
    }
    if (garlandSel.length === selectedItems.length) {
      renderSelectedGarlandSidebar(sb, garlandSel);
      return;
    }
    if (strandSel.length === selectedItems.length) {
      // Falls through to the strand panel below.
    } else {
      // Mixed selection — just offer delete.
      const counts: string[] = [];
      if (strandSel.length) counts.push(`${strandSel.length} strand${strandSel.length === 1 ? "" : "s"}`);
      if (garlandSel.length) counts.push(`${garlandSel.length} garland${garlandSel.length === 1 ? "" : "s"}`);
      if (wreathSel.length) counts.push(`${wreathSel.length} wreath${wreathSel.length === 1 ? "" : "s"}`);
      if (bowSel.length) counts.push(`${bowSel.length} bow${bowSel.length === 1 ? "" : "s"}`);
      sb.innerHTML = `
        <section>
          <h3>Mixed selection</h3>
          <div style="color:var(--text-dim);font-size:12px;margin-bottom:8px">
            ${counts.join(" + ")} selected. Edit one kind at a time, or just delete.
          </div>
        </section>
        <section><button class="danger" id="sel-delete" style="width:100%">Delete all selected</button></section>
      `;
      sb.querySelector("#sel-delete")?.addEventListener("click", deleteSelected);
      return;
    }
    const sel = strandSel;
    const isPerm = sel.every((s) => s.bulbType === "permanent");
    const sharedBulbType = uniq(sel.map((s) => s.bulbType));
    const sharedSpacing = uniq(sel.map((s) => s.spacingIn));
    const sharedPattern = uniq(sel.map((s) => s.colorPattern.join(",")));
    const totalFt = sel.reduce((acc, s) => acc + strandLengthPx(s) / ppfForStrand(s), 0);
    const sharedYsId = uniq(sel.map((s) => s.yardstickId ?? ""));

    const spacingOptions = sharedBulbType.length === 1 ? SPACINGS[sharedBulbType[0] as BulbType] : SPACINGS.c9;

    sb.innerHTML = `
      <section>
        <h3>${sel.length === 1 ? "Edit Strand" : `Edit ${sel.length} Strands`}</h3>
        <div style="color:var(--text-dim);font-size:12px;margin-bottom:4px">
          ${totalFt.toFixed(1)} ft total · drag handles to resize/rotate · drag body to move
        </div>
      </section>

      <section>
        <h3>Bulb Type</h3>
        <div class="bulb-types" id="sel-bulb-types">
          ${BULB_TYPES.map((b) => `<button data-type="${b.id}" class="${sharedBulbType.length === 1 && sharedBulbType[0] === b.id ? "active" : ""}">${b.label}</button>`).join("")}
        </div>
      </section>

      <section>
        <h3>Spacing (in)</h3>
        <div class="spacing-row" id="sel-spacings">
          ${spacingOptions.map((s) => `<button data-s="${s}" class="${sharedSpacing.length === 1 && sharedSpacing[0] === s ? "active" : ""}">${s}"</button>`).join("")}
        </div>
      </section>

      <section>
        <h3>Color${sharedPattern.length > 1 ? " (mixed)" : ""}</h3>
        <div class="colors" id="sel-colors">
          ${COLORS.map((c) => `<button data-c="${c.id}" title="${c.label}" style="background:${c.hex}"></button>`).join("")}
        </div>
        <div style="margin-top:8px;color:var(--text-dim);font-size:11px">
          Tap a color to replace the pattern. To build a multi-color pattern, deselect first.
        </div>
      </section>

      ${scene.yardsticks.length > 0 ? `
      <section>
        <h3>Sized using${sharedYsId.length > 1 ? " (mixed)" : ""}</h3>
        <select id="sel-yardstick" class="yardstick-select">
          ${sharedYsId.length > 1 ? `<option value="" disabled selected>— mixed —</option>` : ""}
          ${scene.yardsticks.map((y, i) => {
            const isSel = sharedYsId.length === 1 && (sharedYsId[0] === y.id || (sharedYsId[0] === "" && y.id === yardstickForStrand(sel[0])?.id));
            return `<option value="${y.id}" ${isSel ? "selected" : ""}>${yardstickLabel(i)} — ${y.realFeet} ft</option>`;
          }).join("")}
        </select>
        <div style="margin-top:4px;font-size:11px;color:var(--text-dim)">Changing this rescales the bulbs to match the new yardstick's pixels-per-foot.</div>
      </section>
      ` : ""}

      ${isPerm ? `
      <section>
        <h3>Beam Length <span id="sel-beam-len-val" style="float:right;color:var(--text);font-weight:400"></span></h3>
        <input type="range" id="sel-beam-len" min="0.5" max="12" step="0.1" value="${avg(sel.map((s) => s.beamLengthFt ?? 4))}" />
      </section>
      <section>
        <h3>Beam Width <span id="sel-beam-wid-val" style="float:right;color:var(--text);font-weight:400"></span></h3>
        <input type="range" id="sel-beam-wid" min="0.2" max="6" step="0.1" value="${avg(sel.map((s) => s.beamWidthFt ?? 1.5))}" />
      </section>
      <section>
        <h3>Distance to Surface <span id="sel-dist-val" style="float:right;color:var(--text);font-weight:400"></span></h3>
        <input type="range" id="sel-dist" min="0" max="5" step="0.1" value="${avg(sel.map((s) => s.distanceToSurfaceFt ?? 0))}" />
      </section>
      <section>
        <h3>Opacity <span id="sel-opacity-val" style="float:right;color:var(--text);font-weight:400"></span></h3>
        <input type="range" id="sel-opacity" min="0.1" max="1" step="0.01" value="${avg(sel.map((s) => s.opacity ?? 1))}" />
      </section>
      <section>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="sel-coverage" ${sel.every((s) => (s.showCoverage ?? true)) ? "checked" : ""} />
          <span>Show floor coverage</span>
        </label>
        <div style="margin-top:4px;font-size:11px;color:var(--text-dim)">The soft horizontal glow where the cones land.</div>
      </section>
      ` : ""}

      <section style="display:flex;gap:6px">
        <button id="sel-duplicate">Duplicate</button>
        <button id="sel-delete" class="danger">Delete</button>
      </section>
    `;

    // Discrete updates — full redraw + commit + save.
    const updateSelected = (mut: (s: Strand) => Strand) => {
      scene = {
        ...scene,
        items: scene.items.map((s) => (isStrand(s) && selectedIds.has(s.id) ? mut(s) : s)),
      };
      scheduleSave();
      commit();
      redrawScene();
    };

    // Continuous updates (slider drags) — mutate scene, request a coalesced canvas redraw,
    // update only the slider label inline so the sidebar HTML isn't recreated.
    const liveUpdateSelected = (mut: (s: Strand) => Strand) => {
      scene = {
        ...scene,
        items: scene.items.map((s) => (isStrand(s) && selectedIds.has(s.id) ? mut(s) : s)),
      };
      scheduleSave();
      requestCanvasRedraw();
    };

    sb.querySelectorAll("#sel-bulb-types button").forEach((b) =>
      b.addEventListener("click", () => {
        const t = (b as HTMLElement).dataset.type as BulbType;
        updateSelected((s) => ({ ...s, bulbType: t, spacingIn: SPACINGS[t].includes(s.spacingIn) ? s.spacingIn : SPACINGS[t][Math.floor(SPACINGS[t].length / 2)] }));
      }),
    );
    sb.querySelectorAll("#sel-spacings button").forEach((b) =>
      b.addEventListener("click", () => {
        const v = Number((b as HTMLElement).dataset.s);
        updateSelected((s) => ({ ...s, spacingIn: v }));
      }),
    );
    sb.querySelectorAll("#sel-colors button").forEach((b) =>
      b.addEventListener("click", () => {
        const c = (b as HTMLElement).dataset.c!;
        updateSelected((s) => ({ ...s, colorPattern: [c] }));
      }),
    );

    const ysSelect = sb.querySelector("#sel-yardstick") as HTMLSelectElement | null;
    ysSelect?.addEventListener("change", () => {
      const newYsId = ysSelect.value;
      if (!newYsId) return;
      updateSelected((s) => ({ ...s, yardstickId: newYsId }));
    });

    if (isPerm) {
      const wire = (id: string, key: keyof Strand, suffix: string, decimals: number) => {
        const input = sb.querySelector(`#${id}`) as HTMLInputElement;
        const label = sb.querySelector(`#${id}-val`) as HTMLElement;
        const writeLabel = () => {
          label.textContent = `${Number(input.value).toFixed(decimals)}${suffix}`;
        };
        writeLabel();
        // Smooth drag: update on every input but coalesce canvas redraws via rAF.
        input.addEventListener("input", () => {
          writeLabel();
          const v = Number(input.value);
          liveUpdateSelected((s) => ({ ...s, [key]: v }) as Strand);
        });
        // Snapshot for history once the drag ends.
        input.addEventListener("change", () => {
          commit();
        });
      };
      wire("sel-beam-len", "beamLengthFt", " ft", 1);
      wire("sel-beam-wid", "beamWidthFt", " ft", 1);
      wire("sel-dist", "distanceToSurfaceFt", " ft", 1);
      wire("sel-opacity", "opacity", "", 2);

      const coverageCb = sb.querySelector("#sel-coverage") as HTMLInputElement;
      coverageCb.addEventListener("change", () => {
        updateSelected((s) => ({ ...s, showCoverage: coverageCb.checked }));
      });
    }

    sb.querySelector("#sel-duplicate")!.addEventListener("click", () => {
      const newStrands = sel.map((s) => ({
        ...s,
        id: cryptoId(),
        points: s.points.map((p) => p + 20),
      }));
      scene = { ...scene, items: [...scene.items, ...newStrands] };
      selectedIds = new Set(newStrands.map((s) => s.id));
      scheduleSave();
      commit();
      redrawScene();
    });
    sb.querySelector("#sel-delete")!.addEventListener("click", deleteSelected);
  }

  // ============================================================
  // Sidebar — edit panel for the currently selected wreath(s)
  // ============================================================
  function renderSelectedWreathSidebar(sb: HTMLElement, sel: WreathItem[]) {
    const sharedSize = uniq(sel.map((w) => w.sizeIn));
    const sharedWithLights = uniq(sel.map((w) => w.withLights));
    const sharedWithBow = uniq(sel.map((w) => w.withBow ?? true));

    sb.innerHTML = `
      <section>
        <h3>${sel.length === 1 ? "Edit Wreath" : `Edit ${sel.length} Wreaths`}</h3>
        <div style="color:var(--text-dim);font-size:12px;margin-bottom:4px">
          Drag the body to move · drag corners to resize · drag rotation handle to rotate.
        </div>
      </section>
      <section>
        <h3>Size (in)</h3>
        <div class="spacing-row" id="sel-wreath-sizes">
          ${WREATH_SIZES.map((s) => `<button data-s="${s}" class="${sharedSize.length === 1 && sharedSize[0] === s ? "active" : ""}">${s}"</button>`).join("")}
        </div>
      </section>
      <section>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="sel-wreath-with-lights" ${sharedWithLights.length === 1 && sharedWithLights[0] ? "checked" : ""} />
          <span>With lights${sharedWithLights.length > 1 ? " (mixed)" : ""}</span>
        </label>
      </section>
      <section>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="sel-wreath-with-bow" ${sharedWithBow.length === 1 && sharedWithBow[0] ? "checked" : ""} />
          <span>Include bow${sharedWithBow.length > 1 ? " (mixed)" : ""}</span>
        </label>
      </section>
      <section style="display:flex;gap:6px">
        <button id="sel-wreath-duplicate">Duplicate</button>
        <button id="sel-wreath-delete" class="danger">Delete</button>
      </section>
    `;

    const updateWreaths = (mut: (w: WreathItem) => WreathItem) => {
      scene = {
        ...scene,
        items: scene.items.map((i) => (isWreath(i) && selectedIds.has(i.id) ? mut(i) : i)),
      };
      scheduleSave();
      commit();
      redrawScene();
    };

    sb.querySelectorAll("#sel-wreath-sizes button").forEach((b) =>
      b.addEventListener("click", () => {
        const v = Number((b as HTMLElement).dataset.s);
        updateWreaths((w) => ({ ...w, sizeIn: v }));
      }),
    );
    const wl = sb.querySelector("#sel-wreath-with-lights") as HTMLInputElement | null;
    wl?.addEventListener("change", () => {
      updateWreaths((w) => ({ ...w, withLights: wl.checked }));
    });
    const wb = sb.querySelector("#sel-wreath-with-bow") as HTMLInputElement | null;
    wb?.addEventListener("change", () => {
      updateWreaths((w) => ({ ...w, withBow: wb.checked }));
    });

    sb.querySelector("#sel-wreath-duplicate")?.addEventListener("click", () => {
      const newWreaths = sel.map((w) => ({ ...w, id: cryptoId(), x: w.x + 20, y: w.y + 20 }));
      scene = { ...scene, items: [...scene.items, ...newWreaths] };
      selectedIds = new Set(newWreaths.map((w) => w.id));
      scheduleSave();
      commit();
      redrawScene();
    });
    sb.querySelector("#sel-wreath-delete")?.addEventListener("click", deleteSelected);
  }

  // ============================================================
  // Sidebar — edit panel for the currently selected bow(s)
  // ============================================================
  function renderSelectedBowSidebar(sb: HTMLElement, sel: BowItem[]) {
    const sharedSize = uniq(sel.map((b) => b.sizeIn));

    sb.innerHTML = `
      <section>
        <h3>${sel.length === 1 ? "Edit Bow" : `Edit ${sel.length} Bows`}</h3>
        <div style="color:var(--text-dim);font-size:12px;margin-bottom:4px">
          Drag the body to move · drag corners to resize · drag rotation handle to rotate.
        </div>
      </section>
      <section>
        <h3>Size (in)</h3>
        <div class="spacing-row" id="sel-bow-sizes">
          ${BOW_SIZES.map((s) => `<button data-s="${s}" class="${sharedSize.length === 1 && sharedSize[0] === s ? "active" : ""}">${s}"</button>`).join("")}
        </div>
      </section>
      <section style="display:flex;gap:6px">
        <button id="sel-bow-duplicate">Duplicate</button>
        <button id="sel-bow-delete" class="danger">Delete</button>
      </section>
    `;

    const updateBows = (mut: (b: BowItem) => BowItem) => {
      scene = {
        ...scene,
        items: scene.items.map((i) => (isBow(i) && selectedIds.has(i.id) ? mut(i) : i)),
      };
      scheduleSave();
      commit();
      redrawScene();
    };

    sb.querySelectorAll("#sel-bow-sizes button").forEach((b) =>
      b.addEventListener("click", () => {
        const v = Number((b as HTMLElement).dataset.s);
        updateBows((bow) => ({ ...bow, sizeIn: v }));
      }),
    );
    sb.querySelector("#sel-bow-duplicate")?.addEventListener("click", () => {
      const newBows = sel.map((b) => ({ ...b, id: cryptoId(), x: b.x + 20, y: b.y + 20 }));
      scene = { ...scene, items: [...scene.items, ...newBows] };
      selectedIds = new Set(newBows.map((b) => b.id));
      scheduleSave();
      commit();
      redrawScene();
    });
    sb.querySelector("#sel-bow-delete")?.addEventListener("click", deleteSelected);
  }

  // ============================================================
  // Sidebar — edit panel for the currently selected garland(s)
  // ============================================================
  function renderSelectedGarlandSidebar(sb: HTMLElement, sel: GarlandItem[]) {
    const sharedSize = uniq(sel.map((g) => g.sizeIn ?? 12));
    const sharedWithLights = uniq(sel.map((g) => g.withLights));
    const sharedYsId = uniq(sel.map((g) => g.yardstickId ?? ""));
    const totalFt = sel.reduce((acc, g) => acc + garlandLengthPx(g) / ppfForGarland(g), 0);

    sb.innerHTML = `
      <section>
        <h3>${sel.length === 1 ? "Edit Garland" : `Edit ${sel.length} Garlands`}</h3>
        <div style="color:var(--text-dim);font-size:12px;margin-bottom:4px">
          ${totalFt.toFixed(1)} ft total · drag body to move · drag rotation handle to rotate
        </div>
      </section>
      <section>
        <h3>Size (in)${sharedSize.length > 1 ? " — mixed" : ""}</h3>
        <div class="spacing-row" id="sel-garland-sizes">
          ${GARLAND_SIZES.map((s) => `<button data-s="${s}" class="${sharedSize.length === 1 && sharedSize[0] === s ? "active" : ""}">${s}"</button>`).join("")}
        </div>
        <div style="margin-top:4px;font-size:11px;color:var(--text-dim)">Thickness of the greenery rope.</div>
      </section>
      <section>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="sel-garland-with-lights" ${sharedWithLights.length === 1 && sharedWithLights[0] ? "checked" : ""} />
          <span>With lights${sharedWithLights.length > 1 ? " (mixed)" : ""}</span>
        </label>
      </section>
      ${scene.yardsticks.length > 0 ? `
      <section>
        <h3>Sized using${sharedYsId.length > 1 ? " (mixed)" : ""}</h3>
        <select id="sel-garland-yardstick" class="yardstick-select">
          ${sharedYsId.length > 1 ? `<option value="" disabled selected>— mixed —</option>` : ""}
          ${scene.yardsticks.map((y, i) => {
            const isSel = sharedYsId.length === 1 && (sharedYsId[0] === y.id || (sharedYsId[0] === "" && y.id === yardstickForGarland(sel[0])?.id));
            return `<option value="${y.id}" ${isSel ? "selected" : ""}>${yardstickLabel(i)} — ${y.realFeet} ft</option>`;
          }).join("")}
        </select>
        <div style="margin-top:4px;font-size:11px;color:var(--text-dim)">Changes the px/ft used to scale the garland's stamp size.</div>
      </section>
      ` : ""}
      <section style="display:flex;gap:6px">
        <button id="sel-garland-duplicate">Duplicate</button>
        <button id="sel-garland-delete" class="danger">Delete</button>
      </section>
    `;

    const updateGarlands = (mut: (g: GarlandItem) => GarlandItem) => {
      scene = {
        ...scene,
        items: scene.items.map((i) => (isGarland(i) && selectedIds.has(i.id) ? mut(i) : i)),
      };
      scheduleSave();
      commit();
      redrawScene();
    };

    sb.querySelectorAll("#sel-garland-sizes button").forEach((b) =>
      b.addEventListener("click", () => {
        const v = Number((b as HTMLElement).dataset.s);
        updateGarlands((g) => ({ ...g, sizeIn: v }));
      }),
    );

    const wl = sb.querySelector("#sel-garland-with-lights") as HTMLInputElement | null;
    wl?.addEventListener("change", () => {
      updateGarlands((g) => ({ ...g, withLights: wl.checked }));
    });

    const ysSel = sb.querySelector("#sel-garland-yardstick") as HTMLSelectElement | null;
    ysSel?.addEventListener("change", () => {
      const newYsId = ysSel.value;
      if (!newYsId) return;
      updateGarlands((g) => ({ ...g, yardstickId: newYsId }));
    });

    sb.querySelector("#sel-garland-duplicate")?.addEventListener("click", () => {
      const newGarlands = sel.map((g) => ({
        ...g,
        id: cryptoId(),
        points: g.points.map((p) => p + 20),
      }));
      scene = { ...scene, items: [...scene.items, ...newGarlands] };
      selectedIds = new Set(newGarlands.map((g) => g.id));
      scheduleSave();
      commit();
      redrawScene();
    });
    sb.querySelector("#sel-garland-delete")?.addEventListener("click", deleteSelected);
  }

  function uniq<T>(arr: T[]): T[] {
    return Array.from(new Set(arr));
  }
  function avg(arr: number[]): number {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  // ============================================================
  // Sidebar — edit panel for the currently selected yardstick
  // ============================================================
  function renderYardstickSidebar(sb: HTMLElement) {
    const ys = scene.yardsticks.find((y) => y.id === selectedYardstickId);
    if (!ys) {
      selectedYardstickId = null;
      renderSidebar();
      return;
    }
    const idx = scene.yardsticks.findIndex((y) => y.id === ys.id);
    const label = yardstickLabel(idx);
    const ppf = pxPerFoot(ys);
    const stranded = allStrands().filter((s) => (yardstickForStrand(s)?.id ?? null) === ys.id);
    const otherYardsticks = scene.yardsticks.filter((y) => y.id !== ys.id);

    sb.innerHTML = `
      <section>
        <h3>Edit ${label}</h3>
        <div style="color:var(--text-dim);font-size:12px;margin-bottom:4px">
          Drag the rectangle to move it. Drag the handles to resize it. Or set the feet value below.
        </div>
      </section>
      <section>
        <h3>Real-world width <span style="float:right;color:var(--text);font-weight:400">${ys.realFeet} ft</span></h3>
        <input type="number" id="ys-feet" min="0.5" step="0.5" value="${ys.realFeet}" />
        <div style="margin-top:6px;font-size:12px;color:var(--text-dim)">
          Drag a real-world feature on the photo (door, window, garage) and enter its true width here.
        </div>
      </section>
      <section>
        <h3>Scale</h3>
        <div style="font-family:monospace;font-size:13px">
          <strong>${ppf.toFixed(1)} px/ft</strong>
          <span style="color:var(--text-dim)"> · ${Math.round(ys.width)}×${Math.round(ys.height)} px</span>
        </div>
      </section>
      <section>
        <h3>Strands using this</h3>
        <div style="font-size:13px">
          <strong>${stranded.length}</strong> strand${stranded.length === 1 ? "" : "s"}
        </div>
      </section>
      <section style="display:flex;gap:6px">
        <button id="ys-delete" class="danger">Delete</button>
      </section>
    `;

    const feetInput = sb.querySelector("#ys-feet") as HTMLInputElement;
    feetInput.addEventListener("input", () => {
      const v = Number(feetInput.value);
      if (!v || v <= 0) return;
      scene = {
        ...scene,
        yardsticks: scene.yardsticks.map((y) => (y.id === ys.id ? { ...y, realFeet: v } : y)),
      };
      scheduleSave();
      requestCanvasRedraw();
    });
    feetInput.addEventListener("change", () => {
      commit();
      renderSidebar(); // update the panel header/labels
    });

    sb.querySelector("#ys-delete")!.addEventListener("click", () => {
      handleYardstickDelete(ys.id, stranded.map((s) => s.id), otherYardsticks);
    });
  }

  function handleYardstickDelete(
    ysId: string,
    strandIds: string[],
    otherYardsticks: Yardstick[],
  ) {
    if (strandIds.length === 0) {
      // No strands tied to it → just delete.
      scene = { ...scene, yardsticks: scene.yardsticks.filter((y) => y.id !== ysId) };
      selectedYardstickId = null;
      scheduleSave();
      commit();
      redrawScene();
      return;
    }
    if (otherYardsticks.length === 0) {
      // No other yardstick to reassign to → must confirm deleting strands too.
      const ok = confirm(
        `Deleting this yardstick will delete ${strandIds.length} strand${strandIds.length === 1 ? "" : "s"} too (no other yardstick to fall back to). Continue?`,
      );
      if (!ok) return;
      scene = {
        ...scene,
        yardsticks: scene.yardsticks.filter((y) => y.id !== ysId),
        items: scene.items.filter((s) => !strandIds.includes(s.id)),
      };
      selectedYardstickId = null;
      scheduleSave();
      commit();
      redrawScene();
      return;
    }
    // Other yardsticks exist → ask whether to reassign or delete the strands.
    openYardstickDeleteModal(ysId, strandIds, otherYardsticks);
  }

  function openYardstickDeleteModal(
    ysId: string,
    strandIds: string[],
    otherYardsticks: Yardstick[],
  ) {
    if (document.querySelector(".modal-bg")) return;
    const bg = document.createElement("div");
    bg.className = "modal-bg";
    const ysIdx = scene.yardsticks.findIndex((y) => y.id === ysId);
    bg.innerHTML = `
      <div class="modal">
        <h2>Delete ${yardstickLabel(ysIdx)}?</h2>
        <div style="color:var(--text-dim);font-size:13px">
          ${strandIds.length} strand${strandIds.length === 1 ? "" : "s"} use this yardstick.
          What should happen to them?
        </div>
        <div>
          <label>Reassign to</label>
          <select id="ys-reassign">
            ${otherYardsticks.map((y) => {
              const i = scene.yardsticks.findIndex((yy) => yy.id === y.id);
              return `<option value="${y.id}">${yardstickLabel(i)} — ${y.realFeet} ft</option>`;
            }).join("")}
          </select>
        </div>
        <div class="actions" style="justify-content:space-between">
          <button id="ys-modal-delete-strands" class="danger">Delete strands too</button>
          <div style="display:flex;gap:8px">
            <button id="ys-modal-cancel">Cancel</button>
            <button id="ys-modal-reassign" class="primary">Reassign &amp; delete</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(bg);
    bg.addEventListener("click", (e) => { if (e.target === bg) bg.remove(); });
    bg.querySelector("#ys-modal-cancel")!.addEventListener("click", () => bg.remove());
    bg.querySelector("#ys-modal-reassign")!.addEventListener("click", () => {
      const newYsId = (bg.querySelector("#ys-reassign") as HTMLSelectElement).value;
      scene = {
        ...scene,
        yardsticks: scene.yardsticks.filter((y) => y.id !== ysId),
        items: scene.items.map((s) =>
          strandIds.includes(s.id) ? { ...s, yardstickId: newYsId } : s,
        ),
      };
      selectedYardstickId = null;
      scheduleSave();
      commit();
      bg.remove();
      redrawScene();
    });
    bg.querySelector("#ys-modal-delete-strands")!.addEventListener("click", () => {
      scene = {
        ...scene,
        yardsticks: scene.yardsticks.filter((y) => y.id !== ysId),
        items: scene.items.filter((s) => !strandIds.includes(s.id)),
      };
      selectedYardstickId = null;
      scheduleSave();
      commit();
      bg.remove();
      redrawScene();
    });
  }

  // --- Topbar ---
  (root.querySelector("#back") as HTMLElement).addEventListener("click", () => {
    window.location.hash = "#/";
  });
  (root.querySelector("#undo-btn") as HTMLElement).addEventListener("click", undo);
  (root.querySelector("#redo-btn") as HTMLElement).addEventListener("click", redo);
  (root.querySelector("#settings-btn") as HTMLElement).addEventListener("click", () => {
    window.location.hash = "#/settings";
  });

  function setToolMode(m: ToolMode) {
    if (toolMode === m) return;
    toolMode = m;
    cancelInProgress();
    (root.querySelector("#tool-draw") as HTMLElement).classList.toggle("active", m === "draw");
    (root.querySelector("#tool-select") as HTMLElement).classList.toggle("active", m === "select");
    stage.container().style.cursor = m === "select" ? "crosshair" : "";
  }
  (root.querySelector("#tool-draw") as HTMLElement).addEventListener("click", () => setToolMode("draw"));
  (root.querySelector("#tool-select") as HTMLElement).addEventListener("click", () => setToolMode("select"));
  const nameInput = root.querySelector("#name") as HTMLInputElement;
  nameInput.value = design.name;
  nameInput.addEventListener("input", () => {
    design.name = nameInput.value || "Untitled";
    scheduleSave();
  });

  (root.querySelector("#ys-btn") as HTMLElement).addEventListener("click", () => {
    if (!bgImageNode) {
      alert("Upload a photo first.");
      return;
    }
    const ftStr = prompt("How many real-world feet wide is the rectangle you're about to draw? (e.g. a door = 3, a garage door = 16)");
    if (!ftStr) return;
    const ft = Number(ftStr);
    if (!ft || ft <= 0) return;
    cancelInProgress();
    creatingYardstick = true;
    pendingYsFeet = ft;
    stage.container().style.cursor = "crosshair";
  });

  (root.querySelector("#dl-btn") as HTMLElement).addEventListener("click", () => {
    if (!bgImageNode) {
      alert("Nothing to download yet.");
      return;
    }
    downloadStage(stage, bgImageNode, design.name);
  });

  // --- Zoom controls ---
  const zoomResetBtn = root.querySelector("#zoom-reset-btn") as HTMLElement;
  const updateZoomLabel = () => {
    zoomResetBtn.textContent = `${Math.round(userZoom * 100)}%`;
  };
  root.querySelector("#zoom-in-btn")!.addEventListener("click", () => {
    zoomAt(stageWrap.clientWidth / 2, stageWrap.clientHeight / 2, 1.25);
    updateZoomLabel();
  });
  root.querySelector("#zoom-out-btn")!.addEventListener("click", () => {
    zoomAt(stageWrap.clientWidth / 2, stageWrap.clientHeight / 2, 0.8);
    updateZoomLabel();
  });
  zoomResetBtn.addEventListener("click", () => {
    resetZoom();
    updateZoomLabel();
  });

  // ctrl+wheel zoom centered on cursor
  stageWrap.addEventListener(
    "wheel",
    (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = stageWrap.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      zoomAt(sx, sy, e.deltaY < 0 ? 1.15 : 0.87);
      updateZoomLabel();
    },
    { passive: false },
  );

  // Space + drag to pan
  let spaceDown = false;
  let panDragStart: { x: number; y: number; baseX: number; baseY: number } | null = null;
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" && !spaceDown && document.activeElement?.tagName !== "INPUT") {
      spaceDown = true;
      stage.container().style.cursor = "grab";
      e.preventDefault();
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "Space") {
      spaceDown = false;
      stage.container().style.cursor = "";
    }
  });
  stage.on("mousedown", (e) => {
    // Middle-mouse-button OR space+left-button → pan
    if (e.evt.button === 1 || (spaceDown && e.evt.button === 0)) {
      panDragStart = {
        x: e.evt.clientX,
        y: e.evt.clientY,
        baseX: panOffset.x,
        baseY: panOffset.y,
      };
      stage.container().style.cursor = "grabbing";
      e.evt.preventDefault();
    }
  });
  window.addEventListener("mousemove", (e) => {
    if (!panDragStart) return;
    panOffset.x = panDragStart.baseX + (e.clientX - panDragStart.x);
    panOffset.y = panDragStart.baseY + (e.clientY - panDragStart.y);
    applyTransform();
  });
  window.addEventListener("mouseup", () => {
    if (panDragStart) {
      panDragStart = null;
      stage.container().style.cursor = spaceDown ? "grab" : "";
    }
  });

  // --- Brightness slider ---
  const brightnessEl = root.querySelector("#brightness") as HTMLInputElement;
  brightnessEl.value = String(scene.brightness ?? 50);
  brightnessEl.addEventListener("input", () => {
    scene = { ...scene, brightness: Number(brightnessEl.value) };
    drawTint();
    scheduleSave();
  });
  // Snapshot for undo only once the user releases the slider.
  brightnessEl.addEventListener("change", () => {
    commit();
  });
  // Double-click resets to neutral (50) — the original photo brightness.
  brightnessEl.addEventListener("dblclick", () => {
    brightnessEl.value = "50";
    scene = { ...scene, brightness: 50 };
    drawTint();
    scheduleSave();
    commit();
  });

  // --- Photo upload ---
  const upBtn = root.querySelector("#upload-btn") as HTMLElement;
  const upFile = root.querySelector("#upload-file") as HTMLInputElement;
  upBtn?.addEventListener("click", () => upFile.click());
  upFile?.addEventListener("change", async () => {
    const file = upFile.files?.[0];
    if (!file) return;
    const { path, url } = await api.uploadPhoto(file);
    const img = await loadHTMLImage(url);
    await api.updateDesign(design.id, { photoPath: path, photoW: img.naturalWidth, photoH: img.naturalHeight });
    design.photoUrl = url;
    design.photoW = img.naturalWidth;
    design.photoH = img.naturalHeight;
    (root.querySelector("#empty") as HTMLElement).style.display = "none";
    await loadPhoto(url, img.naturalWidth, img.naturalHeight);
    redrawScene();
  });

  // ============================================================
  // Drawing interaction
  // ============================================================

  function newPreview(pts: number[]) {
    drawPreview?.destroy();
    drawPreview = new Konva.Line({
      points: pts,
      stroke: previewColor(),
      strokeWidth: Math.max(1.5, 0.05 * pxPerFoot(activeYs())),
      lineCap: "round",
      lineJoin: "round",
      opacity: 0.65,
      dash: [6, 4],
      listening: false,
    });
    drawLayer.add(drawPreview);
  }

  function previewColor(): string {
    const c = COLORS.find((cc) => cc.id === tool.colorPattern[0]);
    return c?.hex ?? "#ffffff";
  }

  function commitWreath(p: { x: number; y: number }) {
    const wreath: WreathItem = {
      id: cryptoId(),
      kind: "wreath",
      x: p.x,
      y: p.y,
      sizeIn: tool.wreathSizeIn,
      withLights: tool.wreathWithLights,
      withBow: tool.wreathWithBow,
      yardstickId: activeYs()?.id ?? null,
    };
    scene = { ...scene, items: [...scene.items, wreath] };
    scheduleSave();
    commit();
  }

  function commitBow(p: { x: number; y: number }) {
    const bow: BowItem = {
      id: cryptoId(),
      kind: "bow",
      x: p.x,
      y: p.y,
      sizeIn: tool.bowSizeIn,
      yardstickId: activeYs()?.id ?? null,
    };
    scene = { ...scene, items: [...scene.items, bow] };
    scheduleSave();
    commit();
  }

  function commitStrand(points: number[]) {
    if (points.length < 4) return; // need at least 2 distinct points
    const strand: StrandItem = {
      id: cryptoId(),
      kind: "strand",
      bulbType: tool.bulbType,
      spacingIn: tool.spacingIn,
      drawingStyle: tool.drawingStyle,
      colorPattern: [...tool.colorPattern],
      points: [...points],
      yardstickId: activeYs()?.id ?? null,
      ...permPropsForNewStrand(),
    };
    scene = { ...scene, items: [...scene.items, strand] };
    scheduleSave();
    commit();
  }

  // Only include perm-specific props on perm-light strands so other types
  // don't carry meaningless data.
  function permPropsForNewStrand(): Partial<Strand> {
    if (tool.bulbType !== "permanent") return {};
    return {
      beamLengthFt: tool.beamLengthFt,
      beamWidthFt: tool.beamWidthFt,
      distanceToSurfaceFt: tool.distanceToSurfaceFt,
      opacity: tool.opacity,
      showCoverage: tool.showCoverage,
    };
  }

  // Creates one strand per straight segment from a polyline (used by Trace mode so
  // each click→click line is its own editable strand). One history entry covers
  // all of them so a single Undo removes the whole trace.
  function commitTraceSegments(polyline: number[]) {
    const newStrands: StrandItem[] = [];
    for (let i = 0; i + 4 <= polyline.length; i += 2) {
      const seg = polyline.slice(i, i + 4);
      // Reject zero-length segments (consecutive clicks at the same spot).
      if (Math.hypot(seg[2] - seg[0], seg[3] - seg[1]) < 4) continue;
      newStrands.push({
        id: cryptoId(),
        kind: "strand",
        bulbType: tool.bulbType,
        spacingIn: tool.spacingIn,
        drawingStyle: "trace",
        colorPattern: [...tool.colorPattern],
        points: seg,
        yardstickId: activeYs()?.id ?? null,
        ...permPropsForNewStrand(),
      });
    }
    if (newStrands.length === 0) return;
    scene = { ...scene, items: [...scene.items, ...newStrands] };
    scheduleSave();
    commit();
  }

  function commitSingle(p: { x: number; y: number }) {
    const strand: StrandItem = {
      id: cryptoId(),
      kind: "strand",
      bulbType: tool.bulbType,
      spacingIn: tool.spacingIn,
      drawingStyle: "single",
      colorPattern: [...tool.colorPattern],
      points: [p.x, p.y],
      yardstickId: activeYs()?.id ?? null,
      ...permPropsForNewStrand(),
    };
    scene = { ...scene, items: [...scene.items, strand] };
    scheduleSave();
    commit();
  }

  // ===== Garland commits =====
  // Garland is a strand-like polyline. Same UX as strand drawing: Strand mode
  // makes a single straight piece, Trace splits into per-segment pieces (so
  // each click→click is independently editable), Single drops one stamp.
  function commitGarland(points: number[]) {
    if (points.length < 4) return;
    const g: GarlandItem = {
      id: cryptoId(),
      kind: "garland",
      drawingStyle: "strand",
      withLights: tool.garlandWithLights,
      sizeIn: tool.garlandSizeIn,
      points: [...points],
      yardstickId: activeYs()?.id ?? null,
    };
    scene = { ...scene, items: [...scene.items, g] };
    scheduleSave();
    commit();
  }

  function commitGarlandSingle(p: { x: number; y: number }) {
    const g: GarlandItem = {
      id: cryptoId(),
      kind: "garland",
      drawingStyle: "single",
      withLights: tool.garlandWithLights,
      sizeIn: tool.garlandSizeIn,
      points: [p.x, p.y],
      yardstickId: activeYs()?.id ?? null,
    };
    scene = { ...scene, items: [...scene.items, g] };
    scheduleSave();
    commit();
  }

  // Split a Trace polyline into one GarlandItem per click→click segment so
  // each piece is independently selectable / movable / deletable — mirrors
  // strand commitTraceSegments. One commit() snapshot covers the whole batch
  // so a single Undo removes the entire trace.
  function commitGarlandTraceSegments(polyline: number[]) {
    const newGarlands: GarlandItem[] = [];
    for (let i = 0; i + 4 <= polyline.length; i += 2) {
      const seg = polyline.slice(i, i + 4);
      if (Math.hypot(seg[2] - seg[0], seg[3] - seg[1]) < 4) continue;
      newGarlands.push({
        id: cryptoId(),
        kind: "garland",
        drawingStyle: "trace",
        withLights: tool.garlandWithLights,
        sizeIn: tool.garlandSizeIn,
        points: seg,
        yardstickId: activeYs()?.id ?? null,
      });
    }
    if (newGarlands.length === 0) return;
    scene = { ...scene, items: [...scene.items, ...newGarlands] };
    scheduleSave();
    commit();
  }

  // True when the current draw context is for garland. Garland lives under
  // Decor in the sidebar but draws like a strand (Strand/Trace/Single styles).
  function drawingGarland(): boolean {
    return tool.category === "decor" && tool.decorType === "garland";
  }

  function cancelInProgress() {
    dragPts = null;
    tracePts = null;
    drawPreview?.destroy();
    drawPreview = null;
    if (creatingYardstick) {
      drawLayer.find(".ys-preview").forEach((n) => n.destroy());
      ysDragStart = null;
      creatingYardstick = false;
      stage.container().style.cursor = toolMode === "select" ? "crosshair" : "";
    }
    if (marqueeStart) {
      marqueeStart = null;
      marqueePreview?.destroy();
      marqueePreview = null;
    }
    drawLayer.batchDraw();
  }

  function finishTrace() {
    if (!tracePts) return;
    // Drop the trailing cursor-tracking point (it's a duplicate of the last committed point
    // updated on mousemove). Keep all committed clicks.
    const committed = tracePts.slice(0, -2);
    if (drawingGarland()) {
      // Per-segment: each click→click becomes its own GarlandItem so they're
      // independently editable. One Undo still removes the whole trace.
      commitGarlandTraceSegments(committed);
    } else {
      // Split the polyline so each click→click segment becomes its own strand,
      // making them independently editable (move/resize/recolor/etc.).
      commitTraceSegments(committed);
    }
    tracePts = null;
    drawPreview?.destroy();
    drawPreview = null;
    redrawScene();
  }

  stage.on("mousedown touchstart", (e) => {
    if (!bgImageNode) return;
    if (panDragStart) return; // pan in progress
    if (spaceDown) return;

    // Yardstick creation mode: drag a rect.
    if (creatingYardstick) {
      const p = imagePoint();
      if (!p) return;
      ysDragStart = p;
      return;
    }

    // Click on an existing yardstick (to drag it) — don't start drawing.
    if (e.target.findAncestor(".yardstick", true)) return;

    // Click on a strand group — selection handler runs; suppress draw.
    // EXCEPT when a trace polyline is in progress: that click must continue the
    // trace, not select. The strand's own click handler is guarded to skip
    // selection while tracing, and we want to fall through to the trace logic.
    if (e.target.findAncestor(".strand", true) && !tracePts) return;

    // Click on an existing wreath — let its click handler select it; don't draw.
    if (e.target.findAncestor(".wreath", true)) return;

    // Click on an existing bow — same deal.
    if (e.target.findAncestor(".bow", true)) return;

    // Click on an existing garland — let its click handler select it; don't draw.
    // (Exception while a trace is in progress, same as for strands.)
    if (e.target.findAncestor(".garland", true) && !tracePts) return;

    // Click on either Transformer (anchor handles) — suppress draw.
    if (e.target.findAncestor("Transformer", true)) return;

    // Select-tool mode: drag a marquee rectangle, filtered by current bulb type.
    if (toolMode === "select") {
      const p = imagePoint();
      if (!p || !inPhoto(p)) return;
      marqueeStart = p;
      marqueePreview?.destroy();
      marqueePreview = new Konva.Rect({
        x: p.x, y: p.y, width: 0, height: 0,
        stroke: "#4f8cff", strokeWidth: 2, dash: [6, 4],
        fill: "rgba(79,140,255,0.12)",
        listening: false,
        name: "marquee",
      });
      drawLayer.add(marqueePreview);
      drawLayer.batchDraw();
      return;
    }

    // Click on the empty photo background → deselect any current selection.
    if (selectedIds.size > 0 || selectedYardstickId) {
      clearSelection();
      return;
    }

    const p = imagePoint();
    if (!p || !inPhoto(p)) return;

    // Decor: wreath/bow place on a single click. Garland falls through to the
    // strand-like drawing pipeline below (Strand / Trace / Single).
    if (tool.category === "decor" && tool.decorType !== "garland") {
      if (tool.decorType === "wreath") commitWreath(p);
      else if (tool.decorType === "bow") commitBow(p);
      redrawScene();
      return;
    }

    if (tool.drawingStyle === "single") {
      if (drawingGarland()) commitGarlandSingle(p);
      else commitSingle(p);
      redrawScene();
      return;
    }

    if (tool.drawingStyle === "trace") {
      if (!tracePts) {
        // First click: start the polyline. Last pair tracks the cursor.
        tracePts = [p.x, p.y, p.x, p.y];
        newPreview(tracePts);
      } else {
        // Subsequent click: lock the current cursor pair as a committed point,
        // then add a new cursor-tracking pair on top.
        tracePts[tracePts.length - 2] = p.x;
        tracePts[tracePts.length - 1] = p.y;
        tracePts.push(p.x, p.y);
        drawPreview?.points([...tracePts]);
      }
      drawLayer.batchDraw();
      return;
    }

    // "strand" mode — click-drag straight line.
    dragPts = [p.x, p.y, p.x, p.y];
    newPreview(dragPts);
  });

  stage.on("mousemove touchmove", () => {
    if (marqueeStart && marqueePreview) {
      const p = imagePoint();
      if (!p) return;
      const x = Math.min(p.x, marqueeStart.x);
      const y = Math.min(p.y, marqueeStart.y);
      const w = Math.abs(p.x - marqueeStart.x);
      const h = Math.abs(p.y - marqueeStart.y);
      marqueePreview.setAttrs({ x, y, width: w, height: h });
      drawLayer.batchDraw();
      return;
    }
    if (creatingYardstick && ysDragStart) {
      const p = imagePoint();
      if (!p) return;
      const w = Math.abs(p.x - ysDragStart.x);
      const h = Math.abs(p.y - ysDragStart.y);
      const x = Math.min(p.x, ysDragStart.x);
      const y = Math.min(p.y, ysDragStart.y);
      drawLayer.find(".ys-preview").forEach((n) => n.destroy());
      const preview = new Konva.Rect({
        x, y, width: w, height: h,
        stroke: "#4f8cff", strokeWidth: 2, dash: [6, 4],
        fill: "rgba(79,140,255,0.1)",
        listening: false,
        name: "ys-preview",
      });
      drawLayer.add(preview);
      drawLayer.batchDraw();
      return;
    }

    const p = imagePoint();
    if (!p) return;

    if (tool.drawingStyle === "trace" && tracePts) {
      tracePts[tracePts.length - 2] = p.x;
      tracePts[tracePts.length - 1] = p.y;
      drawPreview?.points([...tracePts]);
      drawLayer.batchDraw();
      return;
    }

    if (tool.drawingStyle === "strand" && dragPts) {
      dragPts[dragPts.length - 2] = p.x;
      dragPts[dragPts.length - 1] = p.y;
      drawPreview?.points([...dragPts]);
      drawLayer.batchDraw();
    }
  });

  stage.on("mouseup touchend", () => {
    if (marqueeStart && marqueePreview) {
      const p = imagePoint();
      if (p) {
        const x1 = Math.min(p.x, marqueeStart.x);
        const y1 = Math.min(p.y, marqueeStart.y);
        const x2 = Math.max(p.x, marqueeStart.x);
        const y2 = Math.max(p.y, marqueeStart.y);
        if (x2 - x1 > 3 && y2 - y1 > 3) {
          selectMatchingInRect(x1, y1, x2, y2);
        } else {
          // Treat tiny marquee as a click on empty bg → deselect.
          clearSelection();
        }
      }
      marqueePreview.destroy();
      marqueePreview = null;
      marqueeStart = null;
      drawLayer.batchDraw();
      return;
    }
    if (creatingYardstick && ysDragStart) {
      const p = imagePoint();
      if (p) {
        const w = Math.abs(p.x - ysDragStart.x);
        const h = Math.abs(p.y - ysDragStart.y);
        if (w > 8 && h > 4) {
          const ys: Yardstick = {
            id: cryptoId(),
            realFeet: pendingYsFeet,
            x: Math.min(p.x, ysDragStart.x),
            y: Math.min(p.y, ysDragStart.y),
            width: w,
            height: h,
          };
          scene = { ...scene, yardsticks: [...scene.yardsticks, ys] };
          activeYardstickId = ys.id;
          scheduleSave();
          commit();
        }
      }
      drawLayer.find(".ys-preview").forEach((n) => n.destroy());
      ysDragStart = null;
      creatingYardstick = false;
      stage.container().style.cursor = "";
      redrawScene();
      return;
    }

    if (tool.drawingStyle === "strand" && dragPts) {
      // Reject too-short drags as accidental clicks.
      const dx = dragPts[2] - dragPts[0];
      const dy = dragPts[3] - dragPts[1];
      if (Math.hypot(dx, dy) >= 6) {
        if (drawingGarland()) commitGarland(dragPts);
        else commitStrand(dragPts);
      }
      dragPts = null;
      drawPreview?.destroy();
      drawPreview = null;
      redrawScene();
    }
  });

  // Trace mode: leaving the photo finishes the polyline.
  stage.on("mouseleave", () => {
    if (tool.drawingStyle === "trace") finishTrace();
  });
  // Double-click also finishes (extra safety / convention).
  stage.on("dblclick", () => {
    if (tool.drawingStyle === "trace") finishTrace();
  });

  // Keyboard:
  //   Esc / Enter while tracing → commit the polyline.
  //   Esc otherwise → clear selection or cancel in-progress action.
  //   Delete / Backspace → delete selected strands.
  const keyHandler = (e: KeyboardEvent) => {
    // Ignore keystrokes that target form inputs (the design title field, etc).
    const tag = (document.activeElement as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;

    // Undo / redo — Ctrl+Z (or Cmd+Z) and Ctrl+Shift+Z (or Cmd+Shift+Z) / Ctrl+Y.
    const meta = e.ctrlKey || e.metaKey;
    if (meta && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (meta && e.key.toLowerCase() === "y") {
      e.preventDefault();
      redo();
      return;
    }

    if (e.key === "Escape" || e.key === "Enter") {
      if (tool.drawingStyle === "trace" && tracePts) {
        finishTrace();
      } else if (e.key === "Escape") {
        if (selectedIds.size > 0) {
          clearSelection();
        } else {
          cancelInProgress();
        }
      }
    }
    if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.size > 0) {
      deleteSelected();
      e.preventDefault();
    }
  };
  window.addEventListener("keydown", keyHandler);

  // --- Resize ---
  const ro = new ResizeObserver(() => {
    if (bgImageNode) fitStage(bgImageNode.width(), bgImageNode.height());
    else stage.size({ width: stageWrap.clientWidth, height: stageWrap.clientHeight });
    drawLayer.batchDraw();
    bgLayer.batchDraw();
    tintLayer.batchDraw();
  });
  ro.observe(stageWrap);

  // --- Cleanup on navigation away ---
  const onHash = () => {
    window.removeEventListener("keydown", keyHandler);
    window.removeEventListener("hashchange", onHash);
    ro.disconnect();
  };
  window.addEventListener("hashchange", onHash);

  // Re-apply the saved defaults for whatever item type is currently active.
  // Called at init and again every time the user picks a different category
  // or sub-type in the draw sidebar — so each type's "feel" follows Settings.
  function applyDefaultsForCurrentType() {
    if (tool.category === "decor" && tool.decorType === "garland") {
      const entry = savedDefaults?.["garland"];
      if (!entry || typeof entry !== "object") return;
      if (typeof entry.sizeIn === "number") tool.garlandSizeIn = entry.sizeIn;
      if (typeof entry.withLights === "boolean") tool.garlandWithLights = entry.withLights;
      if (typeof entry.drawingStyle === "string") {
        const ds = entry.drawingStyle;
        if (ds === "strand" || ds === "trace" || ds === "single") tool.drawingStyle = ds;
      }
      return;
    }
    if (tool.category === "lights") {
      const entry = savedDefaults?.[tool.bulbType];
      if (!entry || typeof entry !== "object") return;
      if (typeof entry.spacingIn === "number") tool.spacingIn = entry.spacingIn;
      if (typeof entry.drawingStyle === "string") {
        const ds = entry.drawingStyle;
        if (ds === "strand" || ds === "trace" || ds === "single") tool.drawingStyle = ds;
      }
      if (Array.isArray(entry.colorPattern) && entry.colorPattern.length > 0) {
        const cp = entry.colorPattern.filter((c): c is string => typeof c === "string");
        if (cp.length > 0) {
          tool.colorPattern = cp;
          tool.pickerColorId = cp[0];
        }
      }
      if (typeof entry.beamLengthFt === "number") tool.beamLengthFt = entry.beamLengthFt;
      if (typeof entry.beamWidthFt === "number") tool.beamWidthFt = entry.beamWidthFt;
      if (typeof entry.distanceToSurfaceFt === "number") tool.distanceToSurfaceFt = entry.distanceToSurfaceFt;
      if (typeof entry.opacity === "number") tool.opacity = entry.opacity;
      if (typeof entry.showCoverage === "boolean") tool.showCoverage = entry.showCoverage;
    } else if (tool.category === "decor" && tool.decorType === "wreath") {
      const entry = savedDefaults?.["wreath"];
      if (!entry || typeof entry !== "object") return;
      if (typeof entry.sizeIn === "number") tool.wreathSizeIn = entry.sizeIn;
      if (typeof entry.withLights === "boolean") tool.wreathWithLights = entry.withLights;
      if (typeof entry.withBow === "boolean") tool.wreathWithBow = entry.withBow;
      if (Array.isArray(entry.colorPattern) && entry.colorPattern.length > 0) {
        const first = entry.colorPattern[0];
        if (typeof first === "string") tool.wreathColorId = first;
      }
    } else if (tool.category === "decor" && tool.decorType === "bow") {
      const entry = savedDefaults?.["bow"];
      if (!entry || typeof entry !== "object") return;
      if (typeof entry.sizeIn === "number") tool.bowSizeIn = entry.sizeIn;
    }
  }

  // --- Init ---
  // Load the live color palette + per-type defaults from the server.
  // Both fall back silently to the hard-coded factory values if the fetch fails.
  try {
    const [colors, defaultsRes] = await Promise.all([
      api.getColors(),
      api.getDefaults(),
    ]);
    if (Array.isArray(colors) && colors.length > 0) setPalette(colors);
    savedDefaults = defaultsRes ?? {};
    applyDefaultsForCurrentType();
  } catch {
    // Stay on the static defaults if the fetch fails.
  }
  // Kick off image-asset preload (wreath, etc). Doesn't block — the renderer
  // shows a placeholder if the user places one before the file finishes loading.
  preloadAssets().then(() => requestCanvasRedraw());
  if (design.photoUrl && design.photoW && design.photoH) {
    await loadPhoto(design.photoUrl, design.photoW, design.photoH);
  }
  redrawScene();
}

function loadHTMLImage(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = url;
  });
}

function cryptoId(): string {
  return (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)).replace(/-/g, "").slice(0, 12);
}

function downloadStage(stage: Konva.Stage, bgImg: Konva.Image, name: string) {
  // Hide yardsticks so they don't end up in the exported image — they're tool UI, not design.
  const yardsticks = stage.find(".yardstick");
  const wasVisible = yardsticks.map((n) => n.visible());
  yardsticks.forEach((n) => n.visible(false));

  try {
    const w = bgImg.width();
    const h = bgImg.height();
    const bgLayer = stage.getLayers()[0];
    const dataUrl = stage.toDataURL({
      x: bgLayer.x(),
      y: bgLayer.y(),
      width: w * bgLayer.scaleX(),
      height: h * bgLayer.scaleY(),
      pixelRatio: 1 / bgLayer.scaleX(),
      mimeType: "image/jpeg",
      quality: 0.92,
    });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${name.replace(/[^a-z0-9\- ]/gi, "_")}.jpg`;
    a.click();
  } finally {
    yardsticks.forEach((n, i) => n.visible(wasVisible[i]));
    stage.batchDraw();
  }
}

function moonSvg() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
}
function sunSvg() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path></svg>`;
}
