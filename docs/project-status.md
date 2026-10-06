# Situação consolidada do projeto

O fluxo da arquitetura tem mecanismos implementados: importação → Customer 360 → planejamento de relacionamento → governança → WhatsApp/Evolution → análise de IA revisada → CRM → distribuição → trabalho do consultor. A continuidade inclui fila de envio governada, visão operacional, gestão de acesso/equipes e downloads privados de anexos. Implementação, homologação e operação real têm evidências distintas.

**Requisito central esclarecido pelo usuário:** a IA deve iniciar as conversas e conduzir o relacionamento dentro de um planejamento autorizado, com encaminhamento ao consultor. Esse fluxo proativo ainda falta; a análise manual atual não o substitui. Veja [IA proativa de relacionamento](architecture/proactive-ai.md). Ele passa a ser a prioridade funcional da continuidade.

**Roteiro original recuperado:** o chat `Execute Phase 0 do bmcredito/master` e seus 11 anexos foram identificados como a provável referência original pelo usuário. A [reconciliação com o código](architecture/original-project-reconciliation.md) registra a numeração original, a cobertura parcial da infraestrutura de mensagens e as lacunas de múltiplas conexões, entrada em fila, entrega/leitura, saúde e recuperação. A numeração 3–12 desta continuação não corresponde integralmente ao roteiro original. Não considerar as fases originais aceitas por equivalência de nomes.

| Área | Mecanismo | Limite atual |
| --- | --- | --- |
| Fundação e acesso | Sessões, capacidades, vínculos por empresa, seletor, proteção do último master | Contas globais já ativas não entram em outra empresa por convite novo; falta aceite autenticado específico |
| Importação | CSV/XLSX, confirmação, processamento por linhas, deduplicação, retry/DLQ e posse protegida | Reprocessamento administrativo de DLQ ainda depende de operação controlada |
| Customer 360 | Identificadores, fatos com origem/verificação, listas, tags e histórico | Dados importados exigem revisão de qualidade; não equivalem a dados verificados |
| Relacionamento/governança | Planos revisados/aprovados, consentimento, janela de contato e cooldown | Agendamento não é confirmação de envio ou lembrete automático |
| WhatsApp | Evolution 2.3.7, conexão/QR, webhook autenticado, deduplicação e histórico | Retenção e logs brutos do provedor precisam de tratamento antes de produção |
| IA | Fila, limite, fingerprint, análise estruturada e nota após revisão humana | Sem chave por decisão do usuário; avaliação com modelo real pendente |
| CRM e distribuição | Clientes/conversas vinculados, etapas, notas, retornos, equipes e responsáveis | Não representa simulação bancária, formalização de contrato ou integração com bancos |
| Envios | Revisão de número/texto, confirmação, revalidação, fila e resultado incerto sem retry | Flag desativada; envio real autorizado e sua comprovação continuam pendentes |
| Operação | Indicadores, retornos prioritários, busca e filtros por perfil | Períodos móveis; não inclui relatórios financeiros ou alertas automáticos |
| Anexos | Download autenticado de PDF/imagem/áudio/vídeo até 8 MiB | Prova com transporte simulado; anexo real, OCR/transcrição e arquivo permanente pendentes |
| Publicação | WEB/WORKER separados, migrations controladas, schemas de aceitação isolados | PRs cumulativos em revisão; produção não foi promovida |

## Próximos requisitos de operação real

1. Ativar a IA quando o usuário decidir fornecer a configuração no Railway; avaliar qualidade e segurança com dados de teste antes de usá-la em atendimento real.
2. Validar um envio real com destinatário e texto explicitamente autorizados. Configurar a flag em WEB e WORKER e verificar o resultado sem confundir aceitação do provedor com entrega/leitura.
3. Validar o download de um arquivo de teste recebido pelo WhatsApp. O download implementado depende da disponibilidade no provedor, não garante retenção permanente.
4. Resolver retenção/redação dos logs e dados do Evolution, política de dados do CRM, backup/restauração e a configuração independente de produção.
5. Concluir revisão/integração no repositório original e observar CI e a versão efetivamente publicada. Não há permissão de escrita na branch estável original nesta sessão.

Extensões de produto ainda sem mecanismo: aceite autenticado para ingresso de uma conta existente em outra empresa; transporte de e-mail; mídia/OCR/transcrição com IA; recibos/edição/exclusão de mensagens; exportação/portabilidade; alertas de retornos; relatórios comerciais; e integrações financeiras. Esses itens não devem ser apresentados como concluídos.

As fases 0–10 têm documentos históricos em `docs/architecture`. O comportamento mais recente está em [operações e anexos](architecture/phase-11-12-operations-media.md). Homologação com dados fictícios não comprova que produção ou um atendimento real estão prontos.

## Última entrega verificada

Fases 11–12 publicadas em WEB/WORKER com status terminal `SUCCESS` e código `0c7499d`. Passaram 80 testes locais, build/lint/TypeScript, aceitação isolada de operações/anexos e regressões, além da aceitação autenticada publicada com importação processada pelo worker. A conexão BM Crédito permaneceu aberta. IA e envio real continuam desativados. O [PR #14](https://github.com/bmcredito/master/pull/14) segue em draft, sem checks GitHub reportados. IDs de deployment e os limites de cada prova constam no documento das fases.
