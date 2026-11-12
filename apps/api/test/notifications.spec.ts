import { describe, it, expect } from 'vitest';
import { notificationContent, type AppointmentNotification } from '../src/reminders/notifications.service.js';

const base: AppointmentNotification = { id: 1, cita_id: 12, tipo: 'registro', correo: 'test@example.test', inicio: new Date('2099-01-09T13:00:00Z'), inicio_anterior: null, especialidad: 'Cardiología', pendiente_confirmacion: false, intentos: 1 };
describe('Appointment notification content', () => {
  it('includes date, Lima time and specialty without clinical details', () => {
    const result = notificationContent(base);
    expect(result.subject).toContain('Cita registrada');
    expect(result.text).toContain('Cardiología'); expect(result.text).toContain('2099'); expect(result.text).toContain('(Lima)');
  });
  it('does not present a portal request as a confirmed appointment', () => {
    const result = notificationContent({ ...base, pendiente_confirmacion: true });
    expect(result.subject).toContain('Solicitud de cita recibida');
    expect(result.text).toContain('pendiente de confirmación');
  });
  it('includes both times when rescheduled', () => {
    const result = notificationContent({ ...base, tipo: 'reprogramacion', inicio_anterior: new Date('2099-01-08T13:00:00Z') });
    expect(result.text).toContain('Horario anterior:'); expect(result.subject).toContain('reprogramada');
  });
  it('explicitly identifies the cancelled schedule', () => {
    const result = notificationContent({ ...base, tipo: 'cancelacion' });
    expect(result.subject).toContain('cancelada'); expect(result.text).toContain('Horario cancelado:');
  });
  it('distinguishes admission confirmation from receiving a request', () => {
    expect(notificationContent({ ...base, tipo: 'confirmacion' }).subject).toContain('confirmada por admisión');
  });
});
