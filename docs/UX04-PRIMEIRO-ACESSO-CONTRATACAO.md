# UX 04 — Pacote A: primeiro acesso e contratação

Base: `4b63ae64e3c336aa204d5071ecf5966a4af260e7`. Escopo: LOCAL e HOMOLOG; nenhuma publicação PROD autorizada.

## Alterações

1. Convites Especiais: largura até 1920 px, maior proporção da coluna do destinatário e preservação da rolagem interna. Nenhuma mudança na emissão, recuperação, interesse ou cancelamento.
2. Criação de senha: Tab segue senha → confirmação → Confirmar acesso. Os controles visuais continuam disponíveis por clique/toque. Na ativação, Alt+Shift+V no campo alterna a visibilidade; a instrução está associada aos campos por `aria-describedby`, o botão declara `aria-keyshortcuts` e a mudança é anunciada por status. Fora desse modo, os botões permanecem na ordem normal de Tab (login/Minha conta).
3. Termo do Usuário: texto introdutório aprovado, mantendo “Aceite pendente”.
4. PDF: download discreto com ícone, mantendo alvo acessível, hash/versão, renderização, zoom, checkbox e aceite.
5. PF/PJ: remoção dos textos redundantes e ícones decorativos pessoa/empresa após o radio. O grupo mantém nome acessível pelo título. Nenhuma mudança na persistência de modalidade.
6. Responsável Contratual: pergunta/explicação aprovadas, formulário de outra pessoa inicialmente vazio, sem sugerir que o e-mail da sessão seja do indicado. Voltar no formulário mantém os valores apenas no estado local, sem emitir convite; o foco retorna à pergunta.
7. Aceite pendente: “Atualizar documentos” sai da navegação principal. Revalidação na aceitação e recuperação por “Tentar novamente” permanecem; Sair continua disponível.

## Retorno à escolha contratual

O problema original era que SELF já persistia a designação e redirecionava à leitura, sem caminho de retorno. Foi acrescentada a ação `back` no endpoint existente, usando os mesmos guards de sessão, origem, OWNER ativo e tenant, além da transação serializável e do lock contratual já usados pela aceitação.

O retorno só é permitido quando TODAS as condições se verificam:

- escolha SELF, status ASSIGNED;
- quem iniciou e quem foi designado são o membership autenticado;
- designação atual pertence à mesma identidade;
- modalidade pronta e Termo do Usuário aceito;
- nenhum aceite CONTRATANTE existe para o tenant, inclusive versões históricas/retiradas.

A operação remove somente a designação provisória mutável, marca o estado de onboarding CANCELLED e acrescenta `CONTRACTUAL_CHOICE_REOPENED` à auditoria. Não remove aceites/auditorias, não altera OWNER/membership e não concede acesso. Uma requisição antiga de aceite deixa de estar autorizada se o retorno venceu; se o aceite venceu, o retorno falha. Receber 409 exige atualizar a situação, nunca presumir que houve retorno.

O indicado de OTHER não ganha poder de desfazer a indicação. Nesse caso, Voltar fecha a leitura para a tela de aceite; a mudança do indicado continua pelo fluxo existente de Trocar responsável/revogação. Nenhuma responsabilidade já formalizada pode ser trocada por esta ação.

## Validação

- Suíte HTTP real PostgreSQL/Prisma da Fase12A ampliada: retorno, alternância, atores/origem indevidos, concorrência com aceite, convites, contexto, revogação, backup/restore e replay. O ledger esperado é explícito por configuração (padrão histórico 3; atual HOMOLOG 6).
- Browser da jornada: ativação, teclado/atalho/olho, PDF adulterado bloqueado, PF/PJ, SELF/OTHER, Voltar/Escape, troca de indicado, liberação das duas sessões e identidade existente em segundo tenant.
- Browser de Convites Especiais: 1920/1366/768/390 px, Claro/Escuro, rolagem, largura de destinatário, busca e diálogo de cancelamento.
- Regressão unitária e teste Prisma de isolamento executados separadamente, com configuração sintética explícita para integrações.
- O teste antigo de prontidão passou a localizar explicitamente a migration produtiva de Convites Especiais, em vez de presumir que ela fosse sempre a última. Todos os checksums produtivos continuam verificados. Nenhum SQL histórico foi alterado.

As evidências locais e resultados finais ficam em `ux04-first-access`, fora do repositório. Testes usam processos de app independentes para não acumular o orçamento de login de uma suíte na seguinte; nenhuma política/limite de autenticação foi desabilitada.

Limite de acessibilidade: foram conferidos teclado, semântica, nomes/descrições acessíveis, status e foco no navegador. Não constitui certificação por NVDA/JAWS/VoiceOver; o aceite humano permanece necessário.

## Publicação e preservações

Nenhuma migration, alteração de PDF oficial, contrato de backup ou política de autorização. PROD, landing, identidades/tenants já existentes e fixtures históricas permanecem preservados. Publicar em HOMOLOG por SHA exato, sem hooks de migration, com auto-deploy OFF e fila vazia. Rollback de código para a base acima, sem restore/reset de banco, é compatível com o schema inalterado.

Após publicação: aguardar aceite funcional/visual de Ricardo; não iniciar Pacotes B/C/D.
