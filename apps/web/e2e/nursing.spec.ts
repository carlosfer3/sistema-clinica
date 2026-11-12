import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
const pending = { citaId: 12, paciente: { id: 1, nombres: 'Paciente', apellidos: 'Prueba', tipoDocumento: 'DNI', numeroDocumento: '87654321', edad: 26 }, inicio: '2026-11-08T15:00:00Z', llegadaEn: '2026-11-08T14:50:00Z', medico: { id: 2, nombres: 'Medico', apellidos: 'Prueba' }, especialidad: { id: 1, nombre: 'General' }, estadoPreparacion: 'pendiente' }
const queue = (pacientes: object[] = [pending], hayMas = false) => ({ fecha: '2026-11-08', pacientes, hayMas })
async function login(page: Page) {
  await page.route('**/api/auth/login', route => route.fulfill({ json: { accessToken: 'nursing-test-token' } }))
  await page.route('**/api/auth/me', route => route.fulfill({ json: { id: 7, rol: 'enfermeria' } }))
  await page.goto('/'); await page.getByLabel('Usuario', { exact: true }).fill('demo.enfermeria'); await page.getByLabel('Contraseña', { exact: true }).fill('fictitious-password'); await page.getByRole('button', { name: 'Iniciar sesión' }).click()
}
async function select(page: Page) { await page.getByRole('button', { name: 'Evaluar', exact: true }).click() }
async function fill(page: Page) {
  await page.getByLabel('Temperatura (°C)', { exact: true }).fill('36.5')
  await page.getByLabel('Presión sistólica (mmHg)', { exact: true }).fill('120')
  await page.getByLabel('Presión diastólica (mmHg)', { exact: true }).fill('80')
  await page.getByLabel('Frecuencia cardíaca (latidos/min)', { exact: true }).fill('75')
  await page.getByLabel('Frecuencia respiratoria (respiraciones/min)', { exact: true }).fill('18')
  await page.getByLabel('Saturación de oxígeno (%)', { exact: true }).fill('98')
}
test('routes nursing to its queue, records measurements and removes the completed patient', async ({ page }) => {
  let completed = false; let writes = 0; const requested: string[] = []
  page.on('request', request => { if (request.url().includes('/api/')) requested.push(new URL(request.url()).pathname) })
  await page.route('**/api/agenda/nursing-queue?*', route => route.fulfill({ json: queue(completed ? [] : [pending]) }))
  await page.route('**/api/agenda/appointments/12/vital-signs', route => {
    writes++; expect(route.request().headers().authorization).toBe('Bearer nursing-test-token')
    expect(route.request().postDataJSON()).toEqual({ temperaturaC: 36.5, presionSistolica: 120, presionDiastolica: 80, frecuenciaCardiaca: 75, frecuenciaRespiratoria: 18, saturacionOxigeno: 98, observaciones: 'Observacion ficticia' })
    completed = true; return route.fulfill({ status: 201, json: { id: 1, citaId: 12 } })
  })
  await login(page); await expect(page.getByRole('heading', { name: 'Evaluación previa' })).toBeVisible(); await expect(page.getByRole('navigation', { name: 'Opciones de admisión' })).toHaveCount(0)
  await select(page); await expect(page.getByText('DNI: 87654321 · 26 años')).toBeVisible(); await fill(page); await page.getByLabel('Observaciones de enfermería (opcional)').fill('Observacion ficticia')
  await page.getByRole('button', { name: 'Guardar evaluación' }).click(); await expect(page.getByRole('status').filter({ hasText: 'Evaluación registrada para' })).toContainText('Evaluación registrada para Paciente Prueba')
  await expect(page.getByText('No hay pacientes pendientes de evaluación en esta página.')).toBeVisible(); expect(writes).toBe(1)
  expect(requested.every(path => ['/api/auth/login', '/api/auth/me', '/api/agenda/nursing-queue', '/api/agenda/appointments/12/vital-signs'].includes(path))).toBe(true)
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.getItem('siges.staff.token')])).toEqual([0, 'nursing-test-token'])
})
test('blocks missing or out-of-range measurements before sending', async ({ page }) => {
  let writes = 0; await page.route('**/api/agenda/nursing-queue?*', route => route.fulfill({ json: queue() })); await page.route('**/api/agenda/appointments/12/vital-signs', route => { writes++; return route.fulfill({ status: 201, json: {} }) })
  await login(page); await select(page); await page.getByRole('button', { name: 'Guardar evaluación' }).click(); expect(writes).toBe(0)
  await fill(page); await page.getByLabel('Saturación de oxígeno (%)', { exact: true }).fill('101'); await page.getByRole('button', { name: 'Guardar evaluación' }).click(); expect(writes).toBe(0)
  await page.getByRole('button', { name: 'Volver a pendientes' }).click()
  await expect(page.getByRole('dialog', { name: '¿Descartar las mediciones?' })).toBeVisible()
  await page.getByRole('button', { name: 'Descartar y continuar' }).click()
  await select(page); await expect(page.getByLabel('Temperatura (°C)', { exact: true })).toHaveValue('')
})
test('prevents duplicate saves and logout while the evaluation is pending', async ({ page }) => {
  let release!: () => void; let writes = 0; const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/agenda/nursing-queue?*', route => route.fulfill({ json: queue() }))
  await page.route('**/api/agenda/appointments/12/vital-signs', async route => { writes++; await gate; await route.fulfill({ status: 201, json: {} }) })
  await login(page); await select(page); await fill(page); await page.getByRole('button', { name: 'Guardar evaluación' }).click()
  await expect(page.getByRole('button', { name: 'Guardando evaluación…' })).toBeDisabled(); await expect(page.locator('.session-actions button')).toBeDisabled(); await expect(page.getByRole('button', { name: 'Volver a pendientes' })).toBeDisabled()
  release(); await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeEnabled(); expect(writes).toBe(1)
})
test('refreshes a conflicting evaluation without retrying or overwriting', async ({ page }) => {
  let completed = false; let writes = 0
  await page.route('**/api/agenda/nursing-queue?*', route => route.fulfill({ json: queue(completed ? [] : [pending]) }))
  await page.route('**/api/agenda/appointments/12/vital-signs', route => { completed = true; writes++; return route.fulfill({ status: 409, json: {} }) })
  await login(page); await select(page); await fill(page); await page.getByRole('button', { name: 'Guardar evaluación' }).click(); await expect(page.getByRole('status').filter({ hasText: 'no se sobrescribió' })).toContainText('no se sobrescribió'); expect(writes).toBe(1)
})
test('keeps measurements available for correction after a 400', async ({ page }) => {
  await page.route('**/api/agenda/nursing-queue?*', route => route.fulfill({ json: queue() })); await page.route('**/api/agenda/appointments/12/vital-signs', route => route.fulfill({ status: 400, json: {} }))
  await login(page); await select(page); await fill(page); await page.getByRole('button', { name: 'Guardar evaluación' }).click(); await expect(page.getByRole('alert')).toContainText('No se guardó'); await expect(page.getByLabel('Temperatura (°C)', { exact: true })).toHaveValue('36.5')
})
test('clears the session and measurements on 401 while saving', async ({ page }) => {
  await page.route('**/api/agenda/nursing-queue?*', route => route.fulfill({ json: queue() })); await page.route('**/api/agenda/appointments/12/vital-signs', route => route.fulfill({ status: 401, json: {} }))
  await login(page); await select(page); await fill(page); await page.getByRole('button', { name: 'Guardar evaluación' }).click(); await expect(page.getByRole('heading', { name: 'Bienvenido de nuevo' })).toBeVisible(); await expect(page.getByLabel('Temperatura (°C)', { exact: true })).toHaveCount(0)
})
test('does not retry uncertain writes and requires refreshing the queue', async ({ page }) => {
  let writes = 0; await page.route('**/api/agenda/nursing-queue?*', route => route.fulfill({ json: queue() })); await page.route('**/api/agenda/appointments/12/vital-signs', route => { writes++; return route.abort() })
  await login(page); await select(page); await fill(page); await page.getByRole('button', { name: 'Guardar evaluación' }).click(); await expect(page.getByRole('alert')).toContainText('No se pudo confirmar'); await expect(page.getByRole('button', { name: 'Evaluar', exact: true })).toHaveCount(0); expect(writes).toBe(1)
  await page.getByRole('button', { name: 'Actualizar pendientes' }).click(); await expect(page.getByRole('button', { name: 'Evaluar', exact: true })).toBeVisible()
})
test('paginates and shows permission errors without leaking pending patients', async ({ page }) => {
  await page.route('**/api/agenda/nursing-queue?*', route => route.fulfill({ json: queue(new URL(route.request().url()).searchParams.get('pagina') === '2' ? [] : [pending], true) }))
  await login(page); await page.getByRole('button', { name: 'Siguiente' }).click(); await expect(page.getByText('Página 2')).toBeVisible()
  await page.route('**/api/agenda/nursing-queue?*', route => route.fulfill({ status: 403, json: {} })); await page.getByRole('button', { name: 'Actualizar pendientes' }).click(); await expect(page.getByRole('alert')).toContainText('perdió el permiso'); await expect(page.getByText('Paciente Prueba')).toHaveCount(0)
})
test('supports nursing on mobile without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 }); await page.route('**/api/agenda/nursing-queue?*', route => route.fulfill({ json: queue() })); await login(page); await select(page); await fill(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: test.info().outputPath('nursing-mobile.png'), fullPage: true })
})


test('filters pending patients on the server and protects unsaved measurements when changing patients', async ({ page }) => {
  await page.route('**/api/agenda/nursing-queue?*', route => {
    const query = new URL(route.request().url()).searchParams
    expect(query.get('limite')).toBe('6')
    const filtered = query.get('buscar') === 'Segundo'
    if (filtered) { expect(query.get('especialidadId')).toBe('1'); expect(query.get('pagina')).toBe('1') }
    return route.fulfill({ json: { ...queue(filtered ? [{ ...pending, citaId: 13, paciente: { ...pending.paciente, nombres: 'Segundo', apellidos: 'Paciente' } }] : [pending, { ...pending, citaId: 13, paciente: { ...pending.paciente, nombres: 'Segundo', apellidos: 'Paciente' } }]), especialidades: [{ id: 1, nombre: 'General' }] } })
  })
  await login(page)
  await page.getByRole('article', { name: 'Cita 12', exact: true }).getByRole('button', { name: 'Evaluar', exact: true }).click()
  await page.getByLabel('Temperatura (°C)', { exact: true }).fill('36.5')
  await page.getByRole('article', { name: 'Cita 13', exact: true }).getByRole('button', { name: 'Evaluar', exact: true }).click()
  await page.getByRole('button', { name: 'Seguir evaluando' }).click()
  await expect(page.getByLabel('Temperatura (°C)', { exact: true })).toHaveValue('36.5')
  await page.getByRole('article', { name: 'Cita 13', exact: true }).getByRole('button', { name: 'Evaluar', exact: true }).click()
  await page.getByRole('button', { name: 'Descartar y continuar' }).click()
  await expect(page.getByLabel('Temperatura (°C)', { exact: true })).toHaveValue('')
  await page.getByLabel('Buscar paciente por apellido o documento').fill('Segundo')
  await page.getByLabel('Especialidad', { exact: true }).selectOption('1')
  await page.getByRole('button', { name: 'Filtrar pendientes' }).click()
  await expect(page.getByRole('article', { name: 'Cita 12', exact: true })).toHaveCount(0)
  await expect(page.getByRole('article', { name: 'Cita 13', exact: true })).toBeVisible()
  await page.getByRole('article', { name: 'Cita 13', exact: true }).getByRole('button', { name: 'Evaluar', exact: true }).click()
  await page.screenshot({ path: test.info().outputPath('nursing-desktop.png'), fullPage: true })
})
