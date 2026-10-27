"use client";
import {useState} from "react";
import {CRMSetupPanel} from "@/components/crm-setup";
import {CadenceEditor} from "@/components/commercial-workspace";
type Data=Awaited<ReturnType<typeof import("@/services/commercial-service").listCommercial>>;
export function NumberCadenceSettings({connection}:{connection:Data["connections"][number]}){const [busy,setBusy]=useState(false);const [notice,setNotice]=useState("");return <details><summary>Limites e horários deste número</summary><CadenceEditor connection={connection} busy={busy} act={async(operation,input,id)=>{setBusy(true);try{const r=await fetch("/api/commercial",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({operation,input,id})});const v=await r.json();setNotice(r.ok?"Limites registrados.":v.error);}catch{setNotice("Não foi possível salvar os limites.");}finally{setBusy(false);}}}/>{notice&&<p role="status">{notice}</p>}</details>;}
export function TeamSettings({tenantId}:{tenantId:string}){const [revision,setRevision]=useState(0);return <CRMSetupPanel key={revision} base="/api" query={`?tenantId=${tenantId}`} onChanged={()=>setRevision(v=>v+1)}/>;}
