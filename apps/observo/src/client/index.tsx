import { render } from "@solidjs/web";
import { createMemo, createSignal, For, onSettled, Show } from "solid-js";
import { AppSettings } from "@repo/shared/settings";
import "@repo/shared/styles";
import "./styles.css";
import { appDefinition, type Dashboard, type Latest } from "../contracts/index.ts";
import { currentStatus, interval } from "../domain/index.ts";
import { localDays, localSummary } from "./history.ts";
import { init, update, type Message } from "./dashboard-model.ts";
import { execute } from "./dashboard-commands.ts";

const statusNames = {
  available: "Available",
  degraded: "Degraded",
  "mostly-unavailable": "Mostly unavailable",
  unknown: "Unknown",
  unavailable: "Unavailable",
  unreachable: "Unreachable",
  "not-functional": "Not functional",
  missing: "Missing",
} as const;
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
    : currentStatus(latest, now) === "unknown"
      ? "Unknown · check overdue"
      : statusNames[currentStatus(latest, now)];
}
function checkedAgo(latest: Latest, now: number) {
  const minutes = Math.max(0, Math.floor((now - latest.checkedAt) / 60_000));
  return minutes === 0
    ? "Checked just now"
    : `Checked ${minutes} minute${minutes === 1 ? "" : "s"} ago`;
}
function SiteCard(props: {
  site: Dashboard["sites"][number];
  now: number;
  selected: number | null;
  select: (hour: number) => void;
}) {
  const days = createMemo(() => localDays(props.now), {
    equals: (previous, next) => previous[0]?.start === next[0]?.start,
  });
  const observations = createMemo(
    () => new Map(props.site.hours.map((entry) => [entry.hour, entry.slots])),
  );
  const summaries = createMemo(
    () =>
      new Map(
        days().flatMap((day) =>
          day.hours.map(
            (hour) =>
              [hour, localSummary(observations(), hour, props.now, props.site.latest)] as const,
          ),
        ),
      ),
  );
  const summary = (hour: number) => summaries().get(hour)!;
  const [compact, setCompact] = createSignal(false);
  onSettled(() => {
    const media = matchMedia("(max-width: 600px)");
    const change = () => setCompact(media.matches);
    change();
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  });
  const selected = () => (props.selected === null ? null : summaries().get(props.selected));
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
      <Show when={props.site.latest}>
        {(latest) => (
          <p class="observo-latest">
            {checkedAgo(latest(), props.now)} · {timestamp(latest().checkedAt)}
          </p>
        )}
      </Show>
      <section class="observo-status-panel" aria-label={`${props.site.name} availability history`}>
        <div class="observo-axis" aria-hidden="true">
          <For each={Array.from({ length: 24 }, (_, hour) => hour)}>
            {(hour) => <span>{String(hour).padStart(2, "0")}</span>}
          </For>
        </div>
        <div class="observo-history">
          <For each={days()}>
            {(day, dayIndex) => (
              <details class="observo-day" open={!compact() || dayIndex() === 0}>
                <summary>
                  {dayIndex() === 0 ? "Today · " : ""}
                  {new Date(day.start).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </summary>
                <div
                  class="observo-hours"
                  role="group"
                  aria-label={`Hourly availability · ${new Date(day.start).toLocaleDateString()}`}
                  style={{ "--hours": day.hours.length }}
                >
                  <For each={day.hours}>
                    {(hour) => (
                      <button
                        type="button"
                        disabled={hour > props.now}
                        data-status={hour > props.now ? "upcoming" : summary(hour).status}
                        data-current={summary(hour).current ? "true" : undefined}
                        aria-pressed={props.selected === hour ? "true" : "false"}
                        aria-label={`${summary(hour).current ? "Now · " : ""}${timestamp(hour)}: ${hour > props.now ? "Upcoming" : statusNames[summary(hour).status]}, ${summary(hour).passed} passed, ${summary(hour).failed} failed, ${summary(hour).missing} missing`}
                        title={`${hourLabel(hour)} · ${hour > props.now ? "Upcoming" : statusNames[summary(hour).status]}`}
                        onClick={() => props.select(hour)}
                      >
                        <span>
                          {summary(hour).current
                            ? "Now"
                            : new Date(hour).toLocaleTimeString(undefined, {
                                hour: "2-digit",
                                minute: "2-digit",
                                hour12: false,
                              })}
                        </span>
                        <b>
                          {hour > props.now
                            ? "·"
                            : summary(hour).status === "available"
                              ? "✓"
                              : summary(hour).status === "degraded"
                                ? "!"
                                : summary(hour).status === "mostly-unavailable" ||
                                    summary(hour).status === "unavailable"
                                  ? "×"
                                  : "?"}
                        </b>
                      </button>
                    )}
                  </For>
                </div>
              </details>
            )}
          </For>
        </div>
        <ul class="observo-legend" aria-label="Completed hour status legend">
          <li>
            <i data-status="available" />
            Available
          </li>
          <li>
            <i data-status="degraded" />
            Degraded
          </li>
          <li>
            <i data-status="mostly-unavailable" />
            Mostly unavailable
          </li>
          <li>
            <i data-status="unknown" />
            Unknown
          </li>
        </ul>
        <Show when={selected()}>
          {(value) => (
            <div class="observo-detail" aria-live="polite">
              <h3>
                {props.selected === null
                  ? ""
                  : `${timestamp(props.selected)} (${hourLabel(props.selected)})`}{" "}
                · {value().current ? "Now · " : ""}
                {statusNames[value().status]}
              </h3>
              <p>
                {value().passed} passed · {value().failed} failed · {value().missing} missing
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
          error: "Updates unavailable. Results may be outdated.",
        });
      }
    }
  }
  onSettled(() => {
    const refresh = () => {
      void dispatch({ kind: "clock", now: Date.now() });
      if (!document.hidden) void dispatch({ kind: "refresh" });
    };
    refresh();
    const timer = setInterval(refresh, 120_000);
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
        <h1>Is it working?</h1>
        <Show when={error()}>
          <p role="alert">{error()}</p>
        </Show>
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
                <p role="status">Monitoring paused.</p>
              </Show>
              <p class="observo-timezone">{Intl.DateTimeFormat().resolvedOptions().timeZone}</p>
              <For each={data().sites}>
                {(site) => (
                  <SiteCard
                    site={site}
                    now={model().now}
                    selected={model().selected?.siteId === site.id ? model().selected!.hour : null}
                    select={(hour) => void dispatch({ kind: "select", siteId: site.id, hour })}
                  />
                )}
              </For>
            </>
          )}
        </Show>
      </main>
    </>
  );
}
const element = document.getElementById("app");
if (!element) throw new Error("Missing app mount element");
render(() => <App />, element);
