# aura-zero-api

Backend do **Aura Zero**, um jogo de luta 3D em pixel-art que escrevi em three.js. A API dá ao jogo perfis, histórico de lutas, conquistas, ranking e avaliações dos lutadores.

**Stack:** NestJS 12 · TypeScript · PostgreSQL 17 + Prisma 7 · Redis 7 (cache, ranking, filas BullMQ) · Vitest · pino · Sentry · GitHub Actions

```
jogo (browser) ── POST /matches ──► API ──► Postgres  (fonte da verdade)
      ▲                              │
      │                              ├──► Redis ZSET   (ranking)
      │                              ├──► Redis cache  (perfil, catálogo)
      └── GET /players/me/achievements   └──► fila BullMQ ──► worker de conquistas
```

## Rodando

Requisitos: Node 22.12+ e Docker.

```bash
cp .env.example .env
npm install            # também gera o Prisma Client
npm run db:up          # Postgres + Redis
npm run db:migrate     # aplica as migrations
npm run db:seed        # lutadores e conquistas
npm run dev            # http://localhost:3000
npm test               # 25 unitários + 17 e2e (precisa do db:up)
```

## Endpoints

| Método | Rota | Auth | |
|---|---|---|---|
| `GET` | `/health` | | readiness: Postgres e Redis respondem em 1s, ou 503 |
| `POST` | `/players` | | cria perfil `{nickname}` e devolve o token (uma única vez) |
| `GET` | `/players/me` · `/players/:id` | ✓ · | perfil com estatísticas e posição no ranking |
| `GET` | `/players/me/achievements` · `/players/:id/achievements` | ✓ · | conquistas desbloqueadas |
| `POST` | `/matches` | ✓ | registra uma luta (**idempotente**: 201 ou 200) |
| `GET` | `/players/:id/matches?cursor=&limit=` | | histórico paginado por cursor |
| `GET` | `/leaderboard?limit=` | | top N por rating |
| `GET` | `/fighters` | | catálogo com nota média, nº de lutas e taxa de vitória |
| `PUT` | `/fighters/:id/review` | ✓ | avalia um lutador (1–5 + comentário); reenviar substitui |
| `GET` | `/fighters/:id/reviews?cursor=&limit=` | | avaliações paginadas |

Os erros seguem um formato único, `{ statusCode, error, issues? }`. Uma falha de validação (400) diz o campo: `{"path":"fighterId","message":"..."}`.

## Decisões

**Idempotência em `POST /matches`.** O jogo gera um `clientMatchId` (UUID) por luta e guarda a luta numa fila local até o servidor confirmar. Reenviar é seguro: a unique `(playerId, clientMatchId)` garante uma luta só, e a resposta muda de 201 para 200 com a mesma luta. Se dois reenvios simultâneos passam juntos pela checagem, a constraint barra o segundo, o rollback desfaz o rating dele e a API devolve a luta que venceu. Há um teste que dispara 8 envios concorrentes e confere 1 luta e rating aplicado uma vez.

**Rating sem lost update.** Duas lutas do mesmo jogador chegando ao mesmo tempo leriam o mesmo rating, e uma das atualizações se perderia. A transação trava a linha do jogador com `SELECT ... FOR UPDATE` antes de calcular o delta. O teste dispara 10 lutas concorrentes e confere `1000 + 10 × 15`.

**Conquistas fora da request.** Avaliar conquistas exige agregados (total de lutas, lutadores com vitória), e o jogo não precisa esperar por isso. O `POST /matches` enfileira um job no BullMQ (`jobId = matchId`, então a mesma luta nunca é avaliada em dobro), com 5 tentativas e backoff exponencial. O worker é idempotente (PK composta + `skipDuplicates`), então o retry não duplica conquista. As regras são uma função pura em [`src/domain/achievements.ts`](src/domain/achievements.ts), testada sem banco.

**Ranking em sorted set, Postgres como verdade.** `ZADD` e top-N custam O(log n) no Redis. O set é derivado: se sumir, é reconstruído do Postgres num set temporário e trocado com `RENAME` atômico (ninguém vê um ranking pela metade). Se o Redis estiver fora, a leitura cai para um `ORDER BY rating` no banco.

**Cache-aside que não vira 500.** Perfil (60s) e catálogo (5 min) ficam em cache e são invalidados por escrita (nova luta, nova avaliação, conquista). Se o Redis cair, o `CacheService` serve direto do banco. O cliente Redis falha rápido (`enableOfflineQueue: false`) em vez de enfileirar comandos sem limite.

**Paginação por cursor.** O cursor é keyset sobre `(createdAt DESC, id DESC)`, usando o índice composto. Offset pularia ou repetiria lutas quando novas entram durante a navegação. A API busca `limit + 1` linhas para saber se há próxima página sem um `COUNT`. Cursor adulterado vira 400, não 500.

**Token opaco com hash.** O token tem 256 bits aleatórios e só o `sha256` vai para o banco. Bcrypt não faz sentido aqui: ele protege senha de baixa entropia escolhida por humano, e em token aleatório só adicionaria latência em toda request. O header `authorization` é removido dos logs.

**Config que falha no boot.** O env é validado com zod ao subir. Variável faltando derruba o processo com mensagem clara, em vez de virar `undefined` no meio de uma request.

## Testes

- **Unitários** (`src/**/*.spec.ts`): rating, regras de conquista, cursor e schema de entrada.
- **E2E** (`test/*.e2e.ts`): sobem o app inteiro contra Postgres e Redis reais (banco `aura_test` e Redis db 1, separados do dev). Cobrem idempotência concorrente, lost update, worker assíncrono, reconstrução do ranking, invalidação de cache, paginação sem pular nem repetir e erros 400/401/404/409.
- O CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) roda typecheck, build e a suíte completa com Postgres e Redis como services.

Os testes rodam com SWC (`unplugin-swc`) porque o esbuild padrão do Vitest não emite `emitDecoratorMetadata`, de que a injeção de dependência do Nest precisa.

## Integração com o jogo

No jogo, o cliente fica em `src/net/api.js`:
- As lutas vão para uma **outbox no `localStorage`** antes do envio, com timeout de 5s por request.
- Erro de rede ou 5xx: a luta fica na fila e é reenviada na próxima luta ou no próximo boot.
- 4xx: a luta é descartada, porque nunca vai passar.
- O jogo **nunca depende da rede**: sem API, tudo segue offline.
- Só contam lutas contra a CPU (Batalha e Arcade). No versus local não há como saber qual dos dois é o jogador logado.

## Limitações conhecidas

- **O resultado é declarado pelo cliente.** O jogo roda no browser, então quem quiser pode enviar uma vitória falsa. O schema barra o absurdo (placar incompatível, vida acima da máxima, chefe fora do arcade), mas anti-cheat de verdade exigiria simular a luta no servidor a partir dos inputs, o que está fora do escopo.
- Não há rate limit. Em produção eu colocaria `@nestjs/throttler` com storage no Redis por IP e por token.
- O worker roda no mesmo processo da API. Para escalar, o `AchievementsProcessor` sobe sozinho num container próprio, sem mudança de código.
- O `npm audit` aponta `deepmerge-ts` (high) via `@prisma/config`. É código do CLI e da config do Prisma, sem caminho a partir de input de request. A correção que o audit sugere é rebaixar para o Prisma 6, e o 8 ainda está em RC.
