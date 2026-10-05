# Fase 10 — envio WhatsApp com revisão explícita

O responsável pela empresa e o administrador da plataforma podem preparar planos WhatsApp, registrar consentimento e política, aprovar o plano e revisar o número e o texto completo. Aprovação e agendamento não disparam mensagens. Uma confirmação separada cria uma solicitação persistida. Gestores e consultores não possuem `messaging.send`.

`WHATSAPP_OUTBOUND_ENABLED` aceita `true` ou `false` e permanece desativado por padrão. WEB e WORKER precisam da mesma configuração. A homologação deve manter esse bloqueio até existir autorização explícita para um destinatário e texto reais. A IA continua independente e desativada sem chave.

## Persistência e processamento

A migração `20261006010000_governed_outbound` cria `OutboundDispatch`, chaves estrangeiras compostas por empresa, uma solicitação por plano e idempotência por empresa/requestKey. A solicitação registra snapshots privados de número/texto, solicitante, vínculo de acesso, conexão e hash dos dados revisados. Auditoria e eventos carregam somente IDs, estados e códigos seguros, sem texto, telefone ou credenciais.

O worker registra uma reivindicação durável antes de consultar o provedor. Antes do POST, revalida acesso atual, cliente ativo, plano aprovado e vencido, telefone importado/confirmado escolhido, consentimento, política, janela, intervalo, conexão habilitada e os dados revisados. Locks de política e cliente coordenam confirmações, alterações de governança e workers concorrentes. Alterações de usuário/cliente de outros módulos são consultadas imediatamente antes do envio; um envio externo já iniciado não é reversível por uma revogação posterior.

Há um limite inicial de vinte solicitações por empresa/hora e lotes de cinco. `QUEUED` pode ser cancelado com versão esperada. `SENDING` não pode ser cancelado. `ACCEPTED` significa aceite do provedor, não entrega/leitura. O aceite reserva o intervalo entre contatos; o estado de relacionamento e `lastOutboundAt` só mudam com mensagem efetivamente observada pela integração existente.

## Resultado incerto

Evolution 2.3.7 não expõe uma chave de idempotência no DTO de envio. O adaptador faz um único POST `/message/sendText/{instance}` com número/texto, sem retry. Qualquer falha após o início desse POST, inclusive resposta inválida, torna a tentativa `UNCERTAIN`; uma reivindicação abandonada por mais de dois minutos também se torna incerta. Não há retry/reset automático nem garantia de entrega exatamente uma vez.

Uma tentativa incerta bloqueia novas confirmações para aquele cliente. A tela permite associar explicitamente uma mensagem OUTBOUND/TEXT observada da mesma empresa, conexão, número, texto e janela (30 segundos antes até 120 segundos depois do início). A associação não envia mensagem. Sem evidência correspondente a tentativa permanece incerta. Endereços LID/aliases e alterações de número pelo provedor não são reconciliados automaticamente. Essa verificação humana não prova causalidade quando houve outro envio manual idêntico na mesma janela.

## Validação

`pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`. `pnpm harness:phase10:staging` executa PostgreSQL em esquema temporário, com transporte simulado: concorrência, idempotência, chaves por empresa, alterações antes do envio, cancelamento, resultado incerto, recuperação de crash e associação observada. Os testes não chamam Evolution nem OpenAI. Regressões das fases 3, 4 e 7–9 mantêm os contratos existentes.

`LIVE_HTTP_ACCEPTANCE=true pnpm harness:phase10:http` valida a aplicação publicada com contas temporárias, permissões, isolamento, revisão privada e recusa de envio enquanto desativado. `CREATE_OUTBOUND_DEMO=true pnpm bootstrap:outbound-demo:staging` prepara exclusivamente a empresa fictícia já existente, sem conectar instância e sem credenciais persistentes de teste.

Contrato oficial: [DTO 2.3.7](https://github.com/evolution-foundation/evolution-api/blob/2.3.7/src/api/dto/sendMessage.dto.ts).
