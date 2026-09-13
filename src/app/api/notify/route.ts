// MSG91 Integration (when ready):
// 1. Sign up at msg91.com and get an AUTH_KEY
// 2. Add NEXT_PUBLIC_MSG91_AUTH_KEY to .env.local
// 3. Replace the mock send below with:
//    await fetch('https://api.msg91.com/api/v5/flow/', { method: 'POST', headers: { authkey: process.env.MSG91_AUTH_KEY }, body: JSON.stringify({ template_id: 'YOUR_TEMPLATE_ID', recipients: [{ mobiles: phone, var1: name }] }) })
// Cost estimate: ~₹0.20/SMS, ~₹0.50/WhatsApp message via MSG91 India plan

import { NextResponse } from 'next/server';
import type { NotifyRequest, NotifyResponse } from '@/lib/types';

function constructMessage(payload: NotifyRequest): string {
  const { type, to, data } = payload;
  const name = to.name || 'Patient';
  const clinicName = data.clinicName || 'Clinic CRM';
  const doctorName = data.doctorName || 'Doctor';

  switch (type) {
    case 'appointment_reminder': {
      const appointmentDate = data.appointmentDate || '';
      const appointmentTime = data.appointmentTime || '';
      return `Hi ${name}, this is a reminder for your appointment with ${doctorName} at ${clinicName} on ${appointmentDate} at ${appointmentTime}. Please arrive 10 minutes early.`;
    }
    case 'follow_up_reminder': {
      const followUpDate = data.followUpDate || '';
      return `Hi ${name}, ${doctorName} recommends a follow-up visit on ${followUpDate}. Please book your appointment at ${clinicName}.`;
    }
    case 'invoice_receipt': {
      const paidAmount = data.paidAmount ?? 0;
      const amount = data.amount ?? 0;
      const invoiceId = data.invoiceId || '';
      return `Hi ${name}, your payment of ₹${paidAmount} has been recorded at ${clinicName}. Invoice #${invoiceId}. Total: ₹${amount}. Thank you!`;
    }
    default: {
      const _exhaustiveCheck: never = type;
      throw new Error(`Unhandled notification type: ${_exhaustiveCheck}`);
    }
  }
}

function getSubject(type: NotifyRequest['type']): string {
  switch (type) {
    case 'appointment_reminder':
      return 'Appointment Reminder';
    case 'follow_up_reminder':
      return 'Follow-up Reminder';
    case 'invoice_receipt':
      return 'Invoice Receipt';
    default:
      return 'Notification';
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<NotifyRequest>;

    if (!body || !body.type || !body.to) {
      return NextResponse.json(
        { success: false, error: 'Invalid request: "type" and "to" fields are required.' },
        { status: 400 }
      );
    }

    const { type, to, data = {} } = body;

    if (!to.name || !to.phone || !to.email) {
      return NextResponse.json(
        { success: false, error: 'Recipient "name", "phone", and "email" are required.' },
        { status: 400 }
      );
    }

    if (
      type !== 'appointment_reminder' &&
      type !== 'follow_up_reminder' &&
      type !== 'invoice_receipt'
    ) {
      return NextResponse.json(
        { success: false, error: `Invalid notification type: ${String(type)}` },
        { status: 400 }
      );
    }

    const payload: NotifyRequest = {
      type,
      to,
      data,
    };

    const message = constructMessage(payload);
    const subject = getSubject(type);

    // Mock notification logging simulating SMS and Email delivery
    console.log(`[NOTIFY] SMS -> ${to.phone}`);
    console.log(`Message: ${message}`);
    console.log(`[NOTIFY] Email -> ${to.email}`);
    console.log(`Subject: ${subject}`);

    const responseData: NotifyResponse = {
      success: true,
      channel: 'mock',
      message,
      sentTo: {
        phone: to.phone,
        email: to.email,
      },
    };

    return NextResponse.json(responseData, { status: 200 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown server error';
    console.error('[NOTIFY] Error dispatching notification:', errorMessage);
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
