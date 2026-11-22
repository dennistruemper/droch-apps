import { createSignal, For, Show, onSettled } from "solid-js";
import type { User } from "@repo/shared/contracts/auth";
import { AppSettings } from "@repo/shared/settings";
import { SidePanel } from "@repo/shared/navigation";
import { snapshotSchema, type GameView, type Action, type Team } from "../contracts/index.ts";
import {
  formatWindow,
  instant,
  localInput,
  parseCalendar,
  playerReadiness,
  type CalendarEvent,
} from "../domain/index.ts";
import {
  init,
  update,
  emptyFields,
  type Message,
  type Editor,
  type Fields,
} from "./planner-model.ts";
import { execute } from "./planner-commands.ts";
import { ApiError, errorText } from "./api.ts";

const noticeDuration = 5000;

const states: Record<GameView["mine"], string> = {
  unanswered: "Noch keine Antwort",
  yes: "Verfügbar",
  no: "Nicht verfügbar",
  maybe: "Vielleicht",
  stale: "Bitte erneut antworten",
  pending: "Entscheidung offen",
  elsewhere: "Anderweitig zugesagt",
  committed: "Verbindlich zugesagt",
};

export function Planner(props: { user: User; logout: () => void }) {
  let current = init(Date.now());
  const [model, setModel] = createSignal(current);
  const controller = new AbortController();
  let openSettings = () => {};
  let noticeTimeout: ReturnType<typeof setTimeout> | undefined;

  function dispatch(msg: Message) {
    if (controller.signal.aborted) return;
    const previous = current;
    const next = update(current, msg);
    current = next.model;

    if (previous.notice !== current.notice || previous.noticeId !== current.noticeId) {
      clearTimeout(noticeTimeout);

      if (current.notice) {
        const id = current.noticeId;
        noticeTimeout = setTimeout(() => dispatch({ kind: "dismiss-notice", id }), noticeDuration);
      }
    }

    setModel(current);

    for (const effect of next.effects)
      void execute(effect, controller.signal)
        .then(dispatch)
        .catch((e) => {
          dispatch({
            kind: "failed",
            id: effect.id,
            error: errorText(e),
            status: e instanceof ApiError ? e.status : 0,
          });

          if (e instanceof ApiError && e.status === 409) dispatch({ kind: "load" });
        });
  }

  function save(action: Action) {
    dispatch({ kind: "save", action, commandId: crypto.randomUUID() });
  }

  const data = () => model().data;
  const busy = () => !!model().pending || !!model().retry;
  const team = (id: string) => data()?.teams.find((t) => t.id === id);
  const editor = () => model().editor;

  const editing = () => {
    const e = editor();

    return e.kind === "none" ? null : e;
  };

  const fields = () => editing()?.fields ?? emptyFields;
  const supportedTimezones = Intl.supportedValuesOf("timeZone");

  const timezones = () =>
    [...new Set(["Europe/Berlin", "UTC", fields().timezone, ...supportedTimezones])].sort();

  async function readCalendarFile(f: File | undefined) {
    dispatch({ kind: "calendar-start" });
    const editor = current.editor;

    if (!f || editor.kind !== "import") return;
    const editorId = current.editorId;

    const timezone = current.data?.teams.find((t) => t.id === editor.teamId)?.timezone;

    if (!timezone) return;

    try {
      if (f.size > 500000) throw new Error("Datei zu groß (maximal 500 KB).");
      const text = await f.text();
      const entries = parseCalendar(text, timezone);
      dispatch({ kind: "calendar", editorId, text, events: entries });
    } catch (error) {
      dispatch({
        kind: "calendar-failed",
        editorId,
        error: errorText(error),
      });
    }
  }

  const field = (key: keyof Fields, value: string) =>
    dispatch({ kind: "field", field: key, value });

  function open(kind: Exclude<Editor["kind"], "none">, teamId = "", gameId = "") {
    const snapshot = current.data;

    const t = snapshot?.teams.find((v) => v.id === teamId),
      g = snapshot?.games.find((v) => v.id === gameId);

    const f = {
      ...emptyFields,
      teamId,
      ...(t ? { name: t.name, club: t.club, needed: String(t.needed), timezone: t.timezone } : {}),
      ...(g
        ? {
            opponent: g.opponent,
            venue: g.venue,
            home: g.home ? "yes" : "no",
            start: localInput(g.window.start, t!.timezone),
            end: localInput(g.window.end, t!.timezone),
            buffer: String(g.window.buffer),
          }
        : {}),
    };

    dispatch({
      kind: "open",
      editor: {
        kind,
        teamId,
        gameId,
        version: snapshot?.version ?? 0,
        fields: f,
        calendar: "",
        events: [],
        selected: [],
      },
    });
  }

  function submitEditor() {
    const e = editing();

    if (!e) return;

    try {
      const f = e.fields;

      if (e.kind === "join") {
        save({ kind: "join", teamId: f.teamId.trim(), pin: f.pin.trim().toUpperCase() });

        return;
      }

      if (e.kind === "create-team" || e.kind === "settings") {
        const input = {
          name: f.name,
          club: f.club,
          needed: Number(f.needed),
          timezone: f.timezone,
        };

        save(
          e.kind === "settings"
            ? { kind: "settings", teamId: e.teamId, team: input }
            : { kind: "create-team", team: input },
        );

        return;
      }

      const target = e.kind === "game" && !e.gameId ? f.teamId : e.teamId;
      const t = team(target);

      if (!t) throw new Error("Bitte ein Team wählen.");

      if (e.kind === "import") {
        save({
          kind: "import",
          teamId: t.id,
          calendar: e.calendar,
          ownName: f.ownName,
          selected: e.selected,
        });

        return;
      }

      const window = {
        start: instant(f.start, t.timezone),
        end: instant(f.end, t.timezone),
        buffer: Number(f.buffer),
      };

      if (e.kind === "propose") {
        save({ kind: "propose", teamId: t.id, gameId: e.gameId, window });

        return;
      }

      const game = { opponent: f.opponent, venue: f.venue, home: f.home === "yes", window };
      save(
        e.gameId
          ? { kind: "edit-game", teamId: t.id, gameId: e.gameId, game }
          : { kind: "create-game", teamId: t.id, game },
      );
    } catch (e) {
      dispatch({ kind: "local-error", error: errorText(e) });
    }
  }

  onSettled(() => {
    const initial = current.pending!;
    void execute(initial, controller.signal)
      .then((msg) => {
        dispatch(msg);
        const params = new URLSearchParams(location.search);
        const pin = new URLSearchParams(location.hash.slice(1)).get("pin");

        if (params.get("team") && pin && current.data && !current.pending) {
          open("join");
          field("teamId", params.get("team")!);
          field("pin", pin);
          history.replaceState(null, "", location.pathname);
        }
      })
      .catch((e) =>
        dispatch({
          kind: "failed",
          id: initial.id,
          error: errorText(e),
          status: e instanceof ApiError ? e.status : 0,
        }),
      );
    const events = new EventSource("/api/kunludo/events");
    events.addEventListener("snapshot", (e) => {
      try {
        if (!(e instanceof MessageEvent) || typeof e.data !== "string")
          throw new Error("Invalid snapshot event");
        dispatch({
          kind: "snapshot",
          data: snapshotSchema.parse(JSON.parse(e.data)),
        });
        dispatch({ kind: "online", value: true });
      } catch {
        dispatch({ kind: "local-error", error: "Aktualisierung fehlgeschlagen." });
      }
    });
    events.addEventListener("expired", () => {
      events.close();
      dispatch({ kind: "expired" });
    });
    events.onerror = () => dispatch({ kind: "online", value: false });
    const tick = setInterval(() => dispatch({ kind: "tick", now: Date.now() }), 30000);

    const visible = () => {
      if (!document.hidden) dispatch({ kind: "load" });
    };

    document.addEventListener("visibilitychange", visible);

    return () => {
      controller.abort();
      events.close();
      clearInterval(tick);
      clearTimeout(noticeTimeout);
      document.removeEventListener("visibilitychange", visible);
    };
  });

  const filtered = () =>
    data()?.games.filter((g) => !model().filter.length || model().filter.includes(g.teamId)) ?? [];

  const upcoming = () => filtered().filter((g) => g.window.end >= model().now && !g.cancelled);

  const past = () =>
    filtered()
      .filter((g) => g.window.end < model().now || g.cancelled)
      .toReversed();

  const adminTeams = () => data()?.teams.filter((t) => t.role === "admin") ?? [];

  function remove(t: Team, uid: string, name: string) {
    if (confirm(`${name} aus „${t.name}“ entfernen? Der Team-PIN wird geändert.`))
      save({ kind: "remove", teamId: t.id, userId: uid });
  }

  function codeLink() {
    const c = model().code;

    return c ? `${location.origin}/kunludo/?team=${encodeURIComponent(c.teamId)}#pin=${c.pin}` : "";
  }

  const [copied, setCopied] = createSignal(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(codeLink());
      setCopied(true);
    } catch {
      dispatch({
        kind: "local-error",
        error: "Kopieren nicht möglich. Markiere den Code zum Kopieren.",
      });
    }
  }

  function importLabel(event: CalendarEvent) {
    const e = editing();

    if (!e) return "";

    if (e.fields.ownName && event.home !== e.fields.ownName && event.away !== e.fields.ownName)
      return "Anderes Team – bitte abwählen";
    const old = data()?.games.find((g) => g.teamId === e.teamId && g.calendarUid === event.uid);

    if (event.cancelled) return old?.cancelled ? "Bereits abgesagt" : "Abgesagt – wird übernommen";

    if (!old) return "Neu";

    return old.window.start !== event.start ||
      old.window.end !== event.end ||
      old.venue !== event.venue
      ? "Zeit / Ort geändert – neue Antworten nötig"
      : "Bereits vorhanden";
  }

  const label = () =>
    ({
      "create-team": "Team erstellen",
      join: "Team beitreten",
      settings: "Team bearbeiten",
      game: editing()?.gameId ? "Spiel bearbeiten" : "Spiel hinzufügen",
      import: "Kalender importieren",
      propose: "Termin vorschlagen",
      none: "",
    })[editor().kind];

  return (
    <>
      <AppSettings
        appId="kunludo"
        trigger={(fn) => {
          openSettings = fn;

          return null;
        }}
      />
      <SidePanel
        appId="kunludo"
        label="Kunludo Menü"
        menu={(panel) => (
          <nav data-panel-navigation aria-label="Navigation">
            <button
              onClick={() => {
                dispatch({ kind: "view", view: "games" });
                panel.dismiss();
              }}
            >
              Spiele
            </button>
            <button
              onClick={() => {
                dispatch({ kind: "view", view: "teams" });
                panel.dismiss();
              }}
            >
              Teams
            </button>
            <button
              onClick={() => {
                openSettings();
                panel.dismiss();
              }}
            >
              Einstellungen
            </button>
            <hr />
            <button onClick={props.logout}>Abmelden</button>
            <a data-panel-return href="/">
              ← Alle Apps
            </a>
          </nav>
        )}
      >
        {(panel) => (
          <div class="zs-shell">
            <header class="zs-header">
              {panel.trigger()}
              <a href="/kunludo/" class="zs-brand">
                Kunludo
              </a>
              <span class="zs-account">{props.user.name}</span>
            </header>
            <main class="zs-main">
              <Show
                when={model().screen !== "expired"}
                fallback={
                  <section>
                    <h1>Bitte erneut anmelden.</h1>
                    <a href="/kunludo/">Zur Anmeldung</a>
                  </section>
                }
              >
                <h1>{model().view === "games" ? "Spiele" : "Teams"}</h1>
                <div class="zs-tabs" role="group" aria-label="Ansicht">
                  <button
                    aria-pressed={model().view === "games" ? "true" : "false"}
                    onClick={() => dispatch({ kind: "view", view: "games" })}
                  >
                    Spiele
                  </button>
                  <button
                    aria-pressed={model().view === "teams" ? "true" : "false"}
                    onClick={() => dispatch({ kind: "view", view: "teams" })}
                  >
                    Teams
                  </button>
                </div>
                <Show when={model().view === "teams" || data()?.teams.length === 0}>
                  <div class="zs-actions zs-team-actions">
                    <button class="secondary" disabled={busy()} onClick={() => open("join")}>
                      Team beitreten
                    </button>
                    <button disabled={busy()} onClick={() => open("create-team")}>
                      Team erstellen
                    </button>
                  </div>
                </Show>
                <Show when={!model().online}>
                  <p class="zs-banner" role="status">
                    Verbindung unterbrochen. Deine Ansicht wird beim Wiederverbinden aktualisiert.
                  </p>
                </Show>
                <Show when={model().error}>
                  <div class="zs-banner" role="alert">
                    {model().error}
                    <Show when={model().retry}>
                      <button
                        disabled={!!model().pending}
                        onClick={() => dispatch({ kind: "retry" })}
                      >
                        Anfrage erneut senden
                      </button>
                    </Show>{" "}
                    <button disabled={busy()} onClick={() => dispatch({ kind: "load" })}>
                      Aktualisieren
                    </button>
                  </div>
                </Show>
                <Show when={model().notice}>
                  <div role="status" aria-live="polite" aria-atomic="true" class="zs-toast">
                    <span>{model().notice}</span>
                    <button
                      type="button"
                      aria-label="Meldung schließen"
                      onClick={() => dispatch({ kind: "dismiss-notice", id: model().noticeId })}
                    >
                      ×
                    </button>
                    <For each={[model().noticeId]}>
                      {() => (
                        <div
                          aria-hidden="true"
                          class="zs-toast-countdown"
                          style={{ "--toast-duration": `${noticeDuration}ms` }}
                        />
                      )}
                    </For>
                  </div>
                </Show>
                <Show when={model().code}>
                  <section class="zs-code" aria-label="Beitrittscode">
                    <h2>Beitrittscode</h2>
                    <p>
                      <strong>Team-ID</strong>
                      <br />
                      <code>{model().code?.teamId}</code>
                    </p>
                    <p>
                      <strong>PIN</strong>
                      <br />
                      <code class="zs-pin">{model().code?.pin}</code>
                    </p>
                    <button onClick={() => void copyCode()}>
                      {copied() ? "Link kopiert" : "Einladungslink kopieren"}
                    </button>
                    <button class="secondary" onClick={() => dispatch({ kind: "close" })}>
                      Schließen
                    </button>
                  </section>
                </Show>
                <Show when={editing()}>
                  <section class="zs-editor" aria-label={label()}>
                    <div class="zs-row">
                      <h2>{label()}</h2>
                      <button
                        type="button"
                        class="secondary"
                        disabled={busy()}
                        onClick={() => dispatch({ kind: "close" })}
                      >
                        Schließen
                      </button>
                    </div>
                    <Show when={editing()?.version !== data()?.version}>
                      <p class="zs-banner">
                        Die Teamdaten wurden inzwischen geändert. Dein Entwurf ist erhalten.
                      </p>
                      <button disabled={busy()} onClick={() => dispatch({ kind: "rebase" })}>
                        Aktuellen Stand übernehmen
                      </button>
                    </Show>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        submitEditor();
                      }}
                    >
                      <fieldset disabled={busy()}>
                        <Show
                          when={editor().kind === "create-team" || editor().kind === "settings"}
                        >
                          <label for="zs-team-name">Teamname</label>
                          <input
                            id="zs-team-name"
                            value={fields().name}
                            onInput={(e) => field("name", e.currentTarget.value)}
                            required
                            maxlength="100"
                          />
                          <label for="zs-club">Verein / Kategorie (optional)</label>
                          <input
                            id="zs-club"
                            value={fields().club}
                            onInput={(e) => field("club", e.currentTarget.value)}
                            maxlength="100"
                          />
                          <div class="zs-form-grid">
                            <div>
                              <label for="zs-needed">Benötigte Spieler</label>
                              <input
                                id="zs-needed"
                                type="number"
                                min="1"
                                max="100"
                                required
                                value={fields().needed}
                                onInput={(e) => field("needed", e.currentTarget.value)}
                              />
                            </div>
                            <div>
                              <label for="zs-tz">Zeitzone</label>
                              <select
                                id="zs-tz"
                                required
                                value={fields().timezone}
                                onChange={(e) => field("timezone", e.currentTarget.value)}
                              >
                                <For each={timezones()}>
                                  {(timezone) => <option value={timezone}>{timezone}</option>}
                                </For>
                              </select>
                            </div>
                          </div>
                        </Show>
                        <Show when={editor().kind === "join"}>
                          <label for="zs-group-id">Team-ID</label>
                          <input
                            id="zs-group-id"
                            required
                            maxlength="80"
                            value={fields().teamId}
                            onInput={(e) => field("teamId", e.currentTarget.value)}
                          />
                          <label for="zs-group-pin">Team-PIN</label>
                          <input
                            id="zs-group-pin"
                            required
                            pattern="[A-Za-z0-9]{6}"
                            maxlength="6"
                            autocomplete="off"
                            value={fields().pin}
                            onInput={(e) => field("pin", e.currentTarget.value)}
                          />
                        </Show>
                        <Show when={editor().kind === "game" && !editing()?.gameId}>
                          <label for="zs-game-team">Team</label>
                          <select
                            id="zs-game-team"
                            required
                            value={fields().teamId}
                            onChange={(e) => field("teamId", e.currentTarget.value)}
                          >
                            <For each={adminTeams()} keyed={(t) => t.id}>
                              {(t) => <option value={t().id}>{t().name}</option>}
                            </For>
                          </select>
                        </Show>
                        <Show when={editor().kind === "game"}>
                          <label for="zs-opponent">Gegner</label>
                          <input
                            id="zs-opponent"
                            required
                            maxlength="100"
                            value={fields().opponent}
                            onInput={(e) => field("opponent", e.currentTarget.value)}
                          />
                          <label for="zs-venue">Spielort</label>
                          <input
                            id="zs-venue"
                            maxlength="200"
                            value={fields().venue}
                            onInput={(e) => field("venue", e.currentTarget.value)}
                          />
                          <label for="zs-home">Heim / Auswärts</label>
                          <select
                            id="zs-home"
                            value={fields().home}
                            onChange={(e) => field("home", e.currentTarget.value)}
                          >
                            <option value="yes">Heimspiel</option>
                            <option value="no">Auswärtsspiel</option>
                          </select>
                        </Show>
                        <Show when={editor().kind === "game" || editor().kind === "propose"}>
                          <p>
                            Zeiten in{" "}
                            {team(fields().teamId || editing()?.teamId || "")?.timezone ??
                              "Europe/Berlin"}
                          </p>
                          <div class="zs-form-grid">
                            <div>
                              <label for="zs-start">Beginn</label>
                              <input
                                id="zs-start"
                                type="datetime-local"
                                required
                                value={fields().start}
                                onInput={(e) => field("start", e.currentTarget.value)}
                              />
                            </div>
                            <div>
                              <label for="zs-end">Geplantes Ende</label>
                              <input
                                id="zs-end"
                                type="datetime-local"
                                required
                                value={fields().end}
                                onInput={(e) => field("end", e.currentTarget.value)}
                              />
                            </div>
                          </div>
                          <label for="zs-buffer">Puffer vor und nach dem Spiel (Minuten)</label>
                          <input
                            id="zs-buffer"
                            type="number"
                            min="0"
                            max="360"
                            required
                            value={fields().buffer}
                            onInput={(e) => field("buffer", e.currentTarget.value)}
                          />
                          <Show when={editing()?.gameId && editor().kind === "game"}>
                            <small>Änderungen an Zeit oder Ort erfordern neue Antworten.</small>
                          </Show>
                        </Show>
                        <Show when={editor().kind === "import"}>
                          <label for="zs-ics">iCalendar-Datei (.ics)</label>
                          <input
                            id="zs-ics"
                            type="file"
                            accept=".ics,text/calendar"
                            onChange={(e) => void readCalendarFile(e.currentTarget.files?.[0])}
                          />
                          <Show when={editing()?.events.length}>
                            <Show when={!fields().ownName}>
                              <p role="alert">
                                Kein eindeutiges Team erkannt. Bitte importiere einen Spielplan, in
                                dem dein Team in jedem Spiel vorkommt.
                              </p>
                            </Show>
                            <p>
                              {editing()?.events.length} Spiele gefunden ·{" "}
                              {editing()?.selected.length} ausgewählt
                            </p>
                            <p>
                              Vorhandene Spiele werden über ihre Kalender-ID abgeglichen. Fehlende
                              Spiele bleiben erhalten.
                            </p>
                            <div class="zs-import-list">
                              <For each={editing()?.events ?? []} keyed={(e) => e.uid}>
                                {(e) => (
                                  <label class="zs-import-row">
                                    <input
                                      type="checkbox"
                                      checked={editing()?.selected.includes(e().uid)}
                                      onChange={() => dispatch({ kind: "select", uid: e().uid })}
                                    />
                                    <span>
                                      <strong>{e().summary}</strong>
                                      <small>{importLabel(e())}</small>
                                      <small>
                                        {formatWindow(
                                          { start: e().start, end: e().end, buffer: 0 },
                                          team(editing()!.teamId)!.timezone,
                                        )}
                                      </small>
                                    </span>
                                  </label>
                                )}
                              </For>
                            </div>
                          </Show>
                        </Show>
                        <button
                          disabled={
                            (editor().kind === "import" &&
                              (!editing()?.selected.length || !fields().ownName)) ||
                            editing()?.version !== data()?.version
                          }
                        >
                          {editor().kind === "import"
                            ? "Ausgewählte Spiele importieren"
                            : editor().kind === "join"
                              ? "Beitreten"
                              : "Speichern"}
                        </button>
                      </fieldset>
                    </form>
                  </section>
                </Show>
                <Show when={model().screen === "loading" && !data()}>
                  <p>Lädt…</p>
                </Show>
                <Show when={data()?.teams.length === 0}>
                  <section class="zs-empty">
                    <h2>Dein erstes Team wartet.</h2>
                    <p>Tritt mit Team-ID und PIN bei oder erstelle ein Team.</p>
                  </section>
                </Show>
                <Show when={model().view === "teams"}>
                  <div class="zs-teams">
                    <For each={data()?.teams ?? []} keyed={(t) => t.id}>
                      {(t) => (
                        <article class="zs-team" data-testid="team-card">
                          <div class="zs-row">
                            <div>
                              <span class="zs-eyebrow">
                                {t().role === "admin" ? "Admin" : "Mitglied"}
                              </span>
                              <h2>{t().name}</h2>
                              <p>{t().club}</p>
                            </div>
                            <span>{t().members.length} Mitglieder</span>
                          </div>
                          <Show when={t().role === "admin"}>
                            <div class="zs-actions">
                              <button
                                class="secondary"
                                disabled={busy()}
                                onClick={() => {
                                  setCopied(false);
                                  dispatch({ kind: "code", teamId: t().id });
                                }}
                              >
                                Beitrittscode
                              </button>
                              <button
                                class="secondary"
                                disabled={busy()}
                                onClick={() => open("settings", t().id)}
                              >
                                Team bearbeiten
                              </button>
                              <button
                                class="secondary"
                                disabled={busy()}
                                onClick={() => open("import", t().id)}
                              >
                                Kalender importieren
                              </button>
                              <button
                                class="secondary"
                                disabled={busy()}
                                onClick={() => {
                                  if (confirm("Bisherigen Beitrittscode ungültig machen?"))
                                    save({ kind: "rotate", teamId: t().id });
                                }}
                              >
                                PIN ändern
                              </button>
                            </div>
                          </Show>
                          <ul class="zs-roster">
                            <For each={t().members} keyed={(m) => m.id}>
                              {(m) => (
                                <li>
                                  <span>
                                    <strong>{m().name}</strong>
                                    <small>
                                      {m().role === "admin" ? "Admin" : "Mitglied"}
                                      {m().id === props.user.id ? " · Du" : ""}
                                    </small>
                                  </span>
                                  <Show when={t().role === "admin"}>
                                    <div class="zs-actions">
                                      <Show when={m().role !== "admin"}>
                                        <button
                                          class="secondary"
                                          disabled={busy()}
                                          onClick={() =>
                                            save({
                                              kind: "promote",
                                              teamId: t().id,
                                              userId: m().id,
                                            })
                                          }
                                        >
                                          Zum Admin ernennen
                                        </button>
                                      </Show>
                                      <button
                                        class="secondary"
                                        disabled={
                                          busy() ||
                                          (m().role === "admin" &&
                                            t().members.filter((v) => v.role === "admin").length ===
                                              1)
                                        }
                                        onClick={() => remove(t(), m().id, m().name)}
                                      >
                                        Entfernen
                                      </button>
                                    </div>
                                  </Show>
                                </li>
                              )}
                            </For>
                          </ul>
                        </article>
                      )}
                    </For>
                  </div>
                </Show>
                <Show when={model().view === "games"}>
                  <div class="zs-row">
                    <div class="zs-filters" role="group" aria-label="Teams filtern">
                      <Show when={(data()?.teams.length ?? 0) > 1}>
                        <button
                          aria-pressed={model().filter.length === 0 ? "true" : "false"}
                          onClick={() => dispatch({ kind: "clear-filter" })}
                        >
                          Alle Teams
                        </button>
                        <For each={data()?.teams ?? []} keyed={(t) => t.id}>
                          {(t) => (
                            <button
                              aria-pressed={model().filter.includes(t().id) ? "true" : "false"}
                              onClick={() => dispatch({ kind: "filter", teamId: t().id })}
                            >
                              {t().name}
                            </button>
                          )}
                        </For>
                      </Show>
                    </div>
                    <Show when={adminTeams().length}>
                      <button disabled={busy()} onClick={() => open("game", adminTeams()[0]!.id)}>
                        Spiel hinzufügen
                      </button>
                    </Show>
                  </div>
                  <section aria-label="Kommende Spiele" class="zs-games">
                    <For
                      each={upcoming()}
                      keyed={(g) => g.id}
                      fallback={
                        <Show when={(data()?.teams.length ?? 0) > 0}>
                          <p class="zs-empty">
                            Keine kommenden Spiele. Lade im Team einen Kalender hoch oder füge ein
                            Spiel hinzu.
                          </p>
                        </Show>
                      }
                    >
                      {(g) => (
                        <GameCard
                          game={g()}
                          team={team(g().teamId)!}
                          allGames={data()?.games ?? []}
                          allTeams={data()?.teams ?? []}
                          busy={busy()}
                          now={model().now}
                          userId={props.user.id}
                          save={save}
                          open={open}
                        />
                      )}
                    </For>
                  </section>
                  <Show when={past().length}>
                    <details class="zs-past">
                      <summary>Vergangene und abgesagte Spiele ({past().length})</summary>
                      <For each={past()} keyed={(g) => g.id}>
                        {(g) => (
                          <GameCard
                            game={g()}
                            team={team(g().teamId)!}
                            allGames={data()?.games ?? []}
                            allTeams={data()?.teams ?? []}
                            busy={true}
                            now={model().now}
                            userId={props.user.id}
                            save={save}
                            open={open}
                          />
                        )}
                      </For>
                    </details>
                  </Show>
                </Show>
              </Show>
            </main>
          </div>
        )}
      </SidePanel>
    </>
  );
}

function GameCard(props: {
  game: GameView;
  team: Team;
  allGames: GameView[];
  allTeams: Team[];
  busy: boolean;
  userId: string;
  now: number;
  save: (action: Action) => void;
  open: (kind: Exclude<Editor["kind"], "none">, teamId?: string, gameId?: string) => void;
}) {
  const g = () => props.game,
    t = () => props.team;

  const readiness = () => playerReadiness(g().ready, g().needed, g().window.start, props.now);

  const act = (kind: "commit" | "release" | "cancel") =>
    props.save({ kind, teamId: t().id, gameId: g().id });

  const answer = (answer: "yes" | "maybe" | "no") =>
    props.save({ kind: "answer", teamId: t().id, gameId: g().id, answer });

  const responseGroups = () =>
    (["committed", "yes", "pending", "maybe", "no", "elsewhere", "stale", "unanswered"] as const)
      .map((state) => ({
        state,
        members: g()
          .members.filter((member) => member.state === state)
          .sort((a, b) => a.name.localeCompare(b.name, "de")),
      }))
      .filter((group) => group.members.length > 0);

  return (
    <article class="zs-game" data-testid="game-card" data-game-id={g().id}>
      <div class="zs-game-top">
        <span class="zs-team-label">{t().name}</span>
        <span class="zs-muted">
          {g().home ? "Heim" : "Auswärts"} <span aria-hidden="true">{g().home ? "🏠" : "🚗"}</span>
          {g().cancelled ? " · Abgesagt" : ""}
        </span>
      </div>
      <div class="zs-row">
        <div>
          <h2>
            <Show when={!g().cancelled && g().window.end >= props.now}>
              <span role="img" aria-label={readiness().label} title={readiness().label}>
                {readiness().icon}
              </span>{" "}
            </Show>
            {g().opponent}
          </h2>
          <p class="zs-date">{formatWindow(g().window, t().timezone)}</p>
          <Show when={g().venue}>
            <p class="zs-muted">{g().venue}</p>
          </Show>
        </div>
        <div class="zs-readiness">
          <strong>
            {g().ready}
            <span> / {g().needed}</span>
          </strong>
          <small>sicher verfügbar</small>
          <small>{g().uncertain} noch offen</small>
        </div>
      </div>
      <Show when={g().notice}>
        <p class="zs-change">{g().notice}</p>
      </Show>
      <div class="zs-answer-row">
        <span class="zs-status" data-state={g().mine}>
          {states[g().mine]}
        </span>
        <div role="group" aria-label="Deine Verfügbarkeit" class="zs-answer-buttons">
          <button
            disabled={props.busy}
            aria-pressed={g().mine === "yes" || g().mine === "committed" ? "true" : "false"}
            onClick={() => answer("yes")}
          >
            Ja
          </button>
          <button
            disabled={props.busy}
            aria-pressed={g().mine === "maybe" ? "true" : "false"}
            onClick={() => answer("maybe")}
          >
            Vielleicht
          </button>
          <button
            disabled={props.busy}
            aria-pressed={g().mine === "no" ? "true" : "false"}
            onClick={() => answer("no")}
          >
            Nein
          </button>
        </div>
      </div>
      <Show when={g().conflicts.length || g().sameDay.length}>
        <details class="zs-conflict">
          <summary>
            {g().conflicts.length ? "⚑ Terminkonflikt prüfen" : "↔ Weiteres Spiel am selben Tag"}
          </summary>
          <p>
            {g().conflicts.length
              ? "Die geplanten Zeiten überschneiden sich einschließlich Zeitpuffer. Wähle, für welches Team du zusagst."
              : "Prüfe Spielzeiten und Anreise."}
          </p>
          <p>Dieses Spiel: {g().window.buffer} Min. Puffer vor und nach dem Spiel.</p>
          <For
            each={props.allGames.filter((o) =>
              (g().conflicts.length ? g().conflicts : g().sameDay).includes(o.id),
            )}
            keyed={(o) => o.id}
          >
            {(o) => (
              <div class="zs-other">
                <strong>
                  {props.allTeams.find((v) => v.id === o().teamId)?.name} · {o().opponent}
                </strong>
                <small>
                  {formatWindow(
                    o().window,
                    props.allTeams.find((v) => v.id === o().teamId)!.timezone,
                  )}
                </small>
                <small>
                  {states[o().mine]} · {o().ready}/{o().needed} verfügbar
                </small>
                <Show when={g().conflicts.length}>
                  <button
                    class="secondary"
                    disabled={props.busy}
                    onClick={() =>
                      props.save({ kind: "commit", teamId: o().teamId, gameId: o().id })
                    }
                  >
                    Für dieses andere Team zusagen
                  </button>
                </Show>
              </div>
            )}
          </For>
          <Show when={g().conflicts.length}>
            <Show
              when={g().committed}
              fallback={
                <button disabled={props.busy} onClick={() => act("commit")}>
                  Hier verbindlich zusagen
                </button>
              }
            >
              <button class="secondary" disabled={props.busy} onClick={() => act("release")}>
                Zusage aufheben
              </button>
            </Show>
          </Show>
        </details>
      </Show>
      <div class="zs-actions zs-game-actions">
        <button
          class="secondary"
          disabled={props.busy}
          onClick={() => props.open("propose", t().id, g().id)}
        >
          Termin vorschlagen
        </button>
        <Show when={t().role === "admin"}>
          <button
            class="secondary"
            disabled={props.busy}
            onClick={() => props.open("game", t().id, g().id)}
          >
            Bearbeiten
          </button>
          <button
            class="secondary"
            disabled={props.busy}
            onClick={() => {
              if (confirm("Spiel absagen?")) act("cancel");
            }}
          >
            Absagen
          </button>
        </Show>
      </div>
      <details class="zs-details">
        <summary>Antworten ansehen</summary>
        <For each={responseGroups()} keyed={(group) => group.state}>
          {(group) => (
            <section class="zs-response-group" aria-label={states[group().state]}>
              <h3>
                {states[group().state]} · {group().members.length}
              </h3>
              <ul class="zs-roster">
                <For each={group().members} keyed={(m) => m.id}>
                  {(m) => (
                    <li>
                      <span>
                        <strong>{m().name}</strong>
                        <Show when={m().reserve}>
                          <small>Ersatz</small>
                        </Show>
                      </span>
                      <Show when={t().role === "admin"}>
                        <div class="zs-player-actions">
                          <select
                            aria-label={`Antwort für ${m().name}`}
                            disabled={props.busy}
                            value={
                              ["yes", "committed", "pending", "elsewhere"].includes(m().state)
                                ? "yes"
                                : ["maybe", "no"].includes(m().state)
                                  ? m().state
                                  : ""
                            }
                            onChange={(e) => {
                              const value = e.currentTarget.value;

                              if (value === "yes" || value === "maybe" || value === "no")
                                props.save({
                                  kind: "set-answer",
                                  teamId: t().id,
                                  gameId: g().id,
                                  userId: m().id,
                                  answer: value,
                                });
                            }}
                          >
                            <option value="" disabled>
                              {states[m().state]}
                            </option>
                            <option value="yes">Ja</option>
                            <option value="maybe">Vielleicht</option>
                            <option value="no">Nein</option>
                          </select>
                          <button
                            class="secondary"
                            disabled={props.busy}
                            onClick={() =>
                              props.save({
                                kind: "reserve",
                                teamId: t().id,
                                gameId: g().id,
                                userId: m().id,
                                add: !m().reserve,
                              })
                            }
                          >
                            {m().reserve ? "Ersatz aufheben" : "Als Ersatz markieren"}
                          </button>
                        </div>
                      </Show>
                    </li>
                  )}
                </For>
              </ul>
            </section>
          )}
        </For>
      </details>
      <For each={g().proposals} keyed={(p) => p.id}>
        {(p) => (
          <section class="zs-proposal">
            <h3>Terminvorschlag</h3>
            <p>{formatWindow(p().window, t().timezone)}</p>
            <p>
              {p().yes} Ja · {p().maybe} Vielleicht · {p().no} Nein
            </p>
            <div class="zs-actions">
              <For each={["yes", "maybe", "no"] as const}>
                {(a) => (
                  <button
                    class="secondary"
                    aria-pressed={p().mine === a ? "true" : "false"}
                    disabled={props.busy}
                    onClick={() =>
                      props.save({
                        kind: "vote",
                        teamId: t().id,
                        gameId: g().id,
                        proposalId: p().id,
                        answer: a,
                      })
                    }
                  >
                    {a === "yes" ? "Ja" : a === "no" ? "Nein" : "Vielleicht"}
                  </button>
                )}
              </For>
              <Show when={t().role === "admin"}>
                <button
                  disabled={props.busy}
                  onClick={() => {
                    if (confirm("Termin übernehmen? Alle müssen erneut antworten."))
                      props.save({
                        kind: "adopt",
                        teamId: t().id,
                        gameId: g().id,
                        proposalId: p().id,
                      });
                  }}
                >
                  Termin übernehmen
                </button>
              </Show>
            </div>
          </section>
        )}
      </For>
    </article>
  );
}
