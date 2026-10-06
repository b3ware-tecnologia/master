# Continuidade de mensagens, IA proativa e frontend

Esta entrega atende à instrução de concluir as lacunas recuperadas e usar a interface do projeto Seleta Frutas. Não representa aceitação de produção nem uma especificação financeira que não foi recuperada.

## Comportamento entregue

- Mais de uma conexão WhatsApp por empresa, com conexão principal preservada pela migration, seleção explícita nos envios e campanhas, pareamento e controles por ID, habilitação e métricas próprias. Instâncias continuam exclusivas de uma empresa; FKs compostas impedem referências entre empresas.
- Webhook autenticado grava recibo durável de campos normalizados e confirma a gravação. O worker processa mensagens em lote; repetição e execução concorrente não duplicam mensagens ou eventos. Payload bruto, API key e URLs de mídia não entram na fila.
- Recibos Evolution `MESSAGES_UPDATE` registram envio, entrega e leitura. Recibo anterior à mensagem é conservado; leitura não volta para entrega/envio. Os eventos do provedor precisam incluir MESSAGES_UPDATE. Aceitação de dispatch permanece distinta de entrega/leitura.
- Sondagem de saúde a cada minuto, circuito e pausa após três falhas, recuperação automática e histórico de mudanças. Envios têm serialização por conexão, fila com próxima tentativa, backoff e cinco tentativas somente antes do POST; falha final entra em DLQ. Resultado ambíguo continua UNCERTAIN, nunca reenviado automaticamente. Retomar DLQ exige confirmação, texto/número intactos, autorização e governança atuais.
- Campanhas autorizadas iniciam contato sem mensagem prévia do cliente, com objetivo, público, conexão, validade e limites persistidos. Textos vêm de Responses, schema estrito, modelo registrado `gpt-6-luna`, esforço low, store=false, contexto delimitado e fatos confirmados permitidos. Geração não fornece ferramentas de escrita ao modelo. Histórico e consumo ficam registrados nos turnos.
- Respostas, um follow-up opcional, pausa, encerramento, pedido para parar e passagem ao consultor. A operação continua subordinada à autorização atual e à política da empresa. Atendimento humano usa o CRM compartilhado, inclusive quando a geração está desativada.
- Shell do Seleta aplicado às áreas da empresa e plataforma: DM Sans/Manrope, barra lateral clara, seleção magenta, fundo suave, cartões brancos, tabela/formulários, navegação móvel e foco acessível. Referência real: projeto `seleta frutas/crm`, chat `Criar CRM para Seleta Frutas`; identidade BM Crédito preservada.

## Prova de implementação

Código funcional publicado: `466975e`, incluindo `b5e3b0e`, `c97ab54`, `6fe2c6f` e a revalidação final da pausa da conexão antes do transporte. Migration `20261006020000_messaging_proactive_ai`, 14 migrations no total.

Passaram 89 testes unitários, com dois testes de conexão local ignorados, lint, TypeScript e build. A aceitação `scripts/phase-13-acceptance.ts` usa PostgreSQL real em schema descartável criado pelo runner; transportes de geração, saúde e envio são simulados. Nenhuma chamada real de OpenAI ou envio WhatsApp ocorre nesse harness.

Provas: dez conexões, principal e isolamento; circuito/recuperação; ACK durável; duplicação concorrente; recebimento privado; leitura anterior à mensagem e ordem monotônica; recuperação de lease; DLQ de entrada; primeiro contato sem inbound; audiência congelada; consentimento; limite diário; workers concorrentes; resposta; tomada humana; pausa; opt-out; flags; revogação de acesso; cinco falhas antes do envio; autorização de retomada; ambiguidade sem retry; transferência ao CRM sem chamar IA.

| Mensagens normalizadas | Conexões | Tempo observado |
| --- | --- | --- |
| 2.000 | 1 | 3.877 ms |
| 5.000 | 5 | 8.514 ms |
| 10.000 | 10 | 18.100 ms |

Carga de entrada em lote, incluindo gravação/processamento/eventos, em banco de homologação com schema isolado. Não é benchmark de envios reais, de capacidade contratada ou de latência de produção. Todos os 17.000 registros esperados foram verificados; nenhuma DLQ ficou pendente; schema final foi removido. Passaram também regressões isoladas de conector, inbox, governança de envio e CRM/distribuição.

## Ativação e limites restantes

`OPENAI_API_KEY` permanece ausente, `AI_OUTREACH_ENABLED` e `WHATSAPP_OUTBOUND_ENABLED` permanecem false. A autorização de uma campanha prepara a operação; não supera esses bloqueios. A ativação deve ser seguida de avaliação do modelo e teste de contato autorizado. Conteúdo real, qualidade conversacional e entrega/leitura reais ainda não estão comprovados por transportes simulados.

Não declarar a fase 3 original integralmente aceita: continuam independentes o tratamento dos logs/retenção do Evolution, política de dados, backup/restauração, CI/merge no repositório original e ambiente de produção. Serialização conservadora também usa a trava de política por empresa durante o envio; paralelismo máximo entre conexões não é uma promessa desta entrega. O teste de recuperação de recibo reproduz lease interrompido, sem alegar SIGKILL de um worker de mensagens.

Aceite autenticado para ingressar com uma conta já existente, portabilidade, e-mail, relatórios financeiros, alertas externos e integrações bancárias não foram inventados como fases recuperadas. As funcionalidades financeiras dependem de contratos e regras ainda não fornecidos.

## Publicação verificada — 2026-10-05 (Brasília)

- Código de WEB e WORKER: `466975ec9c9f4c93b660e0098ed0bf5a9e0e8db1`.
- WEB-STAGING: deployment `f94a9f80-61a7-4d73-9041-306094c55a8e`, `SUCCESS`.
- WORKER-STAGING: deployment `1abbf223-7bb3-4538-8f95-e805110f9499`, `SUCCESS`; eventos `postgres_connected`, `redis_connected` e `worker_started` observados.
- Quatorze migrations públicas concluídas. SHA-256 de 48 arquivos principais em cada serviço correspondeu ao código local, após normalização de newline. `/health` e `/ready` retornaram 200.
- A conexão real `bm_credito_staging` permaneceu `open`, habilitada e com uma conexão principal. URL, HMAC, opções e quatro eventos do webhook foram conferidos: `MESSAGES_UPSERT`, `MESSAGES_UPDATE`, `CONNECTION_UPDATE`, `SEND_MESSAGE`. Configuração não enviou mensagem.
- `LIVE_HTTP_ACCEPTANCE=true pnpm exec tsx scripts/phase-13-http-acceptance.ts` passou na aplicação publicada: autenticação, papéis, isolamento entre empresas, revogação, campanha idempotente com autorização explícita, configuração desativada, páginas autenticadas, webhook durável processado pelo WORKER publicado, deduplicação e métricas. Fixtures temporárias removidas; zero chamadas OpenAI e zero envios reais.
- A aceitação isolada final repetiu os controles após o ajuste de pausa da conexão. Os cenários de carga não foram repetidos nessa rodada porque o processamento em lote não mudou; a tabela anterior registra a carga efetivamente executada.
- Navegador autenticado conferiu CRM, indicadores reais da empresa de demonstração, formulário de campanhas, aviso de ativação pendente e navegação. Em tela móvel de 390 × 844, não houve overflow horizontal nas páginas de campanhas/operação; menu abriu e a navegação preservou a empresa. Tamanho original restaurado. Capturas privadas em `.private/proactive-seleta-frontend.png` e `.private/proactive-seleta-mobile.png`, fora do Git.
- `OPENAI_API_KEY` ausente e flags de IA proativa/envio desativadas em ambos os serviços, conforme decisão do usuário. Os testes com gerador/transporte simulados comprovam o mecanismo, não qualidade do modelo ou envio/entrega/leitura reais.
- [PR cumulativo #14](https://github.com/bmcredito/master/pull/14) permanece draft. GitHub não reportou checks; os resultados locais e Railway não representam CI GitHub. Branch estável original e produção não foram promovidas.
