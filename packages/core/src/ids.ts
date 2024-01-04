import { v7 } from "uuid";

/** A new UUID version 7 (time-ordered, so database indexes stay compact). */
export function newId(): string {
  return v7();
}
