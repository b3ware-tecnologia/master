# Vanessa: prompt e roteiro de testes

Preparado em 09/10/2026. Modelo escolhido: `gpt-6-luna`, com esforço de raciocínio baixo. Não há troca automática para outro modelo.

## O que está pronto no código

A Vanessa inicia com nome, empresa e assunto aprovado, pede disponibilidade e conduz uma conversa breve em português brasileiro. Exemplo de estilo para uma estratégia de consignado:

> Oi, sou a Vanessa da BM Crédito. Você tem um tempinho para conversar sobre crédito consignado?

O prompt diferencia permissão para conversar de interesse em contratar, cliente ocupado de perda e recusa temporária de pedido de não contato. Também orienta encaminhamento humano, ausência de condições financeiras, desconfiança de links e histórico indisponível. Se perguntarem se é IA, responde com transparência e oferece a equipe.

O simulador aceita primeira abordagem sem mensagem recebida e resposta a uma mensagem fictícia. Os resultados mostram fala sugerida, intenção, etapa, resumo e próximo passo. Cada teste é independente; não é uma conversa contínua de múltiplos turnos.

## Arquivos para revisão

- [Prompt comercial completo](../../output/vanessa-tests/prompt-vanessa.txt), exportado das instruções usadas pelo gateway.
- [Prompt do fluxo de relacionamento anterior](../../output/vanessa-tests/prompt-relacionamento-legado.txt).
- [16 cenários e entradas fictícias](../../output/vanessa-tests/cenarios.json), incluindo resultado esperado de cada caso.

Para atualizar os arquivos depois de alterar o prompt, execute `pnpm exec tsx scripts/prepare-vanessa-tests.ts`. Esse comando não chama a OpenAI nem envia mensagens.

## Como testar pela interface após publicar esta versão

1. Acesse a área Comercial com permissão para gerenciar estratégias. Na visão de plataforma, selecione a empresa de teste.
2. Em Estratégias, crie, revise e aprove uma estratégia fictícia com objetivo de conversar sobre consignado sem prometer condições.
3. Em Testar agente, selecione a estratégia e o cenário Primeira abordagem. Não é necessário inventar uma mensagem do cliente.
4. Gere o teste, aguarde o worker e atualize os resultados. Revise a fala sugerida e a classificação.
5. Repita para os outros cenários. É possível editar a mensagem fictícia antes de cada teste de resposta.
6. Registre aprovação ou reprovação de cada resultado, com motivo. Os cenários de transparência, não contato, encaminhamento humano e informação financeira precisam passar antes de uso operacional.

Para gerar respostas reais, WEB e WORKER precisam de configuração válida da OpenAI, modelo `gpt-6-luna` e worker ativo. A configuração foi adiada pelo usuário. Sem ela, o teste fica em **Aguarda configuração**; ele não será executado automaticamente ao adicionar a chave. Após configurar, solicite um novo teste. Chaves não devem ser inseridas no prompt ou no chat.

O simulador usa cliente fictício e a estratégia e o catálogo autorizados da empresa selecionada. Uma chamada real ao modelo usa créditos da API, mas não envia a resposta ao cliente nem altera seu atendimento. As flags de envio real não precisam ser ativadas para esse teste.

## Evidências verificadas nesta alteração

| Verificação | Resultado |
| --- | --- |
| Testes unitários completos | 164 passaram; 2 de conectividade pulados |
| ESLint e TypeScript | Passaram |
| Build Next.js | Passou; aviso existente sobre detecção do plugin Next no ESLint |
| Aceitação de banco e worker | Passou em schema isolado no Railway staging |
| Primeira abordagem e resposta na fila | 2 jobs concluídos com gerador simulado; idempotência e separação das etapas verificadas |
| Dados da aceitação | 10 mil contatos fictícios, 20 conexões fictícias, 20 respostas e oportunidades; não é benchmark de capacidade |
| Limpeza do schema isolado | Confirmada após a aceitação |
| Chamadas reais OpenAI / Jev / envios | Zero nesta validação |

Identificador da aceitação: `phase14_acceptance_c68a4b3d16c1412d94fe366f3d277653`. O schema foi removido pelo próprio runner. O comando `pnpm harness:phase14:staging` exige staging e cria seu próprio schema antes de executar fixtures.

## Pendências explícitas

Esta alteração está no checkout local; não foi publicada em WEB/WORKER. A aprovação da naturalidade das falas depende de executar os 16 cenários com o modelo real. O simulador ainda não recebeu conferência visual autenticada no navegador nesta alteração.

O chat web para clientes ainda é uma proposta de arquitetura, não uma função disponível. O prompt não inventa links nem promete recuperar mensagens de um número indisponível. Veja [continuidade pelo chat web](../architecture/web-chat-continuity.md). Preparar este prompt não conclui todas as funcionalidades da especificação do produto.
