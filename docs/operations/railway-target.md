# Destino autorizado do Railway

Confirmado por login do usuário e `railway whoami` em 27/10/2026:

- Conta: **erico.andrade@b3ware.com.br**.
- Workspace: **bmcredito's Projects**, `973833cf-029d-4847-afc4-fdc1605ae434`.
- Projeto: **diplomatic-flow**, `aaead46d-3d45-4146-ae6d-ce6174222723`.
- Ambiente: **production**, `9db10446-a59f-4da2-b7ca-dbfd1fb72539`.

O arquivo `ops/railway-target.json` registra os identificadores. O script `scripts/Deploy-BM.ps1` confere o e-mail, workspace e projeto antes de publicar, sempre passando os IDs explicitamente. A pasta de trabalho também foi vinculada ao projeto correto pela CLI. Nenhuma credencial é registrada neste documento ou no Git.

**Não usar a conta contato@b3ware.com.br nem o projeto ef26eb2e-9425-471c-a647-65d93c0b1b8a para novas publicações do BM Crédito.** O usuário esclareceu que esse era o Railway incorreto. Os registros anteriores que citam esse destino são históricos.

A publicação `e26d68fd-bf42-4997-8dd4-6753eb758fed` nessa conta anterior foi cancelada antes de iniciar a versão nova. Os nomes originais dos ambientes foram restaurados, o domínio temporário foi removido, as variáveis adicionadas foram retiradas sem deploy, e IA/envios voltaram a `false`. A verificação confirmou as 17 migrations anteriores, com a versão já existente preservada. A chave SSH temporária dessa etapa foi removida.

Na conta correta, os serviços estavam parados. As tentativas de iniciar PostgreSQL/Redis e criar Evolution foram recusadas pelo Railway: **“Your trial has expired. Please select a plan to continue using Railway.”** O usuário decidiu ativar o plano depois. A nova versão ainda não foi publicada nessa infraestrutura. Não trocar silenciosamente de conta para contornar essa restrição.

O ambiente local descrito em `docs/operations/local-windows.md` funciona sem Railway. A ativação posterior da produção ainda precisa provisionar/configurar os serviços, segredos e conta inicial nesse destino correto.
