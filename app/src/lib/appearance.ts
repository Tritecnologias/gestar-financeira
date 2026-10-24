export type ThemeMode = "light" | "dark" | "custom";
export type Palette = { primary: string; accent: string; background: string; surface: string; sidebar: string; text: string; secondary: string; border: string };
export type Preference = { version: 1; mode: ThemeMode; palette: Palette };
export const LIGHT_PRESET = Object.freeze({ mode: "light" as const, palette: Object.freeze({ primary: "#2563EB", accent: "#0E7490", background: "#F3F7FA", surface: "#FFFFFF", sidebar: "#FFFFFF", text: "#0F172A", secondary: "#475569", border: "#D5DFE8" }) });
export const DARK_PRESET = Object.freeze({ mode: "dark" as const, palette: Object.freeze({ primary: "#60A5FA", accent: "#22D3EE", background: "#0F172A", surface: "#1E293B", sidebar: "#1B2940", text: "#F1F5F9", secondary: "#CBD5E1", border: "#3B4B61" }) });
export const PALETTE_KEYS = Object.keys(LIGHT_PRESET.palette) as (keyof Palette)[];
export function defaultPreference(mode: ThemeMode = "light"): Preference { return { version: 1, mode, palette: { ...LIGHT_PRESET.palette } }; }
export function preferenceKey(authMode: string, identityId: string) { return `10s:appearance:v1:${encodeURIComponent(authMode)}:${encodeURIComponent(identityId)}`; }
export function legacyMode(value: string | null): "light" | "dark" { return value?.toLowerCase() === "dark" || value?.toLowerCase() === "escuro" ? "dark" : "light"; }
export function parsePreference(raw: string | null): Preference | null {
  if (!raw || raw.length > 3000) return null;
  try { const p = JSON.parse(raw);
    if (p.version !== 1 || !["light", "dark", "custom"].includes(p.mode) || !p.palette || Object.keys(p).length !== 3 || Object.keys(p.palette).length !== PALETTE_KEYS.length || !PALETTE_KEYS.every(k => typeof p.palette[k] === "string" && /^#[0-9a-f]{6}$/i.test(p.palette[k]))) return null;
    const result: Preference = { version: 1, mode: p.mode, palette: Object.fromEntries(PALETTE_KEYS.map(k => [k,p.palette[k].toUpperCase()])) as Palette };
    return result.mode === "custom" && derivePalette(result.palette).error ? null : result;
  } catch { return null; }
}
export function loadPreference(storage: Pick<Storage,"getItem">, key: string | null): Preference {
  try { const raw = key ? storage.getItem(key) : null; if (raw !== null) return parsePreference(raw) ?? defaultPreference(); return defaultPreference(legacyMode(storage.getItem("theme"))); } catch { return defaultPreference(); }
}
function rgb(hex: string) { return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)); }
export function luminance(hex: string) { const [r,g,b]=rgb(hex).map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4});return .2126*r+.7152*g+.0722*b; }
export function contrast(a:string,b:string) { const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); }
function mix(a:string,b:string,weight:number) { const c=rgb(b);return '#'+rgb(a).map((v,i)=>Math.round(v*(1-weight)+c[i]*weight).toString(16).padStart(2,'0')).join('').toUpperCase(); }
function readable(color:string, backgrounds:string[], ratio=4.5) {
  if(backgrounds.every(b=>contrast(color,b)>=ratio)) return color;
  for(let step=1;step<=100;step++) for(const target of ['#000000','#FFFFFF']) { const c=mix(color,target,step/100);if(backgrounds.every(b=>contrast(c,b)>=ratio))return c; }
  return null;
}
export function derivePalette(p:Palette): { tokens: Record<string,string>; base: "light"|"dark"; error: string | null; adjusted: boolean } {
  const fail=(error:string)=>({tokens:{},base:"light" as const,error,adjusted:false});
  if(!PALETTE_KEYS.every(k=>/^#[0-9a-f]{6}$/i.test(p[k])))return fail('Informe todas as cores no formato HEX de seis dígitos.');
  const base=luminance(p.background)<.25?'dark':'light';
  const elevated=mix(p.surface,base==='dark'?'#FFFFFF':'#000000',.035),surfaces=[p.background,p.surface,p.sidebar,elevated];
  const text=readable(p.text,surfaces),secondary=readable(p.secondary,surfaces);
  if(!text||!secondary)return fail('Os fundos e superfícies precisam permitir um texto comum legível. Aproxime a luminosidade do fundo, dos cards e da sidebar.');
  const action=readable(p.accent,surfaces),primary=readable(p.primary,surfaces);
  if(!action||!primary)return fail('Ajuste os fundos para preservar o contraste das ações e do foco.');
  const hover=mix(p.surface,text,.06),selection=mix(p.surface,action,.12);
  const ink=readable(text,[...surfaces,hover,selection]);const secondaryInk=readable(secondary,[...surfaces,hover,selection]);
  if(!ink||!secondaryInk)return fail('A seleção e o hover perderiam legibilidade. Ajuste os fundos ou as cores de ação.');
  const tokens:Record<string,string>={
    '--background':p.background,'--surface':p.surface,'--surface-elevated':elevated,'--sidebar-surface':p.sidebar,'--surface-hover':hover,
    '--text-primary':ink,'--text-secondary':secondaryInk,'--text-muted':secondaryInk,'--border':p.border,'--border-light':mix(p.border,ink,.25),
    '--primary':primary,'--action':action,'--action-hover':mix(action,ink,.12),'--action-contrast':contrast(action,'#000000')>=contrast(action,'#FFFFFF')?'#000000':'#FFFFFF',
    '--accent-blue':primary,'--accent-blue-h':mix(primary,ink,.12),'--primary-contrast':contrast(primary,'#000000')>=contrast(primary,'#FFFFFF')?'#000000':'#FFFFFF',
    '--focus':action,'--focus-ring':action+'66','--selection':selection,'--selection-hover':mix(p.surface,action,.18),
    '--scrollbar-thumb':action,'--scrollbar-track':elevated,'--table-sticky-bg':elevated,
    '--legacy-blue-soft':mix(p.surface,primary,.06),'--legacy-blue-border':mix(p.border,primary,.2),'--legacy-blue-drag':mix(p.surface,primary,.07),'--legacy-blue-badge':mix(p.surface,primary,.1),
    '--backup-focus':action,'--task-header-bg':elevated,'--task-header-text':ink,'--task-header-muted':secondaryInk,'--accordion-final-bg':elevated,
  };
  // Semantic hue families stay protected; only contrast is derived, never user-selected.
  const semantic=base==='dark'?{success:'#34D399',warning:'#FBBF24',danger:'#F87171',info:'#60A5FA',forecast:'#FB923C'}:{success:'#047857',warning:'#B45309',danger:'#B91C1C',info:'#1D4ED8',forecast:'#C2410C'};
  for(const [name,color]of Object.entries(semantic))tokens['--'+name]=readable(color,surfaces,3)??color;
  tokens['--outflow']=tokens['--danger'];tokens['--financial-receivable']=tokens['--info'];tokens['--financial-forecast']=tokens['--forecast'];tokens['--filter-active']=tokens['--warning'];tokens['--filter-active-bg']=mix(p.surface,tokens['--warning'],.1);
  return {tokens,base,error:null,adjusted:ink!==p.text||secondaryInk!==p.secondary||action!==p.accent||primary!==p.primary};
}
export function applyPreference(root: HTMLElement,p:Preference) {
  // The allowlist is fixed; colors are never interpreted as arbitrary CSS.
  const custom=derivePalette(p.palette);const keys=Object.keys(derivePalette(LIGHT_PRESET.palette).tokens);
  for(const key of keys)root.style.removeProperty(key);
  const mode=p.mode==='custom'&&custom.error?'light':p.mode;
  root.dataset.theme=mode==='custom'?custom.base:mode;root.dataset.appearance=mode;
  if(mode==='custom')for(const[key,value]of Object.entries(custom.tokens))root.style.setProperty(key,value);
}
