import type { EodSummary, PosPaymentRecord } from '../domain/pos.types';

export class CsvExportService {
  /**
   * Helper to trigger file download in browser.
   */
  downloadCsv(filename: string, csvContent: string): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Generates and downloads Item Sales CSV.
   */
  exportItemSalesCsv(summary: EodSummary, triggerDownload = true): string {
    const headers = ['Item Name', 'Category', 'Quantity Sold', 'Total Revenue (INR)'];
    const rows = (summary.itemSales || []).map((row) => [
      `"${(row.name || '').replace(/"/g, '""')}"`,
      `"${(row.category || '').replace(/"/g, '""')}"`,
      row.quantitySold,
      row.totalRevenue,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    if (triggerDownload) {
      this.downloadCsv(`item_sales_${summary.date}.csv`, csvContent);
    }
    return csvContent;
  }

  /**
   * Generates and downloads Payment Report CSV.
   */
  exportPaymentReportCsv(payments: PosPaymentRecord[], dateStr = 'report', triggerDownload = true): string {
    const headers = ['Payment ID', 'Order ID', 'Method', 'Amount (INR)', 'Status', 'Recorded At', 'Reference'];
    const rows = payments.map((p) => [
      p.id,
      p.orderId,
      p.method,
      p.amount,
      p.status,
      p.recordedAt,
      `"${(p.reference || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    if (triggerDownload) {
      this.downloadCsv(`payment_report_${dateStr}.csv`, csvContent);
    }
    return csvContent;
  }

  /**
   * Generates and downloads Daily Sales Summary CSV.
   */
  exportDailySalesCsv(summary: EodSummary, triggerDownload = true): string {
    const rows = [
      ['Metric', 'Value'],
      ['Business Date', summary.date],
      ['Total Orders', summary.totalOrdersCount],
      ['Walk-in Orders', summary.walkInOrdersCount],
      ['Online Orders', summary.onlineOrdersCount],
      ['Gross Sales (INR)', summary.grossSales],
      ['Net Sales (INR)', summary.netSales],
      ['Total Taxes (INR)', summary.totalTaxes],
      ['Total Discounts (INR)', summary.totalDiscounts],
      ['Cash Sales (INR)', summary.paymentBreakdown?.cash || 0],
      ['UPI Sales (INR)', summary.paymentBreakdown?.upi || 0],
      ['Card Sales (INR)', summary.paymentBreakdown?.card || 0],
      ['Online/Razorpay Sales (INR)', summary.paymentBreakdown?.online || 0],
      ['Opening Cash Float (INR)', summary.cashReconciliation?.openingFloat || 0],
      ['Expected Closing Cash (INR)', summary.cashReconciliation?.expectedClosingCash || 0],
      ['Actual Closing Cash (INR)', summary.cashReconciliation?.actualClosingCash || 0],
      ['Cash Variance (INR)', summary.cashReconciliation?.variance || 0],
    ];

    const csvContent = rows.map((r) => r.join(',')).join('\n');

    if (triggerDownload) {
      this.downloadCsv(`daily_sales_summary_${summary.date}.csv`, csvContent);
    }
    return csvContent;
  }
}

export const csvExportService = new CsvExportService();
