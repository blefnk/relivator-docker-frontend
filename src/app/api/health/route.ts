/**
 * [#] src/api/health/route.ts
 *
 * This route checks a health of the connection
 * to both the frontend things and the backend.
 */

import { NextResponse } from "next/server";
import { checkBackendHealth, handler } from "~/server/health";

type ResponseData = {
  frontendHealth: string;
  backendHealth: string;
};

/**
 * This variable is automatically
 * set during the Vercel deployment.
 */
const gitSha = process.env.VERCEL_GIT_COMMIT_SHA ?? "local";

/**
 * Check the API endpoint health which returns with success if
 * server is healthy and responds with the required responses.
 *
 * @see http://localhost:3000/api/health
 */
export const GET = handler<ResponseData>(async () => {
  const backendHealth = await checkBackendHealth();

  return NextResponse.json({
    ok: true,
    data: {
      backendHealth,
      frontendHealth: gitSha.substring(0, 7),
    },
  });
});
