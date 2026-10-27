"use client";
import { useState, type InputHTMLAttributes } from "react";
import "./password-input.css";

export default function PasswordInput({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { id: string; label: string }) {
  const [visible, setVisible] = useState(false);
  return <div className="password-field"><label htmlFor={props.id}>{label}</label><div className="password-input-wrap">
    <input {...props} type={visible ? "text" : "password"} />
    <button type="button" className="password-toggle" aria-label={`${visible ? "Ocultar" : "Mostrar"} ${label.toLocaleLowerCase("pt-BR")}`}
      aria-controls={props.id} aria-pressed={visible} title={visible ? "Ocultar senha" : "Mostrar senha"}
      disabled={props.disabled} onClick={() => setVisible(value => !value)}>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>{visible && <path d="m3 3 18 18"/>}
      </svg>
    </button>
  </div></div>;
}
