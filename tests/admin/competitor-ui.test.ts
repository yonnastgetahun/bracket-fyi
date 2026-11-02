import type { ReactElement } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
// Deterministic hook harness invokes the actual rendered element callbacks;
// browser rendering/focus acceptance is separately parent-owned.
const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }));
vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual,
    useState: (initial: unknown) => {
      const i = hooks.cursor++;
      if (!(i in hooks.values)) hooks.values[i] = initial;
      return [hooks.values[i], (value: unknown) => { hooks.values[i] = value; }];
    },
    useRef: (initial: unknown) => {
      const i = hooks.cursor++;
      if (!(i in hooks.values)) hooks.values[i] = { current: initial };
      return hooks.values[i];
    },
  };
});
import { CompetitorRow } from "@/components/AdminConsole";
type Element = ReactElement<Record<string, unknown>>;
const onRename = vi.fn();
function render() {
  hooks.cursor = 0;
  return CompetitorRow({ team: { id: "seed-0", name: "Original", aliases: [] }, leagueId: "league-a", onRename }) as Element;
}
function find(node: unknown, predicate: (node: Element) => boolean): Element | undefined {
  if (!node || typeof node !== "object" || !("props" in node)) return;
  const element = node as Element;
  if (predicate(element)) return element;
  const children = element.props.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const result = find(child, predicate); if (result) return result;
  }
}
function editing() {
  (find(render(), n => n.type === "button")!.props.onClick as () => void)();
  (find(render(), n => n.type === "input")!.props.onChange as (e: unknown) => void)({ target: { value: "Local name" } });
  return find(render(), n => n.type === "input")!;
}
beforeEach(() => { hooks.values = []; hooks.cursor = 0; onRename.mockClear(); });
afterEach(() => vi.unstubAllGlobals());
for (const mode of ["http", "network", "malformed"] as const) {
  it("keeps original display, editable draft and visible error on " + mode + " failure", async () => {
    const fetcher = vi.fn();
    if (mode === "network") fetcher.mockRejectedValue(new Error("offline"));
    else fetcher.mockResolvedValue(new Response(mode === "malformed" ? "{}" : "denied", { status: mode === "http" ? 403 : 200 }));
    vi.stubGlobal("fetch", fetcher);
    await (editing().props.onBlur as () => Promise<void>)();
    expect(onRename).not.toHaveBeenCalled();
    expect(find(render(), n => n.props.role === "alert")?.props.children).toContain("Could not confirm");
    expect(find(render(), n => n.type === "input")?.props.value).toBe("Local name");
    fetcher.mockResolvedValue(Response.json({ success: true, name: "Saved name" }));
    await (find(render(), n => n.type === "input")!.props.onBlur as () => Promise<void>)();
    expect(onRename).toHaveBeenCalledExactlyOnceWith("seed-0", "Saved name");
    expect(find(render(), n => n.props.role === "alert")).toBeUndefined();
  });
}
it("deduplicates Enter/blur while saving and publishes only the server-confirmed name", async () => {
  let finish!: (response: Response) => void;
  const fetcher = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
  vi.stubGlobal("fetch", fetcher);
  const input = editing();
  const pending = (input.props.onBlur as () => Promise<void>)();
  await (input.props.onBlur as () => Promise<void>)();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(onRename).not.toHaveBeenCalled();
  expect(find(render(), n => n.type === "input")?.props.readOnly).toBe(true);
  finish(Response.json({ success: true, name: "Confirmed" }));
  await pending;
  expect(onRename).toHaveBeenCalledExactlyOnceWith("seed-0", "Confirmed");
  expect(find(render(), n => n.type === "input")).toBeUndefined();
});
