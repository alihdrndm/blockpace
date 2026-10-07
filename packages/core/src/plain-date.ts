// Calendar dates travel as "YYYY-MM-DD" strings; the brand stops a random string being used as one.
// The parsing and date arithmetic functions arrive in M1.
export type IsoDate = string & { readonly __brand: "IsoDate" };
