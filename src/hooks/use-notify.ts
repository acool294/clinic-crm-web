'use client';

import type { NotifyRequest } from '@/lib/types';

export function useNotify() {
  async function sendNotification(payload: NotifyRequest): Promise<boolean> {
    try {
      const res = await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  return { sendNotification };
}
