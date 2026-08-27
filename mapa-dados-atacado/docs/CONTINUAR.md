# Retomar o trabalho

Documento de passagem entre sessões. Para continuar, comece com:

> Leia `mapa-dados-atacado/docs/CONTINUAR.md` e confirme o estado atual antes de
> propor qualquer coisa.

O que está escrito aqui era verdade quando o documento foi salvo — **confirme
antes de confiar**, porque o catálogo é editado pelo app e o código pode ter
avançado:

```bash
cd mapa-dados-atacado
git log --oneline -5      # último commit conhecido: a29b0e8
git status --short        # o que ficou sem commitar
npm test && npx tsc -b --noEmit
npm run data              # contagens e avisos do catálogo
```

## O que é

MVP de um mapa de dados navegável (estilo grafo do Obsidian) da Diretoria
Comercial Atacado de um banco. O objetivo é validar com o negócio a experiência
de navegar o mapa e **tornar visível o gap de governança** — quem é dono de cada
dado, o que tem débito técnico, o que vem de onde.

Repositório: `experienceitlit-netizen/mocks` (remoto `origin`, push liberado).
O app vive em `mapa-dados-atacado/`; `entregas/` guarda os pacotes distribuíveis.

## Modelo (não rediscuta sem motivo)

Estas decisões foram tomadas com o usuário ao longo de várias rodadas, algumas
revertendo o desenho anterior. Vieram de discussão, não de conveniência técnica:

- **Todo nó é um COMPONENTE que pertence a um NÍVEL.** Não existe "produto",
  "insumo", "raiz" ou "domínio" como categoria especial no código — o que
  classifica um nó é o nível dele. Raiz e Domínio são níveis como Gold e Silver.
- **Nada é inferido.** Todo nó vem de uma linha do catálogo; toda aresta vem de
  uma coluna (`consome` ou `associacoes`). O build não deriva nós de campos nem
  cria ligações automáticas — isso já existiu e foi removido a pedido.
- **Níveis são livres**: qualquer um pode ser criado, renomeado, reordenado,
  colorido e removido (removê-lo é recusado enquanto houver componentes nele).
  O código não conhece "bronze" ou "prata" — a semântica é do usuário.
- **Três eixos visuais independentes**: a coluna diz o nível, a cor diz o débito
  técnico, a forma diz o tipo de componente (Tabela SQL/Delta/Excel/Default).
- **O CSV precisa continuar legível** para quem abre na planilha. Foi o que
  descartou identificadores opacos (uuid) quando surgiu a necessidade de chave
  estável.

## Como os dados vivem

`catalogo.csv` (uma linha por componente) e `niveis.csv` na raiz do projeto →
`scripts/graph-lib.ts` (funções **puras**, sem I/O) → `src/data/graph.json` →
front-end. O `graph-lib` roda tanto no Node (CLI `npm run data`) quanto no
navegador — é o que permite o pacote HTML gerar o grafo sozinho.

Edição pelo app, em três modos escolhidos por detecção automática:

| Modo | Quando | Grava em |
| --- | --- | --- |
| dev server | `npm run dev` | os CSVs do projeto, via `/api/catalogo` |
| arquivo local | pacote HTML + "Abrir catálogo" | os CSVs da pasta escolhida |
| somente leitura | sem os dois | nada |

## Estado ao salvar este documento

Último commit: `a29b0e8` (atalho de teclado para excluir).

**Pronto, aguardando o aval do usuário para commitar:** a *chave estável*. O
`catalogo.csv` ganhou a coluna `id` como primeira — slug legível gerado do nome
na criação (`rar-12m`), único global, com sufixo em colisão, **imutável**. As
colunas `consome`/`associacoes` guardam ids; a resolução aceita id e, como
alternativa, nome (com aviso, normalizando na gravação seguinte). Célula `id`
vazia é preenchida pelo app, então dá para acrescentar linha na planilha sem
saber de ids. O id do nó no grafo é o id da linha, o que também eliminou a
ambiguidade de nomes repetidos entre níveis. `catalog-rename.ts` (propagação de
nome) foi removido: virou redundante.

Verificado no app: renomear e trocar de nível **não quebram** as ligações — a
aresta continua apontando para o mesmo id, sem nó fantasma. 237 testes verdes.

**Dados:** o catálogo estava com poucos componentes porque o usuário estava
testando a exclusão; ele pediu para **não commitar** essa perda. O estado cheio
(79 componentes) está no commit `81c1666`.

## Como o usuário trabalha

- **Não commite sem o aval dele.** O fluxo é: implementar → verificar →
  apresentar o que testar → ele testa no app → ele pede o commit.
- **Verifique no navegador**, não só nos testes. Chrome headless via CDP tem
  sido usado para abrir a página, simular interação e tirar screenshot; vários
  bugs só apareceram assim (o mais comum: com a página **já aberta**, que é como
  ele usa — não recarregada).
- **Ele edita o catálogo enquanto você trabalha.** Nunca use `git checkout` em
  `catalogo.csv`/`niveis.csv`; faça backup por cópia e restaure por cópia. E
  **nunca fixe contagens do catálogo em teste** — use invariantes, senão a suíte
  quebra a cada cadastro dele.
- **Calibre a orquestração**: mudança pequena é edição direta; feature média é um
  agente; só trabalho grande e paralelizável justifica vários agentes.
- Ele testa em português e o código/documentação seguem em pt-BR.

## Pendências registradas

- `FUTURO.md` — itens fora do MVP, com o que já foi parcialmente atendido.
- `docs/ligacao-por-clique.md` — especificação de criar ligações arrastando de um
  componente ao outro no mapa. As decisões pendentes ali são de produto (qual
  relação o gesto cria, direção, desfazer). A ambiguidade de nomes que o
  documento cita deixa de existir com a chave estável.
- Confirmação de exclusão por um segundo Delete foi **descartada** (a
  auto-repetição do teclado excluiria sem o usuário ler o aviso). Se ele voltar
  ao assunto, a saída é aceitar Delete ignorando eventos repetidos e só depois
  de ~400 ms.

## Distribuição

`npm run pacote` gera `entregas/mapa-dados-atacado-demo.zip`: o HTML autocontido
mais uma **cópia** dos CSVs, para a pessoa abrir por duplo clique e editar sem
tocar no catálogo do repositório. Regere sempre que o catálogo mudar — o HTML
carrega os dados embutidos no momento da geração.
