import { build, emptyDir } from "@deno/dnt";
import metadata from "./deno.json" with { type: "json" };

await emptyDir("./npm");

const importMap = ".dnt-import-map.json";
await Deno.writeTextFile(
  importMap,
  JSON.stringify({
    imports: {
      ...metadata.imports,
      "@fedify/fedify": metadata.imports["@fedify/fedify"]
        .replace(/^jsr:/, "npm:"),
    },
  }),
);

await build({
  package: {
    // package.json properties
    name: metadata.name,
    version: Deno.args[0] ?? metadata.version,
    description: "Redis drivers for Fedify",
    keywords: ["fedify", "redis"],
    license: "MIT",
    author: {
      name: "Hong Minhee",
      email: "hong@minhee.org",
      url: "https://hongminhee.org/",
    },
    homepage: "https://github.com/dahlia/fedify-redis",
    repository: {
      type: "git",
      url: "git+https://github.com/dahlia/fedify-redis.git",
    },
    bugs: {
      url: "https://github.com/dahlia/fedify-redis/issues",
    },
  },
  outDir: "./npm",
  entryPoints: ["./mod.ts"],
  importMap,
  shims: { deno: true },
  typeCheck: "both",
  declaration: "separate",
  declarationMap: true,
  test: true,
  async postBuild() {
    await Deno.copyFile("LICENSE", "npm/LICENSE");
    await Deno.copyFile("README.md", "npm/README.md");
  },
});

await Deno.remove(importMap);

// cSpell: ignore Minhee
