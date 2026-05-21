import { GITHUB_CLIENT_ID, GITHUB_OAUTH_SCOPE } from "../config/constants.js";
import { logger } from "../utils/logger.js";

const DEVICE_CODE_URL = "https://github.com/login/device/code";
const ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";
const USER_API_URL = "https://api.github.com/user";

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export interface OAuthTokenResult {
  access_token: string;
  token_type: string;
  scope: string;
}

export interface GitHubUser {
  login: string;
  avatar_url: string;
}

/** Step 1: Request a device code from GitHub. */
export async function startDeviceFlow(): Promise<DeviceCodeResponse> {
  logger.info("Starting GitHub OAuth device flow...");
  const res = await fetch(DEVICE_CODE_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      scope: GITHUB_OAUTH_SCOPE,
    }),
  });

  if (!res.ok) {
    logger.error(`GitHub device code request failed: ${res.status} ${res.statusText}`);
    throw new Error(`GitHub device code request failed: ${res.status} ${res.statusText}`);
  }

  logger.info("Successfully retrieved device code.");

  return (await res.json()) as DeviceCodeResponse;
}

/**
 * Step 2: Poll GitHub until the user authorizes.
 * Resolves with the access token or rejects on timeout/error.
 * Caller can pass an AbortSignal to cancel polling.
 */
export async function pollForToken(
  deviceCode: string,
  interval: number,
  expiresIn: number,
  signal?: AbortSignal,
): Promise<OAuthTokenResult> {
  const deadline = Date.now() + expiresIn * 1000;
  let pollInterval = interval;

  while (Date.now() < deadline) {
    if (signal?.aborted) {
      logger.info("OAuth polling cancelled by user/system.");
      throw new Error("OAuth polling cancelled.");
    }

    await sleep(pollInterval * 1000);

    const res = await fetch(ACCESS_TOKEN_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        device_code: deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    });

    if (!res.ok) {
      logger.error(`GitHub token poll failed: ${res.status} ${res.statusText}`);
      throw new Error(`GitHub token poll failed: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as Record<string, string>;

    if (data.access_token) {
      logger.info("Successfully retrieved OAuth access token.");
      return data as unknown as OAuthTokenResult;
    }

    switch (data.error) {
      case "authorization_pending":
        // User hasn't entered the code yet — keep polling
        break;
      case "slow_down":
        // GitHub wants us to back off
        pollInterval += 5;
        break;
      case "expired_token":
        throw new Error("The device code has expired. Please try again.");
      case "access_denied":
        throw new Error("Authorization was denied by the user.");
      default:
        logger.error("OAuth error:", data.error_description || data.error);
        throw new Error(data.error_description || data.error || "Unknown OAuth error.");
    }
  }

  logger.error("OAuth authorization timed out.");
  throw new Error("OAuth authorization timed out.");
}

/** Step 3: Fetch the authenticated user's profile. */
export async function fetchGitHubUser(token: string): Promise<GitHubUser> {
  logger.info("Fetching GitHub user profile...");
  const res = await fetch(USER_API_URL, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "Synkromium",
    },
  });

  if (!res.ok) {
    logger.error(`Failed to fetch GitHub user: ${res.status} ${res.statusText}`);
    throw new Error(`Failed to fetch GitHub user: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as GitHubUser;
  logger.info(`Successfully fetched GitHub user profile: ${data.login}`);
  return { login: data.login, avatar_url: data.avatar_url };
}

/** Create a private repository on GitHub. */
export async function createGitHubRepo(token: string, repoName: string, isPrivate: boolean = true): Promise<void> {
  logger.info(`Attempting to create GitHub repository: ${repoName}`);
  const res = await fetch("https://api.github.com/user/repos", {
    method: "POST",
    headers: {
      "Accept": "application/vnd.github.v3+json",
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "Synkromium"
    },
    body: JSON.stringify({
      name: repoName,
      private: isPrivate,
      auto_init: false,
    })
  });

  if (!res.ok) {
    const errorData = (await res.json().catch(() => ({}))) as any;
    // 422 Unprocessable Entity often means the repo already exists
    if (res.status === 422 && errorData.errors?.[0]?.message === "name already exists on this account") {
      logger.info(`Repository ${repoName} already exists.`);
      return;
    }
    logger.error(`Failed to create repository: ${res.status} ${res.statusText}`);
    throw new Error(`Failed to create repository: ${res.status} ${res.statusText}`);
  }

  logger.info(`Successfully created repository: ${repoName}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
