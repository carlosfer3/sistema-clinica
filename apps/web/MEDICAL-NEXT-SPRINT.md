# Estación médica e integraciones siguientes

## Implementado

La estación médica usa identificación y datos operativos de la bandeja médica, evaluación previa e historia clínica existentes. Distribuye la atención en contexto clínico (enfermería, alergias, antecedentes y consultas previas paginadas) y registro de consulta (motivo, CIE-10, indicaciones y receta manual). Conserva revisión mediante modal, escritura única, manejo de resultado incierto y confirmación de éxito desde la API. El borrador vive en memoria y no tiene autoguardado.

La navegación separa pacientes preparados y consultas registradas. Durante una consulta abierta se vuelve a pacientes desde el formulario; durante una escritura se bloquean salida y navegación. El historial sigue siendo del paciente seleccionado y sujeto a autorización médica. No se agregan interpretaciones de signos vitales ni calificaciones de gravedad o seguridad farmacológica.

## Preparación para correo

Los contratos TypeScript de `apps/api/src/clinical-integrations/contracts.ts` son una base versionada de integración; no activan rutas, tablas ni envíos.

Flujo previsto: confirmar consulta → commit de consulta, receta, cita y auditoría → evento `ConsultationRecordedV1` → solicitud autorizada de envío → generación del documento desde el registro persistido → entrega y actualización de estado. Un fallo de correo no debe revertir ni duplicar una consulta. Usar un outbox transaccional y deduplicación por evento/documento para evitar envíos repetidos. El correo no se debe enviar desde el navegador ni desde un borrador.

Decisiones pendientes: resumen, receta o ambos; contenido del mensaje frente a acceso autenticado al documento; verificación del correo del destinatario y proveedor de entrega. El servidor resolverá destinatario y permisos. Secretos y credenciales quedan fuera de la interfaz. Registrar actor, documento, fecha, estado e identificador del proveedor; excluir contenido clínico y credenciales de los logs técnicos.

Contratos HTTP propuestos para el siguiente sprint, aún no implementados:

- `POST /consultations/:id/deliveries`: documento solicitado y clave de idempotencia; destinatario resuelto por servidor.
- `GET /consultations/:id/deliveries`: estados autorizados, sin publicar enlaces ni información sensible.

Criterios de aceptación: no enviar consultas inexistentes o anuladas; verificar permisos y destinatario; enviar únicamente el contenido persistido; un doble clic no duplica entrega; un fallo conserva la consulta y queda visible como fallo de envío; toda entrega es auditable. Definir cómo revocar acceso al documento si la consulta se anula tras enviarlo.

## Preparación para laboratorio

Flujo previsto: médico crea orden asociada a consulta guardada y paciente → laboratorio recibe orden → registra resultados en borrador → personal autorizado valida → médico consulta resultados validados desde la historia clínica. Un resultado en borrador no aparece como validado. El médico solicitante proviene de la sesión y el paciente se deriva de la consulta, nunca de IDs arbitrarios del navegador.

Contratos base: `LabOrderV1`, `LabOrderStatus` y `LabResultV1`. La orden identifica exámenes; el resultado guarda parámetros, valores, unidades, referencias suministradas por laboratorio y autores/fechas de registro y validación. No se infieren diagnósticos de los valores. Diseñar persistencia y migraciones en el siguiente sprint, conservando evidencia en cancelaciones y correcciones.

Contratos HTTP propuestos, aún no implementados:

- `POST /consultations/:id/lab-orders`: crear una orden con exámenes de catálogo e indicaciones.
- `GET /consultations/:id/lab-orders`: consultar órdenes de esa consulta según permisos.
- `GET /laboratory/orders`: bandeja filtrada y paginada del personal de laboratorio.
- `POST /laboratory/orders/:id/results`: registrar borrador de resultados.
- `POST /laboratory/results/:id/validate`: validar con control de concurrencia.
- `GET /patients/:id/lab-results`: resultados validados, paginados y sujetos a autorización clínica.

Antes de implementar: acordar catálogo de exámenes, perfil validador, unidades y referencias, correcciones, manejo de órdenes de consultas anuladas y política para adjuntos. Pruebas previstas: separación de roles/pacientes, filtros y paginación, orden duplicada, transiciones válidas, doble validación, rollback de auditoría y ausencia de resultados ficticios.

## Firma digital

El guardado actual atribuye la consulta al médico autenticado y registra auditoría; no aplica firma criptográfica. Queda pendiente elegir certificado/dispositivo o proveedor, documento que se firmará, formato de firma, verificación y tratamiento de caducidad o revocación. La cuenta del portal y su token de sesión no sustituyen un certificado digital. No se guarda PIN ni clave privada en la web o en la API.

Llamado a pantalla, impresión, autoguardado y EPS no forman parte de esta adaptación. No hay botones operativos ni datos simulados para integraciones futuras.
