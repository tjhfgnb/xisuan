import { gcd, CalcError } from "./rational.ts";
import type { Piece, Step } from "./solve";

export type CalcOp = "diff" | "int";

export type CalculusSolution = {
  input: string;
  op: CalcOp;
  steps: Step[];
  answer: Piece[];
  linear: string;
  headline: string;
  inputPretty: Piece[];
};

type R = { n: bigint; d: bigint };

type S =
  | { t: "q"; n: bigint; d: bigint }
  | { t: "x" }
  | { t: "pi" }
  | { t: "e" }
  | { t: "add"; a: S[] }
  | { t: "mul"; a: S[] }
  | { t: "pow"; b: S; e: S }
  | { t: "sin"; a: S }
  | { t: "cos"; a: S }
  | { t: "tan"; a: S }
  | { t: "ln"; a: S }
  | { t: "abs"; a: S }
  | { t: "asin"; a: S }
  | { t: "atan"; a: S };

const ZERO: S = { t: "q", n: 0n, d: 1n };
const ONE: S = { t: "q", n: 1n, d: 1n };
const X: S = { t: "x" };
const E: S = { t: "e" };
const PI: S = { t: "pi" };

const INT_FAIL =
  "這個積分沒辦法用基本公式直接寫出來。多項式、sin、cos、tan、e^x、ln，以及外面正好乘著裡面的導數（例如 2x cos(x^2)），都可以。";

function T(v: string): Piece {
  return { k: "t", v };
}

function rr(n: bigint, d: bigint): R {
  if (d === 0n) throw new CalcError("除數不能是 0");
  if (n === 0n) return { n: 0n, d: 1n };
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = gcd(n < 0n ? -n : n, d);
  return { n: n / g, d: d / g };
}

function qNode(r: R): S {
  return { t: "q", n: r.n, d: r.d };
}

function ratOf(s: S): R {
  if (s.t !== "q") throw new CalcError("這裡要是數字");
  return rr(s.n, s.d);
}

function addR(a: R, b: R): R {
  return rr(a.n * b.d + b.n * a.d, a.d * b.d);
}
function subR(a: R, b: R): R {
  return addR(a, { n: -b.n, d: b.d });
}
function mulR(a: R, b: R): R {
  return rr(a.n * b.n, a.d * b.d);
}
function divR(a: R, b: R): R {
  if (b.n === 0n) throw new CalcError("除數不能是 0");
  return rr(a.n * b.d, a.d * b.n);
}
function negR(a: R): R {
  return { n: -a.n, d: a.d };
}
function isZeroR(a: R): boolean {
  return a.n === 0n;
}
function isOneR(a: R): boolean {
  return a.n === 1n && a.d === 1n;
}
function isNegOneR(a: R): boolean {
  return a.n === -1n && a.d === 1n;
}

function powRat(base: R, exp: bigint): R {
  if (exp < 0n) return powRat(divR({ n: 1n, d: 1n }, base), -exp);
  if (exp === 0n) {
    if (base.n === 0n) throw new CalcError("0 的 0 次方沒有定義");
    return { n: 1n, d: 1n };
  }
  if (exp > 40n) throw new CalcError("次方太大了");
  let n = 1n;
  let d = 1n;
  for (let i = 0n; i < exp; i += 1n) {
    n *= base.n;
    d *= base.d;
    if (n > 10n ** 24n || d > 10n ** 24n || n < -(10n ** 24n)) throw new CalcError("數字太大了");
  }
  return rr(n, d);
}

function sig(s: S): string {
  switch (s.t) {
    case "q":
      return `q${s.n}/${s.d}`;
    case "x":
      return "x";
    case "pi":
      return "pi";
    case "e":
      return "e";
    case "add":
      return `+(${s.a.map(sig).join(",")})`;
    case "mul":
      return `*(${s.a.map(sig).join(",")})`;
    case "pow":
      return `^(${sig(s.b)},${sig(s.e)})`;
    case "sin":
    case "cos":
    case "tan":
    case "ln":
    case "abs":
    case "asin":
    case "atan":
      return `${s.t}(${sig(s.a)})`;
    default:
      return "?";
  }
}

function eq(a: S, b: S): boolean {
  return sig(a) === sig(b);
}

function hasX(s: S): boolean {
  switch (s.t) {
    case "x":
      return true;
    case "q":
    case "pi":
    case "e":
      return false;
    case "add":
    case "mul":
      return s.a.some(hasX);
    case "pow":
      return hasX(s.b) || hasX(s.e);
    default:
      return hasX(s.a);
  }
}

function isZeroNode(s: S): boolean {
  return s.t === "q" && s.n === 0n;
}
function isOneNode(s: S): boolean {
  return s.t === "q" && s.n === 1n && s.d === 1n;
}
function isIntQ(s: S): s is { t: "q"; n: bigint; d: bigint } {
  return s.t === "q" && s.d === 1n;
}
function isQ(s: S, n: bigint, d: bigint): boolean {
  return s.t === "q" && s.n === n && s.d === d;
}

function mapChild(s: S, f: (c: S) => S): S {
  switch (s.t) {
    case "add":
    case "mul":
      return { ...s, a: s.a.map(f) };
    case "pow":
      return { t: "pow", b: f(s.b), e: f(s.e) };
    case "sin":
    case "cos":
    case "tan":
    case "ln":
    case "abs":
    case "asin":
    case "atan":
      return { ...s, a: f(s.a) };
    default:
      return s;
  }
}

function replace(s: S, target: S, rep: S): S {
  if (eq(s, target)) return rep;
  return mapChild(s, (c) => replace(c, target, rep));
}

function onlyThrough(s: S, u: S): boolean {
  if (eq(s, u)) return true;
  if (s.t === "x") return false;
  switch (s.t) {
    case "q":
    case "pi":
    case "e":
      return true;
    case "add":
    case "mul":
      return s.a.every((c) => onlyThrough(c, u));
    case "pow":
      return onlyThrough(s.b, u) && onlyThrough(s.e, u);
    default:
      return onlyThrough(s.a, u);
  }
}

function splitCoeff(s: S): { coeff: R; rest: S } {
  if (s.t === "q") return { coeff: rr(s.n, s.d), rest: ONE };
  if (s.t === "mul") {
    let coeff = rr(1n, 1n);
    const rest: S[] = [];
    for (const f of s.a) {
      if (f.t === "q") coeff = mulR(coeff, rr(f.n, f.d));
      else rest.push(f);
    }
    if (rest.length === 0) return { coeff, rest: ONE };
    if (rest.length === 1) return { coeff, rest: rest[0]! };
    return { coeff, rest: { t: "mul", a: rest } };
  }
  return { coeff: rr(1n, 1n), rest: s };
}

function scale(c: R, rest: S): S {
  if (isZeroR(c)) return ZERO;
  if (isOneR(c)) return rest;
  if (eq(rest, ONE)) return qNode(c);
  return simpMul([qNode(c), rest]);
}

function addNode(xs: S[]): S {
  return { t: "add", a: xs };
}
function mulNode(xs: S[]): S {
  return { t: "mul", a: xs };
}

function simp(s: S): S {
  switch (s.t) {
    case "q":
      return qNode(rr(s.n, s.d));
    case "x":
    case "pi":
    case "e":
      return s;
    case "add":
      return simpAdd(s.a.map(simp));
    case "mul":
      return simpMul(s.a.map(simp));
    case "pow":
      return simpPow(simp(s.b), simp(s.e));
    case "sin":
      return simpSin(simp(s.a));
    case "cos":
      return simpCos(simp(s.a));
    case "tan":
      return simpTan(simp(s.a));
    case "ln":
      return simpLn(simp(s.a));
    case "abs":
      return simpAbs(simp(s.a));
    case "asin": {
      const a = simp(s.a);
      if (isZeroNode(a)) return ZERO;
      return { t: "asin", a };
    }
    case "atan": {
      const a = simp(s.a);
      if (isZeroNode(a)) return ZERO;
      return { t: "atan", a };
    }
    default:
      return s;
  }
}

function simpSin(a: S): S {
  if (isZeroNode(a)) return ZERO;
  return { t: "sin", a };
}
function simpCos(a: S): S {
  if (isZeroNode(a)) return ONE;
  return { t: "cos", a };
}
function simpTan(a: S): S {
  if (isZeroNode(a)) return ZERO;
  return { t: "tan", a };
}
function simpLn(a: S): S {
  if (isOneNode(a)) return ZERO;
  if (eq(a, E)) return ONE;
  if (a.t === "pow" && eq(a.b, E)) return simp(a.e);
  if (isZeroNode(a)) throw new CalcError("ln 0 沒有定義");
  if (a.t === "q" && a.n < 0n) throw new CalcError("ln 的裡面現在只接受正的");
  return { t: "ln", a };
}
function simpAbs(a: S): S {
  if (a.t === "q") return qNode(rr(a.n < 0n ? -a.n : a.n, a.d));
  if (a.t === "abs") return a;
  return { t: "abs", a };
}

function simpPow(b: S, e: S): S {
  if (isZeroNode(e)) {
    if (isZeroNode(b)) throw new CalcError("0 的 0 次方沒有定義");
    return ONE;
  }
  if (isOneNode(e)) return b;
  if (isOneNode(b)) return ONE;
  if (eq(b, E) && e.t === "ln") return simp(e.a);
  if (isZeroNode(b)) {
    if (e.t === "q" && e.n > 0n) return ZERO;
    if (e.t === "q" && e.n < 0n) throw new CalcError("0 不能取負次方");
    return { t: "pow", b, e };
  }
  if (b.t === "q" && isIntQ(e)) {
    if (e.n < 0n && b.n === 0n) throw new CalcError("0 不能取負次方");
    return qNode(powRat(rr(b.n, b.d), e.n));
  }
  if (b.t === "pow" && (isIntQ(e) || isIntQ(b.e))) {
    return simpPow(b.b, simp(mulNode([b.e, e])));
  }
  if (b.t === "mul" && isIntQ(e)) {
    return simpMul(b.a.map((f) => simpPow(f, e)));
  }
  if (b.t === "abs" && isIntQ(e) && e.n % 2n === 0n) {
    return simpPow(b.a, e);
  }
  return { t: "pow", b, e };
}

type Bag = { coeff: R; parts: Map<string, { base: S; exp: S }>; zero: boolean };

function emptyBag(): Bag {
  return { coeff: rr(1n, 1n), parts: new Map(), zero: false };
}

function absorb(bag: Bag, f: S, exp: S): void {
  if (bag.zero) return;
  exp = simp(exp);
  if (isZeroNode(exp)) return;
  if (f.t === "q") {
    if (f.n === 0n) {
      if (exp.t === "q" && exp.n < 0n) throw new CalcError("除數不能是 0");
      bag.zero = true;
      return;
    }
    if (isIntQ(exp) && exp.n > 0n) {
      bag.coeff = mulR(bag.coeff, powRat(rr(f.n, f.d), exp.n));
      return;
    }
    if (isIntQ(exp) && exp.n < 0n) {
      bag.coeff = mulR(bag.coeff, powRat(rr(f.d, f.n), -exp.n));
      return;
    }
  }
  if (f.t === "mul" && isIntQ(exp)) {
    for (const c of f.a) absorb(bag, c, exp);
    return;
  }
  if (f.t === "pow" && (isIntQ(exp) || isIntQ(f.e))) {
    absorb(bag, f.b, simp(mulNode([f.e, exp])));
    return;
  }
  const key = sig(f);
  const hit = bag.parts.get(key);
  if (!hit) bag.parts.set(key, { base: f, exp });
  else hit.exp = simp(addNode([hit.exp, exp]));
}

function bagToNode(bag: Bag): S {
  if (bag.zero || isZeroR(bag.coeff)) return ZERO;
  const factors: S[] = [];
  if (!isOneR(bag.coeff)) factors.push(qNode(bag.coeff));
  const parts = [...bag.parts.values()].sort((a, b) => sig(a.base) < sig(b.base) ? -1 : sig(a.base) > sig(b.base) ? 1 : 0);
  for (const part of parts) {
    const e = simp(part.exp);
    if (isZeroNode(e)) continue;
    if (isOneNode(e)) factors.push(part.base);
    else {
      const pow = simpPow(part.base, e);
      if (pow.t === "q") {
        bag.coeff = mulR(isOneR(bag.coeff) && factors[0]?.t !== "q" ? rr(1n, 1n) : bag.coeff, rr(pow.n, pow.d));
        continue;
      }
      factors.push(pow);
    }
  }
  if (factors.length === 0) return ONE;
  if (factors.length === 1) return factors[0]!;
  const qf = factors.filter((f) => f.t === "q");
  if (qf.length > 1) {
    let c = rr(1n, 1n);
    const rest = factors.filter((f) => {
      if (f.t === "q") {
        c = mulR(c, rr(f.n, f.d));
        return false;
      }
      return true;
    });
    return bagToNode({ coeff: c, parts: new Map(rest.map((r) => [sig(r), { base: r, exp: ONE }])), zero: false });
  }
  return { t: "mul", a: factors };
}

function isPoly(s: S): boolean {
  switch (s.t) {
    case "q":
    case "x":
      return true;
    case "add":
    case "mul":
      return s.a.every(isPoly);
    case "pow":
      return s.b.t === "x" && isIntQ(s.e) && s.e.n > 0n;
    default:
      return false;
  }
}

function expandPoly(xs: S[]): S | null {
  let acc: S[] = [ONE];
  for (const factor of xs) {
    const terms = factor.t === "add" ? factor.a : [factor];
    if (acc.length * terms.length > 48) return null;
    const next: S[] = [];
    for (const left of acc) {
      for (const right of terms) next.push(simpMul([left, right]));
    }
    acc = next;
  }
  return simpAdd(acc);
}

function simpMul(xs: S[]): S {
  if (xs.length > 1 && xs.some((factor) => factor.t === "add") && xs.every(isPoly)) {
    const expanded = expandPoly(xs);
    if (expanded) return expanded;
  }
  const bag = emptyBag();
  for (const x of xs) absorb(bag, x, ONE);
  return distributeConst(bagToNode(bag));
}

function distributeConst(s: S): S {
  if (s.t !== "mul") return s;
  const { coeff, rest } = splitCoeff(s);
  if (isOneR(coeff) || rest.t !== "add") return s;
  return simpAdd(rest.a.map((term) => simpMul([qNode(coeff), term])));
}

function polyExp(rest: S): number | null {
  if (rest.t === "x") return 1;
  if (rest.t === "pow" && rest.b.t === "x" && rest.e.t === "q") {
    return Number(rest.e.n) / Number(rest.e.d);
  }
  return null;
}

function compareRest(a: S, b: S): number {
  const ea = polyExp(a);
  const eb = polyExp(b);
  if (ea !== null && eb !== null && ea !== eb) return eb - ea;
  if (ea !== null && eb === null) return -1;
  if (ea === null && eb !== null) return 1;
  const wa = weight(a);
  const wb = weight(b);
  if (wa !== wb) return wa - wb;
  const sa = sig(a);
  const sb = sig(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function weight(s: S): number {
  switch (s.t) {
    case "q":
    case "pi":
    case "e":
      return 0;
    case "x":
      return 1;
    case "pow":
      return 2 + weight(s.b) + weight(s.e);
    case "sin":
    case "cos":
    case "tan":
    case "ln":
    case "abs":
    case "asin":
    case "atan":
      return 3 + weight(s.a);
    case "mul":
      return 4 + s.a.reduce((sum, term) => sum + weight(term), 0);
    case "add":
      return 5 + s.a.reduce((sum, term) => sum + weight(term), 0);
    default:
      return 6;
  }
}

function simpAdd(xs: S[]): S {
  const flat: S[] = [];
  for (const x of xs) {
    if (isZeroNode(x)) continue;
    if (x.t === "add") flat.push(...x.a);
    else flat.push(x);
  }
  let constSum = rr(0n, 1n);
  const groups = new Map<string, { coeff: R; rest: S }>();
  for (const term of flat) {
    const { coeff, rest } = splitCoeff(term);
    if (eq(rest, ONE)) {
      constSum = addR(constSum, coeff);
      continue;
    }
    const key = sig(rest);
    const prev = groups.get(key);
    if (!prev) groups.set(key, { coeff, rest });
    else prev.coeff = addR(prev.coeff, coeff);
  }
  const terms: S[] = [];
  const entries = [...groups.values()].sort((a, b) => compareRest(a.rest, b.rest));
  for (const entry of entries) {
    if (isZeroR(entry.coeff)) continue;
    terms.push(scale(entry.coeff, entry.rest));
  }
  if (!isZeroR(constSum)) terms.push(qNode(constSum));
  if (terms.length === 0) return ZERO;
  if (terms.length === 1) return terms[0]!;
  const combined = combineFractions(terms);
  if (combined) return combined;
  return { t: "add", a: terms };
}

function expR(s: S): R | null {
  return s.t === "q" ? rr(s.n, s.d) : null;
}

function cmpR(a: R, b: R): number {
  const left = a.n * b.d;
  const right = b.n * a.d;
  return left < right ? -1 : left > right ? 1 : 0;
}

function combineFractions(terms: S[]): S | null {
  const parsed = terms.map(fractionParts);
  if (parsed.some((part) => part.dens.size === 0)) return null;
  const common = new Map<string, { base: S; exp: R }>();
  for (const part of parsed) {
    for (const [key, den] of part.dens) {
      const prev = common.get(key);
      if (!prev || cmpR(den.exp, prev.exp) > 0) common.set(key, { base: den.base, exp: den.exp });
    }
  }
  const nums: S[] = [];
  for (const part of parsed) {
    const mult: S[] = [part.num];
    for (const [key, den] of common) {
      const have = part.dens.get(key);
      const need = have ? subR(den.exp, have.exp) : den.exp;
      if (!isZeroR(need)) mult.push(simpPow(den.base, qNode(need)));
    }
    nums.push(mult.length === 1 ? mult[0]! : simpMul(mult));
  }
  const num = simpAdd(nums);
  const denFactors: S[] = [];
  for (const den of common.values()) {
    denFactors.push(isOneR(den.exp) ? den.base : simpPow(den.base, qNode(den.exp)));
  }
  const den = denFactors.length === 1 ? denFactors[0]! : simpMul(denFactors);
  return simpMul([num, simpPow(den, qNode(rr(-1n, 1n)))]);
}

function fractionParts(s: S): { num: S; dens: Map<string, { base: S; exp: R }> } {
  const bag = toBag(s);
  const dens = new Map<string, { base: S; exp: R }>();
  const numFactors: S[] = [];
  if (!isOneR(bag.coeff)) numFactors.push(qNode(bag.coeff));
  for (const part of bag.parts) {
    const exp = expR(part.exp);
    if (exp && exp.n < 0n) {
      const key = sig(part.base);
      const pos = negR(exp);
      const prev = dens.get(key);
      dens.set(key, { base: part.base, exp: prev ? addR(prev.exp, pos) : pos });
    } else if (isOneNode(part.exp)) numFactors.push(part.base);
    else numFactors.push({ t: "pow", b: part.base, e: part.exp });
  }
  const num = numFactors.length === 0 ? ONE : numFactors.length === 1 ? numFactors[0]! : mulNode(numFactors);
  return { num, dens };
}

function asLinear(s: S): { a: R; b: R } | null {
  s = simp(s);
  if (s.t === "x") return { a: rr(1n, 1n), b: rr(0n, 1n) };
  if (s.t === "mul") {
    const sp = splitCoeff(s);
    if (sp.rest.t === "x") return { a: sp.coeff, b: rr(0n, 1n) };
    return null;
  }
  if (s.t === "add") {
    let a = rr(0n, 1n);
    let b = rr(0n, 1n);
    for (const term of s.a) {
      if (term.t === "q") {
        b = addR(b, rr(term.n, term.d));
        continue;
      }
      const lin = asLinear(term);
      if (!lin || !isZeroR(lin.b)) return null;
      a = addR(a, lin.a);
    }
    if (isZeroR(a)) return null;
    return { a, b };
  }
  return null;
}

function D(s: S): S {
  return diffRaw(simp(s));
}

function diffRaw(s: S): S {
  switch (s.t) {
    case "q":
    case "pi":
    case "e":
      return ZERO;
    case "x":
      return ONE;
    case "add":
      return simp(addNode(s.a.map((t) => D(t))));
    case "mul":
      return simp(
        addNode(
          s.a.map((_, i) =>
            mulNode(s.a.map((f, j) => (j === i ? D(f) : f))),
          ),
        ),
      );
    case "pow":
      return simp(diffPow(s));
    case "sin":
      return simp(mulNode([{ t: "cos", a: s.a }, D(s.a)]));
    case "cos":
      return simp(mulNode([qNode(rr(-1n, 1n)), { t: "sin", a: s.a }, D(s.a)]));
    case "tan":
      return simp(mulNode([simpPow({ t: "cos", a: s.a }, qNode(rr(-2n, 1n))), D(s.a)]));
    case "ln":
      return simp(mulNode([D(s.a), simpPow(s.a, qNode(rr(-1n, 1n)))]));
    case "abs":
      return simp(mulNode([D(s.a), s.a, simpPow({ t: "abs", a: s.a }, qNode(rr(-1n, 1n)))]));
    case "asin":
      return simp(
        mulNode([
          D(s.a),
          simpPow(
            addNode([ONE, mulNode([qNode(rr(-1n, 1n)), simpPow(s.a, qNode(rr(2n, 1n)))])]),
            qNode(rr(-1n, 2n)),
          ),
        ]),
      );
    case "atan":
      return simp(mulNode([D(s.a), simpPow(addNode([ONE, simpPow(s.a, qNode(rr(2n, 1n)))]), qNode(rr(-1n, 1n)))]));
    default:
      return ZERO;
  }
}

function diffPow(s: Extract<S, { t: "pow" }>): S {
  const b = s.b;
  const e = s.e;
  if (!hasX(e)) {
    return mulNode([e, simpPow(b, addNode([e, qNode(rr(-1n, 1n))])), D(b)]);
  }
  if (!hasX(b)) {
    if (b.t === "e") return mulNode([s, D(e)]);
    return mulNode([s, { t: "ln", a: b }, D(e)]);
  }
  return D(simpPow(E, mulNode([e, { t: "ln", a: b }])));
}

function sqrtRat(r: R): R | null {
  if (r.n < 0n) return null;
  const sn = isqrt(r.n);
  const sd = isqrt(r.d);
  if (sn === null || sd === null) return null;
  return { n: sn, d: sd };
}

function isqrt(n: bigint): bigint | null {
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

function toBag(s: S): { coeff: R; parts: { base: S; exp: S }[] } {
  if (s.t === "q") return { coeff: rr(s.n, s.d), parts: [] };
  if (s.t === "pow") return { coeff: rr(1n, 1n), parts: [{ base: s.b, exp: s.e }] };
  if (s.t === "mul") {
    let coeff = rr(1n, 1n);
    const parts: { base: S; exp: S }[] = [];
    for (const f of s.a) {
      if (f.t === "q") coeff = mulR(coeff, rr(f.n, f.d));
      else if (f.t === "pow") parts.push({ base: f.b, exp: f.e });
      else parts.push({ base: f, exp: ONE });
    }
    return { coeff, parts };
  }
  return { coeff: rr(1n, 1n), parts: [{ base: s, exp: ONE }] };
}

function partMap(parts: { base: S; exp: S }[]): Map<string, { base: S; exp: S }> {
  const map = new Map<string, { base: S; exp: S }>();
  for (const part of parts) {
    const key = sig(part.base);
    const hit = map.get(key);
    if (!hit) map.set(key, { base: part.base, exp: part.exp });
    else hit.exp = simp(addNode([hit.exp, part.exp]));
  }
  return map;
}

function fromParts(coeff: R, map: Map<string, { base: S; exp: S }>): S {
  const factors: S[] = [];
  if (!isOneR(coeff)) {
    if (isZeroR(coeff)) return ZERO;
    factors.push(qNode(coeff));
  }
  for (const part of map.values()) {
    if (isZeroNode(part.exp)) continue;
    if (isOneNode(part.exp)) factors.push(part.base);
    else factors.push({ t: "pow", b: part.base, e: part.exp });
  }
  if (factors.length === 0) return ONE;
  if (factors.length === 1) return simp(factors[0]!);
  return simp(mulNode(factors));
}

function divideNodes(num: S, den: S): S | null {
  if (eq(den, ZERO)) return null;
  if (eq(den, ONE)) return num;
  const bn = toBag(simp(num));
  const bd = toBag(simp(den));
  if (isZeroR(bd.coeff)) return null;
  let coeff: R;
  try {
    coeff = divR(bn.coeff, bd.coeff);
  } catch {
    return null;
  }
  const map = partMap(bn.parts);
  const denMap = partMap(bd.parts);
  for (const [key, dpart] of denMap) {
    const have = map.get(key);
    if (!have) return null;
    have.exp = simp(addNode([have.exp, scale(rr(-1n, 1n), dpart.exp)]));
    if (isZeroNode(have.exp)) map.delete(key);
  }
  return fromParts(coeff, map);
}

function collect(s: S, out: S[] = []): S[] {
  switch (s.t) {
    case "add":
    case "mul":
      for (const c of s.a) collect(c, out);
      break;
    case "pow":
      collect(s.b, out);
      collect(s.e, out);
      break;
    case "q":
    case "pi":
    case "e":
      return out;
    case "x":
      break;
    default:
      collect(s.a, out);
  }
  out.push(s);
  return out;
}

function xPower(s: S): R | null {
  if (s.t === "x") return rr(1n, 1n);
  if (s.t === "pow" && s.b.t === "x" && s.e.t === "q") return rr(s.e.n, s.e.d);
  return null;
}

function powX(exp: R): S {
  if (isZeroR(exp)) return ONE;
  if (isOneR(exp)) return X;
  return simpPow(X, qNode(exp));
}

function asABx2(s: S): { A: R; B: R } | null {
  const terms = s.t === "add" ? s.a : [s];
  let A = rr(0n, 1n);
  let B = rr(0n, 1n);
  for (const term of terms) {
    if (term.t === "q") {
      A = addR(A, rr(term.n, term.d));
      continue;
    }
    const sp = splitCoeff(term);
    const exp = xPower(sp.rest);
    if (!exp || !(exp.n === 2n && exp.d === 1n)) return null;
    B = addR(B, sp.coeff);
  }
  return { A, B };
}

type IntHit = { value: S; title: string; lines: Piece[][] };

function hit(title: string, n: S, value: S, extra?: Piece[]): IntHit {
  const lines: Piece[][] = [[T("∫ "), ...pretty(n), T(" dx = "), ...pretty(value)]];
  if (extra) lines.push(extra);
  return { value, title, lines };
}

function matchCore(n: S, depth: number): IntHit | null {
  if (n.t === "q") {
    const value = scale(rr(n.n, n.d), X);
    return hit("常數的積分是乘上 x", n, value);
  }
  const wholePow = xPower(n);
  if (wholePow) {
    if (wholePow.n === -1n && wholePow.d === 1n) {
      return hit("x 的 −1 次方，積分是 ln|x|", n, { t: "ln", a: { t: "abs", a: X } });
    }
    const np1 = addR(wholePow, rr(1n, 1n));
    if (isZeroR(np1)) return null;
    const value = simp(mulNode([qNode(divR(rr(1n, 1n), np1)), powX(np1)]));
    return hit("冪次法則：次數加 1，再除以新的次數", n, value);
  }
  const linSin = trigLinear(n);
  if (linSin) return linSin;
  const quad = quadInt(n);
  if (quad) return quad;
  const lnHit = lnLinear(n);
  if (lnHit) return lnHit;
  const composed = composedPower(n);
  if (composed) return composed;
  return tryUSub(n, depth);
}

function trigLinear(n: S): IntHit | null {
  let kind: "sin" | "cos" | "tan" | "exp" | "sec2" | null = null;
  let inner: S | null = null;
  if (n.t === "sin") {
    kind = "sin";
    inner = n.a;
  } else if (n.t === "cos") {
    kind = "cos";
    inner = n.a;
  } else if (n.t === "tan") {
    kind = "tan";
    inner = n.a;
  } else if (n.t === "pow" && n.b.t === "e") {
    kind = "exp";
    inner = n.e;
  } else if (n.t === "pow" && n.b.t === "cos" && isQ(n.e, -2n, 1n)) {
    kind = "sec2";
    inner = n.b.a;
  } else if (n.t === "pow" && n.b.t === "cos" && isQ(n.e, -1n, 1n)) {
    kind = "tan";
    inner = null;
    const lin = asLinear(n.b.a);
    if (!lin || isZeroR(lin.a)) return null;
    const value = simp(mulNode([qNode(divR(rr(1n, 1n), lin.a)), { t: "ln", a: { t: "abs", a: addNode([simpPow(n.b, qNode(rr(-1n, 1n))), tanOf(n.b.a)]) } }]));
    return hit("∫ sec u du = ln|sec u + tan u|，再除以裡面的係數", n, value);
  }
  if (!kind || !inner) return kind === "tan" ? null : null;
  const lin = asLinear(inner);
  if (!lin || isZeroR(lin.a)) return null;
  const invA = qNode(divR(rr(1n, 1n), lin.a));
  if (kind === "sin") {
    const value = simp(mulNode([qNode(negR(divR(rr(1n, 1n), lin.a))), { t: "cos", a: inner }]));
    const title = isOneR(lin.a) && isZeroR(lin.b) ? "正弦的積分是負的餘弦" : "連鎖：裡面是一次式，積分再除以係數";
    return hit(title, n, value);
  }
  if (kind === "cos") {
    const value = simp(mulNode([invA, { t: "sin", a: inner }]));
    const title = isOneR(lin.a) && isZeroR(lin.b) ? "餘弦的積分是正弦" : "連鎖：裡面是一次式，積分再除以係數";
    return hit(title, n, value);
  }
  if (kind === "exp") {
    const value = simp(mulNode([invA, n]));
    const title = isOneR(lin.a) && isZeroR(lin.b) ? "e^x 的積分還是自己" : "e 的一次式次方，積分再除以係數";
    return hit(title, n, value);
  }
  if (kind === "tan") {
    const value = simp(mulNode([qNode(negR(divR(rr(1n, 1n), lin.a))), { t: "ln", a: { t: "abs", a: { t: "cos", a: inner } } }]));
    return hit("∫ tan u du = −ln|cos u|，再除以裡面的係數", n, value);
  }
  if (kind === "sec2") {
    const value = simp(mulNode([invA, { t: "tan", a: inner }]));
    return hit("sec² 的積分是 tan，再除以裡面的係數", n, value);
  }
  return null;
}

function tanOf(inner: S): S {
  return { t: "tan", a: inner };
}

function composedPower(n: S): IntHit | null {
  if (n.t !== "pow" || n.e.t !== "q") return null;
  const lin = asLinear(n.b);
  if (!lin || isZeroR(lin.a) || n.b.t === "x") return null;
  const exp = rr(n.e.n, n.e.d);
  if (exp.n === -1n && exp.d === 1n) {
    const value = simp(mulNode([qNode(divR(rr(1n, 1n), lin.a)), { t: "ln", a: { t: "abs", a: n.b } }]));
    return hit("一次式的 −1 次方，積分是 ln 再除以係數", n, value);
  }
  const np1 = addR(exp, rr(1n, 1n));
  if (isZeroR(np1)) return null;
  const value = simp(mulNode([qNode(divR(rr(1n, 1n), mulR(lin.a, np1))), simpPow(n.b, qNode(np1))]));
  return hit("一次式的次方，次數加 1，再除以新次數和係數", n, value);
}

function lnLinear(n: S): IntHit | null {
  if (n.t !== "ln") return null;
  const lin = asLinear(n.a);
  if (!lin || isZeroR(lin.a)) return null;
  const u = n.a;
  const value = simp(
    addNode([
      mulNode([u, qNode(divR(rr(1n, 1n), lin.a)), n]),
      mulNode([qNode(negR(divR(rr(1n, 1n), lin.a))), u]),
    ]),
  );
  return {
    value,
    title: "ln 用部分積分",
    lines: [
      [T("∫ ln u dx，u = "), ...pretty(u), T("，結果是 u ln u / a − u / a")],
      [T("= "), ...pretty(value)],
    ],
  };
}

function quadInt(n: S): IntHit | null {
  let exp: R | null = null;
  let inside: S | null = null;
  if (n.t === "pow" && n.e.t === "q") {
    exp = rr(n.e.n, n.e.d);
    inside = n.b;
  }
  if (!exp || !inside) return null;
  const ab = asABx2(inside);
  if (!ab) return null;
  if (exp.n === -1n && exp.d === 1n && ab.A.n > 0n && ab.B.n > 0n) {
    const ratio = divR(ab.B, ab.A);
    const root = sqrtRat(ratio);
    const den = sqrtRat(mulR(ab.A, ab.B));
    if (!root || !den) return null;
    const value = simp(mulNode([qNode(divR(rr(1n, 1n), den)), { t: "atan", a: scale(root, X) }]));
    return hit("寫成 1/(1+u²)，積分是 arctan", n, value);
  }
  if (exp.n === -1n && exp.d === 2n && ab.A.n > 0n && ab.B.n < 0n) {
    const C = negR(ab.B);
    const ratio = divR(C, ab.A);
    const root = sqrtRat(ratio);
    const den = sqrtRat(C);
    if (!root || !den) return null;
    const value = simp(mulNode([qNode(divR(rr(1n, 1n), den)), { t: "asin", a: scale(root, X) }]));
    return hit("寫成 1/√(1−u²)，積分是 arcsin", n, value);
  }
  return null;
}

function tryUSub(n: S, depth: number): IntHit | null {
  if (depth > 5) return null;
  const seen = new Set<string>();
  const cands = collect(n).filter((u) => {
    if (!hasX(u) || u.t === "x" || eq(u, n)) return false;
    const key = sig(u);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  let best: IntHit | null = null;
  let bestScore = Infinity;
  for (const u of cands) {
    const du = D(u);
    if (eq(du, ZERO)) continue;
    const quot = divideNodes(n, du);
    if (!quot) continue;
    if (!onlyThrough(quot, u)) continue;
    const qInX = simp(replace(quot, u, X));
    if (eq(qInX, n)) continue;
    let antiX: S;
    try {
      antiX = integrateNode(qInX, depth + 1);
    } catch {
      continue;
    }
    const value = simp(replace(antiX, X, u));
    if (!eq(D(value), simp(n))) continue;
    const score = sig(quot).length + sig(u).length;
    if (score < bestScore) {
      bestScore = score;
      best = {
        value,
        title: "湊微分：外面正好是裡面的導數",
        lines: [
          [T("令 u = "), ...pretty(u), T("，u′ = "), ...pretty(du)],
          [T("原式變成 ∫ "), ...pretty(qInX), T(" du = "), ...pretty(antiX)],
          [T("把 u 代回去："), ...pretty(value)],
        ],
      };
    }
  }
  return best;
}

function matchTerm(n: S, depth: number): IntHit | null {
  const direct = matchCore(n, depth);
  if (direct) return direct;
  const sp = splitCoeff(n);
  if (!isOneR(sp.coeff) && !isZeroR(sp.coeff) && !eq(sp.rest, ONE)) {
    const inner = matchCore(sp.rest, depth);
    if (inner) {
      const value = simp(scale(sp.coeff, inner.value));
      return {
        value,
        title: "常數先提出來",
        lines: [
          [T("∫ "), ...pretty(n), T(" dx = "), ...pretty(qNode(sp.coeff)), T(" · ∫ "), ...pretty(sp.rest), T(" dx")],
          [T("= "), ...pretty(qNode(sp.coeff)), T(" · ("), ...pretty(inner.value), T(") = "), ...pretty(value)],
        ],
      };
    }
  }
  return null;
}

function integrateNode(n: S, depth = 0): S {
  if (depth > 6) throw new CalcError("這個積分太複雜了");
  n = simp(n);
  if (n.t === "add") return simp(addNode(n.a.map((term) => integrateNode(term, depth + 1))));
  const hitNode = matchTerm(n, depth);
  if (!hitNode) throw new CalcError(INT_FAIL);
  return hitNode.value;
}

function explainInt(raw: S): { value: S; steps: Step[] } {
  const steps: Step[] = [];
  const n = simp(raw);
  if (!eq(n, raw)) steps.push({ title: "先化簡", lines: [pretty(raw), [T("= "), ...pretty(n)]] });
  const value = walkInt(n, steps, 0);
  steps.push({ title: "結果", lines: [[...pretty(value), T(" + C")]] });
  const back = D(value);
  if (eq(back, n)) {
    steps.push({
      title: "驗算：把答案微分，應該回到原式",
      lines: [[...pretty(value), T("′ = "), ...pretty(back)]],
    });
  }
  return { value, steps };
}

function walkInt(n: S, steps: Step[], depth: number): S {
  if (n.t === "add") {
    steps.push({ title: "和的積分，一項一項積", lines: [pretty(n)] });
    const parts: S[] = [];
    for (const term of n.a) {
      const one = matchTerm(term, depth);
      if (!one) throw new CalcError(INT_FAIL);
      steps.push({ title: one.title, lines: one.lines });
      parts.push(one.value);
    }
    const sum = simp(addNode(parts));
    steps.push({ title: "把各項加起來", lines: [pretty(sum)] });
    return sum;
  }
  const one = matchTerm(n, depth);
  if (!one) throw new CalcError(INT_FAIL);
  steps.push({ title: one.title, lines: one.lines });
  return one.value;
}

function explainDiff(raw: S): { value: S; steps: Step[] } {
  const steps: Step[] = [];
  const n = simp(raw);
  if (!eq(n, raw)) steps.push({ title: "先化簡", lines: [pretty(raw), [T("= "), ...pretty(n)]] });
  const value = narrate(n, steps);
  const official = D(n);
  const shown = eq(value, official) ? value : official;
  steps.push({ title: "結果", lines: [pretty(shown)] });
  return { value: shown, steps };
}

function narrate(n: S, steps: Step[]): S {
  n = simp(n);
  if (!hasX(n)) {
    steps.push({ title: "常數的導數是 0", lines: [[...pretty(n), T("′ = 0")]] });
    return ZERO;
  }
  if (n.t === "x") {
    steps.push({ title: "x 的導數是 1", lines: [[T("x′ = 1")]] });
    return ONE;
  }
  const lin = asLinear(n);
  if (lin) {
    const d = qNode(lin.a);
    const title = isZeroR(lin.b) ? "x 的倍數，導數就是那個倍數" : "一次式的導數是 x 的係數";
    steps.push({ title, lines: [[...pretty(n), T("′ = "), ...pretty(d)]] });
    return d;
  }
  if (n.t === "add") {
    steps.push({ title: "和的導數，逐項相加", lines: [pretty(n)] });
    const ds = n.a.map((term) => narrate(term, steps));
    const sum = simp(addNode(ds));
    steps.push({ title: "各項加起來", lines: [joinPieces(ds, " + "), [T("= "), ...pretty(sum)]] });
    return sum;
  }
  const sp = splitCoeff(n);
  if (!isOneR(sp.coeff) && !isNegOneR(sp.coeff) && hasX(sp.rest)) {
    const c = qNode(sp.coeff);
    steps.push({
      title: "常數倍先提出來",
      lines: [[...pretty(n), T("′ = "), ...pretty(c), T(" · ("), ...pretty(sp.rest), T(")′")]],
    });
    const inner = narrate(sp.rest, steps);
    const out = simp(mulNode([c, inner]));
    steps.push({ title: "乘回常數", lines: [[...pretty(c), T(" · "), ...pretty(inner), T(" = "), ...pretty(out)]] });
    return out;
  }
  if (isNegOneR(sp.coeff) && hasX(sp.rest) && n.t === "mul") {
    steps.push({
      title: "負號先留著",
      lines: [[...pretty(n), T("′ = −("), ...pretty(sp.rest), T(")′")]],
    });
    const inner = narrate(sp.rest, steps);
    const out = simp(mulNode([qNode(rr(-1n, 1n)), inner]));
    steps.push({ title: "補上負號", lines: [[T("−("), ...pretty(inner), T(") = "), ...pretty(out)]] });
    return out;
  }
  if (n.t === "pow") return narratePow(n, steps);
  if (n.t === "sin" || n.t === "cos" || n.t === "tan" || n.t === "ln" || n.t === "asin" || n.t === "atan" || n.t === "abs") {
    return narrateFn(n, steps);
  }
  const quot = asQuotient(n);
  if (quot && hasX(quot.den)) return narrateQuot(quot.num, quot.den, steps);
  if (n.t === "mul") return narrateProd(n, steps);
  const d = D(n);
  steps.push({ title: "套用微分法則", lines: [[...pretty(n), T("′ = "), ...pretty(d)]] });
  return d;
}

function narratePow(n: Extract<S, { t: "pow" }>, steps: Step[]): S {
  const b = n.b;
  const e = n.e;
  if (!hasX(e)) {
    const d = D(n);
    if (b.t === "x") {
      steps.push({
        title: "冪次法則",
        lines: [[T("次數先乘下來，再把次數減 1")], [...pretty(n), T("′ = "), ...pretty(d)]],
      });
      return d;
    }
    const expMinus = simp(addNode([e, qNode(rr(-1n, 1n))]));
    steps.push({
      title: "冪次法則，再乘裡面的導數",
      lines: [
        [T("("), ...pretty(b), T(")"), supPiece(expMinus), T(" 的次數先乘下來")],
        [T("裡面 "), ...pretty(b), T(" 還要再微分")],
      ],
    });
    const db = narrate(b, steps);
    const out = simp(mulNode([e, simpPow(b, expMinus), db]));
    steps.push({ title: "乘起來", lines: [[...pretty(out)]] });
    return eq(out, d) ? out : d;
  }
  if (b.t === "e") {
    steps.push({
      title: "指數函數的導數還是自己，再乘指數的導數",
      lines: [[T("(e^u)′ = e^u · u′")], [T("u = "), ...pretty(e)]],
    });
    if (e.t === "x") return n;
    const du = narrate(e, steps);
    const out = simp(mulNode([n, du]));
    steps.push({ title: "乘起來", lines: [[...pretty(n), T(" · "), ...pretty(du), T(" = "), ...pretty(out)]] });
    return out;
  }
  if (!hasX(b)) {
    const d = D(n);
    steps.push({
      title: "一般指數：a^u 的導數是 a^u · ln a · u′",
      lines: [[...pretty(n), T("′ = "), ...pretty(d)]],
    });
    return d;
  }
  const d = D(n);
  steps.push({
    title: "一般冪：先寫成 e^(指數 · ln 底數) 再微分",
    lines: [[...pretty(n), T("′ = "), ...pretty(d)]],
  });
  return d;
}

function narrateFn(n: S, steps: Step[]): S {
  const d = D(n);
  if (n.t !== "sin" && n.t !== "cos" && n.t !== "tan" && n.t !== "ln" && n.t !== "asin" && n.t !== "atan" && n.t !== "abs") {
    return d;
  }
  const arg = n.a;
  const name =
    n.t === "sin" ? "sin" : n.t === "cos" ? "cos" : n.t === "tan" ? "tan" : n.t === "ln" ? "ln" : n.t === "asin" ? "arcsin" : n.t === "atan" ? "arctan" : "|u|";
  const rule =
    n.t === "sin"
      ? "(sin u)′ = cos u · u′"
      : n.t === "cos"
        ? "(cos u)′ = −sin u · u′"
        : n.t === "tan"
          ? "(tan u)′ = sec²u · u′"
          : n.t === "ln"
            ? "(ln u)′ = u′ / u"
            : n.t === "asin"
              ? "(arcsin u)′ = u′ / √(1−u²)"
              : n.t === "atan"
                ? "(arctan u)′ = u′ / (1+u²)"
                : "(|u|)′ = u′ · u / |u|";
  if (arg.t === "x") {
    steps.push({ title: `${name} x 的導數`, lines: [[T(rule)], [...pretty(n), T("′ = "), ...pretty(d)]] });
    return d;
  }
  const duConst = D(arg);
  if (!hasX(duConst) && !isZeroNode(duConst)) {
    steps.push({
      title: "連鎖法則",
      lines: [[T(rule)], [T("u = "), ...pretty(arg), T("，u′ = "), ...pretty(duConst)], [...pretty(n), T("′ = "), ...pretty(d)]],
    });
    return d;
  }
  steps.push({ title: "連鎖法則", lines: [[T(rule)], [T("u = "), ...pretty(arg)]] });
  narrate(arg, steps);
  steps.push({ title: "代回去", lines: [[...pretty(n), T("′ = "), ...pretty(d)]] });
  return d;
}

function asQuotient(s: S): { num: S; den: S } | null {
  const bag = toBag(s);
  const num: S[] = [];
  const den: S[] = [];
  for (const part of bag.parts) {
    if (part.exp.t === "q" && part.exp.n < 0n) {
      const e = rr(-part.exp.n, part.exp.d);
      den.push(isOneR(e) ? part.base : simpPow(part.base, qNode(e)));
    } else if (!isOneNode(part.exp)) num.push(simpPow(part.base, part.exp));
    else num.push(part.base);
  }
  if (den.length === 0) return null;
  if (!isOneR(bag.coeff)) {
    if (bag.coeff.n < 0n) num.unshift(qNode(bag.coeff));
    else num.unshift(qNode(bag.coeff));
  }
  const numN = num.length === 0 ? ONE : num.length === 1 ? num[0]! : mulNode(num);
  const denN = den.length === 1 ? den[0]! : mulNode(den);
  if (!hasX(simp(denN))) return null;
  if (xPower(s) || (splitCoeff(s).rest && xPower(splitCoeff(s).rest))) return null;
  return { num: simp(numN), den: simp(denN) };
}

function narrateQuot(num: S, den: S, steps: Step[]): S {
  const d = D(simp(mulNode([num, simpPow(den, qNode(rr(-1n, 1n)))])));
  steps.push({
    title: "商的法則",
    lines: [[T("(u/v)′ = (u′v − uv′) / v²")], [T("u = "), ...pretty(num)], [T("v = "), ...pretty(den)]],
  });
  const du = narrate(num, steps);
  const dv = narrate(den, steps);
  steps.push({
    title: "代進公式",
    lines: [
      [
        T("("),
        ...pretty(du),
        T(" · "),
        ...pretty(den),
        T(" − "),
        ...pretty(num),
        T(" · "),
        ...pretty(dv),
        T(") / ("),
        ...pretty(den),
        T(")²"),
      ],
      [T("= "), ...pretty(d)],
    ],
  });
  return d;
}

function narrateProd(n: Extract<S, { t: "mul" }>, steps: Step[]): S {
  const factors = n.a.filter((f) => f.t !== "q");
  if (factors.length < 2) {
    const d = D(n);
    steps.push({ title: "套用微分法則", lines: [[...pretty(n), T("′ = "), ...pretty(d)]] });
    return d;
  }
  const u = factors[0]!;
  const v = factors.length === 2 ? factors[1]! : simp(mulNode(factors.slice(1)));
  steps.push({
    title: "乘積法則",
    lines: [[T("(uv)′ = u′v + uv′")], [T("u = "), ...pretty(u)], [T("v = "), ...pretty(v)]],
  });
  const du = narrate(u, steps);
  const dv = narrate(v, steps);
  const out = simp(addNode([mulNode([du, v]), mulNode([u, dv])]));
  steps.push({
    title: "代進公式",
    lines: [[...pretty(du), T(" · "), ...pretty(v), T(" + "), ...pretty(u), T(" · "), ...pretty(dv), T(" = "), ...pretty(out)]],
  });
  return out;
}

function joinPieces(xs: S[], sep: string): Piece[] {
  const out: Piece[] = [];
  xs.forEach((item, i) => {
    if (i > 0) out.push(T(sep));
    out.push(...pretty(item));
  });
  return out;
}

function supPiece(e: S): Piece {
  if (e.t === "q" && e.d === 1n) return { k: "sup", v: e.n < 0n ? `−${(-e.n).toString()}` : e.n.toString() };
  if (e.t === "x") return { k: "sup", v: "x" };
  return T("^(" + flatPieces(pretty(e)) + ")");
}

function pretty(s: S): Piece[] {
  return prettyAt(s, 0);
}

function prettyAt(s: S, parent: number): Piece[] {
  switch (s.t) {
    case "q":
      return prettyRat(s.n, s.d, parent);
    case "x":
      return [T("x")];
    case "pi":
      return [T("π")];
    case "e":
      return [T("e")];
    case "add":
      return paren(prettyAdd(s), parent > 1);
    case "mul":
      return paren(prettyMul(s), parent > 2 && needsMulParen(s));
    case "pow":
      return prettyPow(s);
    case "abs":
      return [T("|"), ...pretty(s.a), T("|")];
    case "sin":
    case "cos":
    case "tan":
    case "asin":
    case "atan":
      return prettyCall(s);
    case "ln":
      if (s.a.t === "abs") return [T("ln|"), ...pretty(s.a.a), T("|")];
      return prettyCall(s);
    default:
      return [T("?")];
  }
}

function paren(ps: Piece[], on: boolean): Piece[] {
  return on ? [T("("), ...ps, T(")")] : ps;
}

function needsMulParen(s: Extract<S, { t: "mul" }>): boolean {
  const bag = toBag(s);
  return !bag.parts.some((p) => p.exp.t === "q" && p.exp.n < 0n) && !(s.a[0]?.t === "q" && s.a[0].n < 0n);
}

function prettyRat(n: bigint, d: bigint, parent: number): Piece[] {
  const r = rr(n, d);
  const neg = r.n < 0n;
  const an = (neg ? -r.n : r.n).toString();
  const body: Piece[] = r.d === 1n ? [T(an)] : [{ k: "f", num: [T(an)], den: [T(r.d.toString())] }];
  if (!neg) return body;
  if (parent > 0) return [T("("), T("−"), ...body, T(")")];
  return [T("−"), ...body];
}

function prettyAdd(s: Extract<S, { t: "add" }>): Piece[] {
  const out: Piece[] = [];
  s.a.forEach((term, index) => {
    const sp = splitCoeff(term);
    if (index > 0 && sp.coeff.n < 0n) {
      const pos = simp(mulNode([qNode(rr(-1n, 1n)), term]));
      out.push(T(" − "), ...prettyAt(pos, 1));
      return;
    }
    if (index > 0) out.push(T(" + "));
    out.push(...prettyAt(term, 1));
  });
  return out;
}

function prettyMul(s: Extract<S, { t: "mul" }>): Piece[] {
  const bag = toBag(s);
  const num: S[] = [];
  const den: S[] = [];
  for (const part of [...bag.parts].sort((a, b) => compareRest(a.base, b.base))) {
    if (part.exp.t === "q" && part.exp.n < 0n) {
      const e = rr(-part.exp.n, part.exp.d);
      den.push(isOneR(e) ? part.base : { t: "pow", b: part.base, e: qNode(e) });
    } else {
      num.push(isOneNode(part.exp) ? part.base : { t: "pow", b: part.base, e: part.exp });
    }
  }
  let cn = bag.coeff.n;
  const cd = bag.coeff.d;
  const neg = cn < 0n;
  if (neg) cn = -cn;
  if (cn !== 1n) num.unshift(qNode(rr(cn, 1n)));
  if (cd !== 1n) den.unshift(qNode(rr(cd, 1n)));
  const numP = num.length === 0 ? [T("1")] : prettyProduct(num);
  if (den.length === 0) return neg ? [T("−"), ...numP] : numP;
  const frac: Piece = { k: "f", num: numP, den: prettyProduct(den) };
  return neg ? [T("−"), frac] : [frac];
}

function prettyProduct(factors: S[]): Piece[] {
  if (factors.length === 1 && factors[0]!.t === "add") return pretty(factors[0]!);
  const out: Piece[] = [];
  factors.forEach((factor, index) => {
    if (index > 0 && !juxtapose(factor)) out.push(T("·"));
    out.push(...prettyAt(factor, 2));
  });
  return out;
}

function juxtapose(factor: S): boolean {
  if (factor.t === "x" || factor.t === "add") return true;
  return factor.t === "pow" && (factor.b.t === "x" || factor.b.t === "add");
}

function prettyPow(s: Extract<S, { t: "pow" }>): Piece[] {
  if (s.b.t === "cos" && isQ(s.e, -2n, 1n)) {
    return [T("sec"), { k: "sup", v: "2" }, T("("), ...pretty(s.b.a), T(")")];
  }
  if (s.b.t === "cos" && isQ(s.e, -1n, 1n)) return [T("sec("), ...pretty(s.b.a), T(")")];
  if (s.b.t === "sin" && isQ(s.e, -1n, 1n)) return [T("csc("), ...pretty(s.b.a), T(")")];
  if (
    (s.b.t === "sin" || s.b.t === "cos" || s.b.t === "tan") &&
    isIntQ(s.e) &&
    s.e.n >= 2n &&
    s.e.n <= 9n
  ) {
    return [T(s.b.t), { k: "sup", v: s.e.n.toString() }, T("("), ...pretty(s.b.a), T(")")];
  }
  if (isQ(s.e, 1n, 2n)) {
    if (s.b.t === "x" || s.b.t === "q") return [T("√"), ...prettyAt(s.b, 4)];
    return [T("√("), ...pretty(s.b), T(")")];
  }
  if (isQ(s.e, -1n, 2n)) {
    const frac: Piece = { k: "f", num: [T("1")], den: [T("√("), ...pretty(s.b), T(")")] };
    return [frac];
  }
  if (s.e.t === "q" && s.e.n < 0n) {
    const pos = rr(-s.e.n, s.e.d);
    const den = isOneR(pos) ? pretty(s.b) : pretty({ t: "pow", b: s.b, e: qNode(pos) });
    const frac: Piece = { k: "f", num: [T("1")], den };
    return [frac];
  }
  if ((s.b.t === "x" || s.b.t === "e" || s.b.t === "pi") && (s.e.t === "x" || (s.e.t === "q" && s.e.d === 1n && s.e.n >= 0n && s.e.n <= 9n))) {
    const v = s.e.t === "x" ? "x" : s.e.n.toString();
    return [...prettyAt(s.b, 4), { k: "sup", v }];
  }
  if (s.e.t === "q" && s.e.d === 1n && s.e.n >= 2n && s.e.n <= 9n) {
    return [...prettyAt(s.b, 4), { k: "sup", v: s.e.n.toString() }];
  }
  return [...prettyAt(s.b, 4), T("^("), ...pretty(s.e), T(")")];
}

function prettyCall(s: Extract<S, { t: "sin" | "cos" | "tan" | "ln" | "asin" | "atan" }>): Piece[] {
  const name = s.t === "asin" ? "arcsin" : s.t === "atan" ? "arctan" : s.t;
  if (s.a.t === "x") return [T(`${name} x`)];
  return [T(`${name}(`), ...pretty(s.a), T(")")];
}

function flatPieces(ps: Piece[]): string {
  return ps
    .map((p) => {
      if (p.k === "t") return p.v;
      if (p.k === "sup") return "^" + p.v;
      if (p.k === "f") return `${flatSide(p.num)}/${flatSide(p.den)}`;
      return "";
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function flatSide(ps: Piece[]): string {
  const text = flatPieces(ps);
  const ambiguous = text.includes("+") || text.includes("−") || text.includes("·") || (/^\d/.test(text) && !/^\d+$/.test(text));
  return ambiguous ? `(${text})` : text;
}

const FUNCS = new Set([
  "sin",
  "cos",
  "tan",
  "ln",
  "log",
  "exp",
  "sec",
  "csc",
  "cot",
  "arcsin",
  "arccos",
  "arctan",
  "asin",
  "acos",
  "atan",
  "abs",
  "sqrt",
]);

type Tok = { k: "num"; v: string } | { k: "id"; v: string } | { k: "op"; v: string } | { k: "lp" } | { k: "rp" } | { k: "end" };

function normalizeCalc(input: string): string {
  return input
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30))
    .replace(/＋/g, "+")
    .replace(/[－–—−]/g, "-")
    .replace(/[＊×·•]/g, "*")
    .replace(/[／⁄÷]/g, "/")
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/＾/g, "^")
    .replace(/\*\*/g, "^")
    .replace(/π/g, "π")
    .replace(/∫/g, "∫");
}

function tokenize(input: string): Tok[] {
  const s = normalizeCalc(input);
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i += 1;
      continue;
    }
    if ((c >= "0" && c <= "9") || (c === "." && s[i + 1]! >= "0" && s[i + 1]! <= "9")) {
      let j = i;
      if (s[j] !== ".") while (j < s.length && s[j]! >= "0" && s[j]! <= "9") j += 1;
      if (s[j] === ".") {
        j += 1;
        while (j < s.length && s[j]! >= "0" && s[j]! <= "9") j += 1;
      }
      out.push({ k: "num", v: s.slice(i, j) });
      i = j;
      continue;
    }
    if (c === "π") {
      out.push({ k: "id", v: "pi" });
      i += 1;
      continue;
    }
    if (/[a-zA-Z]/.test(c)) {
      let j = i;
      while (j < s.length && /[a-zA-Z]/.test(s[j]!)) j += 1;
      out.push({ k: "id", v: s.slice(i, j).toLowerCase() });
      i = j;
      continue;
    }
    if ("+-*/^()".includes(c) || c === "√") {
      if (c === "(") out.push({ k: "lp" });
      else if (c === ")") out.push({ k: "rp" });
      else out.push({ k: "op", v: c });
      i += 1;
      continue;
    }
    throw new CalcError(`看不懂「${c}」`);
  }
  out.push({ k: "end" });
  return out;
}

function decimalToNode(raw: string): S {
  if (!raw.includes(".")) return qNode(rr(BigInt(raw), 1n));
  const [a = "", b = ""] = raw.split(".");
  if (b.length === 0) return qNode(rr(BigInt(a || "0"), 1n));
  return qNode(rr(BigInt(`${a || "0"}${b}`), 10n ** BigInt(b.length)));
}

function applyFunc(name: string, arg: S): S {
  if (name === "sin") return { t: "sin", a: arg };
  if (name === "cos") return { t: "cos", a: arg };
  if (name === "tan") return { t: "tan", a: arg };
  if (name === "ln" || name === "log") return { t: "ln", a: arg };
  if (name === "exp") return { t: "pow", b: E, e: arg };
  if (name === "sqrt") return { t: "pow", b: arg, e: qNode(rr(1n, 2n)) };
  if (name === "sec") return simpPow({ t: "cos", a: arg }, qNode(rr(-1n, 1n)));
  if (name === "csc") return simpPow({ t: "sin", a: arg }, qNode(rr(-1n, 1n)));
  if (name === "cot") return mulNode([{ t: "cos", a: arg }, simpPow({ t: "sin", a: arg }, qNode(rr(-1n, 1n)))]);
  if (name === "arcsin" || name === "asin") return { t: "asin", a: arg };
  if (name === "arctan" || name === "atan") return { t: "atan", a: arg };
  if (name === "arccos" || name === "acos") {
    return addNode([mulNode([qNode(rr(1n, 2n)), PI]), mulNode([qNode(rr(-1n, 1n)), { t: "asin", a: arg }])]);
  }
  if (name === "abs") return { t: "abs", a: arg };
  throw new CalcError(`還不會算 ${name}`);
}

function parseExpr(input: string): S {
  const trimmed = input.trim();
  if (!trimmed) throw new CalcError("請先輸入算式");
  if (trimmed.length > 240) throw new CalcError("算式太長了");
  const tokens = tokenize(trimmed);
  let i = 0;
  const peek = () => tokens[i] ?? { k: "end" as const };
  function consume() {
    const t = peek();
    i += 1;
    return t;
  }
  function opIs(v: string) {
    const t = peek();
    return t.k === "op" && t.v === v;
  }
  function startsPower(): boolean {
    const t = peek();
    if (t.k === "num" || t.k === "id" || t.k === "lp") return true;
    return t.k === "op" && (t.v === "√" || t.v === "-");
  }
  function parseSum(): S {
    let left = parseProduct();
    while (opIs("+") || opIs("-")) {
      const op = consume();
      const right = parseProduct();
      left =
        op.k === "op" && op.v === "-"
          ? addNode([left, mulNode([qNode(rr(-1n, 1n)), right])])
          : addNode([left, right]);
    }
    return left;
  }
  function parseProduct(): S {
    let left = parsePower();
    while (true) {
      if (opIs("*")) {
        consume();
        left = mulNode([left, parsePower()]);
        continue;
      }
      if (opIs("/")) {
        consume();
        left = mulNode([left, { t: "pow", b: parsePower(), e: qNode(rr(-1n, 1n)) }]);
        continue;
      }
      if (startsPower() && !(peek().k === "op" && peek().k === "op")) {
        const t = peek();
        if (t.k === "op" && t.v === "-") break;
        if (t.k === "num" || t.k === "id" || t.k === "lp" || (t.k === "op" && t.v === "√")) {
          left = mulNode([left, parsePower()]);
          continue;
        }
      }
      break;
    }
    return left;
  }
  function parsePower(): S {
    const left = parsePrefix();
    if (opIs("^")) {
      consume();
      return { t: "pow", b: left, e: parseFuncArg() };
    }
    return left;
  }
  function parseFuncArg(): S {
    let left = parsePower();
    while (true) {
      const t = peek();
      if (t.k === "num" || t.k === "id" || t.k === "lp" || (t.k === "op" && t.v === "√")) {
        left = mulNode([left, parsePower()]);
        continue;
      }
      break;
    }
    return left;
  }
  function parsePrefix(): S {
    if (opIs("+")) {
      consume();
      return parsePrefix();
    }
    if (opIs("-")) {
      consume();
      return mulNode([qNode(rr(-1n, 1n)), parsePrefix()]);
    }
    if (opIs("√")) {
      consume();
      return { t: "pow", b: parseFuncArg(), e: qNode(rr(1n, 2n)) };
    }
    const t = peek();
    if (t.k === "id" && FUNCS.has(t.v)) {
      consume();
      return applyFunc(t.v, parseFuncArg());
    }
    return parseAtom();
  }
  function parseAtom(): S {
    const t = peek();
    if (t.k === "num") {
      consume();
      return decimalToNode(t.v);
    }
    if (t.k === "id") {
      consume();
      if (t.v === "x") return X;
      if (t.v === "e") return E;
      if (t.v === "pi") return PI;
      if (t.v === "d") throw new CalcError("微分請按「微分」，或把 d/dx 寫在最前面");
      throw new CalcError(`目前只對 x 微積分，看不懂「${t.v}」`);
    }
    if (t.k === "lp") {
      consume();
      const inner = parseSum();
      if (peek().k !== "rp") throw new CalcError("少了右括號 )");
      consume();
      return inner;
    }
    if (t.k === "end") throw new CalcError("算式還沒寫完");
    const label = t.k === "op" ? t.v : t.k === "rp" ? ")" : "";
    throw new CalcError(label ? `這裡不該出現「${label}」` : "算式還沒寫完");
  }
  const ast = parseSum();
  if (peek().k !== "end") throw new CalcError("算式還沒寫完，或多了一個符號");
  return ast;
}

export function splitCalcPrefix(input: string): { op: CalcOp | null; body: string } {
  let s = normalizeCalc(input).trim();
  let op: CalcOp | null = null;
  if (/^d\s*\/\s*dx/i.test(s)) {
    op = "diff";
    s = s.replace(/^d\s*\/\s*dx/i, "").trim();
  } else if (s.startsWith("∫")) {
    op = "int";
    s = s.slice(1).trim();
  } else if (/^int\s+/i.test(s)) {
    op = "int";
    s = s.replace(/^int\s+/i, "").trim();
  }
  if (op === "int") s = s.replace(/d\s*x$/i, "").trim();
  return { op, body: s };
}

export function solveCalculus(input: string, requested: CalcOp): CalculusSolution {
  const { op: leading, body } = splitCalcPrefix(input);
  const op = leading ?? requested;
  const ast = parseExpr(body);
  const explained = op === "diff" ? explainDiff(ast) : explainInt(ast);
  const answerPieces = op === "int" ? [...pretty(explained.value), T(" + C")] : pretty(explained.value);
  const steps: Step[] = [{ title: "原式", lines: [pretty(ast)] }, ...explained.steps];
  return {
    input: body,
    op,
    steps,
    answer: answerPieces,
    linear: flat(answerPieces),
    headline: op === "diff" ? "導數" : "不定積分",
    inputPretty: pretty(ast),
  };
}

export function tryPrettyCalc(input: string): Piece[] | null {
  try {
    const { body } = splitCalcPrefix(input);
    if (!body.trim()) return null;
    return pretty(parseExpr(body));
  } catch {
    return null;
  }
}

export function calculusAnswer(input: string, op: CalcOp): S {
  const { body } = splitCalcPrefix(input);
  const ast = simp(parseExpr(body));
  return op === "diff" ? D(ast) : integrateNode(ast);
}

export function flat(ps: Piece[]): string {
  return flatPieces(ps);
}
