import type { Contract } from '@contractflow/shared';

export type ContractsTrendPoint = {
  monthKey: string;
  monthLabel: string;
  mrrCents: number;
  churnRate: number;
  churnedContracts: number;
};

function toMonthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function startOfUtcMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
}

function endOfUtcMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

function monthlyEquivalentCents(contract: Contract) {
  if (contract.paymentCycle === 'monthly') {
    return contract.valueCents;
  }

  if (contract.paymentCycle === 'quarterly') {
    return contract.valueCents / 3;
  }

  if (contract.paymentCycle === 'yearly') {
    return contract.valueCents / 12;
  }

  // Custom cycle is treated as monthly value for a conservative projection.
  return contract.valueCents;
}

function isContractActiveInPeriod(contract: Contract, periodStart: Date, periodEnd: Date) {
  const contractStart = new Date(contract.startDate);
  const contractEnd = new Date(contract.endDate);
  return contractStart <= periodEnd && contractEnd >= periodStart;
}

function getLastMonths(count: number, fromDate = new Date()) {
  const months: Date[] = [];

  for (let offset = count - 1; offset >= 0; offset -= 1) {
    months.push(new Date(Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth() - offset, 1)));
  }

  return months;
}

export function buildContractsTrends(contracts: Contract[], monthWindow = 6): ContractsTrendPoint[] {
  const months = getLastMonths(monthWindow);

  return months.map((monthDate) => {
    const periodStart = startOfUtcMonth(monthDate);
    const periodEnd = endOfUtcMonth(monthDate);
    const monthKey = toMonthKey(monthDate);

    const activeContracts = contracts.filter((contract) => isContractActiveInPeriod(contract, periodStart, periodEnd));
    const activeBaseAtStart = contracts.filter((contract) => {
      const contractStart = new Date(contract.startDate);
      const contractEnd = new Date(contract.endDate);
      return contractStart < periodStart && contractEnd >= periodStart;
    }).length;

    const churnedContracts = contracts.filter((contract) => {
      const contractEnd = new Date(contract.endDate);
      if (contractEnd < periodStart || contractEnd > periodEnd) {
        return false;
      }

      return contract.status === 'expired' || contractEnd.getTime() <= periodEnd.getTime();
    }).length;

    const mrrCents = Math.round(activeContracts.reduce((total, contract) => total + monthlyEquivalentCents(contract), 0));
    const churnRate = activeBaseAtStart > 0 ? (churnedContracts / activeBaseAtStart) * 100 : 0;

    return {
      monthKey,
      monthLabel: new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(monthDate),
      mrrCents,
      churnRate,
      churnedContracts
    };
  });
}

export function getContractsAtRiskCount(contracts: Contract[], riskWindowDays = 30) {
  const now = new Date();
  const endWindow = new Date(now.getTime() + riskWindowDays * 24 * 60 * 60 * 1000);

  return contracts.filter((contract) => {
    const renewal = new Date(contract.renewalDate);
    return contract.status === 'expired' || (renewal >= now && renewal <= endWindow);
  }).length;
}

export function getMonthOverMonthVariation(current: number, previous: number) {
  if (previous === 0) {
    return current === 0 ? 0 : 100;
  }

  return ((current - previous) / previous) * 100;
}
