"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ACCESS_CATALOG as CatalogType } from "@/lib/access-catalog";
import "./access.css";

type Catalog = typeof CatalogType;
type Profile = { id: string; nome: string; descricao: string | null; ativo: boolean; permissoes: string[]; _count: { memberships: number } };
type Edit = { id: string | null; nome: string; descricao: string; ativo: boolean; permissoes: string[] };
const blank: Edit = { id: null, nome: "", descricao: "", ativo: true, permissoes: [] };

function TreeCheck({ label, keys, selected, onToggle, disabled }: { label: string; keys: string[]; selected: Set<string>; onToggle: (keys: string[], checked: boolean) => void; disabled: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const count = keys.filter(key => selected.has(key)).length;
  useEffect(() => { if (ref.current) ref.current.indeterminate = count > 0 && count < keys.length; }, [count, keys.length]);
  return <label onClick={event => event.stopPropagation()}><input ref={ref} type="checkbox" disabled={disabled} checked={keys.length > 0 && count === keys.length}
    onChange={event => onToggle(keys, event.target.checked)} />{label}</label>;
}

export default function ProfilesClient({ canManage }: { canManage: boolean }) {
  const router = useRouter();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [catalog, setCatalog] = useState<Catalog>([] as unknown as Catalog);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [query, setQuery] = useState("");
  const [treeQuery, setTreeQuery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([fetch("/api/access/profiles", { cache: "no-store" }), fetch("/api/access/catalog", { cache: "no-store" })]);
      const [p, c] = await Promise.all([a.json(), b.json()]);
      if (!a.ok) throw new Error(p.error || "Falha ao carregar perfis.");
      if (!b.ok) throw new Error(c.error || "Falha ao carregar permissões.");
      setProfiles(p); setCatalog(c); setError("");
    } catch (cause) { setError((cause as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const shown = useMemo(() => profiles.filter(p => `${p.nome} ${p.descricao ?? ""}`.toLocaleLowerCase("pt-BR")
    .includes(query.toLocaleLowerCase("pt-BR"))), [profiles, query]);

  function toggle(keys: string[], checked: boolean) {
    setEdit(current => {
      if (!current) return current;
      const next = new Set(current.permissoes);
      for (const key of keys) checked ? next.add(key) : next.delete(key);
      if (checked) for (const key of [...next]) {
        const view = `${key.slice(0, key.lastIndexOf("."))}.view`;
        if (!key.endsWith(".view")) next.add(view);
      }
      if (!checked) for (const key of [...next]) {
        const view = `${key.slice(0, key.lastIndexOf("."))}.view`;
        if (!next.has(view)) next.delete(key);
      }
      return { ...current, permissoes: [...next] };
    });
  }
  async function save() {
    if (!edit) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(edit.id ? `/api/access/profiles/${edit.id}` : "/api/access/profiles", {
        method: edit.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: edit.nome, descricao: edit.descricao, ativo: edit.ativo, permissoes: edit.permissoes }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Falha ao salvar perfil.");
      setEdit(null); await load(); router.refresh();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  const selected = new Set(edit?.permissoes ?? []);
  const q = treeQuery.toLocaleLowerCase("pt-BR");
  const tree = catalog.map(module => ({ ...module, screens: module.screens.map(screen => ({ ...screen,
    actions: screen.actions.filter(([action, label]) => !q || `${module.label} ${screen.label} ${action} ${label}`.toLocaleLowerCase("pt-BR").includes(q)),
  })).filter(screen => screen.actions.length > 0) })).filter(module => module.screens.length > 0);

  return <section className="access-page">
    <header className="access-header"><div><h1>Perfis de Acesso</h1><p>Permissões configuráveis dentro do tenant atual.</p></div>
      <Link href="/acessos" className="access-button access-button-secondary">Acessos / Usuários</Link></header>
    <div className="access-toolbar"><input aria-label="Buscar perfis" placeholder="Buscar perfil" value={query} onChange={e => setQuery(e.target.value)} />
      {canManage && <button className="access-button access-button-primary" onClick={() => { setEdit({ ...blank }); setTreeQuery(""); }}>+ Novo perfil</button>}</div>
    {error && <p role="alert" className="access-error">{error}</p>}
    <div className="access-table-wrap"><table className="access-table"><thead><tr><th>Nome</th><th>Descrição</th><th>Usuários</th><th>Status</th><th>Ações</th></tr></thead><tbody>
      {shown.map(p => <tr key={p.id}><td><strong>{p.nome}</strong></td><td>{p.descricao || "—"}</td><td>{p._count.memberships}</td>
        <td>{p.ativo ? "Ativo" : "Inativo"}</td><td className="access-actions"><button onClick={() => { setEdit({ id: p.id, nome: p.nome, descricao: p.descricao ?? "", ativo: p.ativo, permissoes: [...p.permissoes] }); setTreeQuery(""); }}>Abrir</button></td></tr>)}
      {!shown.length && <tr><td colSpan={5} className="access-empty">Nenhum perfil encontrado.</td></tr>}
    </tbody></table></div>
    {edit && <div className="access-modal-backdrop"><section className="access-modal" role="dialog" aria-modal="true" aria-labelledby="profile-modal-title">
      <h2 id="profile-modal-title">{edit.id ? "Editar Perfil de Acesso" : "Novo Perfil de Acesso"}</h2>
      <label>Nome<input disabled={!canManage} maxLength={100} value={edit.nome} onChange={e => setEdit({ ...edit, nome: e.target.value })} /></label>
      <label>Descrição<textarea disabled={!canManage} maxLength={500} value={edit.descricao} onChange={e => setEdit({ ...edit, descricao: e.target.value })} /></label>
      <label className="access-check-label"><input disabled={!canManage} type="checkbox" checked={edit.ativo} onChange={e => setEdit({ ...edit, ativo: e.target.checked })} /> Ativo</label>
      <label>Buscar na árvore<input type="search" value={treeQuery} onChange={e => setTreeQuery(e.target.value)} placeholder="Módulo, tela ou ação" /></label>
      <div className="access-tree-actions"><button type="button" onClick={() => document.querySelectorAll<HTMLDetailsElement>(".access-tree details").forEach(node => { node.open = true; })}>Expandir tudo</button>
        <button type="button" onClick={() => document.querySelectorAll<HTMLDetailsElement>(".access-tree details").forEach(node => { node.open = false; })}>Recolher tudo</button></div>
      <div className="access-tree">
        {tree.map(module => { const fullModule = catalog.find(item => item.id === module.id)!;
          const moduleKeys = fullModule.screens.flatMap(screen => screen.actions.map(([action]) => `${module.id}.${screen.id}.${action}`));
          return <details key={`${module.id}:${q}`} open={!!q}><summary><TreeCheck label={module.label} keys={moduleKeys} selected={selected} onToggle={toggle} disabled={!canManage} /></summary>
            {module.screens.map(screen => { const fullScreen = fullModule.screens.find(item => item.id === screen.id)!;
              const keys = fullScreen.actions.map(([action]) => `${module.id}.${screen.id}.${action}`);
              return <details key={`${screen.id}:${q}`} open={!!q}><summary><TreeCheck label={screen.label} keys={keys} selected={selected} onToggle={toggle} disabled={!canManage} /></summary>
                {screen.actions.map(([action, label]) => <TreeCheck key={action} label={label} keys={[`${module.id}.${screen.id}.${action}`]} selected={selected} onToggle={toggle} disabled={!canManage} />)}
              </details>; })}</details>; })}
        {!tree.length && <p className="access-hint">Nenhuma permissão encontrada.</p>}
      </div>
      {error && <p role="alert" className="access-error">{error}</p>}
      <div className="access-modal-actions"><button className="access-button access-button-secondary" onClick={() => setEdit(null)}>Cancelar</button>
        {canManage && <button className="access-button access-button-primary" disabled={busy} onClick={() => void save()}>Salvar perfil</button>}</div>
    </section></div>}
  </section>;
}
