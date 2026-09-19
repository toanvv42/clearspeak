import { act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useStoredAccessCode } from "@/hooks/use-access-code";
import { clearAccessCode, setAccessCode } from "@/lib/access-code";

function AccessProbe() {
  const code = useStoredAccessCode();
  return <main>{code ? "Unlocked" : "Locked"}</main>;
}

describe("stored access hydration", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  beforeEach(() => {
    clearAccessCode();
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
    }
    container?.remove();
    root = null;
    container = null;
    clearAccessCode();
  });

  it("uses the server snapshot for hydration before restoring browser storage", async () => {
    setAccessCode("saved-code");

    const serverHtml = renderToString(<AccessProbe />);
    expect(serverHtml).toContain("Locked");

    container = document.createElement("div");
    container.innerHTML = serverHtml;
    document.body.appendChild(container);
    const recoverableErrors: unknown[] = [];

    await act(async () => {
      root = hydrateRoot(container!, <AccessProbe />, {
        onRecoverableError: (error) => recoverableErrors.push(error),
      });
    });

    await waitFor(() => expect(container).toHaveTextContent("Unlocked"));
    expect(recoverableErrors).toEqual([]);
  });
});
