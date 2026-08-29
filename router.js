// ============================================================
// ROUTER — lightweight History-API SPA router (no framework, no
// hash URLs). Maps every existing tab id to a clean URL and drives
// the existing renderTab()/NAV_BY_ROLE system from location.pathname
// instead of click-only tab switching.
//
// Design: renderTab(id) in app-tabs.js does the actual DOM
// rendering and never touches the URL. Everything else — sidebar
// clicks, "Back to Classes" buttons, post-login redirect, browser
// Back/Forward, direct URL entry, page refresh — goes through
// switchTab(id) / navigate(path) below, which update the URL via
// the History API and then call renderRoute() to resolve what
// should actually be on screen (auth + role checked every time).
// ============================================================

const TAB_TO_ROUTE = {
  dashboard: "/dashboard", classes: "/classes", masterlist: "/master-list",
  assignments: "/assignments", staffDirectory: "/staff", students: "/students",
  timetable: "/timetable", certificates: "/certificates", analytics: "/analytics",
  catracker: "/ca-tracker", fees: "/fees", websites: "/websites", importTool: "/import",
  classManagement: "/manage-classes", salaryTracker: "/salary",
  transferStudents: "/transfer-students", scoreControl: "/score-control",
  printReports: "/print-reports", unassignedStudents: "/unassigned-students",
  settings: "/settings", myReport: "/my-report", registerStudent: "/register-student",
};
const ROUTE_TO_TAB = Object.fromEntries(Object.entries(TAB_TO_ROUTE).map(([k, v]) => [v, k]));

function isLoggedIn() { return !!state.session; }

function isRouteAuthorized(tabId) {
  const roles = state.allRoles || [state.role];
  return roles.some(r => (NAV_BY_ROLE[r] || []).some(item => item[0] === tabId));
}

function defaultRouteForCurrentUser() {
  const roles = state.allRoles || [state.role];
  for (const r of roles) {
    const first = (NAV_BY_ROLE[r] || [])[0];
    if (first) return TAB_TO_ROUTE[first[0]] || "/dashboard";
  }
  return "/dashboard";
}

// Public entry point — every existing onclick="switchTab('id')" call
// (sidebar, "Back to Classes" buttons, post-login redirect) now goes
// through here instead of rendering directly.
function switchTab(id) {
  navigate(TAB_TO_ROUTE[id] || ("/" + id));
}

function navigate(path, { push = true } = {}) {
  if (location.pathname !== path) {
    if (push) history.pushState({ path }, "", path);
    else history.replaceState({ path }, "", path);
  }
  renderRoute();
}

// Intercepts a plain <a href="/x"> click so it routes through the
// SPA instead of doing a full page load (kept for any future links
// built with a real href + this handler, e.g. cross-references).
function handleNavClick(e, path) {
  if (e) e.preventDefault();
  navigate(path);
  return false;
}

window.addEventListener("popstate", renderRoute);

function showNotFound() {
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("appShell").style.display = "none";
  document.getElementById("notFoundScreen").style.display = "flex";
}
function hideNotFound() {
  document.getElementById("notFoundScreen").style.display = "none";
}
function goHomeFromNotFound() {
  navigate(isLoggedIn() ? defaultRouteForCurrentUser() : "/login");
}

// The single source of truth for "what should be on screen right
// now", driven entirely by location.pathname. Called on: initial
// load (once auth state is known), every popstate, and every call
// to navigate(). Idempotent and safe to call repeatedly.
function renderRoute() {
  const path = location.pathname;

  if (!isLoggedIn()) {
    // Logged out: "/" and "/login" both show the login screen.
    // Any other KNOWN route (a protected page typed/refreshed while
    // logged out) redirects to /login rather than flashing protected
    // UI or leaving a blank screen. An unrecognised path gets a
    // real 404, not a silent redirect.
    hideNotFound();
    if (path === "/" || path === "/login") {
      showAppShell(false);
    } else if (ROUTE_TO_TAB[path]) {
      navigate("/login", { push: false });
    } else {
      showNotFound();
    }
    return;
  }

  // Logged in.
  if (path === "/" || path === "/login") {
    navigate(defaultRouteForCurrentUser(), { push: false });
    return;
  }
  const tabId = ROUTE_TO_TAB[path];
  if (!tabId) { showNotFound(); return; }
  if (!isRouteAuthorized(tabId)) {
    // Not a security boundary — Supabase RLS is what actually
    // protects the data (see privacy note in app.js). This just
    // avoids rendering a sidebar-less orphan panel for a tab this
    // person's role doesn't have.
    navigate(defaultRouteForCurrentUser(), { push: false });
    return;
  }
  hideNotFound();
  showAppShell(true);
  renderTab(tabId);
}

// Called once bootAfterLogin() has state.session/role/allRoles ready
// — covers both a fresh login and a page refresh with a live
// session — and resolves whatever URL the browser is actually on
// (a deep link survives a refresh; "/" or "/login" lands on the
// role's default tab).
function handlePostAuthRouting() {
  renderRoute();
}
