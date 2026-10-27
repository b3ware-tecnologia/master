"use client";
import {useRouter} from "next/navigation";
import {useEffect,useTransition} from "react";
export function RefreshWorkspace(){const router=useRouter();const [busy,start]=useTransition();useEffect(()=>{const timer=setInterval(()=>{if(!document.hidden)router.refresh();},30000);return()=>clearInterval(timer);},[router]);return <button disabled={busy} onClick={()=>start(()=>router.refresh())}>{busy?"Atualizando…":"Atualizar indicadores"}</button>;}
