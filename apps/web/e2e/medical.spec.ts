import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
const patient = { citaId: 12, inicio: '2026-11-10T15:00:00Z', paciente: { id: 3, nombres: 'Paciente', apellidos: 'Prueba', tipoDocumento: 'DNI', numeroDocumento: '87654321', edad: 26 }, especialidad: { nombre: 'General' } }
async function setup(page: Page) {
  await page.route('**/api/consultations', r => r.request().method() === 'GET' ? r.fulfill({ json: [] }) : r.fallback())
  await page.route('**/api/patients/3/history?*', r => r.fulfill({ json: { paciente: { ...patient.paciente, antecedentes: [], alergias: [] }, consultas: [], pagina: 1, hayMas: false } }))
  await page.route('**/api/auth/login', r => r.fulfill({ json: { accessToken: 'medical-token' } }))
  await page.route('**/api/auth/me', r => r.fulfill({ json: { id: 7, rol: 'medico' } }))
  await page.route('**/api/agenda/medical-queue?*', r => r.fulfill({ json: { fecha: '2026-11-10', pacientes: [patient], hayMas: false } }))
  await page.route('**/api/agenda/appointments/12/vital-signs', r => r.fulfill({ json: { temperaturaC: '36.5', presionSistolica: 120, presionDiastolica: 80, frecuenciaCardiaca: 75, frecuenciaRespiratoria: 18, saturacionOxigeno: '98', pesoKg: null, tallaCm: null, observaciones: 'Observación ficticia', autor: { nombres: 'Enfermera', apellidos: 'Prueba' } } }))
  await page.route(/\/api\/consultations\/diagnoses(?:\?.*)?$/, r => {
    const query = new URL(r.request().url()).searchParams.get('q')
    if (query !== null && query.trim().length < 2) return r.fulfill({ status: 400, json: {} })
    return r.fulfill({ json: [{ codigo: 'J00', descripcion: 'Diagnóstico ficticio' }, { codigo: 'Z00.0', descripcion: 'Examen médico general' }] })
  })
  await page.goto('/'); await page.getByLabel('Usuario', { exact: true }).fill('demo.medico'); await page.getByLabel('Contraseña', { exact: true }).fill('fictitious-password'); await page.getByRole('button', { name: 'Iniciar sesión' }).click()
}
async function fill(page: Page) {
  await page.getByRole('button', { name: 'Atender paciente' }).click()
  await expect(page.getByText('Observaciones: Observación ficticia')).toBeVisible()
  await page.getByLabel('Motivo de consulta', { exact: true }).fill('Motivo ficticio')
  await page.getByRole('button', { name: 'Agregar J00' }).click()
  await page.getByLabel('Indicaciones generales').fill('Indicaciones ficticias')
}

test('shows demo diagnoses without typing and after clearing the search', async ({ page }) => {
  await setup(page)
  await page.getByRole('button', { name: 'Atender paciente' }).click()
  await expect(page.getByRole('button', { name: 'Agregar J00' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Agregar Z00.0' })).toBeVisible()
  await page.getByLabel('Buscar código o descripción').fill('J00')
  await expect(page.getByRole('button', { name: 'Agregar J00' })).toBeVisible()
  await page.getByLabel('Buscar código o descripción').fill('')
  await expect(page.getByRole('button', { name: 'Agregar Z00.0' })).toBeVisible()
})

test('shows clinical history, allergies, prior prescriptions and cancelled episodes with pagination', async ({ page }) => {
  await setup(page)
  await page.route('**/api/patients/3/history?*', r => {
    const pageNumber = Number(new URL(r.request().url()).searchParams.get('pagina'))
    return r.fulfill({ json: { paciente: { ...patient.paciente, antecedentes: [{ id: 1, tipo: 'Personal', descripcion: 'Antecedente ficticio', desde: null }], alergias: [{ id: 1, sustancia: 'Sustancia ficticia', reaccion: 'Reacción ficticia' }] }, pagina: pageNumber, hayMas: pageNumber === 1, consultas: [{ id: pageNumber === 1 ? 42 : 30, fechaHora: '2026-11-01T15:00:00Z', estado: 'anulado', motivoAnulacion: 'Duplicidad ficticia', anuladoEn: null, motivo: 'Consulta anterior ficticia', indicaciones: 'Indicación histórica', medico: { usuario: { nombres: 'Otro', apellidos: 'Médico' }, especialidad: { nombre: 'General' } }, diagnosticos: [{ codigo: 'J00', descripcion: 'Diagnóstico histórico', tipo: 'principal' }], recetaItems: [{ medicamento: 'Medicamento histórico ficticio', dosis: 'Dosis ficticia', via: 'Vía ficticia', frecuencia: 'Frecuencia ficticia', duracion: 'Duración ficticia', indicaciones: null }] }] } })
  })
  await page.getByRole('button', { name: 'Atender paciente' }).click()
  await expect(page.getByText('Sustancia ficticia', { exact: true })).toBeVisible()
  await expect(page.getByText('Personal: Antecedente ficticio')).toBeVisible()
  await expect(page.getByText('Consulta anulada', { exact: true })).toBeVisible()
  await expect(page.getByText('Medicamento histórico ficticio', { exact: true })).toBeVisible()
  await expect(page.getByText('J00 · Diagnóstico histórico · principal')).toBeVisible()
  await page.getByRole('button', { name: 'Consultas más antiguas' }).click()
  await expect(page.getByRole('article', { name: 'Consulta #30' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Consultas más antiguas' })).toBeDisabled()
})

test('retries history failure without losing the consultation draft', async ({ page }) => {
  await setup(page)
  await page.route('**/api/patients/3/history?*', r => r.fulfill({ status: 500, json: {} }))
  await fill(page)
  await expect(page.getByText('No se pudo cargar la HCE.', { exact: false })).toBeVisible()
  await page.route('**/api/patients/3/history?*', r => r.fulfill({ json: { paciente: { ...patient.paciente, antecedentes: [], alergias: [] }, consultas: [], pagina: 1, hayMas: false } }))
  await page.getByRole('button', { name: 'Reintentar HCE' }).click()
  await expect(page.getByText('No hay consultas registradas en esta página.')).toBeVisible()
  await expect(page.getByLabel('Motivo de consulta', { exact: true })).toHaveValue('Motivo ficticio')
})
test('medical consultation without prescription confirms identity and completes appointment', async ({ page }) => {
  await setup(page); await fill(page)
  let writes = 0
  await page.route('**/api/agenda/medical-queue?*', r => r.fulfill({ json: { fecha: '2026-11-10', pacientes: writes ? [] : [patient], hayMas: false } }))
  await page.route('**/api/consultations', r => { if (r.request().method() === 'GET') return r.fallback(); writes++; expect(r.request().headers().authorization).toBe('Bearer medical-token'); expect(r.request().postDataJSON()).toEqual({ citaId: 12, motivo: 'Motivo ficticio', indicaciones: 'Indicaciones ficticias', diagnosticos: [{ codigo: 'J00' }], receta: [] }); return r.fulfill({ status: 201, json: { id: 42 } }) })
  await page.getByRole('button', { name: 'Revisar consulta' }).click(); await expect(page.getByText('Sin receta.')).toBeVisible(); expect(writes).toBe(0)
  await page.screenshot({ path: 'test-results/medical-review.png', fullPage: true })
  await page.getByRole('button', { name: 'Confirmar y guardar consulta' }).click(); await expect(page.getByRole('status').filter({ hasText: 'Consulta #42' })).toContainText('Consulta #42 registrada'); expect(writes).toBe(1)
  await expect(page.getByRole('button', { name: 'Atender paciente' })).toHaveCount(0)
})
test('manual prescription sends independent items and preserves fields after validation failure', async ({ page }) => {
  await setup(page); await fill(page)
  await page.getByRole('button', { name: 'Agregar medicamento' }).click()
  for (const label of ['Medicamento', 'Dosis', 'Vía', 'Frecuencia', 'Duración']) await page.getByLabel(label, { exact: true }).fill(`${label} ficticio`)
  await page.route('**/api/consultations', r => { if (r.request().method() === 'GET') return r.fallback(); expect(r.request().postDataJSON().receta).toHaveLength(1); return r.fulfill({ status: 400, json: {} }) })
  await page.getByRole('button', { name: 'Revisar consulta' }).click(); await page.getByRole('button', { name: 'Confirmar y guardar consulta' }).click(); await expect(page.getByRole('alert')).toContainText('No se guardó'); await expect(page.getByLabel('Medicamento', { exact: true })).toHaveValue('Medicamento ficticio')
})
for (const status of [401, 403, 409, 500]) test(`handles save error ${status} without retrying`, async ({ page }) => {
  await setup(page); await fill(page); let writes = 0
  await page.route('**/api/consultations', r => { if (r.request().method() === 'GET') return r.fallback(); writes++; return r.fulfill({ status, json: {} }) })
  await page.getByRole('button', { name: 'Revisar consulta' }).click(); await page.getByRole('button', { name: 'Confirmar y guardar consulta' }).click()
  if (status === 401) await expect(page.getByRole('heading', { name: 'Bienvenido de nuevo' })).toBeVisible()
  else { await expect(page.getByRole('alert')).toBeVisible(); await expect(page.getByRole('button', { name: 'Atender paciente' })).toHaveCount(0) }
  expect(writes).toBe(1)
})
test('blocks duplicate submission and logout, and fits mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 }); await setup(page); await fill(page)
  let release!: () => void; const gate = new Promise<void>(r => { release = r }); let writes = 0
  await page.route('**/api/consultations', async r => { if (r.request().method() === 'GET') return r.fallback(); writes++; await gate; await r.fulfill({ status: 201, json: { id: 42 } }) })
  await page.getByRole('button', { name: 'Revisar consulta' }).click(); await page.getByRole('button', { name: 'Confirmar y guardar consulta' }).click()
  await expect(page.getByRole('button', { name: 'Guardando consulta…' })).toBeDisabled(); await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeDisabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  release(); await expect(page.getByRole('status').filter({ hasText: 'Consulta #42' })).toContainText('registrada'); expect(writes).toBe(1)
})
