/**
 * [#] src/server/health.ts
 */

import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodIssue } from "zod";
import fetch from "node-fetch";

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

    let response: NextResponse<ApiResponse<T>>;
    logger.info(`\n ✓ ${method} ${url} Frontend is healthy`);

    try {
      response = await routeHandler(request, context);
    } catch (err) {
      response = buildErrorResponse(err);
    }

    const responseTime = new Date().getTime() - startTime.getTime();
    logger.info(
      ` ✓ ${method} ${url} (${response.status}) took ${responseTime}ms...\n`
    );

    const backendHealth = await checkBackendHealth();
    const backendStatusIcon =
      backendHealth === "Backend is healthy" ? "✓" : "x";
    logger.info(` ${backendStatusIcon} ${method} ${url} ${backendHealth}\n`);

    return response;
  };
};

/**
 * Call to check the backend API health,
 * and return health status as a string.
 */
export const checkBackendHealth = async (): Promise<string> => {
  try {
    const backendUrl = `${env.NEXT_PUBLIC_BACKEND_URL}/backend-health`;

    const response = await fetch(backendUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      return "Backend is healthy";
    } else {
      return "Backend is unhealthy";
    }
  } catch (error) {
    console.error("Error checking backend health:", error);
    return "Backend is unhealthy";
  }
};

type FrontendHealthResponse = {
  status: string;
  frontend_health: boolean;
};

/**
 * Call from frontend to check the frontend
 * API health, based on backend's response.
 *
 * todo: Remove if it doesn't have solid purpose.
 */
const checkFrontendHealth = async (): Promise<boolean> => {
  try {
    const backendUrl = `${env.NEXT_PUBLIC_BACKEND_URL}/frontend-health`;

    const response = await fetch(backendUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data = (await response.json()) as Promise<FrontendHealthResponse>;
    const responseData = await data;
    return responseData.frontend_health;
  } catch (error) {
    console.error("Error checking frontend health:", error);
    return false;
  }
};
