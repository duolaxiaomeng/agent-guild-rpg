import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

/**
 * Global Prisma exception filter.
 *
 * R-038: Extended to catch all Prisma error types:
 * - PrismaClientKnownRequestError — errors with known codes (P2002, P2025, etc.)
 * - PrismaClientUnknownRequestError — unknown/database-level errors
 * - PrismaClientValidationError — input validation errors
 *
 * Maps Prisma client errors to appropriate HTTP status codes:
 * - P2025 (Record not found) → 404 Not Found
 * - P2002 (Unique constraint failed) → 409 Conflict
 * - P2003 (Foreign key constraint failed) → 400 Bad Request
 * - P2014 (Required relation violation) → 400 Bad Request
 * - P2016 (Invalid value for type) → 400 Bad Request
 * - Validation errors → 400 Bad Request
 * - Other Prisma known errors → 500 Internal Server Error
 */
@Catch(
  Prisma.PrismaClientKnownRequestError,
  Prisma.PrismaClientUnknownRequestError,
  Prisma.PrismaClientValidationError,
)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = "Internal server error";
    let error = "Internal Server Error";

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const result = this.handleKnownRequestError(exception);
      status = result.status;
      message = result.message;
      error = result.error;
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      // R-038: Handle validation errors (e.g., invalid input types)
      status = HttpStatus.BAD_REQUEST;
      message = "Invalid input data";
      error = "Bad Request";
      this.logger.warn(
        `Prisma validation error: ${exception.message}`,
      );
    } else if (exception instanceof Prisma.PrismaClientUnknownRequestError) {
      // R-038: Handle unknown database errors
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = "Database error";
      error = "Internal Server Error";
      this.logger.error(
        `Prisma unknown error: ${exception.message}`,
        exception.stack,
      );
    } else {
      // Unexpected error type — log and return 500
      this.logger.error(
        `Unhandled exception in PrismaExceptionFilter: ${exception instanceof Error ? exception.message : String(exception)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json({
      statusCode: status,
      message,
      error,
    });
  }

  private handleKnownRequestError(exception: Prisma.PrismaClientKnownRequestError) {
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = "Internal server error";
    let error = "Internal Server Error";

    switch (exception.code) {
      case "P2025":
        // An operation failed because it depends on one or more records
        // that were required but not found.
        status = HttpStatus.NOT_FOUND;
        message = "Resource not found";
        error = "Not Found";
        break;
      case "P2002":
        // Unique constraint failed on the constraint.
        status = HttpStatus.CONFLICT;
        message = "Resource already exists";
        error = "Conflict";
        break;
      case "P2003":
        // Foreign key constraint failed.
        status = HttpStatus.BAD_REQUEST;
        message = "Referenced resource does not exist";
        error = "Bad Request";
        break;
      case "P2014":
        // Required relation violation.
        status = HttpStatus.BAD_REQUEST;
        message = "Required relation is missing";
        error = "Bad Request";
        break;
      case "P2016":
        // Invalid value for type.
        status = HttpStatus.BAD_REQUEST;
        message = "Invalid value provided";
        error = "Bad Request";
        break;
      case "P2018":
        // Required connected records not found.
        status = HttpStatus.NOT_FOUND;
        message = "Required connected record not found";
        error = "Not Found";
        break;
      default:
        this.logger.error(
          `Unhandled Prisma error [${exception.code}]: ${exception.message}`,
          exception.stack,
        );
        break;
    }

    return { status, message, error };
  }
}
