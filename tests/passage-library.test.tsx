import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import PassageLibrary from "@/components/passage-library";
import type { PassageFilterState } from "@/lib/practice-content";

const filters: PassageFilterState = { band: "all", topic: "all", focus: "all", query: "" };

function stubFetch() {
  return vi.fn(async (url: unknown, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/api/favourites") && (!init?.method || init.method === "GET")) {
      return Response.json({ items: [] });
    }
    if (u.includes("/api/favourites") && init?.method === "PUT") {
      return Response.json({ item: { targetKey: "library:x:1" } });
    }
    if (u.includes("/api/favourites") && init?.method === "DELETE") {
      return Response.json({ ok: true });
    }
    throw new Error(`unexpected fetch ${u}`);
  });
}

describe("PassageLibrary favourites", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("toggles a favourite star without losing the selection", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch();
    vi.stubGlobal("fetch", fetchMock);
    const onSelect = vi.fn();
    render(
      <PassageLibrary selectedId={undefined} filters={filters} onFiltersChange={vi.fn()} onSelect={onSelect} />,
    );
    const stars = await screen.findAllByRole("button", { name: /to favourites/i });
    expect(stars.length).toBeGreaterThan(0);
    await user.click(stars[0]);
    expect(fetchMock).toHaveBeenCalledWith("/api/favourites", expect.objectContaining({ method: "PUT" }));
    expect(await screen.findAllByRole("button", { name: /remove .* from favourites/i })).toHaveLength(1);
  });

  it("filters to favourites only", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", stubFetch());
    render(
      <PassageLibrary selectedId={undefined} filters={filters} onFiltersChange={vi.fn()} onSelect={vi.fn()} />,
    );
    await screen.findAllByRole("button", { name: /to favourites/i });
    await user.click(screen.getByRole("checkbox", { name: /favourites only/i }));
    expect(await screen.findByText(/no favourite texts match/i)).toBeInTheDocument();
  });

  it("offers curated external practice as link-only resources", () => {
    vi.stubGlobal("fetch", stubFetch());
    render(
      <PassageLibrary selectedId={undefined} filters={filters} onFiltersChange={vi.fn()} onSelect={vi.fn()} />,
    );

    expect(screen.getByText("More listening practice")).toBeInTheDocument();
    const bbc = screen.getByRole("link", { name: /BBC Learning English/i });
    expect(bbc).toHaveAttribute("href", "https://www.bbc.co.uk/learningenglish");
    expect(bbc).toHaveAttribute("target", "_blank");
    expect(screen.getByText(/No transcript, adaptation, or audio is copied/i)).toBeInTheDocument();
  });
});
