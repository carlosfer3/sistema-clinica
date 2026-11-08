# Interfaz de admisión

Desde `apps/web`, instalar dependencias con `npm.cmd ci`, copiar `.env.example` a `.env.local` y ejecutar `npm.cmd run dev`. `VITE_API_URL` apunta a la API con el prefijo `/api` (por defecto `http://localhost:3000/api`). El `CORS_ORIGIN` del backend debe coincidir con el origen de la web.

El acceso usa `POST /api/auth/login` y comprueba el rol actual con `GET /api/auth/me`. Esta interfaz requiere `admision`; el backend conserva sus propias restricciones. El token se guarda únicamente en memoria: cerrar sesión o recargar la página lo descarta. No hay recuperación de contraseña ni creación de cuentas desde esta pantalla.

Verificación: `npm.cmd run build`, `npm.cmd run lint` y `npm.cmd run test:e2e`. Las pruebas de navegador usan Playwright con Microsoft Edge instalado. Para otro navegador Chromium compatible, definir `PLAYWRIGHT_CHANNEL` (por ejemplo, `chrome`). Las pruebas interceptan la API y usan datos ficticios; no equivalen a una prueba integrada con PostgreSQL.
