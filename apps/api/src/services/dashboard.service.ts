import type { DashboardPayload } from '@contractflow/shared';
import { contractsRepository } from '../repositories/contracts.repository.js';

export const dashboardService = {
  getPayload(userId: string): DashboardPayload {
    const contracts = contractsRepository.findAllByUser(userId);
    const now = Date.now();
    const thirtyDays = 1000 * 60 * 60 * 24 * 30;

    const expiringSoon = contracts.filter((c) => {
      const renewal = new Date(c.renewalDate).getTime();
      return renewal >= now && renewal <= now + thirtyDays;
    });

    const activeMonthlyCents = contracts
      .filter((c) => c.status !== 'expired')
      .reduce((total, c) => {
        const monthly =
          c.paymentCycle === 'monthly'
            ? c.valueCents
            : c.paymentCycle === 'quarterly'
              ? c.valueCents / 3
              : c.valueCents / 12;
        return total + monthly;
      }, 0);

    return {
      metrics: {
        activeContracts: contracts.filter((c) => c.status === 'active').length,
        expiringSoon: expiringSoon.length,
        expiredContracts: contracts.filter((c) => new Date(c.endDate).getTime() < now || c.status === 'expired').length,
        monthlyRecurringRevenueCents: Math.round(activeMonthlyCents),
        projectedRenewalValueCents: expiringSoon.reduce((t, c) => t + c.valueCents, 0),
        draftContracts: contracts.filter((c) => c.clmStatus === 'draft').length,
        pendingReviewContracts: contracts.filter((c) => c.clmStatus === 'in_review').length
      },
      upcomingRenewals: contracts.slice(0, 5)
    };
  }
};
