"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { applyPreference, defaultPreference, derivePalette, LIGHT_PRESET, loadPreference, PALETTE_KEYS, preferenceKey, type Palette, type Preference, type ThemeMode } from "@/lib/appearance";
import "./appearance.css";
const Context=createContext<{open:()=>void;ready:boolean}>({open:()=>{},ready:false});
export function AppearanceButton({compact=false}:{compact?:boolean}) { const theme=useContext(Context);return <button type="button" className={compact?"logout-btn theme-toggle":"appearance-trigger"} title="Aparência" aria-label="Aparência" disabled={!theme.ready} onClick={theme.open}>{compact?<span aria-hidden="true">◐</span>:"Aparência"}</button>; }
const labels:Record<keyof Palette,string>={primary:"Cor principal",accent:"Ação / accent",background:"Fundo principal",surface:"Cards e superfícies",sidebar:"Sidebar",text:"Texto principal",secondary:"Texto secundário",border:"Bordas"};
export default function AppearanceProvider({children}:{children:React.ReactNode}) {
 const pathname=usePathname(),[key,setKey]=useState<string|null>(null),[saved,setSaved]=useState<Preference>(defaultPreference()),[draft,setDraft]=useState<Preference|null>(null),[notice,setNotice]=useState("");
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{
  const controller=new AbortController();setDraft(null);setKey(null);
  if(pathname==='/login'||pathname==='/ativar-acesso'){const p=loadPreference(localStorage,null);setSaved(p);applyPreference(document.documentElement,p);}
  fetch('/api/auth/session',{signal:controller.signal,cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json()}).then(data=>{
   if(controller.signal.aborted)return;
   const user=data?.user,scope=typeof user?.id==='string'&&['identity','legacy'].includes(user.authMode)?preferenceKey(user.authMode,user.id):null;
   const p=loadPreference(localStorage,scope);setKey(scope);setSaved(p);
   if(scope)try{if(localStorage.getItem(scope)===null)localStorage.setItem(scope,JSON.stringify(p));}catch{/* Browser storage may be unavailable; preview remains usable. */}
  }).catch(()=>{if(!controller.signal.aborted){setKey(null);setSaved(defaultPreference());}});
  return()=>controller.abort();
 },[pathname]);
 useEffect(()=>{applyPreference(document.documentElement,draft??saved);},[draft,saved]);
 useEffect(()=>{const sync=(event:StorageEvent)=>{if(key&&(event.key===key||event.key===null))setSaved(loadPreference(localStorage,key));};window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);},[key]);
 useEffect(()=>{if(draft&&!dialog.current?.open)dialog.current?.showModal();else if(!draft&&dialog.current?.open)dialog.current?.close();},[draft]);
 function cancel(){setDraft(null);setNotice("");}
 const result=draft?derivePalette(draft.palette):null,invalid=draft?.mode==='custom'?result?.error:null;
 function choose(mode:ThemeMode){setDraft(p=>p?{...p,mode}:p);setNotice("");}
 function color(field:keyof Palette,value:string){setDraft(p=>p?{...p,palette:{...p.palette,[field]:value.toUpperCase()}}:p);setNotice("");}
 function save(){if(!key||!draft||invalid)return;try{localStorage.setItem(key,JSON.stringify(draft));setSaved(draft);setDraft(null);setNotice("");}catch{setNotice('Não foi possível salvar neste navegador. Verifique se o armazenamento local está permitido.');}}
 return <Context.Provider value={{open:()=>{setDraft(structuredClone(saved));setNotice("");},ready:!!key}}>{children}
  <dialog ref={dialog} className="appearance-dialog" aria-labelledby="appearance-title" onCancel={e=>{e.preventDefault();cancel();}}>
   {draft&&<><header><div><h2 id="appearance-title">Conta / Aparência</h2><p>Preferência pessoal neste navegador, independente da empresa selecionada.</p></div><button type="button" aria-label="Fechar aparência" onClick={cancel}>×</button></header>
   <div className="appearance-content">
    <div className="appearance-modes" role="group" aria-label="Modo de aparência">{([['light','Claro'],['dark','Escuro'],['custom','Personalizado']] as const).map(([mode,label])=><button key={mode} type="button" aria-pressed={draft.mode===mode} onClick={()=>choose(mode)}>{label}</button>)}</div>
    {draft.mode!=='custom'?<p>Preset oficial preservado. Para editar cores, escolha Personalizado.</p>:<>
     <div className="appearance-colors">{PALETTE_KEYS.map(field=><label key={field}><span>{labels[field]}</span><div><input type="color" aria-label={`${labels[field]} — seletor`} value={/^#[0-9a-f]{6}$/i.test(draft.palette[field])?draft.palette[field]:'#000000'} onChange={e=>color(field,e.target.value)}/><input aria-label={`${labels[field]} — HEX`} value={draft.palette[field]} maxLength={7} spellCheck={false} onChange={e=>color(field,e.target.value)}/></div></label>)}</div>
     <button type="button" onClick={()=>setDraft({...draft,palette:{...LIGHT_PRESET.palette}})}>Restaurar Personalizado</button>
     <p>Restaurar usa a base Claro. Sucesso, alerta e erro mantêm suas cores semânticas.</p>
     {invalid?<p className="appearance-error" role="alert">{invalid} A aplicação mantém uma aparência segura até a correção.</p>:result?.adjusted&&<p role="status">Textos e ações foram ajustados automaticamente para preservar o contraste.</p>}
    </>}
    <section className="appearance-preview" aria-label="Prévia de aparência"><h3>Prévia imediata</h3><p>Cards, formulário, tabela e ações usam os mesmos tokens da interface.</p><label>Campo de exemplo<input placeholder="Digite para conferir a leitura" /></label><label>Lista de exemplo<select defaultValue="Opção selecionada"><option>Opção selecionada</option><option>Outra opção</option></select></label><table><thead><tr><th>Descrição</th><th>Estado</th></tr></thead><tbody><tr><td>Exemplo de linha</td><td>Selecionada</td></tr></tbody></table><div className="appearance-semantics"><span>Sucesso</span><span>Alerta</span><span>Erro</span><span>Informação</span></div></section>
    {notice&&<p role="alert" className="appearance-error">{notice}</p>}
   </div><footer><button type="button" onClick={cancel}>Cancelar</button><button type="button" className="appearance-save" disabled={!!invalid||!key} onClick={save}>Salvar aparência</button></footer></>}
  </dialog>
 </Context.Provider>;
}
