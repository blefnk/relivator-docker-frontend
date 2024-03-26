/**
 * [#] src/server/health.ts
 */

import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodIssue } from "zod";
import { env } from "~/env.mjs";

type ApiResponseSuccess<T> = {
  ok: true;
  data: T;
};

type ApiResponseError = {
  ok: false;
  error: string;
  issues?: ZodIssue[];
};

type ApiResponse<T> = ApiResponseSuccess<T> | ApiResponseError;

type NextRouteContext<T = undefined> = { params: T };

type NextRouteHandler<T = void, U = NextRouteContext> = (
  request: NextRequest,
  context: U
) => NextResponse<T> | Promise<NextResponse<T>>;

const logger =
  env.NODE_ENV === "test"
    ? {
        log: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }
    : console;

type NextJsError = Error & { digest: `NEXT_${string}` };

/**
 * Determines if a given object is a Next.js error such
 * as one thrown from next/navigation in the notFound.
 */
function isNextJsError(e: unknown): e is NextJsError {
  return (
    e instanceof Error &&
    "digest" in e &&
    typeof e.digest === "string" &&
    e.digest.startsWith("NEXT_")
  );
}

/**
 * Generic HTTP error, which falls back to 500.
 */
class ApiError extends Error {
  status = 500;
  constructor(message?: string, ...args: never[]) {
    super(message ?? "Internal Error", ...args);
  }
}

/**
 * Determines if a given object is a handled API error,
 * such as `unauthorized` or `validationError`.
 */
function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

function buildErrorResponse(err: unknown): NextResponse<ApiResponseError> {
  /**
   * Let Next.js handle its own errors.
   */
  if (isNextJsError(err)) {
    throw err;
  }

  /**
   * `ZodError` types occur when the request body is invalid,
   * so we treat these the same as a ValidationError function.
   */
  if (err instanceof ZodError) {
    return NextResponse.json(
      { ok: false, error: "Validation Error", issues: err.issues },
      { status: 400 }
    );
  }

  /**
   * If this is a known API error, such as from calling `unauthorized()` or
   * `validationError()`, handle it here.
   */
  if (isApiError(err)) {
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: err.status }
    );
  }

  /**
   * If we're unsure what error occurred, respond with a generic Internal
   * Server Error
   */
  logger.error("Unhandled API Error", err);
  return NextResponse.json(
    { ok: false, error: "Internal server error" },
    { status: 500 }
  );
}

/**
 * Wraps an API with additional logic
 * like logging, error handling, etc.
 */
export const handler = <T = void, U = NextRouteContext>(
  routeHandler: NextRouteHandler<ApiResponse<T>, U>
): NextRouteHandler<ApiResponse<T>, U> => {
  const startTime = new Date();
  return async (request: any, context: any) => {
    const method = request.method;
    const url = request.nextUrl.pathname;
    logger.info(`\n ➡️  ${method} ${url} checking...`);
    let response: NextResponse<ApiResponse<T>>;
    try {
      response = await routeHandler(request, context);
    } catch (err) {
      response = buildErrorResponse(err);
    }
    const responseTime = new Date().getTime() - startTime.getTime();
    logger.info(
      `\n ⬅️  ${method} ${url} (${response.status}) took ${responseTime}ms`
    );
    return response;
  };
};
