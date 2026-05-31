import dns from 'dns';
import http from 'http';
import https from 'https';
import dotenv from 'dotenv';
import { Agent, fetch as undiciFetch } from 'undici';

dotenv.config();

dns.setDefaultResultOrder('ipv4first');

const ipv4Agent = new Agent({ connect: { family: 4 } });

const fetchIPv4 = (url: string, init?: any): Promise<Response> => {
  return undiciFetch(url, { ...init, dispatcher: ipv4Agent }) as unknown as Promise<Response>;
};

const httpAgent = new http.Agent({ family: 4 });
const httpsAgent = new https.Agent({ family: 4 });

export interface AuthState {
  gravityCookie: string;
  accountId: string;
  isAuthenticated: boolean;
  expiresAt: number;
  loginTime: number;
}

export function createEmptyAuthState(): AuthState {
  return {
    gravityCookie: '',
    accountId: '',
    isAuthenticated: false,
    expiresAt: 0,
    loginTime: 0,
  };
}

let authState: AuthState = createEmptyAuthState();

export async function authenticateGRVT(): Promise<boolean> {
  try {
    console.log('🔐 Autenticando con GRVT Edge API...');
    
    const apiKey = process.env.GRVT_API_KEY;
    if (!apiKey) {
      throw new Error('GRVT_API_KEY no encontrada en .env');
    }

    const response = await fetchIPv4('https://edge.grvt.io/auth/api_key/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'GRVT-Grid-Bot/1.0'
      },
      body: JSON.stringify({ api_key: apiKey }),
    });

    console.log(`📡 Login response: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Login failed:', errorText);
      return false;
    }

    const body = await response.json() as any;
    if (body.status !== 'success') {
      console.error('❌ Login status not success:', body);
      return false;
    }

    const accountId = response.headers.get('x-grvt-account-id') || String(body.sub_account_id || '');
    if (!accountId) {
      console.error('❌ No account ID found');
      return false;
    }

    const setCookie = response.headers.get('set-cookie') || '';
    const gravityMatch = setCookie.match(/gravity=([^;]+)/);
    const gravityCookie = gravityMatch?.[1] || '';

    const now = Date.now();
    authState = {
      gravityCookie,
      accountId,
      isAuthenticated: true,
      expiresAt: now + (23 * 60 * 60 * 1000),
      loginTime: now
    };

    console.log('✅ Auth exitoso!');
    console.log(`🆔 Account ID: ${accountId}`);
    return true;

  } catch (error) {
    console.error('❌ Auth error:', error instanceof Error ? error.message : error);
    authState.isAuthenticated = false;
    return false;
  }
}

function needsReauth(): boolean {
  if (!authState.isAuthenticated) return true;
  const now = Date.now();
  const timeLeft = authState.expiresAt - now;
  if (timeLeft < 60 * 60 * 1000) {
    console.log('⏰ Cookie expirando pronto, re-autenticando...');
    return true;
  }
  return false;
}

async function ensureAuthenticated(): Promise<void> {
  if (needsReauth()) {
    const success = await authenticateGRVT();
    if (!success) {
      throw new Error('Falló re-autenticación con GRVT');
    }
  }
}

export async function authenticatedRequest(
  url: string, 
  body: object = {}, 
  options: { method?: string; timeout?: number; } = {}
): Promise<any> {
  await ensureAuthenticated();
  
  const { method = 'POST', timeout = 30000 } = options;
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Cookie': `gravity=${authState.gravityCookie}`,
    'X-Grvt-Account-Id': authState.accountId,
    'User-Agent': 'GRVT-Grid-Bot/1.0'
  };
  
  try {
    const response = await fetchIPv4(url, {
      method,
      headers,
      body: method !== 'GET' ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeout)
    });

    console.log(`📡 ${method} ${url} → ${response.status}`);

    if (response.status === 401) {
      console.log('🔒 Token expirado, reautenticando...');
      authState.isAuthenticated = false;
      await ensureAuthenticated();
      return await authenticatedRequest(url, body, options);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as { result?: unknown; [k: string]: unknown };
    return data.result ?? data;

  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Error(`Request timeout after ${timeout}ms`);
    }
    throw error;
  }
}

export async function publicRequest(
  url: string,
  body: object = {},
  options: { timeout?: number } = {}
): Promise<any> {
  const { timeout = 15000 } = options;
  
  try {
    const response = await fetchIPv4(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'GRVT-Grid-Bot/1.0'
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout)
    });

    console.log(`📡 POST ${url} → ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as { result?: unknown; [k: string]: unknown };
    return data.result ?? data;

  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Error(`Public request timeout after ${timeout}ms`);
    }
    throw error;
  }
}

export function getAuthStatus() {
  const now = Date.now();
  const timeLeft = authState.expiresAt - now;
  return {
    isAuthenticated: authState.isAuthenticated,
    accountId: authState.accountId,
    hasValidCookie: !!authState.gravityCookie && timeLeft > 0,
    timeLeftHours: Math.max(0, timeLeft / 1000 / 3600),
    loginTime: authState.loginTime ? new Date(authState.loginTime).toISOString() : null,
    expiresAt: authState.expiresAt ? new Date(authState.expiresAt).toISOString() : null
  };
}

export function logout() {
  authState = {
    gravityCookie: '',
    accountId: '',
    isAuthenticated: false,
    expiresAt: 0,
    loginTime: 0
  };
  console.log('🚪 Logged out from GRVT');
}

export async function authenticateWithKey(
  apiKey: string,
  state: AuthState
): Promise<boolean> {
  try {
    const response = await fetchIPv4('https://edge.grvt.io/auth/api_key/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'GRVT-Grid-Bot/1.0',
      },
      body: JSON.stringify({ api_key: apiKey }),
    });
    if (!response.ok) return false;
    const body = await response.json() as any;
    if (body.status !== 'success') return false;
    const accountId = response.headers.get('x-grvt-account-id') ||
                      String(body.sub_account_id || '');
    if (!accountId) return false;
    const setCookie = response.headers.get('set-cookie') || '';
    const gravityMatch = setCookie.match(/gravity=([^;]+)/);
    const gravityCookie = gravityMatch?.[1] || '';
    const now = Date.now();
    state.gravityCookie = gravityCookie;
    state.accountId = accountId;
    state.isAuthenticated = true;
    state.expiresAt = now + 23 * 60 * 60 * 1000;
    state.loginTime = now;
    return true;
  } catch {
    state.isAuthenticated = false;
    return false;
  }
}

export async function authenticatedRequestWithState(
  state: AuthState,
  apiKey: string,
  url: string,
  body: object = {},
  options: { method?: string; timeout?: number } = {}
): Promise<any> {
  if (!state.isAuthenticated || (state.expiresAt - Date.now()) < 60 * 60 * 1000) {
    const ok = await authenticateWithKey(apiKey, state);
    if (!ok) throw new Error('GRVT re-authentication failed');
  }

  const { method = 'POST', timeout = 30000 } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Cookie': `gravity=${state.gravityCookie}`,
    'X-Grvt-Account-Id': state.accountId,
    'User-Agent': 'GRVT-Grid-Bot/1.0',
  };

  const response = await fetchIPv4(url, {
    method,
    headers,
    body: method !== 'GET' ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeout),
  });

  if (response.status === 401) {
    state.isAuthenticated = false;
    const ok = await authenticateWithKey(apiKey, state);
    if (!ok) throw new Error('GRVT re-authentication failed after 401');
    return authenticatedRequestWithState(state, apiKey, url, body, options);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as { result?: unknown; [k: string]: unknown };
  return data.result ?? data;
}

export default {
  authenticateGRVT,
  authenticatedRequest,
  publicRequest,
  getAuthStatus,
  logout,
  authenticateWithKey,
  authenticatedRequestWithState,
  createEmptyAuthState,
};
