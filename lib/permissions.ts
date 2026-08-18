import { Prisma, Role } from "@prisma/client";

export type SessionUser = {
  id: string;
  role: Role;
  organizationId: string;
  serviceProviderId?: string | null;
  organizationIds?: string[];
  serviceProviderIds?: string[];
};

export function ticketWhereForUser(user: SessionUser): Prisma.TicketWhereInput {
  const base: Prisma.TicketWhereInput = { organizationId: user.organizationId };

  if (user.role === "HAUSVERWALTER") return base;

  if (user.role === "MIETER") {
    return {
      ...base,
      tenantId: user.id
    };
  }

  return {
    assignedProviderId: { in: providerIdsForUser(user) }
  };
}

export function canViewTicket(
  user: SessionUser,
  ticket: {
    organizationId: string;
    tenantId: string;
    assignedProviderId?: string | null;
  }
) {
  if (user.role === "HAUSVERWALTER") return ticket.organizationId === user.organizationId;
  if (user.role === "MIETER") return ticket.organizationId === user.organizationId && ticket.tenantId === user.id;
  return Boolean(ticket.assignedProviderId && providerIdsForUser(user).includes(ticket.assignedProviderId));
}

export function canWriteMessage(
  user: SessionUser,
  ticket: {
    organizationId: string;
    tenantId: string;
    assignedProviderId?: string | null;
  }
) {
  return canViewTicket(user, ticket);
}

export function canSeeInternalNotes(role: Role) {
  return role === "HAUSVERWALTER";
}

export function canManageObjects(role: Role) {
  return role === "HAUSVERWALTER";
}

export function providerIdsForUser(user: SessionUser) {
  return user.serviceProviderIds?.length
    ? user.serviceProviderIds
    : user.serviceProviderId
      ? [user.serviceProviderId]
      : [];
}

export function organizationIdsForUser(user: SessionUser) {
  return user.organizationIds?.length ? user.organizationIds : [user.organizationId];
}
