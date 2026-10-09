# Versão de homologação — BM Crédito

Código da versão: `0be1350`, branch `phase/consignado-commercial-core` no fork `b3ware-tecnologia/master`. Esta é uma versão para testes operacionais; não é uma declaração de conclusão integral das 58 seções da especificação.

## Acesso

- Login: https://web-staging-staging-4754.up.railway.app/login
- Operação comercial da demonstração: https://web-staging-staging-4754.up.railway.app/platform/commercial?tenantId=cmuvr9q670000p93yezf0kxg8
- Visão geral da demonstração: https://web-staging-staging-4754.up.railway.app/platform/operations?tenantId=cmuvr9q670000p93yezf0kxg8

Entre com sua conta existente. Na administração, selecione **Demonstração CRM — dados fictícios**. A empresa real BM Crédito continua separada. Nenhuma senha de usuário existente foi alterada.

## Roteiro de teste

1. **Visão geral:** confira os indicadores calculados, retornos pendentes e atalhos para atendimento.
2. **Operação comercial:** há quatro oportunidades fictícias. Busque um nome, mostre ou esconda etapas vazias e abra o atendimento vinculado. Alterações de etapa pedem justificativa e são persistidas.
3. **Atendimentos:** consulte o histórico, registre nota, distribua para a equipe de teste e programe um retorno. Reabra a tela para conferir a persistência.
4. **Estratégias:** revise a estratégia fictícia da Vanessa. Uma estratégia aprovada é imutável; crie outra para experimentar a edição e a aprovação.
5. **Testar agente:** selecione a estratégia de demonstração e um dos 16 cenários. Sem a configuração da OpenAI, o pedido fica explicitamente aguardando configuração e não é executado depois sem uma nova solicitação.
6. **Catálogo:** cadastre rascunhos com fonte e vigência; revise antes de publicar. Nenhuma taxa ou condição bancária real foi inventada para preencher a demonstração.
7. **Celular e temas:** abra o menu, navegue entre as áreas e alterne entre claro e escuro. O quadro permite rolagem horizontal dentro da própria área.

A demonstração não possui um WhatsApp conectado. Os controles de conexão e envio pertencem à empresa selecionada e não devem ser confundidos com a empresa real.

## Evidências

- 164 testes unitários passaram; dois testes de conectividade foram pulados.
- TypeScript, ESLint e build passaram. Permanece o aviso de configuração do plugin Next no ESLint; o build não falhou.
- Aceitação de banco/worker em schema isolado: 15 migrations, 10 mil contatos fictícios, 20 conexões fictícias, duas gerações simuladas e limpeza confirmada. Não representa capacidade medida com números reais.
- HTTP autenticado publicado: acesso, isolamento por empresa, VIEWER sem escrita, revogação, estratégia editada/aprovada, idempotência do teste inicial e redirecionamento de sessão expirada passaram.
- A conferência visual cobre desktop de 1440 px e celular de 390 px, tema escuro, navegação e registro de teste pela interface. Capturas e relatório são artefatos locais em `output/acceptance/20261009`.

Publicação final observada em `SUCCESS` nos dois serviços:

- WEB: `1b572dad-ba56-4d99-b983-05ca360ee9d8`.
- WORKER: `8b5bd362-0770-447e-80b7-eb8ca61a6d4c`.
- Dez arquivos essenciais tiveram hashes comparados entre checkout, WEB e WORKER, todos iguais. As 15 migrations foram verificadas no banco; `/health` e `/ready` responderam 200, e o worker iniciou conectado ao PostgreSQL e Redis.
- A verificação final teve 15 checks no navegador e 15 capturas, sem exceções de página ou respostas 5xx nas rotas exercitadas. Também foram testados busca, alternância de etapas vazias e abertura do atendimento correto a partir da oportunidade.
- O teste HTTP foi repetido na publicação final e passou. Em WEB e WORKER, OpenAI segue sem chave e as flags de IA proativa e de envio real estão desativadas.

## O que continua pendente

- Configurar a OpenAI e avaliar as respostas reais do GPT-6 Luna; não houve chamada real ao modelo nesta entrega.
- Configurar a TypeSafe caso se queira ativar a triagem opcional Jev.
- Validar envio real e recibos com destinatário autorizado. Flags de envio e de campanha automática permanecem desativadas.
- Implementar o chat web para clientes com convite individual e continuidade independente do WhatsApp. A arquitetura está documentada; não existe link de conversa web funcional nesta versão.
- Integrações bancárias, contratação/formalização, leitura de mídia por IA, portabilidade completa e os demais itens da especificação que não estão cobertos pelo núcleo atual precisam de entregas próprias.

Veja o [prompt e roteiro da Vanessa](vanessa-prompt-acceptance.md) e a [especificação do produto](../product/bm-credito-specification.md).
