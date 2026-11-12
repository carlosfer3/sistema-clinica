/**
 * Versioned integration contracts for the next sprint.
 * No routes, persistence, email delivery or laboratory workflow are enabled here.
 */
export interface ClinicalReferenceV1 {
  consultaId: number;
  citaId: number;
  pacienteId: number;
  medicoId: number;
}

/** Created only after consultation persistence commits; deduplicated by event ID. */
export interface ConsultationRecordedV1 {
  version: 1;
  eventId: string;
  occurredAt: string;
  reference: ClinicalReferenceV1;
}

export type ClinicalDeliveryStatus = 'pendiente' | 'enviando' | 'enviado' | 'fallido';

/** Recipient resolution and authorization belong to the future server implementation. */
export interface ClinicalDeliveryV1 {
  id: number;
  consultaId: number;
  documento: 'resumen_consulta' | 'receta';
  estado: ClinicalDeliveryStatus;
  solicitadoPor: number;
  solicitadoEn: string;
  enviadoEn: string | null;
}

export type LabOrderStatus = 'solicitada' | 'en_proceso' | 'con_resultados' | 'cancelada';

export interface LabOrderV1 {
  id: number;
  reference: ClinicalReferenceV1;
  estado: LabOrderStatus;
  solicitadoEn: string;
  examenes: { examenId: number; nombre: string; indicaciones: string | null }[];
}

/** Reference ranges are laboratory-supplied text, not an automatic diagnosis. */
export interface LabResultV1 {
  id: number;
  ordenId: number;
  examenId: number;
  estado: 'borrador' | 'validado';
  observaciones: string | null;
  valores: { parametro: string; valor: string; unidad: string | null; referencia: string | null }[];
  registradoPor: number;
  registradoEn: string;
  validadoPor: number | null;
  validadoEn: string | null;
}
