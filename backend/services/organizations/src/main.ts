import { createOrganizationsServer, organizationsPort } from './server.ts';


const host = process.env.ORGANIZATIONS_SERVICE_HOST ?? '127.0.0.1';
const port = organizationsPort();
const server = createOrganizationsServer();

server.listen(port, host, () => {
  console.log(JSON.stringify({ level: 'info', event: 'organizations.started', host, port }));
});

function shutdown(): void {
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
