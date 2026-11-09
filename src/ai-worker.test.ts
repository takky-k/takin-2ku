// @vitest-environment node
import { it, expect, vi } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import {
  makeWorker,
  verifyFirebaseToken,
  MODEL,
  type Env,
} from "../worker/index";
import { validateAiReply, type AiRequest } from "./ai-contract";
const input: AiRequest = {
  version: 1,
  sessionId: "s",
  condition: { sleepHours: null, mood: null, pain: false, fatigue: {} },
  exercises: [
    {
      exerciseId: "e",
      name: "test",
      muscle: "胸",
      elapsedDays: null,
      locked: false,
      targets: [
        { setId: "r", weightKg: 50, reps: 8, targetRir: { min: 2, max: 2 } },
      ],
      previous: [
        { ordinal: 0, weightKg: 50, reps: 8, rir: { min: 0, max: 0 } },
      ],
    },
  ],
};
const answer = () => ({
  recommendations: input.exercises.map((e) => ({
    exerciseId: e.exerciseId,
    rationale: "実績不足のため維持します。",
    targets: e.targets,
  })),
});
function setup(payload: Record<string, unknown> = {}) {
  const verify = vi.fn(async () => ({
      sub: "owner",
      email_verified: true,
      firebase: { sign_in_provider: "google.com" },
      ...payload,
    })),
    run = vi.fn(async (_model: string, _input: unknown) => ({
      response: JSON.stringify(answer()),
    })),
    limit = vi.fn(async () => ({ success: true }));
  const env: Env = {
    FIREBASE_PROJECT_ID: "project",
    FIREBASE_API_KEY: "public-web-config",
    ALLOWED_UID: "owner",
    AI: { run },
    AI_RATE_LIMITER: { limit },
  };
  const worker = makeWorker(verify as typeof verifyFirebaseToken);
  return { verify, run, limit, env, worker };
}
function request(
  body: unknown = input,
  origin = "https://takky-k.github.io",
  token = "synthetic",
) {
  return new Request("https://example.com/advice", {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: JSON.stringify(body),
  });
}
it("rejects missing auth, different UID, unverified users, wrong provider and origin before AI", async () => {
  for (const payload of [
    { sub: "other" },
    { email_verified: false },
    { firebase: { sign_in_provider: "password" } },
  ]) {
    const t = setup(payload);
    expect((await t.worker.fetch(request(), t.env)).status).toBe(403);
    expect(t.run).not.toHaveBeenCalled();
  }
  const t = setup();
  expect(
    (await t.worker.fetch(request(input, undefined, ""), t.env)).status,
  ).toBe(401);
  expect(
    (await t.worker.fetch(request(input, "https://other.example"), t.env))
      .status,
  ).toBe(403);
  expect(t.run).not.toHaveBeenCalled();
});
it("fails closed without an owner/limiter and never calls AI on token failure or oversized input", async () => {
  const t = setup();
  expect(
    (await t.worker.fetch(request(), { ...t.env, ALLOWED_UID: "" })).status,
  ).toBe(503);
  expect(
    (await t.worker.fetch(request(), { ...t.env, AI_RATE_LIMITER: undefined }))
      .status,
  ).toBe(503);
  t.verify.mockRejectedValueOnce(Error());
  expect((await t.worker.fetch(request(), t.env)).status).toBe(401);
  expect(
    (await t.worker.fetch(request({ data: "x".repeat(40000) }), t.env)).status,
  ).toBe(413);
  expect(t.run).not.toHaveBeenCalled();
});
it("requires rate limit, keeps RIR zero and null, returns a validated reply without persistence", async () => {
  const t = setup();
  const r = await t.worker.fetch(request(), t.env);
  expect(r.status).toBe(200);
  expect(((await r.json()) as { model: string }).model).toBe(MODEL);
  expect(t.run.mock.calls[0][0]).toBe(MODEL);
  const sent = JSON.parse(
    (t.run.mock.calls[0][1] as { messages: { content: string }[] }).messages[1]
      .content,
  );
  expect(sent.exercises[0].previous[0].rir).toEqual({ min: 0, max: 0 });
  expect(sent.condition.sleepHours).toBeNull();
  t.limit.mockResolvedValueOnce({ success: false });
  expect((await t.worker.fetch(request(), t.env)).status).toBe(429);
  expect(t.run).toHaveBeenCalledTimes(1);
});
it("rejects unsafe, malformed, duplicated and locked-set changes", async () => {
  for (const mutate of [
    (r: ReturnType<typeof answer>) => {
      r.recommendations[0].targets[0] = {
        ...r.recommendations[0].targets[0],
        weightKg: 51,
      };
    },
    (r: ReturnType<typeof answer>) => {
      r.recommendations.push(r.recommendations[0]);
    },
    (r: ReturnType<typeof answer>) => {
      r.recommendations[0].targets[0] = {
        ...r.recommendations[0].targets[0],
        setId: "other",
      };
    },
  ]) {
    const reply = structuredClone(answer());
    mutate(reply);
    expect(() => validateAiReply(input, reply)).toThrow();
  }
  const reduced = structuredClone(answer());
  reduced.recommendations[0].targets[0].weightKg = 45;
  expect(() =>
    validateAiReply(
      { ...input, exercises: [{ ...input.exercises[0], locked: true }] },
      reduced,
    ),
  ).toThrow();
  const t = setup();
  t.run.mockResolvedValueOnce({ response: "invalid" });
  expect((await t.worker.fetch(request(), t.env)).status).toBe(502);
});
it("exposes only public auth configuration and status; config never opens advice access", async () => {
  const t = setup();
  const r = await t.worker.fetch(new Request("https://example.com/config"), {
    ...t.env,
    ALLOWED_UID: undefined,
  });
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({
    projectId: "project",
    authDomain: "project.firebaseapp.com",
    apiKey: "public-web-config",
  });
  expect(t.run).not.toHaveBeenCalled();
});
it("cryptographically checks signature, issuer, audience, expiry, auth_time and RS256", async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256"),
    jwk = await exportJWK(publicKey);
  jwk.kid = "test";
  const key = createLocalJWKSet({ keys: [jwk] });
  async function token(
    patch: Record<string, unknown> = {},
    aud = "project",
    iss = "https://securetoken.google.com/project",
    exp = "5m",
  ) {
    return new SignJWT({
      auth_time: Math.floor(Date.now() / 1000) - 5,
      ...patch,
    })
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setSubject("owner")
      .setIssuedAt()
      .setIssuer(iss)
      .setAudience(aud)
      .setExpirationTime(exp)
      .sign(privateKey);
  }
  expect((await verifyFirebaseToken(await token(), "project", key)).sub).toBe(
    "owner",
  );
  for (const tokenValue of [
    await token({}, "other"),
    await token({}, "project", "https://other"),
    await token({}, "project", "https://securetoken.google.com/project", "-1m"),
    await token({ auth_time: Date.now() / 1000 + 500 }),
  ])
    await expect(
      verifyFirebaseToken(tokenValue, "project", key),
    ).rejects.toThrow();
  const other = await generateKeyPair("RS256");
  const bad = await new SignJWT({ auth_time: 1 })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .setSubject("owner")
    .setIssuedAt()
    .setIssuer("https://securetoken.google.com/project")
    .setAudience("project")
    .setExpirationTime("5m")
    .sign(other.privateKey);
  await expect(verifyFirebaseToken(bad, "project", key)).rejects.toThrow();
});
