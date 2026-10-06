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

Código funcional: `b5e3b0e`, `c97ab54`, `6fe2c6f`. Migration `20261006020000_messaging_proactive_ai`, 14 migrations no total.

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
