# Interfaz de admisión

Desde `apps/web`, instalar dependencias con `npm.cmd ci`, copiar `.env.example` a `.env.local` y ejecutar `npm.cmd run dev`. `VITE_API_URL` apunta a la API con el prefijo `/api` (por defecto `http://localhost:3000/api`). El `CORS_ORIGIN` del backend debe coincidir con el origen de la web.

El acceso usa `POST /api/auth/login` y comprueba el rol actual con `GET /api/auth/me`. Esta interfaz requiere `admision`; el backend conserva sus propias restricciones. El token se guarda únicamente en memoria: cerrar sesión o recargar la página lo descarta. No hay recuperación de contraseña ni creación de cuentas desde esta pantalla.

El flujo de agenda permite buscar pacientes existentes, consultar especialidades y médicos con horarios habilitados (`GET /api/agenda/catalog`), filtrar disponibilidad por fecha y reservar una cita presencial. Los horarios se muestran siempre en `America/Lima`, independientemente de la zona del equipo. El motivo es opcional y el canal de solicitud puede ser presencial o telefónico.

Antes de confirmar se muestra el paciente, médico, consultorio y horario. Una respuesta 409 elimina la selección y actualiza los turnos; una respuesta 401 descarta la sesión y los datos de la pantalla. No se reintentan automáticamente las reservas: ante un fallo de conexión o del servidor, el resultado puede ser incierto y se pide verificarlo antes de volver a reservar. Cambiar los filtros invalida los turnos anteriores. El botón de confirmación y la salida se deshabilitan mientras se envía una reserva.

El registro de pacientes continúa disponible por API. La interfaz todavía no permite crear pacientes, listar citas, reprogramar, cancelar ni administrar horarios. Si no hay médicos con horarios, cargar los datos ficticios siguiendo el README de la raíz; no se crean automáticamente desde la web.

Verificación: `npm.cmd run build`, `npm.cmd run lint` y `npm.cmd run test:e2e`. Las pruebas de navegador usan Playwright con Microsoft Edge instalado. Para otro navegador Chromium compatible, definir `PLAYWRIGHT_CHANNEL` (por ejemplo, `chrome`). Las pruebas interceptan la API y usan datos ficticios; no equivalen a una prueba integrada con PostgreSQL.
