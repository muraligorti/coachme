// ═══════════════════════════════════════════════════════════════════════
// AppError — the one place business logic (services) and HTTP handling
// (controllers) agree on how errors cross the boundary between them.
//
// Services throw AppError when something is a *known, expected* failure
// (bad input, not found, forbidden, conflict, locked account, etc). The
// statusCode travels with the error instead of a service having to know
// anything about Express. Controllers catch it and translate statusCode
// + message directly into the HTTP response; anything that ISN'T an
// AppError is an unexpected bug and gets logged + a generic 500.
// ═══════════════════════════════════════════════════════════════════════
export class AppError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.details = details;
  }
}
