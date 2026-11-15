import { it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CARDIO_WEEK, cardioForDate } from "./daily-schedule";
import { DailySchedule } from "./DailySchedule";
afterEach(() => {
  cleanup();
  localStorage.clear();
});
it("shows the agreed two-stage walking schedule and switches by local date", () => {
  expect(cardioForDate(new Date(2026, 10, 16, 12))).toMatchObject({
    workout: "B",
    minutes: 15,
    easy: true,
  });
  expect(cardioForDate(new Date(2026, 10, 17, 12))).toMatchObject({
    workout: "A",
    minutes: 15,
  });
  expect(cardioForDate(new Date(2026, 10, 28, 12))).toMatchObject({
    minutes: 15,
    easy: true,
  });
  expect(cardioForDate(new Date(2026, 10, 29, 12))).toMatchObject({
    minutes: 40,
    easy: false,
  });
  expect(cardioForDate(new Date(2026, 11, 4, 12))).toMatchObject({
    minutes: 0,
    workout: null,
  });
  expect(cardioForDate(new Date(2027, 0, 10, 12))).toMatchObject({
    minutes: 40,
    ended: false,
  });
  expect(cardioForDate(new Date(2027, 0, 11, 12))).toMatchObject({
    minutes: 0,
    ended: true,
  });
  expect(CARDIO_WEEK.reduce((n, r) => n + r.easy, 0)).toBe(100);
  expect(CARDIO_WEEK.reduce((n, r) => n + r.standard, 0)).toBe(150);
});
it("retains easy walking when chosen and isolates that choice by database", () => {
  const view = render(
    <DailySchedule
      date={new Date(2026, 10, 29, 12)}
      storageScope="test-real"
    />,
  );
  expect(
    screen.getByRole("heading", { name: /早歩き 40分/ }),
  ).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("checkbox", { name: "慣らしを続ける", hidden: true }),
  );
  expect(
    screen.getByRole("heading", { name: /早歩き 20分/ }),
  ).toBeInTheDocument();
  view.unmount();
  render(
    <DailySchedule
      date={new Date(2026, 10, 29, 12)}
      storageScope="test-real"
    />,
  );
  expect(
    screen.getByRole("heading", { name: /早歩き 20分/ }),
  ).toBeInTheDocument();
  cleanup();
  render(
    <DailySchedule
      date={new Date(2026, 10, 29, 12)}
      storageScope="test-demo"
    />,
  );
  expect(
    screen.getByRole("heading", { name: /早歩き 40分/ }),
  ).toBeInTheDocument();
});
it("includes every agreed meal portion and keeps the full plan in a compact disclosure", () => {
  render(<DailySchedule date={new Date(2026, 10, 16, 12)} />);
  expect(screen.getByText(/プロテインシリアル30g/)).toBeInTheDocument();
  expect(screen.getByText(/プロテインシリアル30g/)).not.toBeVisible();
  fireEvent.click(screen.getByText("食事プラン"));
  expect(screen.getByText(/プロテインシリアル30g/)).toBeVisible();
  expect(screen.getByText(/鶏むね肉180g/)).toBeVisible();
  expect(screen.getByText(/2,300〜2,400/)).toBeVisible();
});
