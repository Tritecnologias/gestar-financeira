"use client";
import { useCallback, useEffect, useRef, useState, type InputHTMLAttributes } from "react";
import "./password-input.css";

export default function PasswordInput({ label, sequential = false, holdToReveal = false, ...props }: InputHTMLAttributes<HTMLInputElement> & { id: string; label: string; sequential?: boolean; holdToReveal?: boolean }) {
  const [visible, setVisible] = useState(false);
  const interaction = useRef<"pointer" | "keyboard" | null>(null);
  const hide = useCallback(() => { interaction.current = null; setVisible(false); }, []);
  const shown = visible && (!holdToReveal || !props.disabled);
  const show = (source: "pointer" | "keyboard") => { if (!props.disabled) { interaction.current = source; setVisible(true); } };
  useEffect(() => {
    if (!holdToReveal) return;
    const pointerEnd = () => { if (interaction.current === "pointer") hide(); };
    const keyEnd = () => { if (interaction.current === "keyboard") hide(); };
    const visibility = () => { if (document.hidden) hide(); };
    window.addEventListener("pointerup", pointerEnd, true); window.addEventListener("pointercancel", pointerEnd, true);
    window.addEventListener("keyup", keyEnd, true); window.addEventListener("blur", hide);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("pointerup", pointerEnd, true); window.removeEventListener("pointercancel", pointerEnd, true);
      window.removeEventListener("keyup", keyEnd, true); window.removeEventListener("blur", hide);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [holdToReveal, hide]);
  return <div className="password-field"><label htmlFor={props.id}>{label}</label><div className="password-input-wrap">
    <input {...props} type={shown ? "text" : "password"} onKeyDown={event => {
      props.onKeyDown?.(event);
      if (sequential && !props.disabled && !event.defaultPrevented && event.altKey && event.shiftKey && event.key.toLowerCase() === "v") {
        event.preventDefault();
        if (holdToReveal) { if (!event.repeat) show("keyboard"); } else setVisible(value => !value);
      }
    }} onKeyUp={event => { props.onKeyUp?.(event); if (holdToReveal && interaction.current === "keyboard") hide(); }}
      onBlur={event => { props.onBlur?.(event); if (holdToReveal) hide(); }} />
    <button type="button" className="password-toggle" data-reveal={holdToReveal ? "hold" : undefined}
      aria-label={holdToReveal ? "Mostrar senha enquanto pressionado" : shown ? "Ocultar senha" : "Mostrar senha"}
      aria-controls={props.id} aria-pressed={shown} title={holdToReveal ? "Mantenha pressionado para mostrar a senha" : shown ? "Ocultar senha" : "Mostrar senha"}
      tabIndex={sequential ? -1 : undefined} aria-keyshortcuts={sequential ? "Alt+Shift+V" : undefined}
      disabled={props.disabled}
      onPointerDown={event => {
        if (!holdToReveal || props.disabled || event.button !== 0 || !event.isPrimary) return;
        event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); show("pointer");
      }}
      onPointerMove={event => {
        if (!holdToReveal || interaction.current !== "pointer") return;
        const box = event.currentTarget.getBoundingClientRect();
        if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) hide();
      }}
      onPointerUp={holdToReveal ? hide : undefined} onPointerCancel={holdToReveal ? hide : undefined}
      onLostPointerCapture={holdToReveal ? hide : undefined} onPointerLeave={holdToReveal ? hide : undefined}
      onBlur={holdToReveal ? hide : undefined}
      onKeyDown={event => { if (holdToReveal && [" ", "Enter"].includes(event.key)) { event.preventDefault(); if (!event.repeat) show("keyboard"); } }}
      onKeyUp={event => { if (holdToReveal && [" ", "Enter"].includes(event.key)) { event.preventDefault(); hide(); } }}
      onContextMenu={event => { if (holdToReveal) event.preventDefault(); }}
      onClick={event => { if (holdToReveal) { event.preventDefault(); hide(); } else setVisible(value => !value); }}>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>{shown && <path d="m3 3 18 18"/>}
      </svg>
    </button>
  </div>{sequential && <span className="password-visibility-status" role="status">{shown ? "Senha visível" : "Senha oculta"}</span>}</div>;
}
