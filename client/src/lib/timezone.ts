export const TIMEZONE = 'America/New_York';
export const TIMEZONE_LABEL = 'Eastern Time (ET)';

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

export function formatEasternTime(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const defaultOptions: Intl.DateTimeFormatOptions = { 
    timeZone: TIMEZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  };
  return d.toLocaleString('en-US', options ? { timeZone: TIMEZONE, ...options } : defaultOptions);
}

export function formatEasternDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', { 
    timeZone: TIMEZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatEasternTimeOnly(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('en-US', { 
    timeZone: TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}
