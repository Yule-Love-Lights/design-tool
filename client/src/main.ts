import { api } from "./api";
import { renderLogin } from "./pages/login";
import { renderClients } from "./pages/clients";
import { renderProject } from "./pages/project";
import { renderEditor } from "./pages/editor";
import { renderSettings } from "./pages/settings";
import { setRenderSettings } from "./editor/renderSettings";

const root = document.getElementById("app")!;

// App-wide RENDER settings (e.g. spritzer ray density) are applied from the
// shell — NOT inside editor.ts — so the vendored editor core stays byte-
// identical with the quote tool (which applies them from its own shell +
// portal). Loaded once per app load, before any editor mount; the Settings
// page updates the in-memory value directly on save.
let renderSettingsApplied = false;
async function ensureRenderSettings() {
  if (renderSettingsApplied) return;
  renderSettingsApplied = true;
  try {
    setRenderSettings(await api.getRenderSettings());
  } catch {
    // Keep the built-in defaults if the fetch fails.
  }
}

// Track the current top-level route so internal navigations within the project
// page (design-tab switches via history.replaceState) don't re-run routing.
let currentRouteKey = "";

async function route() {
  const hash = window.location.hash.slice(1) || "/";
  if (hash === "/login") {
    currentRouteKey = "login";
    renderLogin(root);
    return;
  }
  const session = await api.session();
  if (!session.authed) {
    window.location.hash = "#/login";
    return;
  }
  // Apply stored render settings before mounting any authed view that renders
  // items (editor). Idempotent + guarded, so it only fetches once.
  await ensureRenderSettings();
  // Project page: #/project/:projectId or #/project/:projectId/:designId
  if (hash.startsWith("/project/")) {
    const parts = hash.slice("/project/".length).split("/");
    const projectId = parts[0];
    const designId = parts[1];
    // Only (re)mount the project page when the PROJECT changes. Tab switches
    // update the design segment via replaceState and shouldn't remount.
    const key = `project:${projectId}`;
    if (currentRouteKey !== key) {
      currentRouteKey = key;
      renderProject(root, projectId, designId);
    }
    return;
  }
  if (hash.startsWith("/editor/")) {
    currentRouteKey = "editor";
    const id = hash.slice("/editor/".length);
    renderEditor(root, id);
    return;
  }
  if (hash === "/settings") {
    currentRouteKey = "settings";
    renderSettings(root);
    return;
  }
  currentRouteKey = "clients";
  renderClients(root);
}

window.addEventListener("hashchange", route);
window.addEventListener("auth:expired", () => {
  window.location.hash = "#/login";
});
route();
