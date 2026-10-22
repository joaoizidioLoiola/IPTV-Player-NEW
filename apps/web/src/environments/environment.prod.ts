import { version as appVersion } from '@package';

export const AppConfig = {
    production: true,
    environment: 'PROD',
    version: appVersion,
    // Self-hosted deployments rewrite `assets/app-config.js` with the real
    // value (Docker uses `/api`). Never fall back to a third-party parser:
    // provider URLs carry credentials, and the upstream deployment is gone.
    BACKEND_URL: '/api',
};
