/* User route handlers — translate authenticated requests into service
 * calls. requireAuth.js has already rejected anything without a valid
 * session by the time these run, so getAuth(req).userId is always present.
 */

import { getAuth } from "@clerk/express";
import * as usersService from "./users.service.js";

export async function me(req, res) {
  const { userId } = getAuth(req);
  const user = await usersService.getOrCreateUser(userId);
  res.json(user);
}
