import { test, expect } from "@playwright/test";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.locator('input[type="password"]').fill("cartera-local-dev-2026");
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("/", { timeout: 15_000 });
  await page.waitForSelector("h1", { timeout: 15_000 });
}

test.describe("Login", () => {
  test("redirige a login sin cookie", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });

  test("login con contraseña válida", async ({ page }) => {
    await login(page);
    await expect(page.locator("h1")).toContainText("Cartera Rebalanceo");
  });

  test("login con contraseña inválida no accede", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[type="password"]').fill("wrong");
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator("text=Contraseña incorrecta")).toBeVisible();
  });
});

test.describe("Pestañas", () => {
  test("muestra las 3 pestañas", async ({ page }) => {
    await login(page);
    const tabs = page.locator('[role="tab"]');
    await expect(tabs).toHaveCount(3);
    await expect(tabs.nth(0)).toContainText("Cartera");
    await expect(tabs.nth(1)).toContainText("Hogar");
    await expect(tabs.nth(2)).toContainText("Objetivos");
  });

  test("cambiar de pestaña actualiza aria-selected", async ({ page }) => {
    await login(page);
    const hogarTab = page.locator('[role="tab"]:has-text("Hogar")');
    await expect(hogarTab).toHaveAttribute("aria-selected", "false");
    await hogarTab.click();
    await expect(hogarTab).toHaveAttribute("aria-selected", "true");
    const carteraTab = page.locator('[role="tab"]:has-text("Cartera")');
    await expect(carteraTab).toHaveAttribute("aria-selected", "false");
  });
});

test.describe("Sidebar", () => {
  test("muestra secciones del sidebar", async ({ page }) => {
    await login(page);
    await expect(page.locator("a").filter({ hasText: "Finanzas" }).first()).toBeVisible();
    await expect(page.locator("a").filter({ hasText: "Coches" }).first()).toBeVisible();
    await expect(page.locator("a").filter({ hasText: "Lectura" }).first()).toBeVisible();
    await expect(page.locator("a").filter({ hasText: "Planificación" }).first()).toBeVisible();
  });

  test("toggle modo oscuro", async ({ page }) => {
    await login(page);
    const darkBtn = page.locator('button[title="Modo oscuro"]');
    await expect(darkBtn).toBeVisible();
    await darkBtn.click();
    await expect(page.locator('[data-theme="dark"]')).toBeVisible();
    const lightBtn = page.locator('button[title="Modo claro"]');
    await expect(lightBtn).toBeVisible();
    await lightBtn.click();
    await expect(page.locator('[data-theme="dark"]')).toHaveCount(0);
  });

  test("colapsar sidebar", async ({ page }) => {
    await login(page);
    const chevron = page.locator('button[aria-label="Contraer menú"]');
    await chevron.click();
    await expect(page.locator('button[aria-label="Expandir menú"]')).toBeVisible();
  });
});

test.describe("Ajustes", () => {
  test("abrir y cerrar modal de ajustes", async ({ page }) => {
    await login(page);
    await page.locator('button[aria-label="Ajustes"]').click();
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await expect(page.locator('[role="dialog"] h2')).toContainText("Ajustes");
    await page.locator('button:has-text("Cerrar")').click();
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  });
});
