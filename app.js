const STORAGE_KEY = "ledger-hours-v1";

const pad = (n) => String(n).padStart(2, "0");

const formatClock = (date) => {
  const weekday = date.toLocaleDateString(undefined, { weekday: "long" });
  const month = date.toLocaleDateString(undefined, { month: "long" });
  return `${weekday} ${date.getDate()} ${month}  ·  ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const formatDuration = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${pad(m)}:${pad(s)}`;
};

const formatHm = (ms) => {
  const total = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}:${pad(m)}`;
};

const dayKey = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const loadHours = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      days: raw.days && typeof raw.days === "object" ? raw.days : {},
      runningSince: typeof raw.runningSince === "number" ? raw.runningSince : null,
    };
  } catch {
    return { days: {}, runningSince: null };
  }
};

const saveHours = (state) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

const escapeHtml = (value) =>
  String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const dueLabel = (iso, complete) => {
  if (!iso) return "";
  const due = new Date(iso);
  const label = due.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (complete) return `Done · ${label}`;
  const overdue = due.getTime() < Date.now();
  return { text: overdue ? `Due ${label}` : `Due ${label}`, overdue };
};

const checklistHtml = (card, compact) => {
  if (!card.checks || card.checks.total === 0) return "";
  const pct = Math.round((card.checks.done / card.checks.total) * 100);
  const items = compact
    ? []
    : (card.checklists || []).flatMap((list) => list.items || []);
  const visible = compact ? [] : items.slice(0, 6);
  const rest = items.length - visible.length;
  return `
    <div class="checks">
      <div class="check-row">
        <span>${card.checks.done} / ${card.checks.total} on the list</span>
        <span>${pct}%</span>
      </div>
      <div class="meter" aria-hidden="true"><span style="width:${pct}%"></span></div>
      ${
        visible.length
          ? `<ul class="todo-list">${visible
              .map(
                (item) =>
                  `<li class="${item.checked ? "done" : ""}"><span class="box"></span><span>${escapeHtml(
                    item.name
                  )}</span></li>`
              )
              .join("")}${
              rest > 0 ? `<li><span class="box"></span><span>+${rest} more</span></li>` : ""
            }</ul>`
          : ""
      }
    </div>
  `;
};

const labelsHtml = (card) =>
  (card.labels || [])
    .filter((label) => label.name || label.color)
    .map(
      (label) =>
        `<span class="chip ${escapeHtml(label.color || "")}">${escapeHtml(
          label.name || label.color
        )}</span>`
    )
    .join("");

const cardHtml = (card, hero) => {
  const due = dueLabel(card.due, card.dueComplete);
  const dueChip =
    typeof due === "string"
      ? due
        ? `<span class="due">${escapeHtml(due)}</span>`
        : ""
      : `<span class="due ${due.overdue ? "overdue" : ""}">${escapeHtml(due.text)}</span>`;
  const titleTag = hero ? "h2" : "h3";
  const desc =
    card.desc && hero
      ? `<p class="desc">${escapeHtml(card.desc).slice(0, 280)}</p>`
      : "";
  return `
    <article class="task ${hero ? "hero" : ""}">
      <${titleTag}>${escapeHtml(card.name)}</${titleTag}>
      ${desc}
      <div class="meta">${labelsHtml(card)}${dueChip}</div>
      ${checklistHtml(card, !hero)}
      ${
        card.url && card.url !== "#"
          ? `<a class="open" href="${escapeHtml(card.url)}" target="_blank" rel="noreferrer">Open card</a>`
          : ""
      }
    </article>
  `;
};

const setupCopy = () => `
  <p>
    Connect Trello in Vercel: add <strong>TRELLO_API_KEY</strong>,
    <strong>TRELLO_TOKEN</strong>, and <strong>TRELLO_BOARD_ID</strong>,
    then redeploy. Until then, this is sample work on the desk.
    Key + token: create a Power-Up at
    <a href="https://trello.com/power-ups/admin" target="_blank" rel="noreferrer">trello.com/power-ups/admin</a>,
    generate an API key, then mint a <em>read</em> token.
    Board id is the short code in
    <code>trello.com/b/<strong>BOARDID</strong>/name</code>.
  </p>
`;

const renderBoard = (data) => {
  const banner = document.getElementById("banner");
  const nowEl = document.getElementById("now");
  const columnsEl = document.getElementById("columns");
  const boardName = document.getElementById("board-name");
  const nowLabel = document.getElementById("now-label");
  const nowCount = document.getElementById("now-count");
  const sync = document.getElementById("sync");

  if (data.error) {
    banner.hidden = false;
    banner.innerHTML = `<p>${escapeHtml(data.error)}</p>`;
    nowEl.innerHTML = `<p class="empty">The board could not be read.</p>`;
    columnsEl.innerHTML = "";
    return;
  }

  boardName.textContent = data.board?.name ? data.board.name : "Untitled board";

  if (data.demo) {
    banner.hidden = false;
    banner.innerHTML = setupCopy();
  } else {
    banner.hidden = true;
    banner.innerHTML = "";
  }

  const lists = data.lists || [];
  const nowList = lists.find((list) => list.role === "now") || lists[0];
  const rest = lists.filter((list) => list !== nowList);

  nowLabel.textContent = nowList ? nowList.name : "On the desk";
  const nowCards = nowList?.cards || [];
  nowCount.textContent = nowCards.length ? `${nowCards.length} open` : "Clear";
  nowEl.innerHTML = nowCards.length
    ? nowCards.map((card, index) => cardHtml(card, index === 0)).join("")
    : `<p class="empty">Nothing in this list. Put a Trello card in your current column.</p>`;

  columnsEl.innerHTML = rest
    .map((list) => {
      const cards = list.cards || [];
      return `
        <section class="column ${list.role}">
          <header>
            <h2>${escapeHtml(list.name)}</h2>
            <span class="n">${cards.length}</span>
          </header>
          <div class="stack">
            ${
              cards.length
                ? cards.map((card) => cardHtml(card, false)).join("")
                : `<p class="empty">Empty.</p>`
            }
          </div>
        </section>
      `;
    })
    .join("");

  const stamp = data.fetchedAt ? new Date(data.fetchedAt) : new Date();
  sync.textContent = data.demo
    ? "Showing sample cards · add Trello keys on Vercel for your board"
    : `Synced ${stamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
};

const renderHours = (state) => {
  const today = dayKey(new Date());
  const live = state.runningSince ? Date.now() - state.runningSince : 0;
  const todayMs = (state.days[today] || 0) + live;
  document.getElementById("hours-total").textContent = formatDuration(todayMs);

  const toggle = document.getElementById("timer-toggle");
  if (state.runningSince) {
    toggle.textContent = "Pause session";
    toggle.classList.add("live");
    document.getElementById("hours-sub").textContent = "Session running";
  } else {
    toggle.textContent = "Start session";
    toggle.classList.remove("live");
    const sessions = todayMs > 0 ? "Logged for today" : "No session yet today";
    document.getElementById("hours-sub").textContent = sessions;
  }

  const weekEl = document.getElementById("week");
  const days = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = dayKey(d);
    let ms = state.days[key] || 0;
    if (key === today) ms += live;
    days.push({
      key,
      label: d.toLocaleDateString(undefined, { weekday: "narrow" }),
      ms,
    });
  }
  const max = Math.max(1, ...days.map((day) => day.ms));
  weekEl.innerHTML = days
    .map(
      (day) => `
        <li>
          <span>${day.label}</span>
          <div class="bar"><span style="width:${Math.round((day.ms / max) * 100)}%"></span></div>
          <span>${formatHm(day.ms)}</span>
        </li>
      `
    )
    .join("");
};

const tickClock = () => {
  const now = new Date();
  const el = document.getElementById("clock");
  el.dateTime = now.toISOString();
  el.textContent = formatClock(now);
};

async function loadTrello() {
  const sync = document.getElementById("sync");
  try {
    const response = await fetch("/api/trello", { cache: "no-store" });
    const data = await response.json();
    renderBoard(data);
  } catch {
    try {
      const demo = await fetch("/demo.json", { cache: "no-store" }).then((r) => r.json());
      renderBoard(demo);
      sync.textContent = "Local preview · deploy to Vercel for live Trello";
    } catch {
      sync.textContent = "Could not reach the Trello route. Deploy this folder to Vercel.";
      document.getElementById("now").innerHTML =
        `<p class="empty">Deploy this folder to Vercel so /api/trello can run.</p>`;
    }
  }
}

function boot() {
  let hours = loadHours();
  tickClock();
  renderHours(hours);
  loadTrello();

  setInterval(() => {
    tickClock();
    renderHours(hours);
  }, 1000);

  setInterval(loadTrello, 45000);

  document.getElementById("timer-toggle").addEventListener("click", () => {
    if (hours.runningSince) {
      const today = dayKey(new Date());
      hours.days[today] = (hours.days[today] || 0) + (Date.now() - hours.runningSince);
      hours.runningSince = null;
    } else {
      hours.runningSince = Date.now();
    }
    saveHours(hours);
    renderHours(hours);
  });

  document.getElementById("timer-reset").addEventListener("click", () => {
    const today = dayKey(new Date());
    hours.days[today] = 0;
    hours.runningSince = null;
    saveHours(hours);
    renderHours(hours);
  });

  document.getElementById("refresh").addEventListener("click", loadTrello);
}

boot();
