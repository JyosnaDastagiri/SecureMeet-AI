import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';

/** Structured one-line JSON access log: method, path, status, duration, user id (no bodies, no tokens). */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const started = Date.now();
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    return next.handle().pipe(
      tap({
        next: () => this.write(req, res.statusCode, started),
        error: (e) => this.write(req, e?.status ?? 500, started),
      }),
    );
  }

  private write(req: any, status: number, started: number) {
    this.logger.log(
      JSON.stringify({ method: req.method, path: req.originalUrl?.split('?')[0], status, ms: Date.now() - started, user: req.user?.id }),
    );
  }
}
