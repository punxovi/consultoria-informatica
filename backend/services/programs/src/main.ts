import { createProgramsServer, programsPort } from './server.ts';

const host = process.env.PROGRAMS_SERVICE_HOST ?? '127.0.0.1';
const port = programsPort();
const server = createProgramsServer();

server.listen(port, host, () => {
  console.log(JSON.stringify({ level: 'info', event: 'programs.started', host, port }));
});

function shutdown(): void { server.close(() => process.exit(0)); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
