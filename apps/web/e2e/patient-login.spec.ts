import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

async function portalMocks(page: Page) {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ json: { id: 7, rol: 'paciente' } }),
  )
  await page.route('**/api/portal/profile', (route) =>
    route.fulfill({
      json: { id: 41, nombres: 'Paciente', apellidos: 'Prueba' },
    }),
  )
  await page.route('**/api/portal/payments?*', (route) =>
    route.fulfill({
      json: {
        cobros: [],
        saldoPendienteCentimos: 0,
        cantidadPendientes: 0,
        hayMas: false,
      },
    }),
  )
  await page.route('**/api/portal/appointments?*', (route) =>
    route.fulfill({ json: { citas: [], total: 0, pagina: 1, hayMas: false } }),
  )
}

test('keeps the original staff login and provides a separate patient screen', async ({
  page,
}) => {
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Bienvenido de nuevo' }),
  ).toBeVisible()
  await expect(page.getByLabel('Usuario', { exact: true })).toBeVisible()
  await expect(page.getByRole('tab')).toHaveCount(0)
  await page
    .getByRole('link', { name: '¿Eres paciente? Ingresa a tu portal' })
    .click()
  await expect(page).toHaveURL(/\/pacientes\/login$/)
  await expect(
    page.getByRole('heading', { name: 'Bienvenido a tu salud digital' }),
  ).toBeVisible()
  await expect(page.getByRole('tab')).toHaveCount(2)
  await expect(
    page.getByRole('tab', { name: 'DNI', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('tab', { name: 'Correo electrónico', exact: true }),
  ).toBeVisible()
  await expect(page.getByLabel('Usuario', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Carnet Ext.')).toHaveCount(0)
  await expect(page.getByText('Pasaporte')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /SMS|WhatsApp/ })).toHaveCount(
    0,
  )
  await page
    .getByRole('link', { name: /Portal para Médicos y Colaboradores/ })
    .click()
  await expect(page.getByLabel('Usuario', { exact: true })).toBeVisible()
})

test('patient email login only uses the patient endpoint', async ({ page }) => {
  await portalMocks(page)
  let writes = 0
  await page.route('**/api/auth/patient-login', (route) => {
    writes++
    expect(route.request().postDataJSON()).toEqual({
      identifier: 'PATIENT@example.test',
      password: 'fictitious-password',
    })
    return route.fulfill({ json: { accessToken: 'patient-token' } })
  })
  await page.route('**/api/auth/login', () => {
    throw new Error('Patient must not use staff login')
  })
  await page.goto('/pacientes/login')
  await page
    .getByRole('tab', { name: 'Correo electrónico', exact: true })
    .click()
  await page
    .getByLabel('Correo electrónico', { exact: true })
    .fill('PATIENT@example.test')
  await page
    .getByLabel('Contraseña', { exact: true })
    .fill('fictitious-password')
  await page
    .getByRole('button', { name: 'Ingresar al Portal del Paciente' })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Hola, Paciente' }),
  ).toBeVisible()
  expect(writes).toBe(1)
  expect(
    await page.evaluate(() => [localStorage.length, sessionStorage.length]),
  ).toEqual([0, 0])
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Bienvenido a tu salud digital' }),
  ).toBeVisible()
  await expect(page.getByLabel('Contraseña', { exact: true })).toHaveValue('')
})

test('preserves a leading-zero DNI and prevents duplicate submissions', async ({
  page,
}) => {
  await portalMocks(page)
  let finish!: () => void
  let writes = 0
  const gate = new Promise<void>((resolve) => {
    finish = resolve
  })
  await page.route('**/api/auth/patient-login', async (route) => {
    writes++
    expect(route.request().postDataJSON()).toEqual({
      identifier: '01234567',
      password: 'fictitious-password',
    })
    await gate
    await route.fulfill({ json: { accessToken: 'patient-token' } })
  })
  await page.goto('/pacientes/login')
  await page.getByLabel('Número de DNI', { exact: true }).fill('01234567')
  await page
    .getByLabel('Contraseña', { exact: true })
    .fill('fictitious-password')
  await page
    .getByRole('button', { name: 'Ingresar al Portal del Paciente' })
    .click()
  await expect(page.getByRole('button', { name: 'Ingresando…' })).toBeDisabled()
  await expect(
    page.getByRole('tab', { name: 'Correo electrónico' }),
  ).toBeDisabled()
  finish()
  await expect(
    page.getByRole('heading', { name: 'Hola, Paciente' }),
  ).toBeVisible()
  expect(writes).toBe(1)
})

test('validates DNI and email, switches identifiers and toggles password visibility', async ({
  page,
}) => {
  let writes = 0
  await page.route('**/api/auth/patient-login', (route) => {
    writes++
    return route.fulfill({ status: 401, json: {} })
  })
  await page.goto('/pacientes/login')
  await page.getByLabel('Número de DNI', { exact: true }).fill('1234')
  await page
    .getByLabel('Contraseña', { exact: true })
    .fill('fictitious-password')
  await page.getByRole('button', { name: 'Mostrar contraseña' }).click()
  await expect(page.getByLabel('Contraseña', { exact: true })).toHaveAttribute(
    'type',
    'text',
  )
  await page.getByRole('button', { name: 'Ocultar contraseña' }).click()
  await page
    .getByRole('button', { name: 'Ingresar al Portal del Paciente' })
    .click()
  expect(writes).toBe(0)
  await page.getByRole('tab', { name: 'Correo electrónico' }).click()
  await expect(
    page.getByLabel('Correo electrónico', { exact: true }),
  ).toHaveValue('')
  await expect(page.getByLabel('Contraseña', { exact: true })).toHaveValue('')
  await page
    .getByLabel('Correo electrónico', { exact: true })
    .fill('invalid-email')
  await page
    .getByLabel('Contraseña', { exact: true })
    .fill('fictitious-password')
  await page
    .getByRole('button', { name: 'Ingresar al Portal del Paciente' })
    .click()
  expect(writes).toBe(0)
})

test('rejects a staff identity returned to patient login', async ({ page }) => {
  await page.route('**/api/auth/patient-login', (route) =>
    route.fulfill({ json: { accessToken: 'wrong-role-token' } }),
  )
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ json: { id: 1, rol: 'admision' } }),
  )
  await page.goto('/pacientes/login')
  await page.getByLabel('Número de DNI', { exact: true }).fill('01234567')
  await page
    .getByLabel('Contraseña', { exact: true })
    .fill('fictitious-password')
  await page
    .getByRole('button', { name: 'Ingresar al Portal del Paciente' })
    .click()
  await expect(page.getByRole('alert')).toContainText(
    'exclusivo para pacientes',
  )
  await expect(
    page.getByRole('button', { name: 'Citas del día', exact: true }),
  ).toHaveCount(0)
})

test('rejects a patient identity returned to staff login', async ({ page }) => {
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({ json: { accessToken: 'wrong-role-token' } }),
  )
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ json: { id: 7, rol: 'paciente' } }),
  )
  await page.goto('/')
  await page.getByLabel('Usuario', { exact: true }).fill('internal.patient')
  await page
    .getByLabel('Contraseña', { exact: true })
    .fill('fictitious-password')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page.getByRole('alert')).toContainText(
    'requiere una cuenta de admisión',
  )
  await expect(page.getByRole('heading', { name: /Hola,/ })).toHaveCount(0)
})

test('shows the patient reference design on desktop and working help', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/pacientes/login')
  await expect(
    page.getByRole('img', { name: 'Atención médica cercana y personalizada' }),
  ).toBeVisible()
  expect(
    await page
      .getByRole('img', { name: 'Atención médica cercana y personalizada' })
      .evaluate((img) => (img as HTMLImageElement).naturalWidth),
  ).toBeGreaterThan(0)
  await page.screenshot({
    path: test.info().outputPath('patient-login-desktop.png'),
    fullPage: true,
  })
  await page.getByRole('button', { name: '¿Olvidaste tu contraseña?' }).click()
  await expect(page.getByRole('dialog')).toContainText(
    'comunícate con admisión',
  )
  await page.getByRole('button', { name: 'Entendido' }).click()
})

test('patient login fits a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/pacientes/login')
  await expect(
    page.getByRole('heading', { name: 'Bienvenido a tu salud digital' }),
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: test.info().outputPath('patient-login-mobile.png'),
    fullPage: true,
  })
})
