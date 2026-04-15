// ─── Supabase config ─────────────────────────────────────────────────────────
const SUPABASE_URL  = "https://zxuspskonqlulwnzbyth.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4dXNwc2tvbnFsdWx3bnpieXRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMzc0NzUsImV4cCI6MjA5MTgxMzQ3NX0.KrPi_82s1MTWy181fvJ4WIX03xV8gpjOqvgWhNcNXqk";

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

// ─── State ────────────────────────────────────────────────────────────────────
let currentTab  = "frigo";
let listCode    = null;
let pseudo      = null;
let items       = [];
let realtimeSub = null;

// ─── DOM ──────────────────────────────────────────────────────────────────────
const loginScreen     = document.getElementById("loginScreen");
const appScreen       = document.getElementById("appScreen");
const pseudoInput     = document.getElementById("pseudoInput");
const codeInput       = document.getElementById("codeInput");
const createListBtn   = document.getElementById("createListBtn");
const joinListBtn     = document.getElementById("joinListBtn");
const itemInput       = document.getElementById("itemInput");
const addBtn          = document.getElementById("addBtn");
const listEl          = document.getElementById("list");
const listInfo        = document.getElementById("listInfo");
const shareBtn        = document.getElementById("shareBtn");
const logoutBtn       = document.getElementById("logoutBtn");
const shareModal      = document.getElementById("shareModal");
const shareCodeEl     = document.getElementById("shareCode");
const copyCodeBtn     = document.getElementById("copyCodeBtn");
const closeModalBtn   = document.getElementById("closeModalBtn");
const emptyState      = document.getElementById("emptyState");
const onlineIndicator = document.getElementById("onlineIndicator");
const emailInput      = document.getElementById("emailInput");
const passwordInput   = document.getElementById("passwordInput");
const signupBtn       = document.getElementById("signupBtn");
const signinBtn       = document.getElementById("signinBtn");
const authError       = document.getElementById("authError");
const authSection     = document.getElementById("authSection");
const listSection     = document.getElementById("listSection");
const loggedInfo      = document.getElementById("loggedInfo");
const logoutAuthBtn   = document.getElementById("logoutAuthBtn");

// ─── Helpers ──────────────────────────────────────────────────────────────────
function genCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({length: 6}, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2500);
}
function showAuthError(msg) { authError.textContent = msg; }

// ─── Auth ─────────────────────────────────────────────────────────────────────
signupBtn.onclick = async () => {
  const email = emailInput.value.trim();
  const pass  = passwordInput.value;
  const name  = pseudoInput.value.trim();
  if (!name)  { showAuthError("Entrez votre prénom"); return; }
  if (!email) { showAuthError("Entrez votre email"); return; }
  if (pass.length < 6) { showAuthError("Mot de passe : 6 caractères minimum"); return; }
  const { data, error } = await supabase.auth.signUp({
    email, password: pass,
    options: { data: { pseudo: name } }
  });
  if (error) { showAuthError(error.message); return; }
  if (data.session) {
    await onSignedIn(data.session.user);
  } else {
    showAuthError("✅ Vérifiez votre email pour confirmer le compte, puis connectez-vous.");
  }
};

signinBtn.onclick = async () => {
  const email = emailInput.value.trim();
  const pass  = passwordInput.value;
  if (!email || !pass) { showAuthError("Email et mot de passe requis"); return; }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
  if (error) { showAuthError("Email ou mot de passe incorrect"); return; }
  await onSignedIn(data.user);
};

logoutAuthBtn.onclick = async () => {
  if (realtimeSub) supabase.removeChannel(realtimeSub);
  await supabase.auth.signOut();
  listCode = null; pseudo = null; items = [];
  listEl.innerHTML = "";
  appScreen.classList.remove("active");
  loginScreen.classList.add("active");
  authSection.style.display = "flex";
  listSection.style.display = "none";
  authError.textContent = "";
};

async function onSignedIn(user) {
  pseudo = user.user_metadata?.pseudo || user.email.split("@")[0];
  authError.textContent = "";
  // Chercher liste associée au compte
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("list_code")
    .eq("user_id", user.id)
    .single();
  if (profile?.list_code) {
    listCode = profile.list_code;
    authSection.style.display = "none";
    listSection.style.display = "none";
    loggedInfo.textContent = `Connecté : ${pseudo}`;
    loginScreen.classList.remove("active");
    appScreen.classList.add("active");
    listInfo.textContent = `Liste : ${listCode}  •  ${pseudo}`;
    await fetchItems();
    subscribeRealtime();
  } else {
    authSection.style.display = "none";
    listSection.style.display = "flex";
    loggedInfo.textContent = `Connecté : ${pseudo}`;
    pseudoInput.value = pseudo;
  }
}

async function saveUserList(userId) {
  await supabase.from("user_profiles").upsert({ user_id: userId, list_code: listCode }, { onConflict: "user_id" });
}

// ─── Créer / Rejoindre liste ───────────────────────────────────────────────────
createListBtn.onclick = async () => {
  const p = pseudoInput.value.trim();
  if (!p) { showToast("Entrez votre prénom d'abord"); pseudoInput.focus(); return; }
  pseudo   = p;
  listCode = genCode();
  const { error } = await supabase.from("lists").insert({ code: listCode, created_by: pseudo });
  if (error) { showToast("❌ Erreur : " + error.message); return; }
  const { data: { user } } = await supabase.auth.getUser();
  if (user) await saveUserList(user.id);
  enterApp();
};

joinListBtn.onclick = async () => {
  const p    = pseudoInput.value.trim();
  const code = codeInput.value.trim().toUpperCase();
  if (!p)            { showToast("Entrez votre prénom d'abord"); pseudoInput.focus(); return; }
  if (code.length !== 6) { showToast("Code invalide (6 caractères)"); codeInput.focus(); return; }
  const { data, error } = await supabase.from("lists").select("code").eq("code", code).single();
  if (error || !data) { showToast("❌ Liste introuvable"); return; }
  pseudo   = p;
  listCode = code;
  const { data: { user } } = await supabase.auth.getUser();
  if (user) await saveUserList(user.id);
  enterApp();
};

// ─── App ──────────────────────────────────────────────────────────────────────
async function enterApp() {
  loginScreen.classList.remove("active");
  appScreen.classList.add("active");
  listInfo.textContent = `Liste : ${listCode}  •  ${pseudo}`;
  loggedInfo.textContent = `Connecté : ${pseudo}`;
  await fetchItems();
  subscribeRealtime();
  window.addEventListener("online",  () => onlineIndicator.classList.remove("offline"));
  window.addEventListener("offline", () => onlineIndicator.classList.add("offline"));
}

// ─── Fetch ────────────────────────────────────────────────────────────────────
async function fetchItems() {
  const { data, error } = await supabase
    .from("items").select("*").eq("list_code", listCode).order("created_at", { ascending: true });
  if (error) { showToast("Erreur chargement"); return; }
  items = data || [];
  render();
}

// ─── Realtime ─────────────────────────────────────────────────────────────────
function subscribeRealtime() {
  if (realtimeSub) supabase.removeChannel(realtimeSub);
  realtimeSub = supabase
    .channel(`items-${listCode}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "items", filter: `list_code=eq.${listCode}` }, (payload) => {
      if (payload.eventType === "INSERT") {
        const exists = items.find(i => i.id === payload.new.id);
        if (!exists) {
          const tempIdx = items.findIndex(i => i._temp && i.name === payload.new.name && i.tab === payload.new.tab);
          if (tempIdx !== -1) items[tempIdx] = payload.new;
          else items.push(payload.new);
          render();
        }
      } else if (payload.eventType === "UPDATE") {
        const idx = items.findIndex(i => i.id === payload.new.id);
        if (idx !== -1) { items[idx] = payload.new; render(); }
      } else if (payload.eventType === "DELETE") {
        items = items.filter(i => i.id !== payload.old.id);
        render();
      }
    })
    .subscribe();
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────
addBtn.onclick = addItem;
itemInput.onkeydown = e => { if (e.key === "Enter") addItem(); };

async function addItem() {
  const name = itemInput.value.trim();
  if (!name) return;
  itemInput.value = "";
  // Ajout optimiste immédiat
  const tempId = -(Date.now());
  const tempItem = { id: tempId, list_code: listCode, name, checked: false, tab: currentTab, added_by: pseudo, created_at: new Date().toISOString(), _temp: true };
  items.push(tempItem);
  render();
  const { data, error } = await supabase.from("items").insert({ list_code: listCode, name, checked: false, tab: currentTab, added_by: pseudo }).select().single();
  if (error) {
    items = items.filter(i => i.id !== tempId);
    render();
    showToast("❌ " + error.message);
  } else {
    const idx = items.findIndex(i => i.id === tempId);
    if (idx !== -1) items[idx] = data;
    render();
  }
}

async function toggle(id, checked) {
  const idx = items.findIndex(i => i.id === id);
  if (idx !== -1) { items[idx].checked = !checked; render(); }
  await supabase.from("items").update({ checked: !checked }).eq("id", id);
}
async function del(id) {
  items = items.filter(i => i.id !== id);
  render();
  await supabase.from("items").delete().eq("id", id);
}
async function move(id, fromTab) {
  const toTab = fromTab === "frigo" ? "courses" : "frigo";
  const idx = items.findIndex(i => i.id === id);
  if (idx !== -1) { items[idx].tab = toTab; items[idx].checked = false; render(); }
  await supabase.from("items").update({ tab: toTab, checked: false }).eq("id", id);
  showToast(toTab === "courses" ? "➡️ Déplacé vers Courses" : "⬅️ Déplacé vers Frigo");
}

window._toggle = toggle;
window._del    = del;
window._move   = move;

// ─── Render ───────────────────────────────────────────────────────────────────
function render() {
  const filtered = items.filter(i => i.tab === currentTab);
  listEl.innerHTML = "";
  if (filtered.length === 0) {
    emptyState.style.display = "block";
    document.getElementById("emptyEmoji").textContent = currentTab === "frigo" ? "🧊" : "🛒";
    document.getElementById("emptyText").textContent  = currentTab === "frigo" ? "Frigo vide !" : "Liste vide !";
    return;
  }
  emptyState.style.display = "none";
  const sorted = [...filtered].sort((a, b) => (a.checked === b.checked ? 0 : a.checked ? 1 : -1));
  sorted.forEach(item => {
    const li = document.createElement("li");
    if (item._temp) li.style.opacity = "0.55";
    const moveLabel = item.tab === "frigo" ? "→ Courses" : "← Frigo";
    li.innerHTML = `
      <div class="item-left">
        <div class="item-check ${item.checked ? 'checked' : ''}" onclick="window._toggle(${item.id}, ${item.checked})">
          ${item.checked ? '✓' : ''}
        </div>
        <div>
          <div class="item-name ${item.checked ? 'checked' : ''}">${item.name}</div>
          <div class="item-meta">${item.added_by || ''}</div>
        </div>
      </div>
      <div class="actions">
        ${item._temp ? '' : `<button class="btn-move" onclick="window._move(${item.id}, '${item.tab}')">${moveLabel}</button>`}
        ${item._temp ? '' : `<button class="btn-del"  onclick="window._del(${item.id})">✕</button>`}
      </div>`;
    listEl.appendChild(li);
  });
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
document.querySelectorAll(".tab").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentTab = btn.dataset.tab;
    render();
  };
});

// ─── Share ────────────────────────────────────────────────────────────────────
shareBtn.onclick = () => { shareCodeEl.textContent = listCode; shareModal.style.display = "flex"; };
closeModalBtn.onclick = () => shareModal.style.display = "none";
shareModal.onclick = e => { if (e.target === shareModal) shareModal.style.display = "none"; };
copyCodeBtn.onclick = () => {
  navigator.clipboard.writeText(listCode).then(() => { showToast("✅ Code copié !"); shareModal.style.display = "none"; });
};

// ─── Quitter liste (sans déconnexion du compte) ────────────────────────────────
logoutBtn.onclick = async () => {
  if (!confirm("Quitter cette liste ? Vous pourrez en rejoindre une autre.")) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (user) await supabase.from("user_profiles").delete().eq("user_id", user.id);
  if (realtimeSub) supabase.removeChannel(realtimeSub);
  listCode = null; items = [];
  listEl.innerHTML = "";
  appScreen.classList.remove("active");
  loginScreen.classList.add("active");
  authSection.style.display = "none";
  listSection.style.display = "flex";
  pseudoInput.value = pseudo || "";
};

// ─── Auto-connexion session active ────────────────────────────────────────────
(async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) await onSignedIn(session.user);
})();

if ("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js");
