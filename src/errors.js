export class AppError extends Error {
  constructor(status, title, detail, type = 'about:blank', errors = undefined) {
    super(detail);
    this.status = status;
    this.title = title;
    this.detail = detail;
    this.type = type;
    this.errors = errors;
  }
}

export class NotFoundError extends AppError {
  constructor(detail = 'The requested resource was not found.') {
    super(404, 'Resource not found', detail, '/problems/not-found');
  }
}

export class ConflictError extends AppError {
  constructor(detail = 'Request conflicts with the current state.') {
    super(409, 'Request conflicts with current state', detail, '/problems/conflict');
  }
}

export class ValidationError extends AppError {
  constructor(fieldErrors) {
    super(
      422,
      'Validation failed',
      'One or more fields failed validation.',
      '/problems/validation-error',
      fieldErrors
    );
  }
}