"use client";
import { useState } from "react";
import type { FornecedorDTO, StatusManualTipoDTO } from "@/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  fornecedores: FornecedorDTO[];
  statusTipos: StatusManualTipoDTO[];
}

const INITIAL_FORM = {
  dataLanc: new Date().toISOString().split("T")[0],
  descricao: "",
  valor: "",
  tipo: "SAIDA" as "ENTRADA" | "SAIDA",
  status: "realizado",
  statusManual: "",
  dataEmissao: "",
  dataVencOriginal: "",
  dataVencPlano: "",
  dataEvento: "",
  dataPagamento: "",
  valorPrevisto: "",
  banco: "",
  fornecedor: "",
  fornecedorId: "",
  centroCusto: "",
  categoria: "",
  dre: "",
  cont: "",
  anotacao: "",
  statusExtrato: "",
};

export default function NovoLancamentoModal({ open, onClose, onCreated, fornecedores, statusTipos }: Props) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!form.dataLanc || !form.descricao.trim() || !form.valor) {
      setError("Data, descrição e valor são obrigatórios.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/lancamentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          valor: parseFloat(form.valor.replace(",", ".")),
          valorPrevisto: form.valorPrevisto ? parseFloat(form.valorPrevisto.replace(",", ".")) : null,
          statusManual: form.statusManual || null,
          fornecedorId: form.fornecedorId || null,
          dataEmissao: form.dataEmissao || null,
          dataVencOriginal: form.dataVencOriginal || null,
          dataVencPlano: form.dataVencPlano || null,
          dataEvento: form.dataEvento || null,
          dataPagamento: form.dataPagamento || null,
        }),
      });

      if (res.ok) {
        setForm(INITIAL_FORM);
        onCreated();
        onClose();
      } else {
        const err = await res.json();
        setError(err.error || "Erro ao criar lançamento");
      }
    } catch {
      setError("Erro de conexão");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-overlay" style={{ opacity: 1, pointerEvents: "all" }} onClick={onClose}>
      <div className="modal-content modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Novo Lançamento</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          {error && <div className="alert alert-error">{error}</div>}

          {/* Linha 1: Tipo + Data + Descrição */}
          <div className="form-row-3">
            <div className="form-group">
              <label>Direção *</label>
              <select value={form.tipo} onChange={e => set("tipo", e.target.value)}>
                <option value="SAIDA">SAÍDA</option>
                <option value="ENTRADA">ENTRADA</option>
              </select>
            </div>
            <div className="form-group">
              <label>Data Lanç. *</label>
              <input type="date" value={form.dataLanc} onChange={e => set("dataLanc", e.target.value)} />
            </div>
            <div className="form-group" style={{ flex: 2 }}>
              <label>Descrição *</label>
              <input type="text" value={form.descricao} onChange={e => set("descricao", e.target.value)} placeholder="Ex: Pagamento fornecedor X" />
            </div>
          </div>

          {/* Linha 2: Valores */}
          <div className="form-row-3">
            <div className="form-group">
              <label>Valor Realizado *</label>
              <input type="text" value={form.valor} onChange={e => set("valor", e.target.value)} placeholder="0,00" inputMode="decimal" />
            </div>
            <div className="form-group">
              <label>Valor Previsto</label>
              <input type="text" value={form.valorPrevisto} onChange={e => set("valorPrevisto", e.target.value)} placeholder="0,00" inputMode="decimal" />
            </div>
            <div className="form-group">
              <label>Banco</label>
              <input type="text" value={form.banco} onChange={e => set("banco", e.target.value)} placeholder="Ex: Itaú" />
            </div>
          </div>

          {/* Linha 3: Status */}
          <div className="form-row-3">
            <div className="form-group">
              <label>Status Base</label>
              <select value={form.status} onChange={e => set("status", e.target.value)}>
                <option value="realizado">Realizado</option>
                <option value="previsto">Previsto</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
            <div className="form-group">
              <label>Status Manual</label>
              <select value={form.statusManual} onChange={e => set("statusManual", e.target.value)}>
                <option value="">—</option>
                {statusTipos.map(st => <option key={st.id} value={st.codigo}>{st.nome}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Extrato</label>
              <input type="text" value={form.statusExtrato} onChange={e => set("statusExtrato", e.target.value)} placeholder="Ex: A" />
            </div>
          </div>

          {/* Linha 4: Datas */}
          <div className="form-row-3">
            <div className="form-group">
              <label>Dt. Emissão</label>
              <input type="date" value={form.dataEmissao} onChange={e => set("dataEmissao", e.target.value)} />
            </div>
            <div className="form-group">
              <label>Venc. Original</label>
              <input type="date" value={form.dataVencOriginal} onChange={e => set("dataVencOriginal", e.target.value)} />
            </div>
            <div className="form-group">
              <label>Venc. Plano</label>
              <input type="date" value={form.dataVencPlano} onChange={e => set("dataVencPlano", e.target.value)} />
            </div>
          </div>

          <div className="form-row-3">
            <div className="form-group">
              <label>Dt. Evento</label>
              <input type="date" value={form.dataEvento} onChange={e => set("dataEvento", e.target.value)} />
            </div>
            <div className="form-group">
              <label>Dt. Pagamento</label>
              <input type="date" value={form.dataPagamento} onChange={e => set("dataPagamento", e.target.value)} />
            </div>
            <div className="form-group">
              <label>Empresa</label>
              <input type="text" value={form.fornecedor} onChange={e => set("fornecedor", e.target.value)} placeholder="Nome da empresa" />
            </div>
          </div>

          {/* Linha 5: Classificação */}
          <div className="form-row-3">
            <div className="form-group">
              <label>Fantasia (n4)</label>
              <select value={form.fornecedorId} onChange={e => set("fornecedorId", e.target.value)}>
                <option value="">—</option>
                {fornecedores.map(f => <option key={f.id} value={f.id}>{f.display}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Centro de Custo</label>
              <input type="text" value={form.centroCusto} onChange={e => set("centroCusto", e.target.value)} />
            </div>
            <div className="form-group">
              <label>Categoria</label>
              <input type="text" value={form.categoria} onChange={e => set("categoria", e.target.value)} />
            </div>
          </div>

          <div className="form-row-3">
            <div className="form-group">
              <label>DRE</label>
              <input type="text" value={form.dre} onChange={e => set("dre", e.target.value)} />
            </div>
            <div className="form-group">
              <label>Cont.</label>
              <input type="text" value={form.cont} onChange={e => set("cont", e.target.value)} />
            </div>
            <div className="form-group">
              <label>Anotação</label>
              <input type="text" value={form.anotacao} onChange={e => set("anotacao", e.target.value)} placeholder="Observações..." />
            </div>
          </div>

          {/* Ações */}
          <div className="modal-form-actions">
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Salvando..." : "Criar Lançamento"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
