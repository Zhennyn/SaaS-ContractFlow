import { useEffect, useRef, useState } from 'react';
import type { Contract, Customer, DashboardPayload, LicenseStatus, ManagedLicense, PaymentCycle, SignedLicenseFile, UserSession } from '@contractflow/shared';
import { ApiError, api, type ContractPayload, type CustomerPayload, type ManagedLicensePayload } from './api';
import { getLicenseStatusLabel, verifySignedLicense } from './license';

type FormMessage = {
  kind: 'error' | 'success';
  text: string;
};

const apiStorageKey = 'contractflow-api-url';
const signedLicenseCacheKey = 'contractflow-signed-license';
const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();
const defaultApiUrl = configuredApiUrl && configuredApiUrl.length > 0 ? configuredApiUrl : 'http://localhost:4000';
const isDevMode = import.meta.env.DEV;
const renewalNotifyDays = 30;

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
  const [apiUrl, setApiUrl] = useState(() => (isDevMode ? localStorage.getItem(apiStorageKey) ?? defaultApiUrl : defaultApiUrl));
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
    if (isDevMode) {
      localStorage.setItem(apiStorageKey, apiUrl);
    }
  }, [apiUrl]);

  useEffect(() => {
    activeTokenRef.current = session?.token ?? null;
  }, [session]);

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
            {isDevMode && (
              <label>
                API URL
                <input value={apiUrl} onChange={(event) => setApiUrl(event.target.value)} placeholder="http://localhost:4000" />
              </label>
            )}
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
          <button className="ghost-button" onClick={() => void refreshWorkspace()} type="button">
            Atualizar
          </button>
          <button className="ghost-button" onClick={handleLogout} type="button">
            Sair
          </button>
        </div>
      </header>

      {message && <p className={`message ${message.kind}`}>{message.text}</p>}

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
              <span className="badge">{contracts.length}</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Titulo</th>
                    <th>Cliente</th>
                    <th>Renovacao</th>
                    <th>Valor</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {contracts.map((contract) => (
                    <tr key={contract.id}>
                      <td>{contract.title}</td>
                      <td>{contract.customerName}</td>
                      <td>{formatDate(contract.renewalDate)}</td>
                      <td>{formatCurrency(contract.valueCents)}</td>
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
