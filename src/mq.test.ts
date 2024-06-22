import { assertEquals, assertGreater } from "@std/assert";
import { delay } from "@std/async/delay";
import { Redis } from "ioredis";
import { RedisMessageQueue } from "./mq.ts";

Deno.test("RedisMessageQueue", async (t) => {
  const channelKey = `fedify_test_channel_${crypto.randomUUID()}`;
  const queueKey = `fedify_test_queue_${crypto.randomUUID()}`;
  const lockKey = `fedify_test_lock_${crypto.randomUUID()}`;
  const mq = new RedisMessageQueue(() => new Redis(), {
    loopInterval: { seconds: 1 },
    channelKey,
    queueKey,
    lockKey,
  });
  const mq2 = new RedisMessageQueue(() => new Redis(), {
    loopInterval: { seconds: 1 },
    channelKey,
    queueKey,
    lockKey,
  });

  const messages: string[] = [];
  mq.listen((message: string) => {
    messages.push(message);
  });
  mq2.listen((message: string) => {
    messages.push(message);
  });

  await t.step("enqueue()", async () => {
    await mq.enqueue("Hello, world!");
  });

  await waitFor(() => messages.length > 0, 15_000);

  await t.step("listen()", () => {
    assertEquals(messages, ["Hello, world!"]);
  });

  let started = 0;
  await t.step("enqueue() with delay", async () => {
    started = Date.now();
    await mq.enqueue(
      "Delayed message",
      { delay: Temporal.Duration.from({ seconds: 3 }) },
    );
  });

  await waitFor(() => messages.length > 1, 15_000);

  await t.step("listen() with delay", () => {
    assertEquals(messages, ["Hello, world!", "Delayed message"]);
    assertGreater(Date.now() - started, 3_000);
  });

  mq[Symbol.dispose]();
  mq2[Symbol.dispose]();
});

async function waitFor(
  predicate: () => boolean,
  timeoutMs: number,
): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    await delay(500);
    if (Date.now() - started > timeoutMs) {
      throw new Error("Timeout");
    }
  }
}
