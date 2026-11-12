import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

// Explicit administrative provisioning: never infer identity from a document,
// email or patient name, and never create clinical or appointment fixtures.
const patientId = Number(process.env.PORTAL_PATIENT_ID);
const username = process.env.PORTAL_USERNAME?.trim();
const password = process.env.PORTAL_PASSWORD;
if (!Number.isSafeInteger(patientId) || patientId < 1 || patientId > 2147483647 || !username || username.length > 50 || !password || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
  throw new Error('Set PORTAL_PATIENT_ID, PORTAL_USERNAME (1–50 characters), and PORTAL_PASSWORD (12+ characters, at most 72 UTF-8 bytes).');
}
const db = new PrismaClient();
try {
  const passwordHash = await hash(password, 12);
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM paciente WHERE id = ${patientId} FOR UPDATE`;
    const patient = await tx.paciente.findUnique({ where: { id: patientId } });
    if (!patient) throw new Error('Patient not found. Register the patient through admission first.');
    const existing = await tx.usuario.findUnique({ where: { username } });
    if (existing) {
      if (patient.usuarioId !== existing.id || existing.rol !== 'paciente' || !existing.activo) throw new Error('Username already exists or is not the active account linked to this patient.');
      return; // Existing password and linkage are preserved.
    }
    if (patient.usuarioId !== null) throw new Error('Patient already has an account. Existing linkage will not be replaced.');
    const user = await tx.usuario.create({ data: { username, passwordHash, nombres: patient.nombres, apellidos: patient.apellidos, rol: 'paciente' } });
    await tx.paciente.update({ where: { id: patientId }, data: { usuarioId: user.id } });
    await tx.bitacoraAuditoria.create({ data: { usuarioId: user.id, accion: 'PROVISION_PORTAL_ACCOUNT', recurso: `patients/${patientId}`, detalles: 'Administrative CLI provisioning; existing clinical data preserved.' } });
  });
  console.log('Patient portal account ready. Existing passwords and patient data were preserved.');
} finally {
  await db.$disconnect();
}
