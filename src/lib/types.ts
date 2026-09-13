export interface NotifyRecipient {
  name: string;
  phone: string; // e.g. '+91 98765 43210'
  email: string;
}

export interface NotifyData {
  // For appointment_reminder:
  appointmentDate?: string;
  appointmentTime?: string;
  doctorName?: string;
  clinicName?: string;
  // For invoice_receipt:
  invoiceId?: string;
  amount?: number;
  paidAmount?: number;
  // For follow_up_reminder:
  followUpDate?: string;
}

export type NotifyType = 'appointment_reminder' | 'follow_up_reminder' | 'invoice_receipt';

export interface NotifyRequest {
  type: 'appointment_reminder' | 'follow_up_reminder' | 'invoice_receipt';
  to: {
    name: string;
    phone: string; // e.g. '+91 98765 43210'
    email: string;
  };
  data: {
    // For appointment_reminder:
    appointmentDate?: string;
    appointmentTime?: string;
    doctorName?: string;
    clinicName?: string;
    // For invoice_receipt:
    invoiceId?: string;
    amount?: number;
    paidAmount?: number;
    // For follow_up_reminder:
    followUpDate?: string;
  };
}

export interface NotifyResponse {
  success: boolean;
  channel: 'mock' | string;
  message: string;
  sentTo: {
    phone: string;
    email: string;
  };
}
