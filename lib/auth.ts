import bcrypt from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validators";
import { consumeTenantActivationToken } from "@/lib/tenant-access";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: {
    strategy: "jwt"
  },
  pages: {
    signIn: "/login"
  },
  providers: [
    Credentials({
      name: "ObjektConnect-Zugang",
      credentials: {
        email: { label: "E-Mail", type: "email" },
        password: { label: "Passwort", type: "password" }
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
          include: { serviceProvider: true }
        });
        if (!user) return null;

        const validPassword = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!validPassword) return null;

        const providerMemberships = user.role === "DIENSTLEISTER"
          ? await prisma.serviceProvider.findMany({
              where: { email: { equals: user.email, mode: "insensitive" }, status: "ACTIVE" },
              select: { id: true, organizationId: true },
              orderBy: { createdAt: "asc" }
            })
          : [];
        const serviceProviderIds = providerMemberships.map((provider) => provider.id);
        const organizationIds = [...new Set([user.organizationId, ...providerMemberships.map((provider) => provider.organizationId)])];

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          organizationId: user.organizationId,
          serviceProviderId: user.serviceProvider?.id ?? serviceProviderIds[0] ?? null,
          serviceProviderIds,
          organizationIds
        };
      }
    }),
    Credentials({
      id: "magic-link",
      name: "Passwortloser Mieterzugang",
      credentials: {
        token: { label: "Aktivierungslink", type: "text" }
      },
      async authorize(credentials) {
        const token = typeof credentials?.token === "string" ? credentials.token : "";
        if (token.length < 20) return null;
        const user = await consumeTenantActivationToken(token);
        if (!user || user.role !== "MIETER") return null;
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          organizationId: user.organizationId,
          serviceProviderId: null,
          serviceProviderIds: [],
          organizationIds: [user.organizationId]
        };
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.organizationId = user.organizationId;
        token.serviceProviderId = user.serviceProviderId ?? null;
        token.serviceProviderIds = user.serviceProviderIds ?? (user.serviceProviderId ? [user.serviceProviderId] : []);
        token.organizationIds = user.organizationIds ?? [user.organizationId];
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub && token.role && token.organizationId) {
        session.user.id = token.sub;
        session.user.role = token.role;
        session.user.organizationId = token.organizationId;
        session.user.serviceProviderId = token.serviceProviderId ?? null;
        session.user.serviceProviderIds = token.serviceProviderIds ?? (token.serviceProviderId ? [token.serviceProviderId] : []);
        session.user.organizationIds = token.organizationIds ?? [token.organizationId];
        session.user.name = session.user.name ?? "";
        session.user.email = session.user.email ?? "";
      }
      return session;
    },
    authorized({ auth: session, request }) {
      const path = request.nextUrl.pathname;
      const protectedPath = [
        "/dashboard",
        "/onboarding",
        "/tickets",
        "/nachrichten",
        "/termine",
        "/objekte",
        "/wohneinheiten",
        "/mieter",
        "/dienstleister",
        "/dokumente",
        "/statistiken",
        "/benachrichtigungen",
        "/einstellungen",
        "/rechnungen",
        "/bauteile",
        "/profil"
      ].some((prefix) => path.startsWith(prefix));

      if (protectedPath) return Boolean(session?.user);
      if (path === "/login" && session?.user) {
        return Response.redirect(new URL("/dashboard", request.nextUrl));
      }
      return true;
    }
  }
});
