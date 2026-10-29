# Favicon da plataforma — variante azul aprovada

Alteração exclusivamente visual sobre a base `abaff7de7dd9137d2178df85f632ef26501cd953`.

Ricardo aprovou a prévia circular azul profundo e branca, derivada da arte oficial do favicon da landing, sem redesenhar o símbolo. PNG de referência 512 px SHA-256: `1bfe9ba743ef6143aa8515a2e7cc5effcc5dfda91466c45131c89dfe97898d27`.

- `public/favicon.svg`: arte aprovada autocontida, exterior transparente, sem texto ou borda branca adicional.
- `src/app/favicon.ico`: mesma arte em DIB 32 bits, 16/32/48 px, transparência por alpha e máscara AND para fallback de navegador.
- `src/app/layout.tsx`: referência SVG com versão de cache; title, description e providers preservados. O ICO file-based do Next.js permanece como fallback com a mesma identidade, sem coexistência de arte antiga.

Fluxo desta rodada: LOCAL → HOMOLOG no SHA fixado → aceite visual explícito de Ricardo → futura promoção controlada para PROD. Nenhuma migration, mudança de ambiente, regra funcional ou dado faz parte deste pacote. A landing mantém seu favicon atual. Safari deve ser conferido quando houver ambiente disponível; não presumir teste em navegador ausente.
