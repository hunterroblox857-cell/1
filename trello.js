const TRELLO = "https://api.trello.com/1";

function credentials() {
  return {
    key: process.env.TRELLO_API_KEY || "",
    token: process.env.TRELLO_TOKEN || "",
    boardId: process.env.TRELLO_BOARD_ID || "",
    pin: process.env.LEDGER_PIN || "",
    name: process.env.LEDGER_NAME || "Anmol",
  };
}

function authQuery(key, token) {
  return new URLSearchParams({ key, token }).toString();
}

function listRole(name) {
  const n = String(name || "").toLowerCase();
  if (/\b(studied|hours|sessions|session log|time log|ypt)\b/.test(n)) {
    return "log";
  }
  if (/\b(done|complete|completed|finished|cleared)\b/.test(n)) {
    return "done";
  }
  if (/\b(doing|in progress|progress|current|currently|now|working|focus)\b/.test(n)) {
    return "now";
  }
  if (/\b(to[- ]?do|todo|backlog|later|up next|planned|inbox|need to)\b/.test(n)) {
    return "todo";
  }
  return "other";
}

function mapCard(card) {
  const checklists = (card.checklists || []).map((list) => {
    const items = (list.checkItems || [])
      .slice()
      .sort((a, b) => (a.pos || 0) - (b.pos || 0))
      .map((item) => ({
        id: item.id,
        name: item.name,
        checked: item.state === "complete",
      }));
    const total = items.length;
    const done = items.filter((item) => item.checked).length;
    return { id: list.id, name: list.name, items, total, done };
  });

  const checks = checklists.reduce(
    (acc, list) => ({ total: acc.total + list.total, done: acc.done + list.done }),
    { total: 0, done: 0 }
  );

  return {
    id: card.id,
    name: card.name,
    desc: card.desc || "",
    url: card.url,
    due: card.due,
    dueComplete: Boolean(card.dueComplete),
    lastActivity: card.dateLastActivity,
    idList: card.idList,
    labels: (card.labels || []).map((label) => ({
      id: label.id,
      name: label.name || label.color || "",
      color: label.color,
    })),
    checklists,
    checks,
  };
}

function parseDurationMs(text) {
  const raw = String(text || "");
  const hm = raw.match(/(\d+)\s*h(?:ours?)?(?:\s*(\d+)\s*m(?:in(?:ute)?s?)?)?/i);
  if (hm) {
    return (Number(hm[1]) * 3600 + Number(hm[2] || 0) * 60) * 1000;
  }
  const mins = raw.match(/\b(\d+)\s*m(?:in(?:ute)?s?)?\b/i);
  if (mins) return Number(mins[1]) * 60 * 1000;
  const colon = raw.match(/\b(\d+):(\d{2})(?::(\d{2}))?\b/);
  if (colon) {
    return (Number(colon[1]) * 3600 + Number(colon[2]) * 60 + Number(colon[3] || 0)) * 1000;
  }
  return 0;
}

function descField(desc, key) {
  const match = String(desc || "").match(new RegExp(`^${key}:\\s*(.+)$`, "im"));
  return match ? match[1].trim() : "";
}

function isLiveCard(card) {
  return /^ledger-live\b/m.test(card.desc || "") || /^●\s*studying/i.test(card.name || "");
}

function publicCard(card) {
  return {
    id: card.id,
    name: card.name,
    desc: card.desc && !/^ledger/m.test(card.desc) ? card.desc : "",
    url: card.url,
    due: card.due,
    dueComplete: card.dueComplete,
    lastActivity: card.lastActivity,
    labels: card.labels,
    checklists: card.checklists,
    checks: card.checks,
  };
}

function sessionFromCard(card) {
  const started = descField(card.desc, "started") || card.lastActivity;
  const ended = descField(card.desc, "ended");
  const subject = descField(card.desc, "subject");
  const live = isLiveCard(card);
  const msFromDesc = Number(descField(card.desc, "ms") || 0);
  const ms = live
    ? 0
    : msFromDesc || parseDurationMs(card.name) || parseDurationMs(card.desc);
  return {
    id: card.id,
    name: card.name,
    subject: subject || "",
    started,
    ended: ended || null,
    ms,
    live,
  };
}

function dayKey(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function buildHours(logCards) {
  const sessions = (logCards || []).map(sessionFromCard);
  const live = sessions.find((item) => item.live) || null;
  const finished = sessions.filter((item) => !item.live);
  const byDay = {};
  for (const session of finished) {
    const key = dayKey(session.ended || session.started);
    if (!key) continue;
    byDay[key] = (byDay[key] || 0) + (session.ms || 0);
  }
  return {
    live: live
      ? { startedAt: live.started, subject: live.subject, id: live.id }
      : null,
    byDay,
    sessions: finished.slice(0, 12).map((item) => ({
      id: item.id,
      name: item.name,
      subject: item.subject,
      started: item.started,
      ended: item.ended,
      ms: item.ms,
    })),
  };
}

async function trelloJson(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: { Accept: "application/json", ...(options.headers || {}) },
    body: options.body,
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }
  if (!response.ok) {
    const message =
      (data && (data.message || data.error)) ||
      `Trello request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return data;
}

function demoPayload() {
  const now = Date.now();
  return {
    configured: false,
    demo: true,
    canLog: false,
    studentName: "Anmol",
    fetchedAt: new Date().toISOString(),
    board: { id: "demo", name: "Spring term", url: "https://trello.com" },
    hours: {
      live: { startedAt: new Date(now - 42 * 60 * 1000).toISOString(), subject: "Organic chemistry" },
      byDay: {
        [dayKey(now)]: 2 * 3600 * 1000 + 14 * 60 * 1000,
        [dayKey(now - 864e5)]: 3 * 3600 * 1000 + 5 * 60 * 1000,
        [dayKey(now - 864e5 * 2)]: 1 * 3600 * 1000 + 40 * 60 * 1000,
        [dayKey(now - 864e5 * 3)]: 4 * 3600 * 1000,
        [dayKey(now - 864e5 * 5)]: 2 * 3600 * 1000 + 20 * 60 * 1000,
      },
      sessions: [
        {
          id: "s1",
          name: "Organic chemistry · 1h 32m",
          subject: "Organic chemistry",
          started: new Date(now - 5 * 3600 * 1000).toISOString(),
          ended: new Date(now - 3.5 * 3600 * 1000).toISOString(),
          ms: 92 * 60 * 1000,
        },
        {
          id: "s2",
          name: "Linear algebra · 42m",
          subject: "Linear algebra",
          started: new Date(now - 8 * 3600 * 1000).toISOString(),
          ended: new Date(now - 7.3 * 3600 * 1000).toISOString(),
          ms: 42 * 60 * 1000,
        },
      ],
    },
    lists: [
      {
        id: "list-now",
        name: "Currently doing",
        role: "now",
        cards: [
          {
            id: "c1",
            name: "Organic chemistry — stereochemistry",
            desc: "Newman projections and R/S assignment. Finish the worked examples before the problem set.",
            url: "#",
            due: new Date(now + 36e5 * 8).toISOString(),
            dueComplete: false,
            lastActivity: new Date().toISOString(),
            labels: [
              { id: "l1", name: "Chem", color: "red" },
              { id: "l2", name: "Exam track", color: "orange" },
            ],
            checklists: [
              {
                id: "ch1",
                name: "Tonight",
                total: 4,
                done: 2,
                items: [
                  { id: "i1", name: "Read Klein 5.1–5.3", checked: true },
                  { id: "i2", name: "Worked examples 1–6", checked: true },
                  { id: "i3", name: "Problem set 12–18", checked: false },
                  { id: "i4", name: "Anki: 20 cards", checked: false },
                ],
              },
            ],
            checks: { total: 4, done: 2 },
          },
          {
            id: "c2",
            name: "Linear algebra problem set 6",
            desc: "Eigenvalues, diagonalization.",
            url: "#",
            due: null,
            dueComplete: false,
            lastActivity: new Date().toISOString(),
            labels: [{ id: "l3", name: "Math", color: "blue" }],
            checklists: [],
            checks: { total: 0, done: 0 },
          },
        ],
      },
      {
        id: "list-todo",
        name: "To do",
        role: "todo",
        cards: [
          {
            id: "c3",
            name: "History essay outline — labor & cities",
            desc: "1,800 words. Primary sources from week 4 folder.",
            url: "#",
            due: new Date(now + 864e5 * 3).toISOString(),
            dueComplete: false,
            lastActivity: new Date().toISOString(),
            labels: [{ id: "l4", name: "Writing", color: "green" }],
            checklists: [
              {
                id: "ch2",
                name: "Draft",
                total: 3,
                done: 1,
                items: [
                  { id: "i5", name: "Thesis sentence", checked: true },
                  { id: "i6", name: "Three body claims", checked: false },
                  { id: "i7", name: "Source list", checked: false },
                ],
              },
            ],
            checks: { total: 3, done: 1 },
          },
          {
            id: "c4",
            name: "Spanish oral — unit 7 verbs",
            desc: "",
            url: "#",
            due: new Date(now + 864e5 * 5).toISOString(),
            dueComplete: false,
            lastActivity: new Date().toISOString(),
            labels: [{ id: "l5", name: "Lang", color: "purple" }],
            checklists: [],
            checks: { total: 0, done: 0 },
          },
        ],
      },
      {
        id: "list-later",
        name: "Later this week",
        role: "other",
        cards: [
          {
            id: "c5",
            name: "Lab report: titration",
            desc: "Figures + error analysis.",
            url: "#",
            due: new Date(now + 864e5 * 6).toISOString(),
            dueComplete: false,
            lastActivity: new Date().toISOString(),
            labels: [{ id: "l1", name: "Chem", color: "red" }],
            checklists: [],
            checks: { total: 0, done: 0 },
          },
        ],
      },
      {
        id: "list-done",
        name: "Done",
        role: "done",
        cards: [
          {
            id: "c6",
            name: "Calc II quiz review",
            desc: "",
            url: "#",
            due: null,
            dueComplete: true,
            lastActivity: new Date().toISOString(),
            labels: [{ id: "l3", name: "Math", color: "blue" }],
            checklists: [],
            checks: { total: 0, done: 0 },
          },
          {
            id: "c7",
            name: "Read Durkheim excerpt",
            desc: "",
            url: "#",
            due: null,
            dueComplete: true,
            lastActivity: new Date().toISOString(),
            labels: [{ id: "l4", name: "Writing", color: "green" }],
            checklists: [],
            checks: { total: 0, done: 0 },
          },
        ],
      },
    ],
  };
}

module.exports = {
  TRELLO,
  credentials,
  authQuery,
  listRole,
  mapCard,
  publicCard,
  isLiveCard,
  sessionFromCard,
  buildHours,
  trelloJson,
  demoPayload,
  descField,
};
