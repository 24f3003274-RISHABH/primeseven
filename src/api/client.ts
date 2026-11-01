const SESSION_TOKEN_KEY = 'primeprep_auth_token';
let inMemoryToken: string | null = null;

export function getAuthToken(): string | null {
  if (inMemoryToken) return inMemoryToken;
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      inMemoryToken = window.sessionStorage.getItem(SESSION_TOKEN_KEY);
      return inMemoryToken;
    }
  } catch {
    // Ignore storage restriction errors in sandboxed iframes
  }
  return null;
}

export function setAuthToken(token: string | null): void {
  inMemoryToken = token;
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      if (token) {
        window.sessionStorage.setItem(SESSION_TOKEN_KEY, token);
      } else {
        window.sessionStorage.removeItem(SESSION_TOKEN_KEY);
      }
    }
  } catch {
    // Ignore storage restriction errors in sandboxed iframes
  }
}

function getValidApiBaseUrl(): string {
  const raw = (import.meta.env.VITE_API_BASE_URL || '').trim();
  if (!raw || /^(na|n\/a|none|null|undefined)$/i.test(raw)) {
    return '';
  }
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return raw.replace(/\/$/, '');
  }
  return '';
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  const token = getAuthToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Support VITE_API_BASE_URL when frontend is deployed to Vercel and backend is on Render
  const baseUrl = getValidApiBaseUrl();
  const resolvedUrl =
    endpoint.startsWith('http://') || endpoint.startsWith('https://')
      ? endpoint
      : `${baseUrl}${endpoint}`;

  const response = await fetch(resolvedUrl, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorMessage = data?.error || `Request failed with status ${response.status}`;
    const error: any = new Error(errorMessage);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data as T;
}

export function formatPaiseToINR(paise: number): string {
  const rupees = Math.round((paise || 0) / 100);
  return `₹${rupees.toLocaleString('en-IN')}`;
}

export function formatDurationSeconds(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds || 0));
  const mins = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}
