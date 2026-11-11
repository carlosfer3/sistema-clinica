import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
const appointment = { id: 12, inicio: '2026-11-08T15:00:00Z', fin: '2026-11-08T15:20:00Z', estado: 'programada', modalidad: 'presencial', llegadaEn: null, paciente: { id: 1, nombres: 'Paciente', apellidos: 'Prueba', tipoDocumento: 'DNI', numeroDocumento: '87654321' }, medico: { id: 2, nombres: 'Medico', apellidos: 'Prueba' }, especialidad: { id: 1, nombre: 'Medicina General' } }
const listing = (citas: object[] = [appointment], hayMas = false) => ({ fecha: '2026-11-08', zonaHoraria: 'America/Lima', pagina: 1, limite: 20, hayMas, citas })
async function login(page: Page) {
  await page.clock.setFixedTime(new Date('2026-11-08T15:00:00Z'))
  await page.route('**/api/auth/login', route => route.fulfill({ json: { accessToken: 'test-token' } }))
  await page.route('**/api/auth/me', route => route.fulfill({ json: { id: 1, rol: 'admision' } }))
  await page.route('**/api/agenda/catalog', route => route.fulfill({ json: { especialidades: [] } }))
  await page.goto('/'); await page.getByLabel('Usuario', { exact: true }).fill('demo.admision'); await page.getByLabel('Contraseña', { exact: true }).fill('fictitious-password'); await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await page.getByRole('button', { name: 'Citas del día', exact: true }).click()
}
test('confirms arrival, refreshes the list and preserves appointment state', async ({ page }) => {
  let arrived = false; let writes = 0
  await page.route('**/api/agenda/appointments?*', route => route.fulfill({ json: listing([{ ...appointment, llegadaEn: arrived ? '2026-11-08T14:50:00Z' : null }]) }))
  await page.route('**/api/agenda/appointments/12/arrival', async route => { writes++; expect(route.request().headers().authorization).toBe('Bearer test-token'); expect(route.request().postDataJSON()).toEqual({}); arrived = true; await route.fulfill({ json: { id: 12, estado: 'programada', llegadaEn: '2026-11-08T14:50:00Z' } }) })
  await login(page); await expect(page.getByText('10:00–10:20')).toBeVisible()
  await page.getByRole('button', { name: 'Registrar llegada', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Confirmar llegada' })).toBeVisible(); expect(writes).toBe(0)
  await page.getByRole('button', { name: 'Confirmar llegada', exact: true }).click()
  await expect(page.getByText('Llegada registrada: 09:50')).toBeVisible(); await expect(page.getByRole('article', { name: 'Cita 12', exact: true }).getByText('Programada', { exact: true })).toBeVisible(); expect(writes).toBe(1)
})
test('disables arrival for cancelled, attended, virtual or already arrived appointments', async ({ page }) => {
  await page.route('**/api/agenda/appointments?*', route => route.fulfill({ json: listing([{ ...appointment, estado: 'cancelada' }, { ...appointment, id: 13, estado: 'atendida' }, { ...appointment, id: 14, modalidad: 'virtual' }, { ...appointment, id: 15, llegadaEn: '2026-11-08T14:50:00Z' }]) }))
  await login(page); await expect(page.getByRole('article')).toHaveCount(4); await expect(page.getByRole('button', { name: 'Registrar llegada', exact: true })).toHaveCount(0)
})
test('filters, paginates and handles an empty list', async ({ page }) => {
  await page.route('**/api/agenda/appointments?*', route => { const params = new URL(route.request().url()).searchParams; return route.fulfill({ json: listing(params.get('estado') === 'cancelada' || params.get('pagina') === '2' ? [] : [appointment], params.get('pagina') === '1' && !params.has('estado')) }) })
  await login(page); await page.getByRole('button', { name: 'Siguiente' }).click(); await expect(page.getByText('Página 2')).toBeVisible(); await expect(page.getByText('No hay citas para el 2026-11-08 con este filtro.')).toBeVisible()
  await page.getByLabel('Estado de la cita').selectOption('cancelada'); await expect(page.getByText('Página 1')).toBeVisible()
})
test('expires the session when listing returns 401', async ({ page }) => {
  await page.route('**/api/agenda/appointments?*', route => route.fulfill({ status: 401, json: {} })); await login(page); await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible()
})
test('does not retry an uncertain arrival and permits checking the list', async ({ page }) => {
  let writes = 0; await page.route('**/api/agenda/appointments?*', route => route.fulfill({ json: listing() }))
  await page.route('**/api/agenda/appointments/12/arrival', route => { writes++; return route.abort() })
  await login(page); await page.getByRole('button', { name: 'Registrar llegada', exact: true }).click(); await page.getByRole('button', { name: 'Confirmar llegada', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('No se pudo confirmar el resultado'); expect(writes).toBe(1)
  await page.getByRole('button', { name: 'Actualizar lista' }).click(); await expect(page.getByRole('button', { name: 'Registrar llegada', exact: true })).toBeVisible()
})
test('fits a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 }); await page.route('**/api/agenda/appointments?*', route => route.fulfill({ json: listing() })); await login(page)
  await expect(page.getByRole('button', { name: 'Registrar llegada', exact: true })).toBeVisible(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true); await page.screenshot({ path: test.info().outputPath('daily-mobile.png'), fullPage: true })
})

test('prevents duplicate submissions and navigation while arrival is pending', async ({ page }) => {
  let finish!: () => void; let writes = 0
  const gate = new Promise<void>(resolve => { finish = resolve })
  await page.route('**/api/agenda/appointments?*', route => route.fulfill({ json: listing() }))
  await page.route('**/api/agenda/appointments/12/arrival', async route => { writes++; await gate; await route.fulfill({ json: { id: 12, llegadaEn: '2026-11-08T14:50:00Z' } }) })
  await login(page); await page.getByRole('button', { name: 'Registrar llegada', exact: true }).click(); await page.getByRole('button', { name: 'Confirmar llegada', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Registrando llegada…' })).toBeDisabled(); await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeDisabled(); await expect(page.getByRole('button', { name: 'Reservar cita', exact: true })).toBeDisabled()
  await expect(page.getByLabel('Fecha de las citas')).toBeDisabled(); await expect(page.getByRole('button', { name: 'Hoy', exact: true })).toBeDisabled()
  finish(); await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeEnabled(); expect(writes).toBe(1)
})

test('selects past and future dates, preserves state filter and resets pagination', async ({ page }) => {
  const requests: URLSearchParams[] = []
  await page.route('**/api/agenda/appointments?*', route => {
    const params = new URL(route.request().url()).searchParams
    requests.push(params)
    return route.fulfill({ json: { ...listing([appointment], params.get('pagina') === '1'), fecha: params.get('fecha') } })
  })
  await login(page)
  await page.getByLabel('Estado de la cita').selectOption('confirmada')
  await page.getByRole('button', { name: 'Siguiente' }).click()
  await expect(page.getByText('Página 2')).toBeVisible()
  for (const fecha of ['2026-11-10', '2026-11-01']) {
    await page.getByLabel('Fecha de las citas').fill(fecha)
    await expect(page.getByText('Página 1')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Registrar llegada', exact: true })).toHaveCount(0)
    await expect(page.getByText('La llegada solo se puede registrar', { exact: false })).toBeVisible()
    expect(requests.at(-1)?.get('fecha')).toBe(fecha)
    expect(requests.at(-1)?.get('estado')).toBe('confirmada')
    expect(requests.at(-1)?.get('pagina')).toBe('1')
  }
  await page.getByRole('button', { name: 'Hoy', exact: true }).click()
  await expect(page.getByLabel('Fecha de las citas')).toHaveValue('2026-11-08')
  await expect(page.getByRole('button', { name: 'Registrar llegada', exact: true })).toBeVisible()
})

test('clears pending arrival confirmation and stale rows on date changes, and never sends an empty date', async ({ page }) => {
  const requests: string[] = []
  await page.route('**/api/agenda/appointments?*', route => {
    const fecha = new URL(route.request().url()).searchParams.get('fecha')!
    requests.push(fecha)
    return route.fulfill({ json: { ...listing(), fecha } })
  })
  await login(page)
  await page.getByRole('button', { name: 'Registrar llegada', exact: true }).click()
  await page.getByLabel('Fecha de las citas').fill('2026-11-10')
  await expect(page.getByRole('heading', { name: 'Confirmar llegada' })).toHaveCount(0)
  await expect(page.getByText('La llegada solo se puede registrar', { exact: false })).toBeVisible()
  await page.getByLabel('Fecha de las citas').fill('')
  await expect(page.getByRole('article')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Actualizar lista' })).toBeDisabled()
  expect(requests).not.toContain('')
})
test('refreshes after an arrival conflict without retrying the write', async ({ page }) => {
  let writes = 0; let cancelled = false
  await page.route('**/api/agenda/appointments?*', route => route.fulfill({ json: listing([{ ...appointment, estado: cancelled ? 'cancelada' : 'programada' }]) }))
  await page.route('**/api/agenda/appointments/12/arrival', route => { writes++; cancelled = true; return route.fulfill({ status: 409, json: {} }) })
  await login(page); await page.getByRole('button', { name: 'Registrar llegada', exact: true }).click(); await page.getByRole('button', { name: 'Confirmar llegada', exact: true }).click()
  await expect(page.getByRole('article').getByText('Cancelada', { exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: 'Registrar llegada', exact: true })).toHaveCount(0); expect(writes).toBe(1)
})
