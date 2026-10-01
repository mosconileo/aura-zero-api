import * as Sentry from '@sentry/nestjs'

// Importado antes de tudo em main.ts para o Sentry instrumentar http/pg.
// Sem SENTRY_DSN o SDK fica inerte.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
  })
}
