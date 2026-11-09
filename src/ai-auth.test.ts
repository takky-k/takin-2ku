import { it, expect, vi } from "vitest";
it("can retry auth initialization after an offline attempt, without sending health data", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(navigator, "onLine");
  const fetcher = vi.fn(async () => new Response("{}", { status: 503 }));
  vi.stubGlobal("fetch", fetcher);
  try {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    const auth = await import("./ai-auth");
    await auth.initAIAuth();
    expect(auth.useAI.getState().ready).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    await auth.initAIAuth();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0])).not.toContain("advice");
  } finally {
    if (descriptor) Object.defineProperty(navigator, "onLine", descriptor);
    else Reflect.deleteProperty(navigator, "onLine");
    vi.unstubAllGlobals();
  }
});
