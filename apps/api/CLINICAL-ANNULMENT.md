# Anulación clínica (HU09)

En la pantalla médica, **Mis consultas registradas** muestra las últimas 50 consultas del médico autenticado. **Anular consulta** abre un modal con identificación del paciente y motivo obligatorio (hasta 300 caracteres). La confirmación es explícita.

`POST /api/consultations/:id/annul` recibe `{ "motivo": "Error de registro" }`. Requiere rol médico y autoría de la consulta. El servidor determina autor y fecha; no acepta estos campos desde el navegador. Devuelve 200; un motivo inválido devuelve 400, una consulta ajena/inexistente 404 y una ya anulada 409.

La transacción bloquea la consulta, guarda estado `anulado`, `motivoAnulacion`, `anuladoPor`, `anuladoEn` y auditoría `ANNUL_CONSULTATION`. No modifica diagnósticos, indicaciones, receta ni el estado atendido de la cita. Un fallo de auditoría impide confirmar la transacción. Las restricciones SQL existentes impiden el borrado físico. No requiere nuevas migraciones.

`GET /api/consultations` devuelve las últimas 50 consultas propias y audita la lectura. La HCE conserva los episodios anulados con motivo y fecha. El portal ya filtra consultas anuladas de las recetas activas.

Validación: compilación de API/web y cinco pruebas del servicio sobre autoría, motivo, repetición y propagación de fallo de auditoría. Estas pruebas usan persistencia simulada; no acreditan validación integrada en navegador y PostgreSQL.
