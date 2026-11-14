import { it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { AppDB, seed } from "./db";
import { startWorkout, finishWorkout, discardWorkout } from "./training";
import { emptyWellness, saveWellness } from "./wellness";
import { generateRecommendations } from "./recommendations";
import { WellnessForm } from "./WellnessForm";
import { stageBodyWeight, readBodyWeightDraft } from "./body-weight-draft";
const opened: AppDB[] = [];
afterEach(async () => {
  cleanup();
  localStorage.clear();
  for (const db of opened.splice(0)) await db.delete();
});
async function setup() {
  const db = new AppDB("body-draft-" + crypto.randomUUID());
  opened.push(db);
  await seed(db);
  const id = await startWorkout(db, (await db.plans.toArray())[0], "lb");
  return { db, id };
}
it("keeps body weight as a recoverable draft without a Save button and commits it with workout completion", async () => {
  const { db, id } = await setup();
  const view = render(
    <WellnessForm
      database={db}
      sessionId={id}
      unit="lb"
      health={[]}
      bodyOnly
      deferBodySave
    />,
  );
  expect(
    screen.queryByRole("button", { name: "保存" }),
  ).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("体重 (kg)"), {
    target: { value: "70.5" },
  });
  expect(await db.wellness.count()).toBe(0);
  view.unmount();
  render(
    <WellnessForm
      database={db}
      sessionId={id}
      unit="lb"
      health={[]}
      bodyOnly
      deferBodySave
    />,
  );
  expect(screen.getByLabelText("体重 (kg)")).toHaveValue(70.5);
  await finishWorkout(db, id);
  expect(
    (await db.wellness.where("sessionId").equals(id).first())?.bodyWeightKg,
  ).toBe(70.5);
  expect((await db.sessions.get(id))?.status).toBe("finished");
  expect(readBodyWeightDraft(db, id)).toBeNull();
});
it("rolls back sets, session and body weight together and keeps the draft after a failed save", async () => {
  const { db, id } = await setup();
  stageBodyWeight(db, id, "72");
  const fail = (_key: unknown, op: { entityType: string }) => {
    if (op.entityType === "wellness") throw Error("Synthetic disk full");
  };
  db.queue.hook("creating", fail);
  await expect(finishWorkout(db, id)).rejects.toThrow();
  expect((await db.sessions.get(id))?.status).toBe("active");
  expect(await db.wellness.count()).toBe(0);
  expect((await db.sets.toArray()).every((r) => r.completedAt === null)).toBe(
    true,
  );
  expect(readBodyWeightDraft(db, id)).toBe("72");
  db.queue.hook("creating").unsubscribe(fail);
  await finishWorkout(db, id);
  expect((await db.wellness.toArray())[0].bodyWeightKg).toBe(72);
});
it("rejects invalid staged weight without completing the workout", async () => {
  const { db, id } = await setup();
  stageBodyWeight(db, id, "501");
  await expect(finishWorkout(db, id)).rejects.toThrow("体重");
  expect((await db.sessions.get(id))?.status).toBe("active");
});
it("discards the workout, related records, selection and journals while keeping the menu and completed history", async () => {
  const { db, id: history } = await setup();
  await finishWorkout(db, history);
  const plan = (await db.plans.toArray())[0],
    id = await startWorkout(db, plan, "lb");
  await generateRecommendations(db, id);
  await saveWellness(db, {
    ...emptyWellness(null),
    plannedPlanId: plan.id,
    mood: 4,
  });
  stageBodyWeight(db, id, "70");
  localStorage.setItem("takin-rest-" + id, "100");
  const row = (await db.sets.where("sessionId").equals(id).toArray())[0];
  localStorage.setItem(
    `takin-sheet-draft-${db.name}-${row.id}`,
    "Synthetic draft",
  );
  await discardWorkout(db, id);
  expect((await db.sessions.get(id))?.deletedAt).not.toBeNull();
  expect(
    (await db.sets.where("sessionId").equals(id).toArray()).every(
      (r) => !!r.deletedAt,
    ),
  ).toBe(true);
  expect(
    (
      await db.recommendations.filter((r) => r.sessionId === id).toArray()
    ).every((r) => !!r.deletedAt),
  ).toBe(true);
  const condition = (await db.wellness.toArray()).find(
    (w) => w.sessionId === null,
  )!;
  expect(condition.plannedPlanId).toBeNull();
  expect(condition.mood).toBe(4);
  expect(await db.plans.get(plan.id)).toEqual(plan);
  expect((await db.sessions.get(history))?.deletedAt).toBeNull();
  expect(readBodyWeightDraft(db, id)).toBeNull();
  expect(localStorage.getItem("takin-rest-" + id)).toBeNull();
  expect(
    localStorage.getItem(`takin-sheet-draft-${db.name}-${row.id}`),
  ).toBeNull();
  await seed(db);
  expect((await db.sessions.get(id))?.deletedAt).not.toBeNull();
});
