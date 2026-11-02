import { createInsightsServer, insightsPort } from './server.ts';
const host = process.env.INSIGHTS_SERVICE_HOST ?? '127.0.0.1';
const port = insightsPort();
const server = createInsightsServer();
server.listen(port, host, () => console.log(JSON.stringify({ level: 'info', event: 'insights.started', host, port })));
function shutdown(): void { server.close(() => process.exit(0)); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
