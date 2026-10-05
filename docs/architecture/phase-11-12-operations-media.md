# Fases 11–12 — operação e anexos

## Operação diária

`/app` e `/platform/operations` consultam indicadores persistidos: clientes ativos, atendimentos abertos, retornos vencidos, próximos retornos em 24 horas, conclusões nos últimos sete dias e clientes sem consultor. A leitura usa uma transação Repeatable Read. Cada indicador e a fila prioritária respeitam empresa, equipes ativas do gestor ou distribuição atual do consultor. Clientes inativos ficam fora da operação. Retornos de atendimentos encerrados não contam como pendências.

Os indicadores abrem a fila CRM com filtro por etapa/retorno; a busca por cliente ou assunto mantém o mesmo escopo no banco. São exibidos até 20 retornos prioritários e 25 atendimentos por página. As datas na visão geral usam Brasília; os períodos são janelas móveis de 24 horas/sete dias, não contagens por dia de calendário. As telas reconsultam a operação enquanto visíveis.

Contas com vários vínculos escolhem a empresa em `/select-company` ou pelo seletor lateral. A seleção exige vínculo ativo com empresa ativa. A troca descarta o estado anterior por uma navegação completa. Login limpa a seleção antiga e logout remove sessão e seleção. O perfil de plataforma continua separado dos perfis das empresas.

Administradores alteram perfis e suspendem/restauram vínculos da empresa sem alterar a senha global. A última conta master ativa não pode ser removida: um lock por empresa serializa alterações concorrentes. Convites pendentes precisam ser ativados pelo titular. Contas compartilhadas não podem ser renomeadas pelo administrador de outra empresa. Gestores consultam apenas o diretório de suas equipes ativas; não recebem controles de administração global. Arquivar uma equipe suspende seu acesso operacional e bloqueia inclusão de membros até reativação.

Os convites CRM e de usuários entregam links `#token=` coerentes com a tela de ativação. O segredo fica no fragmento, é removido do histórico ao abrir a tela e continua armazenado somente como hash. Convites não redefinem senhas nem adicionam automaticamente contas globais já ativas a outra empresa.

## Importações com retomada

Cada aquisição do trabalho recebe uma identificação de posse aleatória, diferente mesmo quando a identificação do worker é reutilizada. Cada transação de linha condiciona uma atualização do Import à posse atual e mantém seu lock até o commit. A recuperação de timeout não pode ultrapassar uma transação em curso. Um processo que perder a posse descarta seu trabalho e não pode gravar clientes, erros, resumo, encerramento ou liberar a posse do sucessor. Resumo, evento de conclusão e estado da lista são finalizados juntos.

Upload, confirmação, início e consulta revalidam o vínculo no banco. A tela atualiza progresso, total finalizado e erros automaticamente; erros de acesso interrompem a atualização. O teste de processos separados mata um worker depois de um commit, envelhece explicitamente o heartbeat da fixture para antecipar o timeout, retoma as linhas restantes e verifica ausência de duplicação. Outro cenário retoma um processo antigo após a conclusão do sucessor e verifica que ele não grava novamente.

## Anexos privados

O download usa o contrato da versão 2.3.7: [rota oficial](https://github.com/evolution-foundation/evolution-api/blob/2.3.7/src/api/routes/chat.router.ts) e [implementação Baileys](https://github.com/evolution-foundation/evolution-api/blob/2.3.7/src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts). O servidor envia somente a chave da mensagem persistida e a instância da empresa. O navegador nunca recebe URL, chave de mídia ou credencial do provedor. Nenhuma mídia é copiada para o banco ou para um endereço público.

São suportados PDF, JPEG/PNG/WebP, áudio OGG/WAV/MP3/M4A e vídeo MP4 de até 8 MiB, com validação de tipo e assinatura. A resposta codificada é limitada antes do JSON e da decodificação. HTML, SVG e outros formatos não são disponibilizados. Arquivos usam nomes gerados pelo CRM, resposta attachment, no-store, nosniff e CSP sandbox. Conteúdo binário não entra nos eventos de auditoria/outbox; o evento registra apenas identificação, tipo e tamanho.

Inbox exige master/plataforma. No CRM, o download exige uma conversa vinculada a um atendimento e cliente no escopo atual. O acesso e a conexão são revalidados depois da consulta ao provedor: suspensão, redistribuição ou desativação durante a consulta impedem retornar os bytes. Arquivos expirados no WhatsApp podem ficar indisponíveis. Não há transcrição/OCR, arquivo permanente, importação retroativa, edição/exclusão ou recibos de leitura nesta entrega.

## Validação

- Lint, TypeScript e 80 testes locais passaram; duas verificações locais de infraestrutura foram ignoradas por ausência dos serviços locais.
- `harness:phase11:staging` passou com PostgreSQL isolado: indicadores/escopos, filtros, proteção do último master, contexto revogado, equipes arquivadas e processos separados de importação.
- `harness:phase12:staging` passou com PostgreSQL isolado e transporte simulado: PDF, contratos de instância/chave, isolamento, perda de acesso durante download e eventos sem conteúdo. Não comprova download de um anexo real do WhatsApp.
- Regressões das fases 2, 7–9 e 10 passaram em schemas temporários com limpeza verificada.
- `LIVE_HTTP_ACCEPTANCE=true pnpm harness:phase11:http` valida a versão publicada com usuários temporários e importação efetivamente processada pelo worker. A evidência de publicação é acrescentada depois da execução.

IA e envios reais continuam desativados conforme a decisão anterior. Produção permanece separada da homologação.

## Publicação verificada — 2026-10-05

- Código publicado: `0c7499d58780a7a8eb91b986b16f3a7cc5a03fe4`.
- WEB-STAGING: deployment `4f35cb46-cadb-4d93-9d0e-ab578264bf04`, `SUCCESS`.
- WORKER-STAGING: deployment `7696e317-cd8e-4038-b7b6-2023e74f137f`, `SUCCESS`; eventos `postgres_connected`, `redis_connected` e `worker_started` observados.
- Treze migrations públicas concluídas. Trinta e cinco arquivos principais de cada serviço correspondem ao código local por SHA-256 após normalização de newline. `/health` e `/ready` retornaram 200.
- A conexão BM Crédito foi consultada sem enviar mensagem: estado `open`. URL, autenticação, eventos `MESSAGES_UPSERT`/`CONNECTION_UPDATE`/`SEND_MESSAGE` e opções do webhook foram lidos e conferidos sem expor credenciais. Ambas as aplicações continuam sem chave OpenAI e com outbound desativado.
- Aceitação HTTP das fases 11–12 passou: indicadores/filtros por perfil e empresa, último master, diretório de equipes, revogação, links de convite em fragmento com uso único, troca de empresa/logout, proteções das rotas de mídia e CSV importado pelo worker efetivamente publicado. Fixtures removidas.
- O ingresso direto em `/app` de uma sessão válida com duas empresas e nenhuma seleção retornou 307 para `/select-company`; a fixture adicional foi removida.
- Regressões HTTP publicadas das fases 7–9, 10 e inbox passaram, com limpeza das fixtures, zero chamadas OpenAI e zero envios reais. A mídia positiva continua comprovada com transporte simulado; o HTTP publicado comprovou as barreiras de acesso, não um arquivo real recuperado do provedor.
- O navegador autenticado do usuário exibiu os quatro atendimentos fictícios, um retorno nas próximas 24 horas e um cliente na fila da equipe. O link de etapa abriu exatamente dois atendimentos novos; buscar Carla retornou um atendimento. Evidência visual privada mantida fora do Git.
- [PR cumulativo #14](https://github.com/bmcredito/master/pull/14) atualizado e mantido em draft. GitHub não apresentou checks para essa revisão; resultados locais/Railway não são apresentados como CI GitHub.

A publicação não altera a branch estável original nem promove produção. O status consolidado preserva as validações reais pendentes e as extensões de produto ainda não implementadas.
