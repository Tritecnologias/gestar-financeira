"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import "./dimensoes-cadastrais.css";

type Section = "fornecedores" | "clientes";
type Item = { id: string; codigo: string; nome: string; email?: string | null; telefone?: string | null; documento?: string | null; endereco?: string | null };
type Draft = { codigo: string; nome: string; documento: string; email: string; telefone: string; endereco: string };
type Modal = { section: Section; id: string | null };
const emptyDraft: Draft = { codigo: "", nome: "", documento: "", email: "", telefone: "", endereco: "" };

export default function DimensoesCadastraisPage() {
  const [fornecedores, setFornecedores] = useState<Item[]>([]);
  const [clientes, setClientes] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busca, setBusca] = useState("");
  const [modal, setModal] = useState<Modal | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [modalError, setModalError] = useState("");
  const codeRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [supplierResponse, clientResponse] = await Promise.all([
        fetch("/api/fornecedores?ativo=true", { cache: "no-store" }),
        fetch("/api/clientes", { cache: "no-store" }),
      ]);
      if (!supplierResponse.ok || !clientResponse.ok) throw new Error("Não foi possível carregar os cadastros. Tente acessar a página novamente.");
      const [suppliers, customers] = await Promise.all([supplierResponse.json(), clientResponse.json()]);
      if (!Array.isArray(suppliers) || !Array.isArray(customers)) throw new Error("Resposta inesperada ao carregar os cadastros.");
      setFornecedores(suppliers);
      setClientes(customers);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erro ao carregar os cadastros.");
      return false;
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);
  useEffect(() => { if (modal) codeRef.current?.focus(); }, [modal]);

  const request = async (url: string, method: "POST" | "PUT" | "DELETE", data?: Partial<Draft>) => {
    const response = await fetch(url, {
      method,
      headers: data ? { "Content-Type": "application/json" } : undefined,
      body: data ? JSON.stringify(data) : undefined,
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(typeof payload?.error === "string" ? payload.error : "Não foi possível concluir a operação.");
    }
  };

  const openModal = (section: Section, item?: Item) => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDraft(item ? {
      codigo: item.codigo, nome: item.nome, documento: item.documento ?? "",
      email: item.email ?? "", telefone: item.telefone ?? "", endereco: item.endereco ?? "",
    } : { ...emptyDraft });
    setModal({ section, id: item?.id ?? null });
    setModalError(""); setNotice("");
  };

  const closeModal = () => {
    if (saving) return;
    setModal(null); setModalError("");
    window.requestAnimationFrame(() => returnFocusRef.current?.focus());
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!modal || saving) return;
    if (!draft.codigo.trim() || !draft.nome.trim()) { setModalError("Código e nome são obrigatórios."); return; }
    const section = modal.section;
    const editing = modal.id !== null;
    const payload = section === "fornecedores"
      ? { codigo: draft.codigo, nome: draft.nome }
      : { ...draft };
    setSaving(true); setModalError("");
    try {
      await request(`/api/${section}${modal.id ? `/${modal.id}` : ""}`, editing ? "PUT" : "POST", payload);
      setModal(null);
      window.requestAnimationFrame(() => returnFocusRef.current?.focus());
      if (await loadData()) setNotice(`${section === "fornecedores" ? "Fornecedor" : "Cliente"} ${editing ? "atualizado" : "adicionado"}.`);
    } catch (cause) {
      setModalError(cause instanceof Error ? cause.message : "Não foi possível salvar o cadastro.");
    } finally { setSaving(false); }
  };

  const deactivate = async (section: Section, item: Item) => {
    if (!window.confirm(`Desativar ${section === "fornecedores" ? "fornecedor" : "cliente"} ${item.nome}?`)) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await request(`/api/${section}/${item.id}`, "DELETE");
      if (await loadData()) setNotice(section === "fornecedores" ? "Fornecedor desativado." : "Cliente desativado.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível desativar o cadastro.");
    } finally { setSaving(false); }
  };

  const query = busca.trim().toLocaleLowerCase("pt-BR");
  const filter = (items: Item[]) => items.filter(item => !query || item.codigo.toLocaleLowerCase("pt-BR").includes(query) || item.nome.toLocaleLowerCase("pt-BR").includes(query));
  const filteredSuppliers = filter(fornecedores);
  const filteredCustomers = filter(clientes);
  const count = (visible: number, total: number) => loading ? "Carregando..." : query ? `${visible} de ${total} ${total === 1 ? "ativo" : "ativos"}` : `${total} ${total === 1 ? "ativo" : "ativos"}`;

  const renderRows = (section: Section, items: Item[]) => items.map(item => <tr key={item.id}>
    <td className="registration-code">{item.codigo}</td><td>{item.nome}</td>
    <td className="registration-actions"><button type="button" className="action-btn" aria-label={`Editar ${item.nome}`} title="Editar" disabled={saving} onClick={() => openModal(section, item)}>✎</button><button type="button" className="action-btn registration-danger" aria-label={`Desativar ${item.nome}`} title="Desativar" disabled={saving} onClick={() => void deactivate(section, item)}>✕</button></td>
  </tr>);

  const renderSection = (section: Section, title: string, items: Item[], total: number) => <section className="registration-card" aria-labelledby={`${section}-title`}>
    <div className="registration-card-heading"><div><h2 id={`${section}-title`}>{title}</h2><span>{count(items.length, total)}</span></div><button type="button" className="btn btn-primary btn-sm registration-new" onClick={() => openModal(section)}>+ Novo {section === "fornecedores" ? "Fornecedor" : "Cliente"}</button></div>
    <div className="registration-table-scroll"><table className="data-table registration-table"><thead><tr><th>Código</th><th>Nome</th><th>Ações</th></tr></thead><tbody>
      {loading ? <tr><td colSpan={3} className="registration-empty" role="status">Carregando {title.toLowerCase()}...</td></tr> : <>{renderRows(section, items)}{items.length === 0 && <tr><td colSpan={3} className="registration-empty">{query ? `Nenhum ${section === "fornecedores" ? "fornecedor" : "cliente"} encontrado para a busca.` : `Nenhum ${section === "fornecedores" ? "fornecedor" : "cliente"} ativo cadastrado.`}</td></tr>}</>}
    </tbody></table></div>
  </section>;

  const updateDraft = (key: keyof Draft, value: string) => setDraft(current => ({ ...current, [key]: value }));
  const modalTitle = modal?.section === "fornecedores" ? "Cadastro de Fornecedor" : "Cadastro de Cliente";
  const onModalKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") { event.stopPropagation(); closeModal(); }
  };

  return <div className="registration-page">
    <header className="topbar"><div><h1 className="page-title">Dimensões Cadastrais</h1><p className="page-sub">Estrutura Empresa — Fornecedores e Clientes</p></div></header>
    <main className="registration-content">
      <div className="registration-toolbar">
        <label className="registration-search"><span className="registration-visually-hidden">Buscar por código ou nome</span><input className="filter-input" value={busca} onChange={event => setBusca(event.target.value)} placeholder="Buscar por código ou nome" /></label>
        <div className="registration-totals"><span>Fornecedores: {count(filteredSuppliers.length, fornecedores.length)}</span><span>Clientes: {count(filteredCustomers.length, clientes.length)}</span></div>
      </div>
      {error && <div className="alert alert-error registration-message" role="alert">{error}</div>}
      {notice && <div className="registration-message registration-success" role="status">{notice}</div>}
      <div className="registration-grid">
        {renderSection("fornecedores", "Fornecedores", filteredSuppliers, fornecedores.length)}
        {renderSection("clientes", "Clientes", filteredCustomers, clientes.length)}
      </div>
    </main>
    {modal && <div className="modal-overlay open registration-modal-overlay" onClick={closeModal}>
      <div className="modal-content registration-modal" role="dialog" aria-modal="true" aria-labelledby="registration-modal-title" onClick={event => event.stopPropagation()} onKeyDown={onModalKeyDown}>
        <div className="modal-header"><h2 id="registration-modal-title">{modalTitle}</h2><button type="button" className="modal-close" aria-label="Fechar cadastro" disabled={saving} onClick={closeModal}>✕</button></div>
        <form className="registration-modal-form" onSubmit={event => void save(event)} noValidate>
          <div className="registration-modal-body">
            <p className="registration-modal-context">{modal.id ? "Editar cadastro existente" : "Novo cadastro"}</p>
            {modalError && <div className="alert alert-error" role="alert">{modalError}</div>}
            <div className="registration-modal-fields">
              <label>Código<input ref={codeRef} value={draft.codigo} onChange={event => updateDraft("codigo", event.target.value)} disabled={saving} /></label>
              <label>Nome<input value={draft.nome} onChange={event => updateDraft("nome", event.target.value)} disabled={saving} /></label>
              {modal.section === "clientes" && <>
                <label>Documento<input value={draft.documento} onChange={event => updateDraft("documento", event.target.value)} disabled={saving} /></label>
                <label>Email<input type="email" value={draft.email} onChange={event => updateDraft("email", event.target.value)} disabled={saving} /></label>
                <label>Telefone<input value={draft.telefone} onChange={event => updateDraft("telefone", event.target.value)} disabled={saving} /></label>
                <label className="registration-address">Endereço<textarea rows={3} value={draft.endereco} onChange={event => updateDraft("endereco", event.target.value)} disabled={saving} /></label>
              </>}
            </div>
          </div>
          <div className="registration-modal-footer"><button type="button" className="btn btn-secondary" disabled={saving} onClick={closeModal}>Cancelar</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</button></div>
        </form>
      </div>
    </div>}
  </div>;
}
