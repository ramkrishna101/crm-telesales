import { Request } from 'express';

/** Express 5 types params as string | string[]. Always returns a plain string. */
export function param(req: Request, name: string): string {
  const val = req.params[name];
  return Array.isArray(val) ? val[0] : val;
}
