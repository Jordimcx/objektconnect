import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createIcsEvent } from "@/lib/calendar";
import { getProviderOrder } from "@/lib/provider-access";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, { params }: { params: Promise<{ appointmentId: string }> }) {
  const { appointmentId } = await params;
  const url = new URL(request.url);
  const providerToken = url.searchParams.get("providerToken");
  let authorizedOrganizationId: string | null = null;
  let authorizedTicketId: string | null = null;
  let authorizedProviderIds: string[] = [];

  if (providerToken) {
    const access = await getProviderOrder(providerToken);
    authorizedOrganizationId = access?.organizationId ?? null;
    authorizedTicketId = access?.ticketId ?? null;
  } else {
    const session = await auth();
    authorizedOrganizationId = session?.user.organizationId ?? null;
    authorizedProviderIds = session?.user.role === "DIENSTLEISTER"
      ? session.user.serviceProviderIds ?? (session.user.serviceProviderId ? [session.user.serviceProviderId] : [])
      : [];
  }
  if (!authorizedOrganizationId) return NextResponse.json({ error: "Zugriff verweigert." }, { status: 403 });

  const appointment = await prisma.appointment.findFirst({
    where: {
      id: appointmentId,
      ticket: {
        ...(authorizedProviderIds.length
          ? { assignedProviderId: { in: authorizedProviderIds } }
          : { organizationId: authorizedOrganizationId }),
        ...(authorizedTicketId ? { id: authorizedTicketId } : {})
      }
    },
    include: {
      ticket: {
        include: { property: true, unit: true, tenant: true, manager: true, assignedProvider: true }
      }
    }
  });
  if (!appointment || appointment.status !== "CONFIRMED") {
    return NextResponse.json({ error: "Bestätigter Termin wurde nicht gefunden." }, { status: 404 });
  }

  const content = createIcsEvent({
    uid: appointment.calendarUid,
    title: `${appointment.ticket.number}: ${appointment.ticket.title}`,
    description: appointment.ticket.completionReport || "Reparaturtermin über ObjektConnect",
    location: `${appointment.ticket.property.address}, ${appointment.ticket.unit.label}`,
    startsAt: appointment.startsAt,
    endsAt: appointment.endsAt,
    organizerEmail: appointment.ticket.manager.email,
    attendeeEmails: [appointment.ticket.tenant.email, appointment.ticket.assignedProvider?.email ?? ""]
  });

  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${appointment.ticket.number}.ics"`,
      "Cache-Control": "private, no-store"
    }
  });
}
