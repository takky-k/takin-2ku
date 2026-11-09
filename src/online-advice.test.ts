import { it, expect, vi, afterEach } from "vitest";
import { AppDB, seed, save, revised } from "./db";
import { startWorkout } from "./training";
import { applyOnlineAdvice, buildAIInput } from "./online-advice";
import * as auth from "./ai-auth";
import type { User } from "@firebase/auth";
const opened: AppDB[] = [];
afterEach(async () => {
  localStorage.clear();
  auth.useAI.setState({ user: null, consent: false, busy: false });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const db of opened.splice(0)) await db.delete();
});
async function setup() {
  const db = new AppDB("ai-" + crypto.randomUUID());
  opened.push(db);
  await seed(db);
  const plan = (await db.plans.toArray())[0],
    id = await startWorkout(db, plan, "lb");
  return { db, id };
}
function enable() {
  auth.setAiConsent(true);
  auth.useAI.setState({ user: { uid: "synthetic-owner" } as User });
  vi.spyOn(auth, "aiToken").mockResolvedValue("synthetic-token");
}
function response(input: Awaited<ReturnType<typeof buildAIInput>>) {
  return {
    model: "@cf/google/gemma-4-26b-a4b-it",
    modelVersion: "1.0",
    recommendations: input!.input.exercises.map((e) => ({
      exerciseId: e.exerciseId,
      rationale: "維持する参考提案です",
      targets: e.targets,
    })),
  };
}
it("never sends data without consent, a logged-in user, or while offline", async () => {
  const { db, id } = await setup(),
    fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  expect(await applyOnlineAdvice(db, id)).toBe(false);
  auth.setAiConsent(true);
  expect(await applyOnlineAdvice(db, id)).toBe(false);
  expect(fetcher).not.toHaveBeenCalled();
});
it("sends only a minimal summary, excluding body weight, names, notes and untouched RIR imputation", async () => {
  const { db, id } = await setup(),
    session = (await db.sessions.get(id))!;
  await save(
    db,
    "sessions",
    revised({ ...session, notes: "PRIVATE SESSION NOTE" }),
  );
  const result = await buildAIInput(db, id),
    text = JSON.stringify(result!.input);
  expect(text).not.toContain("PRIVATE SESSION NOTE");
  expect(text).not.toContain("bodyWeight");
  expect(text).not.toContain("email");
  expect(text).not.toContain("notes");
  expect(result!.input.condition.sleepHours).toBeNull();
});
it("validates and atomically saves AI recommendations after consent and preserves local templates", async () => {
  const { db, id } = await setup();
  enable();
  const snapshot = await buildAIInput(db, id),
    plans = await db.plans.toArray();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify(response(snapshot)), { status: 200 }),
    ),
  );
  expect(await applyOnlineAdvice(db, id)).toBe(true);
  expect(
    (await db.recommendations.toArray()).every(
      (r) =>
        r.sourceModel === "cloudflare-workers-ai" && r.status === "accepted",
    ),
  ).toBe(true);
  expect(await db.plans.toArray()).toEqual(plans);
});
it("falls back without overwriting sets for bad AI output, lost consent or edited input", async () => {
  for (const kind of ["unsafe", "revoke", "edited"]) {
    const { db, id } = await setup();
    enable();
    const snapshot = await buildAIInput(db, id),
      reply = response(snapshot),
      before = await db.sets.toArray();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        if (kind === "unsafe")
          reply.recommendations[0].targets[0].weightKg += 100;
        if (kind === "revoke") auth.setAiConsent(false);
        if (kind === "edited") {
          const row = before[0];
          await save(db, "sets", revised({ ...row, notes: "入力済み" }));
        }
        return new Response(JSON.stringify(reply), { status: 200 });
      }),
    );
    expect(await applyOnlineAdvice(db, id)).toBe(false);
    expect(await db.recommendations.count()).toBe(0);
    if (kind !== "edited") expect(await db.sets.toArray()).toEqual(before);
    else expect((await db.sets.get(before[0].id))?.notes).toBe("入力済み");
  }
});
it("can test the connection with synthetic data without sending any personal workout data", async () => {
  auth.useAI.setState({
    user: {
      uid: "synthetic-owner",
      getIdToken: async () => "test-token",
    } as unknown as User,
  });
  const fetcher = vi.fn(async (_url: unknown, options?: RequestInit) => {
    const body = JSON.parse(options!.body as string);
    expect(body.sessionId).toBe("connection-test");
    expect(body.exercises[0].name).toContain("架空");
    expect(body.condition.sleepHours).toBeNull();
    return new Response(
      JSON.stringify({
        model: "@cf/google/gemma-4-26b-a4b-it",
        recommendations: body.exercises.map(
          (e: { exerciseId: string; targets: unknown[] }) => ({
            exerciseId: e.exerciseId,
            rationale: "接続テストです",
            targets: e.targets,
          }),
        ),
      }),
      { status: 200 },
    );
  });
  vi.stubGlobal("fetch", fetcher);
  expect(auth.hasAiConsent()).toBe(false);
  await auth.testAIConnection();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(auth.useAI.getState().message).toContain("テスト成功");
});
