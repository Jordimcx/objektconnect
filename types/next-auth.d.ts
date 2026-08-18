import type { Role } from "@prisma/client";
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    role: Role;
    organizationId: string;
    serviceProviderId?: string | null;
    organizationIds?: string[];
    serviceProviderIds?: string[];
  }

  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      role: Role;
      organizationId: string;
      serviceProviderId?: string | null;
      organizationIds?: string[];
      serviceProviderIds?: string[];
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: Role;
    organizationId?: string;
    serviceProviderId?: string | null;
    organizationIds?: string[];
    serviceProviderIds?: string[];
  }
}
