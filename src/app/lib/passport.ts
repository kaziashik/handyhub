import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import bcryptjs from "bcryptjs";

import { AuthProvider, Role } from "../../generated/prisma/enums";
import { prisma } from "../lib/prisma";
import config from "../config";

passport.use(
  new LocalStrategy(
    { usernameField: "email", passwordField: "password" },
    async (email, password, done) => {
      try {
        const user = await prisma.user.findUnique({
          where: { email },
          include: { auths: true },
        });

        if (!user) {
          return done(null, false, { message: "User does not exist!" });
        }

        const credentialsAuth = user.auths.find(
          (auth) => auth.provider === AuthProvider.CREDENTIALS,
        );

        if (!credentialsAuth || !credentialsAuth.password) {
          return done(null, false, {
            message:
              "This account does not have a password. Please login with Google",
          });
        }

        const isPasswordMatch = await bcryptjs.compare(
          password,
          credentialsAuth.password,
        );

        if (!isPasswordMatch) {
          return done(null, false, { message: "Password does not match" });
        }

        return done(null, {
          userId: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        });
      } catch (error) {
        return done(error as Error);
      }
    },
  ),
);

passport.use(
  new GoogleStrategy(
    {
      clientID: config.GOOGLE_CLIENT_ID,
      clientSecret: config.GOOGLE_CLIENT_SECRET,
      callbackURL: config.GOOGLE_CLIENT_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      const email = profile.emails?.[0]?.value;

      if (!email) {
        return done(null, false, { message: "No email found from Google!" });
      }

      let user = await prisma.user.findUnique({
        where: { email },
        include: { auths: true },
      });

      if (user) {
        const googleAuth = user.auths.find(
          (auth) => auth.provider === AuthProvider.GOOGLE,
        );

        if (!googleAuth) {
          await prisma.auth.create({
            data: {
              provider: AuthProvider.GOOGLE,
              providerId: profile.id,
              userId: user.id,
            },
          });
        }

        return done(null, {
          userId: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        });
      }

      user = await prisma.user.create({
        data: {
          name: profile.displayName,
          email,
          role: Role.CUSTOMER,
          isVerified: true,
          auths: {
            create: {
              provider: AuthProvider.GOOGLE,
              providerId: profile.id,
            },
          },
        },
        include: { auths: true },
      });

      return done(null, {
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      });
    },
  ),
);
