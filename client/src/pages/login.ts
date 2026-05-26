import { api } from "../api";

export function renderLogin(root: HTMLElement) {
  root.innerHTML = `
    <div class="login">
      <form>
        <h1>Yule Love Lights</h1>
        <input type="password" name="password" placeholder="Password" autofocus required />
        <button class="primary" type="submit">Sign in</button>
        <div class="err"></div>
      </form>
    </div>
  `;
  const form = root.querySelector("form")!;
  const err = root.querySelector(".err")!;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.textContent = "";
    const password = (form.querySelector('[name="password"]') as HTMLInputElement).value;
    const ok = await api.login(password);
    if (ok) {
      window.location.hash = "#/";
    } else {
      err.textContent = "Wrong password";
    }
  });
}
