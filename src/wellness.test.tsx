import { it, expect, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { AppDB, seed } from "./db";
import { WellnessForm } from "./WellnessForm";
import { emptyWellness, saveWellness } from "./wellness";
const opened: AppDB[] = [];
function fresh() {
  const db = new AppDB("wellness-" + crypto.randomUUID());
  opened.push(db);
  return db;
}
afterEach(async () => {
  cleanup();
  for (const d of opened.splice(0)) await d.delete();
});
it("keeps untouched sliders null and upserts on explicit save without clearing the form", async () => {
  const db = fresh();
  await seed(db);
  const plans = await db.plans.toArray(),
    exercises = await db.exercises.toArray();
  render(
    <WellnessForm
      database={db}
      unit="lb"
      health={[]}
      plans={plans}
      exercises={exercises}
    />,
  );
  fireEvent.change(screen.getByRole("combobox", { name: "今日のメニュー" }), {
    target: { value: plans.find((p) => p.catalogKey === "A")!.id },
  });
  const mood = screen.getByRole("slider", { name: "気分" }),
    fatigue = screen.getByRole("slider", { name: "背中の筋肉疲労" });
  expect(mood).toHaveAttribute("aria-valuetext", "未入力");
  fireEvent.change(mood, { target: { value: "5" } });
  expect(await db.wellness.count()).toBe(0);
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await screen.findByText("保存しました");
  const first = (await db.wellness.toArray())[0];
  expect(first.mood).toBe(5);
  expect(first.fatigue).toBeNull();
  expect(mood).toHaveValue("5");
  expect(screen.getByRole("button", { name: "保存" })).toBeVisible();
  fireEvent.change(fatigue, { target: { value: "1" } });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(async () =>
    expect((await db.wellness.get(first.id))?.fatigueByMuscle?.["背中"]).toBe(
      1,
    ),
  );
  expect(await db.wellness.count()).toBe(1);
  expect(mood).toHaveValue("5");
  expect(fatigue).toHaveValue("1");
});
it("asks only selected-plan muscles and retains values when switching between A and B", async () => {
  const db = fresh();
  await seed(db);
  const plans = await db.plans.toArray(),
    exercises = await db.exercises.toArray();
  render(
    <WellnessForm
      database={db}
      unit="lb"
      health={[]}
      plans={plans}
      exercises={exercises}
    />,
  );
  expect(
    screen.queryByRole("slider", { name: "全身の筋肉疲労" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("slider", { name: "胸の筋肉疲労" }),
  ).not.toBeInTheDocument();
  const select = screen.getByRole("combobox", { name: "今日のメニュー" });
  fireEvent.change(select, {
    target: { value: plans.find((p) => p.catalogKey === "A")!.id },
  });
  fireEvent.change(screen.getByRole("slider", { name: "背中の筋肉疲労" }), {
    target: { value: "5" },
  });
  fireEvent.change(select, {
    target: { value: plans.find((p) => p.catalogKey === "B")!.id },
  });
  expect(
    screen.queryByRole("slider", { name: "背中の筋肉疲労" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("slider", { name: "胸の筋肉疲労" })).toHaveAttribute(
    "aria-valuetext",
    "未入力",
  );
  fireEvent.change(select, {
    target: { value: plans.find((p) => p.catalogKey === "A")!.id },
  });
  expect(screen.getByRole("slider", { name: "背中の筋肉疲労" })).toHaveValue(
    "5",
  );
});
it("marks an explicitly selected neutral value and retains input after storage failure", async () => {
  const db = fresh();
  render(<WellnessForm database={db} unit="kg" health={[]} />);
  const mood = screen.getByRole("slider", { name: "気分" });
  fireEvent.pointerUp(mood);
  const fail = () => {
    throw Error("test disk full");
  };
  db.queue.hook("creating", fail);
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await screen.findByText(/保存できませんでした/);
  expect(mood).toHaveValue("3");
  expect(await db.wellness.count()).toBe(0);
  db.queue.hook("creating").unsubscribe(fail);
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await screen.findByText("保存しました");
  expect((await db.wellness.toArray())[0].explicitInputFlags?.mood).toBe(true);
});
it("serializes two initial saves into one daily check-in", async () => {
  const db = fresh();
  await Promise.all([
    saveWellness(db, { ...emptyWellness(null), mood: 2 }),
    saveWellness(db, { ...emptyWellness(null), mood: 4 }),
  ]);
  expect(await db.wellness.count()).toBe(1);
  expect((await db.wellness.toArray())[0].mood).toBe(4);
});
it("awaits the saved callback, prevents duplicate saves and reports start failure without losing saved input", async () => {
  const db = fresh();
  await seed(db);
  let finish!: () => void,
    calls = 0;
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  render(
    <WellnessForm
      database={db}
      unit="lb"
      health={[]}
      onSaved={async (saved) => {
        calls++;
        expect(await db.wellness.get(saved.id)).toBeDefined();
        await gate;
        throw Error("目標を準備できません");
      }}
    />,
  );
  const mood = screen.getByRole("slider", { name: "気分" });
  fireEvent.change(mood, { target: { value: "4" } });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() => expect(calls).toBe(1));
  expect(screen.getByRole("button", { name: "保存中…" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "保存中…" }));
  expect(calls).toBe(1);
  finish();
  await screen.findByText(/コンディションは保存済みです.*目標を準備できません/);
  expect(await db.wellness.count()).toBe(1);
  expect(mood).toHaveValue("4");
});
