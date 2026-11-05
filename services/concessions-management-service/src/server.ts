import { buildApp } from './app';
import { config } from './config';
import { assertListenAllowed } from './lib/listen-guard';

async function main(): Promise<void> {
  assertListenAllowed(config.authMode, config.host);
  const app = await buildApp();
  try {
    await app.listen({ port: config.port, host: config.host });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();
