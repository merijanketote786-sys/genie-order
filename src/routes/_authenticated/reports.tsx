import { AppShell } from "@/components/app-shell";
import { usePosAccess } from "@/components/pos-access";
import { usePrintCenter } from "@/components/print-center";
import { useStores } from "@/components/store-switcher";
import { posInput, rs } from "@/components/pos-subnav";
import { Button } from "@/components/ui/button";
import { csvSafe } from "@/lib/csv-safe";
import { REPORT_GROUPS, reportTitle, reportPermission, type ReportId } from "@/lib/report-catalog";
import { getDetailedReport } from "@/lib/reports.functions";
import type { PosPerm } from "@/lib/pos-access.functions";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, ArrowUpDown, ChevronRight, Download, FileSpreadsheet, Loader2, Printer, RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [
    { title: "POS Reports — HB Chemicals Pakistan" },
    { name: "description", content: "POS sales, purchases, parties, stock, taxes, expenses, cashflow and accounting reports for the selected business." },
    { property: "og:title", content: "POS Reports — HB Chemicals Pakistan" },
    { property: "og:description", content: "Business reports from recorded POS transactions, stock movements and posted accounts." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: ReportsPage,
});
const localDate = (d:Date) => new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);
function dates(preset:string):[string,string] {
  const t=new Date(); const end=localDate(t);
  if(preset === "today") return [end,end];
  if(preset === "year") return [`${t.getFullYear()}-01-01`,end];
  if(preset === "lastmonth") return [localDate(new Date(t.getFullYear(),t.getMonth()-1,1)),localDate(new Date(t.getFullYear(),t.getMonth(),0))];
  return [localDate(new Date(t.getFullYear(),t.getMonth(),1)),end];
}

function ReportsPage(){
  const {can}=usePosAccess(); const [selected,setSelected]=useState<ReportId|null>(null); const [search,setSearch]=useState("");
  const groups=REPORT_GROUPS.map(g=>({...g,reports:g.reports.filter(([id,label])=>can(reportPermission(id) as PosPerm) && label.toLowerCase().includes(search.toLowerCase()))})).filter(g=>g.reports.length);
  return <AppShell title="Reports" subtitle="POS business reports" active="/reports" wide>
    <div className="min-h-0 flex-1 overflow-y-auto pb-8 pt-3">
      {!can("view_reports") ? <p className="p-6 text-muted-foreground">You do not have permission to view reports.</p> : selected ? <ReportView key={selected} id={selected} onBack={()=>setSelected(null)}/> : <>
        <div className="relative mb-5 max-w-lg"><Search className="absolute left-3 top-3 size-4 text-muted-foreground"/><input className={`${posInput} w-full pl-9`} aria-label="Search reports" placeholder="Search reports" value={search} onChange={e=>setSearch(e.target.value)}/></div>
        <div className="grid items-start gap-x-8 gap-y-6 md:grid-cols-2 xl:grid-cols-3">
          {groups.map(g=><section key={g.title} className="border-t-2 border-primary pt-3"><h2 className="mb-2 text-lg font-bold">{g.title}</h2><div className="divide-y divide-border">{g.reports.map(([id,title])=><Button key={id} variant="ghost" className="h-auto min-h-11 w-full justify-between gap-3 rounded-none px-1 py-3 text-left font-normal" onClick={()=>setSelected(id)}><span className="min-w-0 whitespace-normal">{title}</span><ChevronRight className="size-4 shrink-0 text-muted-foreground"/></Button>)}</div></section>)}
        </div>{!groups.length && <p className="py-10 text-center text-muted-foreground">No matching reports.</p>}
      </>}
    </div>
  </AppShell>;
}

function ReportView({id,onBack}:{id:ReportId;onBack:()=>void}){
  const [[from,to],setDates]=useState<[string,string]>(()=>dates("month"));
  const [storeId,setStore]=useState(""); const [party,setParty]=useState(""); const [productId,setProduct]=useState(""); const [category,setCategory]=useState(""); const [method,setMethod]=useState("");
  const [search,setSearch]=useState(""); const [page,setPage]=useState(0); const [sort,setSort]=useState<{key:string;desc:boolean}|null>(null);
  const {data:stores}=useStores(); const pc=usePrintCenter(); const accounting=["bank","balance-sheet"].includes(id); const orders=["orders","order-items"].includes(id);
  const valid=!!from && !!to && from <= to;
  const query=useQuery({queryKey:["pos-detailed-report",id,from,to,storeId,party,productId,category,method],queryFn:()=>getDetailedReport({data:{id,from,to,tzOffsetMin:new Date().getTimezoneOffset(),storeId:!accounting && !orders && storeId ? storeId:undefined,party:party||undefined,productId:productId||undefined,category:category||undefined,method:method||undefined}}),enabled:valid,staleTime:30000});
  const data=query.data;
  const rows=useMemo(()=>{
    const list=(data?.rows ?? []).filter(r=>!search || Object.values(r).some(v=>String(v).toLowerCase().includes(search.toLowerCase())));
    if(sort)list.sort((a,b)=>{const x=a[sort.key],y=b[sort.key];const cmp=typeof x === "number" && typeof y === "number" ? x-y : String(x ?? "").localeCompare(String(y ?? ""));return sort.desc ? -cmp:cmp;});
    return list;
  },[data,search,sort]);
  const size=100; const pages=Math.max(1,Math.ceil(rows.length/size)); const current=Math.min(page,pages-1);
  const head=data?.columns.map(c=>c.label) ?? []; const tableRows=rows.map(r=>data?.columns.map(c=>r[c.key] ?? "") ?? []);
  const doc=()=>({kind:"report" as const,title:reportTitle(id),number:`${from} to ${to}`,date:new Date(),table:{head,rows:tableRows},totals:!search ? data?.totals:undefined,notes:data?.notes.join("\n"),meta:[["Store",accounting || orders ? "Firm-wide":stores?.stores.find(s=>s.id===storeId)?.name ?? "All stores"],["Rows",String(rows.length)]] as [string,string][]});
  async function download(kind:"csv"|"xlsx"){
    try{
      const name=`${id}-${from}-${to}`;
      if(kind === "xlsx") {const X=await import("xlsx");const wb=X.utils.book_new();X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet([head,...tableRows.map(r=>r.map(v=>typeof v === "string" ? csvSafe(v):v))]),"Report");X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet([["Report",reportTitle(id)],["From",from],["To",to],...(!search ? (data?.totals ?? []).map(t=>[t.label,t.value]):[]),...(data?.notes ?? []).map(n=>["Note",n])]),"Summary");X.writeFile(wb,`${name}.xlsx`);return;}
      const blob=new Blob(["\ufeff"+[head,...tableRows].map(r=>r.map(c=>`"${csvSafe(c).replace(/"/g,'""')}"`).join(",")).join("\n")],{type:"text/csv;charset=utf-8"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`${name}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
    }catch{toast.error("Export could not be created. Please retry.");}
  }
  const filters=()=>{setPage(0);};
  return <div className="space-y-4">
    {pc.node}
    <div className="flex items-start gap-2"><Button variant="ghost" size="icon" aria-label="Back to reports" onClick={onBack}><ArrowLeft/></Button><h1 className="min-w-0 pt-1 text-xl font-bold">{reportTitle(id)}</h1></div>
    <div className="flex flex-wrap gap-2">{[["today","Today"],["month","This month"],["lastmonth","Last month"],["year","This year"]].map(([k,l])=><Button key={k} size="sm" variant="outline" onClick={()=>{setDates(dates(k));filters();}}>{l}</Button>)}</div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-xs text-muted-foreground">From<input aria-label="From" type="date" className={`${posInput} mt-1 w-full`} value={from} onChange={e=>{setDates([e.target.value,to]);filters();}}/></label>
      <label className="text-xs text-muted-foreground">To<input aria-label="To" type="date" className={`${posInput} mt-1 w-full`} value={to} onChange={e=>{setDates([from,e.target.value]);filters();}}/></label>
      {!accounting && !orders && id !== "serials" && !id.startsWith("income") && id !== "loans" && <label className="text-xs text-muted-foreground">Store<select aria-label="Report store" className={`${posInput} mt-1 w-full`} value={storeId} onChange={e=>{setStore(e.target.value);filters();}}><option value="">All stores</option>{stores?.stores.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
      {(id.startsWith("party") || id === "parties" || id === "item-party" || orders || id === "bank") && <label className="text-xs text-muted-foreground">{id === "bank" ? "Bank account":"Party"}<select aria-label="Report party" className={`${posInput} mt-1 w-full`} value={party} onChange={e=>{setParty(e.target.value);filters();}}><option value="">All</option>{(id === "bank" ? data?.options.accounts:data?.options.parties)?.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
      {(["item-detail","item-profit","stock","stock-detail","low-stock","item-party","party-items","order-items","batches","manufacturing","consumption","transfers","item-discount"].includes(id)) && <label className="text-xs text-muted-foreground">Item<select aria-label="Report item" className={`${posInput} mt-1 w-full`} value={productId} onChange={e=>{setProduct(e.target.value);filters();}}><option value="">All items</option>{data?.options.products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
      {["category-sales","category-stock","stock","low-stock"].includes(id) && <label className="text-xs text-muted-foreground">Category<select aria-label="Report category" className={`${posInput} mt-1 w-full`} value={category} onChange={e=>{setCategory(e.target.value);filters();}}><option value="">All categories</option>{data?.options.categories.map(p=><option key={p}>{p}</option>)}</select></label>}
      {["daybook","cashflow","expenses","expense-items","expense-category","income","loans"].includes(id) && <label className="text-xs text-muted-foreground">Payment method<select aria-label="Report payment method" className={`${posInput} mt-1 w-full`} value={method} onChange={e=>{setMethod(e.target.value);filters();}}><option value="">All methods</option>{data?.options.methods.map(p=><option key={p}>{p}</option>)}</select></label>}
    </div>
    {!valid && <p role="alert" className="text-sm text-destructive">Enter a valid date range; From must not follow To.</p>}
    <div className="flex flex-wrap items-center gap-2"><input aria-label="Search report rows" placeholder="Search records" className={`${posInput} min-w-0 flex-1 sm:max-w-xs`} value={search} onChange={e=>{setSearch(e.target.value);filters();}}/><Button size="icon" variant="outline" aria-label="Refresh report" disabled={query.isFetching || !valid} onClick={()=>void query.refetch()}><RefreshCw className={query.isFetching ? "animate-spin":""}/></Button><Button size="sm" variant="outline" disabled={!data || query.isFetching} onClick={()=>void download("csv")}><Download/>CSV</Button><Button size="sm" variant="outline" disabled={!data || query.isFetching} onClick={()=>void download("xlsx")}><FileSpreadsheet/>Excel</Button><Button size="sm" disabled={!data || query.isFetching} onClick={()=>pc.preview(doc())}><Printer/>Print / PDF</Button></div>
    {query.isError && <div role="alert" className="border-l-2 border-destructive py-3 pl-3 text-sm text-destructive">{query.error instanceof Error ? query.error.message:"Report could not be loaded."}<Button variant="link" onClick={()=>void query.refetch()}>Retry</Button></div>}
    {query.isFetching && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin"/>Loading report…</p>}
    {data && valid && <>
      {!search && <div className="flex flex-wrap gap-x-8 gap-y-3 border-y border-border py-3">{data.totals.map(t=><div key={t.label}><p className="text-xs text-muted-foreground">{t.label}</p><p className="text-lg font-bold tabular-nums">{rs(t.value)}</p></div>)}</div>}
      {data.notes.length>0 && <div className="space-y-1 border-l-2 border-border pl-3 text-xs text-muted-foreground">{data.notes.map(n=><p key={n}>{n}</p>)}</div>}
      <div className="max-w-full overflow-x-auto border-y border-border"><table className="w-full text-sm"><thead><tr className="bg-muted">{data.columns.map(c=><th key={c.key} className={`whitespace-nowrap px-3 py-2 ${c.numeric ? "text-right":"text-left"}`}><Button variant="ghost" size="sm" className="px-0" onClick={()=>{setSort({key:c.key,desc:sort?.key===c.key ? !sort.desc:false});setPage(0);}}>{c.label}<ArrowUpDown className="size-3"/></Button></th>)}</tr></thead><tbody>{rows.slice(current*size,(current+1)*size).map((r,i)=><tr key={i} className="border-t border-border hover:bg-muted/50">{data.columns.map(c=><td key={c.key} className={`px-3 py-2 ${c.numeric ? "whitespace-nowrap text-right tabular-nums":"min-w-28"}`}>{typeof r[c.key] === "number" ? Number(r[c.key]).toLocaleString("en-PK",{maximumFractionDigits:3}):r[c.key]}</td>)}</tr>)}</tbody></table>{!rows.length && <p className="p-8 text-center text-sm text-muted-foreground">{id === "serials" ? "Serial tracking is not available in recorded POS data.":"No records for these filters."}</p>}</div>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>{rows.length.toLocaleString()} records · Page {current+1} of {pages}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={current===0} onClick={()=>setPage(current-1)}>Previous</Button><Button size="sm" variant="outline" disabled={current+1>=pages} onClick={()=>setPage(current+1)}>Next</Button></div></div>
    </>}
  </div>;
}