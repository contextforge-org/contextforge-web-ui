import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { renderWithProviders } from "@/test/test-utils";
import { ChangePassword } from "./ChangePassword";
import { Grpc } from "./Grpc";
import { LLMModels } from "./LLMModels";
import { LLMProviders } from "./LLMProviders";
import { Maintenance } from "./Maintenance";
import { Metrics } from "./Metrics";
import { Observability } from "./Observability";
import { Performance } from "./Performance";
import { RestApi } from "./RestApi";

// Placeholder pages without their own test file; each renders only its title.
const pages: [string, ComponentType, string][] = [
  ["ChangePassword", ChangePassword, "Change Password"],
  ["Grpc", Grpc, "gRPC"],
  ["LLMModels", LLMModels, "LLM Models"],
  ["LLMProviders", LLMProviders, "LLM Providers"],
  ["Maintenance", Maintenance, "Maintenance"],
  ["Metrics", Metrics, "Metrics"],
  ["Observability", Observability, "Observability"],
  ["Performance", Performance, "Performance"],
  ["RestApi", RestApi, "REST API"],
];

describe("Placeholder pages", () => {
  it.each(pages)("%s renders its title", (_, Page, title) => {
    renderWithProviders(<Page />);
    expect(screen.getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
  });
});
