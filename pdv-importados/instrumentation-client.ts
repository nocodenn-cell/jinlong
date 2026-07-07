import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  integrations: [
    Sentry.replayIntegration(),
  ],

  // Performance
  tracesSampleRate: 0.2,

  // Logs
  enableLogs: true,

  // Session Replay
  replaysSessionSampleRate: 0.05,
  replaysOnErrorSampleRate: 1.0,

  // Captura IP, User-Agent etc.
  sendDefaultPii: true,

  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
});

export const onRouterTransitionStart =
  Sentry.captureRouterTransitionStart;