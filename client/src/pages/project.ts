import { api, type DesignSummary, type ProjectView } from "../api";
import { renderEditor } from "./editor";

// The project page (HHC image 4): a breadcrumb + a row of design tabs, with
// the editor embedded below for the active design. Switching tabs tears down
// the current editor and mounts the next one; "+ New" creates a design and
// switches to it. Deep-linkable as #/project/:projectId/:designId.
export async function renderProject(
  root: HTMLElement,
  projectId: string,
  initialDesignId?: string,
) {
  let view: ProjectView;
  try {
    view = await api.getProject(projectId);
  } catch {
    window.location.hash = "#/";
    return;
  }

  let designs: DesignSummary[] = view.designs;
  let activeId =
    initialDesignId && designs.some((d) => d.id === initialDesignId)
      ? initialDesignId
      : designs[0]?.id ?? null;
  let destroyEditor: (() => void) | null = null;

  root.innerHTML = `
    <div class="project-page">
      <div class="project-bar">
        <div class="breadcrumb">
          <a href="#/">Clients</a>
          <span class="sep">›</span>
          <span class="crumb">${escapeHtml(view.client?.name ?? "Client")}</span>
          <span class="sep">›</span>
          <span class="crumb current">${escapeHtml(view.project.name)}</span>
        </div>
        <div class="design-tabs" id="design-tabs"></div>
      </div>
      <div class="editor-host" id="editor-host"></div>
    </div>
  `;

  const tabsEl = root.querySelector("#design-tabs") as HTMLElement;
  const host = root.querySelector("#editor-host") as HTMLElement;

  function renderTabs() {
    const tabs = designs
      .map(
        (d, i) =>
          `<div class="design-tab${d.id === activeId ? " active" : ""}" data-id="${d.id}">
             <span class="tab-label">${escapeHtml(d.name || `Design ${i + 1}`)}</span>
             <span class="tab-del" title="Delete design">×</span>
           </div>`,
      )
      .join("");
    tabsEl.innerHTML = `${tabs}<button class="design-tab new" id="new-design">+ New</button>`;
    tabsEl.querySelectorAll<HTMLElement>(".design-tab[data-id]").forEach((tab) => {
      const id = tab.dataset.id!;
      tab.querySelector(".tab-del")?.addEventListener("click", (e) => {
        e.stopPropagation();
        void deleteDesign(id);
      });
      tab.addEventListener("click", () => switchTo(id));
    });
    tabsEl.querySelector("#new-design")?.addEventListener("click", createNewDesign);
  }

  async function mountEditor() {
    if (destroyEditor) {
      destroyEditor();
      destroyEditor = null;
    }
    host.innerHTML = "";
    if (!activeId) {
      host.innerHTML = `<div class="project-empty">No designs yet. Click "+ New" to add the first one.</div>`;
      return;
    }
    destroyEditor = await renderEditor(host, activeId, {
      embedded: true,
      onBack: () => {
        window.location.hash = "#/";
      },
    });
  }

  function switchTo(id: string) {
    if (id === activeId) return;
    activeId = id;
    // replaceState (not hash assignment) so we don't trigger the router and
    // re-render the whole page — the tab swap is handled in place.
    history.replaceState(null, "", `#/project/${projectId}/${id}`);
    renderTabs();
    void mountEditor();
  }

  async function createNewDesign() {
    try {
      const name = `Design ${designs.length + 1}`;
      const d = await api.createDesign(projectId, name);
      designs = [
        ...designs,
        { id: d.id, projectId, name: d.name, photoUrl: null, createdAt: d.createdAt, updatedAt: d.updatedAt },
      ];
      activeId = d.id;
      history.replaceState(null, "", `#/project/${projectId}/${d.id}`);
      renderTabs();
      void mountEditor();
    } catch (err) {
      alert(`Couldn't create a new design: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function deleteDesign(id: string) {
    const d = designs.find((x) => x.id === id);
    if (!d) return;
    if (!confirm(`Delete "${d.name || "this design"}"? This can't be undone.`)) return;
    try {
      await api.deleteDesign(id);
    } catch (err) {
      alert(`Couldn't delete that design: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    const wasActive = activeId === id;
    designs = designs.filter((x) => x.id !== id);
    if (wasActive) {
      activeId = designs[0]?.id ?? null;
      history.replaceState(
        null,
        "",
        activeId ? `#/project/${projectId}/${activeId}` : `#/project/${projectId}`,
      );
    }
    renderTabs();
    // Only remount the editor when the design that was open got removed.
    if (wasActive) void mountEditor();
  }

  // Tear down the embedded editor when the user navigates away from this
  // project (any hash that isn't this project's). replaceState during tab
  // switches doesn't fire hashchange, so this only runs on real navigation.
  function onHash() {
    const h = window.location.hash.slice(1);
    if (!h.startsWith(`/project/${projectId}`)) {
      if (destroyEditor) {
        destroyEditor();
        destroyEditor = null;
      }
      window.removeEventListener("hashchange", onHash);
    }
  }
  window.addEventListener("hashchange", onHash);

  renderTabs();
  await mountEditor();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
