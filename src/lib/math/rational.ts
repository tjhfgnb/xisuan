export type Frac = { n: bigint; d: bigint };

export class CalcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalcError";
  }
}

export function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

export function lcm(a: bigint, b: bigint): bigint {
  if (a === 0n || b === 0n) return 0n;
  const aa = a < 0n ? -a : a;
  const bb = b < 0n ? -b : b;
  return (aa / gcd(aa, bb)) * bb;
}

export function normalize(n: bigint, d: bigint): Frac {
  if (d === 0n) throw new CalcError("除數不能是 0");
  if (d < 0n) return { n: -n, d: -d };
  return { n, d };
}

export function simplify(f: Frac): Frac {
  const s = normalize(f.n, f.d);
  const g = gcd(s.n, s.d);
  return { n: s.n / g, d: s.d / g };
}

export function isqrt(n: bigint): bigint | null {
  if (n < 0n) return null;
  if (n < 2n) return n;
  let x0 = n;
  let x1 = (n >> 1n) + 1n;
  while (x1 < x0) {
    x0 = x1;
    x1 = (x0 + n / x0) >> 1n;
  }
  return x0 * x0 === n ? x0 : null;
}

export type DecimalInfo = {
  sign: string;
  int: string;
  nonRepeat: string;
  repeat: string;
  truncated: boolean;
};

export function toDecimal(f: Frac): DecimalInfo {
  const s = simplify(f);
  const neg = s.n < 0n;
  let rem = neg ? -s.n : s.n;
  const den = s.d;
  const intPart = rem / den;
  rem %= den;
  const digits: string[] = [];
  const seen = new Map<string, number>();
  let repeatAt = -1;
  const limit = 32;
  while (rem !== 0n && digits.length < limit) {
    const key = rem.toString();
    const seenAt = seen.get(key);
    if (seenAt !== undefined) {
      repeatAt = seenAt;
      break;
    }
    seen.set(key, digits.length);
    rem *= 10n;
    digits.push((rem / den).toString());
    rem %= den;
  }
  const sign = neg ? "−" : "";
  const intStr = intPart.toString();
  if (repeatAt >= 0) {
    return {
      sign,
      int: intStr,
      nonRepeat: digits.slice(0, repeatAt).join(""),
      repeat: digits.slice(repeatAt).join(""),
      truncated: false,
    };
  }
  return {
    sign,
    int: intStr,
    nonRepeat: digits.join(""),
    repeat: "",
    truncated: rem !== 0n,
  };
}

export function linear(f: Frac): string {
  const s = simplify(f);
  const sign = s.n < 0n ? "-" : "";
  const n = (s.n < 0n ? -s.n : s.n).toString();
  if (s.d === 1n) return sign + n;
  return `${sign}${n}/${s.d}`;
}

export type Mixed = { neg: boolean; whole: string; n: string; d: string };

export function toMixed(f: Frac): Mixed | null {
  const s = simplify(f);
  if (s.d === 1n) return null;
  const absN = s.n < 0n ? -s.n : s.n;
  const whole = absN / s.d;
  const rem = absN % s.d;
  if (whole === 0n || rem === 0n) return null;
  return {
    neg: s.n < 0n,
    whole: whole.toString(),
    n: rem.toString(),
    d: s.d.toString(),
  };
}
