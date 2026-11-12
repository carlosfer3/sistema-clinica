import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

const profile = {
  id: 41,
  nombres: 'Ana',
  apellidos: 'Prueba',
  tipoDocumento: 'DNI',
  numeroDocumento: '87654321',
  fechaNacimiento: '1990-01-01T00:00:00Z',
  telefono: '999888777',
  correo: 'paciente@example.test',
  direccion: null,
}
const first = {
  id: 12,
  inicio: '2026-11-13T14:00:00Z',
  fin: '2026-11-13T14:20:00Z',
  estado: 'confirmada',
  modalidad: 'presencial',
  llegadaEn: null,
  medico: { id: 2, nombres: 'Elena', apellidos: 'Prueba' },
  especialidad: { id: 1, nombre: 'Medicina general' },
}
const second = {
  ...first,
  id: 13,
  inicio: '2026-11-18T15:30:00Z',
  fin: '2026-11-18T15:50:00Z',
  medico: { id: 3, nombres: 'Pablo', apellidos: 'Prueba' },
  especialidad: { id: 2, nombre: 'Odontología' },
}
const consultation = {
  id: 8,
  fechaHora: '2026-11-01T14:00:00Z',
  motivo: 'Control ficticio',
  indicaciones: 'Indicación de prueba',
  estado: 'activo',
  motivoAnulacion: null,
  medico: { usuario: first.medico, especialidad: first.especialidad },
  diagnosticos: [{ codigo: 'Z00.0', descripcion: 'Examen médico general' }],
  recetaItems: [
    {
      id: 1,
      medicamento: 'Medicamento ficticio',
      dosis: 'Dosis de prueba',
      via: 'Vía de prueba',
      frecuencia: 'Frecuencia de prueba',
      duracion: 'Duración de prueba',
      indicaciones: null,
    },
  ],
}

async function setup(page: Page, citas: object[] = [first, second]) {
  await page.clock.setFixedTime(new Date('2026-11-12T15:00:00Z'))
  await page.route('**/api/auth/patient-login', (route) =>
    route.fulfill({ json: { accessToken: 'portal-token' } }),
  )
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ json: { id: 7, rol: 'paciente' } }),
  )
  await page.route('**/api/portal/payments?*', route => route.fulfill({ json: { cobros: [], saldoPendienteCentimos: 0, cantidadPendientes: 0, hayMas: false } }))
  await page.route('**/api/portal/profile', (route) =>
    route.fulfill({ json: profile }),
  )
  await page.route('**/api/portal/appointments?*', (route) =>
    route.fulfill({
      json: { citas, total: citas.length, pagina: 1, hayMas: false },
    }),
  )
  await page.route('**/api/portal/history?*', (route) =>
    route.fulfill({
      json: { consultas: [consultation], pagina: 1, hayMas: false },
    }),
  )
  await page.route('**/api/portal/history-context', route => route.fulfill({ json: { especialidades: [{ id: 1, nombre: 'Medicina general' }], alergias: [{ id: 1, sustancia: 'Penicilina', reaccion: 'Reacción registrada' }], antecedentes: [{ id: 1, tipo: 'Personal', descripcion: 'Antecedente de prueba', desde: null }] } }))
  await page.route('**/api/portal/notifications?*', route => route.fulfill({ json: { notificaciones: [], pagina: 1, hayMas: false } }))
  await page.route('**/api/portal/catalog', (route) =>
    route.fulfill({
      json: {
        especialidades: [{ ...first.especialidad, medicos: [first.medico] }],
      },
    }),
  )
  await page.route('**/api/portal/availability?*', (route) =>
    route.fulfill({
      json: { turnos: [{ inicio: first.inicio, fin: first.fin, medicoId: first.medico.id, medico: first.medico }] },
    }),
  )
}
async function login(page: Page) {
  await page.goto('/pacientes/login')
  await page.getByLabel('N\u00famero de DNI', { exact: true }).fill(profile.numeroDocumento)
  await page
    .getByLabel('Contraseña', { exact: true })
    .fill('fictitious-password')
  await page.getByRole('button', { name: 'Ingresar al Portal del Paciente' }).click()
  await expect(page.getByRole('heading', { name: 'Hola, Ana' })).toBeVisible()
}

test('matches the reference layout using the authenticated patient data', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await setup(page)
  await login(page)
  await expect(
    page.getByRole('article', { name: 'Cita 12', exact: true }),
  ).toContainText('Elena Prueba')
  await expect(page.locator('.pp-live-top')).toContainText('Confirmada')
  await expect(page.locator('.pp-live-top')).toContainText('13 de noviembre de 2026')
  await expect(page.getByText('Clínica Savia')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Citas del día', exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('img', { name: 'Clínica San Rafael S.A.C.' }),
  ).toBeVisible()
  await page.screenshot({
    path: test.info().outputPath('portal-desktop.png'),
    fullPage: true,
  })
})
test('navigates patient appointments, consultations, prescriptions and profile', async ({
  page,
}) => {
  await setup(page)
  await login(page)
  const nav = page.getByRole('navigation', { name: 'Mi portal' })
  await nav.getByRole('button', { name: 'Mis citas', exact: true }).click()
  await expect(page.getByRole('article', { name: /^Cita / })).toHaveCount(2)
  await page.getByRole('tab', { name: 'Historial y pasadas' }).click()
  await expect(page.getByRole('tab', { name: 'Historial y pasadas' })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('tab', { name: 'Canceladas' }).click()
  await expect(page.getByRole('tab', { name: 'Canceladas' })).toHaveAttribute('aria-selected', 'true')
  await nav.getByRole('button', { name: 'Mi historial', exact: true }).click()
  await expect(page.getByText('Control ficticio')).toBeVisible()
  await nav.getByRole('button', { name: 'Mis recetas', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Medicamento ficticio' }),
  ).toBeVisible()
  await expect(page.getByText('Dosis de prueba')).toBeVisible()
  await nav.getByRole('button', { name: 'Mi perfil', exact: true }).click()
  await expect(page.getByText('paciente@example.test')).toBeVisible()
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Bienvenido a tu salud digital' }),
  ).toBeVisible()
})
test('shows an honest empty state instead of reference appointments', async ({
  page,
}) => {
  await setup(page, [])
  await login(page)
  await expect(
    page.getByRole('heading', { name: 'Aún no tienes próximas citas' }),
  ).toBeVisible()
  await expect(page.getByRole('article', { name: /^Cita / })).toHaveCount(0)
})
test('books a patient appointment without sending a patient identity', async ({
  page,
}) => {
  await setup(page)
  let writes = 0
  await page.route('**/api/portal/appointments', (route) => {
    writes++
    expect(route.request().postDataJSON()).toEqual({
      medicoId: 2,
      inicio: first.inicio,
    })
    return route.fulfill({ status: 201, json: { id: 14 } })
  })
  await login(page)
  await page
    .getByRole('button', { name: 'Agendar cita', exact: true })
    .first()
    .click()
  await page.getByLabel('Especialidad', { exact: true }).selectOption('1')
  await page.getByLabel('Médico', { exact: true }).selectOption('2')
  await page.getByLabel('Fecha de la cita').fill('2026-11-13')
  await page.getByLabel('Horario disponible (Lima)').selectOption(first.inicio)
  expect(writes).toBe(0)
  await page
    .getByRole('button', { name: 'Solicitar cita', exact: true })
    .click()
  await expect(
    page.getByRole('status').filter({ hasText: /Tu cita|Solicitud/ }),
  ).toContainText('Solicitud enviada')
  expect(writes).toBe(1)
})
test('shows appointment detail and confirms cancellation without deleting the record', async ({
  page,
}) => {
  await setup(page)
  let writes = 0
  await page.route('**/api/portal/appointments/12/cancel', (route) => {
    writes++
    expect(route.request().postDataJSON()).toEqual({})
    return route.fulfill({ json: { id: 12, estado: 'cancelada' } })
  })
  await login(page)
  await page
    .getByRole('article', { name: 'Cita 12', exact: true })
    .getByRole('button', { name: 'Ver detalle' })
    .click()
  await expect(page.getByRole('dialog')).toContainText('Horario de Lima')
  await page.getByRole('button', { name: 'Cancelar cita', exact: true }).click()
  expect(writes).toBe(0)
  await page
    .getByRole('button', { name: 'Confirmar cancelación', exact: true })
    .click()
  await expect(
    page.getByRole('status').filter({ hasText: /Tu cita|Solicitud/ }),
  ).toContainText('Tu cita se canceló correctamente')
  expect(writes).toBe(1)
})
test('reprograms using the patient-owned route', async ({ page }) => {
  await setup(page)
  let writes = 0
  const newSlot = '2026-11-16T14:00:00Z'
  await page.route('**/api/portal/availability?*', (route) =>
    route.fulfill({
      json: { turnos: [{ inicio: newSlot, fin: '2026-11-16T14:20:00Z' }] },
    }),
  )
  await page.route('**/api/portal/appointments/12/reschedule', (route) => {
    writes++
    expect(route.request().postDataJSON()).toEqual({ inicio: newSlot })
    return route.fulfill({ json: { id: 12 } })
  })
  await login(page)
  await page.getByRole('button', { name: 'Reprogramar', exact: true }).click()
  await page.getByLabel('Fecha de la cita').fill('2026-11-16')
  await page.getByLabel('Horario disponible (Lima)').selectOption(newSlot)
  await page.getByRole('button', { name: 'Solicitar reprogramación' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: /Tu cita|Solicitud/ }),
  ).toContainText('Solicitud de reprogramación enviada')
  expect(writes).toBe(1)
})
test('expires a revoked session instead of disclosing stale information', async ({
  page,
}) => {
  await setup(page)
  await page.route('**/api/portal/appointments?*', (route) =>
    route.fulfill({ status: 401, json: {} }),
  )
  await page.goto('/pacientes/login')
  await page.getByLabel('N\u00famero de DNI', { exact: true }).fill(profile.numeroDocumento)
  await page
    .getByLabel('Contraseña', { exact: true })
    .fill('fictitious-password')
  await page.getByRole('button', { name: 'Ingresar al Portal del Paciente' }).click()
  await expect(page.getByRole('alert')).toContainText('Tu sesión venció')
})
test('adapts the portal and booking dialog to mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setup(page)
  await login(page)
  await expect(page.getByRole('article', { name: /^Cita / })).toHaveCount(2)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: test.info().outputPath('portal-mobile.png'),
    fullPage: true,
  })
  await page
    .getByRole('button', { name: 'Agendar cita', exact: true })
    .first()
    .click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByLabel('Especialidad', { exact: true }).selectOption('1')
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
})

test('shows actionable alerts and booking in the dashboard header', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await setup(page)
  await page.route('**/api/portal/payments?*', route => route.fulfill({ json: { cobros: [], saldoPendienteCentimos: 15000, cantidadPendientes: 1, hayMas: false } }))
  await login(page)
  await expect(page.getByRole('heading', { name: 'Alertas y recordatorios' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Citas cercanas', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Pagos pendientes', exact: true })).toBeVisible()
  await expect(page.getByText(/1 cobro\(s\) por pagar/)).toContainText('150.00')
  await expect(page.getByRole('heading', { name: 'Resultados de exámenes', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Tratamientos y renovaciones', exact: true })).toBeVisible()
  const booking = page.getByRole('button', { name: 'Agendar cita', exact: true })
  await expect(booking).toHaveCount(1)
  const buttonBox = await booking.boundingBox(); const appointmentBox = await page.getByRole('article', { name: 'Cita 12', exact: true }).boundingBox()
  expect(buttonBox!.y).toBeLessThan(appointmentBox!.y)
  await page.screenshot({ path: test.info().outputPath('portal-alerts-desktop.png'), fullPage: true })
})

test('shows pending payments, explains payment in clinic and downloads only a paid receipt', async ({ page }) => {
  await setup(page)
  const charge = { id: 4, concepto: 'Consulta de prueba', montoCentimos: 15000, estado: 'pendiente', creadoEn: '2026-11-12T14:00:00Z', pagadoEn: null, metodoPago: null, referencia: null }
  const paid = { ...charge, id: 5, concepto: 'Consulta anterior', estado: 'pagado', pagadoEn: '2026-11-11T14:00:00Z', metodoPago: 'efectivo' }
  await page.route('**/api/portal/payments?*', route => route.fulfill({ json: { cobros: [charge, paid], saldoPendienteCentimos: 15000, cantidadPendientes: 1, hayMas: false } }))
  await page.route('**/api/portal/payments/5/receipt', route => route.fulfill({ json: { ...paid, tipo: 'Constancia interna de pago' } }))
  await login(page)
  await page.getByRole('navigation', { name: 'Mi portal' }).getByRole('button', { name: 'Pagos', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Tu saldo pendiente' })).toBeVisible()
  await page.getByRole('button', { name: 'Pagar en clínica' }).click()
  await expect(page.getByRole('heading', { name: 'Realiza tu pago en caja' })).toBeVisible()
  await expect(page.getByText('Cobro #4 · Pendiente de pago')).toBeVisible()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Descargar constancia' }).click()
  expect((await downloadPromise).suggestedFilename()).toBe('constancia-pago-5.txt')
})

test('express booking assigns an available doctor by specialty and time', async ({ page }) => {
  await setup(page)
  await page.route('**/api/portal/availability?*', route => {
    expect(new URL(route.request().url()).searchParams.has('medicoId')).toBe(false)
    return route.fulfill({ json: { turnos: [
      { inicio: first.inicio, fin: first.fin, medicoId: 2, medico: first.medico },
      { inicio: first.inicio, fin: first.fin, medicoId: 3, medico: second.medico },
    ] } })
  })
  let writes = 0
  await page.route('**/api/portal/appointments', route => {
    writes++
    expect(route.request().postDataJSON()).toEqual({ medicoId: 2, inicio: first.inicio })
    return route.fulfill({ status: 201, json: { id: 14 } })
  })
  await login(page)
  await page.getByRole('navigation', { name: 'Mi portal' }).getByRole('button', { name: 'Mis citas', exact: true }).click()
  const form = page.locator('.pp-express').filter({ has: page.getByRole('heading', { name: 'Reserva exprés' }) })
  await expect(form.getByText('Consulta presencial', { exact: true })).toBeVisible()
  await form.getByLabel('Especialidad', { exact: true }).selectOption('1')
  await form.getByLabel('Fecha de la cita').fill('2026-11-13')
  await expect(form.getByLabel('Horario disponible (Lima)').locator('option')).toHaveCount(2)
  await form.getByLabel('Horario disponible (Lima)').selectOption(first.inicio)
  await expect(form.getByText(/Elena Prueba/)).toBeVisible()
  await form.getByRole('button', { name: 'Solicitar cita', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Solicitud enviada' })).toBeVisible()
  expect(writes).toBe(1)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.screenshot({ path: test.info().outputPath('appointments-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.pp-express').first()).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: test.info().outputPath('appointments-mobile.png'), fullPage: true })
})


test('filters the complete history, paginates and displays its clinical summary', async ({ page }) => {
  await setup(page)
  await login(page)
  await page.route('**/api/portal/history?*', route => {
    const query = new URL(route.request().url()).searchParams
    const secondPage = query.get('pagina') === '2'
    if (query.get('buscar')) {
      expect(query.get('buscar')).toBe('J00')
      expect(query.get('especialidadId')).toBe('1')
      expect(query.get('conReceta')).toBe('true')
      expect(query.get('desde')).toBe('2026-01-01')
    }
    return route.fulfill({ json: { consultas: [{ ...consultation, id: secondPage ? 9 : 8 }], pagina: secondPage ? 2 : 1, hayMas: !secondPage } })
  })
  await page.getByRole('navigation', { name: 'Mi portal' }).getByRole('button', { name: 'Mi historial', exact: true }).click()
  await expect(page.getByText('Penicilina', { exact: true })).toBeVisible()
  await expect(page.getByText('Antecedente de prueba', { exact: true })).toBeVisible()
  await page.getByLabel('Buscar en mi historial').fill('J00')
  await page.getByLabel('Especialidad', { exact: true }).selectOption('1')
  await page.getByLabel('Desde', { exact: true }).fill('2026-01-01')
  await page.getByLabel('Con receta', { exact: true }).check()
  await page.getByRole('button', { name: 'Aplicar filtros' }).click()
  await expect(page.getByRole('article', { name: 'Consulta #8' })).toBeVisible()
  await page.getByText('Ver indicaciones y receta', { exact: false }).click()
  await expect(page.getByText('Medicamento ficticio', { exact: true })).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('patient-history-desktop.png'), fullPage: true })
  await page.getByRole('navigation', { name: 'Páginas de mi historial' }).getByRole('button', { name: 'Siguiente' }).click()
  await expect(page.getByRole('article', { name: 'Consulta #9' })).toBeVisible()
  await page.getByRole('button', { name: 'Limpiar', exact: true }).click()
  await expect(page.getByLabel('Buscar en mi historial')).toHaveValue('')
  await expect(page.getByRole('article', { name: 'Consulta #8' })).toBeVisible()
  await page.setViewportSize({ width: 375, height: 812 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: test.info().outputPath('patient-history-mobile.png'), fullPage: true })
})


test('hides cancelled consultation details and retries clinical context independently', async ({ page }) => {
  await setup(page)
  await login(page)
  await page.route('**/api/portal/history-context', route => route.fulfill({ status: 500, json: {} }))
  await page.route('**/api/portal/history?*', route => route.fulfill({ json: { consultas: [{ ...consultation, estado: 'anulado', motivoAnulacion: 'Registro duplicado', motivo: 'Contenido anulado oculto' }], pagina: 1, hayMas: false } }))
  await page.getByRole('navigation', { name: 'Mi portal' }).getByRole('button', { name: 'Mi historial', exact: true }).click()
  await expect(page.getByText('Consulta anulada', { exact: true })).toBeVisible()
  await expect(page.getByText('Contenido anulado oculto', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Medicamento ficticio', { exact: true })).toHaveCount(0)
  await page.route('**/api/portal/history-context', route => route.fulfill({ json: { especialidades: [], alergias: [], antecedentes: [] } }))
  await page.getByRole('button', { name: 'Reintentar resumen' }).click()
  await expect(page.getByText('No hay alergias registradas. Esto no confirma ausencia de alergias.')).toBeVisible()
})


test('shows the confirmation notification and updates appointment progress on focus', async ({ page }) => {
  await setup(page)
  let stage = 0
  await page.route('**/api/portal/appointments?*', route => route.fulfill({ json: { citas: [{ ...first, estado: stage === 0 ? 'pendiente_confirmacion' : 'confirmada', llegadaEn: stage >= 2 ? '2026-11-13T13:45:00Z' : null, preparacionCompletadaEn: stage >= 3 ? '2026-11-13T13:50:00Z' : null }], pagina: 1, total: 1, hayMas: false } }))
  await page.route('**/api/portal/notifications?*', route => route.fulfill({ json: { notificaciones: [{ id: 'auditoria-8', tipo: 'confirmacion', citaId: 12, inicio: null, inicioAnterior: null, especialidad: 'Medicina general', pendienteConfirmacion: false, creadoEn: '2026-11-12T14:00:00Z' }], pagina: 1, hayMas: false } }))
  await login(page)
  const progress = page.getByRole('progressbar', { name: 'Progreso de tu atención' })
  await expect(progress).toHaveAttribute('value', '0')
  for (stage = 1; stage <= 3; stage++) {
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(progress).toHaveAttribute('value', String(stage))
  }
  await page.getByRole('button', { name: 'Notificaciones', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Cita confirmada por admisión', exact: true })).toBeVisible()
  await expect(dialog.getByText('Admisión confirmó tu cita #12.', { exact: false })).toBeVisible()
})


test('completes the progress only for attended appointments and closes cancelled flows', async ({ page }) => {
  await setup(page)
  await page.route('**/api/portal/appointments?*', route => {
    const cancelled = new URL(route.request().url()).searchParams.get('scope') === 'cancelled'
    return route.fulfill({ json: { citas: [{ ...first, estado: cancelled ? 'cancelada' : 'atendida', llegadaEn: '2026-11-13T13:45:00Z', preparacionCompletadaEn: '2026-11-13T13:50:00Z' }], total: 1, pagina: 1, hayMas: false } })
  })
  await login(page)
  await page.getByRole('navigation', { name: 'Mi portal' }).getByRole('button', { name: 'Mis citas', exact: true }).click()
  await page.getByRole('tab', { name: 'Historial y pasadas' }).click()
  await page.getByRole('button', { name: 'Ver detalle', exact: true }).click()
  let dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('progressbar', { name: 'Progreso de tu atención' })).toHaveAttribute('value', '4')
  await expect(dialog.getByText('Atención completada', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Cerrar ventana' }).click()
  await page.getByRole('tab', { name: 'Canceladas' }).click()
  await page.getByRole('button', { name: 'Ver detalle', exact: true }).click()
  dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('progressbar')).toHaveCount(0)
  await expect(dialog.getByText('La cita fue cancelada. El flujo de atención está cerrado.')).toBeVisible()
})
