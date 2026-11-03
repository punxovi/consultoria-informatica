import { createInterventionsServer, interventionsPort } from './server.ts';
import { loadBackendEnvironment } from '../../../shared/config/src/supabase.ts';

loadBackendEnvironment();

const host = process.env.INTERVENTIONS_SERVICE_HOST ?? '127.0.0.1';
const port = interventionsPort();
const server = createInterventionsServer();
server.listen(port, host, () => console.log(JSON.stringify({ level: 'info', event: 'interventions.started', host, port })));
function shutdown(): void { server.close(() => process.exit(0)); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
