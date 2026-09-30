import { createGatewayServer, gatewayPort } from './server.ts';

const host = process.env.GATEWAY_HOST ?? '127.0.0.1';
const port = gatewayPort();
const server = createGatewayServer();

server.listen(port, host, () => {
  console.log(JSON.stringify({ level: 'info', event: 'gateway.started', host, port }));
});

function shutdown(): void {
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
