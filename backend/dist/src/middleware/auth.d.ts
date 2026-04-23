import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { JwtPayload } from '../lib/jwt';
declare global {
    namespace Express {
        interface Request {
            user?: JwtPayload;
        }
    }
}
/**
 * Middleware: verify JWT access token, attach decoded payload to req.user.
 * Returns 401 if token is missing or invalid.
 */
export declare function authenticate(req: Request, res: Response, next: NextFunction): void;
/**
 * Middleware factory: restrict access to specific roles.
 * Must be used AFTER authenticate middleware.
 */
export declare function requireRole(...roles: Role[]): (req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=auth.d.ts.map