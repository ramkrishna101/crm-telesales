"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.param = param;
/** Express 5 types params as string | string[]. Always returns a plain string. */
function param(req, name) {
    const val = req.params[name];
    return Array.isArray(val) ? val[0] : val;
}
//# sourceMappingURL=params.js.map