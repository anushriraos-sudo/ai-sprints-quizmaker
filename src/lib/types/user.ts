/** Raw D1 row shape (snake_case column names). */
export type UserRow = {
  id: string;
  first_name: string;
  last_name: string;
  username: string;
  email: string;
  password_hash: string;
  created_at: string;
};

/** Safe to return to clients — never includes password_hash. */
export type PublicUser = {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  createdAt: string;
};

/** Internal record including credentials for auth verification. */
export type UserRecord = PublicUser & {
  passwordHash: string;
};
