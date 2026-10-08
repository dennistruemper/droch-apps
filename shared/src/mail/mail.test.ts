import { afterEach, describe, expect, it, vi } from "vitest";
afterEach(() => vi.restoreAllMocks());
import { createMailSender } from "./index.ts";
describe("Mailtrap transport", () => {
  it("sends to the fixed Mailtrap endpoint with an injected transport", async () => {
    let captured: Request | undefined;
    const send = createMailSender({
      token: "private-test-token",
      from: "sender@example.test",
      fetch: async (input, init) => {
        captured = new Request(input, init);
        return new Response("{}", { status: 200 });
      },
    });
    await send({ to: "a@example.test", subject: "Sign in", text: "Example" });
    expect(captured!.url).toBe("https://send.api.mailtrap.io/api/send");
    expect(captured!.headers.get("Authorization")).toBe("Bearer private-test-token");
    expect(await captured!.json()).toMatchObject({ to: [{ email: "a@example.test" }] });
  });
  it("uses the sandbox endpoint and redacts failures", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const send = createMailSender({
      token: "secret",
      from: "sender@example.test",
      sandboxId: "123",
      fetch: async (input) => {
        expect(String(input)).toBe("https://sandbox.api.mailtrap.io/api/send/123");
        return new Response("secret provider detail", { status: 403 });
      },
    });
    await expect(
      send({ to: "a@example.test", subject: "Sign in", text: "Example" }),
    ).rejects.toThrow("Email delivery failed");
    expect(log).toHaveBeenCalledExactlyOnceWith("Mailtrap delivery failed", {
      transport: "sandbox",
      status: 403,
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
  });

  it.each([401, 422, 429, 500])(
    "logs HTTP %s without exposing message contents or credentials",
    async (status) => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      const send = createMailSender({
        token: "private-token",
        from: "sender@example.test",
        fetch: async () =>
          new Response("recipient@example.test code=123456 private-token", { status }),
      });
      await expect(
        send({ to: "recipient@example.test", subject: "Sign in", text: "code=123456" }),
      ).rejects.toThrow("Email delivery failed");
      expect(log.mock.calls).toEqual([
        ["Mailtrap delivery failed", { transport: "sending", status }],
      ]);
    },
  );

  it.each(["TimeoutError", "TypeError"])(
    "reports %s safely when the transport throws",
    async (name) => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      const send = createMailSender({
        token: "private-token",
        from: "sender@example.test",
        fetch: async () => {
          const error = new Error("private-token recipient@example.test code=123456");
          error.name = name;
          throw error;
        },
      });
      await expect(
        send({ to: "recipient@example.test", subject: "Sign in", text: "code=123456" }),
      ).rejects.toThrow("Email delivery failed");
      expect(log.mock.calls).toEqual([
        [
          "Mailtrap delivery failed",
          { transport: "sending", reason: name === "TimeoutError" ? "timeout" : "connection" },
        ],
      ]);
    },
  );
});
