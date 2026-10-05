"use client";

import { counterpartyOptionLabel, type CounterpartyOption } from "@/lib/counterparty";
import SearchableSelect from "@/components/ui/SearchableSelect";

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

/** Clientes e fornecedores continuam entidades distintas; nenhuma busca cria cadastro implicitamente. */
export default function CounterpartyPicker({ options, selected, legacyLabel, onSelect, onBlur, onEscape,
  className, disabled, ariaLabel = "Fantasia (N4)" }: Props) {
  const selectedValue = selected ? `${selected.tipo}:${selected.id}` : "";
  return <SearchableSelect label={ariaLabel} value={selectedValue} className={className} disabled={disabled}
    displayValue={selected ? counterpartyOptionLabel(selected) : legacyLabel || undefined}
    options={options.map(option => ({ value: `${option.tipo}:${option.id}`, label: counterpartyOptionLabel(option) }))}
    onChange={value => { onSelect(options.find(option => `${option.tipo}:${option.id}` === value) || null); onBlur?.(); }}
    onEscape={onEscape}
    createActions={[
      { label: "+ Cadastrar novo cliente", href: "/estrutura/dimensoes-cadastrais#clientes-title" },
      { label: "+ Cadastrar novo fornecedor", href: "/estrutura/dimensoes-cadastrais#fornecedores-title" },
    ]} />;
}
