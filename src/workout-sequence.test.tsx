import { afterEach, expect, it } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { AppDB, seed, meta } from "./db";
import type { Entities } from "./model";
import { workoutSequence } from "./workout-sequence";
import { WellnessForm } from "./WellnessForm";
import { emptyWellness } from "./wellness";
const opened: AppDB[] = [];
afterEach(async () => {
  cleanup();
  for (const db of opened.splice(0)) await db.delete();
});
async function setup() {
  const db = new AppDB("sequence-" + crypto.randomUUID());
  opened.push(db);
  await seed(db);
  const plans = await db.plans.toArray(),
    exercises = await db.exercises.toArray();
  const a = plans.find((p) => p.catalogKey === "A")!,
    b = plans.find((p) => p.catalogKey === "B")!;
  function session(
    key: "A" | "B",
    day: string,
    status: Entities["sessions"]["status"] = "finished",
  ): Entities["sessions"] {
    const plan = key === "A" ? a : b;
    return {
      ...meta(),
      name: plan.name,
      planId: plan.id,
      startedAt: day + "T12:00:00Z",
      endedAt: status === "finished" ? day + "T13:00:00Z" : null,
      performedDateLocal: day,
      timePrecision: "date",
      slotLabel: key,
      status,
      exercises: [],
      notes: "",
    };
  }
  return { db, plans, exercises, a, b, session };
}
it("alternates A/B using the latest completed local day and ignores deleted, future and old drafts", async () => {
  const { plans, a, b, session } = await setup();
  expect(workoutSequence(plans, [], "2026-11-14").planId).toBe(a.id);
  const first = session("A", "2026-11-09");
  expect(workoutSequence(plans, [first], "2026-11-14").planId).toBe(b.id);
  const second = session("B", "2026-11-10");
  const result = workoutSequence(
    plans,
    [
      first,
      second,
      session("A", "2026-11-12", "paused"),
      { ...session("A", "2026-11-13"), deletedAt: "2026-11-14T12:00:00Z" },
      session("A", "2026-11-16"),
    ],
    "2026-11-14",
  );
  expect(result.planId).toBe(a.id);
  expect(result.previous?.id).toBe(second.id);
  expect(
    workoutSequence(
      plans,
      [first, second, session("A", "2026-11-12")],
      "2026-11-14",
    ).planId,
  ).toBe(b.id);
});
it("resumes today's active menu and recognizes historical A/B snapshots after plan deletion", async () => {
  const { plans, b, session } = await setup();
  expect(
    workoutSequence(
      plans,
      [session("B", "2026-11-10"), session("B", "2026-11-14", "active")],
      "2026-11-14",
    ).planId,
  ).toBe(b.id);
  const old = {
    ...session("A", "2026-11-12"),
    planId: "removed-plan",
    slotLabel: undefined,
  };
  expect(workoutSequence(plans, [old], "2026-11-14")).toMatchObject({
    planId: b.id,
    previousKey: "A",
  });
});
it("shows last date/menu, overrides stale check-in, saves the default, and preserves manual selection", async () => {
  const { db, plans, exercises, a, b, session } = await setup();
  const existing = {
    ...emptyWellness(null, "2026-11-14"),
    plannedPlanId: a.id,
  };
  const sessions = [session("A", "2026-11-12")];
  const view = render(
    <WellnessForm
      database={db}
      unit="lb"
      health={[]}
      plans={plans}
      exercises={exercises}
      sessions={sessions}
      date="2026-11-14"
      existing={existing}
    />,
  );
  const menu = screen.getByRole("combobox", { name: "今日のメニュー" });
  expect(menu).toHaveValue(b.id);
  expect(screen.getByText("前回は2026-11-12にAをやりました。")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(async () =>
    expect((await db.wellness.toArray())[0]?.plannedPlanId).toBe(b.id),
  );
  fireEvent.change(menu, { target: { value: a.id } });
  view.rerender(
    <WellnessForm
      database={db}
      unit="lb"
      health={[]}
      plans={[...plans]}
      exercises={exercises}
      sessions={[...sessions]}
      date="2026-11-14"
      existing={existing}
    />,
  );
  expect(menu).toHaveValue(a.id);
});
it("honors explicitly requested menu over the alternating default", async () => {
  const { db, plans, exercises, a, session } = await setup();
  render(
    <WellnessForm
      database={db}
      unit="lb"
      health={[]}
      plans={plans}
      exercises={exercises}
      sessions={[session("A", "2026-11-12")]}
      date="2026-11-14"
      requestedPlanId={a.id}
    />,
  );
  expect(screen.getByRole("combobox", { name: "今日のメニュー" })).toHaveValue(
    a.id,
  );
});
