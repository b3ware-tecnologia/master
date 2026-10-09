# Continuidade do atendimento entre WhatsApp e web

Discussão de produto de 09/10/2026. O usuário aprovou a direção visual dos mockups e pediu uma experiência em que o cliente abra um link de atendimento já associado ao cadastro. Esta é a proposta técnica decorrente da conversa; não representa implementação, envio ou ativação de IA.

## Objetivo e limite

Manter o atendimento disponível por um canal próprio caso o número de WhatsApp fique indisponível. O link precisa chegar ao cliente antes da indisponibilidade, ou por outro canal previamente autorizado. A resposta enviada no chat web é recebida diretamente pelo BM Crédito. Mensagens enviadas somente ao WhatsApp e não entregues ao sistema não podem ser inferidas, interceptadas ou recuperadas por uma IA.

O cliente precisa clicar no link: conhecer seu nome e telefone permite associar o convite ao cadastro, não abrir automaticamente uma página em seu dispositivo nem comprovar identidade. Uma resposta positiva no WhatsApp pode disparar a oferta do link, mas esse fluxo não protege contra perda do canal anterior à resposta. Para essa cobertura, oferecer o link já na abordagem inicial aprovada, como alternativa de atendimento.

## Estado observado no código

- `Conversation` exige `connectionId` e `remoteJid`, com unicidade por conexão; `ConversationMessage` também exige conexão e identificador do provedor.
- `OutreachSession` já relaciona empresa, campanha e cliente, com controle humano/IA e versão, mas não substitui um atendimento independente da campanha e do canal.
- O gateway usa Responses API e aceita atualmente apenas `gpt-6-luna` no registro de modelos e na validação de ambiente.
- Após a orientação do usuário em 09/10/2026, o código local apresenta a persona como “Vanessa da BM Crédito” e valida nome e empresa na primeira abordagem. A exigência da expressão “assistente virtual/digital” foi removida nos dois gateways. A regra de transparência quando perguntada sobre sua natureza permanece nas instruções. Não houve ativação de IA ou publicação desta alteração.

## Fluxo proposto

1. Criar um atendimento vinculado à empresa e ao cliente, com participantes e controle humano/IA próprios.
2. Emitir convite para chat web com token aleatório de alta entropia, escopo restrito ao atendimento, expiração e revogação. Guardar hash do token; não inserir telefone, CPF ou nome no URL.
3. Inserir o convite em uma mensagem revisada pelo fluxo existente de consentimento e autorização. Não permitir que a IA invente ou substitua o destino do link.
4. Quando o cliente abrir o convite, trocar o token por uma sessão de navegador restrita ao chat. Pré-preencher apenas a identificação mínima, por exemplo primeiro nome e telefone mascarado. Acesso ao convite não equivale a verificação de identidade para histórico financeiro ou documentos; exigir verificação proporcional antes de mostrá-los.
5. Receber e persistir as mensagens web no atendimento central. O agente recebe somente o contexto autorizado daquele cliente. Identificar canal e origem de cada mensagem, deduplicar eventos e serializar respostas para evitar respostas simultâneas no WhatsApp e na web.
6. Registrar canal preferido após a primeira mensagem web. Não duplicar respostas em outros canais automaticamente. Manter a mesma persona, resumo, oportunidade, tarefas e responsável.
7. Se o WhatsApp ficar indisponível, suspender seus envios, informar a operação e manter o chat web funcionando. Preservar a distinção entre falha de transporte, restrição do provedor e recusa do cliente.
8. Transferência para consultor interrompe respostas automáticas em todos os canais do atendimento. Pedidos de não contato também se propagam entre os canais.

Não apresentar “link criado”, “entregue”, “aberto” e “resposta recebida” como o mesmo evento. Pré-visualizadores de links não devem consumir o convite, validar identidade, marcar leitura humana ou gerar mensagem de IA apenas por uma requisição GET.

## Persona e modelo

Apresentação definida pelo usuário: “Oi, sou a Vanessa da BM Crédito”. Não acrescentar espontaneamente “assistente virtual” ou “assistente digital” à abertura. Linguagem breve, natural e acolhedora, com uma pergunta por vez; manter identidade ao trocar de canal. Responder com transparência quando perguntada se é IA ou pessoa, sem inventar uma funcionária humana real, credenciais ou experiências pessoais. Nome e marca na primeira mensagem são validados; a qualidade do diálogo e a transparência precisam de avaliação com o modelo antes da ativação.

Decisão do usuário em 09/10/2026: manter `gpt-6-luna` com Responses API para o diálogo comercial no WhatsApp e no chat web, priorizando custo. Essa decisão substitui a sugestão anterior de avaliar GPT-6.1 Sol; não prever troca ou escalonamento automático para Sol. O registro de modelos e a validação de ambiente já aceitam somente Luna. Jev continua opcional para triagem de intenção e seleção de contexto, sem assumir o diálogo, a identidade do cliente ou as decisões de autorização.

Validar Luna quanto a naturalidade em português brasileiro, continuidade entre canais, pedido de consultor, recusa, número errado, ambiguidade, uso de catálogo vigente e tempo/custo por atendimento. Ajustar instruções e contexto a partir dos testes. Aprovação de mockups ou discussão arquitetural não ativa chamadas de IA nem mensagens reais.

Fontes oficiais consultadas em 09/10/2026:

- https://developers.openai.com/api/docs/models/gpt-6.1-sol
- https://developers.openai.com/api/docs/models/gpt-6-luna
- https://developers.openai.com/api/docs/guides/model-selection
- https://developers.openai.com/api/docs/guides/conversation-state

## Confiança no convite e no chat

- Usar HTTPS em domínio oficial da BM Crédito, previamente verificado e configurado, com endereço legível. Não usar encurtador genérico, imitação de outro domínio ou domínio de homologação em mensagens reais.
- Gerar o destino no servidor a partir de uma origem permitida; a IA não escolhe URLs. Os gateways atuais ainda rejeitam links produzidos pelo modelo. A futura composição de convites deve adicionar somente o link emitido pelo sistema após validar autorização, escopo e disponibilidade do chat.
- Explicar a finalidade antes do link, por exemplo: “Se preferir, podemos continuar pelo atendimento online da BM Crédito. Ele abre direto no navegador.” Só afirmar que o destino é oficial quando o domínio tiver sido verificado.
- Usar a identidade visual aprovada e mostrar “Vanessa · BM Crédito”, identificação verificável da empresa e acesso à política de privacidade. Não fabricar selos, avaliações, depoimentos, foto de funcionária real ou estados “verificado” e “online”.
- Abrir uma interface rápida e legível no celular, com o contexto autorizado preservado. A transição não deve pedir novo cadastro, senha, código bancário ou pagamento. Dados sensíveis exigem a verificação de identidade descrita acima.
- Tratar convite expirado, revogado, atendimento indisponível e erro de conexão com mensagens claras e recuperação pelo canal autorizado, sem simular sucesso.
- Medir criação, entrega, abertura humana e primeira resposta separadamente para avaliar a experiência. Não prometer que aparência ou texto eliminam bloqueios ou garantem resposta.

## Escopo da implementação seguinte

Modelo de atendimento independente do canal; convite e sessão web; chat público com a identidade visual BM aprovada; persistência e recebimento de mensagens web; roteamento do agente; caixa de entrada unificada para consultores; controle humano em todos os canais; testes de expiração, convite encaminhado, isolamento entre empresas, concorrência e perda de conexão WhatsApp.

Esse chat é uma nova superfície para o cliente final, solicitada nesta discussão. Ele não implica construir um portal completo de empréstimos, contratos ou conta bancária.
