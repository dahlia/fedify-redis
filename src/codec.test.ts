import { assertEquals } from "@std/assert/assert-equals";
import { assertThrows } from "@std/assert/assert-throws";
import { Buffer } from "node:buffer";
import { DecodingError, EncodingError, JsonCodec } from "./codec.ts";

Deno.test("JsonCodec", async (t) => {
  const codec = new JsonCodec();

  await t.step("encode()", () => {
    assertEquals(
      codec.encode({ foo: "bar" }),
      Buffer.from(new TextEncoder().encode('{"foo":"bar"}')),
    );
    assertThrows(
      () => codec.encode(1n),
      EncodingError,
    );
  });

  await t.step("decode()", () => {
    assertEquals(
      codec.decode(Buffer.from(new TextEncoder().encode('{"foo":"bar"}'))),
      { foo: "bar" },
    );
    assertThrows(
      () => codec.decode(Buffer.from(new TextEncoder().encode("invalid"))),
      DecodingError,
    );
  });
});
