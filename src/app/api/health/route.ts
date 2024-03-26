/**
 * [#] src/api/health/route.ts
 *
 * This route checks a health of the connection
 * to both the frontend things and the backend.
 */

import { NextResponse } from "next/server";
import { handler } from "~/server/health";

type ResponseData = { health: string };

/**
 * This variable is automatically set during the deployment.
 */
const gitSha = process.env.VERCEL_GIT_COMMIT_SHA ?? "local";

export const GET = handler<ResponseData>(() => {
  /**
   * Check API endpoint health which returns with success if
   * server is healthy and responds with the latest git sha.
   */
  return NextResponse.json({
    ok: true,
    data: { health: gitSha.substring(0, 7) },
  });
});
