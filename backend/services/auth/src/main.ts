import { authPort, createAuthServer } from './server.ts';

const host = process.env.AUTH_SERVICE_HOST ?? '127.0.0.1';
const port = authPort();
const server = createAuthServer();

server.listen(port, host, () => {
  console.log(JSON.stringify({ level: 'info', event: 'auth.started', host, port }));
});

function shutdown(): void {
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
