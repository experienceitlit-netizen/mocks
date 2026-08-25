# ULTRA PLAN — Mapa de Dados Navegável do Atacado (MVP)

> **Como usar este arquivo:** coloque-o na raiz de um repositório vazio e rode `claude` no terminal.
> Peça: *"Leia o PLANO-mapa-dados-atacado.md e execute a Fase 0. Ao final de cada fase, pare, mostre o resultado e aguarde meu OK antes de seguir."*
> Cada fase tem critérios de aceite verificáveis. Não pule fases.

---

## 1. Contexto e objetivo

Sou arquiteto de soluções na Diretoria Comercial Atacado de um grande banco. Mapeei ~23 produtos/dados
consumidos e produzidos pelo Atacado (catálogo abaixo, em `## 7. Seed data`). Quero um **MVP web navegável
estilo grafo do Obsidian**: a área de negócio abre no navegador, vê as "bolinhas" (produtos de dados) conectadas
(quem consome o quê), clica em um nó e enxerga descrição, domínio, origem, sistema, owner, centro de custo e
status de débito técnico.

**Objetivo do MVP:** validar com o negócio a experiência de navegar o mapa — não é o catálogo corporativo
definitivo. Simplicidade > completude.

**Mensagem-chave que a UI deve transmitir:** nós sem owner/centro de custo aparecem visualmente "incompletos"
(borda tracejada) — o gap de governança tem que doer no olho.

## 2. Decisões de arquitetura (já tomadas — não rediscutir)

| Decisão | Escolha | Racional |
|---|---|---|
| Formato do conteúdo | **Arquivos Markdown com frontmatter YAML + wikilinks `[[Nome]]`** (modelo Obsidian) | O negócio pode editar um arquivo por dado; Git vira trilha de auditoria; compatível com abrir o mesmo vault no Obsidian desktop |
| Front-end | **React 18 + Vite + TypeScript** | Padrão, rápido, sem servidor |
| Grafo | **`react-force-graph-2d`** (canvas, força dirigida) | Efeito Obsidian pronto: física, zoom, drag, hover |
| Parse do vault | **`gray-matter`** (frontmatter) + regex para `[[wikilinks]]` no corpo | Sem parser exótico |
| Build de dados | Script Node (`scripts/build-graph.ts`) que varre `vault/**/*.md` e emite `src/data/graph.json` | Dados desacoplados do app |
| Estilo | CSS puro ou Tailwind (escolha na Fase 2) — paleta: fundo `#1E1E1E` (dark, como Obsidian), vermelho `#CC092F` p/ produtos do Atacado, verde `#3A7D44` p/ curados, cinza `#8A8A8A` p/ a confirmar, âmbar `#B8860B` p/ legado | Coerente com a apresentação executiva que originou o projeto |
| Deploy do MVP | `npm run build` → estático (abre local ou em qualquer static hosting interno) | Sem backend, sem autenticação nesta fase |
| Sem | Backend, banco, login, editor visual, Unity Catalog | Fora do MVP (ver Fase 6 / futuro) |

## 3. Modelo de dados

Cada arquivo em `vault/` é um **nó**. Frontmatter obrigatório:

```yaml
---
id: rar-12m                # slug único (kebab-case)
nome: RAR 12M
tipo: produto              # produto | insumo | sistema | dominio
dominio: Resultado         # Cadastro | Mercado | Risco | Resultado | Regulatorio | A definir
origem: "Atacado — cálculo"
sistema: "engine própria → Databricks"
descricao: "Retorno ajustado ao risco consolidado em 12 meses"
centro_de_custo: null      # null = a definir (nó renderiza incompleto)
owner: null                # null = a definir (nó renderiza incompleto)
debito: nao                # sim | nao | avaliar
status: producao           # producao | transicao | investigacao
---
Corpo livre em markdown. Links criam arestas:
Consome [[GDAD]], [[ESTATAG]] e [[Capital Regulatório]].
```

**Arestas:** todo `[[wikilink]]` no corpo gera aresta direcionada `este nó → alvo` com rótulo `consome`
(default). Sintaxe opcional `[[Alvo|produz]]` muda o rótulo. Link para nó inexistente = **warning no build**
(não erro) e nó "fantasma" cinza tracejado no grafo — igual ao Obsidian.

**graph.json (saída do build):**
```json
{ "nodes": [{ "id", "nome", "tipo", "dominio", "debito", "owner", "centroDeCusto", "descricao", "sistema", "origem", "status", "incompleto": true }],
  "links": [{ "source", "target", "label" }] }
```
`incompleto = owner == null || centro_de_custo == null`.

## 4. Fases de execução

### Fase 0 — Bootstrap (30 min)
- [ ] `npm create vite@latest mapa-dados-atacado -- --template react-ts`
- [ ] Instalar: `react-force-graph-2d`, `gray-matter`, `tsx` (dev)
- [ ] Estrutura de pastas:
  ```
  vault/                  # os .md (conteúdo)
    _template.md
  scripts/build-graph.ts
  src/data/graph.json     # gerado, commitado
  src/components/{Graph,DetailPanel,Filters,SearchBox}.tsx
  ```
- [ ] Scripts npm: `"data": "tsx scripts/build-graph.ts"`, e `predev`/`prebuild` chamando `data`
- **Aceite:** `npm run dev` abre página "Mapa de Dados do Atacado" vazia sem erros.

### Fase 1 — Vault + build de dados (1-2 h)
- [ ] Criar os **23 arquivos .md** do seed (seção 7) em `vault/`, um por produto/insumo
- [ ] Implementar `build-graph.ts`: varre vault, parseia frontmatter, extrai wikilinks, valida campos
      obrigatórios, resolve links por `nome` OU `id` (case-insensitive), emite `graph.json`
- [ ] Warnings legíveis no console: link quebrado, frontmatter faltando campo, id duplicado
- **Aceite:** `npm run data` gera `graph.json` com 23+ nós e ≥14 arestas; rodar duas vezes = mesmo output
  (determinístico); quebrar um link de propósito gera warning e nó fantasma.

### Fase 2 — O grafo (2-3 h)
- [ ] `Graph.tsx` com `react-force-graph-2d` consumindo `graph.json`
- [ ] Cor do nó por regra (nesta ordem de precedência):
      1. `debito == sim` → vermelho `#CC092F`
      2. `debito == avaliar` → cinza `#8A8A8A`
      3. `sistema` contém "legado"/"on-premise" → âmbar `#B8860B`
      4. default (curado/governado) → verde `#3A7D44`
- [ ] Nó `incompleto` → **borda tracejada branca** (desenho custom no `nodeCanvasObject`)
- [ ] Tamanho do nó ∝ grau (nº de conexões); rótulo sempre visível abaixo do nó (fonte ~10px, branca)
- [ ] Hover: destaca nó + vizinhos diretos + arestas; resto esmaece (opacidade 0.15)
- [ ] Zoom/pan/drag nativos; física estabiliza e congela (`cooldownTicks`)
- **Aceite:** grafo renderiza os 23 nós legíveis em 1080p; hover no RAR 12M acende GDAD, ESTATAG e
  Capital Regulatório; performance fluida (60fps com <100 nós).

### Fase 3 — Painel de detalhe (1-2 h)
- [ ] Clique no nó abre `DetailPanel` (drawer à direita, ~360px):
      nome, domínio (chip colorido), descrição, origem, sistema, débito (chip Sim/Não/A avaliar),
      **owner e centro de custo** (se null: "⚠ a definir" em destaque), corpo markdown renderizado,
      listas "Consome →" e "← Consumido por" com links clicáveis que navegam o grafo (centraliza + seleciona)
- [ ] `Esc` ou clique fora fecha; URL reflete seleção (`?no=rar-12m`) p/ compartilhar link direto
- **Aceite:** clicar em GDAD mostra "← Consumido por: RAR 12M, Evolução (EVOL)"; abrir a URL com `?no=` já
  seleciona o nó.

### Fase 4 — Busca e filtros (1-2 h)
- [ ] `SearchBox` (topo): filtra por nome/descrição com realce no grafo; `Enter` centraliza no 1º resultado
- [ ] `Filters` (lateral esquerda ou topo):
      - por **domínio** (chips multi-select)
      - por **débito** (Sim / Não / A avaliar)
      - toggle **"somente sem owner"** ← o botão que interessa na reunião de governança
- [ ] Filtro esmaece (não remove) os nós fora do critério, mantendo o layout estável
- [ ] Contador vivo: "23 dados • 8 com débito • 21 sem owner"
- **Aceite:** toggle "somente sem owner" acende praticamente o mapa inteiro; combinar filtros funciona.

### Fase 5 — Polimento e empacotamento (1 h)
- [ ] Legenda fixa (cores + tracejado) canto inferior
- [ ] Título e subtítulo institucionais; favicon
- [ ] `README.md`: como adicionar um dado novo (copiar `_template.md`, preencher, `npm run data`),
      convenções de frontmatter, como rodar
- [ ] `npm run build` gera estático; testar `npx serve dist`
- **Aceite:** uma pessoa que nunca viu o projeto adiciona um nó novo em <5 min só lendo o README.

### Fase 6 — Fora do MVP (registrar em `FUTURO.md`, não implementar)
- Ingestão automática de linhagem do Unity Catalog / Databricks
- Modo de edição na UI (form → grava .md via PR)
- Autenticação corporativa e deploy interno oficial
- Visão por sistema (agrupar por Fonte) e visão por owner
- Exportar subgrafo como imagem para apresentações

## 5. Critérios de qualidade globais
- TypeScript estrito (`strict: true`); zero `any` fora do wrapper da lib de grafo
- `build-graph.ts` com testes mínimos (vitest): parse de frontmatter, extração de wikilink, link quebrado
- Nenhum dado sensível: catálogo contém metadados de dados, nunca dados de clientes
- Commits pequenos por fase; mensagem `feat(fase-N): ...`

## 6. Definition of Done do MVP
Demo de 3 minutos possível: abrir o mapa → hover no RAR → clicar → mostrar insumos e o "⚠ owner a definir" →
toggle "somente sem owner" → frase final: *"é isso que precisamos preencher juntos"*.

## 7. Seed data — catálogo real (gerar um .md por linha)

> Campos: nome | tipo | domínio | origem | sistema | descrição | débito | consome (wikilinks no corpo)

| nome | tipo | domínio | origem | sistema | descrição | débito | consome |
|---|---|---|---|---|---|---|---|
| PSDC | insumo | Cadastro | cadastro corporativo | Databricks (produto de dados) | identificação oficial: CNPJ, grupos, centro de custo | nao | — |
| Porte observado (bureau) | insumo | Cadastro | fornecedores externos | bureaus / agências (integração em avaliação) | porte e faturamento por fontes de mercado | nao | — |
| Faturamento declarado | produto | Cadastro | RM (relacionamento) | Salesforce (Account) | estimativa informada pelo RM na conta | nao | — |
| Mercado Alvo | produto | Mercado | base comercial legada | banco SQL legado (on-premise) | lista de clientes-alvo da atuação | sim | — |
| RFB | insumo | Mercado | Receita Federal | Databricks (dado curado) | situação cadastral e CNAEs do CNPJ | nao | — |
| Bacen | insumo | Mercado | Banco Central | a confirmar | dados de apoio à classificação | avaliar | — |
| GDP | insumo | Mercado | GDP (departamento) | a confirmar | dados de apoio à classificação | avaliar | — |
| Setorização | produto | Mercado | Atacado — classificação | planilha Excel (de-para) | setor eleito do grupo (melhor CNAE por risco) | sim | RFB, Bacen, GDP |
| Localização | produto | Mercado | Atacado — classificação | planilha Excel (de-para) | praça de cobrança do cliente | sim | RFB, Bacen, GDP |
| De-para produtos EVOL | produto | Mercado | Atacado — analistas | planilha Excel (exploratório) | clusterização de produtos do Atacado | sim | Evolução (EVOL) |
| Rating | insumo | Risco | área de risco | Databricks (produto de dados) | classificação de risco do cliente | nao | — |
| Restritivos e tipos | insumo | Risco | área de risco | Databricks (produto de dados) | impedimentos e restrições | nao | — |
| ESTATAG | insumo | Risco | área de risco | Databricks (produto de dados) | componente de risco do RAR | nao | — |
| Capital Regulatório | insumo | Risco | capital / risco | a confirmar | base de capital do RAR | avaliar | — |
| Custo de Capital (KE) | insumo | Risco | crédito (provisório) | banco de dados do crédito | taxa de custo de capital | sim | — |
| GDAD | insumo | Resultado | resultado gerencial | Databricks (dado curado) | resultado realizado | nao | — |
| GORC | insumo | Resultado | a detalhar | a confirmar | fonte de resultado complementar | avaliar | — |
| DEF_CAMBIO | insumo | Resultado | DEF e Câmbio | base SQL on-premise | resultado de empréstimos e câmbio | sim | — |
| Evolução (EVOL) | produto | Resultado | Atacado — ajustes | planilha / processo manual | resultado ajustado pelos analistas | sim | GDAD, GORC |
| RAR 12M | produto | Resultado | Atacado — cálculo | engine própria → Databricks | retorno ajustado ao risco 12 meses | nao | GDAD, ESTATAG, Capital Regulatório, Custo de Capital (KE) |
| BACEN 3040/45/46 | insumo | Regulatorio | BACEN | transferência corporativa de arquivos | operações de crédito reguladas | nao | — |
| Debêntures | insumo | Regulatorio | ANBIMA / mercado | webscraping (debentures.com.br) | posições de debêntures do mercado | sim | — |
| RECTA_FEDRL | insumo | A definir | a identificar | tabela departamental | conteúdo a mapear | avaliar | — |
| PCAM-57 | insumo | A definir | a identificar | tabela departamental | conteúdo a mapear | avaliar | — |

**Todos com `owner: null` e `centro_de_custo: null`, exceto:** PSDC (`centro_de_custo: "PSDC"`) e
GDP (`centro_de_custo: "GDP"`).

> Nota semântica p/ o corpo dos .md derivados: Setorização e Localização são **produtos derivados do
> Atacado** (o processo de de-para é a rota com débito; o dado é ativo). Refletir isso na descrição do corpo.

## 8. Prompts sugeridos para o Claude Code

```
# início
Leia PLANO-mapa-dados-atacado.md inteiro. Resuma as fases em 5 linhas e execute a Fase 0.
Pare no critério de aceite e me mostre como verificar.

# fases seguintes
Execute a Fase N do plano. Ao terminar, rode os aceites da fase e me mostre a evidência
(comando + output). Não avance sem meu OK.

# se travar
Antes de trocar qualquer decisão da seção 2, me explique o problema e proponha no máximo
2 alternativas com trade-offs.
```