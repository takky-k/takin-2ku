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
it("renders Japanese local mode and separates demo and real history", async () => {
  render(
    <HashRouter>
      <App />
    </HashRouter>,
  );
  expect(
    await screen.findByRole("heading", { name: "今日も、一歩ずつ。" }),
  ).toBeInTheDocument();
  expect(
    await screen.findByRole("heading", { name: "全身ベーシック" }),
  ).toBeInTheDocument();
  await waitFor(async () => expect(await demoDb.sessions.count()).toBe(6));
  expect(await db.sessions.count()).toBe(0);
  fireEvent.click(screen.getByRole("button", { name: "デモを見る" }));
  expect(await screen.findByText("デモ専用データを表示中")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "実データに戻る" }));
  expect(await db.sessions.count()).toBe(0);
});
