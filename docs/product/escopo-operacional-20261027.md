# BM Crédito — escopo operacional revisado

A instrução do usuário em 27/10/2026 substitui a amplitude do portal anterior. A especificação histórica continua como referência; os módulos antigos não definem mais a navegação principal.

## Admin Center

Somente administradores da plataforma cadastram empresas, geram o convite do administrador inicial e selecionam a empresa que vão apoiar. Cada empresa mantém seus contatos, listas, números, rotinas, conversas e equipe. Criar uma empresa não copia dados de outra nem altera a conta de um usuário existente.

## Portal da empresa

1. **Listas e contatos:** importar CSV/XLSX, revisar o mapeamento, preservar os contatos e consultar listas. A revisão registra a autorização de contato e a conferência dos dados de análise. Pedidos de não contato nunca são sobrescritos por essa revisão.
2. **Disparador:** selecionar lista, até 50 números da própria empresa e equipe/atendente. Preparar a rota com IA, revisar a ordem e iniciar. Cada rotina tem contadores de contatos iniciados, enviados, entregues, respostas e encaminhamentos.
3. **Conversas:** mostrar somente clientes que responderam no WhatsApp ou no chat web. Preservar o número e o canal de origem. O humano assume e responde dentro do sistema; a IA continua como copiloto, sem enviar a sugestão sozinha.
4. **Configurações:** equipe e convites, consulta da abordagem fixa, horários, limites e números do WhatsApp.

## Abordagem e identidade

A abordagem é única e definida no código, sem editor de regras no portal ou nas APIs dos clientes. As listas são informadas pela empresa como antigos clientes. O atendimento retoma o relacionamento e oferece ajuda para avaliar consignado justo e parcelas compatíveis com a renda informada, sem inventar salário, contratos, taxa ou aprovação.

Cada novo atendimento recebe automaticamente um dos 20 nomes: Vanessa, Mariana, Camila, Juliana, Fernanda, Amanda, Beatriz, Carolina, Larissa, Gabriela, Patrícia, Renata, Daniela, Aline, Bruna, Letícia, Priscila, Tatiane, Luana e Débora. A identidade é persistida e permanece a mesma nas respostas, no chat web e no copiloto. Atendimentos anteriores preservam Vanessa. Se perguntada diretamente se é IA, responde com transparência.

## Rotina e prioridade

A prioridade ordena contatos, não aprova crédito. A IA usa o objetivo, prioridade operacional e fatos de análise financeira ou interesse revisados pela equipe. Uma lista sem análises revisadas é identificada como tal; o modelo não inventa score bancário, margem, elegibilidade, taxa ou aprovação.

O planejador processa lotes de até 50, grava progresso e razões por contato, verifica cobertura exata e IDs de evidência e salva uma ordem estável antes da execução. A rota suporta até 10 mil integrantes; listas maiores precisam ser divididas. Dados são minimizados: nome, CPF e telefone não são enviados ao planejador. A ausência da OpenAI fica explícita; solicitações feitas sem configuração não entram em execução ao se adicionar uma chave.

Uma conexão é escolhida para cada novo atendimento e fica persistida na sessão. A distribuição usa os números conectados do conjunto autorizado. Não há troca silenciosa de número em conversas existentes. Limites por conexão, janela, consentimento, não contato, posse humana e estado atual continuam sendo verificados. O limite técnico anterior de vinte solicitações por hora passa a ser contado por número; os limites específicos configurados podem ser mais restritivos. Isso não é comprovação de vazão real com 50 números.

Os contadores usam contatos da rotina, não a quantidade total de mensagens do histórico. Entrega depende de recibo do provedor ligado à mensagem inicial e à conexão correta. Uma mensagem aceita pela API não é apresentada como entrega confirmada. A primeira resposta é registrada por sessão; conversas antigas não aumentam artificialmente a contagem.

## Atendimento humano e copiloto

O encaminhamento pausa a IA e abre um atendimento. Um atendente escolhido precisa estar ativo na equipe. Se a rotina autoriza distribuição pela equipe, escolhe-se um atendente ativo com menor carteira. A atribuição existente a um consultor é preservada. Inativação ou falta de atendente mantém a conversa pendente, sem declarar transferência para uma pessoa inexistente.

A resposta humana ao WhatsApp usa a conexão e o telefone da conversa recebida, mesmo quando o cliente possui vários telefones. A fila revalida a posse do atendimento no momento do envio. Uma mensagem recebida nas últimas 24 horas permite resposta dentro da conversa sem aplicar o intervalo entre novas abordagens; isso não transforma o cliente em opt-in para campanhas. Exclusões, consentimento negativo e regras da conexão continuam válidos.

O copiloto usa o histórico do canal ativo e produz uma sugestão que pode ser copiada para o rascunho. A revisão e o envio são do atendente. A resposta da IA é descartada se o humano assumir durante a geração.

## Link individual e continuidade web

A primeira mensagem recebe um convite gerado pelo servidor para `/chat/<id>#key=<segredo>`. O modelo não inventa URLs. O convite associa empresa, cliente, sessão, campanha e número de origem. O segredo fica no fragmento, fora da URL enviada ao servidor; só o hash é persistido. A geração usa uma chave estável (`WEB_CHAT_SECRET` ou chave segura existente). Não rotacionar essa chave sem planejar a reemissão dos convites.

O cliente abre a conversa sem criar conta. O sistema mostra primeiro nome e telefone parcialmente oculto; dados completos ficam no servidor. O link individual vale por 30 dias e funciona como credencial de acesso ao atendimento. A página não exibe dados financeiros pessoais ou documentos. O domínio público configurado precisa ser o domínio confiável da empresa antes da operação em produção.

A resposta web fica gravada no sistema e não depende da conexão WhatsApp continuar aberta. A IA ou o humano responde no próprio chat web. Quando o cliente passa a conversar por esse canal, a geração automática pelo WhatsApp é cancelada para evitar respostas simultâneas. O atendente pode escolher continuar no WhatsApp explicitamente.

O link precisa chegar ao cliente antes de o número ficar indisponível. O sistema não recupera mensagens de WhatsApp que não foram recebidas nem abre o navegador do cliente sem que ele clique. Se a IA estiver indisponível, a mensagem web continua gravada para atendimento humano.

## Conexão dos números

A Evolution 2.3.7 instalada oferece pareamento por código com o número informado. O app de WhatsApp desse número ainda é necessário para autorizar em Aparelhos conectados; o código substitui o escaneamento do QR. A opção de QR é mantida como alternativa. O contrato do adaptador e as respostas inválidas são testados; pareamento físico com 50 números não foi realizado.

A Cloud API oficial é uma alternativa distinta para cadastro/verificação por SMS ou chamada, com regras e limites da conta empresarial. Ela não foi implementada nem ativada nesta entrega. Referências: [código Evolution 2.3.7](https://github.com/EvolutionAPI/evolution-api), [verificação de número no SDK da Meta](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/phoneNumbers/requestCode/).
