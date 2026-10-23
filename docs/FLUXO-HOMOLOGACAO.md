# Fluxo oficial de desenvolvimento e homologação 10S

`homologacao` é a branch de validação. `master` representa produção. O ambiente local usa banco, configuração e segredos próprios; não recebe credenciais da VPS nem de produção.

1. Desenvolver no ambiente local.
2. Executar testes e validações locais pertinentes.
3. Criar um commit lógico na branch de trabalho.
4. Publicar o pacote aprovado na branch `homologacao`.
5. Implantar `homologacao` na VPS/Coolify de homologação pelo processo automático ou manual configurado.
6. Realizar homologação funcional e técnica nesse ambiente, registrando o SHA efetivamente implantado.
7. Trazer correções necessárias de volta ao desenvolvimento local.
8. Testar, commitar e publicar novamente em `homologacao`.
9. Fechar o pacote de homologação aprovado e registrar seu SHA.
10. Ricardo aciona Wanderson para a promoção do pacote.
11. Wanderson revisa e promove o pacote homologado para produção (`master`) pelo processo controlado.
12. Executar smoke test de produção e registrar o resultado.

O ciclo diário não publica evolução diretamente em `master`. Uma passagem em `homologacao` só está concluída quando o SHA implantado na VPS foi conferido e validado. Correções de homologação retornam ao local antes de nova publicação.
