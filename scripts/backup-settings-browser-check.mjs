/* global console, sessionStorage, URL */
// Optional Playwright QA, ONLY the disposable localhost:3002 settings fixture.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } =
  await import("../.tools/visual-qa/node_modules/playwright/index.mjs");
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: "reduce",
});
const page = await context.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const origin = "http://localhost:3002",
  password = "DiarioLocale2026!";
let checks = 0;
const check = (value, name) => {
  assert.ok(value, name);
  console.log("PASS", name);
  checks++;
};
await mkdir(".tools/backup-settings-qa", { recursive: true });
await context.addInitScript(() => sessionStorage.setItem("akai-intro", "seen"));
try {
  await page.goto(origin + "/login");
  await page.getByLabel("Nome utente").fill("demo");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entra nel nostro diario" }).click();
  await page.locator(".diary-shell").waitFor();
  await page.goto(origin + "/settings");
  await page.getByRole("tab", { name: /Backup/ }).click();
  await page
    .getByRole("heading", { name: "Custodiamo la nostra storia" })
    .waitFor();
  const actualStatus = await (
    await page.request.get(origin + "/api/backup/status")
  ).json();
  await page.route("**/api/backup/status", (route) =>
    route.fulfill({
      json: {
        ...actualStatus,
        configuration: null,
        keyConfigured: false,
        ready: false,
        automaticActive: false,
        snapshotCount: 0,
        job: null,
      },
    }),
  );
  await page.reload();
  await page.getByRole("tab", { name: /Backup/ }).click();
  await page
    .getByLabel("Password di cifratura", { exact: true })
    .fill("SyntheticFirstSetup2026!");
  await page
    .getByLabel("Ripeti la password di cifratura")
    .fill("DifferentSynthetic2026!");
  await page.getByRole("checkbox", { name: /Ho compreso/ }).check();
  await page.getByRole("checkbox", { name: /Ho conservato/ }).check();
  await page.getByRole("button", { name: "Salva e prepara i backup" }).click();
  check(
    (await page.getByRole("alert").isVisible()) &&
      (await page.locator("dialog").count()) === 0,
    "First setup rejects mismatched encryption keys before sending them",
  );
  await page.screenshot({
    path: ".tools/backup-settings-qa/first-setup.png",
    fullPage: true,
  });
  await page.unroute("**/api/backup/status");
  await page.reload();
  await page.getByRole("tab", { name: /Backup/ }).click();
  await page
    .getByText("Password di cifratura già custodita", { exact: false })
    .waitFor();
  check(
    await page
      .getByText("Password di cifratura già custodita", { exact: false })
      .isVisible(),
    "Actual prepared repository is shown without its secret",
  );
  for (const width of [375, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    check(
      await page.evaluate("document.documentElement.scrollWidth <= innerWidth"),
      "Backup settings fit " + width + "px",
    );
    await page.screenshot({
      path: ".tools/backup-settings-qa/settings-" + width + ".png",
      fullPage: true,
    });
  }
  await page.getByLabel("Orario — Europe/Rome").fill("04:35");
  await page.getByRole("button", { name: "Salva e prepara i backup" }).click();
  await page.getByLabel("Password del tuo account").fill("WrongPassword2026!");
  await page.getByRole("button", { name: "Conferma", exact: true }).click();
  await page.locator('dialog [role="alert"]').waitFor();
  check(
    await page.locator("dialog").isVisible(),
    "Wrong account password preserves configuration dialog",
  );
  await page.getByLabel("Password del tuo account").fill(password);
  await page.getByRole("button", { name: "Conferma", exact: true }).click();
  await page.locator("dialog").waitFor({ state: "detached" });
  await page
    .getByRole("button", { name: "Salva e prepara i backup" })
    .waitFor({ state: "visible" });
  await page.locator(".backup-job.success").waitFor();
  check(
    true,
    "UI save, password confirmation and asynchronous preparation complete",
  );
  await page.getByRole("button", { name: "Crea una copia adesso" }).click();
  await page.getByLabel("Password del tuo account").fill(password);
  await page.getByRole("button", { name: "Conferma", exact: true }).click();
  await page.locator("dialog").waitFor({ state: "detached" });
  await page.locator(".backup-job.running").waitFor();
  await page.locator(".backup-job.success").waitFor({ timeout: 120000 });
  check(true, "UI follows a real cold backup across API downtime");
  // Register a synthetic UV-capable authenticator through the existing account UI.
  const cdp = await context.newCDPSession(page);
  const me = await (await page.request.get(origin + "/api/auth/me")).json();
  if (me.lock.enabled) {
    await page.request.put(origin + "/api/auth/lock/preferences", {
      headers: { Origin: origin, "X-CSRF-Token": me.csrf },
      data: { enabled: false, timeoutSeconds: 300 },
    });
  }
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  await page.getByRole("tab", { name: /Il tuo account/ }).click();
  await page.getByRole("switch", { name: "Attiva blocco biometrico" }).click();
  await page.getByLabel("Password del tuo account").fill(password);
  await page.getByRole("button", { name: "Conferma e continua" }).click();
  await page.locator("dialog").waitFor({ state: "detached" });
  await page.getByRole("button", { name: "Blocca adesso" }).click();
  await page.locator(".diary-gate-card").waitFor();
  for (const [width, height] of [
    [1440, 900],
    [375, 667],
    [430, 932],
    [768, 1024],
    [667, 375],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(100);
    const geometry = await page.evaluate(
      '(()=>{const c=document.querySelector(".diary-gate-card").getBoundingClientRect(); const g=document.querySelector(".diary-gate").getBoundingClientRect();return {delta:Math.abs(c.top+c.height/2-(g.top+g.height/2)),top:c.top,bottom:c.bottom,height:innerHeight,overflow:getComputedStyle(document.documentElement).overflowY};})()',
    );
    check(
      geometry.delta < 2 &&
        geometry.top >= 0 &&
        geometry.bottom <= height &&
        geometry.overflow === "hidden",
      "Lock card stays centered and fits " + width + "×" + height,
    );
    await page.mouse.wheel(0, 800);
    const after = await page.locator(".diary-gate-card").boundingBox();
    check(
      Math.abs(after.y - geometry.top) < 1,
      "Lock card remains fixed on scroll " + width + "×" + height,
    );
    await page.screenshot({
      path: ".tools/backup-settings-qa/lock-" + width + "x" + height + ".png",
    });
  }
  await page.setViewportSize({ width: 375, height: 667 });
  await page
    .getByRole("button", { name: "Usa la password", exact: true })
    .click();
  await page.waitForTimeout(150);
  // Simulate browsers where the keyboard shrinks only VisualViewport.
  await page.evaluate(
    'document.documentElement.style.setProperty("--visual-height","330px")',
  );
  await page.waitForTimeout(100);
  const geometry = await page.locator(".diary-gate-card").boundingBox();
  await page.screenshot({
    path: ".tools/backup-settings-qa/lock-keyboard.png",
  });
  console.log("KEYBOARD_GEOMETRY", geometry);
  check(
    geometry.y >= 0 && geometry.y + geometry.height <= 330,
    "Password card fits keyboard-sized visual viewport without scrolling",
  );
  await page.getByLabel("Password del tuo account").fill(password);
  await page
    .getByRole("button", { name: "Sblocca con la password", exact: true })
    .click();
  await page.locator(".diary-shell").waitFor();
  check(
    await page.evaluate(
      'getComputedStyle(document.documentElement).overflowY !== "hidden"',
    ),
    "Unlock restores page scrolling",
  );
  check(
    new URL(page.url()).pathname === "/settings",
    "Unlock preserves the requested route",
  );
  check(
    errors.length === 0,
    "No browser JavaScript errors: " + errors.join(";"),
  );
  console.log("Completed " + checks + " browser checks");
} finally {
  await browser.close();
}
