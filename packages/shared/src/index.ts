export type LicenseStatus = 'active' | 'expired' | 'suspended';
export type ContractStatus = 'active' | 'renewing' | 'expired';
/** Status do ciclo de vida documental do contrato (CLM). */
export type ContractClmStatus = 'draft' | 'in_review' | 'approved' | 'signed';
export type PaymentCycle = 'monthly' | 'quarterly' | 'yearly' | 'custom';
export type UserRole = 'owner' | 'agent';
export type SignedLicenseAlgorithm = 'Ed25519';

export interface LicenseSummary {
  key: string;
  planName: string;
  status: LicenseStatus;
  expiresAt: string;
  activatedMachineId: string | null;
}

export interface ManagedLicense extends LicenseSummary {
  id: string;
  createdAt: string;
  activatedAt: string | null;
}

export interface LicenseUpsertPayload {
  planName: string;
  expiresAt: string;
  status: LicenseStatus;
}

export interface SignedLicensePayload {
  licenseId: string;
  customer: string;
  plan: string;
  issuedAt: string;
  expiresAt: string;
  graceDays: number;
  machineId: string | null;
  features: string[];
}

export interface SignedLicenseFile {
  alg: SignedLicenseAlgorithm;
  kid: string;
  payload: SignedLicensePayload;
  signature: string;
}

export function serializeSignedLicensePayload(payload: SignedLicensePayload) {
  return JSON.stringify({
    licenseId: payload.licenseId,
    customer: payload.customer,
    plan: payload.plan,
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt,
    graceDays: payload.graceDays,
    machineId: payload.machineId,
    features: payload.features
  });
}

export interface UserSession {
  token: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    displayName: string;
    role: UserRole;
  };
  license: LicenseSummary;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  company: string;
  phone: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Contract {
  id: string;
  customerId: string;
  customerName: string;
  title: string;
  description: string;
  valueCents: number;
  startDate: string;
  endDate: string;
  renewalDate: string;
  status: ContractStatus;
  clmStatus: ContractClmStatus;
  autoRenew: boolean;
  paymentCycle: PaymentCycle;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardMetrics {
  activeContracts: number;
  expiringSoon: number;
  expiredContracts: number;
  monthlyRecurringRevenueCents: number;
  projectedRenewalValueCents: number;
  draftContracts: number;
  pendingReviewContracts: number;
}

export interface DashboardPayload {
  metrics: DashboardMetrics;
  upcomingRenewals: Contract[];
}
