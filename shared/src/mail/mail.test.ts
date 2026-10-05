import { describe, expect, it } from "vitest";
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
  });
});
