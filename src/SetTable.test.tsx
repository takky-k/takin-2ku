import { it, expect, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { AppDB, seed } from "./db";
import { SetTable } from "./SetTable";
import { startWorkout, finishWorkout } from "./training";
const opened: AppDB[] = [];
afterEach(async () => {
  cleanup();
  localStorage.clear();
  for (const db of opened.splice(0)) await db.delete();
});
async function setup() {
  const db = new AppDB("table-" + crypto.randomUUID());
  opened.push(db);
  await seed(db);
  const plan = (await db.plans.toArray())[0],
    id = await startWorkout(db, plan, "lb"),
    row = (await db.sets.where("sessionId").equals(id).toArray())[0];
  return { db, id, row };
}
it("keeps raw partial RIR across mounting/reload and rejects finishing invalid persisted fields", async () => {
  const { db, id, row } = await setup(),
    fields = {
      weight: "20",
      reps: "8",
      rir: "1~",
      weightTouched: true,
      repsTouched: true,
    };
  localStorage.setItem(
    `takin-sheet-draft-${db.name}-${row.id}`,
    JSON.stringify({ unit: "lb", fields }),
  );
  render(<SetTable database={db} rows={[row]} previous={[]} unit="lb" />);
  expect(screen.getByLabelText("セット1のRIR")).toHaveValue("1~");
  fireEvent.change(screen.getByLabelText("セット1のRIR"), {
    target: { value: "1~2" },
  });
  await waitFor(async () =>
    expect((await db.sets.get(row.id))?.completedAt).not.toBeNull(),
  );
  fireEvent.change(screen.getByLabelText("セット1の重量"), {
    target: { value: "-1" },
  });
  await waitFor(async () =>
    expect((await db.sets.get(row.id))?.inputState?.weight).toBe("-1"),
  );
  await expect(finishWorkout(db, id)).rejects.toThrow();
});
it("does not quantize canonical kg when a displayed unit conversion is saved without editing weight", async () => {
  const { db, row } = await setup();
  render(<SetTable database={db} rows={[row]} previous={[]} unit="kg" />);
  fireEvent.change(screen.getByLabelText("セット1の回数"), {
    target: { value: "8" },
  });
  await waitFor(async () =>
    expect((await db.sets.get(row.id))?.completedAt).not.toBeNull(),
  );
  expect((await db.sets.get(row.id))?.weightKg).toBe(row.weightKg);
});
it("records RIR zero with unchanged default reps and preserves empty RIR on the other sets", async () => {
  const { db, id, row } = await setup();
  render(<SetTable database={db} rows={[row]} previous={[]} unit="lb" />);
  fireEvent.change(screen.getByLabelText("セット1のRIR"), {
    target: { value: "0" },
  });
  await waitFor(async () =>
    expect((await db.sets.get(row.id))?.completedAt).not.toBeNull(),
  );
  expect((await db.sets.get(row.id))?.reps).toBe(row.reps);
  expect((await db.sets.get(row.id))?.repsSource).toBe("default");
  expect(screen.getByLabelText("セット1の回数")).toHaveValue(null);
  await finishWorkout(db, id);
  expect((await db.sets.get(row.id))?.rir).toEqual({ min: 0, max: 0 });
  const others = (await db.sets.where("sessionId").equals(id).toArray()).filter(
    (r) => r.id !== row.id,
  );
  expect(
    others.every(
      (r) => r.completedAt && r.rir === null && r.repsSource === "default",
    ),
  ).toBe(true);
});
