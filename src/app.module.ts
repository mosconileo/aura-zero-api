import { BullModule } from '@nestjs/bullmq'
import { Global, Module, type DynamicModule } from '@nestjs/common'
import { APP_FILTER } from '@nestjs/core'
import { LoggerModule } from 'nestjs-pino'
import { AchievementsProcessor } from './achievements/achievements.processor.js'
import { ACHIEVEMENTS_QUEUE } from './achievements/achievements.queue.js'
import { AuthGuard } from './auth/auth.guard.js'
import { ENV, type Env } from './config.js'
import { FightersController } from './fighters/fighters.controller.js'
import { FightersService } from './fighters/fighters.service.js'
import { HealthController } from './health.controller.js'
import { CacheService } from './infra/cache.service.js'
import { HttpExceptionFilter } from './infra/http-exception.filter.js'
import { PrismaService } from './infra/prisma.service.js'
import { RedisService, redisConnection } from './infra/redis.js'
import { LeaderboardController } from './leaderboard/leaderboard.controller.js'
import { LeaderboardService } from './leaderboard/leaderboard.service.js'
import { MatchesController } from './matches/matches.controller.js'
import { MatchesService } from './matches/matches.service.js'
import { PlayersController } from './players/players.controller.js'
import { PlayersService } from './players/players.service.js'

@Global()
@Module({})
export class AppModule {
  /** Env injetado (não lido de process.env dentro dos serviços): os testes passam o seu. */
  static forRoot (env: Env): DynamicModule {
    return {
      module: AppModule,
      imports: [
        LoggerModule.forRoot({
          pinoHttp: {
            level: env.NODE_ENV === 'test' ? 'silent' : 'info',
            transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
            redact: ['req.headers.authorization'],
            customProps: (req) => ({ playerId: (req as { player?: { id: string } }).player?.id }),
          },
        }),
        BullModule.forRoot({ connection: redisConnection(env.REDIS_URL) }),
        BullModule.registerQueue({ name: ACHIEVEMENTS_QUEUE }),
      ],
      controllers: [HealthController, PlayersController, MatchesController, LeaderboardController, FightersController],
      providers: [
        { provide: ENV, useValue: env },
        { provide: APP_FILTER, useClass: HttpExceptionFilter },
        PrismaService, RedisService, CacheService, AuthGuard,
        LeaderboardService, PlayersService, MatchesService, FightersService, AchievementsProcessor,
      ],
      exports: [ENV, PrismaService, RedisService],
    }
  }
}
