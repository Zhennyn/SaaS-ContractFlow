import { useEffect, useMemo, useRef, useState } from 'react';
import { CategoryScale, Chart as ChartJS, Legend, LineElement, LinearScale, PointElement, Tooltip } from 'chart.js';
import { Line } from 'react-chartjs-2';
import type { Contract, Customer, DashboardPayload, LicenseStatus, ManagedLicense, PaymentCycle, SignedLicenseFile, UserSession } from '@contractflow/shared';
import { ApiError, api, type ContractPayload, type CustomerPayload, type ManagedLicensePayload } from './api';
import { buildContractsTrends, getContractsAtRiskCount, getMonthOverMonthVariation } from './contracts-analytics';
import { exportContractsPdf } from './contracts-pdf';
import { getLicenseStatusLabel, verifySignedLicense } from './license';

type FormMessage = {
  kind: 'error' | 'success';
  text: string;
};

type RenewalToast = {
  id: string;
  contractId: string;
  contractTitle: string;
  customerName: string;
  renewalDate: string;
  dueInDays: number;
};

type ContractStatusFilter = 'all' | Contract['status'];

type EmailSmtpSettings = {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  recipient: string;
};

const defaultEmailSettings: EmailSmtpSettings = {
  enabled: false,
  host: '',
  port: 587,
  secure: false,
  user: '',
  password: '',
  recipient: ''
};

const apiStorageKey = 'contractflow-api-url';
const signedLicenseCacheKey = 'contractflow-signed-license';
const renewalSeenStorageKey = 'contractflow-renewal-seen';
const renewalSnoozeStorageKey = 'contractflow-renewal-snooze';
const renewalIntervalStorageKey = 'contractflow-renewal-interval-minutes';
const renewalThresholdsStorageKey = 'contractflow-renewal-thresholds';
const emailSettingsStorageKey = 'contractflow-email-settings';
const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();
const defaultApiUrl = configuredApiUrl && configuredApiUrl.length > 0 ? configuredApiUrl : 'http://localhost:4000';
const isDevMode = import.meta.env.DEV;
const renewalNotifyDays = 30;
/** Marcos padrão de alerta (em dias antes do vencimento). Pode ser sobrescrito pelo usuário via UI. */
const defaultRenewalThresholds: number[] = [30, 15, 7, 1];
const defaultNotificationIntervalMinutes = 180;

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

const emptyCustomerForm: CustomerPayload = {
  name: '',
  email: '',
  company: '',
  phone: '',
  notes: ''
};

const emptyContractForm: ContractPayload = {
  customerId: '',
  title: '',
  description: '',
  valueCents: 0,
  startDate: '',
  endDate: '',
  renewalDate: '',
  status: 'active',
  autoRenew: true,
  paymentCycle: 'monthly',
  notes: ''
};

const emptyLicenseForm: ManagedLicensePayload = {
  planName: 'Growth Annual',
  expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString(),
  status: 'active'
};

function toDateInput(value: string) {
  return value.slice(0, 10);
}

function formatCurrency(valueCents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valueCents / 100);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR').format(new Date(value));
}

function isAuthError(error: unknown) {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

function daysBetween(futureDateIso: string, fromDate: Date) {
  return Math.ceil((new Date(futureDateIso).getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
}

function getDaysUntilDate(targetIso: string, fromDate = new Date()) {
  const target = new Date(targetIso);
  const fromUtc = Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), fromDate.getUTCDate());
  const targetUtc = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate());
  return Math.ceil((targetUtc - fromUtc) / (1000 * 60 * 60 * 24));
}

function readStoredMap(storageKey: string) {
  const raw = localStorage.getItem(storageKey);
  if (!raw) {
    return {} as Record<string, string>;
  }

  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {} as Record<string, string>;
  }
}

function formatVariation(value: number) {
  const signal = value > 0 ? '+' : '';
  return `${signal}${value.toFixed(1)}%`;
}

/** Monta o HTML do e-mail de alerta de renovacao para um contrato especifico. */
function buildRenewalEmailHtml(contractTitle: string, customerName: string, renewalDate: string, dueInDays: number) {
  const renewalFormatted = new Intl.DateTimeFormat('pt-BR').format(new Date(renewalDate));
  const today = new Intl.DateTimeFormat('pt-BR').format(new Date());
  return `
    <div style="font-family:IBM Plex Sans,Segoe UI,sans-serif;max-width:540px;margin:auto;padding:24px;background:#f4efe5;border-radius:16px">
      <div style="background:#1d533a;border-radius:12px 12px 0 0;padding:20px 24px">
        <h1 style="margin:0;color:#fff9f0;font-size:1.2rem">ContractFlow Suite</h1>
        <p style="margin:6px 0 0;color:#b8d4c4">Alerta de renovacao de contrato</p>
      </div>
      <div style="background:#ffffff;border-radius:0 0 12px 12px;padding:24px">
        <h2 style="margin:0 0 8px;color:#162019">${contractTitle}</h2>
        <p style="margin:0 0 6px;color:#506056">Cliente: <strong>${customerName}</strong></p>
        <p style="margin:0 0 6px;color:#506056">Renovacao em: <strong>${renewalFormatted}</strong></p>
        <p style="background:#fff9f0;border:1px solid #e9b954;border-radius:8px;padding:10px 14px;color:#8b5a17;font-weight:bold;margin:14px 0">
          Este contrato vence em ${dueInDays} dia(s).
        </p>
        <p style="color:#506056;font-size:0.85rem;margin-top:16px">Gerado pelo ContractFlow Suite em ${today}</p>
      </div>
    </div>
  `;
}

function getMonthlyEquivalentCents(contract: Contract) {
  if (contract.paymentCycle === 'monthly') {
    return contract.valueCents;
  }

  if (contract.paymentCycle === 'quarterly') {
    return contract.valueCents / 3;
  }

  if (contract.paymentCycle === 'yearly') {
    return contract.valueCents / 12;
  }

  return contract.valueCents;
}

async function deriveAesKey(machineId: string) {
  const encoder = new TextEncoder();
  const material = await crypto.subtle.importKey('raw', encoder.encode(`contractflow:${machineId}`), 'PBKDF2', false, ['deriveKey']);

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode('contractflow-license-cache-v1'),
      iterations: 120000,
      hash: 'SHA-256'
    },
    material,
    {
      name: 'AES-GCM',
      length: 256
    },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptSignedLicense(machineId: string, license: SignedLicenseFile) {
  const encoder = new TextEncoder();
  const key = await deriveAesKey(machineId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(JSON.stringify(license))
  );

  const binary = new Uint8Array(encrypted);
  localStorage.setItem(
    signedLicenseCacheKey,
    JSON.stringify({
      iv: Array.from(iv),
      data: Array.from(binary)
    })
  );
}

async function decryptSignedLicense(machineId: string) {
  const raw = localStorage.getItem(signedLicenseCacheKey);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as { iv: number[]; data: number[] };
    const key = await deriveAesKey(machineId);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(parsed.iv) },
      key,
      new Uint8Array(parsed.data)
    );
    return JSON.parse(new TextDecoder().decode(decrypted)) as SignedLicenseFile;
  } catch {
    return null;
  }
}

function App() {
  const [apiUrl, setApiUrl] = useState(() => localStorage.getItem(apiStorageKey) ?? defaultApiUrl);
  const [session, setSession] = useState<UserSession | null>(null);
  const [machineId, setMachineId] = useState('');
  const [appVersion, setAppVersion] = useState('1.0.0');
  const [loginEmail, setLoginEmail] = useState('owner@contractflow.local');
  const [loginPassword, setLoginPassword] = useState('admin123');
  const [licenseKey, setLicenseKey] = useState('CFLOW-DEMO-2026');
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [licenses, setLicenses] = useState<ManagedLicense[]>([]);
  const [customerForm, setCustomerForm] = useState<CustomerPayload>(emptyCustomerForm);
  const [contractForm, setContractForm] = useState<ContractPayload>(emptyContractForm);
  const [licenseForm, setLicenseForm] = useState<ManagedLicensePayload>(emptyLicenseForm);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [editingContractId, setEditingContractId] = useState<string | null>(null);
  const [editingLicenseId, setEditingLicenseId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<FormMessage | null>(null);
  const [alerts, setAlerts] = useState<string[]>([]);
  const [contractSearch, setContractSearch] = useState('');
  const [contractStatusFilter, setContractStatusFilter] = useState<ContractStatusFilter>('all');
  const [renewalToasts, setRenewalToasts] = useState<RenewalToast[]>([]);
  const [notificationIntervalMinutes, setNotificationIntervalMinutes] = useState(() => {
    const raw = localStorage.getItem(renewalIntervalStorageKey);
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultNotificationIntervalMinutes;
  });
  const [seenRenewalMap, setSeenRenewalMap] = useState<Record<string, string>>(() => readStoredMap(renewalSeenStorageKey));
  const [snoozedRenewalMap, setSnoozedRenewalMap] = useState<Record<string, string>>(() => readStoredMap(renewalSnoozeStorageKey));
  const [renewalThresholds, setRenewalThresholds] = useState<number[]>(() => {
    const raw = localStorage.getItem(renewalThresholdsStorageKey);
    if (!raw) return defaultRenewalThresholds;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.every((n) => typeof n === 'number' && n > 0)) {
        return (parsed as number[]).sort((a, b) => b - a);
      }
    } catch { /* usa padrão */ }
    return defaultRenewalThresholds;
  });
  const [emailSettings, setEmailSettings] = useState<EmailSmtpSettings>(() => {
    const raw = localStorage.getItem(emailSettingsStorageKey);
    if (!raw) return defaultEmailSettings;
    try {
      return { ...defaultEmailSettings, ...(JSON.parse(raw) as Partial<EmailSmtpSettings>) };
    } catch {
      return defaultEmailSettings;
    }
  });
  const [showPreferencesPanel, setShowPreferencesPanel] = useState(false);
  const [emailTestStatus, setEmailTestStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle');
  const [emailTestMessage, setEmailTestMessage] = useState('');
  const [newThresholdInput, setNewThresholdInput] = useState('');
  const [signedLicense, setSignedLicense] = useState<SignedLicenseFile | null>(null);
  const [signedLicenseStatus, setSignedLicenseStatus] = useState('Nenhuma licenca local importada.');
  const refreshAbortRef = useRef<AbortController | null>(null);
  const licenseFileInputRef = useRef<HTMLInputElement | null>(null);
  const activeTokenRef = useRef<string | null>(session?.token ?? null);
  const isLoggingOutRef = useRef(false);

  useEffect(() => {
    const desktopBridge = window.contractFlowDesktop;
    if (!desktopBridge) {
      setMachineId('dev-machine');
      return;
    }

    try {
      const machine = desktopBridge.getMachineId();
      setMachineId(machine && machine.trim().length > 0 ? machine : 'dev-machine');
    } catch {
      setMachineId('dev-machine');
    }

    void desktopBridge.getVersion().then(setAppVersion).catch(() => {
      setAppVersion('1.0.0');
    });
  }, []);

  useEffect(() => {
    if (!machineId) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const cachedSignedLicense = await decryptSignedLicense(machineId);
      if (!cancelled && cachedSignedLicense) {
        setSignedLicense(cachedSignedLicense);
        setSignedLicenseStatus(getLicenseStatusLabel(cachedSignedLicense, machineId));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [machineId]);

  useEffect(() => {
    localStorage.setItem(apiStorageKey, apiUrl);
  }, [apiUrl]);

  useEffect(() => {
    activeTokenRef.current = session?.token ?? null;
  }, [session]);

  const filteredContracts = useMemo(() => {
    const search = contractSearch.trim().toLowerCase();
    return contracts.filter((contract) => {
      const matchesStatus = contractStatusFilter === 'all' || contract.status === contractStatusFilter;
      const matchesSearch =
        search.length === 0 ||
        contract.title.toLowerCase().includes(search) ||
        contract.customerName.toLowerCase().includes(search) ||
        contract.notes.toLowerCase().includes(search);
      return matchesStatus && matchesSearch;
    });
  }, [contracts, contractSearch, contractStatusFilter]);

  const contractFilterLabel = useMemo(() => {
    const statusLabel =
      contractStatusFilter === 'all'
        ? 'Todos'
        : contractStatusFilter === 'active'
          ? 'Ativo'
          : contractStatusFilter === 'renewing'
            ? 'Renovando'
            : 'Expirado';
    const searchLabel = contractSearch.trim().length > 0 ? `Busca: "${contractSearch.trim()}"` : 'Sem busca textual';
    return `${statusLabel} • ${searchLabel}`;
  }, [contractSearch, contractStatusFilter]);

  const filteredRecurringRevenueCents = useMemo(
    () => Math.round(filteredContracts.reduce((total, contract) => total + getMonthlyEquivalentCents(contract), 0)),
    [filteredContracts]
  );

  const contractsTrends = useMemo(() => buildContractsTrends(contracts, 6), [contracts]);
  const currentTrend = contractsTrends.at(-1);
  const previousTrend = contractsTrends.length > 1 ? contractsTrends[contractsTrends.length - 2] : null;
  const mrrVariation = getMonthOverMonthVariation(currentTrend?.mrrCents ?? 0, previousTrend?.mrrCents ?? 0);
  const churnVariation = getMonthOverMonthVariation(currentTrend?.churnRate ?? 0, previousTrend?.churnRate ?? 0);

  useEffect(() => {
    localStorage.setItem(renewalSeenStorageKey, JSON.stringify(seenRenewalMap));
  }, [seenRenewalMap]);

  useEffect(() => {
    localStorage.setItem(renewalSnoozeStorageKey, JSON.stringify(snoozedRenewalMap));
  }, [snoozedRenewalMap]);

  useEffect(() => {
    localStorage.setItem(renewalIntervalStorageKey, String(notificationIntervalMinutes));
  }, [notificationIntervalMinutes]);

  useEffect(() => {
    localStorage.setItem(renewalThresholdsStorageKey, JSON.stringify(renewalThresholds));
  }, [renewalThresholds]);

  useEffect(() => {
    localStorage.setItem(emailSettingsStorageKey, JSON.stringify(emailSettings));
  }, [emailSettings]);

  function refreshAlerts(activeSession: UserSession) {
    const now = new Date();
    const nextAlerts: string[] = [];
    const licenseDays = daysBetween(activeSession.license.expiresAt, now);

    if (licenseDays <= renewalNotifyDays && licenseDays >= 0) {
      nextAlerts.push(`Sua licenca vence em ${licenseDays} dia(s).`);
    }

    if (licenseDays < 0) {
      const expiredDays = Math.abs(licenseDays);
      nextAlerts.push(`Licenca expirada ha ${expiredDays} dia(s).`);
    }

    setAlerts(nextAlerts);
  }

  // Detecta contratos nos marcos de renovacao (configuráveis) e abre toasts locais + notificacao nativa do SO + e-mail.
  function scanRenewalNotifications() {
    if (!session || contracts.length === 0) {
      return;
    }

    const now = new Date();
    const desktopBridge = window.contractFlowDesktop;
    const dueToShow: RenewalToast[] = [];

    const cleanedSnoozed = Object.entries(snoozedRenewalMap).reduce<Record<string, string>>((accumulator, [key, snoozedUntil]) => {
      if (new Date(snoozedUntil).getTime() > now.getTime()) {
        accumulator[key] = snoozedUntil;
      }
      return accumulator;
    }, {});

    if (Object.keys(cleanedSnoozed).length !== Object.keys(snoozedRenewalMap).length) {
      setSnoozedRenewalMap(cleanedSnoozed);
    }

    for (const contract of contracts) {
      if (contract.status === 'expired') {
        continue;
      }

      const dueInDays = getDaysUntilDate(contract.renewalDate, now);
      if (!renewalThresholds.includes(dueInDays)) {
        continue;
      }

      const reminderId = `${contract.id}:${dueInDays}:${toDateInput(contract.renewalDate)}`;
      if (seenRenewalMap[reminderId]) {
        continue;
      }

      const snoozedUntil = cleanedSnoozed[reminderId];
      if (snoozedUntil && new Date(snoozedUntil).getTime() > now.getTime()) {
        continue;
      }

      dueToShow.push({
        id: reminderId,
        contractId: contract.id,
        contractTitle: contract.title,
        customerName: contract.customerName,
        renewalDate: contract.renewalDate,
        dueInDays
      });
    }

    if (dueToShow.length === 0) {
      return;
    }

    setRenewalToasts((current) => {
      const knownIds = new Set(current.map((item) => item.id));
      const append = dueToShow.filter((item) => !knownIds.has(item.id));
      return [...append, ...current].slice(0, 8);
    });

    if (desktopBridge?.notify) {
      for (const notification of dueToShow) {
        void desktopBridge.notify({
          title: 'Renovacao de contrato',
          body: `${notification.contractTitle} vence em ${notification.dueInDays} dia(s).`
        });
      }
    }

    // Envia e-mail SMTP para cada alerta novo, se o envio estiver habilitado.
    if (emailSettings.enabled && desktopBridge?.sendEmailBatch && dueToShow.length > 0) {
      void desktopBridge.sendEmailBatch(
        {
          host: emailSettings.host,
          port: emailSettings.port,
          secure: emailSettings.secure,
          user: emailSettings.user,
          password: emailSettings.password
        },
        dueToShow.map((toast) => ({
          to: emailSettings.recipient,
          subject: `[ContractFlow] Renovacao iminente: ${toast.contractTitle} (${toast.dueInDays}d)`,
          html: buildRenewalEmailHtml(toast.contractTitle, toast.customerName, toast.renewalDate, toast.dueInDays)
        }))
      );
    }
  }

  function markRenewalAsSeen(reminderId: string) {
    setSeenRenewalMap((current) => ({
      ...current,
      [reminderId]: new Date().toISOString()
    }));
    setRenewalToasts((current) => current.filter((item) => item.id !== reminderId));
  }

  function snoozeRenewal(reminderId: string) {
    const nextSnoozeUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    setSnoozedRenewalMap((current) => ({
      ...current,
      [reminderId]: nextSnoozeUntil
    }));
    setRenewalToasts((current) => current.filter((item) => item.id !== reminderId));
  }

  /** Adiciona um marco de alerta em dias, se ainda não existir e for válido (1-365). */
  function addRenewalThreshold(days: number) {
    setRenewalThresholds((current) => {
      if (current.includes(days) || days <= 0 || days > 365) {
        return current;
      }
      return [...current, days].sort((a, b) => b - a);
    });
  }

  /** Remove um marco de alerta. */
  function removeRenewalThreshold(days: number) {
    setRenewalThresholds((current) => current.filter((d) => d !== days));
  }

  /** Envia um e-mail de teste para validar as configuracoes SMTP. */
  async function handleTestEmail() {
    const bridge = window.contractFlowDesktop;
    if (!bridge?.sendEmailBatch) {
      setEmailTestStatus('error');
      setEmailTestMessage('Disponivel apenas no app Electron. No navegador use modo headless.');
      return;
    }

    if (!emailSettings.host.trim() || !emailSettings.user.trim() || !emailSettings.recipient.trim()) {
      setEmailTestStatus('error');
      setEmailTestMessage('Preencha servidor, usuario e destinatario antes de testar.');
      return;
    }

    setEmailTestStatus('sending');
    setEmailTestMessage('');

    try {
      const result = await bridge.sendEmailBatch(
        {
          host: emailSettings.host,
          port: emailSettings.port,
          secure: emailSettings.secure,
          user: emailSettings.user,
          password: emailSettings.password
        },
        [
          {
            to: emailSettings.recipient,
            subject: '[ContractFlow] Teste de configuracao SMTP',
            html: '<p style="font-family:sans-serif">Configuracao de e-mail funcionando corretamente no <strong>ContractFlow Suite</strong>.</p>'
          }
        ]
      );

      if (result.ok && result.results?.[0]?.ok) {
        setEmailTestStatus('ok');
        setEmailTestMessage('E-mail de teste enviado com sucesso.');
      } else {
        setEmailTestStatus('error');
        setEmailTestMessage(result.results?.[0]?.error ?? result.error ?? 'Falha ao enviar.');
      }
    } catch (error) {
      setEmailTestStatus('error');
      setEmailTestMessage(error instanceof Error ? error.message : 'Falha ao conectar ao servidor SMTP.');
    }
  }

  function handleExportContractsPdf(source: 'dashboard' | 'contracts') {
    const targetContracts = source === 'dashboard' ? filteredContracts : filteredContracts;
    if (targetContracts.length === 0) {
      setMessage({ kind: 'error', text: 'Nao ha contratos para exportar no filtro atual.' });
      return;
    }

    exportContractsPdf({
      appVersion,
      contracts: targetContracts,
      filterLabel: contractFilterLabel,
      generatedAt: new Date(),
      contractsAtRisk: getContractsAtRiskCount(targetContracts),
      recurringRevenueCents: filteredRecurringRevenueCents
    });
    setMessage({ kind: 'success', text: 'Relatorio PDF exportado com sucesso.' });
  }

  async function renewSessionFromRefresh(currentSession: UserSession) {
    if (!machineId) {
      return null;
    }

    try {
      const refreshed = await api.refreshSession(apiUrl, currentSession.refreshToken, machineId);
      activeTokenRef.current = refreshed.token;
      setSession(refreshed);
      refreshAlerts(refreshed);
      isLoggingOutRef.current = false;
      return refreshed;
    } catch {
      handleLogout();
      return null;
    }
  }

  async function executeWithSessionRetry<T>(
    operation: (activeSession: UserSession) => Promise<T>,
    baseSession: UserSession
  ) {
    try {
      return await operation(baseSession);
    } catch (error) {
      if (!isAuthError(error)) {
        throw error;
      }

      const refreshedSession = await renewSessionFromRefresh(baseSession);
      if (!refreshedSession) {
        throw error;
      }

      return operation(refreshedSession);
    }
  }

  useEffect(() => {
    if (!session) {
      setDashboard(null);
      setCustomers([]);
      setContracts([]);
      setLicenses([]);
      return;
    }

    void refreshWorkspace(session);
  }, [session?.token]);

  useEffect(() => {
    if (!session) {
      return;
    }

    scanRenewalNotifications();
  }, [session?.token, contracts, seenRenewalMap, snoozedRenewalMap, renewalThresholds, emailSettings]);

  useEffect(() => {
    if (!session) {
      return;
    }

    const intervalId = window.setInterval(() => {
      scanRenewalNotifications();
    }, notificationIntervalMinutes * 60 * 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [session?.token, contracts, notificationIntervalMinutes, seenRenewalMap, snoozedRenewalMap, renewalThresholds, emailSettings]);

  async function refreshWorkspace(activeSession = session) {
    if (!activeSession) {
      return;
    }

    const requestToken = activeSession.token;
    refreshAbortRef.current?.abort();
    const controller = new AbortController();
    refreshAbortRef.current = controller;

    try {
      const [me, dashboardData, customersData, contractsData, licensesData] = await executeWithSessionRetry(
        async (currentSession) =>
          Promise.all([
            api.getMe(apiUrl, currentSession.token, controller.signal),
            api.getDashboard(apiUrl, currentSession.token, controller.signal),
            api.getCustomers(apiUrl, currentSession.token, controller.signal),
            api.getContracts(apiUrl, currentSession.token, controller.signal),
            currentSession.user.role === 'owner' ? api.getLicenses(apiUrl, currentSession.token, controller.signal) : Promise.resolve([])
          ]),
        activeSession
      );

      if (controller.signal.aborted || isLoggingOutRef.current || activeTokenRef.current !== requestToken) {
        return;
      }

      const nextSession = {
        ...activeSession,
        user: me.user,
        license: me.license
      } satisfies UserSession;

      setSession(nextSession);
      setDashboard(dashboardData);
      setCustomers(customersData);
      setContracts(contractsData);
      setLicenses(licensesData);
      if (signedLicense) {
        setSignedLicenseStatus(getLicenseStatusLabel(signedLicense, machineId));
      }
      refreshAlerts(nextSession);

      if (!contractForm.customerId && customersData[0]) {
        setContractForm((current) => ({ ...current, customerId: customersData[0].id }));
      }
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }

      const text = error instanceof Error ? error.message : 'Falha ao carregar dados.';
      setMessage({ kind: 'error', text });
      if (text.toLowerCase().includes('token') || text.toLowerCase().includes('sessao')) {
        handleLogout();
      }
    } finally {
      if (refreshAbortRef.current === controller) {
        refreshAbortRef.current = null;
      }
    }
  }

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    isLoggingOutRef.current = false;

    try {
      const nextSession = await api.login(apiUrl, {
        email: loginEmail,
        password: loginPassword,
        licenseKey,
        machineId
      });
      activeTokenRef.current = nextSession.token;
      setSession(nextSession);
      refreshAlerts(nextSession);
      if (signedLicense) {
        setSignedLicenseStatus(getLicenseStatusLabel(signedLicense, machineId));
      }
      setMessage({ kind: 'success', text: 'Licenca validada e sessao iniciada.' });
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Falha no login.' });
    } finally {
      setBusy(false);
    }
  }

  function handleLogout() {
    isLoggingOutRef.current = true;
    refreshAbortRef.current?.abort();
    activeTokenRef.current = null;
    setAlerts([]);
    setSession(null);
    setMessage({ kind: 'success', text: 'Sessao encerrada.' });
  }

  async function importSignedLicenseFromContent(content: string) {
    if (!machineId) {
      setMessage({ kind: 'error', text: 'Nao foi possivel identificar a maquina para validar a licenca.' });
      return;
    }

    try {
      const parsed = JSON.parse(content) as SignedLicenseFile;
      await verifySignedLicense(parsed);
      if (parsed.payload.machineId && parsed.payload.machineId !== machineId) {
        setMessage({ kind: 'error', text: 'Licenca importada pertence a outra maquina.' });
        return;
      }

      const label = getLicenseStatusLabel(parsed, machineId);
      setSignedLicense(parsed);
      setSignedLicenseStatus(label);
      setMessage({ kind: 'success', text: `Licenca assinada importada com sucesso. ${label}` });
      await encryptSignedLicense(machineId, parsed);
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Falha ao importar licenca assinada.' });
    }
  }

  async function handleImportSignedLicense() {
    if (!machineId) {
      setMessage({ kind: 'error', text: 'Nao foi possivel identificar a maquina para validar a licenca.' });
      return;
    }

    const bridge = window.contractFlowDesktop;
    if (bridge?.importLicenseFile) {
      try {
        const selected = await bridge.importLicenseFile();
        if (!selected) {
          return;
        }

        await importSignedLicenseFromContent(selected.content);
        return;
      } catch (error) {
        setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Falha ao abrir seletor de licenca.' });
      }
    }

    licenseFileInputRef.current?.click();
  }

  async function handleImportLicenseFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.currentTarget.value = '';

    if (!file) {
      return;
    }

    try {
      const content = await file.text();
      await importSignedLicenseFromContent(content);
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Falha ao ler arquivo de licenca.' });
    }
  }

  async function submitCustomer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) {
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const activeSession = await executeWithSessionRetry(async (currentSession) => {
        if (editingCustomerId) {
          await api.updateCustomer(apiUrl, currentSession.token, editingCustomerId, customerForm);
        } else {
          await api.createCustomer(apiUrl, currentSession.token, customerForm);
        }

        return currentSession;
      }, session);

      if (editingCustomerId) {
        setMessage({ kind: 'success', text: 'Cliente atualizado.' });
      } else {
        setMessage({ kind: 'success', text: 'Cliente criado.' });
      }
      setCustomerForm(emptyCustomerForm);
      setEditingCustomerId(null);
      await refreshWorkspace(activeSession);
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Falha ao salvar cliente.' });
    } finally {
      setBusy(false);
    }
  }

  async function submitContract(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) {
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const payload = { ...contractForm, valueCents: Number(contractForm.valueCents) };
      const activeSession = await executeWithSessionRetry(async (currentSession) => {
        if (editingContractId) {
          await api.updateContract(apiUrl, currentSession.token, editingContractId, payload);
        } else {
          await api.createContract(apiUrl, currentSession.token, payload);
        }

        return currentSession;
      }, session);

      if (editingContractId) {
        setMessage({ kind: 'success', text: 'Contrato atualizado.' });
      } else {
        setMessage({ kind: 'success', text: 'Contrato criado.' });
      }
      setContractForm({ ...emptyContractForm, customerId: customers[0]?.id ?? '' });
      setEditingContractId(null);
      await refreshWorkspace(activeSession);
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Falha ao salvar contrato.' });
    } finally {
      setBusy(false);
    }
  }

  async function removeCustomer(id: string) {
    if (!session) {
      return;
    }

    setBusy(true);
    try {
      const activeSession = await executeWithSessionRetry((currentSession) => api.deleteCustomer(apiUrl, currentSession.token, id).then(() => currentSession), session);
      await refreshWorkspace(activeSession);
      setMessage({ kind: 'success', text: 'Cliente removido.' });
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Falha ao remover cliente.' });
    } finally {
      setBusy(false);
    }
  }

  async function removeContract(id: string) {
    if (!session) {
      return;
    }

    setBusy(true);
    try {
      const activeSession = await executeWithSessionRetry((currentSession) => api.deleteContract(apiUrl, currentSession.token, id).then(() => currentSession), session);
      await refreshWorkspace(activeSession);
      setMessage({ kind: 'success', text: 'Contrato removido.' });
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Falha ao remover contrato.' });

      async function handleClmTransition(contractId: string, targetStatus: import('@contractflow/shared').ContractClmStatus) {
        if (!session) return;
        setBusy(true);
        try {
          const activeSession = await executeWithSessionRetry(
            async (currentSession) => {
              await api.transitionClmStatus(apiUrl, currentSession.token, contractId, targetStatus);
              return currentSession;
            },
            session
          );
          await refreshWorkspace(activeSession);
          setMessage({ kind: 'success', text: `Status CLM atualizado para "${targetStatus}".` });
        } catch (error) {
          setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Falha ao atualizar status CLM.' });
        } finally {
          setBusy(false);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  function startCustomerEdit(customer: Customer) {
    setCustomerForm({
      name: customer.name,
      email: customer.email,
      company: customer.company,
      phone: customer.phone,
      notes: customer.notes
    });
    setEditingCustomerId(customer.id);
  }

  function startContractEdit(contract: Contract) {
    setContractForm({
      customerId: contract.customerId,
      title: contract.title,
      description: contract.description,
      valueCents: contract.valueCents,
      startDate: contract.startDate,
      endDate: contract.endDate,
      renewalDate: contract.renewalDate,
      status: contract.status,
      autoRenew: contract.autoRenew,
      paymentCycle: contract.paymentCycle,
      notes: contract.notes
    });
    setEditingContractId(contract.id);
  }

  function startLicenseEdit(license: ManagedLicense) {
    setLicenseForm({
      planName: license.planName,
      status: license.status,
      expiresAt: license.expiresAt
    });
    setEditingLicenseId(license.id);
  }

  async function submitLicense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) {
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const payload: ManagedLicensePayload = {
        ...licenseForm,
        expiresAt: new Date(`${toDateInput(licenseForm.expiresAt)}T23:59:59.000Z`).toISOString()
      };

      const activeSession = await executeWithSessionRetry(async (currentSession) => {
        if (editingLicenseId) {
          await api.updateLicense(apiUrl, currentSession.token, editingLicenseId, payload);
        } else {
          await api.createLicense(apiUrl, currentSession.token, payload);
        }

        return currentSession;
      }, session);

      if (editingLicenseId) {
        setMessage({ kind: 'success', text: 'Licenca atualizada.' });
      } else {
        setMessage({ kind: 'success', text: 'Licenca criada com sucesso.' });
      }

      setLicenseForm(emptyLicenseForm);
      setEditingLicenseId(null);
      await refreshWorkspace(activeSession);
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Falha ao salvar licenca.' });
    } finally {
      setBusy(false);
    }
  }

  async function resetLicenseMachine(id: string) {
    if (!session) {
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const activeSession = await executeWithSessionRetry((currentSession) =>
        api.resetLicenseMachine(apiUrl, currentSession.token, id).then(() => currentSession), session
      );
      setMessage({ kind: 'success', text: 'Vinculo de maquina removido da licenca.' });
      await refreshWorkspace(activeSession);
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Falha ao resetar maquina da licenca.' });
    } finally {
      setBusy(false);
    }
  }

  const trendChartData = useMemo(
    () => ({
      labels: contractsTrends.map((point) => point.monthLabel),
      datasets: [
        {
          label: 'MRR (R$)',
          data: contractsTrends.map((point) => Number((point.mrrCents / 100).toFixed(2))),
          yAxisID: 'yMrr',
          borderColor: '#1d533a',
          backgroundColor: 'rgba(29, 83, 58, 0.24)',
          tension: 0.3,
          fill: true
        },
        {
          label: 'Churn (%)',
          data: contractsTrends.map((point) => Number(point.churnRate.toFixed(2))),
          yAxisID: 'yChurn',
          borderColor: '#8b5a17',
          backgroundColor: 'rgba(139, 90, 23, 0.24)',
          tension: 0.25,
          fill: false
        }
      ]
    }),
    [contractsTrends]
  );

  const trendChartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index' as const,
        intersect: false
      },
      plugins: {
        legend: {
          position: 'bottom' as const
        }
      },
      scales: {
        yMrr: {
          type: 'linear' as const,
          position: 'left' as const,
          ticks: {
            callback: (value: string | number) => `R$ ${value}`
          }
        },
        yChurn: {
          type: 'linear' as const,
          position: 'right' as const,
          min: 0,
          ticks: {
            callback: (value: string | number) => `${value}%`
          },
          grid: {
            drawOnChartArea: false
          }
        }
      }
    }),
    []
  );

  if (!session) {
    return (
      <main className="shell auth-shell">
        <section className="hero-panel">
          <p className="eyebrow">Desktop SaaS com licenca comercial</p>
          <h1>ContractFlow Suite</h1>
          <p className="hero-copy">
            Produto desktop para gestao de renovacoes, contratos recorrentes e vencimentos com licenca vinculada a maquina.
          </p>
          <div className="feature-grid">
            <article>
              <strong>Licenciamento</strong>
              <span>Valida chave e bloqueia uso fora da maquina autorizada.</span>
            </article>
            <article>
              <strong>Operacao</strong>
              <span>Clientes, contratos, receitas e renovacoes no mesmo lugar.</span>
            </article>
            <article>
              <strong>Distribuicao</strong>
              <span>Empacotamento para Windows com instalador `.exe`.</span>
            </article>
          </div>
        </section>

        <section className="card login-card">
          <div className="card-header">
            <div>
              <p className="eyebrow">Acesso inicial</p>
              <h2>Entrar e ativar licenca</h2>
            </div>
            <span className="badge">v{appVersion}</span>
          </div>

          <form className="form-grid" onSubmit={handleLogin}>
            <label>
              API URL
              <input value={apiUrl} onChange={(event) => setApiUrl(event.target.value)} placeholder="http://localhost:4000" />
            </label>
            <label>
              Email
              <input value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} />
            </label>
            <label>
              Senha
              <input type="password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} />
            </label>
            <label>
              Chave da licenca
              <input value={licenseKey} onChange={(event) => setLicenseKey(event.target.value)} />
            </label>
            <label>
              Maquina
              <input value={machineId} readOnly />
            </label>
            <button className="primary-button" disabled={busy || !machineId} type="submit">
              {busy ? 'Validando...' : 'Entrar'}
            </button>
          </form>

          <div className="hint-box">
            <strong>Credenciais seed</strong>
            <span>owner@contractflow.local / admin123</span>
            <span>Licenca: CFLOW-DEMO-2026</span>
            <span>{signedLicenseStatus}</span>
          </div>

          <button className="ghost-button" onClick={() => void handleImportSignedLicense()} type="button">
            Importar licenca assinada (.lic)
          </button>

          <input
            accept=".lic,.json,application/json"
            onChange={(event) => void handleImportLicenseFileChange(event)}
            ref={licenseFileInputRef}
            style={{ display: 'none' }}
            type="file"
          />

          {message && <p className={`message ${message.kind}`}>{message.text}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="shell dashboard-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Painel comercial</p>
          <h1>ContractFlow Suite</h1>
          <p className="subtle">
            {session.user.displayName} • Perfil {session.user.role} • {session.license.planName} • Licenca {session.license.status}
          </p>
        </div>
        <div className="topbar-actions">
          <span className="badge">Expira em {formatDate(session.license.expiresAt)}</span>
          <label className="inline-setting" htmlFor="renewal-interval-select">
            Intervalo de alerta
            <select
              id="renewal-interval-select"
              value={notificationIntervalMinutes}
              onChange={(event) => setNotificationIntervalMinutes(Number(event.target.value))}
            >
              <option value={5}>A cada 5 min</option>
              <option value={15}>A cada 15 min</option>
              <option value={60}>A cada 1 hora</option>
              <option value={180}>A cada 3 horas</option>
            </select>
          </label>
          <button className="ghost-button" onClick={() => handleExportContractsPdf('dashboard')} type="button">
            Exportar PDF
          </button>
          <button
            className={showPreferencesPanel ? 'primary-button' : 'ghost-button'}
            onClick={() => setShowPreferencesPanel((v) => !v)}
            type="button"
          >
            Preferencias
          </button>
          <button className="ghost-button" onClick={() => void refreshWorkspace()} type="button">
            Atualizar
          </button>
          <button className="ghost-button" onClick={handleLogout} type="button">
            Sair
          </button>
        </div>
      </header>

      {message && <p className={`message ${message.kind}`}>{message.text}</p>}

      {showPreferencesPanel && (
        <section className="card pref-card">
          <div className="card-header">
            <div>
              <p className="eyebrow">Configuracoes locais</p>
              <h2>Preferencias de notificacao</h2>
            </div>
            <button className="ghost-button" onClick={() => setShowPreferencesPanel(false)} type="button">
              Fechar
            </button>
          </div>

          <div className="pref-grid">
            {/* Marcos de alerta configuráveis */}
            <div className="pref-section">
              <p className="eyebrow" style={{ margin: '4px 0 0' }}>Marcos de alerta (dias antes do vencimento)</p>
              <div className="threshold-list">
                {renewalThresholds.map((days) => (
                  <span className="threshold-tag" key={days}>
                    {days}d
                    <button
                      className="tag-remove"
                      onClick={() => removeRenewalThreshold(days)}
                      title={`Remover marco de ${days} dias`}
                      type="button"
                    >
                      ×
                    </button>
                  </span>
                ))}
                {renewalThresholds.length === 0 && (
                  <span className="subtle">Nenhum marco definido. Adicione pelo menos um abaixo.</span>
                )}
              </div>
              <div className="threshold-add">
                <input
                  max={365}
                  min={1}
                  placeholder="Ex: 60"
                  type="number"
                  value={newThresholdInput}
                  onChange={(event) => setNewThresholdInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      const days = Number(newThresholdInput);
                      if (days > 0) {
                        addRenewalThreshold(days);
                        setNewThresholdInput('');
                      }
                    }
                  }}
                />
                <button
                  className="ghost-button"
                  disabled={Number(newThresholdInput) <= 0}
                  onClick={() => {
                    const days = Number(newThresholdInput);
                    if (days > 0) {
                      addRenewalThreshold(days);
                      setNewThresholdInput('');
                    }
                  }}
                  type="button"
                >
                  Adicionar
                </button>
              </div>
              <p className="subtle">
                Os alertas disparam exatamente quando o contrato estiver a esse numero de dias do vencimento.
                Pressione Enter ou clique em Adicionar.
              </p>
            </div>

            {/* Configuração de e-mail SMTP */}
            <div className="pref-section">
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <p className="eyebrow" style={{ margin: '4px 0 0' }}>Notificacoes por e-mail (SMTP)</p>
                <label className="checkbox-row" style={{ margin: 0, gap: 8 }}>
                  <input
                    checked={emailSettings.enabled}
                    type="checkbox"
                    onChange={(event) => setEmailSettings((current) => ({ ...current, enabled: event.target.checked }))}
                  />
                  Ativo
                </label>
              </div>
              <div className="form-grid">
                <label>
                  Servidor SMTP
                  <input
                    placeholder="smtp.gmail.com"
                    value={emailSettings.host}
                    onChange={(event) => setEmailSettings((current) => ({ ...current, host: event.target.value }))}
                  />
                </label>
                <label>
                  Porta
                  <input
                    max={65535}
                    min={1}
                    type="number"
                    value={emailSettings.port}
                    onChange={(event) => setEmailSettings((current) => ({ ...current, port: Number(event.target.value) }))}
                  />
                </label>
                <label>
                  Usuario (remetente)
                  <input
                    placeholder="seu@email.com"
                    type="email"
                    value={emailSettings.user}
                    onChange={(event) => setEmailSettings((current) => ({ ...current, user: event.target.value }))}
                  />
                </label>
                <label>
                  Senha / App Token
                  <input
                    type="password"
                    value={emailSettings.password}
                    onChange={(event) => setEmailSettings((current) => ({ ...current, password: event.target.value }))}
                  />
                </label>
                <label className="full-width">
                  Destinatario dos alertas
                  <input
                    placeholder="gestor@empresa.com"
                    type="email"
                    value={emailSettings.recipient}
                    onChange={(event) => setEmailSettings((current) => ({ ...current, recipient: event.target.value }))}
                  />
                </label>
                <label className="checkbox-row full-width">
                  <input
                    checked={emailSettings.secure}
                    type="checkbox"
                    onChange={(event) => setEmailSettings((current) => ({ ...current, secure: event.target.checked }))}
                  />
                  Conexao segura TLS/SSL (porta 465)
                </label>
                <div className="full-width" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    className="ghost-button"
                    disabled={emailTestStatus === 'sending'}
                    type="button"
                    onClick={() => void handleTestEmail()}
                  >
                    {emailTestStatus === 'sending' ? 'Enviando...' : 'Testar conexao SMTP'}
                  </button>
                  {emailTestMessage && (
                    <span className={emailTestStatus === 'ok' ? 'hint-ok' : 'hint-error'}>
                      {emailTestMessage}
                    </span>
                  )}
                </div>
              </div>
              <p className="subtle">
                Configuracoes armazenadas apenas neste dispositivo.
                Para Gmail, gere um App Password nas configuracoes de conta Google.
              </p>
            </div>
          </div>
        </section>
      )}

      <section className="card">
        <div className="card-header">
          <div>
            <p className="eyebrow">Licenca local assinada</p>
            <h2>Validacao local assinada</h2>
          </div>
          <button className="ghost-button" onClick={() => void handleImportSignedLicense()} type="button">
            Importar .lic
          </button>
        </div>
        <p className="subtle">{signedLicenseStatus}</p>
        <input
          accept=".lic,.json,application/json"
          onChange={(event) => void handleImportLicenseFileChange(event)}
          ref={licenseFileInputRef}
          style={{ display: 'none' }}
          type="file"
        />
      </section>

      {alerts.length > 0 && (
        <section className="card">
          <div className="card-header">
            <div>
              <p className="eyebrow">Notificacoes</p>
              <h2>Renovacao e periodo de graca</h2>
            </div>
            <span className="badge">{alerts.length}</span>
          </div>
          <div className="renewal-list">
            {alerts.map((alert) => (
              <article className="renewal-item" key={alert}>
                <div>
                  <strong>{alert}</strong>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {renewalToasts.length > 0 && (
        <section className="card">
          <div className="card-header">
            <div>
              <p className="eyebrow">Notificacoes de vencimento</p>
              <h2>Contratos que exigem acao</h2>
            </div>
            <span className="badge">{renewalToasts.length}</span>
          </div>
          <div className="renewal-list">
            {renewalToasts.map((toast) => (
              <article className="renewal-item renewal-toast" key={toast.id}>
                <div>
                  <strong>{toast.contractTitle}</strong>
                  <span>{toast.customerName}</span>
                  <span>
                    Renovacao em {toast.dueInDays} dia(s) • {formatDate(toast.renewalDate)}
                  </span>
                </div>
                <div className="toast-actions">
                  <button className="table-button" onClick={() => markRenewalAsSeen(toast.id)} type="button">
                    Marcar como visto
                  </button>
                  <button className="table-button" onClick={() => snoozeRenewal(toast.id)} type="button">
                    Adiar 24h
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="stats-grid">
        <article className="card stat-card">
          <span>MRR estimado</span>
          <strong>{formatCurrency(dashboard?.metrics.monthlyRecurringRevenueCents ?? 0)}</strong>
        </article>
        <article className="card stat-card">
          <span>Renovacoes em 30 dias</span>
          <strong>{dashboard?.metrics.expiringSoon ?? 0}</strong>
        </article>
        <article className="card stat-card">
          <span>Valor projetado</span>
          <strong>{formatCurrency(dashboard?.metrics.projectedRenewalValueCents ?? 0)}</strong>
        </article>
        <article className="card stat-card">
          <span>Contratos expirados</span>
          <strong>{dashboard?.metrics.expiredContracts ?? 0}</strong>
        </article>
        <article className="card stat-card">
          <span>Em rascunho (CLM)</span>
          <strong>{dashboard?.metrics.draftContracts ?? 0}</strong>
        </article>
        <article className="card stat-card">
          <span>Em revisao (CLM)</span>
          <strong>{dashboard?.metrics.pendingReviewContracts ?? 0}</strong>
        </article>
      </section>

      <section className="card chart-card">
        <div className="card-header">
          <div>
            <p className="eyebrow">Retencao e receita</p>
            <h2>Churn e MRR dos ultimos 6 meses</h2>
          </div>
        </div>

        <div className="trend-grid">
          <article className="stat-card">
            <span>MRR atual</span>
            <strong>{formatCurrency(currentTrend?.mrrCents ?? 0)}</strong>
            <span>Variacao mensal: {formatVariation(mrrVariation)}</span>
          </article>
          <article className="stat-card">
            <span>Churn atual</span>
            <strong>{(currentTrend?.churnRate ?? 0).toFixed(2)}%</strong>
            <span>Variacao mensal: {formatVariation(churnVariation)}</span>
          </article>
          <article className="stat-card">
            <span>Contratos em risco (30d)</span>
            <strong>{getContractsAtRiskCount(contracts, 30)}</strong>
            <span>Contratos com vencimento proximo ou expirados</span>
          </article>
        </div>

        <div className="chart-wrap">
          <Line data={trendChartData} options={trendChartOptions} />
        </div>
      </section>

      <section className="main-grid">
        <div className="column">
          <section className="card">
            <div className="card-header">
              <div>
                <p className="eyebrow">CRM de contratos</p>
                <h2>{editingCustomerId ? 'Editar cliente' : 'Novo cliente'}</h2>
              </div>
              {editingCustomerId && (
                <button
                  className="ghost-button"
                  onClick={() => {
                    setEditingCustomerId(null);
                    setCustomerForm(emptyCustomerForm);
                  }}
                  type="button"
                >
                  Cancelar
                </button>
              )}
            </div>

            <form className="form-grid" onSubmit={submitCustomer}>
              <label>
                Nome
                <input value={customerForm.name} onChange={(event) => setCustomerForm({ ...customerForm, name: event.target.value })} />
              </label>
              <label>
                Email
                <input value={customerForm.email} onChange={(event) => setCustomerForm({ ...customerForm, email: event.target.value })} />
              </label>
              <label>
                Empresa
                <input value={customerForm.company} onChange={(event) => setCustomerForm({ ...customerForm, company: event.target.value })} />
              </label>
              <label>
                Telefone
                <input value={customerForm.phone} onChange={(event) => setCustomerForm({ ...customerForm, phone: event.target.value })} />
              </label>
              <label className="full-width">
                Observacoes
                <textarea value={customerForm.notes} onChange={(event) => setCustomerForm({ ...customerForm, notes: event.target.value })} rows={3} />
              </label>
              <button className="primary-button" disabled={busy} type="submit">
                {editingCustomerId ? 'Salvar cliente' : 'Criar cliente'}
              </button>
            </form>
          </section>

          <section className="card table-card">
            <div className="card-header">
              <div>
                <p className="eyebrow">Base ativa</p>
                <h2>Clientes</h2>
              </div>
              <span className="badge">{customers.length}</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Empresa</th>
                    <th>Email</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => (
                    <tr key={customer.id}>
                      <td>{customer.name}</td>
                      <td>{customer.company}</td>
                      <td>{customer.email}</td>
                      <td className="row-actions">
                        <button className="table-button" onClick={() => startCustomerEdit(customer)} type="button">
                          Editar
                        </button>
                        <button className="table-button danger" onClick={() => void removeCustomer(customer.id)} type="button">
                          Excluir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="column">
          <section className="card">
            <div className="card-header">
              <div>
                <p className="eyebrow">Pipeline de renovacao</p>
                <h2>{editingContractId ? 'Editar contrato' : 'Novo contrato'}</h2>
              </div>
              {editingContractId && (
                <button
                  className="ghost-button"
                  onClick={() => {
                    setEditingContractId(null);
                    setContractForm({ ...emptyContractForm, customerId: customers[0]?.id ?? '' });
                  }}
                  type="button"
                >
                  Cancelar
                </button>
              )}
            </div>

            <form className="form-grid" onSubmit={submitContract}>
              <label>
                Cliente
                <select
                  value={contractForm.customerId}
                  onChange={(event) => setContractForm({ ...contractForm, customerId: event.target.value })}
                  disabled={customers.length === 0}
                >
                  <option value="">Selecione</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.company}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Titulo
                <input value={contractForm.title} onChange={(event) => setContractForm({ ...contractForm, title: event.target.value })} />
              </label>
              <label className="full-width">
                Descricao
                <textarea value={contractForm.description} onChange={(event) => setContractForm({ ...contractForm, description: event.target.value })} rows={2} />
              </label>
              <label>
                Valor em centavos
                <input
                  type="number"
                  min={0}
                  value={contractForm.valueCents}
                  onChange={(event) => setContractForm({ ...contractForm, valueCents: Number(event.target.value) })}
                />
              </label>
              <label>
                Ciclo
                <select
                  value={contractForm.paymentCycle}
                  onChange={(event) => setContractForm({ ...contractForm, paymentCycle: event.target.value as PaymentCycle })}
                >
                  <option value="monthly">Mensal</option>
                  <option value="quarterly">Trimestral</option>
                  <option value="yearly">Anual</option>
                  <option value="custom">Customizado</option>
                </select>
              </label>
              <label>
                Inicio
                <input type="date" value={contractForm.startDate} onChange={(event) => setContractForm({ ...contractForm, startDate: event.target.value })} />
              </label>
              <label>
                Fim
                <input type="date" value={contractForm.endDate} onChange={(event) => setContractForm({ ...contractForm, endDate: event.target.value })} />
              </label>
              <label>
                Renovacao
                <input
                  type="date"
                  value={contractForm.renewalDate}
                  onChange={(event) => setContractForm({ ...contractForm, renewalDate: event.target.value })}
                />
              </label>
              <label>
                Status
                <select value={contractForm.status} onChange={(event) => setContractForm({ ...contractForm, status: event.target.value as Contract['status'] })}>
                  <option value="active">Ativo</option>
                  <option value="renewing">Renovando</option>
                  <option value="expired">Expirado</option>
                </select>
              </label>
              <label className="checkbox-row">
                <input
                  checked={contractForm.autoRenew}
                  onChange={(event) => setContractForm({ ...contractForm, autoRenew: event.target.checked })}
                  type="checkbox"
                />
                Renovacao automatica
              </label>
              <label className="full-width">
                Observacoes
                <textarea value={contractForm.notes} onChange={(event) => setContractForm({ ...contractForm, notes: event.target.value })} rows={3} />
              </label>
              <button className="primary-button" disabled={busy || customers.length === 0} type="submit">
                {editingContractId ? 'Salvar contrato' : 'Criar contrato'}
              </button>
            </form>
          </section>

          <section className="card table-card">
            <div className="card-header">
              <div>
                <p className="eyebrow">Receita e risco</p>
                <h2>Contratos</h2>
              </div>
              <div className="topbar-actions">
                <span className="badge">{filteredContracts.length}</span>
                <button className="ghost-button" onClick={() => handleExportContractsPdf('contracts')} type="button">
                  Exportar PDF
                </button>
              </div>
            </div>
            <div className="table-tools">
              <input
                placeholder="Buscar por titulo, cliente ou observacao"
                value={contractSearch}
                onChange={(event) => setContractSearch(event.target.value)}
              />
              <select value={contractStatusFilter} onChange={(event) => setContractStatusFilter(event.target.value as ContractStatusFilter)}>
                <option value="all">Todos os status</option>
                <option value="active">Ativos</option>
                <option value="renewing">Renovando</option>
                <option value="expired">Expirados</option>
              </select>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Titulo</th>
                    <th>Cliente</th>
                    <th>Renovacao</th>
                    <th>Valor</th>
                    <th>CLM</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredContracts.map((contract) => (
                    <tr key={contract.id}>
                      <td>{contract.title}</td>
                      <td>{contract.customerName}</td>
                      <td>{formatDate(contract.renewalDate)}</td>
                      <td>{formatCurrency(contract.valueCents)}</td>
                      <td>
                        <span className={`clm-badge clm-badge--${contract.clmStatus}`}>{contract.clmStatus.replace('_', ' ')}</span>
                        {contract.clmStatus !== 'signed' && (
                          <select
                            className="clm-transition-select"
                            value=""
                            onChange={(event) => {
                              if (event.target.value) {
                                void handleClmTransition(contract.id, event.target.value as import('@contractflow/shared').ContractClmStatus);
                              }
                            }}
                            disabled={busy}
                          >
                            <option value="">Avançar...</option>
                            {({ draft: ['in_review'], in_review: ['draft', 'approved'], approved: ['signed'], signed: [] } as Record<string, string[]>)[contract.clmStatus]?.map((s) => (
                              <option key={s} value={s}>{s.replace('_', ' ')}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="row-actions">
                        <button className="table-button" onClick={() => startContractEdit(contract)} type="button">
                          Editar
                        </button>
                        <button className="table-button danger" onClick={() => void removeContract(contract.id)} type="button">
                          Excluir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <div>
            <p className="eyebrow">Proximas oportunidades</p>
            <h2>Renovacoes prioritarias</h2>
          </div>
        </div>
        <div className="renewal-list">
          {dashboard?.upcomingRenewals.map((contract) => (
            <article className="renewal-item" key={contract.id}>
              <div>
                <strong>{contract.title}</strong>
                <span>{contract.customerName}</span>
              </div>
              <div>
                <strong>{formatCurrency(contract.valueCents)}</strong>
                <span>{formatDate(contract.renewalDate)}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      {session.user.role === 'owner' && (
        <section className="main-grid">
          <div className="column">
            <section className="card">
              <div className="card-header">
                <div>
                  <p className="eyebrow">Monetizacao</p>
                  <h2>{editingLicenseId ? 'Editar licenca' : 'Emitir nova licenca'}</h2>
                </div>
                {editingLicenseId && (
                  <button
                    className="ghost-button"
                    onClick={() => {
                      setEditingLicenseId(null);
                      setLicenseForm(emptyLicenseForm);
                    }}
                    type="button"
                  >
                    Cancelar
                  </button>
                )}
              </div>

              <form className="form-grid" onSubmit={submitLicense}>
                <label>
                  Plano
                  <input value={licenseForm.planName} onChange={(event) => setLicenseForm({ ...licenseForm, planName: event.target.value })} />
                </label>
                <label>
                  Status
                  <select
                    value={licenseForm.status}
                    onChange={(event) => setLicenseForm({ ...licenseForm, status: event.target.value as LicenseStatus })}
                  >
                    <option value="active">Ativa</option>
                    <option value="suspended">Suspensa</option>
                    <option value="expired">Expirada</option>
                  </select>
                </label>
                <label>
                  Expira em
                  <input
                    type="date"
                    value={toDateInput(licenseForm.expiresAt)}
                    onChange={(event) => setLicenseForm({ ...licenseForm, expiresAt: new Date(`${event.target.value}T23:59:59.000Z`).toISOString() })}
                  />
                </label>
                <button className="primary-button" disabled={busy} type="submit">
                  {editingLicenseId ? 'Salvar licenca' : 'Criar licenca'}
                </button>
              </form>
            </section>
          </div>

          <div className="column">
            <section className="card table-card">
              <div className="card-header">
                <div>
                  <p className="eyebrow">Admin de licencas</p>
                  <h2>Licencas emitidas</h2>
                </div>
                <span className="badge">{licenses.length}</span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Chave</th>
                      <th>Plano</th>
                      <th>Status</th>
                      <th>Expira</th>
                      <th>Maquina</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {licenses.map((license) => (
                      <tr key={license.id}>
                        <td>{license.key}</td>
                        <td>{license.planName}</td>
                        <td>{license.status}</td>
                        <td>{formatDate(license.expiresAt)}</td>
                        <td>{license.activatedMachineId ?? 'Nao vinculada'}</td>
                        <td className="row-actions">
                          <button className="table-button" onClick={() => startLicenseEdit(license)} type="button">
                            Editar
                          </button>
                          <button className="table-button" onClick={() => void resetLicenseMachine(license.id)} type="button">
                            Resetar maquina
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </section>
      )}
    </main>
  );
}

export default App;
