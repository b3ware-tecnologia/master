"use client";
import Link from "next/link";
export default function WorkspaceError({ reset }: { reset: () => void }) {
  return <main className="content"><section className="card empty-state" role="alert"><span className="eyebrow">BM CRÉDITO</span><h1>Não conseguimos carregar esta área.</h1><p>Tente atualizar. Se sua sessão tiver expirado, entre novamente.</p><button onClick={reset}>Tentar novamente</button><Link href="/login">Voltar para o acesso</Link></section></main>;
}
