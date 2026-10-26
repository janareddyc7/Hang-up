"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintCardButton() {
  return (
    <Button type="button" variant="outline" onClick={() => window.print()}>
      <Printer aria-hidden="true" /> Print my callback card
    </Button>
  );
}
