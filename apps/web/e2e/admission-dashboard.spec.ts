import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

async function setup(page: Page) {
  await page.route('**/api/auth/login', (r) =>
    r.fulfill({ json: { accessToken: 'test' } }),
  )
  await page.route('**/api/auth/me', (r) =>
    r.fulfill({ json: { id: 1, rol: 'admision' } }),
  )
  await page.route('**/api/agenda/admission-summary', (r) =>
    r.fulfill({
      json: {
        fecha: '2026-11-12',
        citasHoy: 35,
        llegadasRegistradas: 12,
        pendientesLlegada: 18,
        solicitudesPendientes: 8,
      },
    }),
  )
  await page.route('**/api/agenda/appointments?*', (r) =>
    r.fulfill({
      json: {
        fecha: '2026-11-12',
        citas: [
          {
            id: 4,
            inicio: '2026-11-13T13:00:00Z',
            fin: '2026-11-13T13:20:00Z',
            estado: 'pendiente_confirmacion',
            modalidad: 'presencial',
            llegadaEn: null,
            paciente: {
              id: 1,
              nombres: 'Carlos',
              apellidos: 'Fernández',
              tipoDocumento: 'DNI',
              numeroDocumento: '12345678',
            },
            medico: { id: 2, nombres: 'Elena', apellidos: 'Martínez' },
            especialidad: { id: 1, nombre: 'Medicina General' },
          },
        ],
        hayMas: false,
      },
    }),
  )
  await page.route('**/api/agenda/catalog', (r) =>
    r.fulfill({
      json: {
        especialidades: [
          {
            id: 1,
            nombre: 'Medicina General',
            medicos: [{ id: 2, nombres: 'Elena', apellidos: 'Martínez' }],
          },
        ],
      },
    }),
  )
  await page.goto('/')
  await page.getByLabel('Usuario', { exact: true }).fill('demo.admision')
  await page.getByLabel('Contraseña', { exact: true }).fill('password')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(
    page.getByRole('heading', {
      name: 'Todo listo para recibir a tus pacientes',
    }),
  ).toBeVisible()
}

test('shows full totals and routes pending requests to their working actions', async ({
  page,
}) => {
  await setup(page)
  await expect(
    page
      .locator('.admission-kpi')
      .filter({ hasText: 'Citas de hoy' })
      .locator('strong'),
  ).toHaveText('35')
  await expect(
    page
      .locator('.admission-kpi')
      .filter({ hasText: 'Solicitudes del portal' })
      .locator('strong'),
  ).toHaveText('8')
  await page.screenshot({
    path: test.info().outputPath('admission-desktop.png'),
    fullPage: true,
  })
  await page.getByRole('button', { name: 'Ver todas las solicitudes' }).click()
  await expect(
    page.getByRole('heading', { name: 'Solicitudes del portal', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Confirmar cita', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Rechazar solicitud', exact: true }),
  ).toBeVisible()
})

test('consults real availability from the directory and clears stale slots', async ({
  page,
}) => {
  await setup(page)
  await page.route('**/api/agenda/directory?*', (r) => {
    const query = new URL(r.request().url()).searchParams
    const filtered = query.get('especialidadId') === '1'
    const second = query.get('pagina') === '2'
    expect(query.get('limite')).toBe('6')
    return r.fulfill({
      json: {
        especialidades: [{ id: 1, nombre: 'Medicina General' }],
        medicos: filtered
          ? [
              {
                id: second ? 3 : 2,
                nombres: second ? 'Luis' : 'Elena',
                apellidos: second ? 'Pérez' : 'Martínez',
                especialidad: { id: 1, nombre: 'Medicina General' },
              },
            ]
          : [],
        hayMas: filtered && !second,
      },
    })
  })
  await page.route('**/api/agenda/availability?*', (r) => {
    expect(new URL(r.request().url()).searchParams.get('medicoId')).toBe('2')
    return r.fulfill({
      json: {
        turnos: [
          {
            medicoId: 2,
            inicio: '2099-01-09T13:00:00Z',
            fin: '2099-01-09T13:20:00Z',
            consultorio: 'Consultorio 1',
          },
        ],
      },
    })
  })
  await page
    .getByRole('button', { name: 'Directorio médico', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: /Elena Martínez/ }),
  ).toHaveCount(0)
  await page.getByLabel('Especialidad', { exact: true }).selectOption('1')
  await page.getByRole('button', { name: 'Buscar médicos' }).click()
  await page.getByRole('button', { name: /Elena Martínez/ }).click()
  await expect(page.getByText('Consultorio 1', { exact: true })).toBeVisible()
  await page.getByLabel('Fecha de consulta').fill('')
  await expect(page.getByText('Consultorio 1', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click()
  await expect(page.getByRole('button', { name: /Luis Pérez/ })).toBeVisible()
  await expect(
    page.getByRole('button', { name: /Elena Martínez/ }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Siguiente', exact: true }),
  ).toBeDisabled()
})

test('fits the admission home on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await setup(page)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: test.info().outputPath('admission-mobile.png'),
    fullPage: true,
  })
})
