export const TIMEZONE = 'America/New_York';
export const TIMEZONE_LABEL = 'Eastern Time (ET)';

export function formatEasternDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-US', { 
    timeZone: TIMEZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  });
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

export function formatRelativeET(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(Math.abs(diffMs) / (1000 * 60 * 60));
  
  if (diffMs < 0) {
    if (diffHours < 24) return `${diffHours} hours ago`;
    return `${Math.abs(diffDays)} days ago`;
  } else {
    if (diffHours < 24) return `in ${diffHours} hours`;
    return `in ${diffDays} days`;
  }
}
