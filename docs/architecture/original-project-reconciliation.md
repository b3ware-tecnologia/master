# Reconciliação com o roteiro original da BM Crédito

## Fonte recuperada

Em 2026-10-05 foi recuperado o chat **Execute Phase 0 do bmcredito/master**, ID `01a0693c-7272-7700-96e6-e7992e937e69`, iniciado em setembro de 2026. O usuário identificou esse chat como a provável referência original. Foram recuperados os 11 documentos anexados às mensagens disponíveis, incluindo revisões das fases 1–2 e a especificação da fase 3. Não foi recuperada uma especificação completa das fases seguintes.

Os originais estão preservados localmente em `.private/original-project-source`, fora do Git. `manifest.json` identifica o chat, os anexos, títulos, quantidade de linhas e SHA-256; as cópias foram verificadas contra os anexos. Nenhum comando desses documentos históricos foi executado como parte desta recuperação.

| Documento principal | Anexo original | SHA-256 |
| --- | --- | --- |
| Recovery / executar fase 0 real | `ee4bd15f-9774-45bc-84e9-21536d166e45` | `1D73298F886781B19BDE60B6C09ECD387CBBBE67A28717CC730CABCF84513A8A` |
| Fase 1 / fundação multi-tenant, identidade, RBAC, equipes e auditoria, revisão posterior | `7847bcf9-e74f-4364-a1fa-fba81f39709e` | `BA7FF44A2A1807216A74A6C142F22388C6BF78524FB7EEC013DA1610B252817C` |
| Fase 2 / Customer Domain, importação, deduplicação e Customer 360 | `9b34e9b7-7dbf-4957-a513-618c7ac4303b` | `25DAACE7886A7663E7C3730357A3E5F81BBDB4B967D6EF33EE0CDF0B75883660` |
| Fase 3 / Evolution API Foundation & Messaging Infrastructure | `a37059a6-c9ed-4fc6-a21c-7ca5ed8095af` | `CA436BA81EF971BA5F5A0128C818C4E6D785D9BF96FC65B51BC2749B3CE4DBA8` |

## Numeração e escopo

| Roteiro original recuperado | Continuação implementada | Conclusão |
| --- | --- | --- |
| Fase 0: infraestrutura SaaS, WEB/WORKER, PostgreSQL/Redis, Railway e verificações | Fundação existente | A prova de homologação não comprova todos os gates originais de produção. |
| Fase 1: multi-tenant, identidade, capacidades, equipes, auditoria e outbox | Fundação existente, com correções posteriores de acesso e convites | Mecanismos presentes; não declarar toda a especificação original aceita apenas pela presença do código. |
| Fase 2: Customer Domain, CSV/XLSX, deduplicação e Customer 360; documentos adicionais de robustez e aceitação | Importação existente, com melhorias posteriores de posse, recuperação e progresso | Há evidências de testes anteriores; integração no repositório original e produção continuam separadas. |
| Fase 3: Evolution e infraestrutura de mensagens | A continuação chamou o conector/inbox de fase 5 e o envio de fase 10 | Cobertura parcial da fase 3 original; lacunas abaixo. |
| Fase 4: Messaging Governance, Connection Health & Relationship Safety | A continuação chamou consentimento/janela/frequência de fase 4 | Apenas o título da fase 4 original foi recuperado. Não presumir equivalência completa, especialmente saúde e recuperação de conexões. |
| IA proativa que inicia conversas, reafirmada pelo usuário nesta conversa | A continuação chamou análise manual de fase 6 | A análise manual é auxiliar e não implementa a iniciativa nem a continuidade do atendimento. |

Os números 3–12 dos documentos desta continuação são históricos das entregas de outubro, não uma reprodução fiel da numeração original. Não renomear migrations ou reescrever evidências para fazer os números coincidirem. Não atribuir números originais a fases posteriores sem sua especificação.

## Lacunas concretas da fase 3 original

Comparação de código em `9b94362` com o anexo da fase 3. Isto é uma revisão de requisitos e mecanismos; não houve nova bateria de testes nem nova validação do provedor nesta recuperação. "Presente" significa mecanismo identificado, não aceitação integral.

| Seções originais | Requisito | Código atual / limite |
| --- | --- | --- |
| 2, 11–13 | Provider desacoplado, adaptador e HTTP centralizado | Presente em `domain/messaging-provider.ts` e `integrations/evolution-provider.ts`, com timeout e sem repetição automática de envio ambíguo. |
| 3–5 | Várias conexões por empresa; relacionamento pertencente ao cliente | **Divergência:** `MessagingConnection.tenantId` é único e `Tenant.messagingConnection` é singular. Services/UI/dispatch resolvem uma conexão por empresa. Precisa de migração e ajuste integrado, não apenas de um seletor visual. |
| 4, 35–40 | Ciclo de vida e saúde persistida da conexão; verificação periódica pelo worker | QR/estado e atualização via webhook/consulta existem. Não há o job periódico de saúde no worker nem o histórico completo de saúde previsto. |
| 6–10 | Evolution, persistência, rede e segredos no Railway | Há entrega de homologação documentada em `docs/integrations/evolution-api.md`. Isso não equivale à infraestrutura independente de produção exigida no final da fase. |
| 14 | Erros internos com categorias de autenticação, rate limit, rejeição e indisponibilidade | Parcial: o provider tem categorias internas básicas, sem toda a classificação requerida. |
| 15–17 | Conversas e mensagens com estados e datas de envio, entrega e leitura | Histórico presente. `ConversationMessage` não tem `deliveredAt`/`readAt` nem a máquina de entrega/leitura; `ACCEPTED` do dispatch significa aceitação pelo provedor. |
| 18, 23 | Webhook grava recibo durável, confirma rápido e worker processa a entrada | **Divergência:** `receiveEvolutionWebhook` normaliza e grava conversas/mensagens durante a requisição. Não existe recibo/inbox durável separado nem worker de entrada. O outbox de eventos posterior não substitui esse fluxo. |
| 19–22, 74–75 | Autenticação, limite de payload, validação de conexão, duplicação e ordem | Mecanismos presentes: HMAC por vínculo, limite de 256 KiB, schema, unicidade de mensagem por conexão e atualização temporal condicionada. Eventos não suportados são ignorados; não há recibo dedicado para contabilizá-los. |
| 24–26 | Correspondência exata de cliente e contato desconhecido | Presente: telefone exato dentro da empresa; contato sem correspondência pode permanecer sem cliente. |
| 27–29, 32 | Envio em fila, transições atômicas, idempotência persistida e destinatário autorizado | Base presente em `OutboundDispatch`/`outbound-service.ts`. Está vinculada a plano e confirmação individual, não é uma API geral de execução proativa. |
| 30–31 | Recuperação de falhas transitórias antes de enviar, backoff e DLQ; ambiguidade sem repetição automática | `UNCERTAIN` e reconciliação existem. Não há a política de retry/backoff/DLQ de mensagens exigida; `BLOCKED` não equivale a essa recuperação. A DLQ de importação não cobre mensagens. |
| 41–47, 53–54 | Métricas por conexão, concorrência própria, pausas/backpressure e circuit breaker | Worker consulta filas em sequência. Não foram encontrados mecanismos próprios de circuit breaker, backpressure ou configuração de concorrência de mensagens. Estado OPEN como pré-condição de envio é apenas parte da governança técnica. |
| 48–50 | Audit/outbox/timeline dos eventos recebidos, enviados, entregues e lidos | Audit/outbox de observação e dispatch existem. O ciclo de eventos de entrega/leitura continua ausente. |
| 51–52 | Minimização de conteúdo bruto e preparação para mídia | CRM não persiste payload bruto/URL/chave de mídia. Download privado já foi acrescentado. Retenção/logs brutos do Evolution permanecem pendentes; download não é arquivo permanente. |
| 57–76, 90 | Aceitação de duplicação/ordem/concorrência, falhas e restart; carga interna 2k/5k/10k e 1/5/10 conexões | As entregas têm testes documentados, mas não há evidência recuperada de todos os cenários originais de mensagens. Benchmark 10k de importação não comprova benchmark de mensagens. |
| 77–85, 90 | CI, PR integrado, Evolution/WEB/WORKER de produção e smoke real | A entrega atual está em homologação e o PR cumulativo continua em revisão. Não declarar fase 3 original SUCCESS nem projeto pronto para produção. |

## IA: requisito e limites da fonte

O anexo original da fase 3, linhas 41–50, exclui **nesta fase** campanhas automáticas, follow-up autônomo, mensagens geradas por IA e agente conversacional. Isso delimita a infraestrutura antes dessas funcionalidades; não é uma proibição permanente da IA. Entretanto, esse anexo não define os agentes, prompts ou o roteiro completo das fases de IA.

A exigência de a IA iniciar o contato vem explicitamente da reafirmação atual do usuário. [IA proativa](proactive-ai.md) registra o fluxo alvo com essa proveniência. Os detalhes ainda não recuperados não devem ser apresentados como se constassem do chat antigo.

## Continuidade alinhada

1. Consolidar a base original de mensagens: múltiplas conexões, entrada durável em fila, estados/recibos, saúde/pausas e recuperação de falhas sem duplicação.
2. Integrar a governança técnica e comercial ao planejamento autorizado de relacionamento.
3. Implementar a iniciativa da IA, geração contextual, execução persistida, continuidade da conversa e transferência de controle para consultor. A análise manual existente permanece auxiliar.
4. Validar com dados e transportes de teste, depois cumprir ativação/aceitação reais e os requisitos independentes de produção.

Envios reais e OpenAI permanecem desativados conforme a decisão atual do usuário. E-mail, relatórios, exportação e integrações bancárias mencionados na lista anterior são extensões possíveis ou lacunas de operação; não são fases recuperadas desse chat nem substituem o requisito central de relacionamento proativo.
