import { and, eq, lte, or, asc } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { connectDatabase } from "@repo/shared/database";
import type { SendMail } from "@repo/shared/mail";
import { mailQueue, memberships, profiles, teams, type AvailabilityChange } from "./schema.ts";

type DB = ReturnType<typeof connectDatabase>["db"];

export const notificationDelay = 5 * 60 * 1000;
const leaseDuration = 60_000;

// Called inside the availability command's transaction, never after it commits.
export function enqueueAvailabilityChange(
  db: DB,
  input: AvailabilityChange & {
    teamId: string;
    now: number;
    id: () => string;
  },
) {
  if (input.before === input.after) return;
  // Any player's edit extends this team's quiet period.
  db.update(mailQueue)
    .set({ dueAt: input.now + notificationDelay })
    .where(and(eq(mailQueue.teamId, input.teamId), eq(mailQueue.status, "pending")))
    .run();

  const admins = db
    .select()
    .from(memberships)
    .where(and(eq(memberships.teamId, input.teamId), eq(memberships.role, "admin")))
    .all();

  for (const admin of admins) {
    if (admin.userId === input.actorId) {
      // An admin's own later edit also supersedes an older failed notification.
      const retries = db
        .select()
        .from(mailQueue)
        .where(
          and(
            eq(mailQueue.teamId, input.teamId),
            eq(mailQueue.recipientId, admin.userId),
            eq(mailQueue.status, "sending"),
            lte(mailQueue.leaseUntil, input.now),
          ),
        )
        .all();

      for (const retry of retries) {
        const changes = retry.changes.filter(
          (change) => change.gameId !== input.gameId || change.playerId !== input.playerId,
        );

        if (!changes.length) db.delete(mailQueue).where(eq(mailQueue.id, retry.id)).run();
        else
          db.update(mailQueue)
            .set({ changes, dueAt: Math.max(retry.dueAt, input.now + notificationDelay) })
            .where(eq(mailQueue.id, retry.id))
            .run();
      }
    }

    const old = db
      .select()
      .from(mailQueue)
      .where(
        and(
          eq(mailQueue.teamId, input.teamId),
          eq(mailQueue.recipientId, admin.userId),
          eq(mailQueue.status, "pending"),
        ),
      )
      .get();

    const existing = old?.changes.find(
      (c) =>
        c.playerId === input.playerId && c.gameId === input.gameId && c.revision === input.revision,
    );

    const before = existing?.before ?? input.before;

    const changes = (old?.changes ?? []).filter(
      (c) => c.gameId !== input.gameId || c.playerId !== input.playerId,
    );

    if (admin.userId !== input.actorId && before !== input.after)
      changes.push({
        playerId: input.playerId,
        gameId: input.gameId,
        revision: input.revision,
        before,
        after: input.after,
        actorId: input.actorId,
      });

    if (!changes.length) {
      if (old) db.delete(mailQueue).where(eq(mailQueue.id, old.id)).run();
    } else if (old) db.update(mailQueue).set({ changes }).where(eq(mailQueue.id, old.id)).run();
    else
      db.insert(mailQueue)
        .values({
          id: input.id(),
          teamId: input.teamId,
          recipientId: admin.userId,
          changes,
          status: "pending",
          createdAt: input.now,
          dueAt: input.now + notificationDelay,
        })
        .run();
  }
}

export function createNotificationWorker(
  db: DB,
  options: {
    send: SendMail;
    deliveryAddress: (userId: string) => string | null;
    origin: string;
    now?: () => number;
    ready?: () => boolean;
  },
) {
  const now = options.now ?? Date.now;
  const controller = new AbortController();
  let running: Promise<void> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;

  function claim() {
    return db.transaction(() => {
      const job = db
        .select()
        .from(mailQueue)
        .where(
          and(
            lte(mailQueue.dueAt, now()),
            or(
              eq(mailQueue.status, "pending"),
              and(eq(mailQueue.status, "sending"), lte(mailQueue.leaseUntil, now())),
            ),
          ),
        )
        .orderBy(asc(mailQueue.dueAt), asc(mailQueue.id))
        .get();

      if (!job) return;

      const related = db
        .select()
        .from(mailQueue)
        .where(
          and(
            eq(mailQueue.teamId, job.teamId),
            eq(mailQueue.recipientId, job.recipientId),
            or(eq(mailQueue.status, "pending"), eq(mailQueue.status, "sending")),
          ),
        )
        .orderBy(asc(mailQueue.createdAt), asc(mailQueue.id))
        .all();

      const waitUntil = Math.max(...related.map((row) => Math.max(row.dueAt, row.leaseUntil)));

      if (waitUntil > now()) {
        db.update(mailQueue).set({ dueAt: waitUntil }).where(eq(mailQueue.id, job.id)).run();

        return null;
      }

      // A failed older summary and later pending changes become one delivery.
      const merged = new Map<string, AvailabilityChange>();

      for (const row of related)
        for (const change of row.changes) {
          const key = `${change.playerId}:${change.gameId}`;
          const previous = merged.get(key);
          merged.set(key, {
            ...change,
            before: previous?.revision === change.revision ? previous.before : change.before,
          });
        }

      const changes = [...merged.values()].filter((change) => change.before !== change.after);
      const attempts = Math.max(...related.map((row) => row.attempts)) + 1;

      for (const row of related)
        if (row.id !== job.id) db.delete(mailQueue).where(eq(mailQueue.id, row.id)).run();
      db.update(mailQueue)
        .set({ changes, status: "sending", leaseUntil: now() + leaseDuration, attempts })
        .where(eq(mailQueue.id, job.id))
        .run();

      return { ...job, changes, attempts };
    });
  }

  const labels = { unanswered: "Noch keine Antwort", yes: "Ja", no: "Nein", maybe: "Vielleicht" };

  async function processDue() {
    if (options.ready && !options.ready()) return;

    for (let i = 0; i < 20 && !controller.signal.aborted; i++) {
      const job = claim();

      if (job === undefined) return;

      if (job === null) continue;

      try {
        const t = db.select().from(teams).where(eq(teams.id, job.teamId)).get();

        const members = db
          .select()
          .from(memberships)
          .where(eq(memberships.teamId, job.teamId))
          .all();

        const recipient = members.find((m) => m.userId === job.recipientId && m.role === "admin");

        const changes = job.changes
          .flatMap((c) => {
            const game = t?.games.find((g) => g.id === c.gameId);
            const answer = game?.responses[c.playerId];

            return members.some((member) => member.userId === c.playerId) &&
              game &&
              !game.cancelled &&
              game.window.start > now() &&
              game.revision === c.revision &&
              answer?.revision === c.revision &&
              answer.answer === c.after &&
              c.actorId !== job.recipientId
              ? [{ change: c, game }]
              : [];
          })
          .sort((a, b) => a.game.window.start - b.game.window.start);

        const to = recipient && changes.length ? options.deliveryAddress(job.recipientId) : null;

        if (t && to) {
          const name = (id: string) =>
            db.select().from(profiles).where(eq(profiles.id, id)).get()?.name ?? "Mitglied";

          const date = new Intl.DateTimeFormat("de-DE", {
            timeZone: t.timezone,
            dateStyle: "medium",
            timeStyle: "short",
          });

          const grouped = new Map<string, typeof changes>();

          for (const entry of changes) {
            const rows = grouped.get(entry.change.playerId) ?? [];
            rows.push(entry);
            grouped.set(entry.change.playerId, rows);
          }

          const text =
            `${t.name}\n\n` +
            [...grouped.entries()]
              .sort(([a], [b]) => name(a).localeCompare(name(b), "de"))
              .map(
                ([playerId, entries]) =>
                  name(playerId) +
                  "\n" +
                  entries
                    .map(
                      ({ change, game }) =>
                        `${date.format(game.window.start)} · ${game.opponent}\n${labels[change.before]} → ${labels[change.after]}` +
                        (change.actorId !== playerId
                          ? ` (geändert von ${name(change.actorId)})`
                          : ""),
                    )
                    .join("\n\n"),
              )
              .join("\n\n") +
            `\n\n${new URL("/kunludo/", options.origin).href}`;

          await options.send(
            { to, subject: `${t.name}: Verfügbarkeit aktualisiert`, text },
            controller.signal,
          );
        }

        db.delete(mailQueue).where(eq(mailQueue.id, job.id)).run();
      } catch {
        if (controller.signal.aborted) return; // Leave the lease for restart recovery.
        db.update(mailQueue)
          .set({
            status: job.attempts >= 8 ? "failed" : "sending",
            leaseUntil: 0,
            dueAt: now() + Math.min(60_000 * 2 ** (job.attempts - 1), 3_600_000),
          })
          .where(eq(mailQueue.id, job.id))
          .run();
        console.error("Kunludo notification delivery failed", {
          id: job.id,
          attempt: job.attempts,
        });
      }
    }
  }

  function run(): Promise<void> {
    if (controller.signal.aborted) return Promise.resolve();

    if (!running)
      running = processDue().finally(() => {
        running = undefined;
      });

    return running;
  }

  return {
    run,
    start() {
      if (timer || controller.signal.aborted) return;

      const tick = () => {
        void run().catch(() =>
          console.error("Kunludo notification queue unavailable", { reference: randomUUID() }),
        );
      };

      tick();
      timer = setInterval(tick, 15_000);
      timer.unref();
    },
    async stop() {
      clearInterval(timer);
      controller.abort();
      await running;
    },
  };
}
