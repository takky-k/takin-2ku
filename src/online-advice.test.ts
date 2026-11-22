import { it, expect, vi, afterEach } from "vitest";
import { AppDB, seed, save, revised } from "./db";
import { startWorkout } from "./training";
import { finishWorkout } from "./training";
import { emptyWellness, saveWellness } from "./wellness";
import { prepareWorkout } from "./start-targets";
import { applyOnlineAdvice, buildAIInput, limitNotes } from "./online-advice";
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
  localStorage.setItem(
    "takin-ai-installation-v1:synthetic-owner",
    "a".repeat(64),
  );
  auth.setAiConsent(true);
  auth.useAI.setState({ ready: true });
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
      targets: e.targets.map(({ ordinal: _ordinal, ...target }) => target),
    })),
  };
}
it("never sends data without consent, a logged-in user, or while offline", async () => {
  const { db, id } = await setup(),
    fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  expect(await applyOnlineAdvice(db, id)).toBe(false);
  auth.setAiConsent(true);
  auth.useAI.setState({ ready: true, user: null });
  expect(await applyOnlineAdvice(db, id)).toBe(false);
  expect(fetcher).not.toHaveBeenCalled();
});
it("includes age, latest recorded weight and soreness while excluding identity and notes", async () => {
  const { db, id } = await setup(),
    session = (await db.sessions.get(id))!;
  await save(
    db,
    "sessions",
    revised({ ...session, notes: "PRIVATE SESSION NOTE" }),
  );
  await saveWellness(db, {
    ...emptyWellness(null),
    bodyWeightKg: 73,
    sorenessByMuscle: { 全身: 3 },
    sleepHours: 5.5,
    explicitInputFlags: { sleepHours: true },
  });
  await db.profiles.update("main", { age: 31 });
  const result = await buildAIInput(db, id),
    text = JSON.stringify(result!.input);
  expect(text).not.toContain("PRIVATE SESSION NOTE");
  expect(result!.input.profile).toMatchObject({ age: 31, bodyWeightKg: 73 });
  expect(text).not.toContain("email");
  expect(text).not.toContain("notes");
  expect(result!.input.condition).toMatchObject({
    sleepHours: 5.5,
    soreness: { 全身: 3 },
  });
});
it("keeps recent full notes within the byte budget and leaves workout targets and RIR intact", async () => {
  const { db, id } = await setup();
  const input = (await buildAIInput(db, id))!.input;
  const target = structuredClone(input.exercises[0].targets);
  input.exercises[0].setNotes = [
    { daysAgo: 2, ordinal: 0, note: "肩に痛み" },
    { daysAgo: 4, ordinal: 1, note: "長".repeat(5000) },
    { daysAgo: 8, ordinal: 2, note: "問題なし" },
    { daysAgo: 31, ordinal: 0, note: "古い記録" },
  ];
  limitNotes(input);
  expect(input.exercises[0].setNotes?.map((n) => n.note)).toEqual([
    "肩に痛み",
    "問題なし",
  ]);
  expect(input.exercises[0].targets).toEqual(target);
  expect(
    new TextEncoder().encode(JSON.stringify(input)).length,
  ).toBeLessThanOrEqual(30000);
});
it("includes a completed matching set note and recorded RIR in the AI input", async () => {
  const { db, id } = await setup();
  const oldRows = await db.sets.where("sessionId").equals(id).toArray();
  const first = oldRows[0];
  await save(
    db,
    "sets",
    revised({
      ...first,
      notes: "肩に痛み",
      rir: { min: 1, max: 1 },
      rirSource: "entered",
      completedAt: new Date().toISOString(),
    }),
  );
  await finishWorkout(db, id);
  const plan = (await db.plans.toArray())[0];
  const next = await startWorkout(db, plan, "lb");
  const input = (await buildAIInput(db, next))!.input;
  const e = input.exercises.find((e) => e.exerciseId === first.exerciseId)!;
  expect(e.setNotes?.[0]).toMatchObject({
    note: "肩に痛み",
    ordinal: first.ordinal,
  });
  expect(e.previous.find((r) => r.ordinal === first.ordinal)?.rir).toEqual({
    min: 1,
    max: 1,
  });
});
it.each([true, false])(
  "automatically applies only the selected source on start (AI available: %s)",
  async (available) => {
    const { db, id } = await setup();
    const session = (await db.sessions.get(id))!;
    const plan = (await db.plans.get(session.planId!))!;
    await saveWellness(db, {
      ...emptyWellness(null),
      plannedPlanId: plan.id,
      fatigueByMuscle: Object.fromEntries(
        session.exercises.map((e) => [e.muscle, 1]),
      ),
    });
    enable();
    const snapshot = await buildAIInput(db, id);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        available
          ? Response.json(response(snapshot))
          : new Response(null, { status: 502 }),
      ),
    );
    await prepareWorkout(db, plan, "lb", true);
    const recs = await db.recommendations.toArray();
    expect(recs.length).toBe(plan.exercises.length);
    expect(
      recs.every(
        (r) =>
          r.status === "accepted" &&
          r.sourceModel ===
            (available ? "cloudflare-workers-ai" : "local-rule"),
      ),
    ).toBe(true);
  },
);
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
it("remembers a successful installation only for its owner and sends no health data during unlock", async () => {
  auth.useAI.setState({
    user: {
      uid: "test-owner",
      getIdToken: async () => "synthetic",
    } as unknown as User,
  });
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 428 }))
    .mockResolvedValueOnce(Response.json({ unlocked: true }));
  vi.stubGlobal("fetch", fetcher);
  await expect(auth.unlockInstallation("wrong")).rejects.toThrow("違います");
  expect(auth.installationReady("test-owner")).toBe(false);
  await auth.unlockInstallation("fictional-install-password");
  expect(auth.installationReady("test-owner")).toBe(true);
  expect(auth.installationReady("someone-else")).toBe(false);
  const [url, options] = fetcher.mock.calls[1];
  expect(url).toBe(auth.AI_ENDPOINT + "/unlock");
  expect(options.body).toBeUndefined();
  expect(options.headers["X-AI-Installation"]).toMatch(/^[a-f0-9]{64}$/);
  await auth.logoutAI();
  expect(auth.installationReady("test-owner")).toBe(false);
});
it("can test the connection with synthetic data without sending any personal workout data", async () => {
  localStorage.setItem(
    "takin-ai-installation-v1:synthetic-owner",
    "a".repeat(64),
  );
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
