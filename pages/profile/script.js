/* Cheese — Profile page
   Public by default: ?u=<username> is one fetchPublicProfile() call away for
   anyone. Ownership (and therefore edit controls) is decided purely by
   comparing the fetched profile's username against Clerk's own CONFIRMED
   signed-in user — never the optimistic localStorage hint other pages use
   for instant paint, since showing edit controls to the wrong visitor even
   briefly would be a real bug, not just a flicker. */

// ── DOM references ──────────────────────────────────────────────────────

const statusEl = document.getElementById("prStatus");
const pageEl = document.getElementById("prPage");

const bannerEl = document.getElementById("prBanner");
const avatarEl = document.getElementById("prAvatar");
const avatarInputEl = document.getElementById("prAvatarInput");
const usernameEl = document.getElementById("prUsername");
const usernameInputEl = document.getElementById("prUsernameInput");
const openingTagEl = document.getElementById("prOpeningTag");
const memberSinceEl = document.getElementById("prMemberSince");

const editBtn = document.getElementById("prEditBtn");
const editActionsEl = document.getElementById("prEditActions");
const editCancelBtn = document.getElementById("prEditCancelBtn");
const editSaveBtn = document.getElementById("prEditSaveBtn");
const editPanelEl = document.getElementById("prEditPanel");
const bannerPickerEl = document.getElementById("prBannerPicker");
const openingSelectEl = document.getElementById("prOpeningSelect");
const editErrorEl = document.getElementById("prEditError");

const previewBannerEl = document.getElementById("prBannerPreview");
const previewAvatarEl = document.getElementById("prPreviewAvatar");
const previewUsernameEl = document.getElementById("prPreviewUsername");
const previewOpeningTagEl = document.getElementById("prPreviewOpeningTag");
const previewMemberSinceEl = document.getElementById("prPreviewMemberSince");

const statRatingEl = document.getElementById("prStatRating");
const statSolvedEl = document.getElementById("prStatSolved");
const statAccuracyEl = document.getElementById("prStatAccuracy");
const statBestStreakEl = document.getElementById("prStatBestStreak");
const statCurrentStreakEl = document.getElementById("prStatCurrentStreak");

const ratingHeadlineEl = document.getElementById("prRatingHeadline");
const ratingSubEl = document.getElementById("prRatingSub");
const ratingBarFillEl = document.getElementById("prRatingBarFill");
const ratingBarStartEl = document.getElementById("prRatingBarStart");
const ratingBarEndEl = document.getElementById("prRatingBarEnd");

const chartEmptyEl = document.getElementById("prChartEmpty");
const chartWrapEl = document.getElementById("prChartWrap");
const chartSvgEl = document.getElementById("prChartSvg");
const chartAreaEl = document.getElementById("prChartArea");
const chartLineEl = document.getElementById("prChartLine");
const chartCrosshairEl = document.getElementById("prChartCrosshair");
const chartDotEl = document.getElementById("prChartDot");
const chartTooltipEl = document.getElementById("prChartTooltip");
const chartTooltipValueEl = document.getElementById("prChartTooltipValue");
const chartTooltipDateEl = document.getElementById("prChartTooltipDate");

const activityEmptyEl = document.getElementById("prActivityEmpty");
const activityListEl = document.getElementById("prActivityList");

const insightsEmptyEl = document.getElementById("prInsightsEmpty");
const insightsGridEl = document.getElementById("prInsightsGrid");
const strengthsListEl = document.getElementById("prStrengthsList");
const weaknessesListEl = document.getElementById("prWeaknessesList");
const insightsProgressEl = document.getElementById("prInsightsProgress");
const progressListEl = document.getElementById("prProgressList");

// ── State ────────────────────────────────────────────────────────────────

let currentProfile = null;
let isOwnProfile = false;
let profileOptionsCache = null; // { banners, openings } — fetched once, lazily
let chartPoints = []; // [{ x, y, rating, attemptedAt }] in SVG viewBox coords

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

// ── Status / page visibility ────────────────────────────────────────────

function showStatus(html) {
  pageEl.hidden = true;
  statusEl.hidden = false;
  statusEl.innerHTML = html;
}

function showPage() {
  statusEl.hidden = true;
  pageEl.hidden = false;
}

// ── Avatar rendering ─────────────────────────────────────────────────────
// Same glass-tile-with-initial recipe as the sidebar's default avatar
// (clerk-client.js's avatarMarkup) — Clerk's own imageUrl is never truly
// empty (a generated placeholder when no real photo exists), so imageUrl
// being null/undefined here (this page only passes a real URL when
// hasImage was true — see users.service.js's getPublicProfile) is the
// actual "no photo" signal, not an empty string check. Takes a target
// element rather than assuming the real avatar, so the same function
// paints both the live banner's avatar and the edit-mode preview's.
function renderAvatarInto(el, username, imageUrl) {
  el.classList.remove("pr-avatar-default");
  if (imageUrl) {
    el.style.backgroundImage = `url("${imageUrl}")`;
    el.textContent = "";
  } else {
    el.style.backgroundImage = "";
    el.classList.add("pr-avatar-default");
    el.textContent = (username || "?").trim().charAt(0).toUpperCase() || "?";
  }
}

function formatMemberSince(memberSince) {
  const memberDate = new Date(memberSince.replace(" ", "T") + "Z");
  return Number.isNaN(memberDate.getTime())
    ? ""
    : "Member since " + memberDate.toLocaleDateString(undefined, { year: "numeric", month: "long" });
}

// ── Rendering ────────────────────────────────────────────────────────────

const mainBannerRefs = {
  bannerEl, avatarEl, usernameEl, openingTagEl, memberSinceEl,
};
const previewBannerRefs = {
  bannerEl: previewBannerEl,
  avatarEl: previewAvatarEl,
  usernameEl: previewUsernameEl,
  openingTagEl: previewOpeningTagEl,
  memberSinceEl: previewMemberSinceEl,
};

// Paints one banner card (the real one, or the edit-mode preview) from a
// plain data object — the ONE place that turns profile data into a banner
// card's DOM, called for both targets, so the preview can never visually
// drift from what Save actually produces.
function paintBannerCard(refs, data) {
  refs.bannerEl.className = "pr-banner pr-banner-" + (data.banner || "default");
  renderAvatarInto(refs.avatarEl, data.username, data.imageUrl);
  refs.usernameEl.textContent = data.username;

  if (data.favoriteOpening) {
    refs.openingTagEl.hidden = false;
    refs.openingTagEl.textContent = data.favoriteOpening;
  } else {
    refs.openingTagEl.hidden = true;
  }

  refs.memberSinceEl.textContent = formatMemberSince(data.memberSince);
}

function renderIdentity(profile) {
  paintBannerCard(mainBannerRefs, profile);
}

// Repaints the edit-panel preview from the in-progress (unsaved) edit
// state — the selected swatch and the opening dropdown's current value —
// rather than currentProfile, since nothing here is committed until Save.
function updateBannerPreview() {
  if (!currentProfile) return;
  paintBannerCard(previewBannerRefs, {
    banner: selectedBannerKey,
    username: currentProfile.username,
    imageUrl: currentProfile.imageUrl,
    favoriteOpening: openingSelectEl.value || null,
    memberSince: currentProfile.memberSince,
  });
}

function renderStats(stats) {
  statRatingEl.textContent = String(stats.rating);
  statSolvedEl.textContent = String(stats.solved);
  statAccuracyEl.textContent =
    stats.attempted > 0 ? Math.round((stats.solved / stats.attempted) * 100) + "%" : "—";
  statBestStreakEl.textContent = String(stats.bestStreak);
  statCurrentStreakEl.textContent = String(stats.currentStreak);
}

// Milestones are every 100 rating points — not server data, just a fixed
// display step computed from the rating the server already tracks. Never
// lands on remaining === 0: if the rating is exactly on a milestone, the
// "next" one is the one after it (ceil((rating + 1) / STEP) skips past a
// rating that's already an exact multiple).
const RATING_MILESTONE_STEP = 100;

function renderRatingMilestone(stats) {
  const rating = stats.rating;
  const next = Math.ceil((rating + 1) / RATING_MILESTONE_STEP) * RATING_MILESTONE_STEP;
  const prev = next - RATING_MILESTONE_STEP;
  const progressPct = ((rating - prev) / RATING_MILESTONE_STEP) * 100;

  ratingHeadlineEl.textContent = `${rating} / ${next}`;
  ratingSubEl.textContent = `+${next - rating} to next milestone`;
  ratingBarFillEl.style.width = progressPct + "%";
  ratingBarStartEl.textContent = String(prev);
  ratingBarEndEl.textContent = String(next);
}

function renderActivity(recentActivity) {
  activityListEl.innerHTML = "";

  if (recentActivity.length === 0) {
    activityEmptyEl.hidden = false;
    return;
  }
  activityEmptyEl.hidden = true;

  for (const entry of recentActivity) {
    const li = document.createElement("li");
    li.className = "pr-activity-item";

    const dot = document.createElement("span");
    dot.className = "pr-activity-dot " + (entry.correct ? "pr-activity-dot-correct" : "pr-activity-dot-wrong");

    const themes = document.createElement("span");
    themes.className = "pr-activity-themes";
    themes.textContent = entry.themes.length ? entry.themes.join(", ") : "Puzzle";

    const rating = document.createElement("span");
    rating.className = "pr-activity-rating";
    rating.textContent = String(entry.puzzleRating);

    const delta = document.createElement("span");
    delta.className = "pr-activity-delta " + (entry.delta >= 0 ? "pr-activity-delta-up" : "pr-activity-delta-down");
    delta.textContent = (entry.delta > 0 ? "+" : "") + entry.delta;

    li.append(dot, themes, rating, delta);
    activityListEl.appendChild(li);
  }
}

function renderInsights(themeBreakdown) {
  const hasAny = themeBreakdown.strengths.length > 0 || themeBreakdown.weaknesses.length > 0;

  if (!hasAny) {
    insightsEmptyEl.hidden = false;
    insightsGridEl.hidden = true;
    return;
  }
  insightsEmptyEl.hidden = true;
  insightsGridEl.hidden = false;

  function renderList(el, items) {
    el.innerHTML = "";
    if (items.length === 0) {
      const li = document.createElement("li");
      li.className = "pr-theme-row";
      li.innerHTML = '<span class="pr-theme-name" style="color:rgba(255,255,255,0.4)">Not enough data yet</span>';
      el.appendChild(li);
      return;
    }
    for (const item of items) {
      const li = document.createElement("li");
      li.className = "pr-theme-row";
      const name = document.createElement("span");
      name.className = "pr-theme-name";
      name.textContent = item.theme;
      const rate = document.createElement("span");
      rate.className = "pr-theme-rate";
      rate.textContent = Math.round(item.solveRate * 100) + "%";
      li.append(name, rate);
      el.appendChild(li);
    }
  }

  renderList(strengthsListEl, themeBreakdown.strengths);
  renderList(weaknessesListEl, themeBreakdown.weaknesses);
}

// Themes below the server's MIN_THEME_ATTEMPTS threshold — shown as a
// per-theme "N more puzzles" countdown so it's clear progress is being
// made even before a theme is confident enough to call a strength or
// weakness. Shown alongside the empty state too, since that's exactly
// when this progress is most useful to see.
function renderInsightsProgress(inProgress) {
  if (!inProgress || inProgress.length === 0) {
    insightsProgressEl.hidden = true;
    return;
  }
  insightsProgressEl.hidden = false;

  progressListEl.innerHTML = "";
  for (const item of inProgress) {
    const li = document.createElement("li");
    li.className = "pr-theme-row";
    const name = document.createElement("span");
    name.className = "pr-theme-name";
    name.textContent = item.theme;
    const remaining = document.createElement("span");
    remaining.className = "pr-theme-remaining";
    remaining.textContent = item.remaining === 1 ? "1 puzzle to go" : item.remaining + " puzzles to go";
    li.append(name, remaining);
    progressListEl.appendChild(li);
  }
}

// ── Rating chart ─────────────────────────────────────────────────────────
// Full-size line chart (not the stat-tile sparkline glyph the puzzles page
// scrapped) — single series, so no legend, but a real hover crosshair +
// tooltip per the dataviz skill's rule that a standalone chart gets one by
// default. viewBox is a fixed 600x200 with generous internal padding so
// preserveAspectRatio="none" stretches cleanly to the card's real width.

const CHART_VB_W = 600;
const CHART_VB_H = 200;
const CHART_PAD_X = 8;
const CHART_PAD_TOP = 14;
const CHART_PAD_BOTTOM = 14;

// Catmull-Rom-through-cubic-Bezier conversion (tension 1/6, the standard
// factor) — turns the point-to-point polyline into a smooth curve without
// pulling in a charting library. Missing neighbors at each end fall back to
// the endpoint itself, which is the usual boundary condition and keeps the
// curve from overshooting past the first/last data point. Hover detection
// (nearestChartPoint) still snaps to the real data points in `chartPoints`,
// not the curve, so the tooltip always reports an actual attempt.
function smoothPathD(points) {
  if (points.length < 2) return "";
  if (points.length === 2) {
    return `M ${points[0].x},${points[0].y} L ${points[1].x},${points[1].y}`;
  }

  const d = [`M ${points[0].x},${points[0].y}`];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d.push(`C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`);
  }
  return d.join(" ");
}

function renderChart(ratingHistory) {
  if (ratingHistory.length < 2) {
    chartEmptyEl.hidden = false;
    chartWrapEl.hidden = true;
    return;
  }
  chartEmptyEl.hidden = true;
  chartWrapEl.hidden = false;

  const ratings = ratingHistory.map((p) => p.rating);
  const minRating = Math.min(...ratings);
  const maxRating = Math.max(...ratings);
  const span = maxRating - minRating || 1;
  const plotH = CHART_VB_H - CHART_PAD_TOP - CHART_PAD_BOTTOM;
  const plotW = CHART_VB_W - CHART_PAD_X * 2;

  chartPoints = ratingHistory.map((point, i) => {
    const x = CHART_PAD_X + (i / (ratingHistory.length - 1)) * plotW;
    const y = CHART_PAD_TOP + plotH - ((point.rating - minRating) / span) * plotH;
    return { x, y, rating: point.rating, attemptedAt: point.attemptedAt };
  });

  const lineD = smoothPathD(chartPoints);
  chartLineEl.setAttribute("d", lineD);

  const baseline = CHART_VB_H - CHART_PAD_BOTTOM;
  const last = chartPoints[chartPoints.length - 1];
  const areaD = `${lineD} L ${last.x},${baseline} L ${chartPoints[0].x},${baseline} Z`;
  chartAreaEl.setAttribute("d", areaD);

  hideChartHover();
}

function hideChartHover() {
  chartCrosshairEl.style.opacity = "0";
  chartDotEl.style.opacity = "0";
  chartTooltipEl.hidden = true;
}

function nearestChartPoint(svgX) {
  let nearest = chartPoints[0];
  let nearestDist = Math.abs(chartPoints[0].x - svgX);
  for (const p of chartPoints) {
    const dist = Math.abs(p.x - svgX);
    if (dist < nearestDist) {
      nearest = p;
      nearestDist = dist;
    }
  }
  return nearest;
}

chartSvgEl.addEventListener("mousemove", (e) => {
  if (chartPoints.length === 0) return;

  const rect = chartSvgEl.getBoundingClientRect();
  const svgX = ((e.clientX - rect.left) / rect.width) * CHART_VB_W;
  const point = nearestChartPoint(svgX);

  chartCrosshairEl.setAttribute("x1", String(point.x));
  chartCrosshairEl.setAttribute("x2", String(point.x));
  chartCrosshairEl.style.opacity = "1";

  chartDotEl.setAttribute("cx", String(point.x));
  chartDotEl.setAttribute("cy", String(point.y));
  chartDotEl.style.opacity = "1";

  chartTooltipValueEl.textContent = String(point.rating);
  const date = new Date(point.attemptedAt.replace(" ", "T") + "Z");
  chartTooltipDateEl.textContent = Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });

  const leftPercent = (point.x / CHART_VB_W) * 100;
  chartTooltipEl.style.left = leftPercent + "%";
  chartTooltipEl.style.top = (point.y / CHART_VB_H) * rect.height + "px";
  chartTooltipEl.hidden = false;
});

chartSvgEl.addEventListener("mouseleave", hideChartHover);

// ── Edit mode ────────────────────────────────────────────────────────────

async function ensureProfileOptionsLoaded() {
  if (profileOptionsCache) return profileOptionsCache;
  profileOptionsCache = await fetchProfileOptions();

  bannerPickerEl.innerHTML = "";
  for (const banner of profileOptionsCache.banners) {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "pr-banner-swatch pr-banner-" + banner.key;
    swatch.dataset.bannerKey = banner.key;
    swatch.setAttribute("aria-label", banner.label);
    swatch.title = banner.label;

    const label = document.createElement("span");
    label.className = "pr-banner-swatch-label";
    label.textContent = banner.label;
    swatch.appendChild(label);

    swatch.addEventListener("click", () => selectBannerSwatch(banner.key));
    bannerPickerEl.appendChild(swatch);
  }

  openingSelectEl.innerHTML = '<option value="">None</option>';
  for (const opening of profileOptionsCache.openings) {
    const option = document.createElement("option");
    option.value = opening;
    option.textContent = opening;
    openingSelectEl.appendChild(option);
  }

  return profileOptionsCache;
}

let selectedBannerKey = "default";

function selectBannerSwatch(key) {
  selectedBannerKey = key;
  bannerPickerEl.querySelectorAll(".pr-banner-swatch").forEach((el) => {
    el.classList.toggle("pr-banner-swatch-active", el.dataset.bannerKey === key);
  });
  updateBannerPreview();
}

function showEditError(message) {
  editErrorEl.hidden = false;
  editErrorEl.textContent = message;
}

function clearEditError() {
  editErrorEl.hidden = true;
  editErrorEl.textContent = "";
}

async function enterEditMode() {
  await ensureProfileOptionsLoaded();
  clearEditError();

  usernameEl.hidden = true;
  usernameInputEl.hidden = false;
  usernameInputEl.value = currentProfile.username;

  editBtn.hidden = true;
  editActionsEl.hidden = false;
  editPanelEl.hidden = false;

  openingSelectEl.value = currentProfile.favoriteOpening || "";
  selectBannerSwatch(currentProfile.banner || "default"); // also paints the initial preview

  avatarEl.classList.add("pr-avatar-editable");
}

function exitEditMode() {
  usernameEl.hidden = false;
  usernameInputEl.hidden = true;
  editBtn.hidden = false;
  editActionsEl.hidden = true;
  editPanelEl.hidden = true;
  avatarEl.classList.remove("pr-avatar-editable");
  clearEditError();
}

async function saveProfileEdits() {
  clearEditError();

  const patch = {};
  const newUsername = usernameInputEl.value.trim();
  if (newUsername && newUsername !== currentProfile.username) {
    patch.username = newUsername;
  }
  if (selectedBannerKey !== (currentProfile.banner || "default")) {
    patch.banner = selectedBannerKey;
  }
  const newOpening = openingSelectEl.value || null;
  if (newOpening !== (currentProfile.favoriteOpening || null)) {
    patch.favoriteOpening = newOpening;
  }

  if (Object.keys(patch).length === 0) {
    exitEditMode();
    return;
  }

  editSaveBtn.disabled = true;
  editSaveBtn.textContent = "Saving…";

  try {
    const updated = await updateMyProfile(patch);
    currentProfile = { ...currentProfile, ...updated };
    renderIdentity(currentProfile);
    renderStats(currentProfile.puzzleStats);
    renderRatingMilestone(currentProfile.puzzleStats);
    exitEditMode();
  } catch (err) {
    if (err.code === "username_change_too_soon" && err.details && err.details.availableAt) {
      const availableDate = new Date(err.details.availableAt);
      showEditError(
        "You can change your username again on " +
          availableDate.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) +
          ".",
      );
    } else if (err.code === "username_update_failed" && err.details && err.details.message) {
      showEditError(err.details.message);
    } else {
      showEditError("Could not save your changes. Please try again.");
    }
  } finally {
    editSaveBtn.disabled = false;
    editSaveBtn.textContent = "Save";
  }
}

editBtn.addEventListener("click", enterEditMode);
editCancelBtn.addEventListener("click", exitEditMode);
editSaveBtn.addEventListener("click", saveProfileEdits);
openingSelectEl.addEventListener("change", updateBannerPreview);

avatarEl.addEventListener("click", () => {
  if (avatarEl.classList.contains("pr-avatar-editable")) {
    avatarInputEl.click();
  }
});

avatarInputEl.addEventListener("change", async () => {
  const file = avatarInputEl.files[0];
  avatarInputEl.value = "";
  if (!file || !window.cheeseClerk || !window.cheeseClerk.user) return;

  try {
    await window.cheeseClerk.user.setProfileImage({ file });
    const user = window.cheeseClerk.user;
    const newImageUrl = user.hasImage ? user.imageUrl : null;
    currentProfile.imageUrl = newImageUrl;
    renderAvatarInto(avatarEl, currentProfile.username, newImageUrl);
    renderAvatarInto(previewAvatarEl, currentProfile.username, newImageUrl);
  } catch (err) {
    cheeseDialogs.showAlert(
      "Could not upload that image. Please try a different file.",
      { title: "Upload failed" },
    );
  }
});

// ── Boot ─────────────────────────────────────────────────────────────────

async function loadAndRender(username) {
  showStatus("Loading…");

  let profile;
  try {
    profile = await fetchPublicProfile(username);
  } catch (err) {
    if (err.code === "user_not_found") {
      showStatus(`No profile found for "${escapeHtml(username)}".`);
    } else {
      showStatus("Could not load this profile right now. Please try again.");
    }
    return;
  }

  currentProfile = profile;
  renderIdentity(profile);
  renderStats(profile.puzzleStats);
  renderRatingMilestone(profile.puzzleStats);
  renderChart(profile.ratingHistory);
  renderActivity(profile.recentActivity);
  renderInsights(profile.themeBreakdown);
  renderInsightsProgress(profile.themeBreakdown.inProgress);
  showPage();

  window.cheeseClerkReady
    .then((clerk) => {
      isOwnProfile = !!(clerk.user && clerk.user.username === profile.username);
      editBtn.hidden = !isOwnProfile;
    })
    .catch(() => {});
}

async function init() {
  const params = new URLSearchParams(window.location.search);
  const targetUsername = params.get("u");

  if (!targetUsername) {
    showStatus("Loading…");
    try {
      const clerk = await window.cheeseClerkReady;
      if (clerk.user && clerk.user.username) {
        window.location.replace("?u=" + encodeURIComponent(clerk.user.username));
        return;
      }
    } catch (e) {
      // fall through to the signed-out message below
    }
    showStatus(
      "Sign in to view your own profile, or open someone else's profile link directly.",
    );
    return;
  }

  await loadAndRender(targetUsername);
}

init();
