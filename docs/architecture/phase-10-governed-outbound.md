# Fase 10 — envio WhatsApp com revisão explícita

O responsável pela empresa e o administrador da plataforma podem preparar planos WhatsApp, registrar consentimento e política, aprovar o plano e revisar o número e o texto completo. Aprovação e agendamento não disparam mensagens. Uma confirmação separada cria uma solicitação persistida. Gestores e consultores não possuem `messaging.send`.

`WHATSAPP_OUTBOUND_ENABLED` aceita `true` ou `false` e permanece desativado por padrão. WEB e WORKER precisam da mesma configuração. A homologação deve manter esse bloqueio até existir autorização explícita para um destinatário e texto reais. A IA continua independente e desativada sem chave.

## Persistência e processamento

A migração `20261006010000_governed_outbound` cria `OutboundDispatch`, chaves estrangeiras compostas por empresa, uma solicitação por plano e idempotência por empresa/requestKey. A solicitação registra snapshots privados de número/texto, solicitante, vínculo de acesso, conexão e hash dos dados revisados. Auditoria e eventos carregam somente IDs, estados e códigos seguros, sem texto, telefone ou credenciais.

O worker registra uma reivindicação durável antes de consultar o provedor. Antes do POST, revalida acesso atual, cliente ativo, plano aprovado e vencido, telefone importado/confirmado escolhido, consentimento, política, janela, intervalo, conexão habilitada e os dados revisados. Locks de política e cliente coordenam confirmações, alterações de governança e workers concorrentes. Alterações de usuário/cliente de outros módulos são consultadas imediatamente antes do envio; um envio externo já iniciado não é reversível por uma revogação posterior.

Há um limite inicial de vinte solicitações por empresa/hora e lotes de cinco. `QUEUED` pode ser cancelado com versão esperada. `SENDING` não pode ser cancelado. `ACCEPTED` significa aceite do provedor, não entrega/leitura. O aceite reserva o intervalo entre contatos; o estado de relacionamento e `lastOutboundAt` só mudam com mensagem efetivamente observada pela integração existente.

O webhook passa a assinar `SEND_MESSAGE` junto de `MESSAGES_UPSERT` e `CONNECTION_UPDATE`. Na versão 2.3.7, a Evolution emite `send.message` para envios via API. O normalizador exige `fromMe=true` nesse evento e utiliza o mesmo armazenamento/idempotência de mensagens. Caso os dois eventos cheguem para o mesmo ID do provedor, somente uma mensagem e um contato observado são registrados. A inscrição de instâncias existentes precisa ser atualizada com a ação de configurar webhook.

## Resultado incerto

Evolution 2.3.7 não expõe uma chave de idempotência no DTO de envio. O adaptador faz um único POST `/message/sendText/{instance}` com número/texto, sem retry. Qualquer falha após o início desse POST, inclusive resposta inválida, torna a tentativa `UNCERTAIN`; uma reivindicação abandonada por mais de dois minutos também se torna incerta. Não há retry/reset automático nem garantia de entrega exatamente uma vez.

Uma tentativa incerta bloqueia novas confirmações para aquele cliente. A tela permite associar explicitamente uma mensagem OUTBOUND/TEXT observada da mesma empresa, conexão, número, texto e janela (30 segundos antes até 120 segundos depois do início). A associação não envia mensagem. Sem evidência correspondente a tentativa permanece incerta. Endereços LID/aliases e alterações de número pelo provedor não são reconciliados automaticamente. Essa verificação humana não prova causalidade quando houve outro envio manual idêntico na mesma janela.

## Validação

`pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`. `pnpm harness:phase10:staging` executa PostgreSQL em esquema temporário, com transporte simulado: concorrência, idempotência, chaves por empresa, alterações antes do envio, cancelamento, resultado incerto, recuperação de crash e associação observada. Os testes não chamam Evolution nem OpenAI. Regressões das fases 3, 4 e 7–9 mantêm os contratos existentes.

`LIVE_HTTP_ACCEPTANCE=true pnpm harness:phase10:http` valida a aplicação publicada com contas temporárias, permissões, isolamento, revisão privada e recusa de envio enquanto desativado. `CREATE_OUTBOUND_DEMO=true pnpm bootstrap:outbound-demo:staging` prepara exclusivamente a empresa fictícia já existente, sem conectar instância e sem credenciais persistentes de teste.

Contrato oficial: [DTO 2.3.7](https://github.com/evolution-foundation/evolution-api/blob/2.3.7/src/api/dto/sendMessage.dto.ts).

## Publicação na homologação — 2026-10-05

- Código de execução `73942ca`: WEB `086fa4ea-fd6a-4669-a9f3-a9d25a557283` e WORKER `7861dea7-035e-4992-9033-69287bbb0806` alcançaram `SUCCESS`. Treze migrações públicas e dezenove hashes de fonte normalizados coincidiram em cada serviço. `/health` e `/ready` responderam 200; o worker registrou conexão PostgreSQL, Redis e início do processamento.
- Lint, typecheck e build local passaram; 74 testes passaram e dois testes locais de conectividade ficaram ignorados. Nenhum check de GitHub foi reportado para a branch do PR; esses resultados são verificações locais e de homologação.
- A aceitação PostgreSQL final usou `phase10_acceptance_19d9c36375a04ff189a747e07f5ff861`, com transporte simulado e remoção verificada do esquema. Confirmou concorrência, onze bloqueios antes do envio, cancelamento, recuperação sem retry, associação explícita e deduplicação dos dois eventos de mensagem. A regressão do inbox usou `phase5inbox_acceptance_2a12fc69bf2744b792fe174a646394cc`, também removido. Planejamento, governança e CRM/distribuição passaram em esquemas isolados nesta continuação.
- A aceitação HTTP da versão final validou sessões temporárias de master/gestor/consultor/plataforma, isolamento, suspensão, revisão privada sem cache, criação/aprovação de plano, política/consentimento, rejeição de envio desativado e callback autenticado sintético `send.message`, deduplicado com `messages.upsert`. Não criou solicitações de envio nem fez chamadas de envio à Evolution. Usuários, sessões, empresas e registros temporários foram removidos.
- A inscrição real de `bm_credito_staging` foi atualizada com os três eventos, mantendo o destino e a autenticação por conexão; o adaptador conferiu a configuração retornada pela Evolution. Isso verifica configuração, sem provar entrega real de uma mensagem enviada pelo novo fluxo.
- A sessão humana da plataforma aprovou o plano fictício de Marina na empresa de demonstração. A aprovação persistiu após recarregar; número/texto e os bloqueios apareceram, sem solicitação criada. Evidência local: `.private/phase10-envios-demo.jpg`, fora do Git. A empresa fictícia não possui conexão Evolution.
- `WHATSAPP_OUTBOUND_ENABLED` permanece desativado nos dois serviços e nenhuma chave OpenAI está configurada. Um envio real com destinatário/texto autorizados, entrega/leitura, aliases/LID e a observação real de um envio por API continuam sendo aceitação operacional posterior. Mídia e retenção/redação de logs upstream continuam fora desta etapa.

O trabalho segue no [PR cumulativo #14](https://github.com/bmcredito/master/pull/14), ainda em draft e dependente das continuações #11–13. A produção e a branch estável original não foram atualizadas.
