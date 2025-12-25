export const TIMEZONE = 'America/New_York';

export function toEasternTime(date: Date | string): Date {
  const d = typeof date === 'string' ? new Date(date) : date;
  const etFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  
  const parts = etFormatter.formatToParts(d);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value || '0';
  
  return new Date(
    `${getPart('year')}-${getPart('month')}-${getPart('day')}T${getPart('hour')}:${getPart('minute')}:${getPart('second')}`
  );
}

export function getCurrentEasternTime(): Date {
  return toEasternTime(new Date());
}

export function formatEasternTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-US', { 
    timeZone: TIMEZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function getEasternTimeOffset(): number {
  const now = new Date();
  const etString = now.toLocaleString('en-US', { timeZone: TIMEZONE });
  const etDate = new Date(etString);
  return (now.getTime() - etDate.getTime()) / (1000 * 60 * 60);
}
