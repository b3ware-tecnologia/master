# Jev no BM Crédito — 2026-10-09

## Papel e pontos de integração

A pedido do usuário, Jev (TypeSafe) foi integrado como auxiliar do CreditConciergeAgent, TestAgent e copiloto comercial, através de structuredCommercialResponse. A interpretação de estratégias continua na OpenAI: Jev classifica texto, não redige o playbook ou a resposta.

| Tarefa | Resultado | Uso pela aplicação |
| --- | --- | --- |
| Intenção principal da última mensagem recebida | Choice com distribuição e confiança | Sugestão ao agente, sem substituir a decisão estruturada nem a fala original |
| Objeção expressa | Choice com distribuição e confiança | Sugestão de tom/contexto; não altera estágio ou cadastro |
| Necessidade de contexto financeiro | Noul | Em casos simples e de alta confiança, omite o catálogo apenas da mensagem inicial ao agente |

O fluxo usa o [contrato HTTP oficial da TypeSafe](https://docs.typesafe.ai/api): endpoint fixo https://api.typesafe.ai/v1/systemone, autenticação server-side, perguntas choice e noul, validação da resposta, modelo efetivo e consumo.

## Limites determinísticos

- Nenhuma classe do Jev autoriza envio, concede consentimento, aprova crédito, escolhe responsável, muda CRM ou encerra atendimento.
- Intenção só é utilizada com confiança **e** probabilidade da opção ≥ 0,85. Objeção tem o mesmo limiar, avaliado separadamente.
- O catálogo inicial só é omitido para saudação, agenda, recusa, opt-out, número errado ou pedido humano, com relevância financeira ≤ 0,05.
- Todas as mensagens originais, resumo e fatos continuam no contexto do agente. Todas as condições financeiras autorizadas continuam acessíveis pelas ferramentas, mesmo quando omitidas da mensagem inicial.
- A validação final usa a evidência original completa. A aplicação conserva revalidação de empresa/carteira, controle humano, consentimento, cadência, vigência e idempotência.
- Entrada sem texto/inbound é ignorada. Primeira abordagem não exige Jev. O teste de agente é uma simulação sem clientes ou envios reais.

## Falhas e dados

São enviadas no máximo seis mensagens recentes, com até 1.200 caracteres por texto após remoção de email, CPF/telefone, links e padrões de credenciais. O payload não inclui IDs de tenant/cliente/mensagem, cadastro completo, fatos importados ou catálogo bancário. Texto pode conter dados pessoais em linguagem livre; a remoção de padrões não equivale a anonimização integral.

Timeout de seis segundos, sem retry síncrono. Erro HTTP, timeout, distribuição inválida, opção desconhecida, consumo inválido ou modelo efetivo diferente do solicitado faz o agente usar seu contexto completo. Após falha, novas chamadas reais são suspensas por um minuto por processo. Jobs já possuem limitação e leases; o breaker não é controle de consentimento.

O resultado persistido registra status, modelo/promptVersion, classes aceitas, confiança, relevância, consumo, latência e seleção de contexto. Não registra resposta bruta do provider nem texto enviado ao Jev. A decisão OpenAI e o resumo comercial seguem seus contratos existentes.

## Configuração

Configurar somente no servidor/worker, nunca no navegador:

    TYPESAFE_API_KEY=
    JEV_ENABLED=false
    JEV_MODEL=jev-1.13.0

O modelo é fixado por versão para evitar mudanças silenciosas de limiares; aliases não são ativados. As duas condições, chave e JEV_ENABLED=true, são necessárias para consulta. O gateway não consulta Jev quando falta a chave OpenAI. Ativar Jev não modifica AI_OUTREACH_ENABLED ou WHATSAPP_OUTBOUND_ENABLED.

Homologação verificada em 2026-10-09: WEB sem OPENAI_API_KEY ou TYPESAFE_API_KEY; integração real continua pendente. Não foram feitas chamadas pagas ao Jev/OpenAI nesta validação.

## Evidência e limite da validação

35 testes de contrato Jev e 11 de concierge: configuração, intenção/objeção, limiares, relevância financeira, timeout/HTTP, redaction, mídia, versão/saída inválida, preservação de ferramentas e original, continuação de reasoning/function calls e rejeição de ações contraditórias.

São transportes simulados: não medem precisão do modelo, custo real ou ganho de latência. A seleção pode reduzir o catálogo inicial em casos simples; Jev também acrescenta uma chamada. Qualquer afirmação de economia depende de avaliação com modelo real, casos representativos e métricas separadas de tokens/latência/custo dos dois providers.
