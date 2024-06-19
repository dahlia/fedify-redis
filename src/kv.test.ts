import { assertEquals } from "@std/assert/assert-equals";
import { Redis } from "ioredis";
import { RedisKvStore } from "./kv.ts";

Deno.test("DenoKvStore", async (t) => {
  const redis = new Redis();
  const keyPrefix = `fedify_test_${crypto.randomUUID()}::`;
  const store = new RedisKvStore(redis, { keyPrefix });

  await t.step("get()", async () => {
    await redis.set(`${keyPrefix}foo::bar`, '"foobar"');
    assertEquals(await store.get(["foo", "bar"]), "foobar");
  });

  await t.step("set()", async () => {
    await store.set(["foo", "baz"], "baz");
    assertEquals(await redis.get(`${keyPrefix}foo::baz`), '"baz"');
  });

  await t.step("delete()", async () => {
    assertEquals(await redis.exists(`${keyPrefix}foo::baz`), 1);
    await store.delete(["foo", "baz"]);
    assertEquals(await redis.exists(`${keyPrefix}foo::baz`), 0);
  });

  redis.disconnect();
});
