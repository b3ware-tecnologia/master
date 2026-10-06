# IA proativa de relacionamento

## Requisito de produto

Em 2026-10-05 o usuário reafirmou que a IA é ativa e deve iniciar as conversas com os clientes. A [recuperação do chat original](original-project-reconciliation.md) encontrou menções a campanhas automáticas, follow-up autônomo e agente conversacional como funcionalidades fora do escopo da infraestrutura da fase 3, sem recuperar a especificação completa das futuras fases de IA. A análise manual de mensagens da fase 6 desta continuação é auxiliar. A implementação proativa e suas provas estão em [continuidade de mensagens, IA e frontend](messaging-proactive-seleta.md).

O fluxo alvo é: planejamento autorizado de relacionamento → seleção de clientes elegíveis → abordagem contextual gerada pela IA → validação determinística → envio pelo WhatsApp → continuidade da conversa → encaminhamento ao consultor e registro no CRM.

A operação humana define o público, o objetivo e os limites do planejamento. A execução proativa deve partir dessa autorização persistida, sem depender de o cliente enviar a primeira mensagem nem de um operador solicitar cada análise. O fluxo atual de confirmação individual de envios permanece disponível, mas não constitui essa automação.

## Condições da implementação

- Persistir configurações por empresa, público autorizado, objetivo, horários, limites, vigência e responsável pela autorização. Não selecionar contatos de outra empresa ou fora do público autorizado.
- Gerar a abordagem usando contexto permitido do Customer 360, distinguindo fatos importados de fatos confirmados. Não inventar aprovação, taxas, renda ou condições de crédito.
- Revalidar consentimento, bloqueios, janela de contato, frequência, telefone, conexão, estado da empresa e autorização antes de enfileirar e imediatamente antes de enviar. A decisão final de elegibilidade pertence ao código.
- Persistir a execução, o texto, a origem da autorização e o resultado. Garantir posse exclusiva do trabalho e prevenção de contatos duplicados. Resultado de envio incerto não pode provocar repetição automática.
- Processar as respostas no contexto da mesma conversa e cliente. Persistir quem controla o atendimento; a IA deve pausar quando um consultor assumir, quando houver encaminhamento humano ou pedido para interromper contato.
- Registrar o contexto e o motivo do encaminhamento no CRM. O modelo não pode atribuir permissões, mudar de empresa ou executar diretamente operações financeiras.

## Estado e ativação

Campanhas, autorização persistida do público/objetivo/limites, gerador de abordagem, execução pelo worker e transferência de controle estão implementados. O primeiro contato não depende de mensagem anterior do cliente. A autorização congela a inclusão do público pela data de criação da associação à lista. Para alterar objetivo, lista, conexão ou limites, crie outra campanha; autorizar uma retomada permite o público existente nessa nova data. Conversas são vinculadas pela conexão e pelo cliente da empresa.

`AI_OUTREACH_ENABLED`, `WHATSAPP_OUTBOUND_ENABLED` e a chave OpenAI são necessários para gerar e enviar. A mesma política de horário, consentimento e intervalo dos envios manuais se aplica. O worker revalida a autorização atual, a vigência, o controle AI e o contexto antes da geração, antes da fila e antes do POST. Limites: 1–20 novos contatos/dia por campanha, 1–12 mensagens por cliente, 20 gerações por empresa/hora e a reserva existente de 20 envios/hora. Há no máximo um follow-up por sessão, opcional, após 24–168 horas sem resposta.

Recusa explícita cancela a fila e registra OPTED_OUT sem depender do modelo. Pedido de pessoa ou mídia pausa a assistente e abre atendimento no CRM por meio do serviço autorizado compartilhado. Consultores só assumem clientes do próprio escopo; devolver à IA exige permissão de planejamento. Uma resposta financeira exige encaminhamento humano; não há aprovação de crédito, cálculo, OCR ou transcrição.

A ausência de `OPENAI_API_KEY` e o bloqueio de envios reais continuam conforme a decisão anterior do usuário. Acrescentar a chave não cria este mecanismo. Implementação, testes com transportes simulados e operação com clientes reais devem ser comprovados separadamente.
