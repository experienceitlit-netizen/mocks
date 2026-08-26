# FUTURO — fora do MVP (Fase 6 do plano)

Itens registrados para depois da validação do MVP com o negócio. Nenhum deles está
implementado; a ordem abaixo não é prioridade.

- **Ingestão automática de linhagem do Unity Catalog / Databricks** — gerar (ou conciliar)
  nós e arestas a partir da linhagem real das tabelas, em vez de manutenção manual do catalogo.csv.
- **Modo de edição na UI** — formulário na própria página que grava o catálogo via pull
  request, mantendo o Git como trilha de auditoria. *Atendido na versão dev server: o
  formulário multi-nível ("+ Novo componente" / "✎ Editar" no balão) cadastra e edita
  produtos e componentes, gravando o `catalogo.csv` e regenerando o `graph.json` pela
  API local (`/api/catalogo`); falta a variante com PR e trilha de auditoria no Git.
  Os níveis também são cadastráveis pelo modal "≣ Níveis" (`/api/niveis` → `niveis.csv`),
  e o formulário exclui uma linha junto com as menções a ela.*
- **Autenticação corporativa e deploy interno oficial** — hoje o MVP é estático e sem
  login; a versão oficial precisa de SSO e hosting interno padrão.
- **Visão por sistema e visão por owner** — agrupar/clusterizar o grafo por fonte
  (Databricks, planilhas, legado on-premise...) e por responsável. *Parcialmente atendida
  pela camada de linhagem (toggle "Fontes e origens" + modo foco); falta a visão por owner.*
- **Ligação por clique no grafo** — criar `Consome/Upstream` e `Associações` arrastando
  de um componente ao outro no mapa, sem abrir o formulário. Especificação escrita em
  [`docs/ligacao-por-clique.md`](docs/ligacao-por-clique.md): o gesto é barato (a gravação
  é a mesma do formulário), o que falta decidir é qual relação o gesto cria, a direção do
  arraste e o desfazer.
- **Exportar subgrafo como imagem** — recorte do grafo (um nó + vizinhança, ou o resultado
  de um filtro) em PNG/SVG para apresentações executivas.
