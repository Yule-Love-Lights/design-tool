import { api, type Design } from "../api";

function fmtDate(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export async function renderDesigns(root: HTMLElement) {
  root.innerHTML = `
    <div class="designs">
      <header>
        <h1>Designs</h1>
        <div>
          <button class="primary" id="new">+ New Design</button>
          <button id="settings">Settings</button>
          <button id="logout">Log out</button>
        </div>
      </header>
      <div class="grid" id="grid">Loading…</div>
    </div>
  `;
  const grid = root.querySelector("#grid")!;
  root.querySelector("#new")!.addEventListener("click", () => createDesignModal());
  root.querySelector("#settings")!.addEventListener("click", () => {
    window.location.hash = "#/settings";
  });
  root.querySelector("#logout")!.addEventListener("click", async () => {
    await api.logout();
    window.location.hash = "#/login";
  });

  const designs = await api.listDesigns();
  if (designs.length === 0) {
    grid.innerHTML = `<div style="color:var(--text-dim)">No designs yet. Click "New Design" to start.</div>`;
    return;
  }

  grid.innerHTML = "";
  for (const d of designs) {
    grid.appendChild(renderCard(d));
  }
}

function renderCard(d: Design) {
  const el = document.createElement("div");
  el.className = "design-card";
  el.innerHTML = `
    <div class="thumb" style="${d.photoUrl ? `background-image:url('${d.photoUrl}')` : ""}">
      ${d.photoUrl ? "" : "No photo yet"}
    </div>
    <div class="meta">
      <div>
        <div class="name"></div>
        <div class="date">Updated ${fmtDate(d.updatedAt)}</div>
      </div>
      <button class="delete" title="Delete">×</button>
    </div>
  `;
  (el.querySelector(".name") as HTMLElement).textContent = d.name;
  el.addEventListener("click", () => {
    window.location.hash = `#/editor/${d.id}`;
  });
  el.querySelector(".delete")!.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    confirmDelete(d, () => {
      el.remove();
      // If that was the last card, show the empty state.
      const grid = document.querySelector("#grid");
      if (grid && grid.children.length === 0) {
        grid.innerHTML = `<div style="color:var(--text-dim)">No designs yet. Click "New Design" to start.</div>`;
      }
    });
  });
  return el;
}

function confirmDelete(d: Design, onDeleted: () => void) {
  if (document.querySelector(".modal-bg")) return;
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `
    <div class="modal">
      <h2>Delete design?</h2>
      <div style="color:var(--text-dim);font-size:13px">
        Permanently delete <strong></strong>? This can't be undone.
      </div>
      <div class="err" id="del-err" style="color:var(--danger);font-size:12px;min-height:14px"></div>
      <div class="actions">
        <button id="del-cancel">Cancel</button>
        <button class="danger" id="del-ok">Delete</button>
      </div>
    </div>
  `;
  (bg.querySelector("strong") as HTMLElement).textContent = d.name;
  document.body.appendChild(bg);

  const close = () => bg.remove();
  bg.addEventListener("click", (e) => { if (e.target === bg) close(); });
  bg.querySelector("#del-cancel")!.addEventListener("click", close);
  bg.querySelector("#del-ok")!.addEventListener("click", async () => {
    const okBtn = bg.querySelector("#del-ok") as HTMLButtonElement;
    const errEl = bg.querySelector("#del-err") as HTMLElement;
    okBtn.disabled = true;
    okBtn.textContent = "Deleting…";
    try {
      await api.deleteDesign(d.id);
      onDeleted();
      close();
    } catch (err) {
      console.error("Delete failed:", err);
      errEl.textContent = `Failed: ${err instanceof Error ? err.message : String(err)}`;
      okBtn.disabled = false;
      okBtn.textContent = "Delete";
    }
  });
  window.addEventListener("keydown", function onKey(e) {
    if (e.key === "Escape") {
      close();
      window.removeEventListener("keydown", onKey);
    }
  });
}

function createDesignModal() {
  if (document.querySelector(".modal-bg")) return;
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `
    <div class="modal">
      <h2>New Design</h2>
      <div>
        <label>Name</label>
        <input type="text" id="name" placeholder="e.g., Smith House — Front" autofocus />
      </div>
      <div class="actions">
        <button id="cancel">Cancel</button>
        <button class="primary" id="ok">Create</button>
      </div>
    </div>
  `;
  document.body.appendChild(bg);
  const input = bg.querySelector("#name") as HTMLInputElement;
  bg.querySelector("#cancel")!.addEventListener("click", () => bg.remove());
  bg.addEventListener("click", (e) => {
    if (e.target === bg) bg.remove();
  });
  const create = async () => {
    const name = input.value.trim() || "Untitled Design";
    const d = await api.createDesign(name);
    bg.remove();
    window.location.hash = `#/editor/${d.id}`;
  };
  bg.querySelector("#ok")!.addEventListener("click", create);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") create();
  });
}
