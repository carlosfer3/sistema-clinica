import { describe, it, expect, vi } from 'vitest';
import { ConsultationsService } from '../src/consultations/consultations.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { AuditService } from '../src/audit/audit.service.js';

function setup(estado = 'activo') {
  const tx = {
    $queryRaw: vi.fn(),
    consulta: {
      findFirst: vi.fn().mockResolvedValue({ id: 8, estado }),
      update: vi.fn().mockResolvedValue({ id: 8, estado: 'anulado' }),
    },
    bitacoraAuditoria: { create: vi.fn() },
  };
  const prisma = { $transaction: vi.fn(async (fn: (value: typeof tx) => unknown) => fn(tx)) };
  return { tx, service: new ConsultationsService(prisma as unknown as PrismaService, {} as AuditService) };
}
describe('Clinical annulment', () => {
  it('records reason, authenticated author and timestamp without altering clinical content or appointment', async () => {
    const { tx, service } = setup();
    await service.annul(8, ' Error de registro ', 2, '127.0.0.1');
    expect(tx.consulta.findFirst).toHaveBeenCalledWith({ where: { id: 8, medico: { usuarioId: 2 } } });
    expect(tx.consulta.update.mock.calls[0][0].data).toEqual({ estado: 'anulado', motivoAnulacion: 'Error de registro', anuladoPor: 2, anuladoEn: expect.any(Date) });
    expect(tx.bitacoraAuditoria.create).toHaveBeenCalledWith({ data: expect.objectContaining({ usuarioId: 2, accion: 'ANNUL_CONSULTATION', recurso: 'consultations/8' }) });
  });
  it('rejects empty and excessive reasons before writing', async () => {
    const { tx, service } = setup();
    for (const reason of ['   ', 'x'.repeat(301)]) await expect(service.annul(8, reason, 2)).rejects.toThrow();
    expect(tx.consulta.update).not.toHaveBeenCalled();
  });
  it('rejects another doctor consultation', async () => {
    const { tx, service } = setup(); tx.consulta.findFirst.mockResolvedValue(null);
    await expect(service.annul(8, 'Error', 3)).rejects.toThrow('not accessible');
    expect(tx.consulta.update).not.toHaveBeenCalled();
  });
  it('never overwrites an existing annulment', async () => {
    const { tx, service } = setup('anulado');
    await expect(service.annul(8, 'Otro motivo', 2)).rejects.toThrow('already annulled');
    expect(tx.consulta.update).not.toHaveBeenCalled();
  });
  it('propagates audit failure so the transaction cannot commit', async () => {
    const { tx, service } = setup(); tx.bitacoraAuditoria.create.mockRejectedValue(new Error('Audit unavailable'));
    await expect(service.annul(8, 'Error', 2)).rejects.toThrow('Audit unavailable');
  });
});
