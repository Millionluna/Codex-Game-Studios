// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/image", async () => {
  const React = await import("react");

  return {
    default: ({
      priority,
      ...props
    }: React.ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) => {
      void priority;
      return React.createElement("img", props);
    },
  };
});

import { CommunicationNoteComposer } from "./communication-note-composer";

const FIELD_NAMES = [
  "occurred_at",
  "contact_channel",
  "parties_by_role",
  "observable_facts",
  "action_taken",
  "stated_outcome",
  "follow_up",
] as const;

const REQUIRED_FIELD_NAMES = FIELD_NAMES.slice(0, 5);
const IDENTIFIERS = [
  "Name: Jane Smith",
  "worker@example.test",
  "0412 345 678",
  "NDIS number: 123456789",
  "Address: 12 Smith Street Melbourne VIC 3000",
  "DOB: 01/02/1980",
] as const;

let container: HTMLDivElement;
let root: Root;
let originalSendBeaconDescriptor: PropertyDescriptor | undefined;
let animationFrameCallbacks: FrameRequestCallback[];

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(
    { boundary: "safe-baseline" },
    "",
    "/ai-documents/communication-note?lang=en",
  );

  animationFrameCallbacks = [];
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      animationFrameCallbacks.push(callback);
      return animationFrameCallbacks.length;
    }),
  );

  originalSendBeaconDescriptor = Object.getOwnPropertyDescriptor(
    window.navigator,
    "sendBeacon",
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();

  if (originalSendBeaconDescriptor) {
    Object.defineProperty(
      window.navigator,
      "sendBeacon",
      originalSendBeaconDescriptor,
    );
  } else {
    Reflect.deleteProperty(window.navigator, "sendBeacon");
  }

  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("Communication Note composer browser boundary", () => {
  it("keeps every local-only client module free of network and persistence APIs", () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        "src/app/ai-documents/communication-note/communication-note-composer.tsx",
      ),
      "utf8",
    );

    expect(source).not.toMatch(
      /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage)\b/,
    );
    expect(source).not.toMatch(/["'`]\/api\//);
    expect(source).not.toMatch(/\bhistory\.(?:pushState|replaceState)\b/);
  });

  it("exposes labelled controls and moves focus to linked validation errors", async () => {
    await renderComposer();

    expect(container.querySelectorAll("main")).toHaveLength(1);
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(container.querySelectorAll("form")).toHaveLength(0);
    expect(container.querySelectorAll('[role="form"]')).toHaveLength(1);
    expect(container.querySelectorAll("fieldset legend").length).toBeGreaterThan(
      0,
    );

    for (const fieldName of FIELD_NAMES) {
      const control = getField(fieldName);
      expect(control.id).not.toBe("");
      expect(
        container.querySelector(`label[for="${control.id}"]`),
        fieldName,
      ).not.toBeNull();
      expect(control.getAttribute("autocomplete")).toBe("off");
      expect(control.getAttribute("spellcheck")).toBe("false");
    }

    for (const fieldName of REQUIRED_FIELD_NAMES) {
      expect(getField(fieldName).required, fieldName).toBe(true);
    }
    expect(getField("stated_outcome").required).toBe(false);
    expect(getField("follow_up").required).toBe(false);
    expect(container.querySelector("button:not([type])")).toBeNull();
    expect(container.querySelectorAll('button[type="submit"]')).toHaveLength(0);

    const generationButton = getDisabledGenerationButton();
    const boundaryId = generationButton.getAttribute("aria-describedby");
    expect(boundaryId).toBe("communication-note-generation-boundary");
    expect(document.getElementById(boundaryId ?? "")?.textContent).toContain(
      "No model, Product API, Points, save or export action",
    );

    await clickButton("Review facts and privacy");
    await flushAnimationFrames();

    const summary = container.querySelector<HTMLElement>('[role="alert"]');
    expect(summary?.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(summary);

    for (const fieldName of REQUIRED_FIELD_NAMES) {
      const control = getField(fieldName);
      expect(control.getAttribute("aria-invalid"), fieldName).toBe("true");
      const describedBy = control
        .getAttribute("aria-describedby")
        ?.split(/\s+/)
        .filter(Boolean);
      expect(describedBy?.length, fieldName).toBeGreaterThan(0);
      expect(
        describedBy?.some((id) => document.getElementById(id)?.textContent),
        fieldName,
      ).toBe(true);
    }

    await act(async () => {
      setNativeValue(
        getField("occurred_at"),
        "2026-09-01T14:30:00+10:00",
      );
      getField("occurred_at").dispatchEvent(
        new Event("input", { bubbles: true }),
      );
    });
    expect(container.querySelector('[role="alert"]')).toBeNull();
    for (const fieldName of REQUIRED_FIELD_NAMES) {
      expect(getField(fieldName).getAttribute("aria-invalid"), fieldName).toBeNull();
    }
  });

  it("sanitises identifiers, completes local confirmations, and performs zero I/O", async () => {
    const io = installBrowserIoSpies();
    const startingUrl = window.location.href;

    await renderComposer();
    await fillFields({
      occurred_at: "2026-09-01T14:30:00+10:00",
      contact_channel: "Phone",
      parties_by_role: "Name: Jane Smith\nSupport worker",
      observable_facts:
        "The caller used worker@example.test and 0412 345 678.",
      action_taken: "The worker recorded NDIS number: 123456789.",
      stated_outcome: "Address: 12 Smith Street Melbourne VIC 3000",
      follow_up: "DOB: 01/02/1980",
    });

    await submitLocalReview();
    expect(text()).toContain("obvious identifier findings");
    expect(text()).toContain("Apply clean-up and review again");
    for (const identifier of IDENTIFIERS) {
      expect(reviewPanelText()).not.toContain(identifier);
    }

    await clickButton("Apply clean-up and review again");
    for (const fieldName of FIELD_NAMES) {
      for (const identifier of IDENTIFIERS) {
        expect(getField(fieldName).value).not.toContain(identifier);
      }
    }

    const confirmations = [
      ...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    ];
    expect(confirmations).toHaveLength(2);
    expect(confirmations.every(({ checked }) => !checked)).toBe(true);
    for (const confirmation of confirmations) {
      expect(
        container.querySelector(`label[for="${confirmation.id}"]`),
      ).not.toBeNull();
      await act(async () => confirmation.click());
    }

    const generationButton = getDisabledGenerationButton();
    expect(generationButton.textContent).toContain(
      "Ready locally · generation unavailable",
    );
    expect(generationButton.disabled).toBe(true);

    expect(window.location.href).toBe(startingUrl);
    expect(window.history.state).toEqual({ boundary: "safe-baseline" });
    expect(io.pushState).not.toHaveBeenCalled();
    expect(io.replaceState).not.toHaveBeenCalled();
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector('button[type="submit"]')).toBeNull();

    const navigationSurface = [
      window.location.href,
      JSON.stringify(window.history.state),
      ...[...container.querySelectorAll<HTMLAnchorElement>("a")].map(
        (anchor) => anchor.getAttribute("href") ?? "",
      ),
    ].join(" ");
    for (const identifier of IDENTIFIERS) {
      expect(navigationSurface).not.toContain(identifier);
    }

    expectNoBrowserIo(io);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);

    await act(async () => root.unmount());
    root = createRoot(container);
    await renderComposer();

    for (const fieldName of FIELD_NAMES) {
      expect(getField(fieldName).value, fieldName).toBe("");
    }
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    expectNoBrowserIo(io);
  });
});

async function renderComposer() {
  await act(async () => {
    root.render(<CommunicationNoteComposer locale="en" />);
  });
}

function getField(fieldName: (typeof FIELD_NAMES)[number]) {
  const control = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `[name="${fieldName}"]`,
  );
  if (!control) {
    throw new Error(`Missing Communication Note field: ${fieldName}`);
  }
  return control;
}

async function fillFields(
  values: Record<(typeof FIELD_NAMES)[number], string>,
) {
  await act(async () => {
    for (const fieldName of FIELD_NAMES) {
      setNativeValue(getField(fieldName), values[fieldName]);
      getField(fieldName).dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
}

function setNativeValue(
  control: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  const prototype =
    control instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (!setter) {
    throw new Error("Native value setter is unavailable");
  }
  setter.call(control, value);
}

async function submitLocalReview() {
  await clickButton("Review facts and privacy");
  await flushAnimationFrames();
}

async function flushAnimationFrames() {
  const callbacks = animationFrameCallbacks.splice(0);
  await act(async () => {
    for (const callback of callbacks) {
      callback(performance.now());
    }
  });
}

async function clickButton(label: string) {
  const button = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.includes(label),
  );
  if (!button) {
    throw new Error(`Missing button: ${label}`);
  }
  await act(async () => button.click());
}

function getDisabledGenerationButton() {
  const button = container.querySelector<HTMLButtonElement>(
    'button[type="button"][disabled][aria-describedby="communication-note-generation-boundary"]',
  );
  if (!button) {
    throw new Error("Disabled generation boundary was not rendered");
  }
  return button;
}

function reviewPanelText() {
  return (
    container.querySelector('[aria-labelledby="communication-note-review-title"]')
      ?.textContent ?? ""
  );
}

function text() {
  return container.textContent ?? "";
}

function installBrowserIoSpies() {
  const fetcher = vi.fn();
  const webSocket = vi.fn();
  const eventSource = vi.fn();
  const sendBeacon = vi.fn();

  vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal("WebSocket", webSocket);
  vi.stubGlobal("EventSource", eventSource);
  Object.defineProperty(window.navigator, "sendBeacon", {
    configurable: true,
    value: sendBeacon,
  });

  return {
    fetcher,
    webSocket,
    eventSource,
    sendBeacon,
    xhrOpen: vi.spyOn(XMLHttpRequest.prototype, "open"),
    xhrSend: vi.spyOn(XMLHttpRequest.prototype, "send"),
    storageGet: vi.spyOn(Storage.prototype, "getItem"),
    storageSet: vi.spyOn(Storage.prototype, "setItem"),
    storageRemove: vi.spyOn(Storage.prototype, "removeItem"),
    storageClear: vi.spyOn(Storage.prototype, "clear"),
    pushState: vi.spyOn(window.history, "pushState"),
    replaceState: vi.spyOn(window.history, "replaceState"),
  };
}

function expectNoBrowserIo(io: ReturnType<typeof installBrowserIoSpies>) {
  expect(io.fetcher).not.toHaveBeenCalled();
  expect(io.xhrOpen).not.toHaveBeenCalled();
  expect(io.xhrSend).not.toHaveBeenCalled();
  expect(io.webSocket).not.toHaveBeenCalled();
  expect(io.eventSource).not.toHaveBeenCalled();
  expect(io.sendBeacon).not.toHaveBeenCalled();
  expect(io.storageGet).not.toHaveBeenCalled();
  expect(io.storageSet).not.toHaveBeenCalled();
  expect(io.storageRemove).not.toHaveBeenCalled();
  expect(io.storageClear).not.toHaveBeenCalled();
}
