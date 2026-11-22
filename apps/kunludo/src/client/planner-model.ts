import type { Action, Snapshot } from "../contracts/index.ts";
import type { CalendarEvent } from "../domain/index.ts";

export type Fields = {
  name: string;
  club: string;
  needed: string;
  timezone: string;
  teamId: string;
  pin: string;
  opponent: string;
  start: string;
  end: string;
  buffer: string;
  venue: string;
  home: string;
  ownName: string;
};

export const emptyFields: Fields = {
  name: "",
  club: "",
  needed: "4",
  timezone: "Europe/Berlin",
  teamId: "",
  pin: "",
  opponent: "",
  start: "",
  end: "",
  buffer: "30",
  venue: "",
  home: "yes",
  ownName: "",
};

export type Editor =
  | { kind: "none" }
  | {
      kind: "create-team" | "join" | "settings" | "game" | "import" | "propose";
      teamId: string;
      gameId: string;
      version: number;
      fields: Fields;
      calendar: string;
      events: CalendarEvent[];
      selected: string[];
    };

export type Effect = { id: number } & (
  | { kind: "load" }
  | { kind: "save"; action: Action; version: number; commandId: string }
  | { kind: "code"; teamId: string }
);

export type Model = {
  data: Snapshot | null;
  screen: "loading" | "ready" | "expired";
  view: "games" | "teams";
  filter: string[];
  editor: Editor;
  pending: Effect | null;
  retry: Effect | null;
  editorId: number;
  next: number;
  error: string;
  notice: string;
  noticeId: number;
  code: { teamId: string; pin: string; version: number } | null;
  now: number;
  online: boolean;
};

export type Message =
  | { kind: "open"; editor: Editor }
  | { kind: "close" }
  | { kind: "field"; field: keyof Fields; value: string }
  | { kind: "calendar-start" }
  | { kind: "calendar-failed"; editorId: number; error: string }
  | { kind: "calendar"; editorId: number; text: string; events: CalendarEvent[] }
  | { kind: "select"; uid: string }
  | { kind: "filter"; teamId: string }
  | { kind: "clear-filter" }
  | { kind: "dismiss-notice"; id: number }
  | { kind: "view"; view: "games" | "teams" }
  | { kind: "save"; action: Action; commandId: string }
  | { kind: "retry" }
  | { kind: "load" }
  | { kind: "code"; teamId: string }
  | { kind: "rebase" }
  | { kind: "snapshot"; data: Snapshot }
  | { kind: "tick"; now: number }
  | { kind: "online"; value: boolean }
  | { kind: "expired" }
  | { kind: "local-error"; error: string }
  | ({ id: number } & (
      | { kind: "loaded"; data: Snapshot }
      | { kind: "saved"; data: Snapshot; notice: string; teamId?: string }
      | { kind: "coded"; code: { teamId: string; pin: string; version: number } }
      | { kind: "failed"; error: string; status: number }
    ));

export function init(now: number): Model {
  return {
    data: null,
    screen: "loading",
    view: "games",
    filter: [],
    editor: { kind: "none" },
    pending: { kind: "load", id: 1 },
    retry: null,
    editorId: 0,
    next: 2,
    error: "",
    notice: "",
    noticeId: 0,
    code: null,
    now,
    online: true,
  };
}

export function update(m: Model, msg: Message): { model: Model; effects: Effect[] } {
  const done = (model: Model) => ({ model, effects: [] });

  const start = (effect: Effect) => ({
    model: { ...m, pending: effect, next: m.next + 1, error: "", notice: "" },
    effects: [effect],
  });

  function accept(data: Snapshot): Model {
    if (m.data && data.version < m.data.version) return m;
    const ids = new Set(data.teams.map((t) => t.id));

    const editor =
      m.editor.kind !== "none" &&
      m.data &&
      m.editor.version === m.data.version &&
      JSON.stringify(m.data.teams) === JSON.stringify(data.teams) &&
      JSON.stringify(m.data.games) === JSON.stringify(data.games)
        ? { ...m.editor, version: data.version }
        : m.editor;

    return {
      ...m,
      data,
      screen: "ready",
      filter: m.filter.filter((id) => ids.has(id)),
      editor:
        editor.kind !== "none" && editor.teamId && !ids.has(editor.teamId) && editor.kind !== "join"
          ? { kind: "none" }
          : editor,
      code:
        m.code &&
        ids.has(m.code.teamId) &&
        data.version <= m.code.version &&
        data.teams.find((t) => t.id === m.code!.teamId)?.role === "admin"
          ? m.code
          : null,
    };
  }

  if (msg.kind === "expired")
    return done({
      ...m,
      screen: "expired",
      data: null,
      editor: { kind: "none" },
      code: null,
      pending: null,
      retry: null,
      error: "Bitte melde dich erneut an.",
      notice: "",
    });

  if (m.screen === "expired") return done(m);

  switch (msg.kind) {
    case "dismiss-notice":
      return msg.id === m.noticeId ? done({ ...m, notice: "" }) : done(m);
    case "snapshot":
      return done(accept(msg.data));
    case "open":
      return m.pending || m.retry
        ? done(m)
        : done({
            ...m,
            editor: msg.editor,
            editorId: m.editorId + 1,
            error: "",
            notice: "",
            code: null,
          });
    case "close":
      return m.pending ? done(m) : done({ ...m, editor: { kind: "none" }, code: null, error: "" });
    case "view":
      return done({ ...m, view: msg.view, editor: { kind: "none" }, code: null });
    case "field":
      return !m.pending && m.editor.kind !== "none"
        ? done({
            ...m,
            editor: { ...m.editor, fields: { ...m.editor.fields, [msg.field]: msg.value } },
          })
        : done(m);
    case "calendar-start":
      return !m.pending && m.editor.kind === "import"
        ? done({
            ...m,
            editorId: m.editorId + 1,
            error: "",
            editor: {
              ...m.editor,
              calendar: "",
              events: [],
              selected: [],
              fields: { ...m.editor.fields, ownName: "" },
            },
          })
        : done(m);
    case "calendar-failed":
      return m.editorId === msg.editorId && m.editor.kind === "import"
        ? done({ ...m, error: msg.error })
        : done(m);
    case "calendar":
      return !m.pending && m.editorId === msg.editorId && m.editor.kind === "import"
        ? done({
            ...m,
            editor: {
              ...m.editor,
              calendar: msg.text,
              events: msg.events,
              fields: {
                ...m.editor.fields,
                ownName: calendarTeam(
                  msg.events,
                  m.data?.teams.find((t) => m.editor.kind !== "none" && t.id === m.editor.teamId)
                    ?.name,
                ),
              },
              selected: msg.events.filter((e) => e.end >= m.now).map((e) => e.uid),
            },
          })
        : done(m);
    case "select":
      return !m.pending && m.editor.kind === "import"
        ? done({
            ...m,
            editor: {
              ...m.editor,
              selected: m.editor.selected.includes(msg.uid)
                ? m.editor.selected.filter((v) => v !== msg.uid)
                : [...m.editor.selected, msg.uid],
            },
          })
        : done(m);
    case "filter":
      return done({
        ...m,
        filter: m.filter.includes(msg.teamId)
          ? m.filter.filter((id) => id !== msg.teamId)
          : [...m.filter, msg.teamId],
      });
    case "clear-filter":
      return done({ ...m, filter: [] });
    case "tick":
      return done({ ...m, now: msg.now });
    case "online":
      return done({ ...m, online: msg.value });
    case "local-error":
      return done({ ...m, error: msg.error });
    case "rebase":
      return m.editor.kind !== "none" && m.data
        ? done({ ...m, error: "", editor: { ...m.editor, version: m.data.version } })
        : done(m);
    case "load":
      return m.pending ? done(m) : start({ kind: "load", id: m.next });
    case "code":
      return m.pending || m.retry
        ? done(m)
        : start({ kind: "code", id: m.next, teamId: msg.teamId });
    case "retry":
      return !m.pending && m.retry ? start({ ...m.retry, id: m.next }) : done(m);
    case "save":
      return m.pending || m.retry || !m.data
        ? done(m)
        : start({
            kind: "save",
            id: m.next,
            action: msg.action,
            commandId: msg.commandId,
            version: m.editor.kind === "none" ? m.data.version : m.editor.version,
          });
    case "coded":
    case "failed":
    case "loaded":
    case "saved": {
      if (!m.pending || m.pending.id !== msg.id) return done(m);

      if (msg.kind === "failed")
        return msg.status === 401
          ? update(m, { kind: "expired" })
          : done({
              ...m,
              pending: null,
              retry:
                m.pending.kind === "save" && (msg.status === 0 || msg.status >= 500)
                  ? m.pending
                  : null,
              screen: m.data ? "ready" : "loading",
              error: msg.error,
            });

      if (msg.kind === "loaded" && m.pending.kind === "load")
        return done({ ...accept(msg.data), pending: null });

      if (msg.kind === "saved" && m.pending.kind === "save")
        return done({
          ...accept(msg.data),
          pending: null,
          editor: { kind: "none" },
          notice: msg.notice,
          noticeId: msg.id,
          retry: null,
          code: null,
        });

      if (msg.kind === "coded" && m.pending.kind === "code")
        return done({
          ...m,
          pending: null,
          code:
            m.data &&
            msg.code.version >= m.data.version &&
            m.data.teams.some((t) => t.id === msg.code.teamId && t.role === "admin")
              ? msg.code
              : null,
          error:
            m.data && msg.code.version < m.data.version
              ? "Der Beitrittscode wurde inzwischen geändert. Bitte erneut öffnen."
              : "",
        });

      return done(m);
    }
  }
}

export function calendarTeam(events: CalendarEvent[], teamName?: string): string {
  const first = events[0];

  if (!first) return "";

  const common = [...new Set([first.home, first.away])].filter((name) =>
    events.every((event) => event.home === name || event.away === name),
  );

  return common.length === 1 ? common[0]! : (common.find((name) => name === teamName) ?? "");
}
