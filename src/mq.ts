// deno-lint-ignore-file no-explicit-any
import type { MessageQueue, MessageQueueEnqueueOptions } from "@fedify/fedify";
import type { Redis, RedisKey } from "ioredis";
import { type Codec, JsonCodec } from "./codec.ts";

/**
 * Options for {@link RedisMessageQueue} class.
 */
export interface RedisMessageQueueOptions {
  /**
   * The unique identifier for the worker that is processing messages from the
   * queue.  If this is not specified, a random identifier will be generated.
   * This is used to prevent multiple workers from processing the same message,
   * so it should be unique for each worker.
   */
  workerId?: string;

  /**
   * The Pub/Sub channel key to use for the message queue.  `"fedify_channel"`
   * by default.
   */
  channelKey?: RedisKey;

  /**
   * The Sorted Set key to use for the delayed message queue.  `"fedify_queue"`
   * by default.
   */
  queueKey?: RedisKey;

  /**
   * The key to use for locking the message queue.  `"fedify_lock"` by default.
   */
  lockKey?: RedisKey;

  /**
   * The codec to use for encoding and decoding messages in the key-value store.
   * Defaults to {@link JsonCodec}.
   */
  codec?: Codec;

  /**
   * The interval at which to poll the message queue for delayed messages.
   * If this interval is too short, it may cause excessive load on the Redis
   * server.  If it is too long, it may cause messages to be delayed longer
   * than expected.
   *
   * 5 seconds by default.
   */
  loopInterval?: Temporal.DurationLike;
}

/**
 * A message queue that uses Redis as the underlying storage.
 *
 * @example
 * ```ts
 * import { createFederation } from "@fedify/fedify";
 * import { RedisMessageQueue } from "@fedify/redis";
 * import { Redis } from "ioredis";
 *
 * const federation = createFederation({
 *   // ...
 *   queue: new RedisMessageQueue(() => new Redis()),
 * });
 * ```
 */
export class RedisMessageQueue implements MessageQueue, Disposable {
  #redis: Redis;
  #subRedis: Redis;
  #workerId: string;
  #channelKey: RedisKey;
  #queueKey: RedisKey;
  #lockKey: RedisKey;
  #codec: Codec;
  #loopInterval: Temporal.Duration;
  #loopHandle?: ReturnType<typeof setInterval>;

  /**
   * Creates a new Redis message queue.
   * @param redis The Redis client factory.
   * @param options The options for the message queue.
   */
  constructor(redis: () => Redis, options: RedisMessageQueueOptions = {}) {
    this.#redis = redis();
    this.#subRedis = redis();
    this.#workerId = options.workerId ?? crypto.randomUUID();
    this.#channelKey = options.channelKey ?? "fedify_channel";
    this.#queueKey = options.queueKey ?? "fedify_queue";
    this.#lockKey = options.lockKey ?? "fedify_lock";
    this.#codec = options.codec ?? new JsonCodec();
    this.#loopInterval = Temporal.Duration.from(
      options.loopInterval ?? { seconds: 5 },
    );
  }

  async enqueue(
    message: any,
    options?: MessageQueueEnqueueOptions,
  ): Promise<void> {
    const ts = options?.delay == null
      ? 0
      : Temporal.Now.instant().add(options.delay).epochMilliseconds;
    const encodedMessage = this.#codec.encode(message);
    await this.#redis.zadd(this.#queueKey, ts, encodedMessage);
    if (ts < 1) this.#redis.publish(this.#channelKey, "");
  }

  async #poll(): Promise<any | undefined> {
    const result = await this.#redis.setnx(this.#lockKey, this.#workerId);
    if (result < 1) return;
    await this.#redis.expire(
      this.#lockKey,
      this.#loopInterval.total({ unit: "seconds" }) * 2,
    );
    const messages = await this.#redis.zrangebyscoreBuffer(
      this.#queueKey,
      0,
      Temporal.Now.instant().epochMilliseconds,
    );
    try {
      if (messages.length < 1) return;
      const message = messages[0];
      await this.#redis.zrem(this.#queueKey, message);
      return this.#codec.decode(message);
    } finally {
      await this.#redis.del(this.#lockKey);
    }
  }

  listen(handler: (message: any) => void | Promise<void>): void {
    if (this.#loopHandle != null) {
      throw new Error("Already listening");
    }
    this.#loopHandle = setInterval(async () => {
      const message = await this.#poll();
      if (message === undefined) return;
      await handler(message);
    }, this.#loopInterval.total({ unit: "milliseconds" }));
    this.#subRedis.subscribe(this.#channelKey, () => {
      this.#subRedis.on("message", async () => {
        const message = await this.#poll();
        if (message === undefined) return;
        await handler(message);
      });
    });
  }

  [Symbol.dispose](): void {
    clearInterval(this.#loopHandle);
    this.#redis.disconnect();
    this.#subRedis.disconnect();
  }
}
