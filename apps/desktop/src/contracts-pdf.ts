import type { Contract } from '@contractflow/shared';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export type ExportContractsPdfOptions = {
  appVersion: string;
  contracts: Contract[];
  filterLabel: string;
  generatedAt: Date;
  contractsAtRisk: number;
  recurringRevenueCents: number;
};

function formatCurrency(valueCents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valueCents / 100);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR').format(new Date(value));
}

export function exportContractsPdf(options: ExportContractsPdfOptions) {
  const document = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const generatedAtText = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(options.generatedAt);

  document.setFillColor(29, 83, 58);
  document.rect(0, 0, document.internal.pageSize.getWidth(), 70, 'F');
  document.setTextColor(255, 255, 255);
  document.setFont('helvetica', 'bold');
  document.setFontSize(20);
  document.text('ContractFlow Suite', 40, 42);

  document.setFont('helvetica', 'normal');
  document.setFontSize(10);
  document.text(`Relatorio de contratos • Gerado em ${generatedAtText}`, 40, 60);

  document.setTextColor(20, 30, 25);
  document.setFontSize(11);
  document.text(`Filtro aplicado: ${options.filterLabel}`, 40, 92);
  document.text(`Receita recorrente mensal: ${formatCurrency(options.recurringRevenueCents)}`, 40, 110);
  document.text(`Contratos em risco: ${options.contractsAtRisk}`, 360, 110);
  document.text(`Total de contratos listados: ${options.contracts.length}`, 600, 110);

  autoTable(document, {
    startY: 128,
    theme: 'grid',
    headStyles: {
      fillColor: [29, 83, 58],
      textColor: [255, 255, 255],
      fontStyle: 'bold'
    },
    head: [['Titulo', 'Cliente', 'Status', 'Renovacao', 'Fim', 'Ciclo', 'Valor']],
    body: options.contracts.map((contract) => [
      contract.title,
      contract.customerName,
      contract.status,
      formatDate(contract.renewalDate),
      formatDate(contract.endDate),
      contract.paymentCycle,
      formatCurrency(contract.valueCents)
    ]),
    styles: {
      fontSize: 9,
      cellPadding: 5,
      textColor: [20, 30, 25]
    },
    didDrawPage: (hookData) => {
      const pageWidth = document.internal.pageSize.getWidth();
      const pageHeight = document.internal.pageSize.getHeight();
      document.setFontSize(9);
      document.setTextColor(85, 96, 88);
      document.text(`ContractFlow Suite v${options.appVersion}`, 40, pageHeight - 18);
      document.text(`Pagina ${hookData.pageNumber}`, pageWidth - 90, pageHeight - 18);
    }
  });

  const filename = `contractflow-relatorio-${options.generatedAt.toISOString().slice(0, 10)}.pdf`;
  document.save(filename);
}
