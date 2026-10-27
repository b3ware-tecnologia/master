# BM Crédito — homologação do portal simplificado

Código funcional: `39041b9`; ajuste de layout: `4198087`, branch `codex/dispatch-focused-portal`. O escopo operacional de 27/10 substitui a navegação comercial anterior: Admin Center separado; portal com listas, disparador, conversas e configurações.

## O que testar

1. Entre com sua conta existente em https://web-staging-staging-4754.up.railway.app/login. No Admin Center, abra **Demonstração CRM — dados fictícios**. A empresa real continua isolada e sua senha não foi alterada.
2. Em **Disparador**, abra a rotina demonstrativa. Confira os contadores e a rota marcada como simulada. Ela não permite iniciar envios. Uma rotina nova escolhe lista, até 50 números, equipe/atendente e limite diário; a abordagem é fixa.
3. Em **Listas e contatos**, consulte os contatos fictícios ou importe uma planilha de teste. A revisão preserva exclusões e pedidos de não contato.
4. Em **Conversas**, abra Helena para conferir a continuidade pelo chat web e responder dentro do portal. A origem de demonstração está desativada; mensagens web permanecem independentes desse número. Somente clientes que responderam entram na caixa.
5. Em **Configurações**, consulte equipe, números, limites e a abordagem única. Informar o telefone oferece código de pareamento; o aplicativo WhatsApp do número ainda precisa autorizar a conexão.
6. A abordagem retoma antigos clientes e ajuda a avaliar consignado com condições justas, sem presumir salário ou aprovação. Novos atendimentos recebem um dos 20 nomes persistidos; o nome não muda ao trocar de canal.

## Validação local e isolada

- 198 testes unitários passaram; dois testes de conectividade permanecem pulados.
- ESLint e build de produção passaram, incluindo TypeScript.
- As 17 migrations foram aplicadas em schema exclusivo de aceitação, removido ao final com confirmação.
- A aceitação simulou 50 números e 52 contatos elegíveis, preparação concorrente da rota, seis envios de transporte simulado, primeiro link web, resposta após perda da origem, encaminhamento pessoal, resposta pelo número correto e recibos associados à mensagem correta.
- Isolamento entre empresas, carteira do consultor, revogação, preservação de opt-out e descarte da geração quando o humano assume passaram.
- Nenhuma chamada real à OpenAI ou mensagem real de WhatsApp foi feita nesses testes.

## Publicação e navegador

- WEB: `e18f2aeb-a930-445c-9b5c-5b44ed2a8b1b`, observado em `SUCCESS` com o ajuste de celular.
- WORKER: `305aef77-6f2a-42a2-8062-0970764b7153`, observado em `SUCCESS`; o ajuste posterior afeta somente CSS do portal.
- Os hashes dos arquivos funcionais foram comparados com o checkout nos dois serviços; as 17 migrations estão aplicadas. `/health` e `/ready` retornaram 200, e o worker iniciou/processou os eventos da demonstração.
- 12 verificações de navegador passaram, com 12 capturas, desktop/celular, claro/escuro e nenhuma exceção de página ou resposta 5xx observada. Os artefatos locais ficam em `output/acceptance/20261027`.
- O cliente fictício enviou mensagem sem login pelo link individual, com a origem WhatsApp desativada. O atendente respondeu pelo portal e a mensagem foi recebida no chat web. O copiloto sem chave ficou explicitamente aguardando configuração.
- O administrador da empresa recebeu 403 ao consultar o Admin Center e ao tentar cadastrar uma abordagem; um visitante recebeu 401 no inbox e 404 no convite com chave inválida. O formulário da rotina não oferece regra/persona editável.
- As duas contas temporárias da rodada final foram suspensas, suas sessões removidas e senhas temporárias invalidadas. Dados fictícios de demonstração foram preservados. Nenhuma senha da conta existente do usuário foi redefinida.

## Limites da homologação

OpenAI e envios reais permanecem desativados. A avaliação da qualidade das conversas com `gpt-6-luna`, o pareamento físico e a operação simultânea de 50 números reais ainda exigem configuração e validação próprias. Não há medição real de vazão.

O link web deve chegar antes de o WhatsApp ficar indisponível. O sistema não recupera mensagens que não recebeu. O acesso pelo link dura 30 dias, mostra apenas primeiro nome/telefone mascarado e não expõe documentos ou dados financeiros. O domínio definitivo da empresa deve ser configurado antes da operação real.

A Cloud API oficial não foi implementada nesta entrega. A revisão de produção, os cuidados operacionais com o provedor e a integração bancária/formalização de crédito não são comprovados por esta homologação.
