# Cobros, pagos en clínica y confirmación de citas

## Solicitudes del portal

Las citas creadas por el paciente guardan el estado `pendiente_confirmacion`. Reservan el turno para evitar reservas duplicadas, pero no admiten llegada ni atención hasta la confirmación por admisión. Al reprogramar desde el portal vuelven a quedar pendientes. El paciente puede cancelarlas mientras no haya llegado ni iniciado atención.

En **Admisión → Citas del día → Solicitudes del portal** se muestran todas las solicitudes futuras pendientes, sin limitarse a la fecha del día. Admisión revisa la fecha, paciente y médico y usa **Confirmar cita → Confirmar solicitud**. Puede reprogramar una solicitud antes de confirmarla o cancelarla. La confirmación cambia a `confirmada`, con bloqueo de fila y auditoría transaccional. Los reintentos no duplican la confirmación ni su auditoría.

Rutas: `GET /api/agenda/appointments?pendientesPortal=true` y `POST /api/agenda/appointments/:id/confirm` con `{}`, exclusivas de admisión. No cambia la reserva presencial/telefónica de admisión. La migración mueve a pendientes únicamente las citas futuras del portal que estaban programadas/reprogramadas y no tenían llegada, evaluación ni consulta; conserva las ya confirmadas o clínicamente iniciadas y registra los cambios en auditoría.

## Pagos del paciente

El menú **Pagos** presenta saldo pendiente en soles, conceptos, importes y estados propios de la cuenta autenticada. El bloque **Alertas y recordatorios** del inicio muestra los cobros pendientes y lleva a esta sección. No se inventan tarifas ni se genera deuda automáticamente al reservar: caja determina el importe del servicio y registra el cobro.

Esta versión opera con pagos en clínica. **Pagar en clínica** muestra el concepto, importe y número de cobro que debe indicar el paciente en caja. No marca el cobro como pagado. Cuando caja verifica y registra el pago, el portal actualiza el estado y permite descargar una constancia interna de texto. Esa constancia no reemplaza un comprobante fiscal.

El portal no recibe números de tarjetas ni realiza cargos en una pasarela. La integración de cobros en línea requiere definir proveedor y configurar sus credenciales y confirmaciones del lado del servidor. No se implementan pagos parciales, devoluciones, anulación de deudas, convenios ni comprobantes fiscales en este incremento.

## Caja

Acceso con rol `cajero` desde **Personal de la clínica**. `demo.caja` utiliza la contraseña `DEMO_PASSWORD` configurada en el entorno local; el seed conserva contraseñas ya existentes. No se publican contraseñas en el repositorio.

1. Buscar la ficha por DNI completo.
2. Registrar concepto e importe del cobro en soles. La API guarda un entero de céntimos para evitar redondeos de punto flotante.
3. Cuando se haya recibido el importe completo, seleccionar **Registrar pago recibido**.
4. Verificar importe, paciente y medio de pago. Para tarjeta, Yape, Plin o transferencia, registrar la referencia de la operación. Confirmar únicamente después de comprobar el pago.

La API registra cajero, momento, método y referencia; el importe procede del cobro original, nunca de un valor enviado por el paciente. El cambio y su auditoría son una transacción. Solicitudes concurrentes/reintentos iguales generan un solo registro de pago; datos de pago distintos sobre un cobro pagado devuelven conflicto. Un fallo de auditoría revierte el cambio.

## API y aislamiento

| Ruta | Permiso |
| --- | --- |
| `GET /billing/patients?q=01234567` | Caja; identificación mínima para registrar el cobro. |
| `GET /billing/charges?pacienteId=1` | Caja, paginación opcional. |
| `POST /billing/charges` | Caja; `{ pacienteId, concepto, montoCentimos }`. |
| `POST /billing/charges/:id/settle` | Caja; `{ metodoPago, referencia? }`. |
| `GET /portal/payments` | Paciente; cobros y saldo propios, paginados. |
| `GET /portal/payments/:id/receipt` | Paciente; solo constancias de sus cobros pagados. |

Las lecturas se auditan antes de entregar información. El servidor resuelve el paciente desde su cuenta; no acepta cambiar esa identidad en la ruta de pagos propios. Un paciente no puede crear cobros ni declarar su pago como recibido, y una constancia ajena devuelve 404.

## Dashboard

**Agendar cita** está debajo de la lista de próximas citas. El bloque lateral **Alertas y recordatorios** incluye citas de las próximas 48 horas, estado de confirmación por admisión y saldo pendiente real. Resultados muestra un estado vacío porque el módulo de resultados aún no publica documentos. Tratamientos ofrece un recordatorio y acceso a las recetas; no se calculan vencimientos ni renovaciones a partir de las duraciones en texto libre.

## Preparación y validación

Se agregaron tres migraciones: estado de cita pendiente, transición auditada de solicitudes existentes y tabla `cobro`. Aplicar `npm.cmd run db:migrate` desde `apps/api`. Prisma Client debe regenerarse al actualizar el esquema; en Windows, si la DLL del motor está bloqueada, detener y reiniciar la API al regenerarlo.

Verificación: build y lint de API/web; 317 pruebas HTTP aprobadas y 32 pruebas PostgreSQL aprobadas en esquemas temporales. Las pruebas reales incluyen solicitud → confirmación de admisión → reprogramación → nueva confirmación, propiedad de cobros, saldo correcto, pagos concurrentes sin duplicación y reversión cuando falla la auditoría. Las pantallas se verifican con Playwright usando API simulada.

Validación de interfaz completada: 32 pruebas Playwright aprobadas (portal, alertas, ubicación de Agendar cita, caja, confirmación de admisión y acceso), con API simulada. La base local ya tiene aplicadas las migraciones y se comprobaron respuestas HTTP 200 para perfil, citas, historial y pagos.
