import { api } from "./api";
import { renderLogin } from "./pages/login";
import { renderDesigns } from "./pages/designs";
import { renderEditor } from "./pages/editor";
import { renderSettings } from "./pages/settings";

const root = document.getElementById("app")!;

async function route() {
  const hash = window.location.hash.slice(1) || "/";
  if (hash === "/login") {
    renderLogin(root);
    return;
  }
  const session = await api.session();
  if (!session.authed) {
    window.location.hash = "#/login";
    return;
  }
  if (hash.startsWith("/editor/")) {
    const id = hash.slice("/editor/".length);
    renderEditor(root, id);
    return;
  }
  if (hash === "/settings") {
    renderSettings(root);
    return;
  }
  renderDesigns(root);
}

window.addEventListener("hashchange", route);
window.addEventListener("auth:expired", () => {
  window.location.hash = "#/login";
});
route();
