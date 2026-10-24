// Browser regression against a disposable local lab (never HOMO/PROD).
// Run: node --test tests/lancamento-inline-complete.browser.mjs
// Required: TEST_BASE_URL, TEST_STORAGE_STATE, PLAYWRIGHT_MODULE (module name/path).
// All mutations are intercepted; the existing synthetic row is only read.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const base = process.env.TEST_BASE_URL;
test("inline completion: native pointer lifecycle, autosave and keyboard", {
  skip: !base && "requires a disposable local browser lab",
  timeout: 90000,
}, async t => {
  assert(["127.0.0.1", "localhost"].includes(new URL(base).hostname), "local lab only");
  const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  t.after(() => browser.close());

  async function setup(touch, width = 1366) {
    const context = await browser.newContext({ viewport: { width, height: width === 414 ? 896 : 768 }, hasTouch: touch, isMobile: touch && width === 414 });
    t.after(() => context.close());
    await context.addCookies(JSON.parse(readFileSync(process.env.TEST_STORAGE_STATE, "utf8")).cookies);
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    const mutations = [];
    let respond = async route => route.fulfill({ status: 500, json: { error: "Unexpected lab mutation" } });
    await page.route("**/api/**", async route => {
      if (["GET", "HEAD", "OPTIONS"].includes(route.request().method())) return route.continue();
      mutations.push({ method: route.request().method(), path: new URL(route.request().url()).pathname, body: route.request().postDataJSON() });
      return respond(route);
    });
    await page.goto(base + "/lancamentos");
    await page.waitForLoadState("networkidle");
    const data = await page.evaluate(async () => (await (await fetch("/api/lancamentos?porPagina=100")).json()).data);
    assert(data.length > 0, "lab must contain a synthetic row");
    const original = data[0], row = page.locator(`tr[data-row-id="${original.id}"]`);
    const pencil = () => row.getByRole("button", { name: "Editar lançamento", exact: true });
    const done = () => row.getByRole("button", { name: "Concluir edição", exact: true });
    const activate = locator => touch ? locator.tap() : locator.click();
    async function open() {
      await activate(pencil());
      await page.waitForFunction(id => document.activeElement?.closest("tr")?.dataset.rowId === id, original.id);
    }
    async function closed() {
      await row.locator(".lanc-inline-complete").waitFor({ state: "hidden" });
      assert.equal(await row.getAttribute("class"), "");
    }
    return { page, row, original, mutations, pencil, done, activate, open, closed,
      reply: fn => { respond = fn; },
      success: route => route.fulfill({ json: { ...original, ...route.request().postDataJSON(), versao: "lab-next-version" } }),
    };
  }

  await t.test("one touch completes once; no residual pencil click; deliberate next touch edits", async () => {
    const s = await setup(true, 414);
    await s.open();
    await s.done().scrollIntoViewIfNeeded();
    await s.row.evaluate(row => {
      window.inlineTrace = { events: [], completions: 0, wasEditing: true };
      new MutationObserver(() => {
        const editing = row.classList.contains("lanc-inline-editing");
        if (window.inlineTrace.wasEditing && !editing) window.inlineTrace.completions++;
        window.inlineTrace.wasEditing = editing;
      }).observe(row, { attributes: true, attributeFilter: ["class"] });
      for (const type of ["pointerdown", "pointerup", "click"]) row.addEventListener(type, event => {
        window.inlineTrace.events.push({ type, target: event.target.closest("button")?.getAttribute("aria-label") });
      }, true);
    });
    // touchscreen.tap emits a native down/up/click, with real hit testing after rerender.
    await s.done().tap();
    await s.closed();
    const trace = await s.page.evaluate(() => window.inlineTrace);
    assert.deepEqual(trace.events, ["pointerdown", "pointerup", "click"].map(type => ({ type, target: "Concluir edição" })));
    assert.equal(trace.completions, 1);
    assert.equal(s.mutations.length, 0);
    await s.open();
    assert.match(await s.row.getAttribute("class"), /lanc-inline-editing/);
    await s.done().tap();
    await s.closed();
    assert.equal(s.mutations.length, 0);
  });

  await t.test("touch waits for pending blur autosave; rapid repeated touch cannot duplicate it", async () => {
    const s = await setup(true);
    let release, received;
    const pending = new Promise(resolve => { received = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    s.reply(async route => { received(); await gate; await s.success(route); });
    await s.open();
    await s.row.locator('[data-col-key="descricao"] textarea').fill("TOUCH LAB ONLY");
    await s.done().tap();
    await pending;
    assert(await s.done().isDisabled());
    assert.match(await s.row.getAttribute("class"), /lanc-inline-editing/);
    const box = await s.done().boundingBox();
    await s.page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await s.page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    assert.equal(s.mutations.length, 1);
    assert.equal(s.mutations[0].method, "PUT");
    assert.equal(s.mutations[0].path, "/api/lancamentos/" + s.original.id);
    assert.deepEqual(s.mutations[0].body, { descricao: "TOUCH LAB ONLY", versao: s.original.versao });
    release();
    await s.closed();
    assert.equal(s.mutations.length, 1);
  });

  await t.test("failed autosave keeps editing and retry; completion adds no general save", async () => {
    const s = await setup(true);
    s.reply(route => route.fulfill({ status: 409, json: { error: "Conflito simulado no laboratório" } }));
    await s.open();
    await s.row.locator('[data-col-key="descricao"] textarea').fill("RETRY LAB ONLY");
    await s.done().tap();
    const retry = s.row.getByRole("button", { name: "Tentar novamente", exact: true });
    await retry.waitFor();
    assert(await s.done().isDisabled());
    assert.match(await s.row.getAttribute("class"), /lanc-inline-error/);
    assert.equal(s.mutations.length, 1);
    s.reply(s.success);
    await retry.tap();
    await retry.waitFor({ state: "hidden" });
    await s.done().tap();
    await s.closed();
    assert.equal(s.mutations.length, 2);
    assert.deepEqual(s.mutations[1], s.mutations[0]);
  });

  await t.test("mouse, keyboard, Esc, focus and NEW cancellation remain usable", async () => {
    for (const touch of [false, true]) {
      const s = await setup(touch);
      await s.open();
      const description = s.row.locator('[data-col-key="descricao"] textarea');
      await description.fill("DISCARD LAB DRAFT");
      await description.press("Escape");
      assert.equal(await description.inputValue(), s.original.descricao);
      await s.activate(s.done());
      await s.closed();
      const cell = s.row.locator('[data-col-key="descricao"]');
      await cell.focus();
      await s.page.keyboard.press("Enter");
      await description.waitFor();
      await s.page.waitForFunction(() => document.activeElement?.tagName === "TEXTAREA");
      await s.page.keyboard.press("Tab");
      assert(await s.page.evaluate(() => !!document.activeElement?.closest("tr[data-row-id]")));
      await s.done().focus();
      await s.page.keyboard.press("Enter");
      await s.closed();
      await s.open();
      await s.done().focus();
      await s.page.keyboard.press("Space");
      await s.closed();
      await s.activate(s.page.getByTitle("Cancelar novo lançamento", { exact: true }));
      await s.page.locator(".lanc-inline-new").waitFor({ state: "hidden" });
      assert.equal(s.mutations.length, 0);
    }
  });
});
