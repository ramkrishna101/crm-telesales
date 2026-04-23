import { Request, Response, NextFunction } from 'express';
export declare function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void;
export declare class AppError extends Error {
    statusCode: number;
    code: string;
    constructor(statusCode: number, code: string, message: string);
}
//# sourceMappingURL=errorHandler.d.ts.map