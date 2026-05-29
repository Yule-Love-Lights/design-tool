# Yule Love Lights — Design Tool

Internal tool for [Yule Love Lights](https://yulelovelights.com) staff to mock up
Christmas and permanent (year-round) light installations directly on a customer's
house photo, then download the finished image to send to the customer as a sales aid.

Inspired by Holiday Home Concepts' canvas experience, scoped down to **just the
design surface** — no pricing, proposals, inventory, or invoicing (those live in
the separate Yule Love Lights **Quote Tool**; see [Integration](#integration)).

---

## What it does

Upload a customer's house photo → drop a "yardstick" on a known feature to set the
real-world scale → draw glowing light designs over the photo → download a
photo-quality JPG.

**Item types you can place:**

| Category | Items |
|---|---|
| **Lights** (strand-based) | C9, Mini, Permanent (spotlight cones), **Bistro** (catenary-sag string lights) |
| **Decor** | Wreath (with/without lights ✕ with/without bow), Bow, Garland (PNG tiled along a path), Spritzer (procedural radial spray) |
| **Text** | Lit-up text in 4 fonts (Bebas Neue / Oswald / Pacifico / Inter), optional outline |
| **Custom** | Any uploaded PNG/JPG/SVG, with flip + optional glow halo, managed in a server-side library |
| **Poles** | Vertical supports for bistro lights (cube / barrel / no base) |

**Editor features:** brightness slider (day↔night preview), multiple yardsticks,
marquee multi-select, Konva.Transformer resize/rotate/move, Ctrl+C/Ctrl+V copy-paste
at cursor, undo/redo, per-item-type defaults, an editable color palette, auto-save,
and a clean JPG export (yardsticks hidden).

**Organization:** the dashboard is **Clients → Projects → Designs**. A client has
optional contact info and any number of projects; a project has unlimited designs
(each a photo + its light overlay), shown as tabs in the project view.

---

## Tech stack

- **client/** — Vite 6 + TypeScript 5 (strict) + [Konva.js](https://konvajs.org/) 9, vanilla TS with a hash router (no UI framework)
- **server/** — Fastify 5 + `node:sqlite` (Node 22+ built-in, no native compile) + filesystem photo storage
- Session auth via `@fastify/session` with a single shared password (`APP_PASSWORD`)
- npm workspaces (`client` + `server`), one `npm run dev` boots both

The photoreal glow is the whole point: bulbs are Konva shapes painted with
`globalCompositeOperation: "lighten"` so they brighten the photo behind them rather
than looking like stickers pasted on top.

---

## Project structure

```
client/
  src/
    main.ts            Hash router (login / clients / project / editor / settings)
    api.ts             All HTTP wrappers + ALL shared type definitions
    pages/
      clients.ts       Dashboard: clients with nested projects
      project.ts       Project view: design tabs + embedded editor
      editor.ts        The canvas editor (mountable / teardownable)
      settings.ts      Tabbed: palette + per-type defaults + custom library
      login.ts
    editor/            One renderer per item type (bulb, strand, wreath, bow,
                       garland, spritzer, text, custom, pole, yardstick) + colors/assets
    styles/main.css
server/
  src/
    index.ts           Fastify boot + route registration + static /photos
    db.ts              SQLite schema (clients/projects/designs/app_settings) + migrations
    routes/            auth, clients, projects, designs, photos, uploads, settings
data/                  Runtime only (gitignored): app.db + uploaded photos
```

`api.ts` is the single source of truth for the wire format. The server stores each
design's scene as opaque JSON, so adding a new item type is a TypeScript change +
a renderer — no DB migration.

---

## Development

```powershell
# Node 22+ required (uses the built-in node:sqlite module)
$env:Path = "$env:ProgramFiles\nodejs;$env:Path"
npm install
$env:APP_PASSWORD = "lights"
$env:SESSION_SECRET = "dev-session-secret-at-least-32-characters-long-ok"
npm run dev
```

Client on http://localhost:5173, server on http://localhost:3000. Vite proxies
`/api` and `/photos` to the server.

Type-check without building:

```powershell
npx tsc --noEmit -p client/tsconfig.json
npx tsc --noEmit -p server/tsconfig.json
```

## Production

```powershell
npm run build
$env:APP_PASSWORD = "your-real-password"
$env:SESSION_SECRET = "a-long-random-string-at-least-32-chars"
npm start
```

The server serves the built client and the API on port 3000.

---

## Data model

```
clients (name req, email/address/phone opt)
  └─ projects (name)
       └─ designs (photo + scene JSON)
```

A `scene` is `{ yardsticks[], items[], brightness }`. Every drawable is a
discriminated-union `SceneItem` keyed by `kind` (`strand`, `wreath`, `bow`,
`garland`, `spritzer`, `text`, `custom`, `pole`). Real-world sizing comes from a
yardstick's pixels-per-foot. Cascade deletes: removing a client removes its
projects and designs.

App-wide settings (color palette, per-type defaults, custom-upload library) live in
a small `app_settings` key/value table.

---

## Integration

This tool is the **design** half of the Yule Love Lights workflow. The separate
**Quote Tool** (Next.js + Supabase + Claude Vision + Gemini) handles photo analysis,
pricing, and the customer-facing portal. The intended end product is a customer quote
that includes the fully-designed house image.

Planned seam (not yet built): a `surface` tag on strands + a
`GET /api/designs/:id/export` endpoint returning footage-by-surface + the rendered
image, which the Quote Tool ingests. The two tools talk over HTTP — no shared codebase.

---

## Notes

- Customer photos and the SQLite DB live in `data/` and are **gitignored** — they
  never get committed.
- Auth is a single shared staff password; there are no per-user accounts by design.
