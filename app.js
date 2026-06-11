"use strict";

/* ════════════════════════════════════════════════
   Student Grade Tracker — app.js
   Pure vanilla JavaScript SPA with auth & CRUD
   ════════════════════════════════════════════════ */

// ─── Constants ───────────────────────────────
const USERS_KEY = "sgt_users_v1";
const SESSION_KEY = "sgt_session_v1";
const COURSES_KEY = "sgt_courses_v1";
const TOAST_DURATION = 5000;

const GRADE_SCALE = [
  { min: 70, label: "Excellent", badge: "A", cls: "excellent" },
  { min: 60, label: "Good",      badge: "B", cls: "good"      },
  { min: 50, label: "Fair",      badge: "C", cls: "fair"      },
  { min: 45, label: "Pass",      badge: "D", cls: "fair"      },
  { min: 0,  label: "Fail",      badge: "F", cls: "poor"      },
];

// ─── State ───────────────────────────────────
let currentUser = null;
let courses = [];
let editingId = null;
let pendingDeleteId = null;
let sidebarOpen = false;

// ─── DOM refs (gathered after DOMContentLoaded) ───
const $ = (id) => document.getElementById(id);

// ─── Persistence ─────────────────────────────
function loadUsers() {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (raw) { const d = JSON.parse(raw); if (Array.isArray(d)) return d; }
  } catch (_) {}
  return [];
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return null;
}

function saveSession(user) {
  if (user) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ id: user.id, email: user.email, name: user.name }));
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
}

function loadCourses() {
  try {
    const raw = localStorage.getItem(COURSES_KEY);
    if (raw) { const d = JSON.parse(raw); if (Array.isArray(d)) return d; }
  } catch (_) {}
  return [];
}

function saveCourses() {
  localStorage.setItem(COURSES_KEY, JSON.stringify(courses));
}

// ─── Helpers ─────────────────────────────────
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function getGrade(score) {
  return GRADE_SCALE.find((g) => score >= g.min) || GRADE_SCALE[GRADE_SCALE.length - 1];
}

function formatScore(score) {
  const n = parseFloat(score);
  return Number.isInteger(n) ? n.toString() : n.toFixed(1);
}

function calcStats() {
  if (courses.length === 0) return null;
  const scores = courses.map((c) => c.score);
  return {
    average: scores.reduce((a, b) => a + b, 0) / scores.length,
    highest: Math.max(...scores),
    lowest:  Math.min(...scores),
    total:   courses.length,
  };
}

function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function getInitials(name) {
  if (!name) return "?";
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

// ─── Toast ───────────────────────────────────
const TOAST_ICONS = {
  success: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  error:   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  info:    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  warning: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
};

const TOAST_LABELS = { success: "Success", error: "Error", warning: "Warning", info: "Info" };

function showToast(message, type = "info") {
  const container = $("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;
  toast.setAttribute("role", "alert");
  toast.innerHTML = `
    <div class="toast__body">
      <span class="toast__icon">${TOAST_ICONS[type] || TOAST_ICONS.info}</span>
      <div class="toast__content">
        <span class="toast__label">${TOAST_LABELS[type] || "Info"}</span>
        <span class="toast__msg">${escapeHtml(message)}</span>
      </div>
      <button class="toast__close" aria-label="Dismiss">&times;</button>
    </div>
    <span class="toast__progress"></span>
  `;
  toast.style.setProperty("--toast-duration", `${TOAST_DURATION}ms`);
  container.appendChild(toast);

  const closeBtn = toast.querySelector(".toast__close");
  closeBtn.addEventListener("click", () => dismissToast(toast));

  toast._timer = setTimeout(() => dismissToast(toast), TOAST_DURATION);
}

function dismissToast(toast) {
  if (toast._dismissed) return;
  toast._dismissed = true;
  clearTimeout(toast._timer);
  toast.classList.add("toast-out");
  toast.addEventListener("transitionend", () => toast.remove(), { once: true });
}

// ─── Modals ──────────────────────────────────
function openModal(modal) {
  if (!modal) return;
  modal.hidden = false;
  modal.focus();
  document.body.classList.add("modal-open");
}

function closeModal(modal) {
  if (!modal) return;
  modal.hidden = true;
  document.body.classList.remove("modal-open");
}

// ════════════════════════════════════════════
// AUTH SYSTEM
// ════════════════════════════════════════════

function registerUser(name, email, password) {
  const users = loadUsers();
  if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
    return { ok: false, error: "An account with this email already exists." };
  }
  const user = {
    id: uid(),
    name: name.trim(),
    email: email.toLowerCase().trim(),
    password: password,
    institution: "",
    faculty: "",
    department: "",
    level: "",
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  saveUsers(users);
  return { ok: true, user };
}

function loginUser(email, password) {
  const users = loadUsers();
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) return { ok: false, error: "No account found with this email." };
  if (user.password !== password) return { ok: false, error: "Incorrect password." };
  return { ok: true, user };
}

function updateUser(userId, updates) {
  const users = loadUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) return null;
  users[idx] = { ...users[idx], ...updates };
  saveUsers(users);
  currentUser = users[idx];
  saveSession(currentUser);
  return users[idx];
}

function changeUserPassword(userId, currentPassword, newPassword) {
  const users = loadUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return { ok: false, error: "User not found." };
  if (user.password !== currentPassword) return { ok: false, error: "Current password is incorrect." };
  user.password = newPassword;
  saveUsers(users);
  return { ok: true };
}

function deleteUser(userId) {
  let users = loadUsers();
  users = users.filter(u => u.id !== userId);
  saveUsers(users);
  courses = courses.filter(c => c.userId !== userId);
  saveCourses();
}

// ════════════════════════════════════════════
// ROUTING
// ════════════════════════════════════════════

function navigate(page) {
  const publicShell = $("public-shell");
  const appShell = $("app-shell");
  const publicPages = publicShell ? publicShell.querySelectorAll(".page--landing, .page--auth, .page--auth-single") : [];
  const protectedPages = document.querySelectorAll("#app-shell .page--protected");
  const allPages = document.querySelectorAll(".page");

  // Hide all pages
  allPages.forEach(p => p.hidden = true);

  if (currentUser) {
    // Show app shell
    if (publicShell) publicShell.hidden = true;
    if (appShell) appShell.hidden = false;

    // Show requested protected page
    const target = $(`page-${page}`);
    if (target) {
      target.hidden = false;
    } else {
      const dash = $("page-dashboard");
      if (dash) dash.hidden = false;
      page = "dashboard";
    }

    // Update sidebar active state
    document.querySelectorAll(".sidebar-link").forEach(link => {
      link.classList.toggle("sidebar-link--active", link.dataset.page === page);
    });

    // Update topbar title
    const titleMap = { dashboard: "Dashboard", courses: "Courses", profile: "Profile", settings: "Settings" };
    const titleEl = $("page-title");
    if (titleEl) titleEl.textContent = titleMap[page] || "Dashboard";

    // Render page-specific content
    if (page === "dashboard") renderDashboard();
    if (page === "courses") renderCourses();
    if (page === "profile") renderProfile();
    if (page === "settings") { /* nothing special */ }
  } else {
    // Show public shell
    if (publicShell) publicShell.hidden = false;
    if (appShell) appShell.hidden = true;

    // Show requested public page
    const target = $(`page-${page}`);
    if (target) {
      target.hidden = false;
    } else {
      const landing = $("page-landing");
      if (landing) landing.hidden = false;
    }
  }

  // Close mobile sidebar
  const sidebar = $("sidebar");
  const sidebarBackdrop = $("sidebar-backdrop");
  if (sidebar) { sidebar.classList.remove("sidebar--open"); sidebarOpen = false; }
  if (sidebarBackdrop) sidebarBackdrop.hidden = true;

  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ════════════════════════════════════════════
// SESSION MANAGEMENT
// ════════════════════════════════════════════

function startSession(user) {
  currentUser = user;
  saveSession(user);
  updateUI();
  navigate("dashboard");
  showToast(`Welcome back, ${user.name}!`, "success");
}

function endSession() {
  currentUser = null;
  saveSession(null);
  editingId = null;
  pendingDeleteId = null;
  courses = [];
  updateUI();
  navigate("landing");
  showToast("You have been logged out.", "info");
}

function restoreSession() {
  const session = loadSession();
  if (!session) {
    navigate("landing");
    return;
  }
  const users = loadUsers();
  const user = users.find(u => u.id === session.id);
  if (!user) {
    saveSession(null);
    navigate("landing");
    return;
  }
  currentUser = user;
  courses = loadCourses().filter(c => c.userId === user.id);
  updateUI();
  navigate("dashboard");
}

// ════════════════════════════════════════════
// UI UPDATES
// ════════════════════════════════════════════

function updateUI() {
  if (!currentUser) return;
  const nameEl = $("topbar-user-name");
  const initialsEl = $("topbar-avatar-initials");
  const profileInitialsEl = $("profile-avatar-initials");
  const profileNameEl = $("profile-name-display");
  const profileEmailEl = $("profile-email-display");
  if (nameEl) nameEl.textContent = currentUser.name;
  const initials = getInitials(currentUser.name);
  if (initialsEl) initialsEl.textContent = initials;
  if (profileInitialsEl) profileInitialsEl.textContent = initials;
  if (profileNameEl) profileNameEl.textContent = currentUser.name;
  if (profileEmailEl) profileEmailEl.textContent = currentUser.email;
}

// ════════════════════════════════════════════
// COURSE MANAGEMENT
// ════════════════════════════════════════════

function getFilteredSorted(query, sortValue, list) {
  const q = (query || "").trim().toLowerCase();
  let filtered = list.filter(c => !q || c.courseName.toLowerCase().includes(q));
  return [...filtered].sort((a, b) => {
    switch (sortValue || "date-desc") {
      case "score-desc": return b.score - a.score;
      case "score-asc":  return a.score - b.score;
      case "name-asc":   return a.courseName.localeCompare(b.courseName);
      case "name-desc":  return b.courseName.localeCompare(a.courseName);
      case "date-asc":   return new Date(a.createdAt) - new Date(b.createdAt);
      case "date-desc":
      default:           return new Date(b.createdAt) - new Date(a.createdAt);
    }
  });
}

function renderCourseRow(course, index) {
  const grade = getGrade(course.score);
  const tr = document.createElement("tr");
  tr.className = "course-row";
  if (editingId === course.id) tr.classList.add("is-editing");
  tr.dataset.id = course.id;
  tr.innerHTML = `
    <td>${index + 1}</td>
    <td class="td-name"><span title="${escapeHtml(course.courseName)}">${escapeHtml(course.courseName)}</span></td>
    <td class="td-score">${formatScore(course.score)}%</td>
    <td><span class="grade-badge grade-badge--${grade.cls}" title="${grade.label}">${grade.badge} &middot; ${grade.label}</span></td>
    <td class="td-actions">
      <div class="row-actions">
        <button class="icon-btn icon-btn--edit" data-action="edit" data-id="${course.id}" aria-label="Edit ${escapeHtml(course.courseName)}" title="Edit">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="icon-btn icon-btn--delete" data-action="delete" data-id="${course.id}" aria-label="Delete ${escapeHtml(course.courseName)}" title="Delete">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>
      </div>
    </td>`;
  return tr;
}

function renderStats(stats, avgEl, badgeEl, cardEl, totalEl, highestEl, lowestEl) {
  if (!stats) {
    if (avgEl) avgEl.textContent = "\u2014";
    if (badgeEl) badgeEl.hidden = true;
    if (cardEl) cardEl.className = "stat-card stat-card--average";
    if (totalEl) totalEl.textContent = "0";
    if (highestEl) highestEl.textContent = "\u2014";
    if (lowestEl) lowestEl.textContent = "\u2014";
    return;
  }
  if (avgEl) {
    const newText = formatScore(stats.average) + "%";
    if (avgEl.textContent !== newText) {
      avgEl.textContent = newText;
      avgEl.classList.remove("animate-pop");
      void avgEl.offsetWidth;
      avgEl.classList.add("animate-pop");
      setTimeout(() => avgEl.classList.remove("animate-pop"), 300);
    }
  }
  const grade = getGrade(stats.average);
  if (badgeEl) { badgeEl.textContent = grade.label; badgeEl.hidden = false; }
  const stateMap = { excellent: "state-excellent", good: "state-good", fair: "state-fair", poor: "state-poor" };
  if (cardEl) cardEl.className = `stat-card stat-card--average ${stateMap[grade.cls] || ""}`;
  if (totalEl) totalEl.textContent = stats.total;
  if (highestEl) highestEl.textContent = formatScore(stats.highest) + "%";
  if (lowestEl) lowestEl.textContent = formatScore(stats.lowest) + "%";
}

// ─── Dashboard ───────────────────────────────
function renderDashboard() {
  const stats = calcStats();
  renderStats(
    stats,
    $("average-value"), $("average-badge"), $("average-card"),
    $("total-courses"), $("highest-score"), $("lowest-score")
  );

  // Recent courses
  const recentList = $("dashboard-recent-items");
  const recentEmpty = $("dashboard-recent-empty");
  if (!recentList || !recentEmpty) return;

  const recent = [...courses].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
  if (recent.length === 0) {
    recentEmpty.hidden = false;
    recentList.hidden = true;
  } else {
    recentEmpty.hidden = true;
    recentList.hidden = false;
    recentList.innerHTML = recent.map(c => {
      const g = getGrade(c.score);
      return `<div class="dashboard-recent-item">
        <span class="dashboard-recent-name">${escapeHtml(c.courseName)}</span>
        <span class="dashboard-recent-score" style="color: ${g.cls === 'excellent' ? 'var(--success-600)' : g.cls === 'good' ? 'var(--primary-600)' : g.cls === 'fair' ? 'var(--warning-600)' : 'var(--danger-600)'}">${formatScore(c.score)}%</span>
      </div>`;
    }).join("");
  }
}

// ─── Courses Page ────────────────────────────
function enterCourseEditMode(id) {
  const course = courses.find(c => c.id === id);
  if (!course) return;
  editingId = id;
  const nameInput = $("course-name-input");
  const scoreInput = $("course-score-input");
  if (nameInput) nameInput.value = course.courseName;
  if (scoreInput) scoreInput.value = course.score;
  const label = $("course-submit-btn-label");
  const modeLabel = $("course-form-mode-label");
  const modeIcon = $("course-form-mode-icon");
  const cancelBtn = $("course-cancel-edit-btn");
  if (label) label.textContent = "Update course";
  if (modeLabel) modeLabel.textContent = "Edit Course";
  if (modeIcon) modeIcon.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
  if (cancelBtn) cancelBtn.hidden = false;
  const form = $("course-form");
  if (form) form.closest(".form-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
  if (nameInput) nameInput.focus();
  renderCourses();
}

function exitCourseEditMode() {
  editingId = null;
  const form = $("course-form");
  if (form) form.reset();
  ["course-name-input", "course-score-input"].forEach(id => {
    const el = $(id);
    if (el) el.classList.remove("is-invalid");
  });
  ["course-name-error", "course-score-error"].forEach(id => {
    const el = $(id);
    if (el) { el.hidden = true; el.textContent = ""; }
  });
  const label = $("course-submit-btn-label");
  const modeLabel = $("course-form-mode-label");
  const modeIcon = $("course-form-mode-icon");
  const cancelBtn = $("course-cancel-edit-btn");
  if (label) label.textContent = "Add course";
  if (modeLabel) modeLabel.textContent = "Add a Course";
  if (modeIcon) modeIcon.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`;
  if (cancelBtn) cancelBtn.hidden = true;
  renderCourses();
}

function validateCourseForm(nameInput, scoreInput, nameError, scoreError) {
  let valid = true;
  const name = nameInput.value.trim();
  if (!name) {
    nameInput.classList.add("is-invalid");
    if (nameError) { nameError.textContent = "Course name is required."; nameError.hidden = false; }
    valid = false;
  } else {
    nameInput.classList.remove("is-invalid");
    if (nameError) { nameError.hidden = true; }
  }
  const rawScore = scoreInput.value;
  const score = parseFloat(rawScore);
  if (rawScore === "" || rawScore === null || isNaN(score)) {
    scoreInput.classList.add("is-invalid");
    if (scoreError) { scoreError.textContent = "Please enter a valid number."; scoreError.hidden = false; }
    valid = false;
  } else if (score < 0 || score > 100) {
    scoreInput.classList.add("is-invalid");
    if (scoreError) { scoreError.textContent = "Score must be between 0 and 100."; scoreError.hidden = false; }
    valid = false;
  } else {
    scoreInput.classList.remove("is-invalid");
    if (scoreError) { scoreError.hidden = true; }
  }
  return valid;
}

function handleCourseFormSubmit(e) {
  e.preventDefault();
  const nameInput = $("course-name-input");
  const scoreInput = $("course-score-input");
  const nameError = $("course-name-error");
  const scoreError = $("course-score-error");
  if (!nameInput || !scoreInput) return;
  if (!validateCourseForm(nameInput, scoreInput, nameError, scoreError)) return;

  const name = nameInput.value.trim();
  const score = parseFloat(scoreInput.value);
  const now = new Date().toISOString();

  if (editingId) {
    const idx = courses.findIndex(c => c.id === editingId);
    if (idx !== -1) {
      courses[idx] = { ...courses[idx], courseName: name, score, updatedAt: now };
    }
    showToast(`"${name}" updated.`, "success");
    exitCourseEditMode();
  } else {
    courses.unshift({ id: uid(), userId: currentUser.id, courseName: name, score, createdAt: now, updatedAt: now });
    nameInput.value = "";
    scoreInput.value = "";
    nameInput.focus();
    showToast(`"${name}" added.`, "success");
  }
  saveCourses();
  renderCourses();
  renderDashboard();
}

function handleDashboardQuickAdd(e) {
  e.preventDefault();
  const nameInput = $("dash-course-name");
  const scoreInput = $("dash-course-score");
  if (!nameInput || !scoreInput) return;
  const name = nameInput.value.trim();
  const score = parseFloat(scoreInput.value);
  if (!name || isNaN(score) || score < 0 || score > 100) {
    showToast("Please enter a valid course name and score (0-100).", "error");
    return;
  }
  const now = new Date().toISOString();
  courses.unshift({ id: uid(), userId: currentUser.id, courseName: name, score, createdAt: now, updatedAt: now });
  nameInput.value = "";
  scoreInput.value = "";
  saveCourses();
  renderDashboard();
  showToast(`"${name}" added.`, "success");
}

function renderCourses() {
  const searchInput = $("courses-search-input");
  const sortSelect = $("courses-sort-select");
  const query = searchInput ? searchInput.value : "";
  const sort = sortSelect ? sortSelect.value : "date-desc";
  const filtered = getFilteredSorted(query, sort, courses);
  const hasData = courses.length > 0;
  const hasResults = filtered.length > 0;

  // Toggle controls
  const searchWrapper = $("courses-search-wrapper");
  const sortWrapper = $("courses-sort-wrapper");
  const exportBtn = $("courses-export-btn");
  if (searchWrapper) searchWrapper.hidden = !hasData;
  if (sortWrapper) sortWrapper.hidden = !hasData;
  if (exportBtn) exportBtn.hidden = !hasData;

  const listWrapper = $("courses-list-wrapper");
  const emptyState = $("courses-empty-state");
  const noResults = $("courses-no-results");

  if (!hasData) {
    if (listWrapper) listWrapper.hidden = true;
    if (emptyState) emptyState.hidden = false;
    if (noResults) noResults.hidden = true;
    // Also render stats (empty)
    renderStats(null, $("average-value"), $("average-badge"), $("average-card"),
      $("total-courses"), $("highest-score"), $("lowest-score"));
    return;
  }

  if (!hasResults && query) {
    if (listWrapper) listWrapper.hidden = true;
    if (emptyState) emptyState.hidden = true;
    if (noResults) noResults.hidden = false;
    return;
  }

  if (listWrapper) listWrapper.hidden = false;
  if (emptyState) emptyState.hidden = true;
  if (noResults) noResults.hidden = true;

  const tbody = $("course-tbody");
  if (tbody) {
    tbody.innerHTML = "";
    filtered.forEach((c, i) => tbody.appendChild(renderCourseRow(c, i)));
  }
}

function requestDelete(id) {
  pendingDeleteId = id;
  openModal($("delete-modal"));
}

function confirmDelete() {
  if (!pendingDeleteId) return;
  const course = courses.find(c => c.id === pendingDeleteId);
  courses = courses.filter(c => c.id !== pendingDeleteId);
  if (editingId === pendingDeleteId) exitCourseEditMode();
  pendingDeleteId = null;
  saveCourses();
  renderCourses();
  renderDashboard();
  closeModal($("delete-modal"));
  showToast(course ? `"${course.courseName}" deleted.` : "Course deleted.", "info");
}

function exportCSV() {
  if (courses.length === 0) return;
  const stats = calcStats();
  const headers = ["#", "Course Name", "Score (%)", "Grade", "Letter", "Added"];
  const rows = [...courses].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).map((c, i) => {
    const grade = getGrade(c.score);
    return [i + 1, `"${c.courseName.replace(/"/g, '""')}"`, c.score, grade.label, grade.badge, new Date(c.createdAt).toLocaleDateString("en-NG")].join(",");
  });
  rows.push("");
  rows.push(`"Total Courses",${stats.total}`);
  rows.push(`"Average Score",${stats.average.toFixed(1)}%`);
  rows.push(`"Highest Score",${stats.highest}%`);
  rows.push(`"Lowest Score",${stats.lowest}%`);
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `grade_tracker_${new Date().toISOString().slice(0, 10)}.csv`;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showToast("CSV exported.", "success");
}

// ─── Profile ─────────────────────────────────
function renderProfile() {
  if (!currentUser) return;
  const nameInput = $("profile-name");
  const emailInput = $("profile-email");
  const instInput = $("profile-institution");
  const facInput = $("profile-faculty");
  const deptInput = $("profile-department");
  const levelSelect = $("profile-level");
  if (nameInput) nameInput.value = currentUser.name;
  if (emailInput) emailInput.value = currentUser.email;
  if (instInput) instInput.value = currentUser.institution || "";
  if (facInput) facInput.value = currentUser.faculty || "";
  if (deptInput) deptInput.value = currentUser.department || "";
  if (levelSelect) levelSelect.value = currentUser.level || "";
}

function handleProfileSubmit(e) {
  e.preventDefault();
  if (!currentUser) return;
  const nameInput = $("profile-name");
  const emailInput = $("profile-email");
  const instInput = $("profile-institution");
  const facInput = $("profile-faculty");
  const deptInput = $("profile-department");
  const levelSelect = $("profile-level");
  if (!nameInput || !emailInput) return;
  const name = nameInput.value.trim();
  const email = emailInput.value.trim();
  if (!name || !email) { showToast("Name and email are required.", "error"); return; }
  const updated = updateUser(currentUser.id, {
    name,
    email,
    institution: instInput ? instInput.value : "",
    faculty: facInput ? facInput.value : "",
    department: deptInput ? deptInput.value : "",
    level: levelSelect ? levelSelect.value : "",
  });
  if (updated) {
    updateUI();
    showToast("Profile updated successfully.", "success");
  }
}

// ─── Settings ────────────────────────────────
function handlePasswordChange(e) {
  e.preventDefault();
  if (!currentUser) return;
  const currentPw = $("settings-current-password");
  const newPw = $("settings-new-password");
  const confirmPw = $("settings-confirm-password");
  const errorEl = $("settings-password-error");
  if (!currentPw || !newPw || !confirmPw) return;
  if (newPw.value.length < 6) {
    if (errorEl) { errorEl.textContent = "New password must be at least 6 characters."; errorEl.hidden = false; }
    return;
  }
  if (newPw.value !== confirmPw.value) {
    if (errorEl) { errorEl.textContent = "Passwords do not match."; errorEl.hidden = false; }
    return;
  }
  const result = changeUserPassword(currentUser.id, currentPw.value, newPw.value);
  if (!result.ok) {
    if (errorEl) { errorEl.textContent = result.error; errorEl.hidden = false; }
    return;
  }
  if (errorEl) errorEl.hidden = true;
  currentPw.value = ""; newPw.value = ""; confirmPw.value = "";
  showToast("Password updated successfully.", "success");
}

function requestDeleteAccount() {
  openModal($("delete-account-modal"));
}

function confirmDeleteAccount() {
  if (!currentUser) return;
  deleteUser(currentUser.id);
  endSession();
  closeModal($("delete-account-modal"));
  showToast("Account deleted permanently.", "info");
}

// ════════════════════════════════════════════
// EVENT WIRING
// ════════════════════════════════════════════

function wireEvents() {
  // ── Public navigation ──
  document.addEventListener("click", (e) => {
    const link = e.target.closest("[data-page]");
    if (link) {
      e.preventDefault();
      const page = link.dataset.page;
      if (page === "about" || page === "privacy" || page === "contact") {
        showToast("This page is coming soon.", "info");
        return;
      }
      navigate(page);
    }
  });

  // ── Login ──
  const loginForm = $("login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const email = $("login-email");
      const password = $("login-password");
      const emailError = $("login-email-error");
      const passwordError = $("login-password-error");
      if (!email || !password) return;
      let valid = true;
      if (!email.value.trim()) {
        if (emailError) { emailError.textContent = "Email is required."; emailError.hidden = false; email.classList.add("is-invalid"); }
        valid = false;
      } else {
        if (emailError) emailError.hidden = true; email.classList.remove("is-invalid");
      }
      if (!password.value) {
        if (passwordError) { passwordError.textContent = "Password is required."; passwordError.hidden = false; password.classList.add("is-invalid"); }
        valid = false;
      } else {
        if (passwordError) passwordError.hidden = true; password.classList.remove("is-invalid");
      }
      if (!valid) return;
      const result = loginUser(email.value, password.value);
      if (!result.ok) {
        showToast(result.error, "error");
        return;
      }
      const remember = $("remember-me");
      // If remember me is checked, session persists; otherwise we keep it anyway (localStorage)
      startSession(result.user);
    });
  }

  // ── Register ──
  const registerForm = $("register-form");
  if (registerForm) {
    registerForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = $("reg-name");
      const email = $("reg-email");
      const password = $("reg-password");
      const confirm = $("reg-confirm");
      const nameError = $("reg-name-error");
      const emailError = $("reg-email-error");
      const passwordError = $("reg-password-error");
      const confirmError = $("reg-confirm-error");
      if (!name || !email || !password || !confirm) return;
      let valid = true;
      if (!name.value.trim()) {
        if (nameError) { nameError.textContent = "Name is required."; nameError.hidden = false; name.classList.add("is-invalid"); }
        valid = false;
      } else { if (nameError) nameError.hidden = true; name.classList.remove("is-invalid"); }
      if (!email.value.trim()) {
        if (emailError) { emailError.textContent = "Email is required."; emailError.hidden = false; email.classList.add("is-invalid"); }
        valid = false;
      } else if (!/\S+@\S+\.\S+/.test(email.value)) {
        if (emailError) { emailError.textContent = "Invalid email format."; emailError.hidden = false; email.classList.add("is-invalid"); }
        valid = false;
      } else { if (emailError) emailError.hidden = true; email.classList.remove("is-invalid"); }
      if (password.value.length < 6) {
        if (passwordError) { passwordError.textContent = "Min. 6 characters."; passwordError.hidden = false; password.classList.add("is-invalid"); }
        valid = false;
      } else { if (passwordError) passwordError.hidden = true; password.classList.remove("is-invalid"); }
      if (password.value !== confirm.value) {
        if (confirmError) { confirmError.textContent = "Passwords do not match."; confirmError.hidden = false; confirm.classList.add("is-invalid"); }
        valid = false;
      } else { if (confirmError) confirmError.hidden = true; confirm.classList.remove("is-invalid"); }
      if (!valid) return;
      const result = registerUser(name.value, email.value, password.value);
      if (!result.ok) { showToast(result.error, "error"); return; }
      showToast("Account created successfully! You can now sign in.", "success");
      navigate("login");
    });
  }

  // ── Forgot Password ──
  const forgotForm = $("forgot-form");
  if (forgotForm) {
    forgotForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const email = $("forgot-email");
      const emailError = $("forgot-email-error");
      if (!email) return;
      if (!email.value.trim()) {
        if (emailError) { emailError.textContent = "Email is required."; emailError.hidden = false; email.classList.add("is-invalid"); }
        return;
      }
      if (emailError) emailError.hidden = true; email.classList.remove("is-invalid");
      const users = loadUsers();
      const user = users.find(u => u.email.toLowerCase() === email.value.toLowerCase());
      if (!user) {
        showToast("If an account exists with this email, a reset link has been sent.", "success");
        return;
      }
      // In a real app, we'd send an email. For MVP, just show success.
      showToast("Password reset link sent to your email.", "success");
      navigate("login");
    });
  }

  // ── Logout ──
  const logoutBtns = [$("sidebar-logout-btn")];
  logoutBtns.forEach(btn => {
    if (btn) btn.addEventListener("click", endSession);
  });

  // ── Course form (courses page) ──
  const courseForm = $("course-form");
  if (courseForm) courseForm.addEventListener("submit", handleCourseFormSubmit);

  const cancelEditBtn = $("course-cancel-edit-btn");
  if (cancelEditBtn) cancelEditBtn.addEventListener("click", exitCourseEditMode);

  // ── Course table actions (delegation) ──
  const courseTbody = $("course-tbody");
  if (courseTbody) {
    courseTbody.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const { action, id } = btn.dataset;
      if (action === "edit") enterCourseEditMode(id);
      if (action === "delete") requestDelete(id);
    });
  }

  // ── Course search / sort ──
  const courseSearch = $("courses-search-input");
  if (courseSearch) courseSearch.addEventListener("input", renderCourses);
  const courseSort = $("courses-sort-select");
  if (courseSort) courseSort.addEventListener("change", renderCourses);

  // ── Export CSV ──
  const exportBtn = $("courses-export-btn");
  if (exportBtn) exportBtn.addEventListener("click", exportCSV);

  // ── Dashboard quick add ──
  const dashForm = $("dashboard-quick-form");
  if (dashForm) dashForm.addEventListener("submit", handleDashboardQuickAdd);

  // ── Modals: Delete course ──
  document.querySelectorAll(".modal-cancel-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      closeModal($("delete-modal"));
      closeModal($("delete-account-modal"));
    });
  });
  const confirmDeleteBtn = document.querySelector(".modal-confirm-delete-btn");
  if (confirmDeleteBtn) confirmDeleteBtn.addEventListener("click", confirmDelete);
  const confirmDeleteAccountBtn = document.querySelector(".modal-confirm-delete-account-btn");
  if (confirmDeleteAccountBtn) confirmDeleteAccountBtn.addEventListener("click", confirmDeleteAccount);

  // Close modals on backdrop click
  ["delete-modal", "delete-account-modal"].forEach(id => {
    const modal = $(id);
    if (modal) {
      modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(modal); });
    }
  });

  // Close modals on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
  ["delete-modal", "delete-account-modal"].forEach(id => {
        const m = $(id); if (m && !m.hidden) closeModal(m);
      });
    }
  });

  // ── Profile ──
  const profileForm = $("profile-form");
  if (profileForm) profileForm.addEventListener("submit", handleProfileSubmit);

  // ── Settings: Password ──
  const passwordForm = $("settings-password-form");
  if (passwordForm) passwordForm.addEventListener("submit", handlePasswordChange);

  // ── Settings: Delete account ──
  const deleteAccountBtn = $("settings-delete-account-btn");
  if (deleteAccountBtn) deleteAccountBtn.addEventListener("click", requestDeleteAccount);

  // ── Sidebar toggle ──
  const sidebarToggle = $("sidebar-toggle");
  const sidebar = $("sidebar");
  const sidebarBackdrop = $("sidebar-backdrop");
  if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener("click", () => {
      sidebarOpen = !sidebarOpen;
      sidebar.classList.toggle("sidebar--open", sidebarOpen);
      if (sidebarBackdrop) sidebarBackdrop.hidden = !sidebarOpen;
    });
  }
  // Close sidebar on backdrop click
  if (sidebarBackdrop) {
    sidebarBackdrop.addEventListener("click", () => {
      sidebarOpen = false;
      sidebar.classList.remove("sidebar--open");
      sidebarBackdrop.hidden = true;
    });
  }

  // Inline validation for course form
  const courseNameInput = $("course-name-input");
  const courseNameError = $("course-name-error");
  const courseScoreInput = $("course-score-input");
  const courseScoreError = $("course-score-error");

  if (courseNameInput && courseNameError) {
    courseNameInput.addEventListener("blur", () => {
      if (!courseNameInput.value.trim() && courseNameInput.value !== "") {
        courseNameInput.classList.add("is-invalid");
        courseNameError.textContent = "Course name is required.";
        courseNameError.hidden = false;
      }
    });
    courseNameInput.addEventListener("input", () => {
      if (courseNameInput.value.trim()) { courseNameInput.classList.remove("is-invalid"); courseNameError.hidden = true; }
    });
  }
  if (courseScoreInput && courseScoreError) {
    courseScoreInput.addEventListener("input", () => {
      const val = parseFloat(courseScoreInput.value);
      if (courseScoreInput.value !== "" && !isNaN(val) && val >= 0 && val <= 100) {
        courseScoreInput.classList.remove("is-invalid"); courseScoreError.hidden = true;
      }
    });
  }

  // Clear field errors on auth inputs
  document.querySelectorAll(".auth-form .form-input").forEach(input => {
    input.addEventListener("input", () => {
      input.classList.remove("is-invalid");
      const errorEl = input.parentElement.parentElement.querySelector(".form-error");
      if (errorEl) errorEl.hidden = true;
    });
  });
}

// ════════════════════════════════════════════
// BOOT
// ════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", () => {
  restoreSession();
  wireEvents();
});
