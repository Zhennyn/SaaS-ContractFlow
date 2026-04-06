import type { Contract, Customer, DashboardPayload, LicenseUpsertPayload, ManagedLicense, UserSession } from '@contractflow/shared';

export type LoginPayload = {
  email: string;
  password: string;
  licenseKey: string;
  machineId: string;
};

export type CustomerPayload = Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>;
export type ContractPayload = Omit<Contract, 'id' | 'customerName' | 'createdAt' | 'updatedAt'>;
export type ManagedLicensePayload = LicenseUpsertPayload;

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(apiUrl: string, path: string, init?: RequestInit, token?: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    signal,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: 'Erro inesperado.' }));
    throw new ApiError(response.status, body.message ?? 'Erro inesperado.');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  login: (apiUrl: string, payload: LoginPayload) =>
    request<UserSession>(apiUrl, '/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  refreshSession: (apiUrl: string, refreshToken: string, machineId: string) =>
    request<UserSession>(apiUrl, '/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken, machineId }) }),
  getMe: (apiUrl: string, token: string, signal?: AbortSignal) =>
    request<{ user: UserSession['user']; license: UserSession['license'] }>(apiUrl, '/me', undefined, token, signal),
  getDashboard: (apiUrl: string, token: string, signal?: AbortSignal) => request<DashboardPayload>(apiUrl, '/dashboard', undefined, token, signal),
  getCustomers: (apiUrl: string, token: string, signal?: AbortSignal) => request<Customer[]>(apiUrl, '/customers', undefined, token, signal),
  createCustomer: (apiUrl: string, token: string, payload: CustomerPayload) =>
    request<Customer>(apiUrl, '/customers', { method: 'POST', body: JSON.stringify(payload) }, token),
  updateCustomer: (apiUrl: string, token: string, id: string, payload: CustomerPayload) =>
    request<Customer>(apiUrl, `/customers/${id}`, { method: 'PUT', body: JSON.stringify(payload) }, token),
  deleteCustomer: (apiUrl: string, token: string, id: string) =>
    request<void>(apiUrl, `/customers/${id}`, { method: 'DELETE' }, token),
  getContracts: (apiUrl: string, token: string, signal?: AbortSignal) => request<Contract[]>(apiUrl, '/contracts', undefined, token, signal),
  createContract: (apiUrl: string, token: string, payload: ContractPayload) =>
    request<Contract>(apiUrl, '/contracts', { method: 'POST', body: JSON.stringify(payload) }, token),
  updateContract: (apiUrl: string, token: string, id: string, payload: ContractPayload) =>
    request<Contract>(apiUrl, `/contracts/${id}`, { method: 'PUT', body: JSON.stringify(payload) }, token),
  deleteContract: (apiUrl: string, token: string, id: string) =>
    request<void>(apiUrl, `/contracts/${id}`, { method: 'DELETE' }, token),
  getLicenses: (apiUrl: string, token: string, signal?: AbortSignal) => request<ManagedLicense[]>(apiUrl, '/licenses', undefined, token, signal),
  createLicense: (apiUrl: string, token: string, payload: ManagedLicensePayload) =>
    request<ManagedLicense>(apiUrl, '/licenses', { method: 'POST', body: JSON.stringify(payload) }, token),
  updateLicense: (apiUrl: string, token: string, id: string, payload: ManagedLicensePayload) =>
    request<ManagedLicense>(apiUrl, `/licenses/${id}`, { method: 'PUT', body: JSON.stringify(payload) }, token),
  resetLicenseMachine: (apiUrl: string, token: string, id: string) =>
    request<ManagedLicense>(apiUrl, `/licenses/${id}/reset-machine`, { method: 'POST' }, token)
};
