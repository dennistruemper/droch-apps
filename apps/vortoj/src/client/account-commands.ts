import { sessionSchema, codeInstructionsSchema } from "@repo/shared/contracts/auth";
import { request } from "./api.ts";
import type { Command, Message } from "./account-model.ts";

/** All account I/O is here; responses cross the boundary through runtime schemas. */
export async function execute(command: Command, signal: AbortSignal): Promise<Message> {
  const id = command.id;
  switch (command.kind) {
    case "load-session":
      return {
        kind: "session-loaded",
        id,
        user: sessionSchema.parse(await request("/api/auth/session", undefined, "GET", signal))
          .user,
      };
    case "send-code":
      return {
        kind: "code-sent",
        id,
        instructions: codeInstructionsSchema.parse(
          await request("/api/auth/code", { email: command.email }, "POST", signal),
        ),
      };
    case "verify": {
      const { user } = sessionSchema.parse(
        await request(
          "/api/auth/verify",
          {
            email: command.email,
            code: command.code,
            name: command.name,
          },
          "POST",
          signal,
        ),
      );
      if (!user) throw new Error("Could not sign you in. Request another code and try again.");
      return { kind: "verified", id, user };
    }
    case "sign-out":
      await request("/api/auth/logout", {}, "POST", signal);
      return { kind: "signed-out", id };
  }
}
