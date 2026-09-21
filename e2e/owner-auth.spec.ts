import { expect, test, type CDPSession, type Page } from '@playwright/test';

async function addAuthenticator(cdp: CDPSession): Promise<string> {
  const result = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      ctap2Version: 'ctap2_1',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return result.authenticatorId;
}

async function openSecurity(page: Page): Promise<void> {
  await page.goto('/settings?section=security');
  await expect(page.getByRole('heading', { name: 'Passkeys y recuperación' })).toBeVisible();
}

test('configura, autentica, recupera y revoca passkeys del propietario', async ({ page, context }) => {
  const setupUrl = process.env.E2E_SETUP_URL;
  test.skip(!setupUrl, 'E2E_SETUP_URL debe contener el enlace emitido por owner:init');

  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  let authenticatorId = await addAuthenticator(cdp);

  await page.goto(setupUrl!);
  await page.getByRole('button', { name: 'Crear passkey' }).click();
  await expect(page.getByRole('heading', { name: 'Cuenta preparada' })).toBeVisible();
  const recoveryCodes = (await page.locator('pre').innerText()).trim().split(/\s+/);
  expect(recoveryCodes).toHaveLength(10);
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.reload();
  await expect(page.getByRole('heading', { name: /^Hola, / })).toBeVisible();

  await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
  authenticatorId = await addAuthenticator(cdp);
  await openSecurity(page);
  await page.getByLabel('Nombre de la passkey').fill('Segunda passkey');
  await page.getByRole('button', { name: 'Agregar' }).click();
  await expect(page.getByText('Segunda passkey', { exact: true })).toBeVisible();

  await page.getByRole('main').getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole('button', { name: 'Entrar con passkey' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await openSecurity(page);
  await page.getByRole('main').getByRole('button', { name: 'Cerrar sesión' }).click();
  await page.goto('/recovery');
  await page.getByLabel('Código de recuperación').fill(recoveryCodes[0]);
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByText('Registra una passkey nueva para terminar la recuperación.')).toBeVisible();

  await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
  authenticatorId = await addAuthenticator(cdp);
  await page.getByLabel('Nombre de la passkey').fill('Passkey recuperada');
  await page.getByRole('button', { name: 'Agregar' }).click();
  await expect(page.getByText('Passkey recuperada', { exact: true })).toBeVisible();
  await expect(page.getByText('Registra una passkey nueva para terminar la recuperación.')).toBeHidden();
  await expect(page.getByText('Guárdalos ahora; solo se muestran una vez.')).toBeVisible();

  const secondRow = page.getByText('Segunda passkey', { exact: true }).locator('..').locator('..');
  await secondRow.getByRole('button').click();
  await expect(page.getByText('Segunda passkey', { exact: true })).toBeHidden();
  await expect(page.getByText('actual', { exact: false })).toBeVisible();

  await page.goto('/tasks');
  await expect(page.getByRole('heading', { name: 'Tareas' })).toBeVisible();
  await context.route('**/api/**', (route) => route.abort('internetdisconnected'));

  await page.getByRole('button', { name: 'Nueva tarea' }).click();
  await page.getByLabel('Título').fill('Tarea sin conexión');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Tarea sin conexión', { exact: true })).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/tasks$/);
  await expect(page.getByText('Tarea sin conexión', { exact: true })).toBeVisible();

  const offlineRow = page.getByText('Tarea sin conexión', { exact: true }).locator('..').locator('..');
  await offlineRow.getByRole('button').nth(1).click();
  await page.getByLabel('Título').fill('Tarea editada sin conexión');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Tarea editada sin conexión', { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText('Tarea editada sin conexión', { exact: true })).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  const editedRow = page.getByText('Tarea editada sin conexión', { exact: true }).locator('..').locator('..');
  await editedRow.getByRole('button').nth(2).click();
  await expect(page.getByText('Tarea editada sin conexión', { exact: true })).toBeHidden();

  await page.reload();
  await expect(page).toHaveURL(/\/tasks$/);
  await expect(page.getByText('Tarea editada sin conexión', { exact: true })).toBeHidden();
  await context.unroute('**/api/**');

  const apiUrl = process.env.E2E_API_URL ?? 'http://localhost:8787';
  await expect.poll(async () => {
    const response = await context.request.get(`${apiUrl}/api/tasks?includeDeleted=true&pageSize=100`);
    if (!response.ok()) return [];
    const payload = await response.json() as { data: { items: Array<{ title: string; deletedAt?: string }> } };
    return payload.data.items
      .filter((item) => item.title === 'Tarea editada sin conexión')
      .map((item) => Boolean(item.deletedAt));
  }, { timeout: 45_000 }).toEqual([true]);

  await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
});
