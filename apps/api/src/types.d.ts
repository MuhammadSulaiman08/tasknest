import type { WorkspaceRole } from '@tasknest/shared';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      workspace?: { id: string; name: string; slug: string; ownerId: string; role: WorkspaceRole };
    }
  }
}
export {};
