# Session Continuity & Memory Protocol

**A reusable template for running any multi-session Claude Code project.**

Keep context across sessions that outlive a single context window — so every new session picks up
cold, nothing is lost, and decisions are never re-litigated.

> _Version 1.0 · 2026-06-01. This is the editable source; a PDF export of the same content can be
> generated from it. Project-agnostic — adapt the `<placeholders>` per project._

---

## 1. Why this exists

A Claude Code session fills its context window and has to end. On any non-trivial project, the work
therefore spans many fresh sessions — sometimes across different people and machines. Without a
deliberate hand-off, each new session starts blind: it re-asks settled questions, repeats work, and
loses the thread of *where we were* and *what is next*.

This protocol fixes that with a small set of memory files, a fixed start-of-session and
end-of-session routine, and a single shared source of truth committed to the repo. Adopt it on day
one of a project and every session afterward resumes cleanly.

---

## 2. The memory system — three layers, one source of truth

The same context lives in three places. Understanding how they relate is the whole game:

| Layer | Where | Role |
|---|---|---|
| **Local auto-memory** | Claude Code's per-project memory dir on the current machine (the `MEMORY.md` index + linked files) | Live working copy Claude reads automatically. **Per-machine; can drift.** |
| **In-repo snapshot** | `docs/context/` inside the repo | **Canonical, shareable record.** Travels between people/machines; survives a wipe. |
| **Remote (GitHub)** | `docs/context/` pushed with every commit | Off-machine backup; what the next clone reads. |

**Rule of thumb:** local memory is the live copy; **`docs/context/` in the repo is the source of
truth.** Seed local from the repo when starting on a fresh machine; snapshot local back into the repo
when wrapping up. With multiple teammates on multiple machines, the in-repo copy matters *more*, not
less — it is the only thing you actually share.

---

## 3. The memory files

Create any that don't exist. Keep the set lean — every file must earn its place.

- **`MEMORY.md` — the index.** Top-level file Claude loads first. One line per linked file describing
  what it holds. This is the map to everything else.
- **`session_log.md` — the continuity thread.** The running per-session log: a numbered entry per
  session recording what shipped, the ending state, and the exact next step. Read the latest entry at
  the start of every session; append at wrap-up. **Append-only — never rewrite history.**
- **`project_state.md` — the at-a-glance brain.** The project's current reality. Recommended sections:
  - **Current state at a glance** (read first) — what works right now.
  - **Scope** — the goal, and an explicit *NOT in scope* list.
  - **Decisions confirmed (don't re-ask)** — settled choices, so no session reopens them.
  - **How to run it** — exact commands / env vars to start the app locally.
  - **Gotchas** — traps already hit, so they aren't re-tripped.
  - **Next up** — the queued work, in priority order.
- **Optional extras** — add only when they pull weight: a user/profile file, an architecture /
  data-model file, a conventions file, or a context-window-warning preferences file.

---

## 4. Start-of-session protocol

1. Read `MEMORY.md`, then the latest `session_log.md` entry, then `project_state.md` (Current state,
   Next up, Decisions confirmed).
2. If local memory looks empty or stale (fresh machine, or a teammate made changes), seed/refresh it
   from the repo's `docs/context/`.
3. Confirm the app actually runs — start the dev server(s) and verify they respond. Record the run
   commands in `project_state.md` if they aren't already there.
4. Do **not** re-ask anything in *Decisions confirmed*. If genuinely ambiguous, ask narrowly.
5. Give a **one-paragraph confirmation of current state** (what works, where the last session ended,
   what's queued), then **wait** for direction. Don't start coding unprompted.

---

## 5. During-session conventions

- **Commits:** never commit without the owner's explicit "yes." Proactively *suggest* a commit at
  logical checkpoints (a feature lands, a refactor completes, a fix round closes) and wait.
- **Pushing:** confirm whether the agent is even allowed to push (some orgs are blocked by the
  data-exfiltration guard). If blocked, the human pushes; the agent only commits locally. Never bypass
  the guard.
- **Secrets:** never commit credentials. Keep `.env*`, data dirs, and customer files gitignored.
  Document env-var *names* in the state/conventions file; share *values* out-of-band only. The
  `docs/context/` snapshot holds context, never keys.
- **Keep state honest:** when "Current state" or "Decisions confirmed" changes, update the file in the
  moment — don't defer it all to wrap-up.

---

## 6. Closing-session protocol (trigger at ~90% context)

Context windows are large, so "long" means many turns. As you approach roughly 90% of the window,
**warn the owner proactively** so you can land a clean stopping point instead of being cut off. Then:

1. **Update `session_log.md`:** bump the session count and finish this session's entry — title, date,
   what shipped, ending state, and the exact next step.
2. **Update `project_state.md`:** make "Current state" and "Next up" accurate.
3. **Re-snapshot:** copy the local memory `*.md` files into `docs/context/`; update its README if the
   file set changed.
4. **Hand off the push:** tell the owner to commit + push (you don't commit without a yes; the human
   runs the push if you're blocked).
5. **Recommend a fresh session** and restate the one-line "pick up here next" pointer.

---

## 7. Session-log entry format

Append-only. Number sessions from 1. If a project had earlier *unlogged* sessions (e.g. a teammate
worked before logging began), add a short **Pre-log history** note rather than inventing a count.

```
## Sessions so far: N

### Session N — <short title> (<date>) · CURRENT
Picked up from: <where the last session left off>
Shipped:
  - <one bullet per logical chunk that landed (ideally one per commit)>
Ending state: <what works / what's broken right now>
Model/context: <model + window; roughly where context ended>
NEXT: <the single most important thing to do next session>
```

Why this shape works: a concrete **NEXT** plus a specific **Ending state** is exactly what lets the
following session resume cold without asking you anything.

---

## 8. Copy-paste bootstrap prompt

Drop this into the **first** session of a new project (fill the `<angle-bracket>` placeholders). It
stands up the whole system and then stops for your review.

```text
I want to set up a durable, multi-session continuity system for this project so that every
future Claude Code session can pick up cold without losing context or re-deciding settled
questions. Read this fully, then do the setup at the end. Don't start feature work yet.

PROJECT: <name> — <one-line description>
REPO: <repo / org>   RUN LOCALLY: <dev command(s) + required env vars>
PEOPLE/MACHINES: <who works on this, on how many machines>

THE MEMORY SYSTEM — three layers, one source of truth:
  1) Local Claude Code auto-memory (MEMORY.md index + linked files) = live working copy,
     per-machine, can drift.
  2) docs/context/ in the repo = the canonical, shareable copy. Treat it as the source of
     truth; seed local memory from it, and snapshot local memory back into it at wrap-up.
  3) GitHub = off-machine backup that rides along on every push.

FILES TO MAINTAIN (create any that are missing; keep the set lean):
  - MEMORY.md            : index; one line per linked file.
  - session_log.md       : running per-session log (format below); append-only.
  - project_state.md     : Current state at a glance | Scope (+ NOT in scope) |
                           Decisions confirmed (don't re-ask) | How to run | Gotchas | Next up.

START EACH SESSION BY: reading MEMORY.md -> latest session_log entry -> project_state;
seeding local memory from docs/context/ if stale; confirming the app runs; NOT re-asking
settled decisions; then giving a one-paragraph current-state summary and WAITING for direction.

DURING A SESSION: never commit without my explicit yes (suggest commits at checkpoints and
wait); confirm whether you're even allowed to push — if not, I push and you only commit;
never commit secrets (.env*, data, customer files stay gitignored; document env-var NAMES,
share VALUES out-of-band).

WRAP UP AT ~90% CONTEXT: warn me first; update session_log.md (bump count + finish the entry);
update project_state.md (Current state + Next up); re-snapshot the memory *.md files into
docs/context/ (update its README if files changed); tell me to commit + push; recommend a
fresh session and restate the one-line 'pick up here next'.

SESSION-LOG ENTRY FORMAT:
  ### Session N — <title> (<date>) · CURRENT
  Picked up from: ... | Shipped: - ... | Ending state: ... | Model/context: ... | NEXT: ...
  (Number sessions from 1; if earlier unlogged sessions exist, add a 'Pre-log history' note.)

YOUR TASK NOW: 1) report whether the memory files and docs/context/ already exist; 2) scaffold
whatever's missing (MEMORY.md, session_log.md with a Pre-log note + an open Session 1, and
project_state.md capturing what you can learn from the codebase + what I tell you); 3) snapshot
them into docs/context/ with a short README explaining the system; 4) STOP and show me what you
made + a one-paragraph current-state summary, and suggest the first commit — don't commit or
push until I say yes.
```

---

## 9. Quick-reference checklist

| Moment | Do this |
|---|---|
| **Session start** | Read index → latest log entry → state. Seed local from `docs/context/` if stale. Verify app runs. Don't re-ask decided things. One-paragraph state summary, then wait. |
| **Checkpoint** | Suggest a commit and wait for an explicit yes. Keep `project_state.md` honest. |
| **~90% context** | Warn. Update log + state. Snapshot memory → `docs/context/`. Hand off commit/push. Recommend a fresh session. |
| **Never** | Commit without a yes. Push if blocked. Commit secrets. Rewrite past log entries. |

---

_Adapt freely per project: rename files, add an architecture or conventions doc, or wire a hook to
automate the session count. The non-negotiables are the three layers, the start/stop routine, and a
single source of truth in the repo._
