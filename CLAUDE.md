# Working notes — YuleLoveLights design tool

Operational gotchas learned the hard way (Session 4). Follow these to avoid repeating wasted effort. Project facts/history live in the auto-memory + `docs/context/`; this file is the always-loaded "don't repeat these mistakes" list.

## Dev server — the #1 time-sink to avoid
- **Run ONE instance.** Do NOT keep restarting `npm run dev` in the background. Multiple instances fight over ports **5173** (Vite) and **3000** (Fastify) and *cause* the "Vite keeps dying" flakiness. Each restart makes it worse.
- **For live/browser testing, use `start-design-tool.bat`** (runs under Jason's shell, survives across turns). A `npm run dev` backgrounded from the agent harness gets torn down between turns.
- **Diagnose before restarting.** If the app seems down: `netstat -ano | grep ":5173\|:3000"` for listeners; identify PIDs by command line and kill ONLY this repo's — **never** the quote tool's `yll-quote-tool` Next.js on 3000 (it legitimately shares 3000; coexists via our IPv4 pinning).
- The API (Fastify) binds IPv4 — verify it via PowerShell to `http://127.0.0.1:3000/...` (login POST with `-SessionVariable` for authed routes) even when Vite/Chrome are down.

## Chrome can't reach the dev server (Jason's machine)
- Symptom: server is up (PowerShell gets 200) but Chrome shows "refused"; Chrome reaches `:3000` but not `:5173`. Root cause = Jason's **manual DNS (1.1.1.1/8.8.8.8) + Chrome "Secure DNS"** mishandling localhost/loopback — NOT an IPv4-vs-IPv6 Vite binding issue (don't rabbit-hole there).
- Fix: Jason turns OFF Chrome → Settings → Privacy → "Use secure DNS" (or carves out localhost). Until then, Claude-driven browser checks are blocked — ask Jason to verify in-app himself, or to toggle Secure DNS so Claude can drive it.
- When Chrome IS reachable but a tab is backgrounded, Konva freezes RAF/input — drive it with synthetic `MouseEvent`s (Konva mouse handlers need mouse, not pointer, events).

## PowerShell 5.1 gotchas
- `git commit -m "...has double quotes/parens/em-dashes..."` gets mangled. Use **`git commit -F <tmpfile>`** (write the message to a temp file, commit, delete it).
- Don't pipe git/native-command output to `| Select-Object -First N` — it closes the pipe early and returns a spurious **exit 255** (the git command still succeeded). Use `git log -n N` / `git rev-parse --short HEAD` instead.

## Quote-tool relays — the main ongoing work
- The two apps keep **`editor-core` byte-identical**: `client/src/pages/editor.ts` + `client/src/editor/*.ts`. Apply relayed hunks **verbatim**. Only allowed divergences are the documented seams (type-import path; Fastify `api` ↔ Supabase storage connector).
- `client/src/api.ts` (scene types) is synced **member-for-member**, not byte-for-byte (our file uses double quotes; theirs single — fine).
- **Palette changes touch TWO files:** `client/src/editor/colors.ts` AND the server seed `server/src/routes/settings.ts` (two `DEFAULT_COLORS` copies; the live palette is API-served, so the server copy is what actually takes effect + backfills).
- **Render settings apply from the app shell (`main.ts`), NOT inside `editor.ts`** — keeps `editor.ts` byte-identical (see `editor/renderSettings.ts`).
- Per relay: read the anchors → apply → `npx tsc --noEmit -p client/tsconfig.json` (+ server tsconfig if server touched) → commit → push (on Jason's "go") → reply with the commit hash.

## Git push
- Claude CAN push now: `.claude/settings.local.json` has `Bash(git push:*)` + a scoped `autoMode.allow` that whitelists ONLY the `Yule-Love-Lights/design-tool` (origin) remote (other remotes stay blocked as exfiltration protection).
- **Gate = Jason's verbal "go" per push.** Propose "N ready — push?", wait for "go", then `git push`.

## Efficiency
- **Batch `docs/context` snapshots** — don't commit a separate `docs(context)` snapshot after every single relay. Update auto-memory live; snapshot to `docs/context/` once at a checkpoint or session wrap.
- Never commit without Jason's explicit yes; suggest commits at checkpoints.
