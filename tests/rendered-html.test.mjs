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

test("server-renders the public data map shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>한난 공공데이터맵<\/title>/i);
  assert.match(html, /한난 공공데이터맵/);
  assert.match(html, /업무 도메인 지도/);
  assert.match(html, /데이터셋/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("uses the extracted portal dataset records", async () => {
  const data = await readFile(new URL("../app/data.ts", import.meta.url), "utf8");
  const recordCount = (data.match(/"kind":/g) ?? []).length;

  assert.equal(recordCount, 393);
  assert.match(data, /한국지역난방공사/);
  assert.match(data, /REST\/XML/);
  assert.match(data, /열요금/);
});
