import type { ResourceRead } from "@/generated/types";
import { ResourcesTable } from "./ResourcesTable";

export interface ResourceDefinitionTabProps {
  resources: NonNullable<ResourceRead>[];
  selectedResourceId?: string;
  onSelectResource: (resource: NonNullable<ResourceRead>) => void;
  onEditResource?: (resource: NonNullable<ResourceRead>) => void;
  onDeleteResource?: (resourceId: string) => void;
  onToggleResource?: (id: string, currentState: boolean) => void;
}

/**
 * "Definition" tab content for the resource details drawer — the grouped
 * list-detail table that used to be the whole panel body. Selecting a
 * row updates the same `selectedResourceId` the "Try it" tab's chip picker
 * and the details sidebar share.
 */
export function ResourceDefinitionTab({
  resources,
  selectedResourceId,
  onSelectResource,
  onEditResource,
  onDeleteResource,
  onToggleResource,
}: ResourceDefinitionTabProps) {
  return (
    <ResourcesTable
      resources={resources}
      selectedResourceId={selectedResourceId}
      onSelectResource={onSelectResource}
      onEditResource={onEditResource}
      onDeleteResource={onDeleteResource}
      onToggleResource={onToggleResource}
    />
  );
}
