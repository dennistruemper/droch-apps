import { and, eq, lt } from "drizzle-orm";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type { connectDatabase } from "@repo/shared/database";
import type { User } from "@repo/shared/auth";
import {
  snapshotSchema,
  gameSchema,
  matchInputSchema,
  type Command,
  type Game,
  type GameView,
  type Snapshot,
  type MatchInput,
} from "../contracts/index.ts";
import { overlaps, localDay, parseCalendar, importGame, changedSchedule } from "../domain/index.ts";
import {
  teams,
  profiles,
  memberships,
  commitments,
  revision,
  receipts,
  attempts,
} from "./schema.ts";
export class TeamError extends Error {
  constructor(
    message: string,
    public status: 400 | 401 | 403 | 404 | 409 | 429 = 400,
  ) {
    super(message);
  }
}
type DB = ReturnType<typeof connectDatabase>["db"];
type Row = typeof teams.$inferSelect;
export function createTeamService(
  db: DB,
  options: { secret: string; now?: () => number; id?: () => string; pin?: () => string },
) {
  const now = options.now ?? Date.now,
    id = options.id ?? randomUUID;
  const encryptionKey = createHash("sha256")
    .update("kunludo:pin:" + options.secret)
    .digest();
  const digest = (pin: string) =>
    createHmac("sha256", options.secret)
      .update("kunludo:join:" + pin)
      .digest("hex");
  function credential(oldDigest?: string) {
    let pin = "";
    for (let tries = 0; tries < 10; tries++) {
      pin =
        options.pin?.() ??
        Array.from({ length: 6 }, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[randomInt(36)]).join(
          "",
        );
      if (digest(pin) !== oldDigest) break;
    }
    if (!/^[A-Z0-9]{6}$/.test(pin) || digest(pin) === oldDigest)
      throw new Error("Could not generate a new PIN");
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(pin, "utf8"), cipher.final()]);
    return {
      pinDigest: digest(pin),
      pinBox: Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64"),
    };
  }
  const member = (teamId: string, userId: string) =>
    db
      .select()
      .from(memberships)
      .where(and(eq(memberships.teamId, teamId), eq(memberships.userId, userId)))
      .get();
  function team(teamId: string, user: User, admin = false): Row {
    const m = member(teamId, user.id),
      t = db.select().from(teams).where(eq(teams.id, teamId)).get();
    if (!t || !m) throw new TeamError("Dieses Team ist nicht verfügbar.", 404);
    if (admin && m.role !== "admin") throw new TeamError("Nur Admins können das ändern.", 403);
    return t;
  }
  function profile(user: User) {
    db.insert(profiles)
      .values(user)
      .onConflictDoUpdate({ target: profiles.id, set: { name: user.name } })
      .run();
  }
  const version = () => db.select().from(revision).get()!.value;
  function code(teamId: string, user: User) {
    const t = team(teamId, user, true),
      box = Buffer.from(t.pinBox, "base64"),
      decipher = createDecipheriv("aes-256-gcm", encryptionKey, box.subarray(0, 12));
    decipher.setAuthTag(box.subarray(12, 28));
    return {
      teamId,
      version: version(),
      pin: Buffer.concat([decipher.update(box.subarray(28)), decipher.final()]).toString("utf8"),
    };
  }
  function snapshot(user: User): Snapshot {
    // Auth owns the current shared name; refresh this app's cached roster identity.
    db.transaction(() => {
      const cached = db.select().from(profiles).where(eq(profiles.id, user.id)).get();
      if (cached && cached.name !== user.name) {
        profile(user);
        db.update(revision)
          .set({ value: version() + 1 })
          .run();
      }
    });
    const allTeams = db.select().from(teams).all();
    const allMembers = db.select().from(memberships).all();
    const names = new Map(
      db
        .select()
        .from(profiles)
        .all()
        .map((p) => [p.id, p.name]),
    );
    const mine = allMembers.filter((m) => m.userId === user.id),
      visible = new Set(mine.map((m) => m.teamId));
    const allGames = allTeams.flatMap((t) =>
      t.games.map((raw) => ({ team: t, game: gameSchema.parse(raw) })),
    );
    const active = allGames.filter(({ game: g }) => !g.cancelled && g.window.end >= now());
    const committed = db
      .select()
      .from(commitments)
      .all()
      .filter((c) =>
        active.some(
          ({ game: g, team: t }) =>
            g.id === c.gameId &&
            g.revision === c.revision &&
            allMembers.some((m) => m.teamId === t.id && m.userId === c.userId),
        ),
      );
    const currentYes = (g: Game, uid: string) =>
      g.responses[uid]?.answer === "yes" && g.responses[uid]?.revision === g.revision;
    function state(g: Game, uid: string): GameView["mine"] {
      if (g.cancelled) return "unanswered";
      const r = g.responses[uid];
      if (!r) return "unanswered";
      if (r.revision !== g.revision) return "stale";
      if (r.answer !== "yes") return r.answer;
      if (committed.some((c) => c.gameId === g.id && c.userId === uid)) return "committed";
      if (
        committed.some(
          (c) =>
            c.userId === uid &&
            active.some(({ game: o }) => o.id === c.gameId && overlaps(g.window, o.window)),
        )
      )
        return "elsewhere";
      if (
        g.window.end >= now() &&
        active.some(
          ({ game: o, team: t }) =>
            o.id !== g.id &&
            currentYes(o, uid) &&
            allMembers.some((m) => m.teamId === t.id && m.userId === uid) &&
            overlaps(g.window, o.window),
        )
      )
        return "pending";
      return "yes";
    }
    const resultTeams = allTeams
      .filter((t) => visible.has(t.id))
      .map((t) => ({
        id: t.id,
        name: t.name,
        club: t.club,
        needed: t.needed,
        timezone: t.timezone,
        role: mine.find((m) => m.teamId === t.id)!.role,
        members: allMembers
          .filter((m) => m.teamId === t.id)
          .map((m) => ({ id: m.userId, name: names.get(m.userId) ?? "Mitglied", role: m.role })),
      }));
    const games: GameView[] = allGames
      .filter(({ team: t }) => visible.has(t.id))
      .map(({ team: t, game: g }) => {
        const members = resultTeams
          .find((v) => v.id === t.id)!
          .members.map((m) => ({
            ...m,
            state: state(g, m.id),
            reserve: g.reserves.includes(m.id),
          }));
        const others = active.filter(
          ({ game: o, team: ot }) => o.id !== g.id && visible.has(ot.id),
        );
        return {
          id: g.id,
          teamId: t.id,
          opponent: g.opponent,
          venue: g.venue,
          home: g.home,
          window: g.window,
          revision: g.revision,
          cancelled: g.cancelled,
          notice: g.notice,
          imported: g.sourceUid !== null,
          calendarUid: g.sourceUid,
          mine: state(g, user.id),
          committed: committed.some((c) => c.userId === user.id && c.gameId === g.id),
          conflicts:
            g.cancelled || g.window.end < now()
              ? []
              : others
                  .filter(({ game: o }) => overlaps(g.window, o.window))
                  .map(({ game: o }) => o.id),
          sameDay:
            g.cancelled || g.window.end < now()
              ? []
              : others
                  .filter(
                    ({ game: o }) =>
                      localDay(g.window.start, t.timezone) === localDay(o.window.start, t.timezone),
                  )
                  .map(({ game: o }) => o.id),
          ready: members.filter((m) => m.state === "yes" || m.state === "committed").length,
          uncertain: members.filter((m) =>
            ["maybe", "pending", "unanswered", "stale"].includes(m.state),
          ).length,
          needed: t.needed,
          members,
          proposals: g.proposals.map((p) => ({
            id: p.id,
            window: p.window,
            mine: p.votes[user.id] ?? null,
            yes: Object.values(p.votes).filter((v) => v === "yes").length,
            maybe: Object.values(p.votes).filter((v) => v === "maybe").length,
            no: Object.values(p.votes).filter((v) => v === "no").length,
          })),
        };
      });
    return snapshotSchema.parse({
      version: version(),
      teams: resultTeams,
      games: games.sort((a, b) => a.window.start - b.window.start || a.id.localeCompare(b.id)),
    });
  }
  function throttle(user: User, group: string) {
    // Commit failed attempts outside the command transaction, so rollback cannot erase limits.
    db.transaction(() => {
      db.delete(attempts)
        .where(lt(attempts.start, now() - 3600000))
        .run();
      for (const [key, limit] of [
        ["global", 300],
        ["user:" + user.id, 20],
        ["group:" + group, 80],
      ] as const) {
        const row = db.select().from(attempts).where(eq(attempts.key, key)).get();
        if (row && row.start > now() - 600000 && row.count >= limit)
          throw new TeamError("Zu viele Beitrittsversuche. Bitte später erneut versuchen.", 429);
      }
      for (const key of ["global", "user:" + user.id, "group:" + group]) {
        const row = db.select().from(attempts).where(eq(attempts.key, key)).get();
        db.insert(attempts)
          .values({ key, start: now(), count: 1 })
          .onConflictDoUpdate({
            target: attempts.key,
            set:
              row && row.start > now() - 600000
                ? { count: row.count + 1 }
                : { start: now(), count: 1 },
          })
          .run();
      }
    });
  }
  function command(user: User, c: Command) {
    const fingerprint = createHash("sha256").update(JSON.stringify(c.action)).digest("hex");
    const prior = db
      .select()
      .from(receipts)
      .where(and(eq(receipts.userId, user.id), eq(receipts.commandId, c.commandId)))
      .get();
    if (prior) {
      if (prior.fingerprint !== fingerprint)
        throw new TeamError("Diese Anfrage-ID wurde bereits verwendet.", 409);
      return {
        snapshot: snapshot(user),
        ...(prior.teamId ? { teamId: prior.teamId } : {}),
        message: prior.message,
      };
    }
    if (c.action.kind === "join") throttle(user, c.action.teamId);
    return db.transaction(() => {
      if (c.version !== version())
        throw new TeamError(
          "Der Spielplan wurde geändert. Bitte prüfe den aktuellen Stand und versuche es erneut.",
          409,
        );
      profile(user);
      const a = c.action;
      let teamId: string | undefined,
        message = "Gespeichert.";
      const save = (t: Row) =>
        db.update(teams).set({ games: t.games }).where(eq(teams.id, t.id)).run();
      const revokeGame = (gameId: string) =>
        db.delete(commitments).where(eq(commitments.gameId, gameId)).run();
      const newGame = (
        input: MatchInput,
        sourceUid: string | null = null,
        sourceName: string | null = null,
      ): Game => ({
        ...matchInputSchema.parse(input),
        id: id(),
        revision: 1,
        cancelled: false,
        responses: {},
        proposals: [],
        reserves: [],
        sourceUid,
        sourceName,
        notice: "",
      });
      function cancel(g: Game) {
        if (g.cancelled) return;
        g.cancelled = true;
        g.revision++;
        g.reserves = [];
        g.proposals = [];
        g.notice = "Spiel abgesagt.";
        revokeGame(g.id);
      }
      function reschedule(g: Game, input: MatchInput) {
        const v = matchInputSchema.parse(input);
        if (changedSchedule(g, v)) {
          g.revision++;
          g.reserves = [];
          revokeGame(g.id);
          g.notice = "Termin oder Ort geändert – bitte erneut antworten.";
          g.proposals = [];
        }
        Object.assign(g, v);
      }
      if (a.kind === "create-team") {
        teamId = id();
        db.insert(teams)
          .values({ id: teamId, ...a.team, ...credential(), games: [] })
          .run();
        db.insert(memberships).values({ teamId, userId: user.id, role: "admin" }).run();
        message = "Team erstellt. Du bist Admin.";
      } else if (a.kind === "join") {
        const t = db.select().from(teams).where(eq(teams.id, a.teamId)).get();
        if (
          !t ||
          !timingSafeEqual(Buffer.from(t.pinDigest, "hex"), Buffer.from(digest(a.pin), "hex"))
        )
          throw new TeamError("Team-ID oder PIN ungültig.", 400);
        db.insert(memberships)
          .values({ teamId: t.id, userId: user.id, role: "member" })
          .onConflictDoNothing()
          .run();
        teamId = t.id;
        message = "Du bist dem Team beigetreten.";
      } else {
        const admin = [
          "settings",
          "promote",
          "remove",
          "rotate",
          "create-game",
          "edit-game",
          "cancel",
          "adopt",
          "reserve",
          "set-answer",
          "import",
        ].includes(a.kind);
        const t = team(a.teamId, user, admin);
        teamId = t.id;
        if (a.kind === "settings") db.update(teams).set(a.team).where(eq(teams.id, t.id)).run();
        else if (a.kind === "rotate") {
          db.update(teams).set(credential(t.pinDigest)).where(eq(teams.id, t.id)).run();
          message = "Neuer Beitrittscode erstellt.";
        } else if (a.kind === "promote" || a.kind === "remove") {
          const target = member(t.id, a.userId);
          if (!target) throw new TeamError("Dieses Mitglied ist nicht mehr im Team.", 404);
          if (a.kind === "promote")
            db.update(memberships)
              .set({ role: "admin" })
              .where(and(eq(memberships.teamId, t.id), eq(memberships.userId, a.userId)))
              .run();
          else {
            if (
              target.role === "admin" &&
              db
                .select()
                .from(memberships)
                .where(and(eq(memberships.teamId, t.id), eq(memberships.role, "admin")))
                .all().length <= 1
            )
              throw new TeamError("Ernenne zuerst einen weiteren Admin.");
            db.delete(memberships)
              .where(and(eq(memberships.teamId, t.id), eq(memberships.userId, a.userId)))
              .run();
            for (const g of t.games) {
              delete g.responses[a.userId];
              g.reserves = g.reserves.filter((uid) => uid !== a.userId);
              for (const p of g.proposals) delete p.votes[a.userId];
              db.delete(commitments)
                .where(and(eq(commitments.gameId, g.id), eq(commitments.userId, a.userId)))
                .run();
            }
            db.update(teams)
              .set({ ...credential(t.pinDigest), games: t.games })
              .where(eq(teams.id, t.id))
              .run();
            message = "Mitglied entfernt. Der Team-PIN wurde geändert.";
          }
        } else if (a.kind === "create-game") {
          t.games.push(newGame(a.game));
          save(t);
        } else if (a.kind === "import") {
          const events = (() => {
              try {
                return parseCalendar(a.calendar, t.timezone);
              } catch (error) {
                throw new TeamError(
                  error instanceof Error ? error.message : "Ungültiger Kalender.",
                );
              }
            })(),
            chosen = new Set(a.selected);
          let added = 0,
            updated = 0;
          if (
            chosen.size !== a.selected.length ||
            a.selected.some((uid) => !events.some((e) => e.uid === uid))
          )
            throw new TeamError("Ungültige Spielauswahl.");
          for (const e of events.filter((e) => chosen.has(e.uid))) {
            let v: MatchInput;
            try {
              v = importGame(e, a.ownName);
            } catch (error) {
              throw new TeamError(
                error instanceof Error ? error.message : "Ungültige Teamauswahl.",
              );
            }
            matchInputSchema.parse(v);
            const old = t.games.find((g) => g.sourceUid === e.uid);
            if (old) {
              if (e.cancelled) cancel(old);
              else reschedule(old, v);
              old.sourceName = a.ownName;
              updated++;
            } else {
              const created = newGame(v, e.uid, a.ownName);
              if (e.cancelled) cancel(created);
              t.games.push(created);
              added++;
            }
          }
          save(t);
          message = `${added} Spiele hinzugefügt, ${updated} abgeglichen.`;
        } else {
          const g = t.games.find((g) => g.id === a.gameId);
          if (!g) throw new TeamError("Dieses Spiel ist nicht verfügbar.", 404);
          if (a.kind === "edit-game") reschedule(g, a.game);
          else if (a.kind === "cancel") cancel(g);
          else {
            if (g.cancelled || g.window.end < now())
              throw new TeamError("Dieses Spiel ist nicht mehr offen.");
            if (a.kind === "answer" || a.kind === "set-answer") {
              const targetId = a.kind === "set-answer" ? a.userId : user.id;
              if (!member(t.id, targetId))
                throw new TeamError("Nur beigetretene Mitglieder können antworten.");
              g.responses[targetId] = { answer: a.answer, revision: g.revision };
              if (a.answer !== "yes")
                db.delete(commitments)
                  .where(and(eq(commitments.gameId, g.id), eq(commitments.userId, targetId)))
                  .run();
            } else if (a.kind === "commit") {
              const existing = db
                .select()
                .from(commitments)
                .where(eq(commitments.userId, user.id))
                .all();
              const all = db
                .select()
                .from(teams)
                .all()
                .flatMap((v) => v.games);
              for (const entry of existing) {
                const other = all.find((v) => v.id === entry.gameId);
                if (
                  other &&
                  !other.cancelled &&
                  other.revision === entry.revision &&
                  overlaps(g.window, other.window)
                )
                  db.delete(commitments)
                    .where(
                      and(eq(commitments.gameId, entry.gameId), eq(commitments.userId, user.id)),
                    )
                    .run();
              }
              g.responses[user.id] = { answer: "yes", revision: g.revision };
              db.insert(commitments)
                .values({ gameId: g.id, userId: user.id, revision: g.revision })
                .onConflictDoNothing()
                .run();
              message = "Zusage gespeichert.";
            } else if (a.kind === "release")
              db.delete(commitments)
                .where(and(eq(commitments.gameId, g.id), eq(commitments.userId, user.id)))
                .run();
            else if (a.kind === "propose")
              g.proposals.push({ id: id(), window: a.window, votes: {}, by: user.id });
            else if (a.kind === "vote" || a.kind === "adopt") {
              const p = g.proposals.find((p) => p.id === a.proposalId);
              if (!p) throw new TeamError("Dieser Vorschlag ist nicht mehr offen.", 409);
              if (a.kind === "vote") p.votes[user.id] = a.answer;
              else {
                reschedule(g, { ...g, window: p.window });
                g.proposals = [];
                message = "Termin übernommen. Alle müssen erneut antworten.";
              }
            } else if (a.kind === "reserve") {
              if (!member(t.id, a.userId))
                throw new TeamError("Nur beigetretene Mitglieder können Ersatz sein.");
              g.reserves = g.reserves.filter((uid) => uid !== a.userId);
              if (a.add) g.reserves.push(a.userId);
            }
          }
          save(t);
        }
      }
      db.update(revision)
        .set({ value: version() + 1 })
        .where(eq(revision.id, 1))
        .run();
      db.delete(receipts)
        .where(lt(receipts.createdAt, now() - 7 * 86400000))
        .run();
      db.insert(receipts)
        .values({
          userId: user.id,
          commandId: c.commandId,
          fingerprint,
          teamId: teamId ?? null,
          message,
          createdAt: now(),
        })
        .run();
      return { snapshot: snapshot(user), ...(teamId ? { teamId } : {}), message };
    });
  }
  return { snapshot, command, code };
}
