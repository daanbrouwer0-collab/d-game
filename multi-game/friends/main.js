import {
  addFriend,
  listFriends,
  removeFriend,
  updateFriend,
} from "../js/core/storage.js";
import { mountShellNav } from "../js/shell/nav.js";
import { buildSiteHomeUrl } from "../js/shell/site-url.js";

mountShellNav({ active: "friends", base: "../" });

const listEl = document.getElementById("friend-list");
const emptyEl = document.getElementById("friends-empty");
const errEl = document.getElementById("friends-error");

function render() {
  const friends = listFriends();
  emptyEl.classList.toggle("hidden", friends.length > 0);
  listEl.innerHTML = "";
  for (const f of friends) {
    const li = document.createElement("li");
    li.className = "friend-row";
    li.innerHTML = `
      <div class="meta">
        <strong>${escapeHtml(f.name)}</strong>
        <div class="hint">${escapeHtml(f.note || "—")}</div>
      </div>
      <div class="actions">
        <button type="button" class="btn btn-ghost" data-invite="${f.id}">Deel site</button>
        <button type="button" class="btn btn-ghost" data-edit="${f.id}">Bewerk</button>
        <button type="button" class="btn btn-ghost" data-del="${f.id}">Wis</button>
      </div>`;
    listEl.appendChild(li);
  }

  listEl.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", () => {
      removeFriend(btn.getAttribute("data-del"));
      render();
    });
  });
  listEl.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-edit");
      const f = listFriends().find((x) => x.id === id);
      if (!f) return;
      const name = prompt("Naam", f.name);
      if (name == null) return;
      const note = prompt("Notitie", f.note || "");
      if (note == null) return;
      updateFriend(id, { name, note });
      render();
    });
  });
  listEl.querySelectorAll("[data-invite]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const url = buildSiteHomeUrl();
      try {
        await navigator.clipboard.writeText(`Speel mee op D-Game: ${url}`);
        errEl.textContent = "Uitnodigingstekst gekopieerd.";
      } catch {
        errEl.textContent = url;
      }
    });
  });
}

document.getElementById("btn-add-friend").addEventListener("click", () => {
  errEl.textContent = "";
  const name = document.getElementById("friend-name").value;
  const note = document.getElementById("friend-note").value;
  if (!name.trim()) {
    errEl.textContent = "Vul een naam in.";
    return;
  }
  addFriend({ name, note });
  document.getElementById("friend-name").value = "";
  document.getElementById("friend-note").value = "";
  render();
});

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

render();
