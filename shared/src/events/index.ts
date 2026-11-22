type Writer = { write: (frame: string) => void; close: () => void };

type Options = {
  signal: AbortSignal;
  interval: number;
  slowReader: "skip" | "close";
  subscribe: (notify: () => void) => () => void;
  send: (writer: Writer) => void;
};

/** Own the transport lifecycle; callers retain authorization, payloads and subscriptions. */
export function createEventStreams() {
  const closers = new Set<() => void>();
  const encoder = new TextEncoder();

  return {
    close: () => {
      for (const close of closers) close();
    },
    response(options: Options) {
      let ended = false;
      let cleanup = () => {};

      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          let clearTimer = () => {};
          let unsubscribe = () => {};

          const stop = () => {
            if (ended) return;
            ended = true;
            cleanup();
            controller.close();
          };

          const writer: Writer = {
            write(frame) {
              if (!ended) controller.enqueue(encoder.encode(frame));
            },
            close: stop,
          };

          const send = () => {
            if (ended) return;

            if ((controller.desiredSize ?? 0) <= 0) {
              if (options.slowReader === "close") stop();

              return;
            }

            try {
              options.send(writer);
            } catch {
              stop();
            }
          };

          cleanup = () => {
            clearTimer();
            unsubscribe();
            closers.delete(stop);
            options.signal.removeEventListener("abort", stop);
          };

          closers.add(stop);
          options.signal.addEventListener("abort", stop, { once: true });

          if (options.signal.aborted) {
            stop();

            return;
          }

          const timer = setInterval(send, options.interval);
          clearTimer = () => clearInterval(timer);
          timer.unref();

          try {
            unsubscribe = options.subscribe(send);
          } catch (error) {
            stop();
            throw error;
          }

          // Subscribing may synchronously notify or abort before returning its cleanup.
          if (ended) {
            unsubscribe();

            return;
          }

          send();
        },
        cancel() {
          if (ended) return;
          ended = true;
          cleanup();
        },
      });

      return new Response(body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
        },
      });
    },
  };
}
