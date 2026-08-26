import {
  clearAllRecentRooms,
  clearAllSandboxData,
  clearEventLogs,
  ensureLocalProfile,
  getCharacter,
  getDisplayName,
  setCharacter,
  setDisplayName,
  storageCounts,
} from "../js/core/storage.js";
import { mountShellNav } from "../js/shell/nav.js";

mountShellNav({ active: "geheugen", base: "../" });

const nameInput = document.getElementById("display-name");
const head = document.getElementById("color-head");
const body = document.getElementById("color-body");
const legs = document.getElementById("color-legs");
const profileMsg = document.getElementById("profile-msg");
const clearMsg = document.getElementById("clear-msg");
const stats = document.getElementById("stats");

function refreshStats() {
  const c = storageCounts();
  stats.innerHTML = `
    <div class="stat-pill"><strong>${c.recentRooms}</strong><span>rooms</span></div>
    <div class="stat-pill"><strong>${c.eventLogs}</strong><span>logs</span></div>`;
}

function loadProfile() {
  ensureLocalProfile();
  nameInput.value = getDisplayName();
  const ch = getCharacter() || {
    head: "#cccccc",
    body: "#888888",
    legs: "#444444",
  };
  head.value = ch.head;
  body.value = ch.body;
  legs.value = ch.legs;
}

document.getElementById("btn-save-profile").addEventListener("click", () => {
  setDisplayName(nameInput.value);
  setCharacter({ head: head.value, body: body.value, legs: legs.value });
  profileMsg.textContent = "Profiel opgeslagen.";
});

document.getElementById("btn-clear-rooms").addEventListener("click", () => {
  if (!confirm("Recente rooms wissen?")) return;
  clearAllRecentRooms();
  clearMsg.textContent = "Rooms gewist.";
  refreshStats();
});

document.getElementById("btn-clear-logs").addEventListener("click", () => {
  if (!confirm("Event-logs wissen?")) return;
  clearEventLogs();
  clearMsg.textContent = "Event-logs gewist.";
  refreshStats();
});

document.getElementById("btn-clear-all").addEventListener("click", () => {
  if (!confirm("Alles wissen (profiel, rooms, logs, voorkeur)?")) return;
  clearAllSandboxData();
  loadProfile();
  clearMsg.textContent = "Alles gewist.";
  refreshStats();
});

loadProfile();
refreshStats();
