// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { BusinessProfileSettings } from "./business-profile-settings";
import { BusinessHoursSettings } from "./business-hours-settings";
import { AiPolicySettings } from "./ai-policy-settings";
import { SettingsPageHeader } from "./settings-page-header";
import {
  customerLanguageOptions,
  timezoneOptions,
} from "@/lib/business-setting-options";

const emptyWeek = {
  monday: [{ start: "08:00", end: "12:00" }],
  tuesday: [],
  wednesday: [],
  thursday: [],
  friday: [],
  saturday: [],
  sunday: [],
};

const mock = vi.hoisted(() => ({
  profileUpdate: vi.fn(),
  hoursUpdate: vi.fn(),
  policyUpdate: vi.fn(),
  profile: {} as Record<string, unknown>,
  hours: {} as Record<string, unknown>,
  policy: {} as Record<string, unknown>,
}));

vi.mock("convex/react", () => ({
  useMutation: (reference: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(reference);
    if (name === "businessProfile:update") return mock.profileUpdate;
    if (name === "businessHours:update") return mock.hoursUpdate;
    if (name === "aiPolicy:update") return mock.policyUpdate;
    throw new Error(`Unexpected mutation: ${name}`);
  },
  useQuery: (reference: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(reference);
    if (name === "businessProfile:get") return mock.profile;
    if (name === "businessHours:get") return mock.hours;
    if (name === "aiPolicy:get") return mock.policy;
    throw new Error(`Unexpected query: ${name}`);
  },
}));

beforeEach(() => {
  mock.profileUpdate.mockReset().mockResolvedValue(undefined);
  mock.hoursUpdate.mockReset().mockResolvedValue(undefined);
  mock.policyUpdate.mockReset().mockResolvedValue(undefined);
  mock.profile = {
    canEdit: true,
    profile: {
      _id: "profile-a",
      updatedAt: 1,
      companyName: "Testverkstaden",
      timezone: "Europe/Stockholm",
      defaultLanguage: "sv-SE",
      phone: "",
      email: "",
      website: "",
      address: "",
      businessDescription: "",
    },
  };
  mock.hours = {
    canEdit: true,
    timezone: "Europe/Stockholm",
    hours: { _id: "hours-a", updatedAt: 1, schedule: emptyWeek },
  };
  mock.policy = {
    canEdit: true,
    policy: {
      _id: "policy-a",
      updatedAt: 1,
      actions: {
        bookingCreate: "confirm",
        bookingReschedule: "confirm",
        bookingCancel: "human",
        caseCreate: "allow",
      },
      responseLanguage: "business_default",
      communicationTone: "neutral",
    },
  };
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("settings navigation and selectors", () => {
  it("links every settings subpage back to the settings index", () => {
    render(<SettingsPageHeader description="Beskrivning" title="Företag" />);
    expect(
      screen
        .getByRole("link", { name: "Tillbaka till inställningar" })
        .getAttribute("href"),
    ).toBe("/settings");
  });

  it("shows only verified languages while preserving an existing saved code", () => {
    render(<BusinessProfileSettings />);
    const language = screen.getByLabelText(/^Standardspråk för kundsvar/);
    expect((language as HTMLSelectElement).value).toBe("sv-SE");
    expect(
      screen.getByRole("option", { name: /Svenska \(sv-SE/ }),
    ).toBeTruthy();
    expect(screen.getByRole("option", { name: "Svenska" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Engelska" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Tyska" })).toBeNull();
    expect(customerLanguageOptions("de-DE")[0]?.label).toContain(
      "AI-svar använder svenska",
    );
  });

  it("searches IANA timezones by city and retains a saved alias", () => {
    render(<BusinessProfileSettings />);
    const timezone = screen.getByLabelText(/^Tidszon/);
    expect((timezone as HTMLInputElement).value).toBe(
      "Stockholm — Europe/Stockholm",
    );
    fireEvent.focus(timezone);
    fireEvent.change(timezone, { target: { value: "Tokyo" } });
    const tokyo = screen.getByRole("option", {
      name: "Tokyo — Asia/Tokyo",
    });
    fireEvent.pointerDown(tokyo);
    expect((timezone as HTMLInputElement).value).toBe("Tokyo — Asia/Tokyo");
    fireEvent.focus(timezone);
    fireEvent.change(timezone, { target: { value: "London" } });
    fireEvent.keyDown(timezone, { key: "Enter" });
    expect((timezone as HTMLInputElement).value).toBe("London — Europe/London");
    expect(timezoneOptions("US/Eastern")[0]?.value).toBe("US/Eastern");
  });
});

describe("settings form behavior", () => {
  it("removes intervals only in the draft and restores the saved schedule", () => {
    render(<BusinessHoursSettings />);
    fireEvent.click(screen.getByRole("button", { name: "Ta bort" }));
    expect(screen.queryByLabelText("Måndag öppnar, intervall 1")).toBeNull();
    expect(screen.getByText("Du har osparade ändringar.")).toBeTruthy();
    expect(mock.hoursUpdate).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Återställ ändringar" }),
    );
    expect(screen.getByLabelText("Måndag öppnar, intervall 1")).toBeTruthy();
    expect(screen.queryByText("Du har osparade ändringar.")).toBeNull();
  });

  it("places overlap validation next to the affected day", async () => {
    render(<BusinessHoursSettings />);
    fireEvent.click(
      screen.getByRole("button", { name: "Lägg till tidsintervall" }),
    );
    fireEvent.change(screen.getByLabelText("Måndag öppnar, intervall 2"), {
      target: { value: "09:00" },
    });
    fireEvent.change(screen.getByLabelText("Måndag stänger, intervall 2"), {
      target: { value: "11:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Spara ändringar" }));
    expect(
      await screen.findByText(
        "Måndag: tidsintervallen får inte överlappa varandra.",
      ),
    ).toBeTruthy();
    expect(mock.hoursUpdate).not.toHaveBeenCalled();
  });

  it("keeps failed input, blocks duplicate submits and saves only after success", async () => {
    mock.profileUpdate.mockRejectedValueOnce(
      new Error("Servern avvisade ändringen"),
    );
    render(<BusinessProfileSettings />);
    const company = screen.getByLabelText("Företagsnamn");
    fireEvent.change(company, { target: { value: "Nytt namn" } });
    fireEvent.click(screen.getByRole("button", { name: "Spara ändringar" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Servern avvisade ändringen",
    );
    expect((company as HTMLInputElement).value).toBe("Nytt namn");

    let resolveSave: (() => void) | undefined;
    mock.profileUpdate.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Spara ändringar" }));
    fireEvent.click(screen.getByRole("button", { name: "Sparar…" }));
    expect(mock.profileUpdate).toHaveBeenCalledTimes(2);
    await act(async () => resolveSave?.());
    expect(await screen.findByText("Ändringarna är sparade.")).toBeTruthy();
  });

  it("warns before a controlled navigation with unsaved changes", () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    render(
      <>
        <SettingsPageHeader description="Beskrivning" title="Företag" />
        <BusinessProfileSettings />
      </>,
    );
    fireEvent.change(screen.getByLabelText("Företagsnamn"), {
      target: { value: "Osparat" },
    });
    fireEvent.click(
      screen.getByRole("link", { name: "Tillbaka till inställningar" }),
    );
    expect(window.confirm).toHaveBeenCalledWith(
      "Du har osparade ändringar. Vill du lämna sidan ändå?",
    );
  });

  it("keeps all M11 forms read-only for members", () => {
    mock.profile = { ...mock.profile, canEdit: false };
    mock.hours = { ...mock.hours, canEdit: false };
    mock.policy = { ...mock.policy, canEdit: false };

    const profile = render(<BusinessProfileSettings />);
    expect(
      (screen.getByLabelText("Företagsnamn") as HTMLInputElement).disabled,
    ).toBe(true);
    expect(
      screen.queryByRole("button", { name: "Spara ändringar" }),
    ).toBeNull();
    profile.unmount();

    const hours = render(<BusinessHoursSettings />);
    expect(
      (screen.getByLabelText("Måndag öppnar, intervall 1") as HTMLInputElement)
        .disabled,
    ).toBe(true);
    expect(screen.queryByRole("button", { name: "Ta bort" })).toBeNull();
    hours.unmount();

    render(<AiPolicySettings />);
    expect(
      (screen.getByLabelText("Skapa bokning") as HTMLSelectElement).disabled,
    ).toBe(true);
    expect(
      screen.queryByRole("button", { name: "Spara ändringar" }),
    ).toBeNull();
  });
});
