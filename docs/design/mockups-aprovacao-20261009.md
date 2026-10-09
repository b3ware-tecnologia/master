# BM Crédito — 10 mockups para aprovação

Pedido: gerar 10 imagens antes de consolidar o frontend. Dez imagens foram concluídas no gerador integrado por escolha do usuário. Em 09/10/2026 o usuário aprovou a direção visual: “o mockup tá legal, vamos seguir nessa direção”. A aprovação orienta o frontend; as imagens não comprovam funcionalidades publicadas.

## Direção comum

Direção visual aprovada em 09/10/2026. O pedido posterior acrescenta um chat web para continuidade do atendimento ao cliente, cujo desenho deve reutilizar a identidade aprovada sem expor a interface administrativa.

Aplicar a skill Astra Frontend Design: hierarquia orientada ao trabalho, conteúdo verdadeiro, densidade adequada, estados claros e identidade consistente. Referências de linguagem visual: Banco Inter, Nubank e C6. Manter marca própria BM Crédito, sem copiar logotipos ou telas dessas instituições.

Público: empresas contratantes, gestores e consultores. Não criar portal de tomador de crédito. Sidebar branca com marca BM, navegação discreta e seleção de empresa. Canvas cinza muito claro, texto grafite, laranja queimado como cor de ação, cantos moderados e divisórias suaves. Usar tipografia sem serifa com números tabulares, contraste legível e espaçamento consistente. Dados fictícios devem aparecer explicitamente como “Demonstração · dados fictícios”. Não expor informações reais de clientes.

São propostas visuais. Controles novos ou arranjos ainda não implementados não devem ser apresentados como funcionalidades já disponíveis. Imagens estáticas não comprovam motion: na implementação, prever apenas feedback breve de seleção, abertura de painel e salvamento, respeitando movimento reduzido.

Modelo identificado no catálogo: `openai/gpt-image-2.5/sunburst/text-to-image`. A conta Fal Érico Andrade estava bloqueada por saldo esgotado; nenhuma geração foi submetida ao Fal. Após ser informado do bloqueio e da ausência de seletor de versão, o usuário escolheu “Usar o gerador integrado do Codex”. Foram concluídas 10 imagens nesse gerador, sem confirmação da versão do modelo. A primeira versão do funil foi descartada por baixa legibilidade e refeita. As telas 02–10 usam a imagem 01 como referência visual. Os prompts efetivamente utilizados e as origens estão em `output/mockups/20261009/prompts-e-origem.json`; a galeria está em `output/mockups/20261009/index.html`. Direção visual aprovada pelo usuário em 09/10/2026; nenhuma dessas propostas foi publicada.

## Prefixo de todos os prompts

> Use case: ui-mockup. Create ONE high-fidelity BM Crédito internal SaaS interface for visual approval, with crisp readable Brazilian Portuguese typography. This is an operational workspace for company managers and credit consultants, not a marketing landing page, consumer bank account or borrower portal. Design a flat, straight-on full-screen interface, not a device photograph, perspective render or collage. Render the exact requested Portuguese labels. Use the same distinctive design system throughout: a small orange BM monogram and “BM Crédito”, white 240px desktop sidebar, soft gray #F6F7F9 canvas, white surfaces, graphite #23252D text, muted #666C79 supporting text, burnt orange #BE4616 primary actions and pale orange #FFF0E7 selection. Rounded 12–16px surfaces, 8px control corners, subtle separators, restrained shadows, simple consistent outlined icons, legible numbers, ample but operational spacing. No purple gradients, decorative 3D objects, bank logos, fake financial balances, approval promises or fabricated financial rates. A visible discreet label must read “Demonstração · dados fictícios”. Navigation: “Visão geral”, “Operação comercial”, “Atendimentos”, “Conversas”, “IA de relacionamento”, “Envios”, “Equipe”, “Configurações”; selected item follows the screen. Company selector: “BM Crédito · Demonstração”. No lorem ipsum. Treat named sample customers as fictional. Make the hierarchy feel like a thoughtfully crafted Brazilian digital banking business tool.

## 01 — Visão geral do gestor

**Trabalho principal:** localizar os atendimentos que precisam de atenção e continuar o fluxo.

> Desktop landscape. Selected navigation “Visão geral”. Title “Sua operação, em um só lugar.” Small supporting text “Acompanhe clientes, conversas e próximos passos.” Show three prominent metrics aligned in a calm horizontal summary: “Atendimentos abertos” 24, “Retornos vencidos” 3 with text label “Atenção”, “Retornos nas próximas 24h” 8. A quieter secondary strip has “Contatos na base” 120, “Concluídos em 7 dias” 12, “Sem consultor” 4; explicitly these are demonstration values, not production metrics. Below show an operational stage distribution, not a revenue chart: “Novos” 9, “Em atendimento” 10, “Aguardando cliente” 5, with precise horizontal bars. Next to it a compact “Para agora” action list: “Priorizar retornos”, “Organizar atendimentos”, “Ver oportunidades”. Bottom has a readable table “Retornos prioritários”, three fictional rows with client, consultant, due time and “Abrir”. Distinguish deadlines in words as well as color. A single orange primary action “Abrir atendimentos”. No decorative hero image or fictional conversion growth.

## 02 — Funil de oportunidades

**Trabalho principal:** acompanhar a evolução das conversas com origem e responsável claros.

> Desktop landscape. Selected “Operação comercial”. Title “Oportunidades”. Peer tabs “Oportunidades”, “Base de contatos”, “Estratégias”, “Catálogo”, “Cadência”. A low-noise counter strip distinguishes “Contatos cadastrados” 120, “Contatos com envio” 32, “Contatos com resposta” 14, “Oportunidades” 14. Helper copy “Uma resposta cria uma oportunidade.” Present five visible columns of a horizontally continuing kanban: “Respondeu” 4, “Em conversa com IA” 4, “Qualificado” 3, “Com consultor” 2, “Proposta enviada” 1. Cards have fictional names, concise next-step summary, source “Campanha de relacionamento”, consultant avatar initials and timestamp. One selected card subtly outlined orange, “Cliente Demo 01”, summary “Quer entender as opções disponíveis”, owner “Ana · Consultora”. No claim of credit approval, no bank balances. Use compact cards with purposeful hierarchy, no tiny illegible text. Include a restrained horizontal overflow cue for remaining stages rather than compressing all 15 columns.

## 03 — Detalhe da oportunidade

**Trabalho principal:** entender contexto, decidir o próximo passo e manter o controle humano.

> Desktop landscape with an opportunity detail drawer alongside a softly subordinate opportunity list. Main title “Cliente Demo 01”, badge “Com consultor”, origin “Campanha de relacionamento”, owner “Ana · Consultora”. Show a concise “Resumo da conversa” block: “Cliente pediu informações. Precisa confirmar convênio e interesse antes de receber opções.” Then a clean chronological “Histórico” with four small dated entries, no sensitive documents or identifiers. “Próximo retorno” card with date, reason “Confirmar interesse” and “Aguardando revisão”. Prominent control “IA pausada · atendimento humano” and clear action “Pedir sugestão ao copiloto”; include “Alterar etapa” as secondary and note “Alterações de etapa pausam a IA”. Small footer “Sugestões não substituem a decisão da equipe.” Do not show autonomous approval, invented scoring probabilities, a real credit contract or an automatic irreversible transition. Use a readable detail panel rather than nested dashboard cards.

## 04 — Conversas com contexto

**Trabalho principal:** ler a conversa e consultar contexto comercial sem perder o histórico.

> Desktop landscape. Selected “Conversas”. Three-pane operational composition: 260px searchable conversation list; spacious message history in the center; 300px customer context on the right. Header “Conversas”, small status “IA aguarda configuração”. Conversation list contains three fictional sample contacts, selected “Cliente Demo 01”. Central chat has clear incoming/outgoing bubbles: client “Olá, gostaria de entender as opções.”; a clearly labeled demonstration AI message “Sou a assistente virtual da BM Crédito. Posso entender o que você procura?”; client “Quero falar com um consultor.” Include small timestamps and delivery labels. This is a simulated history, not a claim of real sending. Right context: “Cliente Demo 01”, “Responsável: Ana”, “Etapa: Com consultor”, “IA pausada”, “Resumo”, “Próximo passo: continuar atendimento”. Primary contextual action “Abrir atendimento”. Do not invent a free-form sending composer or operational bot activation switch; render a read-only history footer “Histórico da conversa”. Product calmness, clear hierarchy, no messaging phone-number exposure.

## 05 — Campanhas de relacionamento

**Trabalho principal:** revisar audiência e estratégia antes de autorizar a operação.

> Desktop landscape. Selected “IA de relacionamento”. Title “Relacionamento com intenção”. Supporting sentence “Prepare a abordagem e acompanhe cada conversa.” Show a campaign table with three fictional rows: “Relacionamento inicial”, badge “Rascunho”; “Retorno de interesse”, badge “Pausada”; “Revisão de carteira”, badge “Aguardando aprovação”. Columns “Estratégia”, “Público”, “Canal”, “Status”. Selected draft opens a right summary panel with “Estratégia aprovada”, “Público revisado”, “Consentimento verificado”, “Limites de envio” in plain language. An orange action “Revisar campanha”, not “Enviar agora”. Explicit status banner “IA e envio real desativados nesta demonstração”. Small cadence summary “Dias úteis · 9h às 18h · Brasília”. Demonstration audience counts clearly labeled. No fictional sent-message success, mass-blast aesthetics, guaranteed conversion or automatic authorization.

## 06 — Estratégia e teste da IA

**Trabalho principal:** escrever, revisar e aprovar o comportamento comercial.

> Desktop landscape. Selected “Operação comercial”, active tab “Estratégias”. Title “Uma estratégia clara para cada conversa”. Two-column workspace. Left main form with persistent labels “Nome da estratégia”, “Instrução comercial”, sample plain instruction “Inicie com uma apresentação breve, entenda a necessidade e ofereça encaminhamento à equipe.” Then fields “Objetivo”, “Tom de voz”, “Assuntos permitidos”, “Quando encaminhar”. Right review panel “Versão 2 · Em revisão”, meaningful checklist “Apresentação transparente”, “Sem promessas de aprovação”, “Respeitar pedido de não contato”, and sample first-message preview explicitly “Exemplo fictício”. Actions “Salvar revisão”, separate checkbox “Revisei e autorizo esta versão”, then “Aprovar versão salva” disabled until saved and checked. A small “Testar agente” section shows “Aguarda configuração” and explains simulation does not send messages. Optional tiny Jev mention “Triagem de intenção”, no provider API keys, model strings or JSON dumped into the interface.

## 07 — Catálogo financeiro

**Trabalho principal:** verificar produto, fonte e vigência das informações usadas pela equipe e IA.

> Desktop landscape. Selected “Operação comercial”, active tab “Catálogo”. Title “Informação confiável para orientar a conversa”. A clean product table with fictional institution “Instituição de demonstração”, product “Consignado · exemplo”, agreement “Convênio de exemplo”, state “Rascunho”, validity dates and source link “Consultar fonte”. Do NOT invent financial percentages or terms: show “Taxa: não informada”, “CET: não informado”, “Prazo: não informado”. Detail panel “Condição em revisão”, a short approved-copy field “Consulte a equipe para verificar disponibilidade e condições.”, source “example.com · exemplo fictício”, valid-from and valid-until input labels. Action “Salvar rascunho” and disabled “Publicar condição” with explanation “Verifique a fonte e os termos antes de publicar.” Footer “Condições vencidas ou em rascunho não são disponibilizadas à IA.” Premium restrained typography with precise tables, not consumer credit offer cards.

## 08 — Equipe e atendimentos

**Trabalho principal:** acompanhar responsabilidades e organizar a fila com escopo de equipe.

> Desktop landscape. Selected “Equipe”. Title “Pessoas certas, próximos passos claros.” Role context “Gestor · Equipe demonstração”. Main operational table with fictional consultants “Ana Demo”, “Bruno Demo”, “Carla Demo”, columns “Consultor”, “Atendimentos abertos”, “Retornos hoje”, “Sem responsável”; demonstration counts 8/3/0, 9/2/0, 7/3/0. Adjacent compact panel “Fila da equipe” with four unassigned sample customers and a clear “Revisar distribuição” action, not an invented automatic ownership algorithm. A lower selected customer row shows owner dropdown “Escolher consultor”, orange “Salvar responsável”, secondary “Abrir atendimento”. Include scope note “Você acompanha os atendimentos das suas equipes.” No fake online presence, credit targets, commissions, ranking or predictive employee performance. Use list and table hierarchy rather than repeated decorative profile cards.

## 09 — Conexões WhatsApp e cadência

**Trabalho principal:** entender estado do canal e ajustar limites com clareza.

> Desktop landscape. Selected “Configurações”. Title “Canais de relacionamento”. Tabs “Conexões”, “Cadência”, “Empresas”. Two fictional demo connections displayed as purposeful rows: “Canal demonstração 01”, state “Desativado”; “Canal demonstração 02”, state “Não conectado”. No real QR code, real number or false green connected state. A visible banner “Envio real desativado”. On right show cadence form for first disabled sample channel: “Limite diário” 20, “Limite por hora” 5, “Novos contatos por dia” 10, “Retornos por dia” 5, “Intervalo mínimo” 60 segundos, weekdays, hours 9–18 and “Horário de Brasília”. Single primary action “Salvar limites”. Neutral amber notice “Conecte o canal para verificar o estado”. Distinguish connection state from sending permission. No invented health score, delivery percentage, system JSON or provider secrets.

## 10 — Experiência móvel do consultor

**Trabalho principal:** escolher o retorno prioritário e abrir o atendimento no celular.

> Portrait high-fidelity mobile internal BM Crédito app screenshot, full flat canvas without a device frame. Same brand, orange accent, gray/white surfaces and typography as the desktop system. Compact topbar with BM monogram, “Minha carteira”, menu button and accessible theme control; visible “Demonstração · dados fictícios”. Greeting “Bom dia, Ana.” Three compact task counts “8 em atendimento”, “3 retornos hoje”, “1 vencido”. Main section “Priorize agora” with a readable row “Cliente Demo 01”, “Confirmar interesse”, textual badge “Retorno vencido” and large orange “Abrir atendimento”. Next two upcoming list items with time, next step and subtle chevrons. Bottom utility navigation “Início”, “Atendimentos”, “Conversas”, “Conta”, clearly selected first item. Minimum 44px target appearance, no tiny desktop tables, no 15-column board shrunk to a phone, no account balance or loan offer. This is a company consultant workspace, not the consumer requesting credit.

## Critérios da aprovação visual

- Conferir se as 10 telas pertencem ao mesmo sistema e se a direção bancária combina com BM Crédito.
- Validar hierarquia, densidade, legibilidade e separação entre base de contatos, oportunidade e atendimento.
- Aprovar ou ajustar composição e linguagem visual antes de consolidar novas alterações no frontend.
- Após aprovação, verificar funcionalidades e estados reais no navegador; imagens geradas não substituem essa validação.
