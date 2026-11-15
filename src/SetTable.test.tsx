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
it("shows 10 reps at RIR0 as 8 reps at RIR2 without changing actuals or today's targets", async () => {
  const { db, row } = await setup();
  const previous = {
    ...row,
    id: "previous",
    reps: 10,
    rir: { min: 0, max: 0 },
  };
  const before = JSON.stringify(previous);
  const view = render(
    <SetTable database={db} rows={[row]} previous={[previous]} unit="lb" />,
  );
  const cell = view.container.querySelector(".previous-cell")!;
  expect(cell).toHaveTextContent("8回");
  expect(cell).toHaveTextContent("RIR2換算");
  expect(cell).toHaveAttribute("title", "実績：10回 / RIR 0");
  expect(screen.getByLabelText("セット1の回数")).toHaveAttribute(
    "placeholder",
    String(row.defaultReps ?? row.reps),
  );
  expect(JSON.stringify(previous)).toBe(before);
  view.rerender(
    <SetTable
      database={db}
      rows={[row]}
      previous={[{ ...previous, rir: null }]}
      unit="lb"
    />,
  );
  expect(cell).toHaveTextContent("10回");
  expect(cell).not.toHaveTextContent("RIR2換算");
  view.rerender(
    <SetTable
      database={db}
      rows={[row]}
      previous={[{ ...previous, rir: { min: 1.5, max: 3 } }]}
      unit="lb"
    />,
  );
  expect(cell).toHaveTextContent("9回");
});
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
      (r) =>
        r.completedAt &&
        r.rir?.min === 1 &&
        r.rirSource === "default" &&
        r.repsSource === "default",
    ),
  ).toBe(true);
});
it("restores the faint default after an override is erased and saves it on finish", async () => {
  const { db, id, row } = await setup();
  const view = render(
    <SetTable database={db} rows={[row]} previous={[]} unit="lb" />,
  );
  const reps = screen.getByLabelText("セット1の回数");
  expect(reps).toHaveValue(null);
  expect(reps).toHaveAttribute("placeholder", String(row.reps));
  fireEvent.change(reps, { target: { value: "15" } });
  await waitFor(async () => expect((await db.sets.get(row.id))?.reps).toBe(15));
  fireEvent.change(reps, { target: { value: "" } });
  fireEvent.blur(reps);
  await waitFor(async () => {
    const saved = await db.sets.get(row.id);
    expect(saved?.reps).toBe(row.reps);
    expect(saved?.repsSource).toBe("default");
  });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  view.unmount();
  render(
    <SetTable
      database={db}
      rows={[(await db.sets.get(row.id))!]}
      previous={[]}
      unit="lb"
    />,
  );
  expect(screen.getByLabelText("セット1の回数")).toHaveValue(null);
  expect(screen.getByLabelText("セット1の回数")).toHaveAttribute(
    "placeholder",
    String(row.reps),
  );
  await finishWorkout(db, id);
  expect((await db.sets.get(row.id))?.reps).toBe(row.reps);
});

it("keeps typed reps when blur is followed by a delayed snapshot from the preceding weight edit", async () => {
  const { db, row } = await setup();
  const view = render(
    <SetTable database={db} rows={[row]} previous={[]} unit="lb" />,
  );
  const reps = screen.getByLabelText("セット1の回数");
  fireEvent.change(reps, { target: { value: "7" } });
  fireEvent.blur(reps);
  const delayed = {
    ...row,
    revision: row.revision + 1,
    inputState: { ...row.inputState!, weight: "82", weightTouched: true },
  };
  view.rerender(
    <SetTable database={db} rows={[delayed]} previous={[]} unit="lb" />,
  );
  expect(reps).toHaveValue(7);
  await waitFor(async () =>
    expect((await db.sets.get(row.id))?.inputState?.reps).toBe("7"),
  );
});
