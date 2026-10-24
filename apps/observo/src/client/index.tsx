import { render } from "@solidjs/web";
import { createSignal, For, onSettled, Show } from "solid-js";
import { AppSettings } from "@repo/shared/settings";
import "@repo/shared/styles";
import "./styles.css";
import { appDefinition, type Dashboard, type Latest, type Reason } from "../contracts/index.ts";
import { hourDuration, hourStart, interval, oldestHour, summarize } from "../domain/index.ts";
import { init, update, type Message } from "./dashboard-model.ts";
import { execute } from "./dashboard-commands.ts";

const statusNames = {
  available: "Available",
  degraded: "Degraded",
  "mostly-unavailable": "Mostly unavailable",
  unknown: "Unknown",
  "in-progress": "In progress",
  unreachable: "Unreachable",
  "not-functional": "Not functional",
  missing: "Missing",
} as const;
const reasons: Record<Reason, string> = {
  ok: "Check passed",
  "http-error": "Website returned an HTTP error",
  "network-error": "Connection or certificate failed",
  timeout: "Website did not respond in time",
  "workflow-failed": "Website responded, but the browser workflow did not complete",
  "verification-required": "Human verification required; functionality cannot be verified",
  "redirect-blocked": "Navigation outside the configured website was blocked",
};
const timestamp = (time: number) =>
  new Date(time).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const hourLabel = (hour: number) =>
  new Date(hour).toLocaleString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
    hour12: false,
  });
function latestLabel(latest: Latest | null, now: number) {
  return !latest
    ? "Waiting for first check"
    : now - latest.slot >= interval * 2
      ? "Unknown · check overdue"
      : statusNames[latest.outcome];
}
function SiteCard(props: {
  site: Dashboard["sites"][number];
  now: number;
  dayOffset: number;
  selected: number | null;
  select: (hour: number) => void;
}) {
  const end = () => hourStart(props.now) - props.dayOffset * 24 * hourDuration;
  const visible = () =>
    Array.from({ length: 24 }, (_, index) => end() - (23 - index) * hourDuration).filter(
      (hour) => hour >= oldestHour(props.now),
    );
  const packed = (hour: number) =>
    props.site.hours.find((entry) => entry.hour === hour)?.slots ?? 0;
  const summary = (hour: number) => summarize(packed(hour), hour, props.now);
  const selected = () => (props.selected === null ? null : summary(props.selected));
  return (
    <article class="observo-site">
      <div class="observo-heading">
        <h2>
          <a href={props.site.url} target="_blank" rel="noreferrer">
            {props.site.name}
          </a>
        </h2>
        <strong>{latestLabel(props.site.latest, props.now)}</strong>
      </div>
      <p>{props.site.description}</p>
      <Show when={props.site.latest}>
        {(latest) => (
          <p class="observo-latest">
            {reasons[latest().reason]}
            {latest().statusCode ? ` · HTTP ${latest().statusCode}` : ""} ·{" "}
            {timestamp(latest().checkedAt)} · {(latest().durationMs / 1000).toFixed(1)} s
          </p>
        )}
      </Show>
      <section class="observo-status-panel" aria-label={`${props.site.name} availability history`}>
        <div class="observo-range">
          <span>{timestamp(visible()[0] ?? end())}</span>
          <span>{timestamp(end() + hourDuration)}</span>
        </div>
        <div class="observo-hours" role="group" aria-label="Hourly availability">
          <For each={visible()}>
            {(hour) => (
              <button
                type="button"
                data-status={summary(hour).status}
                aria-pressed={props.selected === hour ? "true" : "false"}
                aria-label={`${timestamp(hour)}: ${statusNames[summary(hour).status]}, ${summary(hour).passed} passed, ${summary(hour).failed} failed, ${summary(hour).missing} missing`}
                title={`${hourLabel(hour)} · ${statusNames[summary(hour).status]} · ${summary(hour).passed}/12 passed`}
                onClick={() => props.select(hour)}
              >
                <span>{hourLabel(hour).split(" ")[0]}</span>
                <b>
                  {summary(hour).status === "available"
                    ? "✓"
                    : summary(hour).status === "degraded"
                      ? "!"
                      : summary(hour).status === "mostly-unavailable"
                        ? "×"
                        : summary(hour).status === "in-progress"
                          ? "…"
                          : "?"}
                </b>
              </button>
            )}
          </For>
        </div>
        <ul class="observo-legend" aria-label="Status legend">
          <li>
            <i data-status="available" />
            Available · 12/12 pass
          </li>
          <li>
            <i data-status="degraded" />
            Degraded · 1–6 fail
          </li>
          <li>
            <i data-status="mostly-unavailable" />
            Mostly unavailable · 7–12 fail
          </li>
          <li>
            <i data-status="unknown" />
            Unknown · missing checks
          </li>
          <li>
            <i data-status="in-progress" />
            In progress
          </li>
        </ul>
        <Show when={selected()}>
          {(value) => (
            <div class="observo-detail" aria-live="polite">
              <h3>
                {props.selected === null
                  ? ""
                  : `${timestamp(props.selected)} (${hourLabel(props.selected)})`}{" "}
                · {statusNames[value().status]}
              </h3>
              <p>
                {value().passed} passed · {value().failed} failed · {value().missing} missing
                {value().status === "in-progress" ? " · hour still in progress" : ""}
              </p>
              <ol class="observo-slots" aria-label="Five-minute checks">
                <For each={value().slots}>
                  {(slot, index) => (
                    <li data-outcome={slot}>
                      <strong>:{String(index() * 5).padStart(2, "0")}</strong>
                      <span>
                        {props.selected !== null && props.selected + index() * interval > props.now
                          ? "Upcoming"
                          : slot === "unreachable"
                            ? "Offline"
                            : slot === "not-functional"
                              ? "Failed"
                              : statusNames[slot]}
                      </span>
                    </li>
                  )}
                </For>
              </ol>
            </div>
          )}
        </Show>
      </section>
    </article>
  );
}
function App() {
  let current = init();
  const [model, setModel] = createSignal(current);
  const controller = new AbortController();
  async function dispatch(message: Message): Promise<void> {
    if (controller.signal.aborted) return;
    const transition = update(current, message);
    current = transition.model;
    setModel(current);
    for (const command of transition.commands) {
      try {
        await dispatch(await execute(command, controller.signal));
      } catch {
        await dispatch({
          kind: "failed",
          id: command.id,
          error: "Could not refresh monitoring data. Previously loaded results may be out of date.",
        });
      }
    }
  }
  onSettled(() => {
    const refresh = () => {
      if (!document.hidden) void dispatch({ kind: "refresh" });
    };
    refresh();
    const timer = setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  });
  const error = () => {
    const request = model().request;
    return request.kind === "failed" ? request.error : "";
  };
  return (
    <>
      <header>
        <strong>Observo</strong>
        <nav aria-label="App navigation">
          <a href="/">All apps</a>
          <AppSettings appId={appDefinition.id} defaultTheme={appDefinition.theme} />
        </nav>
      </header>
      <main>
        <section>
          <p class="observo-eyebrow">A small watch on the web</p>
          <h1>Is it working?</h1>
          <p>
            A real browser checks every five minutes. Explore each hour, with just 30 days of
            history.
          </p>
          <p>
            <small>
              Checks run from this server and can miss brief outages. Missing observations remain
              unknown.
            </small>
          </p>
        </section>
        <Show when={error()}>
          <p role="alert">{error()}</p>
        </Show>
        <div class="observo-controls">
          <div role="group" aria-label="History navigation">
            <button
              type="button"
              disabled={model().dayOffset >= 29}
              onClick={() => void dispatch({ kind: "day", offset: current.dayOffset + 1 })}
            >
              ← Older
            </button>
            <button
              type="button"
              disabled={model().dayOffset === 0}
              onClick={() => void dispatch({ kind: "day", offset: current.dayOffset - 1 })}
            >
              Newer →
            </button>
            <button
              type="button"
              disabled={model().dayOffset === 0}
              onClick={() => void dispatch({ kind: "day", offset: 0 })}
            >
              Latest
            </button>
          </div>
          <button
            type="button"
            disabled={model().request.kind === "loading"}
            onClick={() => void dispatch({ kind: "refresh" })}
          >
            {model().request.kind === "loading" ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        <Show
          when={model().data}
          fallback={
            <p role="status">
              {error() ? "Monitoring data is unavailable." : "Loading monitoring data…"}
            </p>
          }
        >
          {(data) => (
            <>
              <Show when={!data().checksEnabled}>
                <p role="status">Checks are disabled in this environment.</p>
              </Show>
              <p>
                <small>
                  Updated {timestamp(data().generatedAt)} · Times shown in{" "}
                  {Intl.DateTimeFormat().resolvedOptions().timeZone}. Each cell is one hour.
                </small>
              </p>
              <For each={data().sites}>
                {(site) => (
                  <SiteCard
                    site={site}
                    now={data().generatedAt}
                    dayOffset={model().dayOffset}
                    selected={model().selected?.siteId === site.id ? model().selected!.hour : null}
                    select={(hour) => void dispatch({ kind: "select", siteId: site.id, hour })}
                  />
                )}
              </For>
            </>
          )}
        </Show>
      </main>
      <footer>
        <small>
          Observo · No accounts. Hourly records expire automatically after 30 days; page content is
          never retained.
        </small>
      </footer>
    </>
  );
}
const element = document.getElementById("app");
if (!element) throw new Error("Missing app mount element");
render(() => <App />, element);
