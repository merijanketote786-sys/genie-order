import {test} from "node:test";
import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
import ts from "typescript";
import {z} from "zod";
import * as catalog from "./report-catalog";
import * as engine from "./report-engine";

function load(){
 const code=ts.transpileModule(readFileSync(new URL("./reports.functions.ts",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports:any={};const builder:any={middleware:()=>builder,inputValidator:()=>builder,handler:(fn:any)=>fn};
 const req=(id:string)=>id === "@tanstack/react-start" ? {createServerFn:()=>builder}:id.includes("auth-middleware") ? {requireSupabaseAuth:{}}:id === "zod" ? {z}:id === "./report-catalog" ? catalog:id === "./report-engine" ? engine:{};
 new Function("require","exports",code)(req,exports);return exports;
}
const input={id:"sales",from:"2026-10-01",to:"2026-10-31",tzOffsetMin:-300};
test("report access is rejected server-side before reading records",async()=>{
 let reads=0;const sb={rpc:async()=>({data:false}),from:()=>{reads++;}};
 await assert.rejects(load().getDetailedReport({data:input,context:{supabase:sb}}),/permission/);assert.equal(reads,0);
});
test("profit report requires profit permission even with reports permission",async()=>{
 const calls:string[]=[];const sb={rpc:async(_n:string,a:any)=>{calls.push(a._perm);return {data:a._perm === "view_reports"};},from:()=>{throw Error("Should not read");}};
 await assert.rejects(load().getDetailedReport({data:{...input,id:"bill-profit"},context:{supabase:sb}}),/permission/);assert.deepEqual(calls,["view_reports","view_profit"]);
});
test("date validation rejects inverted and impossible dates",()=>{
 const schema=load().reportInput;assert.equal(schema.safeParse({...input,from:"2026-11-01"}).success,false);assert.equal(schema.safeParse({...input,from:"2026-02-30"}).success,false);assert.equal(schema.safeParse(input).success,true);
});
test("pagination reads more than 1000 stock rows and scopes every read to the business",async()=>{
 const scopes:string[]=[];const products=Array.from({length:1001},(_,i)=>({id:String(i),name:`Item ${i}`,scope:"pos",is_active:true,stock:1,purchase_price:10}));
 const sb={rpc:async(n:string)=>({data:n === "current_workspace" ? "firm":true}),from:(table:string)=>{
  let rows=table === "products" ? products:[];const q:any={select:()=>q,eq:(k:string,v:any)=>{if(k === "workspace_id")scopes.push(v);return q;},order:()=>q,range:async(a:number,b:number)=>({data:rows.slice(a,b+1)}),lt:()=>q,lte:()=>q};return q;
 }};
 const r=await load().getDetailedReport({data:{...input,id:"stock"},context:{supabase:sb}});assert.equal(r.rows.length,1001);assert.equal(r.totals.find((t:any)=>t.label === "Cost value").value,10010);assert.ok(scopes.length>=7);assert.ok(scopes.every(v=>v === "firm"));
});