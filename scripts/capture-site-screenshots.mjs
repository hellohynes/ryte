// Recaptures the website's hero screenshots from the built app, on the synthetic notes in
// scripts/site-screenshots/notes (never real notes). Usage, from the repo root after `pnpm build:local`:
//   node scripts/capture-site-screenshots.mjs
// Writes site/assets/ryte-app-dark.webp and ryte-app-light.webp. The window is laid out at 1440x900 and
// captured at 2x, like the macOS window the page's traffic lights are drawn for. Needs Python with Pillow
// for the PNG to webp step (`python3 -m pip install pillow`).
import { spawn, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const app = resolve(root, "app");
const notes = resolve(root, "scripts/site-screenshots/notes");
const OPEN_NOTE = "pricing-decision.md";
const PORT = 9355;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function capture(theme, pngPath) {
  const profile = mkdtempSync(join(tmpdir(), "ryte-site-shot-"));
  writeFileSync(
    join(profile, "settings.json"),
    JSON.stringify({ notesRoot: notes, colorMode: theme }) + "\n",
  );
  const electron = spawn(
    resolve(app, "node_modules/.bin/electron"),
    [".", `--remote-debugging-port=${PORT}`],
    {
      cwd: app,
      env: { ...process.env, RYTE_USER_DATA_DIR: profile },
      stdio: "ignore",
    },
  );
  try {
    let target;
    for (let i = 0; i < 60 && !target; i++) {
      await sleep(500);
      try {
        const list = await (
          await fetch(`http://127.0.0.1:${PORT}/json`)
        ).json();
        target = list.find((t) => t.type === "page");
      } catch {
        /* the app is still starting */
      }
    }
    if (!target)
      throw new Error(
        "The app did not open a page. Run `pnpm build:local` first.",
      );
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((done) => (socket.onopen = done));
    let id = 0;
    const pending = new Map();
    socket.onmessage = (message) => {
      const data = JSON.parse(message.data);
      if (data.id && pending.has(data.id)) pending.get(data.id)(data);
    };
    const send = (method, params = {}) =>
      new Promise((done) => {
        pending.set(++id, done);
        socket.send(JSON.stringify({ id, method, params }));
      });
    const run = async (expression) =>
      (await send("Runtime.evaluate", { expression, returnByValue: true }))
        .result.result.value;

    await sleep(6000);
    await send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 900,
      deviceScaleFactor: 2,
      mobile: false,
    });
    await sleep(1000);
    await run(
      `[...document.querySelectorAll('[role=treeitem]')].find((e) => (e.getAttribute('aria-label') || e.textContent).trim().startsWith('${OPEN_NOTE}')).click()`,
    );
    await sleep(3500);
    await run("document.activeElement?.blur?.()");
    await sleep(600);
    const shot = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(pngPath, Buffer.from(shot.result.data, "base64"));
    socket.close();
  } finally {
    // Electron keeps writing to its profile while it shuts down, so wait for it before deleting.
    const exited = new Promise((done) => electron.once("exit", done));
    electron.kill();
    await Promise.race([exited, sleep(5000)]);
    rmSync(profile, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 300,
    });
  }
}

const work = mkdtempSync(join(tmpdir(), "ryte-site-png-"));
mkdirSync(resolve(root, "site/assets"), { recursive: true });
for (const theme of ["dark", "light"]) {
  const png = join(work, `${theme}.png`);
  await capture(theme, png);
  const out = resolve(root, `site/assets/ryte-app-${theme}.webp`);
  const convert = spawnSync(
    "python3",
    [
      "-c",
      'import sys; from PIL import Image; Image.open(sys.argv[1]).convert("RGB").save(sys.argv[2], "WEBP", quality=84, method=6)',
      png,
      out,
    ],
    { stdio: "inherit" },
  );
  if (convert.status !== 0)
    throw new Error("Converting to webp failed (is Pillow installed?).");
  console.log(
    `Wrote ${out.replace(root + "/", "")} (${Math.round(readFileSync(out).length / 1024)} KB)`,
  );
}
rmSync(work, { recursive: true, force: true });
