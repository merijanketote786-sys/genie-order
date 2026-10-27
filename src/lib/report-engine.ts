import type { ReportId, ReportResult, ReportRow } from "./report-catalog";

// Database rows stay on the server; this pure calculator is also tested independently.
export type SourceRow = Record<string, any>;
export type ReportSources = { sales: SourceRow[]; purchases: SourceRow[]; saleItems: SourceRow[]; purchaseItems: SourceRow[]; products: SourceRow[]; moves: SourceRow[]; stocks: SourceRow[]; stores: SourceRow[]; payments: SourceRow[]; expenses: SourceRow[]; cash: SourceRow[]; customers: SourceRow[]; suppliers: SourceRow[]; accounts: SourceRow[]; journals: SourceRow[]; journalLines: SourceRow[] };
export type ReportFilter = { from: string; to: string; tzOffsetMin: number; storeId?: string; party?: string; productId?: string; category?: string; method?: string };
export const round = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const num = (v: unknown) => Number(v ?? 0) || 0;
const clean = (v: unknown) => String(v ?? "").replace(/\s*\/piece\b/gi, "");

export function buildReport(id: ReportId, s: ReportSources, f: ReportFilter): ReportResult {
  const day = (v: string) => v?.includes("T") ? new Date(Date.parse(v) - f.tzOffsetMin * 60000).toISOString().slice(0, 10) : v ?? "";
  const inPeriod = (v: string) => day(v) >= f.from && day(v) <= f.to;
  const beforeEnd = (v: string) => day(v) <= f.to;
  const products = new Map(s.products.map(p => [p.id, p]));
  const stores = new Map(s.stores.map(p => [p.id, p.name]));
  const movementStore = new Map(s.moves.filter(m => m.ref_id && !["cancel", "sale_cancel", "purchase_cancel"].includes(m.kind)).map(m => [m.ref_id, m.store_id]));
  const storeMatches = (d: SourceRow) => !f.storeId || movementStore.get(d.id) === f.storeId;
  const partyMatches = (p: string) => !f.party || p === f.party;
  const itemMatches = (i: SourceRow) => (!f.productId || i.product_id === f.productId || i.id === f.productId) && (!f.category || (products.get(i.product_id ?? i.id)?.category ?? "Uncategorized") === f.category);
  const documents = (rows: SourceRow[], types: string[]) => rows.filter(d => types.includes(d.doc_type) && d.status !== "cancelled" && d.status !== "draft" && beforeEnd(d.created_at) && storeMatches(d) && partyMatches(d.customer_id ? `c:${d.customer_id}` : d.supplier_id ? `s:${d.supplier_id}` : ""));
  const salesAll = documents(s.sales, ["sale", "return"]);
  const purchasesAll = documents(s.purchases, ["purchase", "return"]);
  const sales = salesAll.filter(d => inPeriod(d.created_at));
  const purchases = purchasesAll.filter(d => inPeriod(d.created_at));
  const saleMap = new Map(sales.map(d => [d.id, d]));
  const purchaseMap = new Map(purchases.map(d => [d.id, d]));
  const sign = (d: SourceRow) => d.doc_type === "return" ? -1 : 1;
  const docRows = (ds: SourceRow[], side: string) => ds.map(d => ({ date: day(d.created_at), document: d.doc_number, type: d.doc_type === "return" ? `${side} return` : side, party: d.customer_name || d.supplier_name || "Walk-in", status: d.status, store: stores.get(movementStore.get(d.id)) ?? "Unassigned", amount: round(sign(d) * num(d.grand_total)), tax: round(sign(d) * num(d.tax_total)), discount: round(sign(d) * num(d.discount_total)), paid: round(sign(d) * num(d.paid_total)), balance: round(sign(d) * num(d.balance)), revenue: round(sign(d) * (num(d.grand_total) - num(d.tax_total))), cost: round(sign(d) * num(d.cost_total)), profit: round(sign(d) * (num(d.grand_total) - num(d.tax_total) - num(d.cost_total))) }));
  const lineRows = (items: SourceRow[], docs: Map<string, SourceRow>, side: string, parent: string) => items.filter(i => docs.has(i[parent]) && itemMatches(i)).map(i => {
    const d = docs.get(i[parent]) ?? {}; const sg = sign(d);
    const total = num(i.line_total) - num(i.tax_amount);
    const linesTotal = num(d.subtotal) || 1;
    const allocation = num(d.discount_total) * total / linesTotal;
    return { date: day(d.created_at), document: d.doc_number, type: d.doc_type === "return" ? `${side} return` : side, party: d.customer_name || d.supplier_name || "Walk-in", item: clean(i.name), category: products.get(i.product_id)?.category || "Uncategorized", unit: i.unit || "", qty: sg * num(i.qty), stockQty: sg * num(i.stock_qty ?? i.qty), rate: num(i.rate), amount: round(sg * num(i.line_total)), revenue: round(sg * (total - allocation)), cost: round(sg * num(i.cost)), profit: round(sg * (total - allocation - num(i.cost))), discount: round(sg * (num(i.discount) + allocation)), tax: round(sg * num(i.tax_amount)), taxRate: num(i.tax_percent), batch: i.batch || "", expiry: i.expiry || "" };
  });
  const saleLines = lineRows(s.saleItems, saleMap, "Sale", "sale_id");
  const purchaseLines = lineRows(s.purchaseItems, purchaseMap, "Purchase", "purchase_id");
  const lines = [...saleLines, ...purchaseLines];
  const notes: string[] = [];
  const result = (rows: ReportRow[], keys: string[], totals: string[] = []): ReportResult => ({ columns: keys.map(key => ({ key, label: ({ stockQty: "Stock quantity", taxRate: "Tax rate %", costValue: "Cost value", saleValue: "Sale value" } as Record<string,string>)[key] ?? key[0].toUpperCase() + key.slice(1), numeric: rows.some(r => typeof r[key] === "number") })), rows, totals: totals.map(key => ({ label: ({costValue:"Cost value",saleValue:"Sale value"} as Record<string,string>)[key] ?? key[0].toUpperCase() + key.slice(1), value: round(rows.reduce((sum, r) => sum + num(r[key]), 0)) })), notes });
  const group = (rows: ReportRow[], dimensions: string[], values: string[]) => {
    const map = new Map<string, ReportRow>();
    for (const r of rows) { const key = JSON.stringify(dimensions.map(k => r[k])); const out = map.get(key) ?? Object.fromEntries([...dimensions.map(k => [k, r[k]]), ...values.map(k => [k, 0])]); for (const v of values) out[v] = num(out[v]) + num(r[v]); map.set(key, out); }
    return [...map.values()].map(r => Object.fromEntries(Object.entries(r).map(([k,v]) => [k, typeof v === "number" ? round(v) : v])));
  };
  if (id === "sales" || id === "purchases" || id === "bill-profit" || id === "discount") {
    const rows = id === "purchases" ? docRows(purchases, "Purchase") : id === "discount" ? [...docRows(sales, "Sale"), ...docRows(purchases, "Purchase")] : docRows(sales, "Sale");
    if (id === "bill-profit") notes.push("Gross margin excludes tax and uses saved invoice costs; zero saved costs remain zero. Operating expenses are not allocated to bills.");
    return result(rows, id === "bill-profit" ? ["date","document","party","revenue","cost","profit"] : id === "discount" ? ["date","document","type","party","discount"] : ["date","document","type","party","store","amount","tax","paid","balance"], id === "bill-profit" ? ["revenue","cost","profit"] : id === "discount" ? ["discount"] : ["amount","tax","paid","balance"]);
  }
  if (["party-profit","item-profit","party-items","item-party","party-sales","category-sales","item-discount","tax-rates","item-detail"].includes(id)) {
    const dims = id === "party-profit" ? ["party"] : id === "item-profit" || id === "item-discount" ? ["item","unit"] : id === "category-sales" ? ["category","type"] : id === "tax-rates" ? ["type","taxRate"] : id === "party-sales" ? ["party","type"] : id === "item-detail" ? ["date","document","type","party","item","unit"] : id === "item-party" ? ["item","unit","party","type"] : ["party","item","unit","type"];
    const values = id.includes("profit") ? ["revenue","cost","profit"] : id === "item-discount" ? ["discount"] : id === "tax-rates" ? ["revenue","tax"] : ["qty","amount"];
    if (id.includes("profit")) notes.push("Gross margin uses saved costs and proportional bill discounts; no current product-price substitution or operating-expense allocation.");
    if (values.includes("qty")) notes.push("Quantities are in each displayed item's saved unit; mixed units must not be added together.");
    return result(group(id.includes("profit") || id === "item-discount" ? saleLines : lines, dims, values), [...dims,...values], values.filter(k => k !== "qty"));
  }
  if (id === "tax") return result([...docRows(sales,"Sale"),...docRows(purchases,"Purchase")], ["date","document","type","party","revenue","tax","amount"], ["tax"]);
  const expenseRows = s.expenses.filter(e => e.status === "completed" && inPeriod(e.expense_date) && (!f.storeId || e.store_id === f.storeId) && (!f.category || e.category === f.category) && (!f.method || e.method === f.method)).map(e => ({ date: e.expense_date, category: e.category, item: e.description || e.category, method: e.method, store: stores.get(e.store_id) || "Unassigned", amount: num(e.amount) }));
  if (id.startsWith("expense") || id === "expenses") { const dims = id === "expense-category" ? ["category"] : ["item","category"]; return id === "expenses" ? result(expenseRows,["date","category","item","store","method","amount"],["amount"]) : result(group(expenseRows,dims,["amount"]),[...dims,"amount"],["amount"]); }
  const cashAll = s.cash.filter(e => e.status === "completed" && beforeEnd(e.entry_date) && (!f.method || e.method === f.method));
  if (id.startsWith("income")) {
    notes.push("Other income includes only Day Book entries explicitly categorized Other income; capital, loans and internal transfers are excluded. Item is the saved description, not a stock item.");
    const rows = cashAll.filter(e => e.category === "Other income" && e.direction === "in" && inPeriod(e.entry_date)).map(e => ({ date: e.entry_date, category: e.category, item: e.note || e.category, party: e.party || "", method: e.method, amount: num(e.amount) }));
    return id === "income" ? result(rows,["date","category","item","party","method","amount"],["amount"]) : result(group(rows,[id === "income-category" ? "category" : "item"],["amount"]),[id === "income-category" ? "category" : "item","amount"],["amount"]);
  }
  if (id === "loans") {
    notes.push("Recorded loan cash statement only: Loan received and Loan repaid Day Book entries. Interest, fees and repayment schedules are not separately tracked.");
    const entries = cashAll.filter(e => ["Loan received","Loan repaid"].includes(e.category) && (!f.party || e.party === f.party)).sort((a,b) => a.entry_date.localeCompare(b.entry_date) || a.created_at.localeCompare(b.created_at));
    const balances = new Map<string,number>(); const rows: ReportRow[] = []; const opened = new Set<string>();
    for (const e of entries) { const party = e.party || "Unassigned lender"; if(inPeriod(e.entry_date) && !opened.has(party)) { rows.push({date:f.from,party,type:"Opening balance",received:0,repaid:0,balance:balances.get(party) ?? 0,note:""}); opened.add(party); } const delta = (e.category === "Loan received" ? 1 : -1) * num(e.amount); const balance = round((balances.get(party) ?? 0) + delta); balances.set(party,balance); if (inPeriod(e.entry_date)) rows.push({ date:e.entry_date,party,type:e.category,received:delta > 0 ? delta : 0,repaid:delta < 0 ? -delta : 0,balance,note:e.note || "" }); }
    for(const [party,balance] of balances) if(!opened.has(party)) rows.push({date:f.from,party,type:"Opening balance",received:0,repaid:0,balance,note:""});
    return result(rows,["date","party","type","received","repaid","balance","note"],["received","repaid"]);
  }
  if (id === "orders" || id === "order-items") {
    notes.push("Sales estimates and purchase orders only; not counted as sales, purchases, stock or profit. Historical orders/estimates do not retain a store, so this report is firm-wide.");
    const orders = [...s.sales.filter(d => d.doc_type === "quotation"), ...s.purchases.filter(d => d.doc_type === "order")].filter(d => inPeriod(d.created_at) && partyMatches(d.customer_id ? `c:${d.customer_id}` : d.supplier_id ? `s:${d.supplier_id}` : ""));
    if (id === "orders") return result(orders.map(d => ({date:day(d.created_at),document:d.doc_number,type:d.doc_type === "order" ? "Purchase order" : "Sales estimate",party:d.customer_name || d.supplier_name || "Walk-in",status:d.status,amount:num(d.grand_total)})),["date","document","type","party","status","amount"],["amount"]);
    const sm = new Map(orders.filter(d => d.doc_type === "quotation").map(d => [d.id,d])); const pm = new Map(orders.filter(d => d.doc_type === "order").map(d => [d.id,d]));
    return result([...lineRows(s.saleItems,sm,"Sales estimate","sale_id"),...lineRows(s.purchaseItems,pm,"Purchase order","purchase_id")],["date","document","type","party","item","unit","qty","rate","amount"],["amount"]);
  }
  if (id === "serials") { notes.push("Serial-number receipt, sale and transfer histories are not recorded in this POS. No serial stock can be inferred from product barcodes."); return result([],["item","serial","status"]); }
  if (id === "batches") { notes.push("Purchase batch receipts/returns only; sales, transfers and consumption do not retain batch identifiers. This is not batch stock on hand."); return result(purchaseLines.filter(r => r.batch),["date","document","type","party","item","unit","batch","expiry","qty","amount"],["amount"]); }
  const moves = s.moves.filter(m => products.has(m.product_id) && (!f.storeId || m.store_id === f.storeId) && itemMatches(m) && inPeriod(m.created_at)).map(m => ({ date:day(m.created_at),reference:m.ref_id || "",item:clean(products.get(m.product_id)?.name),unit:products.get(m.product_id)?.unit || "",store:stores.get(m.store_id) || "Unassigned",type:m.kind,qty:num(m.qty),note:m.note || "" }));
  if (["manufacturing","consumption","transfers","stock-detail"].includes(id)) {
    const filtered = id === "manufacturing" ? moves.filter(m => m.type === "manufacture_in") : id === "consumption" ? moves.filter(m => m.type === "manufacture_out") : id === "transfers" ? moves.filter(m => m.type === "transfer_in" || m.type === "transfer_out") : moves;
    notes.push("Signed movements: positive received, negative issued; matching transfer references net to zero within the same firm. Quantities use each item's main unit.");
    return result(filtered,["date","reference","item","unit","store","type","qty","note"]);
  }
  if (["stock","low-stock","category-stock"].includes(id)) {
    notes.push("Quantity reconstructed as of the end date from current store balances less later signed movements. Values use current recorded prices, not historical FIFO valuation.");
    const rows = s.products.filter(p => p.is_active && itemMatches(p)).map(p => {
      const current = f.storeId ? s.stocks.filter(x => x.product_id === p.id && x.store_id === f.storeId).reduce((n,x) => n + num(x.qty),0) : num(p.stock);
      const later = s.moves.filter(m => m.product_id === p.id && (!f.storeId || m.store_id === f.storeId) && day(m.created_at) > f.to).reduce((n,m) => n + num(m.qty),0);
      const qty = Math.round((current-later)*1000)/1000;
      return {item:clean(p.name),category:p.category || "Uncategorized",unit:p.unit || "",qty,minimum:num(p.min_stock),costValue:round(qty*num(p.purchase_price)),saleValue:round(qty*num(p.custom_sale_price ?? p.sale_price))};
    });
    if (id === "category-stock") return result(group(rows,["category","unit"],["qty","costValue","saleValue"]),["category","unit","qty","costValue","saleValue"],["costValue","saleValue"]);
    return result(id === "low-stock" ? rows.filter(r => { const p = s.products.find(p => clean(p.name) === r.item); return p?.min_stock != null && r.qty <= r.minimum; }) : rows,["item","category","unit","qty","minimum","costValue","saleValue"],["costValue","saleValue"]);
  }
  const paymentAll = s.payments.filter(p => p.status === "completed" && beforeEnd(p.created_at) && (!f.method || p.method === f.method) && (!f.storeId || movementStore.get(p.sale_id ?? p.purchase_id) === f.storeId));
  if (id === "parties" || id === "party-statement") {
    notes.push("Balances include full saved invoice totals, returns and completed payments once. Customer and supplier balances remain separate. Opening is before the selected start date.");
    const parties: SourceRow[] = [...s.customers.map(p => ({...p,key:`c:${p.id}`,role:"Customer"})),...s.suppliers.map(p => ({...p,key:`s:${p.id}`,role:"Supplier"}))].filter(p => !f.party || p.key === f.party);
    const rows: ReportRow[] = [];
    for (const p of parties) {
      let balance = f.storeId ? 0 : num(p.opening_balance);
      const docs = p.role === "Customer" ? salesAll.filter(d => d.customer_id === p.id) : purchasesAll.filter(d => d.supplier_id === p.id);
      const events = [...docs.map(d => ({date:d.created_at,reference:d.doc_number,type:d.doc_type,charge:sign(d)*num(d.grand_total),payment:0})),...paymentAll.filter(x => p.role === "Customer" ? x.customer_id === p.id : x.supplier_id === p.id).map(x => ({date:x.created_at,reference:x.note || "",type:x.kind,charge:0,payment:(p.role === "Customer" ? x.direction === "in" : x.direction === "out") ? num(x.amount) : -num(x.amount)}))].sort((a,b) => a.date.localeCompare(b.date));
      let opening = balance; let charge = 0; let payment = 0;
      for (const e of events) { balance = round(balance+e.charge-e.payment); if (day(e.date) < f.from) opening = balance; else { charge += e.charge; payment += e.payment; if (id === "party-statement") rows.push({date:day(e.date),party:p.name || p.phone || "Party",role:p.role,reference:e.reference,type:e.type,charge:e.charge,payment:e.payment,balance}); } }
      if (id === "parties") rows.push({party:p.name || p.phone || "Party",phone:p.phone || "",role:p.role,opening,charge:round(charge),payment:round(payment),balance});
      else rows.push({date:f.from,party:p.name || p.phone || "Party",role:p.role,reference:"Opening balance",type:"Opening",charge:0,payment:0,balance:opening});
    }
    return result(id === "party-statement" ? rows.sort((a,b) => String(a.party).localeCompare(String(b.party)) || String(a.date).localeCompare(String(b.date)) || (a.type === "Opening" ? -1 : 1)) : rows,id === "parties" ? ["party","phone","role","opening","charge","payment","balance"] : ["date","party","role","reference","type","charge","payment","balance"]);
  }
  const flowRows: ReportRow[] = [
    ...paymentAll.map(p => ({date:day(p.created_at),type:p.kind,party:p.note || "",method:p.method,received:p.direction === "in" ? num(p.amount) : 0,paid:p.direction === "out" ? num(p.amount) : 0,activity:"Operating"})),
    ...s.expenses.filter(e => e.status === "completed" && beforeEnd(e.expense_date) && (!f.storeId || e.store_id === f.storeId) && (!f.method || e.method === f.method)).map(e => ({date:e.expense_date,type:`Expense: ${e.category}`,party:e.description || "",method:e.method,received:0,paid:num(e.amount),activity:"Operating"})),
    ...(!f.storeId ? cashAll : []).filter(e => id !== "cashflow" || !["Cash from bank","Cash to bank"].includes(e.category)).map(e => ({date:e.entry_date,type:e.category,party:e.party || "",method:e.method,received:e.direction === "in" ? num(e.amount) : 0,paid:e.direction === "out" ? num(e.amount) : 0,activity:["Loan received","Loan repaid","Owner capital","Owner drawing"].includes(e.category) ? "Financing" : "Operating"})),
  ].sort((a,b) => String(a.date).localeCompare(String(b.date)));
  if (id === "cashflow" || id === "daybook" || id === "transactions") {
    notes.push("Cash movements use completed payments, expenses and manual entries, not invoice totals. Internal cash/bank transfers are excluded from combined cashflow. Unattributed standalone payments/manual entries are omitted under a concrete store.");
    const filtered = flowRows.filter(r => String(r.date) >= f.from);
    const opening = round(flowRows.filter(r => String(r.date) < f.from).reduce((n,r) => n+num(r.received)-num(r.paid),0));
    if (id === "transactions") return result([...docRows(sales,"Sale"),...docRows(purchases,"Purchase"),...filtered.map(r => ({...r,document:"",amount:num(r.received)-num(r.paid)}))].sort((a,b)=>String((a as ReportRow).date).localeCompare(String((b as ReportRow).date))),["date","document","type","party","amount"]);
    const rows = id === "cashflow" ? group(filtered,["activity","method"],["received","paid"]) : filtered;
    const out = result(rows,id === "cashflow" ? ["activity","method","received","paid"] : ["date","type","party","method","received","paid"],["received","paid"]);
    out.totals.push({label:"Opening recorded cash",value:opening},{label:"Closing recorded cash",value:round(opening+filtered.reduce((n,r)=>n+num(r.received)-num(r.paid),0))});
    notes.push("Opening/closing recorded cash excludes account opening balances and non-cash manual journals; use Bank Statement for posted account balances."); return out;
  }
  if (id === "pnl") {
    const sale = docRows(sales,"Sale"); const revenue = sale.reduce((n,r)=>n+r.revenue,0); const cost = sale.reduce((n,r)=>n+r.cost,0); const expense = expenseRows.reduce((n,r)=>n+r.amount,0); const income = !f.storeId ? cashAll.filter(e=>e.category === "Other income" && e.direction === "in" && inPeriod(e.entry_date)).reduce((n,e)=>n+num(e.amount),0) : 0;
    notes.push("POS operational P&L: net invoice revenue excludes tax; saved costs, completed expenses and explicitly recorded Other income. No Workspace records, inventory purchases or loan principal are counted as expenses. Manual accounting adjustments are not included.");
    return result([{particular:"Net revenue",amount:round(revenue)},{particular:"Cost of goods sold",amount:round(-cost)},{particular:"Gross profit",amount:round(revenue-cost)},{particular:"Other income",amount:round(income)},{particular:"Expenses",amount:round(-expense)},{particular:"Net profit",amount:round(revenue-cost+income-expense)}],["particular","amount"]);
  }
  // Posted accounting reports are firm-wide. Never force balance by inventing equity.
  const posted = new Map(s.journals.filter(j=>j.status === "posted" && j.entry_date <= f.to).map(j=>[j.id,j]));
  if (id === "bank") {
    notes.push("Firm-wide posted account ledger; reversed postings remain with their posted reversal. Account opening balances are included.");
    const rows: ReportRow[] = [];
    for (const a of s.accounts.filter(a => (a.system_key === "bank" || a.is_payment) && (!f.party || a.id === f.party))) {
      let balance = num(a.opening_balance); const ls = s.journalLines.filter(l=>l.account_id === a.id && posted.has(l.journal_id)).sort((x,y)=>String(posted.get(x.journal_id)?.entry_date).localeCompare(String(posted.get(y.journal_id)?.entry_date)));
      for (const l of ls) { const j = posted.get(l.journal_id) ?? {}; if (j.entry_date < f.from) balance += num(l.debit)-num(l.credit); }
      rows.push({date:f.from,account:a.name,reference:"Opening balance",description:"",debit:0,credit:0,balance:round(balance)});
      for (const l of ls) { const j = posted.get(l.journal_id) ?? {}; if(j.entry_date < f.from) continue; balance = round(balance+num(l.debit)-num(l.credit)); rows.push({date:j.entry_date,account:a.name,reference:j.reference || "",description:l.memo || j.description || "",debit:num(l.debit),credit:num(l.credit),balance}); }
    }
    return result(rows,["date","account","reference","description","debit","credit","balance"],["debit","credit"]);
  }
  if (id === "balance-sheet") {
    notes.push("Firm-wide posted accounting balances as of end date. The fixed-asset register is not auto-posted. A difference is disclosed, never silently balanced.");
    let openSum = 0; const rows: ReportRow[] = []; let earnings = 0;
    for (const a of s.accounts) { const normal = ["asset","expense","cogs"].includes(a.type) ? 1 : -1; let opening = num(a.opening_balance)*normal; if (a.system_key === "ar") opening += s.customers.reduce((n,p)=>n+num(p.opening_balance),0); if(a.system_key === "ap") opening -= s.suppliers.reduce((n,p)=>n+num(p.opening_balance),0); openSum += opening; const close = opening+s.journalLines.filter(l=>l.account_id === a.id && posted.has(l.journal_id)).reduce((n,l)=>n+num(l.debit)-num(l.credit),0); if(["income","expense","cogs"].includes(a.type)) earnings -= close; else rows.push({section:a.type,account:a.name,amount:round(close*normal),key:a.system_key || ""}); }
    const oe = rows.find(r=>r.key === "opening_equity"); if(oe) oe.amount = round(num(oe.amount)+openSum);
    rows.push({section:"equity",account:"Accumulated profit / loss",amount:round(earnings)});
    const sum = (section:string)=>round(rows.filter(r=>r.section === section).reduce((n,r)=>n+num(r.amount),0)); const out = result(rows,["section","account","amount"]); out.totals = [{label:"Assets",value:sum("asset")},{label:"Liabilities",value:sum("liability")},{label:"Equity",value:sum("equity")},{label:"Difference",value:round(sum("asset")-sum("liability")-sum("equity"))}]; return out;
  }
  return result([],[]);
}