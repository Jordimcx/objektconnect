import bcrypt from "bcryptjs";
import {
  Prisma,
  PrismaClient,
  TicketCategory,
  TicketPriority,
  TicketStatus
} from "@prisma/client";

const prisma = new PrismaClient();

const categories: TicketCategory[] = [
  "HEIZUNG",
  "WASSER",
  "ELEKTRIK",
  "SANITAER",
  "FENSTER_TUEREN",
  "SCHIMMEL",
  "AUFZUG",
  "ALLGEMEINE_REPARATUR",
  "REINIGUNG",
  "AUSSENANLAGE",
  "SONSTIGES"
];

const statusFlow: Record<TicketStatus, TicketStatus[]> = {
  NEU: ["NEU"],
  PRUEFUNG_ERFORDERLICH: ["NEU", "PRUEFUNG_ERFORDERLICH"],
  RUECKFRAGE_AN_MIETER: ["NEU", "PRUEFUNG_ERFORDERLICH", "RUECKFRAGE_AN_MIETER"],
  FREIGEGEBEN: ["NEU", "PRUEFUNG_ERFORDERLICH", "FREIGEGEBEN"],
  DIENSTLEISTER_ANGEFRAGT: ["NEU", "PRUEFUNG_ERFORDERLICH", "FREIGEGEBEN", "DIENSTLEISTER_ANGEFRAGT"],
  TERMINABSTIMMUNG: ["NEU", "PRUEFUNG_ERFORDERLICH", "FREIGEGEBEN", "DIENSTLEISTER_ANGEFRAGT", "TERMINABSTIMMUNG"],
  TERMIN_BESTAETIGT: ["NEU", "PRUEFUNG_ERFORDERLICH", "FREIGEGEBEN", "DIENSTLEISTER_ANGEFRAGT", "TERMINABSTIMMUNG", "TERMIN_BESTAETIGT"],
  IN_BEARBEITUNG: ["NEU", "PRUEFUNG_ERFORDERLICH", "FREIGEGEBEN", "DIENSTLEISTER_ANGEFRAGT", "TERMINABSTIMMUNG", "TERMIN_BESTAETIGT", "IN_BEARBEITUNG"],
  WARTEN_AUF_MATERIAL: ["NEU", "PRUEFUNG_ERFORDERLICH", "FREIGEGEBEN", "DIENSTLEISTER_ANGEFRAGT", "TERMINABSTIMMUNG", "TERMIN_BESTAETIGT", "IN_BEARBEITUNG", "WARTEN_AUF_MATERIAL"],
  WARTEN_AUF_FREIGABE: ["NEU", "PRUEFUNG_ERFORDERLICH", "FREIGEGEBEN", "DIENSTLEISTER_ANGEFRAGT", "TERMINABSTIMMUNG", "TERMIN_BESTAETIGT", "IN_BEARBEITUNG", "WARTEN_AUF_FREIGABE"],
  ERLEDIGT: ["NEU", "PRUEFUNG_ERFORDERLICH", "FREIGEGEBEN", "DIENSTLEISTER_ANGEFRAGT", "TERMINABSTIMMUNG", "TERMIN_BESTAETIGT", "IN_BEARBEITUNG", "ERLEDIGT"],
  VOM_MIETER_BESTAETIGT: ["NEU", "PRUEFUNG_ERFORDERLICH", "FREIGEGEBEN", "DIENSTLEISTER_ANGEFRAGT", "TERMINABSTIMMUNG", "TERMIN_BESTAETIGT", "IN_BEARBEITUNG", "ERLEDIGT", "VOM_MIETER_BESTAETIGT"],
  ABGESCHLOSSEN: ["NEU", "PRUEFUNG_ERFORDERLICH", "FREIGEGEBEN", "DIENSTLEISTER_ANGEFRAGT", "TERMINABSTIMMUNG", "TERMIN_BESTAETIGT", "IN_BEARBEITUNG", "ERLEDIGT", "VOM_MIETER_BESTAETIGT", "ABGESCHLOSSEN"],
  ABGELEHNT: ["NEU", "PRUEFUNG_ERFORDERLICH", "DIENSTLEISTER_ANGEFRAGT", "ABGELEHNT"]
};

async function main() {
  await cleanup();

  const passwordHash = await bcrypt.hash("Demo123!", 12);
  const organization = await prisma.organization.create({
    data: {
      name: "ObjektConnect Hausverwaltung GmbH",
      claim: "Vernetzt. Effizient. Zuverlässig."
    }
  });

  const manager = await prisma.user.create({
    data: {
      organizationId: organization.id,
      name: "Jana Verwaltung",
      email: "verwaltung@objektconnect.de",
      phone: "+49 30 1000 1000",
      passwordHash,
      role: "HAUSVERWALTER"
    }
  });

  const tenants = await Promise.all(
    [
      "Mia Schneider",
      "Lukas Weber",
      "Sofia Klein",
      "Ben Hoffmann",
      "Amira Bauer",
      "Jonas Richter",
      "Lea Fischer",
      "Noah Wolf"
    ].map((name, index) =>
      prisma.user.create({
        data: {
          organizationId: organization.id,
          name,
          email: index === 0 ? "mieter@objektconnect.de" : `mieter${index + 1}@objektconnect.de`,
          phone: `+49 30 2000 10${index}`,
          passwordHash,
          role: "MIETER"
        }
      })
    )
  );

  const providerUser = await prisma.user.create({
    data: {
      organizationId: organization.id,
      name: "Tom Dienstleister",
      email: "dienstleister@objektconnect.de",
      phone: "+49 30 3000 1000",
      passwordHash,
      role: "DIENSTLEISTER"
    }
  });

  const tradeData = [
    ["Sanitär und Wasser", "WASSER"],
    ["Heizung", "HEIZUNG"],
    ["Elektro", "ELEKTRIK"],
    ["Fenster und Türen", "FENSTER_TUEREN"],
    ["Schimmelbeseitigung", "SCHIMMEL"],
    ["Aufzug", "AUFZUG"],
    ["Reinigung", "REINIGUNG"],
    ["Außenanlage", "AUSSENANLAGE"],
    ["Allgemeine Reparatur", "ALLGEMEINE_REPARATUR"]
  ] as const;

  const trades = await Promise.all(
    tradeData.map(([name, category]) =>
      prisma.trade.create({
        data: {
          organizationId: organization.id,
          name,
          category
        }
      })
    )
  );

  const properties = await Promise.all(
    [
      ["Kastanienhof", "Kastanienallee 14, 10435 Berlin", "Lena Objekt"],
      ["Spreeblick Carré", "Alt-Moabit 72, 10555 Berlin", "Markus Objekt"],
      ["Parkterrassen Süd", "Rudower Straße 9, 12351 Berlin", "Nora Objekt"]
    ].map(([name, address, contactName]) =>
      prisma.property.create({
        data: {
          organizationId: organization.id,
          name,
          address,
          unitCount: 4,
          contactName,
          contactEmail: "verwaltung@objektconnect.de"
        }
      })
    )
  );

  const units: Array<Prisma.UnitGetPayload<{ include: { building: { include: { property: true } } } }>> = [];
  for (const [propertyIndex, property] of properties.entries()) {
    const building = await prisma.building.create({
      data: {
        propertyId: property.id,
        name: `Haus ${propertyIndex + 1}`,
        address: property.address
      }
    });

    for (let index = 0; index < 4; index += 1) {
      units.push(
        await prisma.unit.create({
          data: {
            buildingId: building.id,
            reportingCode: `OC-${["KAS", "SPR", "PAR"][propertyIndex]}-${String(index + 1).padStart(2, "0")}`,
            label: `${propertyIndex + 1}.${index + 1}`,
            floor: String(index),
            rooms: index % 2 === 0 ? 2 : 3,
            squareMeter: index % 2 === 0 ? 58 : 76
          },
          include: { building: { include: { property: true } } }
        })
      );
    }
  }

  await Promise.all(
    tenants.map((tenant, index) =>
      prisma.lease.create({
        data: {
          tenantId: tenant.id,
          unitId: units[index].id,
          startsAt: addDays(new Date(), -400 - index * 20)
        }
      })
    )
  );

  const providerSpecs = [
    {
      companyName: "AquaFix Sanitärdienst",
      contactName: "Tom Dienstleister",
      email: "dienstleister@objektconnect.de",
      phone: "+49 30 3000 1000",
      tradeIndexes: [0, 3],
      rating: 4.8,
      averageResponseHours: 2,
      userId: providerUser.id
    },
    {
      companyName: "Elektro Nord GmbH",
      contactName: "Kira Strom",
      email: "kontakt@elektro-nord.example",
      phone: "+49 30 3000 2000",
      tradeIndexes: [2],
      rating: 4.5,
      averageResponseHours: 8
    },
    {
      companyName: "WärmePlus Service",
      contactName: "Deniz Yilmaz",
      email: "service@waermeplus.example",
      phone: "+49 30 3000 3000",
      tradeIndexes: [1],
      rating: 4.3,
      averageResponseHours: 6
    },
    {
      companyName: "Glas & Tür Berlin",
      contactName: "Clara Neumann",
      email: "team@glas-tuer.example",
      phone: "+49 30 3000 4000",
      tradeIndexes: [3, 8],
      rating: 4.1,
      averageResponseHours: 14
    },
    {
      companyName: "Hof & Haus Service",
      contactName: "Marek Schulz",
      email: "dispo@hof-haus.example",
      phone: "+49 30 3000 5000",
      tradeIndexes: [4, 6, 7, 8],
      rating: 4.6,
      averageResponseHours: 10
    }
  ];

  const providers = [];
  for (const spec of providerSpecs) {
    const provider = await prisma.serviceProvider.create({
      data: {
        organizationId: organization.id,
        userId: spec.userId,
        companyName: spec.companyName,
        contactName: spec.contactName,
        email: spec.email,
        phone: spec.phone,
        address: "Musterstraße 8, 10115 Berlin",
        serviceArea: "Berlin und Umland",
        availability: spec.averageResponseHours <= 6 ? "24/7 Bereitschaft" : "Mo-Fr 08:00-17:00",
        rating: spec.rating,
        averageResponseHours: spec.averageResponseHours,
        trades: {
          create: spec.tradeIndexes.map((tradeIndex) => ({ tradeId: trades[tradeIndex].id }))
        },
        properties: {
          create: properties.map((property) => ({ propertyId: property.id }))
        }
      }
    });
    providers.push(provider);
  }

  await prisma.document.createMany({
    data: [
      {
        organizationId: organization.id,
        propertyId: properties[0].id,
        ownerId: manager.id,
        fileName: "hausordnung-kastanienhof.pdf",
        originalName: "Hausordnung Kastanienhof.pdf",
        url: "/uploads/hausordnung-kastanienhof.pdf",
        contentType: "application/pdf",
        sizeBytes: 128000,
        visibility: "TENANT"
      },
      {
        organizationId: organization.id,
        propertyId: properties[1].id,
        ownerId: manager.id,
        fileName: "wartungsplan-spreeblick.pdf",
        originalName: "Wartungsplan Spreeblick.pdf",
        url: "/uploads/wartungsplan-spreeblick.pdf",
        contentType: "application/pdf",
        sizeBytes: 96000,
        visibility: "MANAGER_ONLY"
      }
    ]
  });

  const ticketStatuses: TicketStatus[] = [
    "NEU",
    "PRUEFUNG_ERFORDERLICH",
    "RUECKFRAGE_AN_MIETER",
    "FREIGEGEBEN",
    "DIENSTLEISTER_ANGEFRAGT",
    "TERMINABSTIMMUNG",
    "TERMIN_BESTAETIGT",
    "IN_BEARBEITUNG",
    "WARTEN_AUF_MATERIAL",
    "WARTEN_AUF_FREIGABE",
    "ERLEDIGT",
    "VOM_MIETER_BESTAETIGT",
    "ABGESCHLOSSEN",
    "ABGELEHNT",
    "DIENSTLEISTER_ANGEFRAGT",
    "TERMINABSTIMMUNG",
    "TERMIN_BESTAETIGT",
    "IN_BEARBEITUNG",
    "ERLEDIGT",
    "ABGESCHLOSSEN"
  ];
  const priorities: TicketPriority[] = ["NORMAL", "HOCH", "NORMAL", "NIEDRIG", "NOTFALL", "HOCH", "NORMAL", "NORMAL", "HOCH", "NORMAL", "NORMAL", "NIEDRIG", "NORMAL", "HOCH", "NORMAL", "HOCH", "NORMAL", "NORMAL", "NOTFALL", "NORMAL"];
  const titles = [
    "Heizung bleibt kalt",
    "Wasser läuft stark aus der Decke",
    "Rückfrage zu feuchter Wand",
    "Türgriff locker",
    "Rohrbruch im Bad",
    "Aufzug hält unregelmäßig",
    "Termin für Fensterreparatur",
    "Steckdose ohne Funktion",
    "Material für Duscharmatur fehlt",
    "Kostenfreigabe für Schimmelstelle",
    "Reinigung Treppenhaus erledigt",
    "Mieter bestätigt Reparatur",
    "Archivierter Heizungsfall",
    "Dienstleister abgelehnt",
    "Anfrage Elektrik Küche",
    "Terminabstimmung Außenanlage",
    "Bestätigter Sanitärtermin",
    "Arbeit an Wohnungstür läuft",
    "Wasserfleck geprüft",
    "Abgeschlossene Fensterwartung"
  ];

  for (let index = 0; index < 20; index += 1) {
    const status = ticketStatuses[index];
    const category = categories[index % categories.length];
    const priority = priorities[index];
    const tenant = tenants[index % tenants.length];
    const unit = units[index % units.length];
    const provider = statusFlow[status].includes("DIENSTLEISTER_ANGEFRAGT") ? providers[index % providers.length] : null;
    const createdAt = addDays(new Date(), -30 + index);
    const dueDate = priority === "NOTFALL" ? addDays(createdAt, 1) : addDays(createdAt, priority === "HOCH" ? 3 : 10);
    const appointmentAt = statusFlow[status].includes("TERMIN_BESTAETIGT") ? addDays(new Date(), index % 3 === 0 ? 0 : index - 8) : null;

    const ticket = await prisma.ticket.create({
      data: {
        organizationId: organization.id,
        number: `OC-${new Date().getFullYear()}-${String(index + 1).padStart(4, "0")}`,
        title: titles[index],
        description:
          index === 1 || index === 4
            ? "Wasser läuft stark aus der Decke und breitet sich schnell aus. Bitte dringend prüfen."
            : `Demo-Beschreibung für ${titles[index]} mit ausreichenden Details zum Schaden und zur Erreichbarkeit.`,
        room: index % 2 === 0 ? "Bad" : "Küche",
        category: index === 1 || index === 4 || index === 18 ? "WASSER" : category,
        priority,
        status,
        propertyId: unit.building.propertyId,
        buildingId: unit.buildingId,
        unitId: unit.id,
        tenantId: tenant.id,
        managerId: manager.id,
        assignedProviderId: provider?.id,
        dueDate,
        appointmentAt,
        preferredWindows: ["Werktags 08:00-12:00", "Dienstag 14:00-17:00"],
        costEstimate: statusFlow[status].includes("WARTEN_AUF_FREIGABE") ? 420 : null,
        approvedCostLimit: provider ? 350 : null,
        finalCost: ["ERLEDIGT", "VOM_MIETER_BESTAETIGT", "ABGESCHLOSSEN"].includes(status) ? 315 : null,
        workHours: ["ERLEDIGT", "VOM_MIETER_BESTAETIGT", "ABGESCHLOSSEN"].includes(status) ? 3.5 : null,
        completionReport: ["ERLEDIGT", "VOM_MIETER_BESTAETIGT", "ABGESCHLOSSEN"].includes(status)
          ? "Arbeiten vor Ort durchgeführt, Funktion geprüft und Bereich sauber übergeben."
          : null,
        reviewRequired: ["NEU", "PRUEFUNG_ERFORDERLICH", "WARTEN_AUF_FREIGABE"].includes(status) || priority === "NOTFALL",
        reviewReason:
          status === "WARTEN_AUF_FREIGABE"
            ? "Kosten liegen über dem freigegebenen Rahmen."
            : priority === "NOTFALL"
              ? "Notfall benötigt eine kontrollierte Freigabe."
              : ["NEU", "PRUEFUNG_ERFORDERLICH"].includes(status)
                ? "Autopilot benötigt eine Entscheidung."
                : null,
        completedAt: ["ERLEDIGT", "VOM_MIETER_BESTAETIGT", "ABGESCHLOSSEN"].includes(status) ? addDays(createdAt, 4) : null,
        tenantConfirmedAt: ["VOM_MIETER_BESTAETIGT", "ABGESCHLOSSEN"].includes(status) ? addDays(createdAt, 5) : null,
        archivedAt: status === "ABGESCHLOSSEN" ? addDays(new Date(), -2) : null,
        createdAt,
        updatedAt: addDays(createdAt, 2)
      }
    });

    const flow = statusFlow[status];
    for (const [flowIndex, flowStatus] of flow.entries()) {
      await prisma.statusHistory.create({
        data: {
          ticketId: ticket.id,
          fromStatus: flowIndex === 0 ? null : flow[flowIndex - 1],
          toStatus: flowStatus,
          changedById: flowIndex < 2 ? tenant.id : flowIndex < 4 ? manager.id : providerUser.id,
          note: `Seed-Status: ${flowStatus}`,
          createdAt: addDays(createdAt, flowIndex)
        }
      });
    }

    await prisma.message.createMany({
      data: [
        {
          ticketId: ticket.id,
          authorId: tenant.id,
          kind: "MESSAGE",
          body: `Bitte um Prüfung: ${titles[index]}`,
          createdAt
        },
        {
          ticketId: ticket.id,
          kind: "SYSTEM",
          body: `Automatische Statusmeldung: Ticket befindet sich im Status ${status}.`,
          createdAt: addDays(createdAt, 1)
        },
        {
          ticketId: ticket.id,
          authorId: provider?.userId ?? manager.id,
          kind: "MESSAGE",
          body: provider ? "Wir prüfen die Anfrage und schlagen einen Termin vor." : "Die Hausverwaltung prüft die Angaben.",
          createdAt: addDays(createdAt, 2)
        }
      ]
    });

    await prisma.document.create({
      data: {
        organizationId: organization.id,
        ticketId: ticket.id,
        ownerId: tenant.id,
        fileName: `ticket-${index + 1}.pdf`,
        originalName: `Foto oder Bericht ${index + 1}.pdf`,
        url: `/uploads/ticket-${index + 1}.pdf`,
        contentType: "application/pdf",
        sizeBytes: 48000 + index * 1000,
        visibility: "ALL"
      }
    });

    if (flow.includes("TERMINABSTIMMUNG")) {
      await prisma.appointment.create({
        data: {
          ticketId: ticket.id,
          proposedById: providerUser.id,
          startsAt: addDays(new Date(), index % 5),
          endsAt: addHours(addDays(new Date(), index % 5), 2),
          status: flow.includes("TERMIN_BESTAETIGT") ? "CONFIRMED" : "PROPOSED",
          note: "Seed-Terminvorschlag"
        }
      });
    }

    if (["VOM_MIETER_BESTAETIGT", "ABGESCHLOSSEN"].includes(status)) {
      await prisma.rating.create({
        data: {
          ticketId: ticket.id,
          tenantId: tenant.id,
          providerId: provider?.id,
          score: 5,
          comment: "Schnell erledigt und gut kommuniziert."
        }
      });
    }

    await prisma.notification.createMany({
      data: [
        {
          userId: manager.id,
          ticketId: ticket.id,
          type: priority === "NOTFALL" ? "OVERDUE" : "STATUS_CHANGED",
          title: priority === "NOTFALL" ? "Sofortige Warnung" : "Status geändert",
          body: `${ticket.number}: ${ticket.title}`,
          href: `/tickets/${ticket.id}`,
          readAt: index % 3 === 0 ? null : new Date()
        },
        {
          userId: tenant.id,
          ticketId: ticket.id,
          type: "STATUS_CHANGED",
          title: "Vorgang aktualisiert",
          body: `${ticket.number}: ${status}`,
          href: `/tickets/${ticket.id}`,
          readAt: index % 4 === 0 ? null : new Date()
        },
        ...(provider?.userId
          ? [
              {
                userId: provider.userId,
                ticketId: ticket.id,
                type: "WORK_ORDER_REQUEST" as const,
                title: "Auftragsanfrage",
                body: `${ticket.number}: ${ticket.title}`,
                href: `/tickets/${ticket.id}`,
                readAt: index % 2 === 0 ? null : new Date()
              }
            ]
          : [])
      ]
    });

    await prisma.automationLog.createMany({
      data: [
        {
          ticketId: ticket.id,
          type: "STATUS_MESSAGE",
          message: "Automatische Statusnachricht wurde simuliert."
        },
        ...(priority === "NOTFALL"
          ? [
              {
                ticketId: ticket.id,
                type: "EMERGENCY_WARNING" as const,
                message: "Notfallticket im Dashboard hervorgehoben."
              }
            ]
          : []),
        ...(dueDate.getTime() < Date.now() && status !== "ABGESCHLOSSEN"
          ? [
              {
                ticketId: ticket.id,
                type: "OVERDUE_WARNING" as const,
                message: "Überfälligkeit erkannt."
              }
            ]
          : [])
      ]
    });

    if (index % 5 === 0) {
      await prisma.internalNote.create({
        data: {
          ticketId: ticket.id,
          authorId: manager.id,
          body: "Interne Abstimmung: Kostenrahmen und Rückfrage dokumentiert."
        }
      });
    }
  }

  console.log("Seed-Daten für ObjektConnect wurden erstellt.");
}

async function cleanup() {
  await prisma.automationLog.deleteMany();
  await prisma.rating.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.statusHistory.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.internalNote.deleteMany();
  await prisma.message.deleteMany();
  await prisma.document.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.propertyServiceProvider.deleteMany();
  await prisma.serviceProviderTrade.deleteMany();
  await prisma.serviceProvider.deleteMany();
  await prisma.trade.deleteMany();
  await prisma.lease.deleteMany();
  await prisma.unit.deleteMany();
  await prisma.building.deleteMany();
  await prisma.property.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addHours(date: Date, hours: number) {
  const next = new Date(date);
  next.setHours(next.getHours() + hours);
  return next;
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
