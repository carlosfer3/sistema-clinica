import { expect, test } from '@playwright/test'

test('signs in with admission, keeps token out of storage and signs out', async ({ page }) => {
  await page.route('**/api/auth/login', route => route.fulfill({ json: { accessToken: 'test-token' } }))
  await page.route('**/api/auth/me', route => route.fulfill({ json: { id: 1, rol: 'admision' } }))
  await page.goto('/')
  await page.getByLabel('Usuario', { exact: true }).fill('demo.admision')
  await page.getByLabel('Contraseña', { exact: true }).fill('fictitious-password')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible()
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0])
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(page.getByRole('heading', { name: 'Bienvenido de nuevo' })).toBeVisible()
  await expect(page.getByLabel('Contraseña', { exact: true })).toHaveValue('')
})

test('rejects invalid credentials and unsupported staff roles', async ({ page }) => {
  await page.route('**/api/auth/login', route => route.fulfill({ status: 401, json: {} }))
  await page.goto('/')
  await page.getByLabel('Usuario', { exact: true }).fill('demo.admision')
  await page.getByLabel('Contraseña', { exact: true }).fill('wrong-password')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page.getByRole('alert')).toContainText('incorrectos')
  await page.route('**/api/auth/login', route => route.fulfill({ json: { accessToken: 'test-token' } }))
  await page.route('**/api/auth/me', route => route.fulfill({ json: { id: 2, rol: 'medico' } }))
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page.getByRole('alert')).toContainText('requiere una cuenta de admisión')
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toHaveCount(0)
})

test('login is usable on a narrow viewport without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
