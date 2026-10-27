export const REPORT_GROUPS = [
  { title: "Transaction", reports: [["sales", "Sale Report"], ["purchases", "Purchase Report"], ["daybook", "Day Book"], ["bill-profit", "Bill Wise Profit"], ["pnl", "Profit & Loss"], ["transactions", "All Transactions Report"], ["cashflow", "Cashflow"], ["balance-sheet", "Balance Sheet"]] },
  { title: "Party Reports", reports: [["party-statement", "Party Statement"], ["party-profit", "Party Wise Profit & Loss"], ["parties", "All Parties Report"], ["party-items", "Party Report by Items"], ["party-sales", "Sale/Purchase by Party"]] },
  { title: "Item/Stock Reports", reports: [["stock", "Stock Summary Report"], ["item-party", "Item Report By Party"], ["item-profit", "Item Wise Profit & Loss"], ["low-stock", "Low Stock Summary Report"], ["item-detail", "Item Detail Report"], ["stock-detail", "Stock Detail Report"], ["category-sales", "Sale/Purchase By Item Category"], ["category-stock", "Stock Summary By Item Category"], ["batches", "Item Batch Report"], ["serials", "Item Serial Report"], ["item-discount", "Item Wise Discount"], ["manufacturing", "Manufacturing Report"], ["consumption", "Consumption Report"], ["transfers", "Stock Transfer Report"]] },
  { title: "Business Status", reports: [["bank", "Bank Statement"], ["discount", "Discount Report"]] },
  { title: "Taxes", reports: [["tax", "Tax Report"], ["tax-rates", "Tax Rate Report"]] },
  { title: "Sale/Purchase Order Reports", reports: [["orders", "Sale/Purchase Order Transaction Report"], ["order-items", "Sale/Purchase Order Item Report"]] },
  { title: "Expense Reports", reports: [["expenses", "Expense Transaction Report"], ["expense-items", "Expense Item Report"], ["expense-category", "Expense Category Report"]] },
  { title: "Other Income Reports", reports: [["income", "Other Income Transaction Report"], ["income-category", "Other Income Category Report"], ["income-items", "Other Income Item Report"]] },
  { title: "Loan Reports", reports: [["loans", "Loan Statement"]] },
] as const;
export type ReportId = typeof REPORT_GROUPS[number]["reports"][number][0];
export const REPORT_IDS = REPORT_GROUPS.flatMap(g => g.reports.map(r => r[0]));
export const reportTitle = (id: string) => REPORT_GROUPS.flatMap(g => [...g.reports]).find(r => r[0] === id)?.[1] ?? "Report";
export const reportPermission = (id: string) => id === "balance-sheet" ? "view_balance_sheet" : id === "bank" ? "view_ledger" : id.includes("profit") || id === "pnl" ? "view_profit" : "view_reports";
export type ReportRow = Record<string, string | number>;
export type ReportResult = { columns: { key: string; label: string; numeric?: boolean }[]; rows: ReportRow[]; totals: { label: string; value: number }[]; notes: string[] };