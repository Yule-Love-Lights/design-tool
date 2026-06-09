---
name: project-integration
description: "The plan to integrate the DESIGN TOOL ([[project-design-tool]]) INTO the AI QUOTE TOOL ([[project-ai-quote-tool]]) — one unified platform for building a quote AND its on-photo light design, on both the quote-builder side and the customer portal side."
metadata: 
  node_type: memory
  type: project
  originSessionId: 6785d859-7e05-46c6-88e1-d6ae17b70ac5
---

> **What this is:** the captured vision + early architecture for merging Jason's two tools so a quote and its photoreal light design are built and shown in ONE place. Recorded 2026-06-05 (Session 3) from a long planning conversation + a live walkthrough of the quote tool's customer portal. **No implementation has started.** This is the groundwork doc that the eventual architecture plan builds on. Update it as ideas firm up.

Relates to: [[project-design-tool]] (the canvas/design tool, this repo) and [[project-ai-quote-tool]] (the separate Next.js + Supabase quoting app, `yll-quote-tool`).

## The core goal (Jason's words)
"Have everything in one place and avoid having to go to different platforms to make one quote." A staff member should build the quote AND the on-photo light design in the **same** app, and the customer should see/interact with that design in the portal. End product: a customer quote that includes a fully-designed picture of *their* house.

## THE architectural decision: Path B (confirmed Session 3)
Two integration paths were weighed:
- **Path A — embed-and-bridge:** drop the design editor into the quote page via iframe, keep its Fastify/SQLite backend, sync data over HTTP. Faster, but **two customer databases to keep in sync.** (Possible stepping-stone only.)
- **Path B — absorb the editor into the quote tool (CHOSEN):** extract the Konva editor as a reusable component running **inside the Next.js app**, store scenes in **Supabase alongside the quotes**. One app, one login, one customer record. Bigger lift but it's literally the thing Jason wants. **This is the end-state we're building toward.**

Implication: this tool's separate Fastify/`node:sqlite` backend and its own Clients→Projects→Designs hierarchy eventually **fold into the quote tool / Supabase**. The standalone design tool keeps existing, but the integrated copy lives in the quote app.

## Confirmed decisions (don't re-ask)
- **Unify into the quote tool (Path B).** Everything ends up in the quote tool / Supabase, one login.
- **Customer identity = the quote's customer.** A design-tool "client" IS the same entity as the quote customer / HighLevel contact. **This tool stops owning its own client list** and keys off the quote. (Kills the two-DB sync problem.)
- **The design is VISUAL-ONLY. It does NOT calculate pricing or footage.** Measurements come from the quote tool (which already measures via Street View/satellite vision OR takes manual staff input). The design tool's own feet-of-lights readout is irrelevant to the integration.
- **BUT design ⇄ line items are linked both ways:** add an item in the design (e.g. a wreath) → it adds that wreath to the quote's line items (raising the total); delete it from the design → it removes that line item (lowering the total). And on the portal, toggling a line item off hides the matching item in the design. This linkage is the heart of the integration (see below).
- **Auto-scale from the quote's measurements** is wanted: if the quote knows the roofline is X ft and it spans Y px in the photo, derive pixels-per-foot automatically. **Also keep the manual yardstick** as an override for when the roofline measurement is unreliable.
- **Reuse the quote tool's Claude Vision** (it already finds rooflines) to seed the design's roofline.
- **Phasing:** manual embedded editor FIRST, then the AI auto-design. (Auto-design is the harder, fuzzier piece and builds on the manual path.)
- **Replace the portal's AI render with our design** to save money + time (the current Gemini/FLUX render costs money and takes up to ~90s).

## Builder-side vision (the quote-building staff experience)
1. **Embedded design editor** lives on the quote-builder page (a self-contained area). Image source = either a manual upload OR the **Street View image the quote tool already pulls** (it pulls Street View + satellite from Google Maps).
2. **Auto-design first pass:** when a house is pulled, an AI uses the design tool to lay out the install as best it can — outline the roofline (seeded by the quote's vision/measurements), wrap bushes/trees, place wreaths/spritzers/garland where they'd look good. Scale auto-set from known footage (manual yardstick override available). **Not expected to be perfect.**
3. **Staff refine** the auto-design — move lights, add/delete items, adjust brightness, etc. Because items ⇄ line items are linked, refining the design updates the quote's line items + total.
4. **Auto-populate records:** pull name/email/phone/address from the quote form → create the customer (if new) → create a project → add the pulled image as a design under them. **Timing TBD** — probably once customer info is entered or once the house is pulled (to iron out).
5. **Attach to quote:** the finished design (render + the editable scene) is attached to the customer's quote so it ships when the quote is sent.

## Portal-side vision (the customer experience)
Observed the live portal in Session 3 (see "Portal as it exists today" below). The vision:
- **Replace the static hero render** with the **live design** from our tool.
- The **"What's Included" / "Build Your Own"** toggle list filters the design's scene **live**: customer toggles a bush off → that bush's lights vanish from the picture; toggles spritzers on → spritzers appear. Each line item is bound to the exact scene item(s) it controls.
- **Color selection** is a planned future portal feature → maps to per-item color in the scene.
- Customers can select items + (future) colors. They **cannot** comment, request changes, or schedule. They click **Approve** → redirected to pay.

## THE crux: line-item ⇄ scene-item linkage
For any of this to work, every **quote line item** must be tied to the **specific design scene item(s)** it controls, with a stable ID/tag mapping:
- Toggle "9ft Noble Garland" off → that exact garland disappears from the render.
- Toggle a specific "Bush – canopy wrap" off → that one bush's strand disappears.
- Add a wreath in the builder → a "Noble Wreath" line item appears on the quote.

The design's scene JSON (`{ yardsticks[], items[], brightness }`, items = discriminated union by `kind`) already holds every quoted item; the portal "build your own" interaction is essentially **a visibility filter over that scene driven by the customer's selections.** This dovetails with the already-planned **`surface` tag on items + `GET /api/designs/:id/export`** roadmap item (see [[project-ai-quote-tool]]).

## Roofline packages: Santa's Roofline vs Gingerbread (Jason's definitions)
- **Santa's Roofline** = the FRONT of the house only: roof edges/eaves + the rakes on front-facing gables.
- **Gingerbread** = Santa's Roofline **PLUS** the left & right sides of the roof **and the ridge** — so at night from the street, every roof edge reads as outlined.
- **Modeling consequence:** Gingerbread is a **superset** of Santa's Roofline, not an independent item. Represent the *whole* roof outline as strand segments and **tag each segment by package level** (front edges = "santas-roofline"; sides+ridge = "gingerbread-only"). Then Santa's-vs-Gingerbread is a **visibility filter on segments**, and the two line items behave as mutually-exclusive tiers. (Same tagging mechanism as the general line-item linkage + the `surface` tag.)

## Technical enablers we'll need
- **Headless / server-side renderer.** Today the final JPG is produced in-browser (Konva `stage.toDataURL`). For attaching/sending designs and for the automated pipeline we need to rasterize a scene onto the photo **server-side** (no browser). Overlaps with the planned `rendered_jpg_url` in the export blob.
- **Live canvas in the portal.** The hero can't stay a static image — it must be a **live render that re-renders as toggles change** (filter the scene by selected items). This is the natural home for the embedded design tool on the portal page.
- **Unified auth.** The embedded editor must not be a second login — swap this tool's Fastify session for the quote tool's auth (Supabase) — covered by Path B.
- **Auto-design pipeline (phase 2+):** vision → scene generation (locate roofline/surfaces, place items) + an auto-scale step from the quote's footage. The hardest part (finding the roofline) largely exists in the quote tool's Claude Vision already. Mitigate placement accuracy with a **render → inspect → correct loop**.

## Phasing (agreed direction)
1. **Manual embedded editor** in the quote builder (lower risk, immediately useful).
2. **Portal live-design** replacing the static render + toggle→scene filtering.
3. **AI auto-design** from the Street View image (builds on 1 & 2).
4. Polish: color selection in portal, package refinement (A/B/C/D), etc.

## Portal as it exists today (observed live, Session 3)
Quote tool runs locally (Next.js dev) at **localhost:3000** — NOTE this is the same port as this tool's Fastify API, the source of the IPv6/IPv4 port-collision we hit (see [[project-design-tool]] dev notes). Portal URL pattern: **`/portal/<quoteId>`** (test quote viewed: `4fe4936c-26fc-4ff4-b5a1-f2d4f2fc1e89`, customer "naldoven").

**Page sections, top to bottom:**
1. **Hero** — full-bleed **render of the lit house** (currently a STATIC AI-rendered/placeholder image — a past install, not the customer's real house) + "Here's your home, <name>." + price/deposit + **package picker**.
2. **Walkthrough from Naldo** — a recorded explainer video.
3. **"What's Included — line by line"** — the toggle list. Copy: "Toggle anything off to remove it and we'll update your total automatically."
4. **Optional add-ons** — Rush install +$150, Premium takedown +$150 (checkboxes).
5. **Order summary** — Subtotal / Tax / Total / Deposit today (50%) + a **$1,000 season minimum** gate ("add $X more to approve").
6. **Marketing/trust** — guarantees ("Your protection"), "What happens next" (4 steps), About, Google reviews (4.9★, 187), Completed work, Giving-back, FAQ, "Text Naldo" contact.

**Packages (hero "TAP TO RE-ILLUMINATE"):** Tier A *Classic Glow* $597.44 · Tier B *Full Festive* $711.49 (most popular) · Tier C *The Full Yule* $1,357.81 · Custom *Build Your Own*. Selecting a tier sets which line items are on. **A/B/C/D are NOT meaningfully configured yet** — Jason says don't worry about them for now; refine later.

**Line items observed (Full Festive preset)** — these map ~1:1 to design-tool item kinds:
| Portal line item | Price | State | Design-tool item |
|---|---|---|---|
| Santa's Roofline | $550 | INCLUDED | strand (front roofline) |
| Gingerbread | $1,250 | OFF | strand (front + sides + ridge) |
| Bush – canopy wrap, 1 string ×3 | $35 ea | INCLUDED | strand (mini-light wrap) |
| 24" Spritzer | $95 | OFF | spritzer |
| 30" Noble Wreath – With Bow | $305 | OFF | wreath (withBow) |
| 9ft Noble Garland – With Bow | $195 | OFF | garland |

**Confirmed live behavior (tested by toggling the Spritzer, then reverted):** toggling an item updates the line item + subtotal/tax/total + deposit + the "$X to minimum" instantly; manually toggling switches the tier label to **"Build Your Own"** and does NOT snap back to a named tier even if contents match. **The hero render did NOT change when toggling** — confirming it's a fixed image today. *(That static image is exactly what our live design replaces.)*

## Open questions / to iron out
- **Timing** of customer/project/design auto-creation (on info-entry vs. on Street-View-pull).
- Exact **ID/tag scheme** linking a quote line item ↔ its scene item(s) (and how add/remove in the builder creates/removes line items + prices them — the design doesn't know prices, so the quote side owns the price when an item is added).
- How **Gingerbread/Santa's** mutual-exclusivity is enforced in both the line items and the segment tagging.
- Street View **perspective/scale** reliability for auto-scale; fallback to manual yardstick.
- Whether to store **only the render** or **render + editable scene** against the quote (almost certainly both — scene for editing, render for display/sending).
- Migration of this tool's editor into Next.js (build tooling, Konva in React, teardown/mount).

## Resolved design decisions (Session 3, cross-assistant)
These were nailed down in a relayed design conversation between THIS tool's assistant and the **quote tool's assistant** (Jason ferried messages between the two sessions). They sharpen the data contract enough to spec it once. Mirror this section into the quote tool's copy of the integration plan.

1. **Pricing-unit split (definitive — from the quote tool's pricing engine):** the **roofline (Santa's/Gingerbread) is priced PER FOOT** (measured footage × a difficulty rate, ~$8/$10/$12). **Everything else is per-unit** (mini-lights per string, wreaths/spritzers/garland/bushes/etc. per item).
2. **Two projection rules (not one):**
   - **Per-unit items → projection-from-scene.** A line item = group the tagged scene instances → count → price from a price book keyed by type. Scene is master; geometry/scale is irrelevant to their price. (The "design is visual-only / measurements come from the quote" tension fully dissolves for these.)
   - **Roofline → projection-from-measurement.** Price = `santasFootage` / `gingerbreadFootage` × rate, owned by the **measurement**, NOT the scene's pixels. The **scene owns only the visual + the toggle binding** (front segments vs sides+ridge segments). Both are **co-derived from the same vision pass → born consistent.** A staff *visual* tweak to the roofline intentionally does **not** reprice; to change the price you edit the *measurement* (the quote tool already supports manual measurement input). This is by design, not drift.
3. **Canonical item list = projection-from-scene (THE keystone).** The scene is the master list of *what items exist*; the quote owns a **price book** keyed by item-type/tag; line items are a **derived projection** (group → count → price); **portal selection = `included` flags on scene items.** This kills the bidirectional-sync drift risk. "Quote exists before a design" is resolved by **always creating a scene up front** (the same analysis that produces the quote tool's detections produces the scene). NOTE: this is a real **inversion of the quote tool's core** (today its line items come from AI measurement → pricing engine with no scene) → **scope it as core work, not glue.** BUT the inversion only applies to the **discrete per-unit items**; the **roofline keeps the existing measurement → pricing flow untouched** (it just gains a scene-segment visual binding), so the scary part doesn't get re-plumbed.
4. **Cardinality = sets.** A line item maps to a **set** of scene items. Discrete items = 1-element sets (per-instance: 3 bushes = 3 separate $35 lines = 3 strands). The **roofline = 1 line item ↔ many tagged segments.** Quantity = count of tagged instances (3→2 bushes removes one specific tagged strand).
5. **Roofline = a single tier enum (`none | santas | gingerbread`), NOT two independent toggles.** Gingerbread is a **superset** of Santa's (front + sides + ridge), so "Gingerbread on / Santa's off" and "both on" are invalid. A tier enum enforces mutual-exclusivity + the superset relationship at the data level even though the portal *renders* two rows. Discrete items stay independent `included` flags.
6. **Phase-4 tag alignment (already shipped on the quote side — the big unlock).** The quote tool's AI already classifies **front gutter = Santa's, sides + ridge = Gingerbread**, and its engine already splits `santasFootage` (front) vs `gingerbreadFootage` (ridge+sides) — the exact front/sides tag split the design's roofline segments would carry. So the roofline binding ≈ **associating their existing footage split with our segment tags** — minimal new modeling, and the hardest-priced item is the most-aligned.
7. **Headless renderer deferred (maybe-never).** Capture the live browser canvas (`stage.toDataURL()` → **Supabase Storage**) at save/approve time covers the emailed quote, CRM thumbnails, and the approval snapshot. The quote tool already has a Storage bucket + approval-snapshot mechanism it slots into. A *true* server-side rasterizer is only needed for a fully unattended (no-browser) pipeline — i.e. the Phase-4 auto-design.
8. **Bake the linkage + `included` fields into the Phase-1 Supabase schema** even though the portal (Phase 2) is what uses them — so Phase 2 isn't a migration.
9. **Shared, evolving editor core (SUPERSEDES the earlier "freeze after port" — reversed Session 3).** Jason wants BOTH editors to keep evolving — he may host the design tool on its **own site** for **no-quote** designs. Direction: keep a **storage-agnostic shared editor core** (Scene types + per-item renderers + a framework-neutral controller/engine) that touches storage ONLY through a small **adapter** interface (load/save scene, photo, uploads, colors, defaults); each app supplies its own adapter (Fastify/SQLite here, Supabase there) + its own surrounding shell/UI. Keep the core copy-compatible — ideally byte-identical in a shared folder — heading toward a **shared npm package** both apps install. So: "edit once, copy across (→ shared package)," NOT "vendor once and freeze."
10. **Port reality.** The per-item Konva renderers (`client/src/editor/*.ts`) are framework-agnostic and portable; **`editor.ts` is the real port work** (window listeners, undo/redo, Transformer, marquee, copy-paste, autosave, ResizeObserver). The existing `renderEditor(root, id, {embedded, onBack}) → destroy()` mount/teardown seam is the React lifecycle hook.

### Agreed sequencing (both assistants)
1. **Spec the data-contract doc FIRST (on paper, the keystone):** Supabase scene storage against a quote + the exact line-item⇄scene-item ID/tag scheme (incl. roofline segment tags + the tier enum + the price-book + the two projection rules).
2. **Phase 1 — manual editor in the quote builder:** port the Konva editor into Next.js as a React component, scenes in Supabase, no AI, no portal. De-risks the port; immediately useful.
3. **Phase 2 — portal live-design + toggle→scene filter:** the static AI render dies here; the linkage pays off.
4. **Phase 3/4 — AI auto-design last** (the fuzzy part; builds on 1–3).

**Next artifact:** the data-contract doc — **DONE / LOCKED (v0.2, build-ready)**, see [[project-integration-data-contract]] (`project_integration_data_contract.md`). Authored on the quote-tool side, mirrored here verbatim. Spec only — no implementation until Jason says go.

## Design-side vendoring notes (for the quote-tool Phase 1 port)
When the quote tool ports the editor (Path B), it **vendors** (= copies into its own repo) the design tool's TypeScript type definitions rather than depending on this tool's server. Facts the design side confirmed (Session 3):
- **Canonical source = `client/src/api.ts`.** Holds all shared types (`Yardstick`, `BulbType`, `DrawingStyle`, `ItemBase`, the 8 item variants, the `SceneItem` union, `Scene`, `Design`, `BulbColor`, `ToolDefaults`) + the `isStrand/isWreath/…` guards. **Vendor the type defs + guards; DROP the `api`/`req` fetch client** (those hit the Fastify REST endpoints, which go away under Path B). Types are pure TS, zero runtime deps.
- **Shared evolving core (NOT "vendor once" — decision #9 was reversed).** Both editors keep evolving; the goal is a storage-agnostic shared core kept in sync (→ shared package), not a frozen one-time copy. The quote tool still copies the types to start Phase 1, but the shared folder is **kept in sync, not frozen.** (The only Scene-shape changes coming are still the contract §4 binding fields, authored quote-side.)
- **Base-shape facts to honor in the Supabase jsonb:**
  - `points` = flat `number[]` `[x0,y0,x1,y1,…]` (strand + garland), NOT `[{x,y}]`.
  - Coords are in **photo-pixel space**; the design row carries `photo_w`/`photo_h`; real-world sizing via the bound yardstick's px-per-foot.
  - Colors stored as **IDs, not hex** — `colorPattern: string[]` (strand/spritzer) + `colorId` (text/wreath), resolved via the `BulbColor` palette.
  - `ItemBase.yardstickId` is `string | null`.
  - Back-compat defaults: `WreathItem.withBow` missing ⇒ `true`; `GarlandItem.sizeIn` missing ⇒ ~9.6″; `WreathItem.colorId` is legacy/unused.
  - Greenfield Supabase: start with `items[]`; skip the legacy `{strands:[]}` shape (a Fastify-side migration, irrelevant to the quote tool).

## Post-lock updates (Session 3, later)
- **"Freeze after port" is OFF** (decision #9, reversed): both editors evolve; target a **storage-agnostic shared editor core → shared package.** The Phase-1 refactor introduces a single **storage adapter** boundary so the core is identical across apps and only the adapter differs (Fastify/SQLite ↔ Supabase). Open sub-decision (being agreed): how much UI lives in the shared core — the canvas + scene + renderers + a framework-neutral *engine* are cleanly shareable; the sidebar/panels are the gray area (vanilla DOM today vs. React/Tailwind on the quote side). Leaning toward a **headless engine + app-specific panels** as the true shared-package shape. Shared-core folder layout: being agreed.
- **Design is now an independent record (quote side):** a design has its **own ID** + an **OPTIONAL** `quote_id` (nullable, ON DELETE SET NULL), linked when the operator clicks "Calculate Quote"; **≤1 design per linked quote** (partial unique index), unlimited unlinked. Supports "design before the quote exists" + the future standalone no-quote design-tool site. The contract's **§3 was amended quote-side (their S4) and re-mirrored here** (`project_integration_data_contract.md`, hash-verified). Their S4 also reports the Supabase `designs` table + bucket + routes (`POST /api/designs`, `GET|PUT /api/designs/[id]`, `POST /api/designs/[id]/photo`) are **built + smoke-tested**, mapping 1:1 to our proposed `EditorStorage` adapter.

## A1 — binding-tag editor controls (status + remaining plan, checkpointed Session 3)
A1 adds gated "Quote binding" controls to the editor so staff tag scene items for line-item projection. **Key principle (Jason, S3/S4): drawn item size is VISUAL ONLY — the billed spec is explicit staff-set `quote*` fields, NOT the drawn size** (a 60" drawn wreath may be a 30" Noble). **Approach: the design tool writes the canonical gated `editor.ts` A1; the quote tool copies it verbatim (byte-identical) and owns the quote-side types/projection/builder/portal. Their copy also resolves their `[yll]` markers automatically.**

- ✅ **DONE — types + flag** (committed `bf7579d`, revised to the locked block in `66098c9`; `tsc` clean). In `client/src/api.ts` (must match the quote tool's `sceneTypes` member-for-member):
  `Surface = santas-roofline|gingerbread|winter-wonderland|bush|tree|column` · `Tier = labor|bow|fullDecor` · `WrapStyle = canopy|trunk` · `QuoteSpritzerSize = 16|24|32` · `QuoteWreathSize = 24noble|30noble|36noble|48noble|36oregon` · `QuoteGarlandLength = 4.5ft|9ft`.
  Fields: ItemBase `+ surface?: Surface|null; included?: boolean` · StrandItem `+ stringCount?; wrapStyle?` · SpritzerItem `+ quoteSize?: QuoteSpritzerSize` · WreathItem `+ quoteSize?: QuoteWreathSize; tier?` · GarlandItem `+ quoteLength?; quoteSections?: number; tier?` (withBow kept = visual seed). `renderEditor` opts `+ showQuoteBinding?: boolean` (default false).

- ⬜ **REMAINING — the gated panel UI in `client/src/pages/editor.ts`.** Wrap each binding block in `${opts.showQuoteBinding ? \`…\` : ""}`, insert just before each panel's Duplicate/Delete `<section>`, wire via that panel's existing `update*` helper. Vanilla-DOM idiom: build HTML string → `querySelector`/`querySelectorAll` + `addEventListener` (copy the existing sections' style). The "Quote spec" control is SEPARATE from each panel's existing visual-size control. Panels + anchors:
  1. **Strand** (`renderSelectedSidebar` strand branch; HTML template ends ~2122; `updateSelected` ~2129): Surface picker keyed by bulb type (c9 → santas-roofline|gingerbread|winter-wonderland|none; mini → bush|tree|column|none) + Included; when surface ∈ {bush,tree,column} also Wrap style (canopy/trunk) + String count (number). `updateSelected((s)=>({...s, surface/wrapStyle/stringCount/included}))`.
  2. **Wreath** (`renderSelectedWreathSidebar` ~2254; `updateWreaths` ~2296): Quote size (24noble/30noble/36noble/48noble/36oregon) + Tier (labor/bow/fullDecor) + Included.
  3. **Garland** (`renderSelectedGarlandSidebar`; `updateGarlands` ~2458): Section length (4.5ft/9ft = quoteLength) + # sections (quoteSections, number) + Tier + Included.
  4. **Spritzer** (`renderSelectedSpritzerSidebar`; `updateSpritzers` ~2563): Quote size (16/24/32) + Included.
  5. **Creation defaults** (commit* ~3295–3490): `included:true`; spritzer `quoteSize:"24"`; wreath `quoteSize:"36noble"`,`tier:"bow"`; garland `quoteLength:"9ft"`,`quoteSections:1`,`tier:"fullDecor"`; mini strand `stringCount:1`,`wrapStyle:"canopy"`. Leave `surface` unset (operator tags).
  - Then `npx tsc --noEmit -p client/tsconfig.json`, commit, and relay the exact `editor.ts` diff to the quote tool to copy verbatim.

- **Follow-up for the quote tool:** the locked contract §4 binding-field list predates this type growth (no `quote*` fields; still lists garland `lengthFt`). They own the contract — bump §4 to the revised block; re-mirror `project_integration_data_contract.md` here when they do.

## A2 — mini-light area tool + railing grouping (v0.4 LOCKED; build plan, Session 3)
Adds two new ways to author a mini-light unit, each projecting to ONE priced mini line item (per-instance; sizing visual-only; same model as A1 mini strands). **Approach: design tool writes the canonical shared `editor.ts` + a NEW standalone renderer file; quote tool copies both verbatim and wires the renderer into its read-only portal renderer (`render-readonly.ts`).** Quote side already shipped: `projectScene` skip-logic + the v0.4 types (tsc + 94 tests green).

### Locked v0.4 types (match the quote tool's `sceneTypes` member-for-member)
- `export type MiniBilling = { wrapStyle?: WrapStyle; stringCount?: number };`
- `MiniAreaItem = ItemBase & MiniBilling & { kind:"miniArea"; shape:"box"|"polygon"; x?,y?,width?,height? (box); points?:number[] (polygon, flat, auto-closed on finish); density?:number (0–1 VISUAL fill, NOT a count) }` — `surface`+`included` inherited from ItemBase.
- `MiniGroupItem = ItemBase & MiniBilling & { kind:"miniGroup"; memberIds:string[] }` — **geometry-less** (extent = members); `surface`+`included` from ItemBase.
- `StrandItem` gains `groupId?: string` (backref; grouped strands are visual-only, skipped in projection).
- `SceneItem` union `+= MiniAreaItem | MiniGroupItem`; add guards `isMiniArea`/`isMiniGroup`.
- Decisions (design-tool calls, adopted): (a) railing group = `MiniGroupItem`; (b) density 0–1; (c) **bushes-first** (columns stay trunk-wrap strands; tree = optional canopy use).
- Projection skip-logic (quote side, shipped): grouped strand → skip · ungrouped mini strand w/ surface → 1 · `miniArea` → 1 · `miniGroup` → 1 (sceneItemIds = memberIds).

### Build progress (Session 3)
- ✅ **Types** (commit `2e62d2a`) — `MiniBilling`/`MiniAreaItem`/`MiniGroupItem`/`StrandItem.groupId`/union/guards, tsc clean.
- ✅ **Renderer + dispatch + bake** (commit `78b2506`) — `client/src/editor/miniArea.ts` (box+polygon scatter fill, seeded, density→count, lighten glow), wired into `redrawScene` dispatch (`miniGroup` → renders nothing, as intended) + `bakeTransformIntoMiniArea` (box position/resize, polygon drag). tsc clean.
- ✅ **miniArea authoring** (commit `7322e73`): Decor "Mini Area" sub-type — click-to-place a default ~3 ft box + Transformer resize, `renderSelectedMiniAreaSidebar` (density slider + gated Quote binding), creation defaults. tsc clean.
- ✅ **railing grouping** (commit `128c613`): "Group as one quote unit" on ≥2 mini strands → MiniGroupItem; selecting grouped strands shows `renderSelectedMiniGroupSidebar` (billed attrs + Ungroup); members keep `groupId` + render individually. tsc clean.
- **✅ A2 COMPLETE** (types `2e62d2a` · renderer `78b2506` · authoring `7322e73` · grouping `128c613`). Deferred minor follow-ups (low priority): box-DRAG + polygon-trace authoring (v1 uses click-place box; the renderer already *displays* polygons); a `miniArea` branch in `selectMatchingInRect` (marquee while in Mini-Area mode currently matches strands — harmless).

### REMAINING — design-tool build (the canonical shared editor.ts + new renderer)
1. **`client/src/editor/miniArea.ts`** (NEW file, like the other renderers — quote tool wires it into `render-readonly.ts` too): export a render fn matching the other renderers' signatures that fills the box/polygon with **deterministically-scattered** mini bulbs (seed by `item.id`, like spritzer's `makeRng`); bulb count = `density × real-world area × k` so fill stays consistent at any size; reuse the mini-bulb glow (bulb.ts / strand mini). Point-in-polygon scatter for the polygon shape.
2. **`api.ts`** — the locked types above (+ guards + union).
3. **Draw tool** in `editor.ts`: new authoring mode for miniArea — **box** (drag a rect) + **polygon** (click vertices, Enter/dbl-click to finish, auto-close). Mirror the existing strand/garland draw machinery (`dragPts`/`tracePts`/preview/`commit*`). Place under Lights → Mini (or its own decor-style sub-tool).
4. **Railing grouping**: a "Group as one quote unit" action when ≥2 mini strands are selected → create a `MiniGroupItem` (memberIds) + set `groupId` on members. Group is geometry-less: selecting grouped strands surfaces a **group edit panel** (surface/wrapStyle/stringCount/included + **Ungroup**); Ungroup removes the group + clears members' `groupId`. Members still render/move individually.
5. **Edit panels** (billed attrs gated behind `opts.showQuoteBinding`, like A1): miniArea panel (density slider [visual] + Quote binding surface/wrapStyle/stringCount/included); miniGroup panel (billed attrs + Ungroup).
6. **Creation defaults** (quote tool's suggestion): `included:true, surface:"bush", wrapStyle:"canopy", stringCount:1, density ~0.5`.
7. **Render dispatch**: add `miniArea` to `redrawScene`'s item dispatch (→ `renderMiniArea`); `miniGroup` renders nothing itself (members render). Handle any exhaustive `switch`.
- After: `npx tsc --noEmit -p client/tsconfig.json`, commit, relay the exact `editor.ts` + `miniArea.ts` diff for the quote tool to copy verbatim.
- **NOTE:** A2 is meatier than A1 (new draw tool + renderer + grouping UX) → recommended as a focused/fresh session; build in committable increments (types → renderer → tool → grouping → panels → defaults).

### A2 follow-up fixes (Jason, post-build testing)
- ✅ **#4 selection bug FIXED** (commit `fix(editor): make placed Scattershot/miniArea selectable`): a placed miniArea couldn't be selected/moved — the hit target was a near-transparent closed Line under the bulbs; replaced with a solid `Rect` (box) added topmost, mirroring the spritzer hit. Re-verify.
- ⬜ **#1 RELOCATE to Lights as a 4th drawing style "Scattershot"** (next to Strand/Trace/Single) — NOT a Decor sub-type. Should drag-to-draw a box → `commitMiniArea(rect)`. Remove the Decor "Mini Area" sub-type/button/draw-panel/place-dispatch. Use a local editor flag (e.g. `tool.scattershot`) — do NOT add "scattershot" to the shared `DrawingStyle` type (it's only valid for strands). This relabel IS the rename (#3).
- ⬜ **#3 RENAME** all UI "Mini Area" / "Mini-light area" → **"Scattershot"** (done as part of #1). Keep internal `kind:"miniArea"` to avoid churning the locked type (or rename the kind too via quote-tool coordination).
- ⬜ **#2 ADD "railing" surface** to the mini-strand / miniArea / group surface dropdowns. ⚠️ `railing` is NOT in the locked Surface taxonomy → a **v0.5 shared-type change**: the quote tool must add `railing` to their `Surface` type + a price-book rate. Coordinate before/with shipping.

## More to come
Jason flagged this is a baseline, not the full spec — "more ideas will pop up as we develop." Portal-side details beyond the above may expand. Append here as they do.

## NOT doing yet
No implementation. This is captured groundwork only. Do not start building the embedded editor, the export/render endpoint, the auto-design pipeline, or any Supabase migration until Jason says go.
