import type { Command, Message } from "./generator-model.ts";
export async function execute(command: Command, signal: AbortSignal): Promise<Message> {
  signal.throwIfAborted();
  if (command.kind === "sample") {
    const values = crypto.getRandomValues(new Uint32Array(3));
    return {
      kind: "sampled",
      requestId: command.requestId,
      random: values[0]! / 2 ** 32,
      modeRandom: values[1]! / 2 ** 32,
      delayRandom: values[2]! / 2 ** 32,
    };
  }
  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, command.milliseconds);
    signal.addEventListener("abort", abort, { once: true });
  });
  signal.throwIfAborted();
  return { kind: "complete", requestId: command.requestId };
}
