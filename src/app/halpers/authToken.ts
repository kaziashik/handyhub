import { JwtPayload } from "jsonwebtoken";
import { generateToken, verifyToken } from "./jwt";
import { prisma } from "../lib/prisma";
import config from "../config";

export const createUserTokens = (user: {
  id: string;
  email: string;
  role: string;
}) => {
  const jwtPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
  };

  const accessToken = generateToken(
    jwtPayload,
    config.jwt_access_secret,
    config.jwt_access_expires_in,
  );

  const refreshToken = generateToken(
    jwtPayload,
    config.jwt_refresh_secret,
    config.jwt_refresh_expires_in,
  );

  return {
    accessToken,
    refreshToken,
  };
};

// export const createNewAccessTokenWithRefreshToken = async (
//   refreshToken: string,
// ) => {
//   const verifiedRefreshToken = verifyToken(
//     refreshToken,
//     config.JWT_REFRESH_SECRET,
//   ) as JwtPayload;

//   const user = await prisma.user.findUnique({
//     where: {
//       email: verifiedRefreshToken.email,
//     },
//   });

//   if (!user) {
//     throw new Error("User does not exist");
//   }

//   const jwtPayload = {
//     userId: user.id,
//     email: user.email,
//     role: user.role,
//   };

//   const accessToken = generateToken(
//     jwtPayload,
//     config.JWT_ACCESS_SECRET,
//     config.JWT_ACCESS_EXPIRES,
//   );

//   return accessToken;
// };
