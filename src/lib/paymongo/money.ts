/**
 * Converts a numeric(14,2) PHP amount (already server-validated/computed —
 * never a raw browser value) to integer centavos, PayMongo's required unit.
 * Math.round guards against IEEE754 representation drift in the
 * multiplication itself (e.g. 1500.50 * 100 landing a hair off 150050) —
 * this is a unit-conversion safeguard, not a substitute for computing the
 * amount itself in SQL, which is where the actual money arithmetic happens.
 * Kept dependency-free (no server-only, no env) so it can be unit tested
 * directly.
 */
export function toCentavos(amount: number): number {
  return Math.round(amount * 100);
}
