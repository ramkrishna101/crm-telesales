import { Role } from '@prisma/client';
export interface JwtPayload {
    userId: string;
    role: Role;
    email: string;
}
export declare function signAccessToken(payload: JwtPayload): string;
export declare function signRefreshToken(payload: JwtPayload): string;
export declare function verifyAccessToken(token: string): JwtPayload;
export declare function verifyRefreshToken(token: string): JwtPayload;
/** Returns the TTL of the refresh token in seconds (for Redis) */
export declare function getRefreshTokenTtlSeconds(): number;
//# sourceMappingURL=jwt.d.ts.map