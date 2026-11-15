"use client";

import { useState, type FormEvent } from "react";
import { Bot, LoaderCircle, Send, X } from "lucide-react";

type Message = { role: "user" | "assistant"; content: string };

export default function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = draft.trim();
    if (!question || busy) return;
    const next = [...messages, { role: "user" as const, content: question }].slice(-8);
    setMessages(next);
    setDraft("");
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No fue posible consultar el asistente.");
      setMessages([...next, { role: "assistant", content: payload.answer }].slice(-8));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible consultar el asistente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="saros-assistant" aria-label="Asistente territorial SAROS">
      {open && (
        <section className="saros-assistant-panel" aria-label="Conversación con SAROS">
          <header className="saros-assistant-head">
            <span className="saros-assistant-avatar"><Bot size={17} /></span>
            <span><strong>Asistente SAROS</strong><small>Responde con datos disponibles</small></span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar asistente"><X size={17} /></button>
          </header>
          <div className="saros-assistant-messages" aria-live="polite">
            {messages.length === 0 && <p className="saros-assistant-welcome">Pregunta por observaciones, pronósticos guardados o afectaciones históricas. Si no hay evidencia en la base, te lo diré.</p>}
            {messages.map((message, index) => (
              <p className={`saros-assistant-message ${message.role}`} key={`${index}-${message.role}`}>{message.content}</p>
            ))}
            {busy && <p className="saros-assistant-pending"><LoaderCircle size={14} /> Consultando datos y modelo…</p>}
            {error && <p className="saros-assistant-error">{error === "assistant_not_configured" ? "El asistente aún no tiene Groq configurado en el servidor." : error}</p>}
          </div>
          <form className="saros-assistant-form" onSubmit={submit}>
            <textarea aria-label="Tu pregunta" placeholder="¿Qué evidencia hay en esta región?" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={1500} rows={2} />
            <button type="submit" aria-label="Enviar pregunta" disabled={busy || !draft.trim()}><Send size={16} /></button>
          </form>
          <p className="saros-assistant-note">Apoyo informativo; no sustituye alertas ni instrucciones oficiales.</p>
        </section>
      )}
      <button className="saros-assistant-toggle" type="button" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Bot size={18} /><span>Preguntar a SAROS</span>
      </button>
    </aside>
  );
}
