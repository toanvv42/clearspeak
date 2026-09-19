import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProgressApp from "@/components/progress-app";

const overview = {
  totals: { attempts: 3, practiceDays: 2 },
  due: [
    {
      targetKey: "custom:abc",
      kind: "custom",
      title: "She worked hard.",
      passageId: null,
      passageVersion: null,
      latestAttemptId: "11111111-1111-4111-8111-111111111111",
      lastPracticedAt: "2026-09-10T10:00:00.000Z",
      nextDueAt: "2026-09-11T10:00:00.000Z",
      intervalStep: 0,
      practiceCount: 2,
      lastScore: 72,
    },
  ],
  weekly: [
    { date: "2026-09-13", attempts: 0 },
    { date: "2026-09-14", attempts: 0 },
    { date: "2026-09-15", attempts: 0 },
    { date: "2026-09-16", attempts: 0 },
    { date: "2026-09-17", attempts: 0 },
    { date: "2026-09-18", attempts: 1 },
    { date: "2026-09-19", attempts: 2 },
  ],
  favourites: [],
  stats: [
    {
      targetKey: "custom:abc",
      attempts: 2,
      first: { score: 68, at: "2026-09-09T10:00:00.000Z" },
      latest: { score: 72, at: "2026-09-10T10:00:00.000Z" },
      best: { score: 75, at: "2026-09-08T10:00:00.000Z" },
    },
  ],
};

describe("ProgressApp", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows totals, due practice, weekly counts, and comparable stats", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(overview)));
    render(<ProgressApp accessRequired={false} />);
    expect(await screen.findByRole("heading", { name: /^progress$/i })).toBeInTheDocument();
    expect(screen.getByText("Due for review")).toBeInTheDocument();
    expect(screen.getAllByText("She worked hard.").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/first: 68/i)).toBeInTheDocument();
    expect(screen.getByText(/best: 75/i)).toBeInTheDocument();
    const practiceLinks = screen.getAllByRole("link", { name: "Practice" });
    const repeatLink = practiceLinks.find((a) =>
      (a as HTMLAnchorElement).href.includes("repeat=11111111-1111-4111-8111-111111111111"),
    ) as HTMLAnchorElement;
    expect(repeatLink).toBeDefined();
    expect(repeatLink.getAttribute("href")).toBe("/?repeat=11111111-1111-4111-8111-111111111111");
  });

  it("explains an empty state", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ...overview, due: [], stats: [] })));
    render(<ProgressApp accessRequired={false} />);
    expect(await screen.findByText(/nothing is due/i)).toBeInTheDocument();
    expect(screen.getByText(/no evaluated takes yet/i)).toBeInTheDocument();
  });

  it("offers a retry when progress fails to load", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    const fetchMock = vi.fn(async () => Response.json({ error: "nope" }, { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ProgressApp accessRequired={false} />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    fetchMock.mockImplementationOnce(async () => Response.json(overview));
    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(await screen.findByText("Due for review")).toBeInTheDocument();
  });
});
