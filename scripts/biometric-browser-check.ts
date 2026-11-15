/** Writes ONLY synthetic accounts on the dedicated localhost:3001 preview.
 * Optional Playwright install and complete procedure: docs/BIOMETRIC-LOCK.md.
 */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
const moduleUrl = new URL(
  "../.tools/visual-qa/node_modules/playwright/index.mjs",
  import.meta.url,
).href;
const { chromium } = await import(moduleUrl);
const origin = "http://localhost:3001",
  password = "DiarioLocale2026!";
const output = ".tools/biometric-qa";
await mkdir(output, { recursive: true });
const results: string[] = [],
  errors: string[] = [];
const check = (value: unknown, name: string) => {
  assert.ok(value, name);
  results.push(name);
  console.log("PASS", name);
};
for (let attempt = 0; attempt < 30; attempt++) {
  if (
    await fetch(origin + "/api/health")
      .then((r) => r.ok)
      .catch(() => false)
  )
    break;
  if (attempt === 29) throw new Error("Dedicated preview is unavailable");
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
const trace: unknown[] = [];
page.on("response", async (r: any) => {
  if (/\/api\/auth\/(me|lock\/)/.test(r.url())) {
    const data = await r.json().catch(() => ({}));
    const s = data.lock ?? data;
    trace.push({
      at: Date.now(),
      url: r.url(),
      status: r.status(),
      locked: s.locked,
      enabled: s.enabled,
      deadline: s.deadline,
      serverTime: s.serverTime,
    });
  }
});
page.setDefaultTimeout(15_000);
context.on("page", (p: any) =>
  p.on("pageerror", (e: Error) => errors.push(e.message)),
);
page.on("pageerror", (e: Error) => errors.push(e.message));
await context.addInitScript(() => {
  try {
    sessionStorage.setItem("akai-intro", "seen");
  } catch {
    /* about:blank has no storage. */
  }
});
async function login(p: any, username: string) {
  await p.goto(origin + "/login");
  await p.getByLabel("Nome utente").fill(username);
  await p.getByLabel("Password", { exact: true }).fill(password);
  await p.getByRole("button", { name: "Entra nel nostro diario" }).click();
  await p.locator(".diary-shell").waitFor();
}
async function account(p = page) {
  if (await p.locator(".diary-shell").count())
    await p.locator('a[href="/settings"]:visible').first().click();
  else await p.goto(origin + "/settings");
  await p.getByRole("tab", { name: /Il tuo account/ }).click();
  await p.locator(".diary-protection").waitFor();
}
async function identity(name?: string) {
  await page.getByLabel("Password del tuo account").fill(password);
  if (name) await page.getByLabel("Nome della passkey").fill(name);
  await page.getByRole("button", { name: "Conferma e continua" }).click();
  await page.locator("dialog").waitFor({ state: "detached" });
}
async function state(p = page) {
  return (await p.request.get(origin + "/api/auth/me")).json();
}
async function post(p: any, url: string, body = {}) {
  const me = await state(p);
  return p.request.post(origin + "/api" + url, {
    headers: { Origin: origin, "X-CSRF-Token": me.csrf },
    data: body,
  });
}
try {
  const cd = await context.newCDPSession(page);
  await cd.send("WebAuthn.enable");
  const addAuthenticator = async () =>
    (
      await cd.send("WebAuthn.addVirtualAuthenticator", {
        options: {
          protocol: "ctap2",
          transport: "internal",
          hasResidentKey: true,
          hasUserVerification: true,
          isUserVerified: true,
          automaticPresenceSimulation: true,
        },
      })
    ).authenticatorId;
  let authenticatorId = await addAuthenticator();
  await login(page, "demo");
  check(
    !(await state()).lock.enabled,
    "Existing synthetic account starts with protection disabled",
  );
  const initialKeys = await (
    await page.request.get(origin + "/api/auth/passkeys")
  ).json();
  assert.equal(
    initialKeys.items.length,
    0,
    "Use a fresh preview or remove virtual test keys first",
  );
  let memory: any;
  const list = await (await page.request.get(origin + "/api/memories")).json();
  memory = list.items.find(
    (m: any) => m.title === "Un ricordo di prova — passkey",
  );
  if (!memory) {
    const png = await sharp({
      create: { width: 900, height: 650, channels: 3, background: "#a7b9ac" },
    })
      .png()
      .toBuffer();
    const me = await state();
    const response = await page.request.post(origin + "/api/memories", {
      headers: { Origin: origin, "X-CSRF-Token": me.csrf },
      multipart: {
        payload: JSON.stringify({
          memory: {
            title: "Un ricordo di prova — passkey",
            eventDate: "2026-11-01",
            category: "Momenti speciali",
            location: "Luogo dimostrativo",
            description:
              "Una pagina sintetica per verificare la protezione del diario.\n\n".repeat(
                35,
              ),
          },
          photos: ["new:0"],
          cover: "new:0",
        }),
        photos: { name: "synthetic.png", mimeType: "image/png", buffer: png },
      },
    });
    assert.equal(response.status(), 201, await response.text());
    memory = await response.json();
  }
  memory = await (
    await page.request.get(origin + "/api/memories/" + memory.id)
  ).json();
  const mediaId = memory.photos[0].id;
  await account();
  await page.getByRole("switch", { name: "Attiva blocco biometrico" }).click();
  await identity("Autenticatore virtuale QA");
  check(
    (await state()).lock.enabled && (await state()).lock.timeoutSeconds === 300,
    "UI registers real virtual passkey and enables default five-minute lock",
  );
  const credentials = await cd.send("WebAuthn.getCredentials", {
    authenticatorId,
  });
  check(
    credentials.credentials.length === 1,
    "Resident credential exists in virtual authenticator",
  );
  check(
    await page
      .getByRole("button", {
        name: "Rimuovi passkey Autenticatore virtuale QA",
      })
      .isDisabled(),
    "Last passkey cannot be removed while protection is enabled",
  );
  for (const width of [375, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator(".diary-protection").scrollIntoViewIfNeeded();
    check(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      width + "px settings has no horizontal overflow",
    );
    await page.screenshot({ path: output + "/settings-" + width + ".png" });
  }
  await cd.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId });
  authenticatorId = await addAuthenticator();
  await page
    .getByRole("button", { name: "Aggiungi una passkey", exact: true })
    .click();
  await identity("Seconda passkey QA");
  check(
    (await page.locator(".passkey-list li").count()) === 2,
    "UI adds a second independent passkey",
  );
  await page
    .getByRole("button", { name: "Rimuovi passkey Seconda passkey QA" })
    .click();
  await identity();
  check(
    (await page.locator(".passkey-list li").count()) === 1,
    "UI revokes the selected passkey after password confirmation",
  );
  await cd.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId });
  authenticatorId = await addAuthenticator();
  await cd.send("WebAuthn.addCredential", {
    authenticatorId,
    credential: credentials.credentials[0],
  });
  for (const timeout of [60, 900, 0]) {
    await page
      .getByLabel("Tempo prima del blocco")
      .selectOption(String(timeout));
    await page.getByRole("button", { name: "Salva tempo di blocco" }).click();
    await identity();
    check(
      (await state()).lock.timeoutSeconds === timeout,
      "UI persists timeout " + timeout,
    );
  }
  // Keep another visible page present, then lock from its genuine UI action.
  const other = await context.newPage();
  await account(other);
  await page.bringToFront();
  if ((await state()).lock.locked) {
    await page
      .getByRole("button", { name: "Sblocca il diario", exact: true })
      .click();
    await page.locator(".diary-shell").waitFor();
  }
  const target = origin + "/memories/" + memory.id + "?from=biometric-check";
  await page.goto(target);
  await page.locator(".detail-page").waitFor();
  await page
    .locator(".detail-gallery img")
    .first()
    .evaluate((img: HTMLImageElement) => img.decode());
  await page.evaluate(
    "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
  );
  await page.evaluate(() => scrollTo(0, 800));
  const scroll = await page.evaluate(() => scrollY);
  await other.getByRole("button", { name: "Blocca adesso" }).click();
  await page
    .getByRole("heading", { name: "Il nostro diario è protetto." })
    .waitFor();
  check(
    (await page.locator(".diary-shell img").count()) === 0,
    "Confirmed lock unmounts all private photos and shell",
  );
  check(
    await other
      .getByRole("heading", { name: "Il nostro diario è protetto." })
      .isVisible(),
    "Lock propagates across tabs",
  );
  await other.addInitScript(() => {
    Object.defineProperty(crypto, "randomUUID", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(window, "PublicKeyCredential", {
      configurable: true,
      value: undefined,
    });
  });
  await other.reload();
  await other
    .getByRole("heading", { name: "Il nostro diario è protetto." })
    .waitFor();
  check(
    (await other
      .getByRole("button", { name: "Sblocca il diario", exact: true })
      .isDisabled()) &&
      (await other
        .getByRole("button", { name: "Usa la password", exact: true })
        .isEnabled()),
    "Browser without WebAuthn keeps password recovery available",
  );
  for (const url of [
    "/memories",
    "/memories/" + memory.id,
    "/collections",
    "/world",
    "/settings",
    ...["thumb", "display", "original"].map(
      (size) => "/media/" + mediaId + "/" + size,
    ),
  ]) {
    const r = await page.request.get(origin + "/api" + url);
    check(
      r.status() === 423 && r.headers()["cache-control"] === "no-store",
      "Locked API refuses actual private resource " + url,
    );
  }
  await page.reload();
  await page
    .getByRole("heading", { name: "Il nostro diario è protetto." })
    .waitFor();
  check(
    page.url() === target,
    "Reload preserves locked route and query parameters",
  );
  for (const width of [375, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    check(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      width + "px gate has no horizontal overflow",
    );
    for (const button of await page.locator(".diary-gate .button").all())
      check(
        (await button.boundingBox()).height >= 44,
        width + "px gate has accessible touch target",
      );
    await page.screenshot({ path: output + "/gate-" + width + ".png" });
  }
  // Deliberately canceled browser ceremony; cryptographic success below uses CDP.
  await page.evaluate(`(() => {
    const original = navigator.credentials.get.bind(navigator.credentials);
    Object.defineProperty(navigator.credentials, "get", { configurable: true,
      value: () => {
        Object.defineProperty(navigator.credentials, "get", { configurable: true, value: original });
        return Promise.reject(new DOMException("Canceled for UI test", "NotAllowedError"));
      }
    });
  })()`);
  await page
    .getByRole("button", { name: "Sblocca il diario", exact: true })
    .click();
  await page.getByRole("alert").waitFor();
  check(
    (await state()).lock.locked,
    "Canceled ceremony keeps server session locked",
  );
  await page.evaluate(`(() => {
    const original = navigator.credentials.get.bind(navigator.credentials);
    Object.defineProperty(navigator.credentials, "get", { configurable: true, value: () => {
      Object.defineProperty(navigator.credentials, "get", { configurable: true, value: original });
      return Promise.reject(new DOMException("Unavailable authenticator for UI test", "UnknownError"));
    }});
  })()`);
  await page
    .getByRole("button", { name: "Sblocca il diario", exact: true })
    .click();
  await page.getByRole("alert").waitFor();
  check(
    (await state()).lock.locked,
    "Authenticator error cannot unlock the session",
  );
  await page
    .getByRole("button", { name: "Sblocca il diario", exact: true })
    .click();
  await page.locator(".diary-shell").waitFor();
  check(
    !(await state()).lock.locked && page.url() === target,
    "Real virtual assertion unlocks the same route",
  );
  await page.waitForFunction((y: number) => Math.abs(scrollY - y) < 5, scroll);
  check(true, "Scroll restored after lock and reload");
  // Set background via actual server endpoint, simulate browser visibility lifecycle.
  await other.close();
  await page.locator("textarea").fill("Una bozza privata non ancora inviata");
  let release!: () => void, seen!: () => void;
  const paused = new Promise<void>((resolve) => {
    release = resolve;
  });
  const captured = new Promise<void>((resolve) => {
    seen = resolve;
  });
  await page.route("**/api/auth/me", async (route: any) => {
    const response = await route.fetch();
    seen();
    await paused;
    await route.fulfill({ response });
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await captured;
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  check(
    await page.locator(".privacy-curtain").isVisible(),
    "Blur immediately covers the diary with an opaque neutral curtain",
  );
  const oldResponse = page.waitForResponse("**/api/auth/me");
  release();
  await oldResponse;
  await page.evaluate(
    "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
  );
  check(
    await page.locator(".privacy-curtain").isVisible(),
    "Late status response cannot remove a newer privacy curtain",
  );
  await page.unroute("**/api/auth/me");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.locator(".privacy-curtain").waitFor({ state: "hidden" });
  check(
    (await page.locator("textarea").inputValue()) ===
      "Una bozza privata non ancora inviata",
    "Short focus change preserves an unsent draft",
  );
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  for (let attempt = 0; attempt < 30; attempt++) {
    if ((await state()).lock.locked) break;
    if (attempt === 29)
      throw new Error("Background did not lock the server session");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    );
  });
  await page
    .getByRole("heading", { name: "Il nostro diario è protetto." })
    .waitFor();
  check(
    true,
    "Immediate background lock and simulated bfcache restore recheck the server",
  );
  await page
    .getByRole("button", { name: "Usa la password", exact: true })
    .click();
  await page.getByLabel("Password del tuo account").fill("PasswordSbagliata!");
  await page.getByRole("button", { name: "Sblocca con la password" }).click();
  await page.getByRole("alert").waitFor();
  check(
    (await state()).lock.locked,
    "Wrong recovery password cannot unlock the session",
  );
  await page.getByLabel("Password del tuo account").fill(password);
  await page.getByRole("button", { name: "Sblocca con la password" }).click();
  await page.locator(".diary-shell").waitFor();
  check(
    !(await state()).lock.locked,
    "Real backend password recovery unlocks the diary",
  );
  const partnerContext = await browser.newContext();
  const partner = await partnerContext.newPage();
  await partnerContext.addInitScript(() => {
    try {
      sessionStorage.setItem("akai-intro", "seen");
    } catch {
      /* about:blank has no storage. */
    }
  });
  await login(partner, "partner");
  check(
    !(await state(partner)).lock.enabled &&
      (await (await partner.request.get(origin + "/api/auth/passkeys")).json())
        .items.length === 0,
    "Second account has independent settings and credentials",
  );
  await partnerContext.close();
  await page.bringToFront();
  if ((await state()).lock.locked) {
    await page
      .getByRole("heading", { name: "Il nostro diario è protetto." })
      .waitFor();
    await page
      .getByRole("button", { name: "Sblocca il diario", exact: true })
      .click();
    await page.locator(".diary-shell").waitFor();
  }
  await account();
  await page.getByLabel("Tempo prima del blocco").selectOption("300");
  await page
    .getByRole("switch", { name: "Disattiva blocco biometrico" })
    .click();
  await identity();
  check(
    !(await state()).lock.enabled,
    "Protection can be disabled after password confirmation",
  );
  await page
    .getByRole("button", { name: "Rimuovi passkey Autenticatore virtuale QA" })
    .click();
  await identity();
  check(
    (await page.locator(".passkey-list li").count()) === 0,
    "Final virtual passkey revoked; preview ready for a real device",
  );
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  check(
    !(await page.locator(".privacy-curtain").isVisible()),
    "Disabled protection does not interrupt normal browser interactions",
  );
  // Exercise expiry without cookie clearing, then standard login still works.
  await post(page, "/auth/logout");
  await page.reload();
  await page.getByRole("button", { name: "Entra nel nostro diario" }).waitFor();
  check(true, "Logout removes access and restores traditional login");
  check(
    errors.length === 0,
    "No browser JavaScript errors: " + errors.join(", "),
  );
  await writeFile(
    output + "/results.json",
    JSON.stringify(
      { checks: results.length, results, errors, physicalDevice: false },
      null,
      2,
    ),
  );
  console.log("Completed", results.length, "checks");
} catch (error) {
  await writeFile(
    output + "/failure-trace.json",
    JSON.stringify(
      {
        trace,
        state: (await state()).lock,
        dom: await page.evaluate(() => ({
          shield: document.documentElement.dataset.diaryShield,
          hidden: document.hidden,
          y: scrollY,
          scroll: sessionStorage.getItem("akai-lock-scroll"),
        })),
      },
      null,
      2,
    ),
  ).catch(() => {});
  await page.screenshot({ path: output + "/failure.png" }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
