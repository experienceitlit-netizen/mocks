# FUTURO — fora do MVP (Fase 6 do plano)

Itens registrados para depois da validação do MVP com o negócio. Nenhum deles está
implementado; a ordem abaixo não é prioridade.

- **Ingestão automática de linhagem do Unity Catalog / Databricks** — gerar (ou conciliar)
  nós e arestas a partir da linhagem real das tabelas, em vez de manutenção manual do vault.
- **Modo de edição na UI** — formulário na própria página que grava o `.md` via pull
  request, mantendo o Git como trilha de auditoria.
- **Autenticação corporativa e deploy interno oficial** — hoje o MVP é estático e sem
  login; a versão oficial precisa de SSO e hosting interno padrão.
- **Visão por sistema e visão por owner** — agrupar/clusterizar o grafo por fonte
  (Databricks, planilhas, legado on-premise...) e por responsável. *Parcialmente atendida
  pela camada de linhagem (toggle "Fontes e origens" + modo foco); falta a visão por owner.*
- **Exportar subgrafo como imagem** — recorte do grafo (um nó + vizinhança, ou o resultado
  de um filtro) em PNG/SVG para apresentações executivas.
