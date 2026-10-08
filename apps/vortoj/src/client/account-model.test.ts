import { describe, expect, it } from "vitest";
import { init, update, type Model } from "./account-model.ts";

const user = { id: "98e89936-309c-4e00-bfab-a82ca5a5872e", name: "Review" };
const instructions = { codeLength: 4 as const, message: "Use 9999" };
function signedOut(): Model {
  const initial = init();
  return update(initial.model, { kind: "session-loaded", id: 1, user: null }).model;
}
function enteringCode(): Model {
  const sent = update(signedOut(), {
    kind: "submit",
    email: " review@example.test ",
    code: "",
    name: "",
  });
  return update(sent.model, { kind: "code-sent", id: sent.commands[0]!.id, instructions }).model;
}

describe("account transitions", () => {
  it("describes session loading and code delivery without executing I/O or mutating the model", () => {
    const initial = init();
    expect(initial.commands).toEqual([{ kind: "load-session", id: 1 }]);
    const before = signedOut();
    const sent = update(before, {
      kind: "submit",
      email: " review@example.test ",
      code: "",
      name: "",
    });
    expect(before.screen).toEqual({ kind: "email", email: "" });
    expect(sent.commands).toEqual([{ kind: "send-code", id: 2, email: "review@example.test" }]);
    expect(update(sent.model, { kind: "resend" }).commands).toEqual([]);
  });

  it("keeps an existing code usable when resending fails", () => {
    const code = enteringCode();
    const resend = update(code, { kind: "resend" });
    expect(resend.model.screen).toBe(code.screen);
    const failed = update(resend.model, {
      kind: "failed",
      id: resend.commands[0]!.id,
      error: "Wait a minute",
    });
    expect(failed.model.screen).toBe(code.screen);
    expect(failed.model.error).toBe("Wait a minute");
    const verify = update(failed.model, {
      kind: "submit",
      email: "someone-else@example.test",
      code: "9999",
      name: "Review",
    });
    expect(verify.commands[0]).toMatchObject({
      kind: "verify",
      email: "review@example.test",
      code: "9999",
    });
  });

  it("ignores duplicate submissions and stale or mismatched responses", () => {
    const pending = update(enteringCode(), {
      kind: "submit",
      email: "",
      code: "9999",
      name: "Review",
    });
    const id = pending.commands[0]!.id;
    expect(
      update(pending.model, { kind: "submit", email: "", code: "9999", name: "Review" }).model,
    ).toBe(pending.model);
    expect(update(pending.model, { kind: "verified", id: id - 1, user }).model).toBe(pending.model);
    expect(update(pending.model, { kind: "signed-out", id }).model).toBe(pending.model);
    const done = update(pending.model, { kind: "verified", id, user });
    expect(done.model.screen).toEqual({ kind: "signed-in", user });
    expect(update(done.model, { kind: "failed", id, error: "Late failure" }).model).toBe(
      done.model,
    );
  });

  it("returns to editable email entry without sending mail and ignores old responses", () => {
    const code = enteringCode();
    const changed = update(code, { kind: "change-email" });
    expect(changed.model.screen).toEqual({ kind: "email", email: "review@example.test" });
    expect(changed.commands).toEqual([]);
    expect(update(changed.model, { kind: "code-sent", id: 2, instructions }).model).toBe(
      changed.model,
    );
    const next = update(changed.model, {
      kind: "submit",
      email: "correct@example.test",
      code: "",
      name: "",
    });
    expect(next.commands[0]).toMatchObject({ kind: "send-code", email: "correct@example.test" });
    const pending = update(code, { kind: "resend" });
    expect(update(pending.model, { kind: "change-email" }).model).toBe(pending.model);
  });
  it("keeps the signed-in session on logout failure and clears it on success", () => {
    const signedIn = update(init().model, { kind: "session-loaded", id: 1, user }).model;
    const logout = update(signedIn, { kind: "sign-out" });
    const failed = update(logout.model, {
      kind: "failed",
      id: logout.commands[0]!.id,
      error: "Offline",
    });
    expect(failed.model.screen).toEqual({ kind: "signed-in", user });
    const retry = update(failed.model, { kind: "sign-out" });
    const done = update(retry.model, { kind: "signed-out", id: retry.commands[0]!.id });
    expect(done.model.screen).toEqual({ kind: "email", email: "" });
    expect(done.model.error).toBe("");
  });

  it("allows retrying after session lookup or verification failures", () => {
    const loadFailed = update(init().model, { kind: "failed", id: 1, error: "Offline" });
    expect(loadFailed.model.screen).toEqual({ kind: "email", email: "" });
    const code = enteringCode();
    const verify = update(code, { kind: "submit", email: "", code: "0000", name: "Review" });
    const failed = update(verify.model, {
      kind: "failed",
      id: verify.commands[0]!.id,
      error: "Incorrect code",
    });
    expect(failed.model.screen).toBe(code.screen);
    expect(failed.model.pending).toBeNull();
    expect(update(failed.model, { kind: "resend" }).commands[0]?.kind).toBe("send-code");
  });
});
