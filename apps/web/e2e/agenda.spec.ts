import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const catalog = {
  especialidades: [
    {
      id: 1,
      nombre: "Medicina General",
      medicos: [{ id: 2, nombres: "Médico", apellidos: "Demo" }],
    },
    {
      id: 3,
      nombre: "Pediatría",
      medicos: [{ id: 4, nombres: "Pediatra", apellidos: "Demo" }],
    },
  ],
};
const patient = {
  id: 7,
  nombres: "Paciente",
  apellidos: "Ficticio",
  tipoDocumento: "DNI",
  numeroDocumento: "87654321",
};
const slot = {
  medicoId: 2,
  medico: { nombres: "Médico", apellidos: "Demo" },
  consultorioId: 1,
  consultorio: "Consultorio 1",
  inicio: "2099-01-09T13:00:00.000Z",
  fin: "2099-01-09T13:20:00.000Z",
};

async function login(page: Page) {
  await page.route("**/api/auth/login", (route) =>
    route.fulfill({ json: { accessToken: "test-token" } }),
  );
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({ json: { id: 1, rol: "admision" } }),
  );
  await page.route("**/api/agenda/catalog", (route) =>
    route.fulfill({ json: catalog }),
  );
  await page.route("**/api/patients?*", (route) =>
    route.fulfill({ json: [patient] }),
  );
  await page.route("**/api/agenda/availability?*", (route) =>
    route.fulfill({ json: { turnos: [slot] } }),
  );
  await page.goto("/");
  await page.getByLabel("Usuario", { exact: true }).fill("demo.admision");
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill("fictitious-password");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(
    page.getByRole("heading", { name: "Reserva de citas" }),
  ).toBeVisible();
  await expect(page.getByLabel("Especialidad", { exact: true })).toBeEnabled();
}

async function choose(page: Page) {
  await page.getByLabel("Buscar paciente", { exact: true }).fill("87654321");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await page.getByRole("button", { name: /Paciente Ficticio DNI/ }).click();
  await page.getByLabel("Especialidad", { exact: true }).selectOption("1");
  await page.getByLabel("Médico", { exact: true }).selectOption("2");
  await page.getByLabel("Fecha", { exact: true }).fill("2099-01-09");
  await page.getByRole("button", { name: "Consultar turnos" }).click();
  await page.getByRole("radio").check();
}

test("reserves the selected patient and slot, shows Lima confirmation and refreshes availability", async ({
  page,
}) => {
  await login(page);
  await choose(page);
  await expect(page.getByRole("radio")).toHaveAccessibleName(/08:00.*08:20/);
  let count = 0;
  await page.route("**/api/agenda/appointments", async (route) => {
    count++;
    expect(route.request().postDataJSON()).toEqual({
      pacienteId: 7,
      medicoId: 2,
      inicio: slot.inicio,
      motivo: "Control",
      canalOrigen: "telefono",
    });
    expect(route.request().headers().authorization).toBe("Bearer test-token");
    await route.fulfill({
      status: 201,
      json: { id: 42, fechaHoraInicio: slot.inicio, fechaHoraFin: slot.fin },
    });
  });
  await page.route("**/api/agenda/availability?*", (route) =>
    route.fulfill({ json: { turnos: [] } }),
  );
  await page.getByLabel("Motivo (opcional)").fill("Control");
  await page.getByLabel("Canal de solicitud").selectOption("telefono");
  await page.getByRole("button", { name: "Confirmar reserva" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Cita #42" }),
  ).toContainText("08:00 a 08:20");
  await expect(
    page.getByText("No hay turnos disponibles para estos filtros.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirmar reserva" }),
  ).toHaveCount(0);
  expect(count).toBe(1);
});

test("refreshes occupied slots after a 409 without retrying the reservation", async ({
  page,
}) => {
  await login(page);
  await choose(page);
  let count = 0;
  await page.route("**/api/agenda/appointments", (route) => {
    count++;
    return route.fulfill({ status: 409, json: {} });
  });
  await page.route("**/api/agenda/availability?*", (route) =>
    route.fulfill({ json: { turnos: [] } }),
  );
  await page.getByRole("button", { name: "Confirmar reserva" }).click();
  await expect(page.getByRole("alert")).toContainText("acaba de ser ocupado");
  await expect(page.getByRole("radio")).toHaveCount(0);
  expect(count).toBe(1);
});

test("invalidates selected slots when filters change and resets doctor on specialty change", async ({
  page,
}) => {
  await login(page);
  await choose(page);
  await page.getByLabel("Especialidad", { exact: true }).selectOption("3");
  await expect(page.getByLabel("Médico", { exact: true })).toHaveValue("");
  await expect(page.getByRole("radio")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Confirmar reserva" }),
  ).toHaveCount(0);
});

test("discards the session and selected patient when the API returns 401", async ({
  page,
}) => {
  await login(page);
  await page.route("**/api/patients?*", (route) =>
    route.fulfill({ status: 401, json: {} }),
  );
  await page.getByLabel("Buscar paciente").fill("Prueba");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Bienvenido de nuevo" }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("sesión venció");
  await expect(
    page.getByRole("heading", { name: "Reserva de citas" }),
  ).toHaveCount(0);
});

test("does not retain stale search results when the query changes during a request", async ({
  page,
}) => {
  await login(page);
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/patients?*", async (route) => {
    await gate;
    await route.fulfill({ json: [patient] });
  });
  await page.getByLabel("Buscar paciente").fill("Ficticio");
  const requested = page.waitForRequest("**/api/patients?*");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await requested;
  await page.getByLabel("Buscar paciente").fill("Otro");
  const responded = page.waitForResponse("**/api/patients?*");
  release();
  await responded;
  await expect(
    page.getByRole("button", { name: /Paciente Ficticio DNI/ }),
  ).toHaveCount(0);
});

test("supports the booking flow on mobile without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page);
  await choose(page);
  await expect(
    page.getByRole("button", { name: "Confirmar reserva" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("agenda-mobile.png"),
    fullPage: true,
  });
});

test("shows empty patient results without allowing a reservation", async ({
  page,
}) => {
  await login(page);
  await page.route("**/api/patients?*", (route) => route.fulfill({ json: [] }));
  await page.getByLabel("Buscar paciente").fill("Sin coincidencias");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(
    page.getByText("No se encontraron pacientes.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirmar reserva" }),
  ).toHaveCount(0);
});

test("keeps a pending reservation from being submitted twice and disables logout", async ({
  page,
}) => {
  await login(page);
  await choose(page);
  let count = 0;
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/agenda/appointments", async (route) => {
    count++;
    await gate;
    await route.fulfill({ status: 500, json: {} });
  });
  const requested = page.waitForRequest("**/api/agenda/appointments");
  await page
    .getByRole("button", { name: "Confirmar reserva" })
    .evaluate((button) => {
      button
        .closest("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
      button
        .closest("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
    });
  await requested;
  await expect(
    page.getByRole("button", { name: "Cerrar sesión" }),
  ).toBeDisabled();
  release();
  await expect(page.getByRole("alert")).toContainText(
    "No se pudo confirmar el resultado",
  );
  await expect(
    page.getByRole("button", { name: "Cerrar sesión" }),
  ).toBeEnabled();
  expect(count).toBe(1);
});

test("retries a failed catalog load and handles a catalog without schedules", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await page.route("**/api/agenda/catalog", (route) =>
    route.fulfill({ status: 500, json: {} }),
  );
  await page.getByLabel("Usuario", { exact: true }).fill("demo.admision");
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill("fictitious-password");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page.getByRole("alert")).toContainText("No se pudieron cargar");
  await page.route("**/api/agenda/catalog", (route) =>
    route.fulfill({ json: { especialidades: [] } }),
  );
  await page.getByRole("button", { name: "Reintentar carga" }).click();
  await expect(
    page.getByText("Aún no hay médicos activos", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Consultar turnos" }),
  ).toBeDisabled();
});
