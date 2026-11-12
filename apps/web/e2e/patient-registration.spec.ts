import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

const patient = { id: 23, tipoDocumento: 'DNI', numeroDocumento: '00123456', nombres: 'Paciente', apellidos: 'Nuevo', fechaNacimiento: '1990-05-20', sexo: 'F', telefono: '999888777', correo: 'paciente@example.test', direccion: '' }
async function setup(page: Page, role = 'admision') {
  await page.route('**/api/auth/login', r => r.fulfill({ json: { accessToken: 'patient-token' } }))
  await page.route('**/api/auth/me', r => r.fulfill({ json: { id: 1, rol: role } }))
  await page.route('**/api/agenda/catalog', r => r.fulfill({ json: { especialidades: [{ id: 1, nombre: 'General', medicos: [{ id: 2, nombres: 'Médico', apellidos: 'Demo' }] }] } }))
  await page.route('**/api/agenda/nursing-queue?*', r => r.fulfill({ json: { fecha: '2026-11-11', pacientes: [], hayMas: false } }))
  await page.route('**/api/agenda/medical-queue?*', r => r.fulfill({ json: { fecha: '2026-11-11', pacientes: [], hayMas: false } }))
  await page.goto('/')
  await page.getByLabel('Usuario', { exact: true }).fill('demo.' + role)
  await page.getByLabel('Contraseña', { exact: true }).fill('fictitious-password')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  if (role === 'admision') await page.getByRole('navigation', { name: 'Opciones de admisión' }).getByRole('button', { name: 'Reservar cita', exact: true }).click()
}
async function fill(page: Page) {
  await page.getByRole('button', { name: 'Registrar nuevo paciente' }).click()
  await page.getByLabel('Número de documento (obligatorio)').fill(patient.numeroDocumento)
  await page.getByLabel('Nombres (obligatorio)', { exact: true }).fill(patient.nombres)
  await page.getByLabel('Apellidos (obligatorio)').fill(patient.apellidos)
  await page.getByLabel('Fecha de nacimiento (obligatorio)').fill(patient.fechaNacimiento)
  await page.getByLabel('Sexo (obligatorio)').selectOption('F')
  await page.getByLabel('Teléfono (obligatorio)').fill(patient.telefono)
  await page.getByLabel('Correo (obligatorio)').fill(patient.correo)
}

test('creates a patient with leading-zero DNI and reserves their appointment', async ({ page }) => {
  await setup(page); await fill(page)
  let writes = 0
  await page.route('**/api/patients', r => {
    writes++
    expect(r.request().headers().authorization).toBe('Bearer patient-token')
    const body = Object.fromEntries(Object.entries(patient).filter(([key]) => key !== 'id'))
    expect(r.request().postDataJSON()).toEqual(body)
    return r.fulfill({ status: 201, json: patient })
  })
  await page.getByRole('button', { name: 'Guardar paciente', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('registrado y seleccionado')
  await expect(page.getByText('DNI · 00123456', { exact: true })).toBeVisible()
  const slot = { medicoId: 2, medico: { nombres: 'Médico', apellidos: 'Demo' }, consultorioId: 1, consultorio: 'Consultorio 1', inicio: '2099-01-09T13:00:00Z', fin: '2099-01-09T13:20:00Z' }
  await page.route('**/api/agenda/availability?*', r => r.fulfill({ json: { turnos: [slot] } }))
  await page.route('**/api/agenda/appointments', r => {
    expect(r.request().postDataJSON().pacienteId).toBe(patient.id)
    return r.fulfill({ status: 201, json: { id: 51, fechaHoraInicio: slot.inicio, fechaHoraFin: slot.fin } })
  })
  await page.getByLabel('Especialidad', { exact: true }).selectOption('1')
  await page.getByLabel('Fecha', { exact: true }).fill('2099-01-09')
  await page.getByRole('button', { name: 'Consultar turnos' }).click()
  await page.getByRole('radio').check()
  await page.getByRole('button', { name: 'Confirmar reserva' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Cita #51 reservada' })).toBeVisible()
  expect(writes).toBe(1)
})

test('preserves entered data on duplicate and requires identity review before selection', async ({ page }) => {
  await setup(page); await fill(page)
  let writes = 0
  await page.route('**/api/patients', r => { writes++; return r.fulfill({ status: 409, json: { patientId: 23 } }) })
  await page.route('**/api/patients/23', r => r.fulfill({ json: { ...patient, nombres: 'Nombre existente' } }))
  await page.getByRole('button', { name: 'Guardar paciente', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Ya existe un paciente')
  await expect(page.getByLabel('Nombres (obligatorio)', { exact: true })).toHaveValue('Paciente')
  await expect(page.getByRole('button', { name: 'Guardar paciente', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Consultar paciente existente' }).click()
  await expect(page.getByText('Nombre existente Nuevo', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Seleccionar paciente existente' }).click()
  await expect(page.getByRole('status')).toContainText('Se conservaron sus datos existentes')
  expect(writes).toBe(1)
})

test('prefills searched DNI and blocks invalid document, future birth date, email and blank names', async ({ page }) => {
  await setup(page)
  await page.getByLabel('Buscar paciente', { exact: true }).fill('00123456')
  await page.getByRole('button', { name: 'Registrar nuevo paciente' }).click()
  await expect(page.getByLabel('Número de documento (obligatorio)')).toHaveValue('00123456')
  await page.getByRole('button', { name: 'Cancelar registro' }).click()
  await fill(page)
  let writes = 0
  await page.route('**/api/patients', r => { writes++; return r.fulfill({ status: 201, json: patient }) })
  for (const [label, value, restored] of [
    ['Número de documento (obligatorio)', '123', patient.numeroDocumento],
    ['Fecha de nacimiento (obligatorio)', '2099-01-01', patient.fechaNacimiento],
    ['Correo (obligatorio)', 'invalid-email', patient.correo],
    ['Nombres (obligatorio)', '   ', patient.nombres],
  ]) {
    await page.getByLabel(label, { exact: true }).fill(value)
    await page.getByRole('button', { name: 'Guardar paciente', exact: true }).click()
    expect(writes).toBe(0)
    await page.getByLabel(label, { exact: true }).fill(restored)
  }
})

for (const documentType of ['CE', 'PASAPORTE']) test(`registers ${documentType} without clinical fields`, async ({ page }) => {
  await setup(page); await fill(page)
  await page.getByLabel('Tipo de documento (obligatorio)').selectOption(documentType)
  await expect(page.getByLabel('Número de documento (obligatorio)')).toHaveValue('')
  await page.getByLabel('Número de documento (obligatorio)').fill('AB123456')
  await page.route('**/api/patients', r => {
    expect(r.request().postDataJSON()).toMatchObject({ tipoDocumento: documentType, numeroDocumento: 'AB123456' })
    expect(r.request().postDataJSON()).not.toHaveProperty('antecedentes')
    expect(r.request().postDataJSON()).not.toHaveProperty('alergias')
    return r.fulfill({ status: 201, json: { ...patient, tipoDocumento: documentType, numeroDocumento: 'AB123456' } })
  })
  await page.getByRole('button', { name: 'Guardar paciente', exact: true }).click()
  await expect(page.getByText(`${documentType} · AB123456`, { exact: true })).toBeVisible()
})

test('blocks duplicate submission, navigation and logout while saving and fits mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await setup(page); await fill(page)
  await page.screenshot({ path: 'test-results/patient-registration-mobile.png', fullPage: true })
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  let writes = 0
  await page.route('**/api/patients', async r => { writes++; await gate; await r.fulfill({ status: 201, json: patient }) })
  await page.getByRole('button', { name: 'Guardar paciente', exact: true }).dblclick()
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Citas del día' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Cancelar registro' })).toBeDisabled()
  await expect(page.getByLabel('Nombres (obligatorio)', { exact: true })).toBeDisabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(writes).toBe(1)
  release()
  await expect(page.getByRole('status')).toContainText('registrado y seleccionado')
})

for (const status of [400, 403, 401, 500]) test(`handles registration error ${status}`, async ({ page }) => {
  await setup(page); await fill(page)
  let writes = 0
  await page.route('**/api/patients', r => { writes++; return r.fulfill({ status, json: {} }) })
  await page.getByRole('button', { name: 'Guardar paciente', exact: true }).click()
  if (status === 401) {
    await expect(page.getByRole('heading', { name: 'Bienvenido de nuevo' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Registrar paciente', exact: true })).toHaveCount(0)
  } else {
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.getByLabel('Nombres (obligatorio)', { exact: true })).toHaveValue('Paciente')
  }
  expect(writes).toBe(1)
})

test('does not retry a failed connection and preserves the draft', async ({ page }) => {
  await setup(page); await fill(page)
  let writes = 0
  await page.route('**/api/patients', r => { writes++; return r.abort('failed') })
  await page.getByRole('button', { name: 'Guardar paciente', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Verifica si el paciente se registró')
  await expect(page.getByLabel('Nombres (obligatorio)', { exact: true })).toHaveValue('Paciente')
  expect(writes).toBe(1)
})

for (const role of ['medico', 'enfermeria']) test(`does not expose registration to ${role}`, async ({ page }) => {
  await setup(page, role)
  await expect(page.getByRole('heading', { name: role === 'medico' ? 'Portal del médico' : 'Evaluación previa', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Registrar nuevo paciente' })).toHaveCount(0)
})

test('cancels registration without writes and clears the personal data draft', async ({ page }) => {
  await setup(page); await fill(page)
  let writes = 0
  await page.route('**/api/patients', r => { writes++; return r.fulfill({ status: 201, json: patient }) })
  await page.getByRole('button', { name: 'Cancelar registro' }).click()
  await page.getByRole('button', { name: 'Registrar nuevo paciente' }).click()
  await expect(page.getByLabel('Nombres (obligatorio)', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('Correo (obligatorio)')).toHaveValue('')
  expect(writes).toBe(0)
})

test('does not select an existing patient whose document differs from the requested identity', async ({ page }) => {
  await setup(page); await fill(page)
  await page.route('**/api/patients', r => r.fulfill({ status: 409, json: { patientId: 23 } }))
  await page.route('**/api/patients/23', r => r.fulfill({ json: { ...patient, numeroDocumento: '99887766' } }))
  await page.getByRole('button', { name: 'Guardar paciente', exact: true }).click()
  await page.getByRole('button', { name: 'Consultar paciente existente' }).click()
  await expect(page.getByRole('alert')).toContainText('El documento no coincide')
  await expect(page.getByRole('button', { name: 'Seleccionar paciente existente' })).toHaveCount(0)
})
