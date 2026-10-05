"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./searchable-select.css";

export type SearchOption = { value: string; label: string; searchText?: string };
export type CreateAction = { label: string; href: string };

type Props = {
  value: string;
  options: SearchOption[];
  renderOption?: (option: SearchOption) => ReactNode;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  emptyLabel?: string;
  displayValue?: string;
  createActions?: CreateAction[];
  loading?: boolean;
  error?: string;
  disabled?: boolean;
  className?: string;
  onEscape?: () => void;
  onReturnFocus?: () => void;
};

export default function SearchableSelect({ value, options, renderOption, onChange, label, placeholder = "Pesquisar código ou nome...",
  emptyLabel = "—", displayValue, createActions = [], loading, error, disabled, className, onEscape, onReturnFocus }: Props) {
  const id = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState({ top: 0, left: 0, width: 280, maxHeight: 300 });
  const selected = options.find(option => option.value === value);
  const shown = displayValue ?? selected?.label ?? emptyLabel;
  const filtered = useMemo(() => options.filter(option =>
    `${option.label} ${option.searchText ?? ""}`.toLocaleLowerCase("pt-BR").includes(query.trim().toLocaleLowerCase("pt-BR"))), [options, query]);

  const position = () => {
    const box = buttonRef.current?.getBoundingClientRect();
    if (!box) return;
    const width = Math.min(Math.max(box.width, 280), window.innerWidth - 16);
    const maxHeight = Math.min(320, Math.max(180, window.innerHeight - 24));
    const below = window.innerHeight - box.bottom;
    setRect({ top: below >= Math.min(maxHeight, 220) ? box.bottom + 4 : Math.max(8, box.top - maxHeight - 4),
      left: Math.min(box.left, window.innerWidth - width - 8), width, maxHeight });
  };
  const show = () => { if (disabled) return; setQuery(""); setActive(0); position(); setOpen(true); };
  const close = (restoreFocus = false) => { setOpen(false); if (restoreFocus) requestAnimationFrame(() => buttonRef.current?.focus()); };
  const choose = (next: string) => { onChange(next); close(true); };

  useEffect(() => { if (open) searchRef.current?.focus(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node) && !buttonRef.current?.contains(event.target as Node)) close();
    };
    const update = () => position();
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => { document.removeEventListener("pointerdown", outside); window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true); };
  }, [open]);
  useEffect(() => {
    if (!onReturnFocus) return;
    window.addEventListener("focus", onReturnFocus);
    return () => window.removeEventListener("focus", onReturnFocus);
  }, [onReturnFocus]);
  useEffect(() => { setActive(0); }, [query, options]);
  useEffect(() => {
    if (open) panelRef.current?.querySelector(`[data-option-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const keyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); }
    if (event.key === "ArrowDown") { event.preventDefault(); setActive(current => Math.min(current + 1, Math.max(0, filtered.length - 1))); }
    if (event.key === "ArrowUp") { event.preventDefault(); setActive(current => Math.max(current - 1, 0)); }
    if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); if (filtered[active]) choose(filtered[active].value); }
  };

  return <>
    <button ref={buttonRef} type="button" className={`searchable-select-trigger ${className ?? ""}`} aria-label={label}
      aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? id : undefined} disabled={disabled}
      onClick={() => open ? close() : show()} onKeyDown={event => {
        if (!open && (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ")) { event.preventDefault(); show(); }
        else if (event.key === "Escape") { event.stopPropagation(); onEscape?.(); }
      }}><span>{shown}</span><span aria-hidden="true">⌄</span></button>
    {open && createPortal(<div ref={panelRef} className="searchable-select-panel" id={id}
      style={{ top: rect.top, left: rect.left, width: rect.width, maxHeight: rect.maxHeight }} onKeyDown={keyDown}>
      <div className="searchable-select-search"><span aria-hidden="true">⌕</span><input ref={searchRef} type="search"
        aria-label={`Pesquisar ${label}`} aria-controls={`${id}-options`} aria-activedescendant={filtered[active] ? `${id}-option-${active}` : undefined}
        placeholder={placeholder} value={query} onChange={event => setQuery(event.target.value)} /></div>
      <div className="searchable-select-options" id={`${id}-options`} role="listbox" aria-label={label}>
        {loading ? <div className="searchable-select-message" role="status">Carregando...</div> :
          error ? <div className="searchable-select-message" role="alert">{error}</div> : <>
          {!query && <button type="button" role="option" aria-selected={!value} className={!value ? "selected" : ""}
            onClick={() => choose("")}>{emptyLabel}</button>}
          {filtered.length ? filtered.map((option, index) => <button type="button" role="option" key={option.value}
            id={`${id}-option-${index}`} data-option-index={index}
            aria-selected={option.value === value} className={`${option.value === value ? "selected" : ""} ${active === index ? "active" : ""}`}
            onMouseEnter={() => setActive(index)} onClick={() => choose(option.value)}>{renderOption?.(option) ?? option.label}</button>) :
            <div className="searchable-select-message">Nenhum resultado encontrado.</div>}
        </>}
      </div>
      {createActions.length > 0 && <div className="searchable-select-footer">{createActions.map(action =>
        <a key={`${action.href}:${action.label}`} href={action.href} target="_blank" rel="noopener noreferrer"
          onClick={() => close()}>{action.label}</a>)}</div>}
    </div>, document.body)}
  </>;
}
