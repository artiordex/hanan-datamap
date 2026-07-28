import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the public data JSON browser", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>한국지역난방공사 공공데이터 JSON<\/title>/i);
  assert.match(html, /한국지역난방공사 공공데이터 JSON/);
  assert.match(html, /JSON 내려받기/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("uses the generated JSON dataset", async () => {
  const raw = await readFile(
    new URL("../public/data/hanan-datasets.json", import.meta.url),
    "utf8",
  );
  const catalog = JSON.parse(raw);

  assert.equal(catalog.source.organization, "한국지역난방공사");
  assert.equal(catalog.summary.total, 393);
  assert.equal(catalog.summary.files, 377);
  assert.equal(catalog.summary.apis, 16);
  assert.ok(catalog.datasets.some((record) => record.sourceId === "15157841"));
});
