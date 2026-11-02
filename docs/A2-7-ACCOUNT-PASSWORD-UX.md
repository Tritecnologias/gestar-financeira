# A.2.7 — Aceite funcional e uniformização dos olhos de senha

Data: 01/11/2026. Base: `cb136c6dc4c183660bf24fea1937be6bd55d0b46`.
Branch local: `fix/a2-7-password-reveal-ux`, derivada diretamente da base homologada.

## Aceite e escopo final

Ricardo confirmou o **aceite funcional do ciclo completo de reset administrativo em HOMOLOG**.
Em seguida determinou que o refinamento dos controles de senha abrangesse os dois estados de
Minha Conta → Segurança: alteração normal e troca obrigatória após senha provisória.
O aceite funcional da base é preservado; a confirmação visual deste refinamento depende
da futura atualização autorizada de HOMOLOG.

## Implementação mínima

Os três `PasswordInput` já presentes em `AccountClient.tsx` recebem, em ambos os estados,
as opções existentes `sequential` e `holdToReveal`. O componente compartilhado e a Adesão
Automática não foram modificados. Não há implementação separada por estado.

A tela reaproveita também a orientação já aprovada na Adesão, associada aos campos por
`aria-describedby`: manter o olho pressionado ou manter **Alt+Shift+V** no campo.
A descrição da política de senha no campo Nova senha continua associada.

- Mouse/toque mostram somente durante a pressão. Soltar, sair do controle, cancelar o toque
  ou perder a interação oculta a senha.
- Os olhos permanecem `type="button"`, com `tabIndex=-1`, sem submit, navegação ou transferência
  indevida de foco. Continuam disponíveis a tecnologias assistivas por foco explícito,
  com Espaço/Enter; o atalho no campo e o anúncio de visibilidade são os existentes.
- Troca obrigatória: **Senha provisória → Nova senha → Confirmar nova senha → Salvar nova senha**.
- Alteração normal: **Senha atual → Nova senha → Confirmar nova senha → Cancelar → Salvar nova senha**.
  O botão Cancelar existente foi preservado. Shift+Tab percorre a ordem inversa.

Autenticação, validade de 30 minutos, sessões, auditoria, política de senha, contratos,
schema/ACLs, serviços e fluxos de Adesão permanecem byte a byte iguais à base.
A alteração de código de produto fica limitada ao componente da tela Minha Conta.

## Validação LOCAL direcionada

Evidências resumidas e hashes: [evidence/a2-7-account-password-ux.json](evidence/a2-7-account-password-ux.json).
Artefatos locais: `C:/Users/ricar/Documents/Codex/a2-7-account-ux/local-01`.

O teste `password-reset-controls.local.cjs` compila os componentes reais `AccountClient`
e `PasswordInput`, seus estilos e o código de temas, com o Webpack já fornecido pelo Next.
O Edge acessa somente um servidor loopback descartável. As fronteiras de navegação/autenticação
do framework e a resposta de gravação são simuladas; não existe banco nesse teste.
Não foi repetida a validação de autenticação, reset ou PF/PJ já aceita em HOMOLOG.
O teste não é um executor de publicação e não altera as ferramentas operacionais.

**Resultado: oito cenários aprovados**, combinando os dois estados, desktop/mobile
(1366×900 e 390×844) e Claro/Escuro. São 24 combinações de campo/configuração verificadas.

- Três olhos: pressão/soltura do mouse, saída do controle, Alt+Shift+V e liberação de modificador,
  foco assistivo com Espaço/Enter, perda de foco e blur da janela.
- Toque por eventos reais do Chromium: pressão, soltura e cancelamento, mantendo o foco no campo.
- Tab e Shift+Tab nas sequências acima, valores preservados e cada olho independente dos demais.
- Zero POST ou navegação causados pelos controles; campos/olhos desabilitados durante gravação.
- Um POST simulado somente após Salvar, com payload existente e feedback de sucesso preservados.
- Nenhuma requisição externa, nenhum dado real e nenhuma gravação de credencial.
- Oito capturas locais, sem senhas expostas; layouts sem rolagem horizontal.

TypeScript (`--noEmit --incremental false`), lint do componente alterado, sintaxe dos quatro
arquivos de teste e `git diff --check`: aprovados.
O auxiliar de verificações é compartilhado pelos testes de navegador já existentes de Minha Conta
e reset; a antiga expectativa de Tab parar no olho foi substituída pela sequência aprovada.

O toque foi exercitado por emulação do Edge/Chromium, não em aparelho físico. O comportamento
de teclado e os atributos acessíveis foram verificados; não se trata de certificação por leitor de tela.

## Conclusão e publicação

**GO técnico LOCAL para o refinamento nos dois estados.** O novo commit é candidato para a
próxima atualização controlada, ainda não publicada. Nenhum OCI de release foi reconstruído
nesta rodada. A preparação e conferência do novo artefato e a publicação devem seguir o
procedimento operacional existente e a autorização específica de Ricardo.

Sobre HOMOLOG H8, o ajuste visual não exige migration ou ACL. A contingência futura deve
continuar preservando o guard de senhas provisórias, conforme o plano já aprovado.

Não houve acesso remoto. HOMOLOG, PROD e master não foram alteradas. Não houve push, deploy, migration,
envio de e-mail ou alteração de contrato. Trabalho encerrado após commit e evidências.
