import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApiApp, ensureDb } from '../server/app.ts';

const app = createApiApp();

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await ensureDb();
  app(
    req as unknown as Parameters<typeof app>[0],
    res as unknown as Parameters<typeof app>[1],
  );
}
