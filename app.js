const DEFAULT_START_DATE = "2026-07-28";
const STORAGE_KEY = "ilr-countdown-start-date";
const VISA_CATEGORY_STORAGE_KEY = "ilr-countdown-visa-category";
const DEFAULT_VISA_CATEGORY = "skilled-worker";
const TRIPS_STORAGE_KEY = "ilr-countdown-trips";
const TRIPS_SEED_VERSION_KEY = "ilr-countdown-trips-seed-version";
const CURRENT_TRIPS_SEED_VERSION = "10";
const TRIPS_PER_PAGE = 10;
let currentTripsPage = 1;
const DEFAULT_TRIPS = [{
  id: "philadelphia-2026-08",
  country: "美国",
  cities: ["费城"],
  startDate: "2026-08-23",
  endDate: "2026-09-06",
  note: "美国旅行",
}, {
  id: "athens-2025-12",
  country: "希腊",
  cities: ["雅典"],
  startDate: "2025-12-01",
  endDate: "2025-12-03",
  note: "希腊旅行",
}, {
  id: "eindhoven-2026-02",
  country: "荷兰",
  cities: ["埃因霍温"],
  startDate: "2026-02-28",
  endDate: "2026-03-01",
  note: "荷兰旅行",
}, {
  id: "barcelona-2026-04",
  country: "西班牙",
  cities: ["巴塞罗那"],
  startDate: "2026-04-18",
  endDate: "2026-04-20",
  note: "西班牙旅行",
}, {
  id: "frankfurt-2026-05",
  country: "德国",
  cities: ["法兰克福"],
  startDate: "2026-05-15",
  endDate: "2026-05-17",
  note: "德国旅行",
}, {
  id: "china-2026-01",
  country: "中国",
  cities: ["上海", "珠海"],
  startDate: "2026-01-15",
  endDate: "2026-01-24",
  note: "回国差旅",
}, {
  id: "naples-2026-05",
  country: "意大利",
  cities: ["那不勒斯"],
  startDate: "2026-05-30",
  endDate: "2026-06-01",
  note: "意大利旅行",
}, {
  id: "paris-2026-04",
  country: "法国",
  cities: ["巴黎"],
  startDate: "2026-04-03",
  endDate: "2026-04-06",
  note: "法国旅行",
}];
const TRIP_NOTE_UPDATES = Object.fromEntries(DEFAULT_TRIPS.map((trip) => [trip.id, trip.note]));
const TRIP_DESTINATION_UPDATES = Object.fromEntries(DEFAULT_TRIPS.map((trip) => [trip.id, { country: trip.country, cities: trip.cities }]));

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

function parseLocalDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toInputDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addYears(date, years) {
  const result = new Date(date);
  result.setFullYear(result.getFullYear() + years);
  return result;
}

function subtractDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() - days);
  return result;
}

function todayAtMidnight() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function formatDate(date) {
  return dateFormatter.format(date);
}

function getTrips() {
  const savedTrips = localStorage.getItem(TRIPS_STORAGE_KEY);
  if (savedTrips === null) {
    localStorage.setItem(TRIPS_STORAGE_KEY, JSON.stringify(DEFAULT_TRIPS));
    localStorage.setItem(TRIPS_SEED_VERSION_KEY, CURRENT_TRIPS_SEED_VERSION);
    return DEFAULT_TRIPS;
  }
  try {
    const trips = JSON.parse(savedTrips);
    if (!Array.isArray(trips)) return [];
    if (localStorage.getItem(TRIPS_SEED_VERSION_KEY) !== CURRENT_TRIPS_SEED_VERSION) {
      const updatedTrips = trips.map((trip) => {
        const destinationUpdate = TRIP_DESTINATION_UPDATES[trip.id];
        return {
          ...trip,
          ...(TRIP_NOTE_UPDATES[trip.id] ? { note: TRIP_NOTE_UPDATES[trip.id] } : {}),
          ...(destinationUpdate ? { country: destinationUpdate.country, cities: destinationUpdate.cities } : {}),
        };
      });
      const missingSeedTrips = DEFAULT_TRIPS.filter((seedTrip) => !updatedTrips.some((trip) => trip.id === seedTrip.id));
      const mergedTrips = [...updatedTrips, ...missingSeedTrips];
      saveTrips(mergedTrips);
      localStorage.setItem(TRIPS_SEED_VERSION_KEY, CURRENT_TRIPS_SEED_VERSION);
      return mergedTrips;
    }
    return trips;
  } catch {
    return [];
  }
}

function saveTrips(trips) {
  localStorage.setItem(TRIPS_STORAGE_KEY, JSON.stringify(trips));
}

function formatTripRange(trip) {
  return `${formatDate(parseLocalDate(trip.startDate))} — ${formatDate(parseLocalDate(trip.endDate))}`;
}

function getTripDestination(trip) {
  if (trip.country) return { country: trip.country, cities: Array.isArray(trip.cities) ? trip.cities : [] };
  const [country, cityText = ""] = (trip.destination || "未填写国家").split(" · ");
  return { country, cities: cityText ? cityText.split("、") : [] };
}

function formatTripDestination(trip) {
  const { country, cities } = getTripDestination(trip);
  return cities.length ? `${country} · ${cities.join("、")}` : country;
}

function getTripStatus(trip) {
  return parseLocalDate(trip.endDate) <= todayAtMidnight() ? "已完成" : "计划中";
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function dateKey(date) {
  return toInputDate(date);
}

function getAbsentDateKeys(trips) {
  const absentDates = new Set();
  trips.forEach((trip) => {
    const firstAbsentDay = addDays(parseLocalDate(trip.startDate), 1);
    const lastAbsentDay = addDays(parseLocalDate(trip.endDate), -1);
    for (let date = firstAbsentDay; date <= lastAbsentDay; date = addDays(date, 1)) {
      absentDates.add(dateKey(date));
    }
  });
  return absentDates;
}

function getTripAbsenceDays(trip) {
  return getAbsentDateKeys([trip]).size;
}

function getMaxTwelveMonthAbsence(trips) {
  if (trips.length === 0) return null;
  const absentDateKeys = getAbsentDateKeys(trips);
  const firstTripDate = trips.reduce((earliest, trip) => {
    const date = parseLocalDate(trip.startDate);
    return date < earliest ? date : earliest;
  }, parseLocalDate(trips[0].startDate));
  const lastTripDate = trips.reduce((latest, trip) => {
    const date = parseLocalDate(trip.endDate);
    return date > latest ? date : latest;
  }, parseLocalDate(trips[0].endDate));
  const lastWindowStart = lastTripDate > todayAtMidnight() ? lastTripDate : todayAtMidnight();
  let best = { days: -1, start: firstTripDate, end: firstTripDate };

  for (let windowStart = firstTripDate; windowStart <= lastWindowStart; windowStart = addDays(windowStart, 1)) {
    const windowEnd = addDays(addYears(windowStart, 1), -1);
    let days = 0;
    for (let day = windowStart; day <= windowEnd; day = addDays(day, 1)) {
      if (absentDateKeys.has(dateKey(day))) days += 1;
    }
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
    daysElement.textContent = "0";
    progressElement.value = 0;
    remainingElement.textContent = "距上限还剩 180 天";
    windowElement.textContent = "还没有可计算的旅行记录。";
    return;
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

  if (trips.length === 0) {
    const message = document.createElement("p");
    message.className = "empty-trips";
    message.textContent = "还没有旅行记录。";
    list.append(message);
    pagination.hidden = true;
    return;
  }

  const totalPages = Math.ceil(trips.length / TRIPS_PER_PAGE);
  currentTripsPage = Math.min(currentTripsPage, totalPages);
  const firstTripIndex = (currentTripsPage - 1) * TRIPS_PER_PAGE;
  const visibleTrips = trips.slice(firstTripIndex, firstTripIndex + TRIPS_PER_PAGE);

  visibleTrips.forEach((trip) => {
    const card = document.createElement("article");
    card.className = "trip-card";
    const details = document.createElement("div");
    const titleRow = document.createElement("div");
    titleRow.className = "trip-title-row";
    const title = document.createElement("h3");
    title.className = "trip-title";
    title.textContent = formatTripDestination(trip);
    const status = document.createElement("span");
    const statusText = getTripStatus(trip);
    status.className = `trip-status ${statusText === "已完成" ? "status-completed" : "status-planned"}`;
    status.textContent = statusText;
    const meta = document.createElement("p");
    meta.className = "trip-meta";
    const range = document.createElement("span");
    range.textContent = formatTripRange(trip);
    const countedDays = document.createElement("span");
    countedDays.className = "trip-counted-days";
    countedDays.textContent = `计入 ${getTripAbsenceDays(trip)} 天`;
    meta.append(range, countedDays);
    titleRow.append(title, status);
    details.append(titleRow, meta);
    if (trip.note) {
      const note = document.createElement("p");
      note.className = "trip-note";
      note.textContent = trip.note;
      details.append(note);
    }
    const actions = document.createElement("div");
    actions.className = "trip-actions";
    [
      ["edit", "编辑"],
      ["delete", "删除"],
    ].forEach(([action, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "small-button";
      button.dataset.action = action;
      button.dataset.tripId = trip.id;
      button.textContent = label;
      actions.append(button);
    });
    card.append(details, actions);
    list.append(card);
  });

  pagination.replaceChildren();
  pagination.hidden = totalPages <= 1;
  if (totalPages > 1) {
    const previous = document.createElement("button");
    previous.type = "button";
    previous.className = "pagination-button";
    previous.dataset.pageAction = "previous";
    previous.disabled = currentTripsPage === 1;
    previous.textContent = "上一页";
    const indicator = document.createElement("span");
    indicator.textContent = `第 ${currentTripsPage} / ${totalPages} 页`;
    const next = document.createElement("button");
    next.type = "button";
    next.className = "pagination-button";
    next.dataset.pageAction = "next";
    next.disabled = currentTripsPage === totalPages;
    next.textContent = "下一页";
    pagination.append(previous, indicator, next);
  }
}

function render() {
  const startDateValue = localStorage.getItem(STORAGE_KEY) || DEFAULT_START_DATE;
  const visaCategory = localStorage.getItem(VISA_CATEGORY_STORAGE_KEY) || DEFAULT_VISA_CATEGORY;
  const startDate = parseLocalDate(startDateValue);
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
  document.querySelector("#start-date-input").value = toInputDate(startDate);
  document.querySelector("#visa-category-input").value = visaCategory;
  document.querySelector("#visa-category-label").textContent = "Skilled Worker";
  document.querySelector("#eligibility-progress").value = progressPercent;
  document.querySelector("#progress-percent").textContent = `${progressPercent.toFixed(1)}%`;
  document.querySelector("#progress-detail").textContent = `已过 ${elapsedDays.toLocaleString("zh-CN")} / ${totalDays.toLocaleString("zh-CN")} 天`;

  const number = document.querySelector("#days-remaining");
  const label = document.querySelector("#countdown-label");
  const detail = document.querySelector("#countdown-detail");

  if (daysRemaining > 0) {
    number.textContent = daysRemaining.toLocaleString("zh-CN");
    label.textContent = "天";
    detail.textContent = `预计最早可在 ${formatDate(earliestDate)} 递交申请。`;
  } else {
    number.textContent = "现在";
    label.textContent = "可以准备申请";
    detail.textContent = "请先核对届时的官方规则与个人连续居留记录。";
  }
}

const dialog = document.querySelector("#settings-dialog");
function openSettingsDialog() {
  const startDateValue = localStorage.getItem(STORAGE_KEY) || DEFAULT_START_DATE;
  document.querySelector("#start-date-input").value = startDateValue;
  document.querySelector("#visa-category-input").value = localStorage.getItem(VISA_CATEGORY_STORAGE_KEY) || DEFAULT_VISA_CATEGORY;
  dialog.showModal();
}

document.querySelectorAll(".open-settings").forEach((button) => {
  button.addEventListener("click", openSettingsDialog);
});
document.querySelector("#settings-form").addEventListener("submit", (event) => {
  const action = event.submitter?.value;
  if (action !== "save") return;
  event.preventDefault();
  const value = document.querySelector("#start-date-input").value;
  if (value) localStorage.setItem(STORAGE_KEY, value);
  localStorage.setItem(VISA_CATEGORY_STORAGE_KEY, document.querySelector("#visa-category-input").value);
  dialog.close();
  render();
});

render();
renderTrips();

const tripDialog = document.querySelector("#trip-dialog");
const tripForm = document.querySelector("#trip-form");
let editingTripId = null;
let editingTripCities = [];

function openTripDialog(trip) {
  editingTripId = trip?.id || null;
  const { country, cities } = trip ? getTripDestination(trip) : { country: "", cities: [] };
  editingTripCities = [...cities];
  document.querySelector("#trip-dialog-title").textContent = trip ? "编辑行程" : "新增行程";
  document.querySelector("#trip-country").value = country;
  document.querySelector("#trip-city-input").value = "";
  renderTripCityTags();
  document.querySelector("#trip-start").value = trip?.startDate || "";
  document.querySelector("#trip-end").value = trip?.endDate || "";
  document.querySelector("#trip-note").value = trip?.note || "";
  tripDialog.showModal();
}

function renderTripCityTags() {
  const tags = document.querySelector("#trip-city-tags");
  tags.replaceChildren();
  editingTripCities.forEach((city, index) => {
    const tag = document.createElement("span");
    tag.className = "city-tag";
    const label = document.createElement("span");
    label.textContent = city;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-city-button";
    remove.dataset.cityIndex = index;
    remove.setAttribute("aria-label", `移除${city}`);
    remove.textContent = "×";
    tag.append(label, remove);
    tags.append(tag);
  });
}

function addTripCity() {
  const input = document.querySelector("#trip-city-input");
  const city = input.value.trim();
  if (city && !editingTripCities.includes(city)) editingTripCities.push(city);
  input.value = "";
  renderTripCityTags();
}

document.querySelector("#add-trip").addEventListener("click", () => openTripDialog());
document.querySelector("#add-trip-city").addEventListener("click", addTripCity);
document.querySelector("#trip-city-input").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    addTripCity();
  }
});
document.querySelector("#trip-city-tags").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-city-index]");
  if (!button) return;
  editingTripCities.splice(Number(button.dataset.cityIndex), 1);
  renderTripCityTags();
});
tripForm.addEventListener("submit", (event) => {
  if (event.submitter?.value !== "save") return;
  event.preventDefault();
  const country = document.querySelector("#trip-country").value.trim();
  const startDate = document.querySelector("#trip-start").value;
  const endDate = document.querySelector("#trip-end").value;
  if (!country || !startDate || !endDate || endDate < startDate) return;
  const trip = {
    id: editingTripId || crypto.randomUUID(),
    country,
    cities: [...editingTripCities],
    startDate,
    endDate,
    note: document.querySelector("#trip-note").value.trim(),
  };
  const trips = getTrips();
  const updatedTrips = editingTripId ? trips.map((item) => item.id === editingTripId ? trip : item) : [...trips, trip];
  saveTrips(updatedTrips);
  if (!editingTripId) currentTripsPage = 1;
  tripDialog.close();
  renderTrips();
});

document.querySelector("#trips-list").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-trip-id]");
  if (!button) return;
  const trips = getTrips();
  const trip = trips.find((item) => item.id === button.dataset.tripId);
  if (!trip) return;
  if (button.dataset.action === "edit") openTripDialog(trip);
  if (button.dataset.action === "delete" && confirm(`删除“${trip.destination}”这条行程吗？`)) {
    saveTrips(trips.filter((item) => item.id !== trip.id));
    renderTrips();
  }
});

document.querySelector("#trips-pagination").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-page-action]");
  if (!button) return;
  currentTripsPage += button.dataset.pageAction === "next" ? 1 : -1;
  renderTrips();
});

document.querySelector("#export-trips").addEventListener("click", () => {
  const csvCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const rows = getTrips()
    .sort((a, b) => b.startDate.localeCompare(a.startDate))
    .map((trip) => {
      const { country, cities } = getTripDestination(trip);
      return [country, cities.join("、"), trip.startDate, trip.endDate, trip.note];
    });
  const csv = [
    ["国家", "城市", "出境日期", "回英国日期", "备注"],
    ...rows,
  ].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "ilr-travel-records.csv";
  link.click();
  URL.revokeObjectURL(link.href);
  document.querySelector(".trip-actions-menu").removeAttribute("open");
});

document.querySelector("#clear-trips").addEventListener("click", () => {
  if (!confirm("确定要清空全部旅行记录吗？此操作无法撤销。")) return;
  saveTrips([]);
  currentTripsPage = 1;
  document.querySelector(".trip-actions-menu").removeAttribute("open");
  renderTrips();
});
