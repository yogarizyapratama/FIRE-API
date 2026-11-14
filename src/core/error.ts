export class HttpError extends Error {
  public statusCode: number;
  public details?: any;

  constructor(statusCode: number, message: string, details?: any) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, HttpError.prototype);
  }

  public getStatusText(): string {
    switch (this.statusCode) {
      case 400: return 'Bad Request';
      case 401: return 'Unauthorized';
      case 403: return 'Forbidden';
      case 404: return 'Not Found';
      case 405: return 'Method Not Allowed';
      case 409: return 'Conflict';
      case 422: return 'Unprocessable Entity';
      case 429: return 'Too Many Requests';
      case 500: return 'Internal Server Error';
      default: return 'Error';
    }
  }

  public toResponse(): Response {
    const payload: Record<string, any> = {
      statusCode: this.statusCode,
      error: this.getStatusText(),
      message: this.message,
    };
    if (this.details !== undefined) {
      payload.details = this.details;
    }
    return new Response(JSON.stringify(payload), {
      status: this.statusCode,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
}
