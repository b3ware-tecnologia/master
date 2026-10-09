"use client";
import { useEffect, useState } from "react";
export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem("bm-theme"); } catch { /* Private storage may be disabled. */ }
    const selected = saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    setDark(selected); document.documentElement.dataset.theme = selected ? "dark" : "light";
  }, []);
  function toggle() {
    const selected = !dark; setDark(selected); document.documentElement.dataset.theme = selected ? "dark" : "light";
    try { localStorage.setItem("bm-theme", selected ? "dark" : "light"); } catch { /* Session preference still works. */ }
  }
  return <button className="theme-toggle" onClick={toggle} aria-label={dark ? "Usar tema claro" : "Usar tema escuro"} title={dark ? "Usar tema claro" : "Usar tema escuro"} aria-pressed={dark}>
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">{dark ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></> : <path d="M20 15.5A9 9 0 0 1 8.5 4 9 9 0 1 0 20 15.5Z" />}</svg>
  </button>;
}
