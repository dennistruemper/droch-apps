export type Mail = { to: string; subject: string; text: string };
export type SendMail = (mail: Mail) => Promise<void>;
export function createMailSender(options: {
  token?: string;
  from?: string;
  sandboxId?: string;
  fetch?: typeof fetch;
}): SendMail {
  return async (mail) => {
    if (!options.token || !options.from) throw new Error("Email delivery is not configured");
    const endpoint = options.sandboxId
      ? `https://sandbox.api.mailtrap.io/api/send/${options.sandboxId}`
      : "https://send.api.mailtrap.io/api/send";
    const transport = options.sandboxId ? "sandbox" : "sending";
    let response: Response;
    try {
      response = await (options.fetch ?? fetch)(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${options.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: { email: options.from, name: "Droch apps" },
          to: [{ email: mail.to }],
          subject: mail.subject,
          text: mail.text,
        }),
        signal: AbortSignal.timeout(10000),
      });
    } catch (error) {
      console.error("Mailtrap delivery failed", {
        transport,
        reason: error instanceof Error && error.name === "TimeoutError" ? "timeout" : "connection",
      });
      throw new Error("Email delivery failed");
    }
    if (!response.ok) {
      // Provider responses may contain addresses or message contents; log only metadata.
      console.error("Mailtrap delivery failed", { transport, status: response.status });
      throw new Error("Email delivery failed");
    }
  };
}

// Local test implementation deliberately performs no I/O.
export function createTestMailSender(): SendMail {
  return async () => {};
}
