import { api, type Client, type Project } from "../api";

// Module-scoped so search/sort re-render off the same fetched data without
// re-hitting the server on every keystroke.
let clients: Client[] = [];
let search = "";
type SortMode = "recent" | "name-asc" | "name-desc";
let sortMode: SortMode = "recent";

export async function renderClients(root: HTMLElement) {
  root.innerHTML = `
    <div class="clients">
      <header>
        <h1>Clients</h1>
        <div>
          <button id="settings">Settings</button>
          <button id="logout">Log out</button>
        </div>
      </header>
      <div class="clients-toolbar">
        <button class="primary" id="add-client">+ Add New Client</button>
        <input type="search" id="client-search" placeholder="Search clients or projects…" />
        <select id="client-sort" title="Sort clients">
          <option value="recent">Most recent</option>
          <option value="name-asc">Name A–Z</option>
          <option value="name-desc">Name Z–A</option>
        </select>
      </div>
      <div id="clients-list">Loading…</div>
    </div>
  `;

  root.querySelector("#settings")!.addEventListener("click", () => {
    window.location.hash = "#/settings";
  });
  root.querySelector("#logout")!.addEventListener("click", async () => {
    await api.logout();
    window.location.hash = "#/login";
  });
  root.querySelector("#add-client")!.addEventListener("click", () => createClientModal(root));

  const searchEl = root.querySelector("#client-search") as HTMLInputElement;
  searchEl.value = search;
  searchEl.addEventListener("input", () => {
    search = searchEl.value;
    renderList(root);
  });
  const sortEl = root.querySelector("#client-sort") as HTMLSelectElement;
  sortEl.value = sortMode;
  sortEl.addEventListener("change", () => {
    sortMode = sortEl.value as SortMode;
    renderList(root);
  });

  await reload(root);
}

async function reload(root: HTMLElement) {
  try {
    clients = await api.listClients();
  } catch {
    clients = [];
  }
  renderList(root);
}

function matches(c: Client, q: string): boolean {
  if (!q) return true;
  const hay = [
    c.name,
    c.email ?? "",
    c.address ?? "",
    c.phone ?? "",
    ...c.projects.map((p) => p.name),
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q.toLowerCase());
}

function sortClients(list: Client[]): Client[] {
  const copy = [...list];
  if (sortMode === "name-asc") copy.sort((a, b) => a.name.localeCompare(b.name));
  else if (sortMode === "name-desc") copy.sort((a, b) => b.name.localeCompare(a.name));
  // "recent" = server order (updated_at desc), leave as-is.
  return copy;
}

function renderList(root: HTMLElement) {
  const wrap = root.querySelector("#clients-list") as HTMLElement;
  const visible = sortClients(clients.filter((c) => matches(c, search)));
  if (clients.length === 0) {
    wrap.innerHTML = `<div class="empty-note">No clients yet. Click "+ Add New Client" to start.</div>`;
    return;
  }
  if (visible.length === 0) {
    wrap.innerHTML = `<div class="empty-note">No clients or projects match "${escapeHtml(search)}".</div>`;
    return;
  }
  wrap.innerHTML = visible.map(renderClientBlock).join("");
  wireClientBlocks(root);
}

function renderClientBlock(c: Client): string {
  const contactLines = [c.email, c.address, c.phone].filter(Boolean) as string[];
  return `
    <div class="client-block" data-client="${c.id}">
      <div class="client-head">
        <div class="client-title">
          <span class="client-name">${escapeHtml(c.name)}</span>
          <button class="link-btn client-edit">✎ Edit</button>
          <button class="link-btn client-delete">🗑 Delete</button>
        </div>
        <button class="primary add-project">+ Add Project</button>
      </div>
      ${contactLines.length
        ? `<div class="client-contact">${contactLines.map(escapeHtml).join("<br/>")}</div>`
        : ""}
      <div class="client-projects">
        ${c.projects.length === 0
          ? `<div class="no-projects">No projects yet.</div>`
          : c.projects.map(renderProjectRow).join("")}
      </div>
    </div>
  `;
}

function renderProjectRow(p: Project): string {
  return `
    <div class="project-row" data-project="${p.id}">
      <a class="project-link" href="#/project/${p.id}">${escapeHtml(p.name)}</a>
      <div class="project-actions">
        <button class="link-btn project-edit">✎ Edit</button>
        <button class="link-btn project-delete">🗑 Delete</button>
      </div>
    </div>
  `;
}

function wireClientBlocks(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>(".client-block").forEach((block) => {
    const clientId = block.dataset.client!;
    const client = clients.find((c) => c.id === clientId);
    if (!client) return;

    block.querySelector(".client-edit")?.addEventListener("click", () => editClientModal(root, client));
    block.querySelector(".client-delete")?.addEventListener("click", () => confirmDeleteClient(root, client));
    block.querySelector(".add-project")?.addEventListener("click", () => createProjectModal(root, client.id, { afterCreateNavigate: true }));

    block.querySelectorAll<HTMLElement>(".project-row").forEach((row) => {
      const projectId = row.dataset.project!;
      const project = client.projects.find((p) => p.id === projectId);
      if (!project) return;
      row.querySelector(".project-edit")?.addEventListener("click", (e) => {
        e.preventDefault();
        editProjectModal(root, project);
      });
      row.querySelector(".project-delete")?.addEventListener("click", (e) => {
        e.preventDefault();
        confirmDeleteProject(root, project);
      });
    });
  });
}

// ---------- Modals ----------

function modalShell(inner: string): HTMLElement {
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `<div class="modal">${inner}</div>`;
  document.body.appendChild(bg);
  bg.addEventListener("click", (e) => { if (e.target === bg) bg.remove(); });
  return bg;
}

function createClientModal(root: HTMLElement) {
  if (document.querySelector(".modal-bg")) return;
  const bg = modalShell(`
    <h2>Create Client</h2>
    <p class="modal-hint">To begin designing holiday light installations, first enter the details of the client. You can add more clients later.</p>
    <input type="text" id="c-name" placeholder="Client Name" autofocus />
    <input type="text" id="c-email" placeholder="Email (Optional)" />
    <input type="text" id="c-address" placeholder="Address (Optional)" />
    <input type="text" id="c-phone" placeholder="Phone (Optional)" />
    <div class="err" id="c-err"></div>
    <div class="actions">
      <button id="c-cancel">Back</button>
      <button class="primary" id="c-create">Create</button>
    </div>
  `);
  const nameEl = bg.querySelector("#c-name") as HTMLInputElement;
  const errEl = bg.querySelector("#c-err") as HTMLElement;
  bg.querySelector("#c-cancel")!.addEventListener("click", () => bg.remove());
  const create = async () => {
    const name = nameEl.value.trim();
    if (!name) { errEl.textContent = "Client name is required."; return; }
    try {
      const client = await api.createClient({
        name,
        email: (bg.querySelector("#c-email") as HTMLInputElement).value.trim() || undefined,
        address: (bg.querySelector("#c-address") as HTMLInputElement).value.trim() || undefined,
        phone: (bg.querySelector("#c-phone") as HTMLInputElement).value.trim() || undefined,
      });
      bg.remove();
      // Chain into the first-project step (image 3). Backing out leaves the
      // client with no project.
      createProjectModal(root, client.id, { afterCreateNavigate: true, isFirstProject: true });
    } catch (err) {
      errEl.textContent = `Failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  };
  bg.querySelector("#c-create")!.addEventListener("click", create);
  // Enter from any field submits, matching the Create button.
  bg.querySelectorAll<HTMLInputElement>("input").forEach((inp) =>
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") create(); }),
  );
}

function createProjectModal(
  root: HTMLElement,
  clientId: string,
  opts: { afterCreateNavigate?: boolean; isFirstProject?: boolean } = {},
) {
  if (document.querySelector(".modal-bg")) return;
  const bg = modalShell(`
    <h2>Create Project</h2>
    <p class="modal-hint">Use a descriptive name for your project, like the year or the address of this holiday light installation.</p>
    <input type="text" id="p-name" placeholder="Project Name" autofocus />
    <div class="err" id="p-err"></div>
    <div class="actions">
      <button id="p-cancel">Back</button>
      <button class="primary" id="p-create">Create</button>
    </div>
  `);
  const nameEl = bg.querySelector("#p-name") as HTMLInputElement;
  const errEl = bg.querySelector("#p-err") as HTMLElement;
  // Backing out of the first-project step just keeps the freshly-created client
  // (with no project) and refreshes the list.
  bg.querySelector("#p-cancel")!.addEventListener("click", async () => {
    bg.remove();
    await reload(root);
  });
  const create = async () => {
    const name = nameEl.value.trim();
    if (!name) { errEl.textContent = "Project name is required."; return; }
    try {
      const project = await api.createProject(clientId, name);
      bg.remove();
      if (opts.afterCreateNavigate) {
        window.location.hash = `#/project/${project.id}`;
      } else {
        await reload(root);
      }
    } catch (err) {
      errEl.textContent = `Failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  };
  bg.querySelector("#p-create")!.addEventListener("click", create);
  nameEl.addEventListener("keydown", (e) => { if (e.key === "Enter") create(); });
}

function editClientModal(root: HTMLElement, client: Client) {
  if (document.querySelector(".modal-bg")) return;
  const bg = modalShell(`
    <h2>Edit Client</h2>
    <input type="text" id="c-name" placeholder="Client Name" />
    <input type="text" id="c-email" placeholder="Email (Optional)" />
    <input type="text" id="c-address" placeholder="Address (Optional)" />
    <input type="text" id="c-phone" placeholder="Phone (Optional)" />
    <div class="err" id="c-err"></div>
    <div class="actions">
      <button id="c-cancel">Cancel</button>
      <button class="primary" id="c-save">Save</button>
    </div>
  `);
  (bg.querySelector("#c-name") as HTMLInputElement).value = client.name;
  (bg.querySelector("#c-email") as HTMLInputElement).value = client.email ?? "";
  (bg.querySelector("#c-address") as HTMLInputElement).value = client.address ?? "";
  (bg.querySelector("#c-phone") as HTMLInputElement).value = client.phone ?? "";
  const errEl = bg.querySelector("#c-err") as HTMLElement;
  bg.querySelector("#c-cancel")!.addEventListener("click", () => bg.remove());
  bg.querySelector("#c-save")!.addEventListener("click", async () => {
    const name = (bg.querySelector("#c-name") as HTMLInputElement).value.trim();
    if (!name) { errEl.textContent = "Client name is required."; return; }
    try {
      await api.updateClient(client.id, {
        name,
        email: (bg.querySelector("#c-email") as HTMLInputElement).value.trim() || null,
        address: (bg.querySelector("#c-address") as HTMLInputElement).value.trim() || null,
        phone: (bg.querySelector("#c-phone") as HTMLInputElement).value.trim() || null,
      });
      bg.remove();
      await reload(root);
    } catch (err) {
      errEl.textContent = `Failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  });
}

function editProjectModal(root: HTMLElement, project: Project) {
  if (document.querySelector(".modal-bg")) return;
  const bg = modalShell(`
    <h2>Rename Project</h2>
    <input type="text" id="p-name" placeholder="Project Name" />
    <div class="err" id="p-err"></div>
    <div class="actions">
      <button id="p-cancel">Cancel</button>
      <button class="primary" id="p-save">Save</button>
    </div>
  `);
  (bg.querySelector("#p-name") as HTMLInputElement).value = project.name;
  const errEl = bg.querySelector("#p-err") as HTMLElement;
  bg.querySelector("#p-cancel")!.addEventListener("click", () => bg.remove());
  bg.querySelector("#p-save")!.addEventListener("click", async () => {
    const name = (bg.querySelector("#p-name") as HTMLInputElement).value.trim();
    if (!name) { errEl.textContent = "Project name is required."; return; }
    try {
      await api.updateProject(project.id, name);
      bg.remove();
      await reload(root);
    } catch (err) {
      errEl.textContent = `Failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  });
}

function confirmDeleteClient(root: HTMLElement, client: Client) {
  if (document.querySelector(".modal-bg")) return;
  const n = client.projects.length;
  const bg = modalShell(`
    <h2>Delete client?</h2>
    <div class="modal-hint">Permanently delete <strong>${escapeHtml(client.name)}</strong>${n ? ` and its ${n} project${n === 1 ? "" : "s"} (and all their designs)` : ""}? This can't be undone.</div>
    <div class="err" id="d-err"></div>
    <div class="actions">
      <button id="d-cancel">Cancel</button>
      <button class="danger" id="d-ok">Delete</button>
    </div>
  `);
  bg.querySelector("#d-cancel")!.addEventListener("click", () => bg.remove());
  bg.querySelector("#d-ok")!.addEventListener("click", async () => {
    try {
      await api.deleteClient(client.id);
      bg.remove();
      await reload(root);
    } catch (err) {
      (bg.querySelector("#d-err") as HTMLElement).textContent = `Failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  });
}

function confirmDeleteProject(root: HTMLElement, project: Project) {
  if (document.querySelector(".modal-bg")) return;
  const bg = modalShell(`
    <h2>Delete project?</h2>
    <div class="modal-hint">Permanently delete <strong>${escapeHtml(project.name)}</strong> and all its designs? This can't be undone.</div>
    <div class="err" id="d-err"></div>
    <div class="actions">
      <button id="d-cancel">Cancel</button>
      <button class="danger" id="d-ok">Delete</button>
    </div>
  `);
  bg.querySelector("#d-cancel")!.addEventListener("click", () => bg.remove());
  bg.querySelector("#d-ok")!.addEventListener("click", async () => {
    try {
      await api.deleteProject(project.id);
      bg.remove();
      await reload(root);
    } catch (err) {
      (bg.querySelector("#d-err") as HTMLElement).textContent = `Failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
