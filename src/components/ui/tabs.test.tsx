import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./tabs";

describe("Tabs", () => {
  it("applies line-variant classes to the list", () => {
    render(
      <Tabs defaultValue="one">
        <TabsList variant="line">
          <TabsTrigger variant="line" value="one">
            One
          </TabsTrigger>
        </TabsList>
        <TabsContent value="one">first panel</TabsContent>
      </Tabs>,
    );
    const list = screen.getByRole("tablist");
    expect(list).toHaveClass("border-b");
    expect(list).toHaveClass("w-full");
  });

  it("applies line-variant classes to the trigger", () => {
    render(
      <Tabs defaultValue="one">
        <TabsList variant="line">
          <TabsTrigger variant="line" value="one">
            One
          </TabsTrigger>
        </TabsList>
        <TabsContent value="one">first panel</TabsContent>
      </Tabs>,
    );
    const trigger = screen.getByRole("tab", { name: "One" });
    expect(trigger).toHaveClass("border-b-2");
    expect(trigger).toHaveClass("data-[state=active]:border-foreground");
  });
});
