"use client";

import { useEffect, useId, useState } from "react";
import { counterpartyOptionLabel, type CounterpartyOption } from "@/lib/counterparty";

type Props = {
  options: CounterpartyOption[];
  selected: CounterpartyOption | null;
  legacyLabel?: string | null;
  onSelect: (option: CounterpartyOption | null) => void;
  onBlur?: () => void;
  onEnter?: () => void;
  onEscape?: () => void;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
};

/** Searchable datalist whose value only commits after an exact registered option is selected. */
export default function CounterpartyPicker({ options, selected, legacyLabel, onSelect, onBlur, onEnter, onEscape, className, disabled, ariaLabel = "Fantasia (N4)" }: Props) {
  const listId = useId();
  const shown = selected ? counterpartyOptionLabel(selected) : (legacyLabel || "");
  const [input, setInput] = useState(shown);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => { setInput(shown); setInvalid(false); }, [shown]);

  const choose = (value: string) => {
    const match = options.find(option => counterpartyOptionLabel(option) === value);
    if (match) { onSelect(match); setInvalid(false); return; }
    if (!value.trim()) { onSelect(null); setInvalid(false); return; }
    setInvalid(true);
  };

  return <>
    <input className={className} aria-label={ariaLabel} aria-invalid={invalid} aria-describedby={invalid ? `${listId}-error` : undefined}
      list={listId} value={input} disabled={disabled} placeholder="Busque código ou nome..."
      onChange={event => { const value = event.target.value; setInput(value); choose(value); }}
      onBlur={() => { if (invalid) setInput(shown); setInvalid(false); onBlur?.(); }}
      onKeyDown={event => {
        if (event.key === "Escape") { setInput(shown); setInvalid(false); onEscape?.(); }
        if (event.key === "Enter") {
          if (invalid || onEnter) { event.preventDefault(); event.stopPropagation(); }
          if (!invalid) onEnter?.();
        }
      }} />
    <datalist id={listId}>{options.map(option => <option key={`${option.tipo}-${option.id}`} value={counterpartyOptionLabel(option)} />)}</datalist>
    {invalid && <span id={`${listId}-error`} style={{ display: "block", color: "var(--danger)", fontSize: 11 }}>Selecione um Cliente ou Fornecedor da lista.</span>}
  </>;
}
