# HCE en la atención médica

La pantalla **Atender paciente** muestra la HCE antes de la evaluación de enfermería y del formulario de consulta. Presenta alergias, antecedentes y consultas anteriores de todas las especialidades, con médico, fecha de Lima, diagnósticos, indicaciones y receta. Los episodios anulados se conservan e identifican junto con su motivo y fecha de anulación. La ausencia de registros de alergias no se interpreta como ausencia de alergias.

Para probarla, completar una consulta ficticia, preparar otra cita del mismo paciente mediante admisión y enfermería y abrir **Atender paciente** con su médico asignado. La consulta anterior debe aparecer en la HCE. Los pacientes demo no tienen antecedentes ni alergias precargados; se muestran los datos ya registrados en la base. No se requieren migraciones ni cargas adicionales.

`GET /api/patients/:id/history` requiere una cuenta médica activa y al menos una cita no cancelada de ese paciente asignada al médico autenticado. Una cuenta sin asignación recibe 404; admisión y enfermería reciben 403. La auditoría `READ_HCE` se registra antes de leer datos; si falla, no se entrega la historia. No se aceptan identidades de médico enviadas por el cliente.

Parámetros: `pagina` (1–10000, predeterminada 1), `limite` (1–100, predeterminado 50). Respuesta: `{ paciente, consultas, pagina, limite, hayMas }`. Las consultas se ordenan por fecha e ID descendentes, con diagnósticos y medicamentos en su orden original. La web muestra diez consultas por página. Los errores permiten reintentar sin perder el borrador actual; una sesión vencida cierra el acceso.

Este incremento es de lectura. No agrega edición de antecedentes/alergias, anulación de consultas ni archivos adjuntos. El acceso web se realiza desde una cita preparada; no hay buscador independiente de HCE ni vista de historias después de retirar la cita de pendientes.

Validación: build y lint de API/web, suite HTTP, pruebas Playwright de la pantalla médica y pruebas PostgreSQL en un esquema temporal (`npm.cmd run test:db -- consultations.db-spec.ts`). Playwright usa API simulada; PostgreSQL comprueba relaciones, recetas, paginación, auditoría y acceso entre médicos asignados, incluyendo denegación por cancelación de la única cita que concede acceso.
