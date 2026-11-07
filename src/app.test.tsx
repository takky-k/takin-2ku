import { afterEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { HashRouter } from "react-router-dom";
import { App } from "./main";
import { db, demoDb } from "./db";
import { useUI } from "./store";
vi.mock("virtual:pwa-register/react", () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));
afterEach(async () => {
  cleanup();
  await db.delete();
  await demoDb.delete();
  useUI.setState({ demo: false, error: "" });
});
it("renders the simplified dashboard without slogans, copy or demo controls", async () => {
  render(
    <HashRouter>
      <App />
    </HashRouter>,
  );
  expect(
    await screen.findByRole("heading", { name: "今日のトレーニング" }),
  ).toBeInTheDocument();
  expect(
    await screen.findByRole("heading", { name: "A｜背中・リアデルト・二頭筋" }),
  ).toBeInTheDocument();
  await waitFor(async () => expect(await demoDb.sessions.count()).toBe(6));
  expect(await db.sessions.count()).toBe(0);
  expect(
    screen.queryByRole("button", { name: "デモを見る" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText("今日も、一歩ずつ。")).not.toBeInTheDocument();
  expect(
    screen.queryByText("あなたのペースで、積み重ねる。"),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /複製/ }),
  ).not.toBeInTheDocument();
  expect(await db.sessions.count()).toBe(0);
});
