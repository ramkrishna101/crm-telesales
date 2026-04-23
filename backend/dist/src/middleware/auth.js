"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = authenticate;
exports.requireRole = requireRole;
const jwt_1 = require("../lib/jwt");
/**
 * Middleware: verify JWT access token, attach decoded payload to req.user.
 * Returns 401 if token is missing or invalid.
 */
function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No token provided' } });
        return;
    }
    const token = authHeader.slice(7);
    try {
        req.user = (0, jwt_1.verifyAccessToken)(token);
        next();
    }
    catch {
        res.status(401).json({ success: false, error: { code: 'TOKEN_EXPIRED', message: 'Token invalid or expired' } });
    }
}
/**
 * Middleware factory: restrict access to specific roles.
 * Must be used AFTER authenticate middleware.
 */
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
            return;
        }
        if (!roles.includes(req.user.role)) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
            return;
        }
        next();
    };
}
//# sourceMappingURL=auth.js.map