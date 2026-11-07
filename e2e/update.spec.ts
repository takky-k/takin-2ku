import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";

test("real service-worker update replaces cached shell and keeps imported IndexedDB records", async ({
  page,
  context,
}) => {
  let release = 1;
  const root = resolve("dist");
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      let path = decodeURIComponent(url.pathname).replace(/^\/takin-2ku\//, "");
      if (!path) path = "index.html";
      const full = resolve(root, path);
      if (!full.startsWith(root + sep)) {
        res.writeHead(404).end();
        return;
      }
      let body: Buffer | string = await readFile(full);
      const mime: Record<string, string> = {
        ".html": "text/html",
        ".js": "application/javascript",
        ".css": "text/css",
        ".png": "image/png",
        ".webmanifest": "application/manifest+json",
      };
      if (path === "sw.js")
        body =
          body
            .toString()
            .replace(
              /("revision":")[^"]+(","url":"index.html")/,
              `$1release-${release}$2`,
            ) + `\n// test release ${release}`;
      if (path === "index.html")
        body = body
          .toString()
          .replace(
            "<title>takin' 2ku</title>",
            `<title>takin' 2ku test ${release}</title>`,
          );
      res
        .writeHead(200, {
          "Content-Type": mime[extname(full)] ?? "application/octet-stream",
          "Cache-Control": "no-store",
        })
        .end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("No test server");
  try {
    await page.goto(`http://127.0.0.1:${address.port}/takin-2ku/`);
    await expect(
      page.getByRole("heading", {
        name: "今日のコンディション",
        exact: true,
        level: 2,
      }),
    ).toBeVisible();
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect(page).toHaveTitle("takin' 2ku test 1");
    await page.getByRole("link", { name: "設定", exact: true }).click();
    const payload = {
      app: "takin-2ku-workout",
      schemaVersion: 1,
      importId: "synthetic-e2e",
      dateLocal: "2026-02-03",
      name: "更新保持の合成記録",
      unit: "lb",
      exercises: [
        {
          exerciseName: "ペックデック",
          sets: [{ weight: 20, reps: 6, rir: { min: 1, max: 2 }, notes: "" }],
        },
      ],
    };
    const upload = async () => {
      await page
        .getByLabel("トレーニングJSONファイル", { exact: true })
        .setInputFiles({
          name: "synthetic.json",
          mimeType: "application/json",
          buffer: Buffer.from(JSON.stringify(payload)),
        });
      await page
        .getByRole("button", { name: "確認して実績を保存", exact: true })
        .click();
    };
    await upload();
    await expect(
      page.getByText("取り込み完了：追加1セット、RIR修正0セット", {
        exact: true,
      }),
    ).toBeVisible();
    await upload();
    await expect(
      page.getByText("取込済みです。重複登録しません。", { exact: true }),
    ).toBeVisible();
    release = 2;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(
      page.getByRole("button", { name: "更新する", exact: true }),
    ).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: "更新する", exact: true }).click();
    await expect(page).toHaveTitle("takin' 2ku test 2");
    await page.getByRole("link", { name: "分析", exact: true }).click();
    await page
      .getByRole("link", {
        name: "保存したトレーニング記録を確認",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", { name: /更新保持の合成記録/ }),
    ).toHaveCount(1);
    await context.setOffline(true);
    await page.reload();
    await expect(
      page.getByRole("button", { name: /更新保持の合成記録/ }),
    ).toHaveCount(1);
    await expect(page).toHaveTitle("takin' 2ku test 2");
  } finally {
    await context.setOffline(false);
    await new Promise<void>((ok, fail) =>
      server.close((e) => (e ? fail(e) : ok())),
    );
  }
});
