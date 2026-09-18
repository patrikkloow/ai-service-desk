"use client";

import { useId, useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { timezoneLabel, timezoneOptions } from "@/lib/business-setting-options";

export function TimezoneCombobox({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const listId = useId();
  const options = useMemo(() => timezoneOptions(value), [value]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("sv");
    const matches = needle
      ? options.filter((option) =>
          `${option.city} ${option.value}`
            .toLocaleLowerCase("sv")
            .includes(needle),
        )
      : options;
    return matches.slice(0, 60);
  }, [options, query]);

  function choose(next: string) {
    onChange(next);
    setQuery("");
    setOpen(false);
    setActiveIndex(0);
  }

  return (
    <div className="relative">
      <div className="relative">
        <input
          aria-autocomplete="list"
          aria-activedescendant={
            open && filtered[activeIndex]
              ? `${listId}-option-${activeIndex}`
              : undefined
          }
          aria-controls={listId}
          aria-expanded={open}
          className="flex min-h-11 w-full rounded-lg border border-input bg-transparent px-3 py-2 pr-10 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled}
          onBlur={() => setOpen(false)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActiveIndex(0);
          }}
          onFocus={() => {
            setQuery("");
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((current) =>
                filtered.length === 0
                  ? 0
                  : Math.min(current + 1, filtered.length - 1),
              );
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((current) => Math.max(current - 1, 0));
            } else if (event.key === "Enter" && open && filtered[activeIndex]) {
              event.preventDefault();
              choose(filtered[activeIndex].value);
            } else if (event.key === "Escape") {
              setOpen(false);
              setQuery("");
            }
          }}
          role="combobox"
          value={open ? query : timezoneLabel(value)}
        />
        <ChevronsUpDown
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-3.5 size-4 text-muted-foreground"
        />
      </div>
      {open && !disabled ? (
        <div
          className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
          id={listId}
          role="listbox"
        >
          {filtered.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">
              Ingen tidszon hittades.
            </p>
          ) : (
            filtered.map((option, index) => (
              <button
                aria-selected={option.value === value}
                className={cn(
                  "flex min-h-11 w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted focus:bg-muted focus:outline-none",
                  index === activeIndex && "bg-muted",
                )}
                id={`${listId}-option-${index}`}
                key={option.value}
                onMouseEnter={() => setActiveIndex(index)}
                onPointerDown={(event) => {
                  event.preventDefault();
                  choose(option.value);
                }}
                role="option"
                type="button"
              >
                <Check
                  aria-hidden="true"
                  className={cn(
                    "size-4",
                    option.value === value ? "opacity-100" : "opacity-0",
                  )}
                />
                <span>{option.label}</span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
