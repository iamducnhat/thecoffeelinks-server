export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogContext {
    requestId?: string;
    userId?: string;
    path?: string;
    method?: string;
    ip?: string;
    [key: string]: any;
}

const REDACTED_KEYS = ['password', 'token', 'authorization', 'secret', 'key'];

class Logger {
    private redact(obj: any): any {
        if (typeof obj !== 'object' || obj === null) return obj;

        if (Array.isArray(obj)) {
            return obj.map(item => this.redact(item));
        }

        const newObj: any = {};
        for (const key in obj) {
            if (REDACTED_KEYS.some(k => key.toLowerCase().includes(k))) {
                newObj[key] = '[REDACTED]';
            } else {
                newObj[key] = this.redact(obj[key]);
            }
        }
        return newObj;
    }

    private log(level: LogLevel, message: string, context?: LogContext) {
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            ...this.redact(context || {})
        };
        console.log(JSON.stringify(entry));
    }

    info(message: string, context?: LogContext) {
        this.log('info', message, context);
    }

    warn(message: string, context?: LogContext) {
        this.log('warn', message, context);
    }

    error(message: string, context?: LogContext) {
        this.log('error', message, context);
    }

    debug(message: string, context?: LogContext) {
        if (process.env.NODE_ENV !== 'production') {
            this.log('debug', message, context);
        }
    }

    security(message: string, context?: LogContext) {
        const securityContext = { ...context, securityEvent: true };
        this.log('warn', `[SECURITY] ${message}`, securityContext);
    }
}

export const logger = new Logger();
