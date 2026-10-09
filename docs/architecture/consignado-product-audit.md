# Auditoria do produto BM Crédito — 2026-10-09

Fonte normativa: [especificação enviada pelo usuário](../product/bm-credito-specification.md), 58 seções. SHA-256 `830CD0C7758B24A17A484B631115D216323EBF8234F4374299CDE382E89ED38E`. Base auditada: `028308b`, código funcional anterior `466975e`, checkout `D:\crm-credito`. O documento substitui a suposição anterior de que faltava uma especificação comercial/financeira. Não concede permissão para ativar envios, usar clientes reais em testes ou publicar produção; essas decisões anteriores permanecem.

## 1. Arquitetura atual

Next.js 15/React 19/TypeScript; PostgreSQL com Prisma 6; sessões opacas com hash; Redis e worker separado. Importação, outbox, recibos, geração e envios usam jobs persistentes com leases/idempotência no PostgreSQL. Redis é infraestrutura de apoio, não a verdade operacional. WEB/WORKER separados no Railway. Provider `MessagingProvider`/`SendingMessagingProvider` existe; Evolution 2.3.7 implementa o transporte. Responses, modelo registrado e schema estrito já integram análise auxiliar e relacionamento. O frontend atual reaproveita a referência aprovada Seleta Frutas.

## 2. O que existe e pode ser reaproveitado

| Área | Evidência no código | Cobertura perante a nova especificação |
| --- | --- | --- |
| Empresa/usuário/equipe | Tenant/Membership/Team, auth/context, customer-scope | Multiempresa e escopo atuais prontos; VIEWER e papel de gestão de campanhas faltam |
| Importação | import-service, customer-import, Import/CustomerFact/CustomerSource | CSV/XLSX, mapping, dedupe, campos custom e origem; revisão operacional e score ainda incompletos |
| Cadência/governança | MessagingPolicy, CommunicationPreference, lockMessagingTarget | Consentimento, janela, cooldown e limites conservadores; política por número/dias/horas falta |
| WhatsApp | MessagingConnection, Conversation, MessagingReceipt, DeliveryEvent | Várias conexões, QR, fila, entrega/leitura, saúde técnica, circuito/DLQ; não comprova 20 números reais |
| IA | outreach-gateway/source/service, OutreachCampaign/Session/Turn | Inicia abordagem autorizada, responde, pausa e handoff; playbook, tools financeiros, memória resumida e simulador faltam |
| CRM | CRMCase/Note, CustomerAssignment, crm-service | Atendimento e distribuição manual/equipe; não é ainda Kanban comercial de 15 estágios |
| Operação | operations-service/dashboard | Indicadores de atendimento; funil/campanha/saúde de engajamento e contatos frios separados faltam |

## 3. Problemas encontrados

O prompt anterior trata qualquer dúvida financeira como handoff, enquanto o produto exige consultar condições versionadas. STOP mistura desinteresse temporário com revogação de consentimento. Opt-out depende da sessão AI atual e não de uma exclusão por telefone que alcance todas as campanhas. Toda linha importada está em Customer ACTIVE, portanto contagem de clientes ativos não representa conversas/oportunidades. Campanhas têm uma conexão, um objetivo curto e follow-up sem resposta, sem estratégia aprovada nem retorno pedido pelo cliente. O seletor dos primeiros 100 membros pode deixar contatos elegíveis posteriores sem abordagem. Saúde mede disponibilidade técnica, sem score operacional. CRM existente é fila/detalhe, sem pipeline comercial. Não há prova operacional de 20 WhatsApps/10.000 contatos com campanhas simultâneas. Chave OpenAI/ativação continuam pendentes; testes com transportes simulados não avaliam o modelo real.

## 4. Modelo de dados proposto

Preservar Tenant como organizationId e Customer como cadastro unificado; não duplicar Organization/Contact nem remover o CRMCase. Evoluir OutreachCampaign e vincular versões de CampaignPlaybook. Opportunity representa interação comercial, com FK ao cliente/campanha/conversa/sessão, estágio/versionamento, resumo e controle; contatos frios continuam na lista. OpportunityTask representa follow-up/tarefa com estado, motivo, data e idempotência. DoNotContact indexa telefone normalizado dentro da organização, motivo/origem e data, sem vazar exclusão entre empresas. FinancialInstitution/CreditProduct/CreditCondition representam catálogo publicado com fonte/vigência, sem dados bancários inventados. CommercialAIJob persiste interpretação/simulação/copiloto, decisões e consumo. ChannelCadence complementa a política da empresa; nunca substitui consentimento/janela. Reutilizar AuditEvent/OutboxEvent/CustomerTimeline/CustomerFact e as travas existentes. Novas relações usam FKs compostas por tenant.

## 5. Arquitetura dos agentes

CreditConciergeAgent separa leitura de perfil/histórico/playbook/produtos/regras das intenções estruturadas. O modelo propõe intenção, resposta, estágio, fatos, retorno, resumo e handoff; funções determinísticas validam acesso, evidência, vigência, estado, consentimento e controle humano. Nenhum tool permite aprovação de crédito. Playbook é versionado, interpretado por job, editável e aprovado antes de campanha nova entrar em operação. Simulação usa contexto isolado e não executa escritas comerciais nem envios. Copiloto retorna sugestões para revisão; jamais envia no controle humano. Uma função financeira retorna somente condições publicadas vigentes da empresa; ausência/vencimento gera incerteza/handoff.

A execução usa Responses com [function calling](https://developers.openai.com/api/docs/guides/function-calling) e [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses); chamadas de função são executadas pela aplicação com validação própria, não autorização pelo LLM.

## 6–9. WhatsApp, CRM, filas e concorrência

Preservar provider abstrato e Evolution. Designar uma conexão persistida por contato; não trocar automaticamente de número em bloqueio. Cadência é limitada por organização/campanha/canal, em horários/dias aprovados, com reserva/contagem em transação e revalidação antes do POST. Saúde operacional explicável pode reduzir/pausar, sem inferir denúncias que o provider não fornece. ACK do webhook permanece durável. Processar todas as respostas, inclusive negativas, com origem intacta e idempotência. Kanban e memória são projeções persistidas dos eventos, não efeitos de renderização. Handoff suspende geração/envios, registra resumo e fila; assumir/devolver revalida carteira/equipe. FKs, advisory locks, CAS/version e idempotency keys cobrem dois workers, duas campanhas, humano concorrente e opt-out. Jobs interrompidos têm leases; resultados de envio ambíguos não são repetidos.

## 10. Plano compatível com as nove fases enviadas

1. Fundação: reaproveitar organização/importador/cadastros; adicionar VIEWER, estratégia por campanha e revisão operacional/score explicável.
2. WhatsApp: conservar provider/inbox/recibos; ampliar apresentação de contexto e acesso humano autorizado.
3. CRM: pipeline comercial, oportunidades por interação, estágios, timeline e ações manuais auditadas.
4. IA: playbook aprovado, jobs de interpretação/teste, tools delimitados, memória e resultado comercial estruturado.
5. Orquestração: políticas por canal, distribuição persistida por campanha, follow-up contextual, score de saúde e pausa/alertas.
6. Handoff: fila, resumo, atribuição/assunção, IA pausada e copiloto sem envio.
7. Produtos: catálogo versionado, publicação humana, source/validFrom/validUntil, consultas/comparação vigentes e fail-closed.
8. Analytics: funil com denominadores explícitos, métricas por campanha/conexão/equipe, separar importado de engajado.
9. Hardening: cenários negativos/concurrentes, 20 canais/10.000 contatos simulados, regressões, HTTP autenticado e prova da versão publicada.

Cada fase deve registrar implementação, testes e limitações. Produção e atendimento real exigem aceitação própria; não marcar todos os 21 critérios de sucesso como satisfeitos por um build ou por dados de demonstração.
