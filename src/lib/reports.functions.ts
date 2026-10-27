import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { REPORT_IDS, reportPermission, type ReportId } from "./report-catalog";
import { buildReport, type ReportSources, type SourceRow } from "./report-engine";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v, "Invalid date");
export const reportInput = z.object({ id: z.string().refine(v => REPORT_IDS.includes(v as ReportId)), from: date, to: date, tzOffsetMin:z.number().int().min(-840).max(840), storeId:z.string().uuid().optional(), party:z.string().max(160).optional(), productId:z.string().uuid().optional(), category:z.string().max(120).optional(), method:z.string().max(120).optional() }).refine(v=>v.from <= v.to,"From date must not follow To date");

export const getDetailedReport = createServerFn({method:"GET"})
  .middleware([requireSupabaseAuth])
  .inputValidator((d:unknown)=>reportInput.parse(d))
  .handler(async ({data,context})=>{
    const sb = context.supabase;
    for (const perm of new Set(["view_reports",reportPermission(data.id),...(data.id === "pnl" ? ["view_pnl"] : []),...(["bank","balance-sheet"].includes(data.id) ? ["view_accounting"] : [])])) {
      const {data:allowed,error} = await sb.rpc("pos_can",{_perm:perm});
      if(error || !allowed) throw new Error("You do not have permission to view this report.");
    }
    const {data:ws,error:wsError} = await sb.rpc("current_workspace");
    if(wsError || !ws) throw new Error("Business could not be checked. Please retry.");
    // Stable, bounded pagination: never silently return a partial financial total.
    async function read(table:string,select="*",configure?: (q:any)=>any):Promise<SourceRow[]> {
      const rows:SourceRow[]=[];
      for(let offset=0;offset<200000;offset+=1000){
        let q=(sb as any).from(table).select(select).eq("workspace_id",ws).order(table === "pos_store_stock" ? "product_id" : "id");
        if(configure) q=configure(q);
        const {data:page,error}=await q.range(offset,offset+999);
        if(error) { console.error(`Report read failed: ${table}`,error.code); throw new Error("Report records could not be loaded. Please retry."); }
        rows.push(...(page ?? [])); if(!page || page.length<1000) return rows;
      }
      throw new Error("Too many records for this report. Please contact the business administrator.");
    }
    const end=new Date(Date.parse(`${data.to}T00:00:00Z`)+data.tzOffsetMin*60000+86400000).toISOString();
    const s:ReportSources={sales:[],purchases:[],saleItems:[],purchaseItems:[],products:[],moves:[],stocks:[],stores:[],payments:[],expenses:[],cash:[],customers:[],suppliers:[],accounts:[],journals:[],journalLines:[]};
    const accounting=["bank","balance-sheet"].includes(data.id);
    const stock=["stock","low-stock","category-stock","stock-detail","manufacturing","consumption","transfers"].includes(data.id);
    if(data.id !== "serials") {
      const jobs:Promise<void>[]=[];
      const load=(key:keyof ReportSources,table:string,select:string,configure?: (q:any)=>any)=>jobs.push(read(table,select,configure).then(rows=>{s[key]=rows;}));
      load("stores","pos_stores","id,name,is_active");
      if(accounting) {
        load("accounts","acc_accounts","id,name,type,system_key,is_payment,opening_balance");
        load("journals","acc_journals","id,entry_date,reference,description,status",q=>q.eq("status","posted").lte("entry_date",data.to));
        load("journalLines","acc_journal_lines","id,journal_id,account_id,debit,credit,memo");
      } else {
        load("products","products","id,name,unit,scope,stock,category,is_active,min_stock,purchase_price,sale_price,custom_sale_price",q=>q.eq("scope","pos"));
        load("moves","stock_movements","id,product_id,store_id,kind,qty,note,created_at,ref_id");
        if(stock) load("stocks","pos_store_stock","product_id,store_id,qty");
        else {
          load("sales","pos_sales","id,doc_type,doc_number,status,customer_id,customer_name,created_at,grand_total,paid_total,balance,subtotal,discount_total,tax_total,cost_total",q=>q.lt("created_at",end));
          load("purchases","purchases","id,doc_type,doc_number,status,supplier_id,supplier_name,created_at,grand_total,paid_total,balance,subtotal,discount_total,tax_total",q=>q.lt("created_at",end));
          load("saleItems","pos_sale_items","id,sale_id,product_id,name,unit,qty,stock_qty,rate,cost,discount,tax_amount,tax_percent,line_total");
          load("purchaseItems","purchase_items","id,purchase_id,product_id,name,unit,qty,rate,discount,tax_amount,tax_percent,line_total,batch,expiry");
          load("payments","pos_payments","id,status,direction,method,amount,kind,note,customer_id,supplier_id,sale_id,purchase_id,created_at",q=>q.eq("status","completed").lt("created_at",end));
          load("expenses","expenses","id,status,category,amount,expense_date,method,description,store_id",q=>q.eq("status","completed").lte("expense_date",data.to));
          load("cash","pos_cash_entries","id,status,entry_date,created_at,direction,method,category,party,amount,note",q=>q.eq("status","completed").lte("entry_date",data.to));
        }
      }
      load("customers","customers","id,name,phone,opening_balance",q=>q.eq("pos_scoped",true));
      load("suppliers","suppliers","id,name,phone,opening_balance");
      await Promise.all(jobs);
    }
    if(data.storeId && !s.stores.some(x=>x.id===data.storeId)) throw new Error("Store not found in this business.");
    const output=buildReport(data.id as ReportId,s,data);
    // Ordinary report viewers must not receive purchase costs, inventory valuation or margins.
    const {data:profitAllowed}=await sb.rpc("pos_can",{_perm:"view_profit"});
    if(!profitAllowed && !accounting){
      const privateKeys=new Set(["cost","profit","costValue","saleValue"]);
      output.columns=output.columns.filter(c=>!privateKeys.has(c.key));
      output.rows=output.rows.map(r=>Object.fromEntries(Object.entries(r).filter(([k])=>!privateKeys.has(k))));
      output.totals=output.totals.filter(t=>!["Cost","Profit","CostValue","SaleValue"].includes(t.label));
    }
    return {...output,options:{products:s.products.map(p=>({id:p.id,name:p.name})),parties:[...s.customers.map(p=>({id:`c:${p.id}`,name:`${p.name || p.phone} (Customer)`})),...s.suppliers.map(p=>({id:`s:${p.id}`,name:`${p.name} (Supplier)`}))],accounts:s.accounts.filter(a=>a.system_key === "bank" || a.is_payment).map(a=>({id:a.id,name:a.name})),categories:[...new Set(s.products.map(p=>p.category || "Uncategorized"))].sort(),methods:[...new Set([...s.payments,...s.expenses,...s.cash].map(p=>p.method))].sort()}};
  });