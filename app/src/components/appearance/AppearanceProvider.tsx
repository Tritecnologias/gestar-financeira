"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { applyPreference, defaultPreference, derivePalette, loadPreference, PALETTE_KEYS, preferenceKey, toGuided, guidePreference, refinePreference, resetGuided, guideLabel, NEUTRAL_LABELS, type Guide, type GuidedPreference, type Palette, type ThemeMode } from "@/lib/appearance";
import "./appearance.css";
const Context=createContext<{open:()=>void;ready:boolean}>({open:()=>{},ready:false});
export function AppearanceButton({compact=false}:{compact?:boolean}) { const theme=useContext(Context);return <button type="button" className={compact?"logout-btn theme-toggle":"appearance-trigger"} title="Aparência" aria-label="Aparência" disabled={!theme.ready} onClick={theme.open}>{compact?<span aria-hidden="true">◐</span>:"Aparência"}</button>; }
const labels:Record<keyof Palette,string>={primary:"Cor principal",accent:"Ação / accent",background:"Fundo principal",surface:"Cards e superfícies",sidebar:"Sidebar",text:"Texto principal",secondary:"Texto secundário",border:"Bordas"};
export default function AppearanceProvider({children}:{children:React.ReactNode}) {
 const pathname=usePathname(),[key,setKey]=useState<string|null>(null),[saved,setSaved]=useState<GuidedPreference>(toGuided(defaultPreference())),[draft,setDraft]=useState<GuidedPreference|null>(null),[notice,setNotice]=useState("");
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{
  const controller=new AbortController();setDraft(null);setKey(null);
  if(pathname==='/login'||pathname==='/ativar-acesso'){const p=toGuided(loadPreference(localStorage,null));setSaved(p);applyPreference(document.documentElement,p);}
  fetch('/api/auth/session',{signal:controller.signal,cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json()}).then(data=>{
   if(controller.signal.aborted)return;
   const user=data?.user,scope=typeof user?.id==='string'&&['identity','legacy'].includes(user.authMode)?preferenceKey(user.authMode,user.id):null;
   const p=toGuided(loadPreference(localStorage,scope));setKey(scope);setSaved(p);
   if(scope)try{if(localStorage.getItem(scope)===null)localStorage.setItem(scope,JSON.stringify(p));}catch{/* Browser storage may be unavailable; preview remains usable. */}
  }).catch(()=>{if(!controller.signal.aborted){setKey(null);setSaved(toGuided(defaultPreference()));}});
  return()=>controller.abort();
 },[pathname]);
 useEffect(()=>{applyPreference(document.documentElement,draft??saved);},[draft,saved]);
 useEffect(()=>{const sync=(event:StorageEvent)=>{if(key&&(event.key===key||event.key===null))setSaved(toGuided(loadPreference(localStorage,key)));};window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);},[key]);
 useEffect(()=>{if(draft&&!dialog.current?.open)dialog.current?.showModal();else if(!draft&&dialog.current?.open)dialog.current?.close();},[draft]);
 function cancel(){setDraft(null);setNotice("");}
 const result=draft?derivePalette(draft.palette):null,invalid=draft?.mode==='custom'?result?.error:null;
 function choose(mode:ThemeMode){setDraft(p=>p?{...p,mode}:p);setNotice("");}
 function color(field:keyof Palette,value:string){setDraft(p=>p?refinePreference(p,field,value):p);setNotice("");}
 function guide(change:Partial<Guide>){setDraft(p=>p?guidePreference(p,change):p);setNotice("");}
 function save(){
  if(!key||!draft||invalid)return;
  // Switching to an official preset must not persist an unfinished custom palette.
  const next=result?.error?{...toGuided(saved),mode:draft.mode}:draft;
  try{localStorage.setItem(key,JSON.stringify(next));setSaved(next);setDraft(null);setNotice("");}
  catch{setNotice('Não foi possível salvar neste navegador. Verifique se o armazenamento local está permitido.');}
 }
 return <Context.Provider value={{open:()=>{setDraft(structuredClone(saved));setNotice("");},ready:!!key}}>{children}
  <dialog ref={dialog} className="appearance-dialog" aria-labelledby="appearance-title" onCancel={e=>{e.preventDefault();cancel();}}>
   {draft&&<><header><div><h2 id="appearance-title">Conta / Aparência</h2><p>Preferência pessoal neste navegador, independente da empresa selecionada.</p></div><button type="button" aria-label="Fechar aparência" onClick={cancel}>×</button></header>
   <div className="appearance-content">
    <div className="appearance-modes" role="group" aria-label="Modo de aparência">{([['light','Claro'],['dark','Escuro'],['custom','Personalizado']] as const).map(([mode,label])=><button key={mode} type="button" aria-pressed={draft.mode===mode} onClick={()=>choose(mode)}>{label}</button>)}</div>
    {draft.mode!=='custom'?<p>Preset oficial preservado. Para editar cores, escolha Personalizado.</p>:<>
     {draft.guide.advanced&&<p className="appearance-manual-notice" role="status">Cores manuais preservadas. Alterar intensidade ou cor geral substituirá os ajustes manuais pelas cores da base selecionada.</p>}
     <section className="appearance-guided-block" aria-labelledby="appearance-intensity-title">
      <div className="appearance-block-heading"><h3 id="appearance-intensity-title">Intensidade da paleta</h3><output htmlFor="appearance-intensity">{draft.guide.intensity}%</output></div>
      <p id="appearance-intensity-help">Ajuste o clima do Personalizado. O centro mantém o equilíbrio original.</p>
      <input id="appearance-intensity" type="range" min="0" max="100" step="1" aria-label="Intensidade da paleta" aria-describedby="appearance-intensity-help" value={draft.guide.intensity} onChange={e=>guide({intensity:Number(e.target.value)})}/>
      <div className="appearance-range-labels" aria-hidden="true"><span>Suave</span><span>Equilibrado</span><span>Marcante</span></div>
      <button type="button" className="appearance-text-action" onClick={()=>guide({intensity:50})}>Voltar ao equilíbrio</button>
     </section>
     <section className="appearance-guided-block" aria-labelledby="appearance-family-title">
      <div className="appearance-block-heading"><h3 id="appearance-family-title">Cor geral da paleta</h3><span>{guideLabel(draft.guide)}</span></div>
      <p>Escolha uma família de cor. Refine os detalhes em Ajustes avançados, se desejar.</p>
      <div className="appearance-neutral-options" role="group" aria-label="Neutros"><span className="appearance-options-label">Neutros</span>{(Object.entries(NEUTRAL_LABELS) as [Guide['neutral'],string][]).map(([neutral,label])=><button type="button" key={neutral} aria-pressed={draft.guide.family==='neutral'&&draft.guide.neutral===neutral} onClick={()=>guide({family:'neutral',neutral})}>{label}</button>)}</div>
      <label className="appearance-options-label" htmlFor="appearance-hue">Cores</label>
      <input className="appearance-hue" id="appearance-hue" type="range" min="0" max="330" step="1" aria-label="Família de cor" aria-valuetext={draft.guide.family==='hue'?guideLabel(draft.guide):'Escolha uma cor na barra'} value={draft.guide.hue} onPointerDown={()=>{if(draft.guide.family!=='hue')guide({family:'hue'});}} onKeyDown={e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key)&&draft.guide.family!=='hue')guide({family:'hue'});}} onChange={e=>guide({family:'hue',hue:Number(e.target.value)})}/>
      <div className="appearance-range-labels" aria-hidden="true"><span>Vermelho</span><span>Verde</span><span>Azul</span><span>Rosa</span></div>
      <button type="button" className="appearance-text-action" onClick={()=>guide({})}>Usar cores da base</button>
     </section>
     {invalid?<p className="appearance-error" role="alert">{invalid} A aplicação mantém uma aparência segura até a correção.</p>:result?.adjusted&&<p role="status">Textos e ações foram ajustados automaticamente para preservar o contraste.</p>}
    </>}
    <section className="appearance-miniature" aria-label="Prévia da interface">
     <h3>Prévia da interface</h3><div className="appearance-mini-shell"><div className="appearance-mini-sidebar" aria-hidden="true"><i/><i/><i/></div><div className="appearance-mini-workspace"><div className="appearance-mini-header">Área de trabalho</div><div className="appearance-mini-card"><small>VISÃO GERAL</small><h4>Seu espaço de trabalho</h4><p>Veja como textos, superfícies e ações combinam.</p><div className="appearance-mini-actions"><button type="button" className="appearance-mini-highlight">Destaque</button><button type="button" className="appearance-save">Ação principal</button></div></div></div></div>
     <div className="appearance-semantics" aria-label="Cores semânticas protegidas"><span>Sucesso</span><span>Alerta</span><span>Erro</span><span>Informação</span></div>
    </section>
    {draft.mode==='custom'&&<>
     <details className="appearance-disclosure"><summary>Ajustes avançados</summary><p>Refine cores individualmente. Ao usar novamente intensidade ou cor geral, a paleta será recalculada.</p><div className="appearance-colors">{PALETTE_KEYS.map(field=><label key={field}><span>{labels[field]}</span><div><input type="color" aria-label={`${labels[field]} — seletor`} value={/^#[0-9a-f]{6}$/i.test(draft.palette[field])?draft.palette[field]:'#000000'} onChange={e=>color(field,e.target.value)}/><input aria-label={`${labels[field]} — HEX`} value={draft.palette[field]} maxLength={7} spellCheck={false} onChange={e=>color(field,e.target.value)}/></div></label>)}</div></details>
     <button type="button" className="appearance-reset" onClick={()=>setDraft(resetGuided(draft))}>Restaurar Personalizado</button><p>Restaura a base Claro da DEZ, intensidade 50%, sem refinamentos manuais.</p>
    </>}
    <details className="appearance-disclosure"><summary>Ver exemplos de componentes</summary><section className="appearance-preview" aria-label="Prévia de aparência"><label>Campo de exemplo<input placeholder="Digite para conferir a leitura" /></label><label>Lista de exemplo<select defaultValue="Opção selecionada"><option>Opção selecionada</option><option>Outra opção</option></select></label><table><thead><tr><th>Descrição</th><th>Estado</th></tr></thead><tbody><tr><td>Exemplo de linha</td><td>Selecionada</td></tr></tbody></table></section></details>
    {notice&&<p role="alert" className="appearance-error">{notice}</p>}
   </div><footer><button type="button" onClick={cancel}>Cancelar</button><button type="button" className="appearance-save" disabled={!!invalid||!key} onClick={save}>Salvar aparência</button></footer></>}
  </dialog>
 </Context.Provider>;
}
