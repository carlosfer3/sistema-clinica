import { test, expect } from '@playwright/test'

test('cashier creates a charge and explicitly records a verified payment', async ({ page }) => {
  let created = false; let paid = false; let writes = 0
  const patient = { id: 41, nombres: 'Paciente', apellidos: 'Prueba', numeroDocumento: '87654321' }
  const charge = () => ({ id: 4, concepto: 'Consulta de prueba', montoCentimos: 15050, estado: paid ? 'pagado' : 'pendiente', paciente: patient })
  await page.route('**/api/auth/login', route => route.fulfill({ json: { accessToken: 'cashier-token' } }))
  await page.route('**/api/auth/me', route => route.fulfill({ json: { id: 9, rol: 'cajero' } }))
  await page.route('**/api/billing/patients?*', route => route.fulfill({ json: [patient] }))
  await page.route('**/api/billing/charges?*', route => route.fulfill({ json: { cobros: created ? [charge()] : [], hayMas: false } }))
  await page.route('**/api/billing/charges', route => { expect(route.request().postDataJSON()).toEqual({ pacienteId: 41, concepto: 'Consulta de prueba', montoCentimos: 15050 }); created = true; return route.fulfill({ status: 201, json: charge() }) })
  await page.route('**/api/billing/charges/4/settle', route => { writes++; expect(route.request().postDataJSON()).toEqual({ metodoPago: 'yape', referencia: 'OPERACION-PRUEBA' }); paid = true; return route.fulfill({ json: charge() }) })
  await page.goto('/'); await page.getByLabel('Usuario', { exact: true }).fill('demo.caja'); await page.getByLabel('Contraseña', { exact: true }).fill('fictitious-password'); await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page.getByRole('heading', { name: 'Pagos de pacientes' })).toBeVisible()
  await page.getByLabel('DNI del paciente').fill('87654321'); await page.getByRole('button', { name: 'Buscar paciente' }).click()
  await page.getByLabel('Concepto del cobro').fill('Consulta de prueba'); await page.getByLabel('Importe en soles').fill('150.50'); await page.getByRole('button', { name: 'Registrar cobro pendiente' }).click()
  await page.getByRole('button', { name: 'Registrar pago recibido' }).click()
  await page.getByLabel('Método de pago').selectOption('yape')
  await expect(page.getByRole('button', { name: 'Confirmar pago recibido' })).toBeDisabled()
  await page.getByLabel('Referencia de la operación', { exact: true }).fill('OPERACION-PRUEBA'); expect(writes).toBe(0)
  await page.getByRole('button', { name: 'Confirmar pago recibido' }).click()
  await expect(page.getByText('Pago registrado correctamente.')).toBeVisible(); expect(writes).toBe(1)
  await expect(page.getByRole('button', { name: 'Registrar pago recibido' })).toHaveCount(0)
})
