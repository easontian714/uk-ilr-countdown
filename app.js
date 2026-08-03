const DEFAULT_VISA_CATEGORY = "skilled-worker";
const TRIPS_PER_PAGE = 10;
const LOCAL_PROFILE_STORAGE_KEY = "ilr-countdown-local-profile-v2";
const AUTH_PROMPT_SEEN_KEY = "ilr-countdown-auth-prompt-seen";
const SUPABASE_URL = "https://eehroaunwvltcchrwocr.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_vdYBIgEmwnEhOU9zR2jmUg_ZlcbFRBf";
const cloud = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

let currentUser = null;
let currentTripsPage = 1;
let editingTripId = null;
let editingTripCities = [];
let profileState = readLocalProfile();

const dateFormatter = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric" });

function parseLocalDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toInputDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(date, days) { const result = new Date(date); result.setDate(result.getDate() + days); return result; }
function addYears(date, years) { const result = new Date(date); result.setFullYear(result.getFullYear() + years); return result; }
function subtractDays(date, days) { return addDays(date, -days); }
function todayAtMidnight() { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), now.getDate()); }
function formatDate(date) { return dateFormatter.format(date); }

function createExampleTrips() {
  const today = todayAtMidnight();
  return [
    { id: "example-completed-trip", country: "示例国家", cities: ["示例城市"], startDate: toInputDate(addDays(today, -35)), endDate: toInputDate(addDays(today, -31)), note: "示例行程（可编辑或删除）" },
    { id: "example-planned-trip", country: "示例国家", cities: ["示例城市"], startDate: toInputDate(addDays(today, 28)), endDate: toInputDate(addDays(today, 34)), note: "示例行程（可编辑或删除）" },
  ];
}

function blankProfile() {
  return { visaCategory: DEFAULT_VISA_CATEGORY, startDate: toInputDate(todayAtMidnight()), trips: createExampleTrips() };
}

function readLocalProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY));
    if (saved?.startDate && Array.isArray(saved.trips)) return { ...blankProfile(), ...saved };
  } catch { /* Use the example profile. */ }
  return blankProfile();
}

function persistLocalProfile() {
  localStorage.setItem(LOCAL_PROFILE_STORAGE_KEY, JSON.stringify(profileState));
}

function getTrips() { return profileState.trips; }
function getTripDestination(trip) { return { country: trip.country || "未填写国家", cities: Array.isArray(trip.cities) ? trip.cities : [] }; }
function formatTripDestination(trip) { const { country, cities } = getTripDestination(trip); return cities.length ? `${country} · ${cities.join("、")}` : country; }
function formatTripRange(trip) { return `${formatDate(parseLocalDate(trip.startDate))} — ${formatDate(parseLocalDate(trip.endDate))}`; }
function getTripStatus(trip) { return parseLocalDate(trip.endDate) <= todayAtMidnight() ? "已完成" : "计划中"; }

function getAbsentDateKeys(trips) {
  const absentDates = new Set();
  trips.forEach((trip) => {
    const firstAbsentDay = addDays(parseLocalDate(trip.startDate), 1);
    const lastAbsentDay = addDays(parseLocalDate(trip.endDate), -1);
    for (let date = firstAbsentDay; date <= lastAbsentDay; date = addDays(date, 1)) absentDates.add(toInputDate(date));
  });
  return absentDates;
}

function getTripAbsenceDays(trip) { return getAbsentDateKeys([trip]).size; }

function getMaxTwelveMonthAbsence(trips) {
  if (!trips.length) return null;
  const absentDateKeys = getAbsentDateKeys(trips);
  const firstTripDate = trips.reduce((earliest, trip) => {
    const date = parseLocalDate(trip.startDate); return date < earliest ? date : earliest;
  }, parseLocalDate(trips[0].startDate));
  const lastTripDate = trips.reduce((latest, trip) => {
    const date = parseLocalDate(trip.endDate); return date > latest ? date : latest;
  }, parseLocalDate(trips[0].endDate));
  const lastWindowStart = lastTripDate > todayAtMidnight() ? lastTripDate : todayAtMidnight();
  let best = { days: -1, start: firstTripDate, end: firstTripDate };
  for (let windowStart = firstTripDate; windowStart <= lastWindowStart; windowStart = addDays(windowStart, 1)) {
    const windowEnd = addDays(addYears(windowStart, 1), -1);
    let days = 0;
    for (let day = windowStart; day <= windowEnd; day = addDays(day, 1)) if (absentDateKeys.has(toInputDate(day))) days += 1;
    if (days > best.days) best = { days, start: windowStart, end: windowEnd };
  }
  return best;
}

function renderAbsenceSummary(trips) {
  const summary = getMaxTwelveMonthAbsence(trips);
  const daysElement = document.querySelector("#absence-days");
  const progressElement = document.querySelector("#absence-progress");
  const remainingElement = document.querySelector("#absence-remaining");
  const windowElement = document.querySelector("#absence-window");
  if (!summary) {
    daysElement.textContent = "0"; progressElement.value = 0; remainingElement.textContent = "距上限还剩 180 天"; windowElement.textContent = "还没有可计算的旅行记录。"; return;
  }
  daysElement.textContent = summary.days.toLocaleString("zh-CN");
  progressElement.value = Math.min(summary.days, 180);
  remainingElement.textContent = summary.days <= 180 ? `距上限还剩 ${(180 - summary.days).toLocaleString("zh-CN")} 天` : `已超出上限 ${(summary.days - 180).toLocaleString("zh-CN")} 天`;
  windowElement.textContent = `${formatDate(summary.start)} 至 ${formatDate(summary.end)}`;
}

function renderTrips() {
  const trips = [...getTrips()].sort((a, b) => b.startDate.localeCompare(a.startDate));
  const list = document.querySelector("#trips-list");
  const pagination = document.querySelector("#trips-pagination");
  list.replaceChildren();
  renderAbsenceSummary(trips);
  if (!trips.length) {
    const message = document.createElement("p"); message.className = "empty-trips"; message.textContent = "还没有旅行记录。"; list.append(message); pagination.hidden = true; return;
  }
  const totalPages = Math.ceil(trips.length / TRIPS_PER_PAGE);
  currentTripsPage = Math.min(currentTripsPage, totalPages);
  const visibleTrips = trips.slice((currentTripsPage - 1) * TRIPS_PER_PAGE, currentTripsPage * TRIPS_PER_PAGE);
  visibleTrips.forEach((trip) => {
    const card = document.createElement("article"); card.className = "trip-card";
    const details = document.createElement("div");
    const titleRow = document.createElement("div"); titleRow.className = "trip-title-row";
    const title = document.createElement("h3"); title.className = "trip-title"; title.textContent = formatTripDestination(trip);
    const status = document.createElement("span"); const statusText = getTripStatus(trip); status.className = `trip-status ${statusText === "已完成" ? "status-completed" : "status-planned"}`; status.textContent = statusText;
    const meta = document.createElement("p"); meta.className = "trip-meta";
    const range = document.createElement("span"); range.textContent = formatTripRange(trip);
    const countedDays = document.createElement("span"); countedDays.className = "trip-counted-days"; countedDays.textContent = `计入 ${getTripAbsenceDays(trip)} 天`;
    meta.append(range, countedDays); titleRow.append(title, status); details.append(titleRow, meta);
    if (trip.note) { const note = document.createElement("p"); note.className = "trip-note"; note.textContent = trip.note; details.append(note); }
    const actions = document.createElement("div"); actions.className = "trip-actions";
    [["edit", "编辑"], ["delete", "删除"]].forEach(([action, label]) => { const button = document.createElement("button"); button.type = "button"; button.className = "small-button"; button.dataset.action = action; button.dataset.tripId = trip.id; button.textContent = label; actions.append(button); });
    card.append(details, actions); list.append(card);
  });
  pagination.replaceChildren(); pagination.hidden = totalPages <= 1;
  if (totalPages > 1) {
    const previous = document.createElement("button"); previous.type = "button"; previous.className = "pagination-button"; previous.dataset.pageAction = "previous"; previous.disabled = currentTripsPage === 1; previous.textContent = "上一页";
    const indicator = document.createElement("span"); indicator.textContent = `第 ${currentTripsPage} / ${totalPages} 页`;
    const next = document.createElement("button"); next.type = "button"; next.className = "pagination-button"; next.dataset.pageAction = "next"; next.disabled = currentTripsPage === totalPages; next.textContent = "下一页";
    pagination.append(previous, indicator, next);
  }
}

function render() {
  const startDate = parseLocalDate(profileState.startDate);
  const fiveYearDate = addYears(startDate, 5);
  const earliestDate = subtractDays(fiveYearDate, 28);
  const today = todayAtMidnight();
  const daysRemaining = Math.ceil((earliestDate - today) / 86_400_000);
  const totalDays = Math.round((earliestDate - startDate) / 86_400_000);
  const elapsedDays = Math.max(0, Math.min(totalDays, Math.round((today - startDate) / 86_400_000)));
  const progressPercent = totalDays === 0 ? 100 : (elapsedDays / totalDays) * 100;
  document.querySelector("#start-date").textContent = formatDate(startDate);
  document.querySelector("#five-year-date").textContent = formatDate(fiveYearDate);
  document.querySelector("#earliest-date").textContent = formatDate(earliestDate);
  document.querySelector("#start-date-input").value = profileState.startDate;
  document.querySelector("#visa-category-input").value = profileState.visaCategory;
  document.querySelector("#visa-category-label").textContent = "Skilled Worker";
  document.querySelector("#eligibility-progress").value = progressPercent;
  document.querySelector("#progress-percent").textContent = `${progressPercent.toFixed(1)}%`;
  document.querySelector("#progress-detail").textContent = `已过 ${elapsedDays.toLocaleString("zh-CN")} / ${totalDays.toLocaleString("zh-CN")} 天`;
  if (daysRemaining > 0) {
    document.querySelector("#days-remaining").textContent = daysRemaining.toLocaleString("zh-CN");
    document.querySelector("#countdown-label").textContent = "天";
    document.querySelector("#countdown-detail").textContent = `预计最早可在 ${formatDate(earliestDate)} 递交申请。`;
  } else {
    document.querySelector("#days-remaining").textContent = "现在";
    document.querySelector("#countdown-label").textContent = "可以准备申请";
    document.querySelector("#countdown-detail").textContent = "请先核对届时的官方规则与个人连续居留记录。";
  }
  renderAuthState();
}

function renderAuthState() {
  const button = document.querySelector("#auth-button");
  if (currentUser) {
    button.textContent = "退出登录";
  } else {
    button.textContent = "Google 登录";
  }
}

function mapDatabaseTrip(row) {
  return { id: row.id, country: row.country, cities: row.cities || [], startDate: row.depart_uk_date, endDate: row.return_uk_date, note: row.note || "" };
}

function mapTripForDatabase(trip) {
  return { country: trip.country, cities: trip.cities, depart_uk_date: trip.startDate, return_uk_date: trip.endDate, note: trip.note || "" };
}

async function saveCloudProfile() {
  if (!currentUser) { persistLocalProfile(); return; }
  const { error } = await cloud.from("ilr_profiles").upsert({ user_id: currentUser.id, visa_category: profileState.visaCategory, qualifying_start_date: profileState.startDate, updated_at: new Date().toISOString() });
  if (error) throw error;
}

async function saveCloudTrips() {
  if (!currentUser) { persistLocalProfile(); return; }
  const { error: deleteError } = await cloud.from("ilr_trips").delete().eq("user_id", currentUser.id);
  if (deleteError) throw deleteError;
  if (!profileState.trips.length) return;
  const rows = profileState.trips.map(mapTripForDatabase).map((trip) => ({ ...trip, user_id: currentUser.id }));
  const { error: insertError } = await cloud.from("ilr_trips").insert(rows);
  if (insertError) throw insertError;
}

async function saveAll() {
  try { await saveCloudProfile(); await saveCloudTrips(); }
  catch (error) { console.error(error); alert("保存到云端失败，请检查网络后重试。"); }
}

async function loadCloudProfile() {
  const [{ data: profile, error: profileError }, { data: trips, error: tripsError }] = await Promise.all([
    cloud.from("ilr_profiles").select("visa_category, qualifying_start_date").maybeSingle(),
    cloud.from("ilr_trips").select("id, country, cities, depart_uk_date, return_uk_date, note").order("depart_uk_date", { ascending: false }),
  ]);
  if (profileError || tripsError) throw profileError || tripsError;
  if (profile) {
    profileState = { visaCategory: profile.visa_category, startDate: profile.qualifying_start_date, trips: (trips || []).map(mapDatabaseTrip) };
  } else {
    profileState = readLocalProfile();
  }
  currentTripsPage = 1; render(); renderTrips();
}

async function handleAuth() {
  if (currentUser) { await cloud.auth.signOut(); return; }
  const { error } = await cloud.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}${window.location.pathname}` } });
  if (error) alert("无法打开 Google 登录，请稍后重试。");
}

const authDialog = document.querySelector("#auth-dialog");
function openAuthPrompt() {
  if (!currentUser && !localStorage.getItem(AUTH_PROMPT_SEEN_KEY) && !authDialog.open) {
    localStorage.setItem(AUTH_PROMPT_SEEN_KEY, "true");
    authDialog.showModal();
  }
}
function closeAuthPrompt() {
  if (authDialog.open) authDialog.close();
}

document.querySelector("#auth-button").addEventListener("click", handleAuth);
document.querySelector("#auth-dialog-login").addEventListener("click", handleAuth);
document.querySelector("#auth-dialog-close").addEventListener("click", closeAuthPrompt);

const dialog = document.querySelector("#settings-dialog");
function openSettingsDialog() { document.querySelector("#start-date-input").value = profileState.startDate; document.querySelector("#visa-category-input").value = profileState.visaCategory; dialog.showModal(); document.querySelector("#settings-dialog-title").focus({ preventScroll: true }); }
document.querySelectorAll(".open-settings").forEach((button) => button.addEventListener("click", openSettingsDialog));
document.querySelector("#settings-form").addEventListener("submit", async (event) => {
  if (event.submitter?.value !== "save") return;
  event.preventDefault();
  const value = document.querySelector("#start-date-input").value;
  if (!value) return;
  profileState.startDate = value; profileState.visaCategory = document.querySelector("#visa-category-input").value;
  dialog.close(); render(); renderTrips(); await saveCloudProfile();
});

const dataMenu = document.querySelector(".data-menu");
function exportProfile() {
  const data = { version: 2, visaCategory: profileState.visaCategory, startDate: profileState.startDate, trips: profileState.trips };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "ilr-profile-backup.json"; link.click(); URL.revokeObjectURL(link.href);
}
document.querySelector("#export-profile").addEventListener("click", () => { exportProfile(); dataMenu.removeAttribute("open"); });
document.querySelector("#import-profile").addEventListener("click", () => { dataMenu.removeAttribute("open"); document.querySelector("#import-profile-file").click(); });
document.querySelector("#import-profile-file").addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const validTripList = Array.isArray(data.trips) && data.trips.every((trip) => trip && typeof trip.country === "string" && Array.isArray(trip.cities) && typeof trip.startDate === "string" && typeof trip.endDate === "string");
    if (!data.startDate || !data.visaCategory || !validTripList) throw new Error("invalid profile");
    profileState = { visaCategory: data.visaCategory, startDate: data.startDate, trips: data.trips.map((trip) => ({ ...trip, id: crypto.randomUUID() })) };
    currentTripsPage = 1; render(); renderTrips(); await saveAll(); alert(currentUser ? "资料已导入并私密保存。" : "资料导入成功。登录后可私密同步到云端。");
  } catch { alert("无法读取该资料文件。请确认它是由本工具导出的 JSON 文件。"); }
  finally { event.target.value = ""; }
});

const tripDialog = document.querySelector("#trip-dialog");
const tripForm = document.querySelector("#trip-form");
function openTripDialog(trip) {
  editingTripId = trip?.id || null; const { country, cities } = trip ? getTripDestination(trip) : { country: "", cities: [] }; editingTripCities = [...cities];
  document.querySelector("#trip-dialog-title").textContent = trip ? "编辑行程" : "新增行程";
  document.querySelector("#trip-country").value = country; document.querySelector("#trip-city-input").value = ""; renderTripCityTags();
  document.querySelector("#trip-start").value = trip?.startDate || ""; document.querySelector("#trip-end").value = trip?.endDate || ""; document.querySelector("#trip-note").value = trip?.note || ""; tripDialog.showModal();
}
function renderTripCityTags() {
  const tags = document.querySelector("#trip-city-tags"); tags.replaceChildren();
  editingTripCities.forEach((city, index) => { const tag = document.createElement("span"); tag.className = "city-tag"; const label = document.createElement("span"); label.textContent = city; const remove = document.createElement("button"); remove.type = "button"; remove.className = "remove-city-button"; remove.dataset.cityIndex = index; remove.setAttribute("aria-label", `移除${city}`); remove.textContent = "×"; tag.append(label, remove); tags.append(tag); });
}
function addTripCity() { const input = document.querySelector("#trip-city-input"); const city = input.value.trim(); if (city && !editingTripCities.includes(city)) editingTripCities.push(city); input.value = ""; renderTripCityTags(); }
document.querySelector("#add-trip").addEventListener("click", () => openTripDialog());
document.querySelector("#add-trip-city").addEventListener("click", addTripCity);
document.querySelector("#trip-city-input").addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); addTripCity(); } });
document.querySelector("#trip-city-tags").addEventListener("click", (event) => { const button = event.target.closest("button[data-city-index]"); if (!button) return; editingTripCities.splice(Number(button.dataset.cityIndex), 1); renderTripCityTags(); });
tripForm.addEventListener("submit", async (event) => {
  if (event.submitter?.value !== "save") return;
  event.preventDefault();
  const country = document.querySelector("#trip-country").value.trim(); const startDate = document.querySelector("#trip-start").value; const endDate = document.querySelector("#trip-end").value;
  if (!country || !startDate || !endDate || endDate < startDate) return;
  const trip = { id: editingTripId || crypto.randomUUID(), country, cities: [...editingTripCities], startDate, endDate, note: document.querySelector("#trip-note").value.trim() };
  profileState.trips = editingTripId ? profileState.trips.map((item) => item.id === editingTripId ? trip : item) : [...profileState.trips, trip];
  if (!editingTripId) currentTripsPage = 1; tripDialog.close(); renderTrips(); await saveCloudTrips();
});
document.querySelector("#trips-list").addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-trip-id]"); if (!button) return;
  const trip = profileState.trips.find((item) => item.id === button.dataset.tripId); if (!trip) return;
  if (button.dataset.action === "edit") openTripDialog(trip);
  if (button.dataset.action === "delete" && confirm(`删除“${formatTripDestination(trip)}”这条行程吗？`)) { profileState.trips = profileState.trips.filter((item) => item.id !== trip.id); renderTrips(); await saveCloudTrips(); }
});
document.querySelector("#trips-pagination").addEventListener("click", (event) => { const button = event.target.closest("button[data-page-action]"); if (!button) return; currentTripsPage += button.dataset.pageAction === "next" ? 1 : -1; renderTrips(); });
document.querySelector("#export-trips").addEventListener("click", () => {
  const csvCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const rows = [...profileState.trips].sort((a, b) => b.startDate.localeCompare(a.startDate)).map((trip) => [trip.country, trip.cities.join("、"), trip.startDate, trip.endDate, trip.note]);
  const blob = new Blob([`\ufeff${[["国家", "城市", "离开英国", "回到英国", "备注"], ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`], { type: "text/csv;charset=utf-8" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "ilr-travel-records.csv"; link.click(); URL.revokeObjectURL(link.href); document.querySelector(".trip-actions-menu").removeAttribute("open");
});
document.querySelector("#clear-trips").addEventListener("click", async () => { if (!confirm("确定要清空全部旅行记录吗？此操作无法撤销。")) return; profileState.trips = []; currentTripsPage = 1; document.querySelector(".trip-actions-menu").removeAttribute("open"); renderTrips(); await saveCloudTrips(); });
document.addEventListener("pointerdown", (event) => document.querySelectorAll(".trip-actions-menu[open], .data-menu[open]").forEach((menu) => { if (!menu.contains(event.target)) menu.removeAttribute("open"); }));

async function initialise() {
  render(); renderTrips();
  const { data: { user } } = await cloud.auth.getUser();
  currentUser = user;
  if (currentUser) {
    localStorage.setItem(AUTH_PROMPT_SEEN_KEY, "true");
    try { await loadCloudProfile(); } catch (error) { console.error(error); alert("无法读取云端资料，请稍后刷新重试。"); }
  } else openAuthPrompt();
  renderAuthState();
}

cloud.auth.onAuthStateChange(async (_event, session) => {
  const previousUserId = currentUser?.id;
  currentUser = session?.user || null;
  if (currentUser) {
    localStorage.setItem(AUTH_PROMPT_SEEN_KEY, "true");
    closeAuthPrompt();
  }
  if (currentUser && currentUser.id !== previousUserId) {
    try { await loadCloudProfile(); } catch (error) { console.error(error); alert("无法读取云端资料，请稍后刷新重试。"); }
  }
  if (!currentUser) { profileState = readLocalProfile(); render(); renderTrips(); }
  renderAuthState();
});

initialise();
