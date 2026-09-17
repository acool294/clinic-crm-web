"use client";

import * as React from "react";
import { CheckCircle2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface Patient {
  id: string;
  name: string;
  dob?: string;
  created_at: string;
}

interface PatientComboboxProps {
  patients: Patient[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function PatientCombobox({ patients, value, onChange, placeholder = "Select patient..." }: PatientComboboxProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="flex items-center justify-between h-9 px-3 font-normal bg-white border border-input rounded-md text-sm w-full outline-none focus:ring-2 focus:ring-ring">
        <span className="truncate">
          {value
            ? (() => {
                const p = patients.find((x) => x.id === value);
                return p ? p.name : placeholder;
              })()
            : placeholder}
        </span>
        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-[380px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search patient by name..." />
          <CommandList>
            <CommandEmpty>No patient found.</CommandEmpty>
            <CommandGroup>
              {patients.map((p) => (
                <CommandItem
                  key={p.id}
                  value={p.name}
                  onSelect={() => {
                    onChange(p.id);
                    setOpen(false);
                  }}
                >
                  <CheckCircle2
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === p.id ? "opacity-100 text-blue-600" : "opacity-0"
                    )}
                  />
                  {p.name} {p.dob ? `(${Math.abs(new Date(Date.now() - new Date(p.dob).getTime()).getUTCFullYear() - 1970)} y/o)` : ''} - Joined: {new Date(p.created_at).toLocaleDateString()}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
