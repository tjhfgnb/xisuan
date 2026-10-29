import {
  CalcError,
  gcd,
  isqrt,
  lcm,
  linear,
  normalize,
  simplify,
  toDecimal,
  toMixed,
  type DecimalInfo,
  type Frac,
  type Mixed,
} from "./rational";

export { CalcError, linear, toDecimal, toMixed };
export type { DecimalInfo, Frac, Mixed };

export type Piece =
  | { k: "t"; v: string }
  | { k: "f"; num: Piece[]; den: Piece[] }
  | { k: "sup"; v: string }
  | { k: "dec"; info: DecimalInfo };

export type Step = { title: string; lines: Piece[][] };

export type Solution = {
  input: string;
  steps: Step[];
  result: Frac;
  decimal: DecimalInfo;
  mixed: Mixed | null;
  linear: string;
  pretty: Piece[];
};

type Expr =
  | { type: "num"; raw: string; frac: Frac }
  | { type: "bin"; op: "+" | "-" | "*" | "/" | "÷"; left: Expr; right: Expr; paired?: boolean }
  | { type: "neg"; expr: Expr }
  | { type: "pow"; base: Expr; exp: Expr }
  | { type: "pct"; expr: Expr }
  | { type: "sqrt"; expr: Expr }
  | { type: "group"; expr: Expr }
  | { type: "mixed"; whole: Expr; part: Expr };

type Tok =
  | { k: "num"; v: string }
  | { k: "op"; v: string }
  | { k: "lp" }
  | { k: "rp" }
  | { k: "end" };

function T(v: string): Piece {
  return { k: "t", v };
}

function fmtInt(n: bigint): string {
  return n < 0n ? `−${(-n).toString()}` : n.toString();
}

function F(f: Frac, mode: "auto" | "bar"): Piece[] {
  const s = mode === "bar" ? normalize(f.n, f.d) : simplify(f);
  const neg = s.n < 0n;
  const n = (neg ? -s.n : s.n).toString();
  const d = s.d.toString();
  if (mode === "auto" && s.d === 1n) return [T((neg ? "−" : "") + n)];
  const frac: Piece = { k: "f", num: [T(n)], den: [T(d)] };
  return neg ? [T("−"), frac] : [frac];
}

function FP(f: Frac, mode: "auto" | "bar"): Piece[] {
  const s = mode === "bar" ? normalize(f.n, f.d) : simplify(f);
  const body = F(f, mode);
  if (s.n < 0n) return [T("("), ...body, T(")")];
  return body;
}

function normalizeInput(input: string): string {
  return input
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30))
    .replace(/＋/g, "+")
    .replace(/[－–—−]/g, "-")
    .replace(/[＊×·•xX]/g, "*")
    .replace(/[／⁄]/g, "/")
    .replace(/[：∶:]/g, "÷")
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/％/g, "%")
    .replace(/＾/g, "^")
    .replace(/\*\*/g, "^");
}

function tokenize(input: string): Tok[] {
  const s = normalizeInput(input);
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
      if (s[j] !== ".") {
        while (j < s.length && s[j]! >= "0" && s[j]! <= "9") j += 1;
      }
      if (s[j] === ".") {
        j += 1;
        while (j < s.length && s[j]! >= "0" && s[j]! <= "9") j += 1;
      }
      const raw = s.slice(i, j);
      if (raw === ".") throw new CalcError("小數點後面要有數字");
      out.push({ k: "num", v: raw });
      i = j;
      continue;
    }
    if ("+-*/^%()".includes(c) || c === "÷" || c === "√" || c === "又") {
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

function decimalToFrac(raw: string): Frac {
  if (!raw.includes(".")) return { n: BigInt(raw), d: 1n };
  const [a = "", b = ""] = raw.split(".");
  if (b.length === 0) return { n: BigInt(a || "0"), d: 1n };
  const digits = `${a || "0"}${b}`;
  return { n: BigInt(digits), d: 10n ** BigInt(b.length) };
}

function parse(input: string): Expr {
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
  function takeOp(v: string) {
    if (!opIs(v)) return false;
    consume();
    return true;
  }

  function parseExpression(): Expr {
    let left = parseTerm();
    while (opIs("+") || opIs("-")) {
      const op = consume();
      if (op.k !== "op") throw new CalcError("算式還沒寫完");
      const right = parseTerm();
      left = { type: "bin", op: op.v === "-" ? "-" : "+", left, right };
    }
    return left;
  }

  function startsAtom(): boolean {
    const t = peek();
    if (t.k === "num" || t.k === "lp") return true;
    return t.k === "op" && t.v === "√";
  }

  function parseTerm(): Expr {
    let left = parseSummand();
    while (true) {
      if (opIs("*") || opIs("÷")) {
        const tok = consume();
        const op = tok.k === "op" && tok.v === "÷" ? "÷" : "*";
        left = { type: "bin", op, left, right: parseSummand() };
        continue;
      }
      if (startsAtom()) {
        left = { type: "bin", op: "*", left, right: parseSummand() };
        continue;
      }
      break;
    }
    return left;
  }

  function parseSummand(): Expr {
    const t = peek();
    if (t.k === "op" && t.v === "-") {
      consume();
      return { type: "neg", expr: parseSummand() };
    }
    if (t.k === "op" && t.v === "+") {
      consume();
      return parseSummand();
    }
    return parseFrac();
  }

  function parseFrac(): Expr {
    const first = parseFracAtom();
    if (!opIs("/")) return first;
    const parts: Expr[] = [first];
    while (takeOp("/")) parts.push(parseFracAtom());
    if (parts.length === 4 && parts.every((p) => p.type === "num")) {
      const [a, b, c, d] = parts;
      return {
        type: "bin",
        op: "÷",
        paired: true,
        left: { type: "bin", op: "/", left: a!, right: b! },
        right: { type: "bin", op: "/", left: c!, right: d! },
      };
    }
    let left = parts[0]!;
    for (let k = 1; k < parts.length; k += 1) {
      left = { type: "bin", op: "/", left, right: parts[k]! };
    }
    return left;
  }

  function parseFracAtom(): Expr {
    const t = peek();
    if (t.k === "op" && t.v === "-") {
      consume();
      return { type: "neg", expr: parseFracAtom() };
    }
    if (t.k === "op" && t.v === "+") {
      consume();
      return parseFracAtom();
    }
    if (t.k === "op" && t.v === "√") {
      consume();
      return { type: "sqrt", expr: parseFracAtom() };
    }
    return parsePowBody();
  }

  function parsePowBody(): Expr {
    const base = parsePostfix();
    if (takeOp("^")) return { type: "pow", base, exp: parseFracAtom() };
    return base;
  }

  function parsePostfix(): Expr {
    let e = parsePrimary();
    while (takeOp("%")) e = { type: "pct", expr: e };
    return e;
  }

  function parseMixedPart(): Expr {
    if (peek().k === "lp") return parsePrimary();
    if (peek().k !== "num") throw new CalcError("又 後面要接分數，例如 2又1/3");
    const numTok = consume();
    if (numTok.k !== "num") throw new CalcError("又 後面要接分數，例如 2又1/3");
    const num: Expr = { type: "num", raw: numTok.v, frac: decimalToFrac(numTok.v) };
    if (takeOp("/")) {
      if (peek().k !== "num") throw new CalcError("分數的分母要是數字");
      const denTok = consume();
      if (denTok.k !== "num") throw new CalcError("分數的分母要是數字");
      const den: Expr = { type: "num", raw: denTok.v, frac: decimalToFrac(denTok.v) };
      return { type: "bin", op: "/", left: num, right: den };
    }
    return num;
  }

  function parsePrimary(): Expr {
    const t = peek();
    if (t.k === "num") {
      consume();
      const num: Expr = { type: "num", raw: t.v, frac: decimalToFrac(t.v) };
      if (takeOp("又")) return { type: "mixed", whole: num, part: parseMixedPart() };
      return num;
    }
    if (t.k === "lp") {
      consume();
      const inner = parseExpression();
      if (peek().k !== "rp") throw new CalcError("少了右括號 )");
      consume();
      return { type: "group", expr: inner };
    }
    if (t.k === "end") throw new CalcError("算式還沒寫完");
    const label = t.k === "op" ? t.v : t.k === "rp" ? ")" : "";
    throw new CalcError(label ? `這裡不該出現「${label}」` : "算式還沒寫完");
  }

  const ast = parseExpression();
  if (peek().k !== "end") throw new CalcError("算式還沒寫完，或多了一個符號");
  return ast;
}

function precOf(e: Expr): number {
  switch (e.type) {
    case "bin":
      if (e.op === "+" || e.op === "-") return 1;
      if (e.op === "*" || e.op === "÷") return 2;
      return 3;
    case "neg":
    case "sqrt":
      return 4;
    case "pow":
      return 5;
    case "pct":
      return 6;
    default:
      return 7;
  }
}

function wrap(e: Expr, minPrec: number, side: "l" | "r"): Piece[] {
  const p = precOf(e);
  if (p < minPrec || (side === "r" && p === minPrec && e.type === "bin")) {
    return [T("("), ...pretty(e), T(")")];
  }
  return pretty(e);
}

function slot(e: Expr): Piece[] {
  if (e.type === "group") return pretty(e.expr);
  return pretty(e);
}

function simpleSup(e: Expr): string | null {
  if (e.type === "num" && !e.raw.includes(".")) return e.raw;
  if (e.type === "neg" && e.expr.type === "num" && !e.expr.raw.includes(".")) return `−${e.expr.raw}`;
  return null;
}

export function pretty(e: Expr): Piece[] {
  switch (e.type) {
    case "num":
      return [T(e.raw)];
    case "group":
      return [T("("), ...pretty(e.expr), T(")")];
    case "neg":
      return [T("−"), ...wrap(e.expr, 4, "r")];
    case "sqrt": {
      const inner = e.expr;
      if (inner.type === "num" || (inner.type === "bin" && inner.op === "/")) {
        return [T("√"), ...pretty(inner)];
      }
      if (inner.type === "group" && inner.expr.type === "bin" && inner.expr.op === "/") {
        return [T("√"), ...pretty(inner.expr)];
      }
      if (inner.type === "group") return [T("√("), ...pretty(inner.expr), T(")")];
      return [T("√("), ...pretty(inner), T(")")];
    }
    case "pct":
      return [...wrap(e.expr, 6, "l"), T("%")];
    case "pow": {
      const sup = simpleSup(e.exp);
      const base = wrap(e.base, 5, "l");
      if (sup !== null) return [...base, { k: "sup", v: sup }];
      return [...base, T("^("), ...pretty(e.exp), T(")")];
    }
    case "mixed":
      return [...pretty(e.whole), T("又"), ...pretty(e.part)];
    case "bin":
      if (e.op === "/") return [{ k: "f", num: slot(e.left), den: slot(e.right) }];
      {
        const sym = e.op === "+" ? " + " : e.op === "-" ? " − " : e.op === "*" ? " × " : " ÷ ";
        const p = precOf(e);
        return [...wrap(e.left, p, "l"), T(sym), ...wrap(e.right, p, "r")];
      }
    default:
      return [];
  }
}

type Ev = { value: Frac; steps: Step[] };

function finishReduce(steps: Step[], raw: Frac): Ev {
  const norm = normalize(raw.n, raw.d);
  const g = gcd(norm.n, norm.d);
  const value = { n: norm.n / g, d: norm.d / g };
  if (g > 1n) {
    steps.push({
      title: "約分",
      lines: [
        [T("最大公因數是 "), T(g.toString()), T("，分子分母一起除")],
        [...F(norm, "bar"), T(" = "), ...F(value, "auto")],
      ],
    });
  }
  return { value, steps };
}

function addSub(a: Frac, b: Frac, op: "+" | "-"): Ev {
  const A = simplify(a);
  const B = simplify(b);
  const sym = op === "+" ? " + " : " − ";
  if (A.d === 1n && B.d === 1n) {
    const n = op === "+" ? A.n + B.n : A.n - B.n;
    return {
      value: { n, d: 1n },
      steps: [
        {
          title: op === "+" ? "整數相加" : "整數相減",
          lines: [[T(fmtInt(A.n)), T(sym), T(fmtInt(B.n)), T(" = "), T(fmtInt(n))]],
        },
      ],
    };
  }
  const m = lcm(A.d, B.d);
  const a2 = { n: A.n * (m / A.d), d: m };
  const b2 = { n: B.n * (m / B.d), d: m };
  const raw = normalize(op === "+" ? a2.n + b2.n : a2.n - b2.n, m);
  const steps: Step[] = [];
  if (A.d !== B.d) {
    const lines: Piece[][] = [
      [
        T("分母 "),
        T(A.d.toString()),
        T(" 和 "),
        T(B.d.toString()),
        T(" 的最小公倍數是 "),
        T(m.toString()),
      ],
    ];
    if (A.d !== m) lines.push([...F(A, "auto"), T(" = "), ...F(a2, "bar")]);
    if (B.d !== m) lines.push([...F(B, "auto"), T(" = "), ...F(b2, "bar")]);
    steps.push({ title: "通分", lines });
  }
  steps.push({
    title: A.d === B.d ? (op === "+" ? "分母相同，分子相加" : "分母相同，分子相減") : op === "+" ? "分子相加" : "分子相減",
    lines: [[...F(a2, "bar"), T(sym), ...FP(b2, "bar"), T(" = "), ...F(raw, "bar")]],
  });
  return finishReduce(steps, raw);
}

function multiply(a: Frac, b: Frac): Ev {
  const A = simplify(a);
  const B = simplify(b);
  if (A.d === 1n && B.d === 1n) {
    const n = A.n * B.n;
    return {
      value: { n, d: 1n },
      steps: [
        {
          title: "整數相乘",
          lines: [[T(fmtInt(A.n)), T(" × "), T(fmtInt(B.n)), T(" = "), T(fmtInt(n))]],
        },
      ],
    };
  }
  if (A.d === 1n || B.d === 1n) {
    const raw = normalize(A.n * B.n, A.d * B.d);
    return finishReduce(
      [
        {
          title: "整數乘分數，乘到分子上",
          lines: [[...F(A, "auto"), T(" × "), ...FP(B, "auto"), T(" = "), ...F(raw, "bar")]],
        },
      ],
      raw,
    );
  }
  let an = A.n;
  let ad = A.d;
  let bn = B.n;
  let bd = B.d;
  const g1 = gcd(an, bd);
  const g2 = gcd(bn, ad);
  const steps: Step[] = [];
  if (g1 > 1n || g2 > 1n) {
    const an2 = an / g1;
    const bd2 = bd / g1;
    const bn2 = bn / g2;
    const ad2 = ad / g2;
    const note: Piece[] = [T("公因數 ")];
    if (g1 > 1n) note.push(T(g1.toString()));
    if (g1 > 1n && g2 > 1n) note.push(T("、"));
    if (g2 > 1n) note.push(T(g2.toString()));
    note.push(T(" 先約掉"));
    steps.push({
      title: "交叉約分",
      lines: [
        [...F(A, "auto"), T(" × "), ...FP(B, "auto")],
        note,
        [...F({ n: an2, d: ad2 }, "bar"), T(" × "), ...FP({ n: bn2, d: bd2 }, "bar")],
      ],
    });
    an = an2;
    ad = ad2;
    bn = bn2;
    bd = bd2;
  }
  const raw = normalize(an * bn, ad * bd);
  steps.push({
    title: "分子分母各自相乘",
    lines: [
      [
        ...F({ n: an, d: ad }, "bar"),
        T(" × "),
        ...FP({ n: bn, d: bd }, "bar"),
        T(" = "),
        ...F(raw, "bar"),
      ],
    ],
  });
  return finishReduce(steps, raw);
}

function divide(a: Frac, b: Frac, op: "/" | "÷"): Ev {
  const A = simplify(a);
  const B = simplify(b);
  if (B.n === 0n) throw new CalcError("除數不能是 0");
  if (A.d === 1n && B.d === 1n) {
    const raw = normalize(A.n, B.n);
    const value = simplify(raw);
    const changed = value.n !== raw.n || value.d !== raw.d;
    if (!changed && op === "/") return { value, steps: [] };
    const sym = op === "/" ? " / " : " ÷ ";
    return finishReduce(
      [
        {
          title: "整數相除，寫成分數",
          lines: [[T(fmtInt(A.n)), T(sym), T(fmtInt(B.n)), T(" = "), ...F(raw, "bar")]],
        },
      ],
      raw,
    );
  }
  const recip = simplify(normalize(B.d, B.n));
  const intro: Step = {
    title: "除法改成乘上倒數",
    lines: [[...F(A, "auto"), T(" ÷ "), ...FP(B, "auto"), T(" = "), ...F(A, "auto"), T(" × "), ...FP(recip, "auto")]],
  };
  const prod = multiply(A, recip);
  return { value: prod.value, steps: [intro, ...prod.steps] };
}

function power(base: Frac, exp: Frac): Ev {
  const B = simplify(base);
  const E = simplify(exp);
  if (E.d !== 1n) throw new CalcError("次方只支援整數，例如 (3/2)^2");
  const e = E.n;
  if (e > 100n || e < -100n) throw new CalcError("次方請介在 −100 到 100");
  if (e === 0n) {
    if (B.n === 0n) throw new CalcError("0 的 0 次方沒有定義");
    return {
      value: { n: 1n, d: 1n },
      steps: [{ title: "0 次方", lines: [[...F(B, "auto"), T(" 的 0 次方是 1")]] }],
    };
  }
  const steps: Step[] = [];
  let target = B;
  let p = e;
  if (e < 0n) {
    if (B.n === 0n) throw new CalcError("0 不能取負次方");
    const inv = simplify(normalize(B.d, B.n));
    steps.push({
      title: "負次方是倒數",
      lines: [[...F(B, "auto"), { k: "sup", v: fmtInt(e) }, T(" = "), ...F(inv, "auto"), { k: "sup", v: (-e).toString() }]],
    });
    target = inv;
    p = -e;
  }
  if (p === 1n) {
    if (steps.length === 0) {
      return {
        value: target,
        steps: [{ title: "1 次方", lines: [[...F(target, "auto"), T(" 的 1 次方還是自己")]] }],
      };
    }
    return { value: target, steps };
  }
  const raw = normalize(target.n ** p, target.d ** p);
  steps.push({
    title: "乘開次方",
    lines: [[...F(target, "auto"), { k: "sup", v: p.toString() }, T(" = "), ...F(raw, "bar")]],
  });
  return finishReduce(steps, raw);
}

function squareRoot(v: Frac): Ev {
  const A = simplify(v);
  if (A.n < 0n) throw new CalcError("負數不能開平方根");
  const sn = isqrt(A.n);
  const sd = isqrt(A.d);
  if (sn === null || sd === null) {
    throw new CalcError("這個平方根開不盡，沒辦法寫成準確分數。試試 √(9/4)");
  }
  const value = simplify({ n: sn, d: sd });
  return {
    value,
    steps: [{ title: "開平方", lines: [[T("√"), ...F(A, "auto"), T(" = "), ...F(value, "auto")]] }],
  };
}

function percent(v: Frac): Ev {
  const A = simplify(v);
  const raw = normalize(A.n, A.d * 100n);
  return finishReduce(
    [
      {
        title: "百分號就是除以 100",
        lines: [[...F(A, "auto"), T("% = "), ...F(raw, "bar")]],
      },
    ],
    raw,
  );
}

function negate(v: Frac): Ev {
  const A = simplify(v);
  const value = simplify({ n: -A.n, d: A.d });
  return {
    value,
    steps: [
      {
        title: A.n < 0n ? "負負得正" : "加上負號",
        lines: [[T("−("), ...F(A, "auto"), T(") = "), ...F(value, "auto")]],
      },
    ],
  };
}

function evalNum(e: Extract<Expr, { type: "num" }>): Ev {
  const value = simplify(e.frac);
  if (!e.raw.includes(".")) return { value, steps: [] };
  const places = e.raw.split(".")[1]?.length ?? 0;
  if (places === 0) return { value, steps: [] };
  const shown = normalize(e.frac.n, e.frac.d);
  const steps: Step[] = [
    {
      title: "小數化成分數",
      lines: [
        [
          T(e.raw),
          T(" 小數點後有 "),
          T(String(places)),
          T(places === 1 ? " 位，分母是 10" : ` 位，分母是 1 後面 ${places} 個 0`),
        ],
        [T(e.raw), T(" = "), ...F(shown, "bar")],
      ],
    },
  ];
  return finishReduce(steps, shown);
}

function evalMixed(e: Extract<Expr, { type: "mixed" }>, whole: Ev, part: Ev): Ev {
  if (whole.value.d !== 1n) throw new CalcError("又 的前面要是整數");
  if (whole.value.n < 0n) throw new CalcError("負的帶分數請把負號寫在最前面，例如 −2又1/3");
  const w = whole.value.n;
  const p = simplify(part.value);
  if (p.n < 0n) throw new CalcError("又 後面請用正的分數");
  const asFrac = { n: w * p.d, d: p.d };
  const raw = normalize(asFrac.n + p.n, p.d);
  const steps: Step[] = [
    ...whole.steps,
    ...part.steps,
    {
      title: "帶分數化成假分數",
      lines: [
        [T(w.toString()), T("又"), ...F(p, "auto"), T(" = "), T(w.toString()), T(" + "), ...F(p, "auto")],
        [...F(asFrac, "bar"), T(" + "), ...F(p, "bar"), T(" = "), ...F(raw, "bar")],
      ],
    },
  ];
  return finishReduce(steps, raw);
}

function evaluate(e: Expr): Ev {
  switch (e.type) {
    case "num":
      return evalNum(e);
    case "group": {
      const inner = evaluate(e.expr);
      if (inner.steps.length === 0) return inner;
      return {
        value: inner.value,
        steps: [{ title: "先算括號", lines: [pretty(e.expr)] }, ...inner.steps],
      };
    }
    case "neg": {
      const inner = evaluate(e.expr);
      const n = negate(inner.value);
      return { value: n.value, steps: [...inner.steps, ...n.steps] };
    }
    case "pct": {
      const inner = evaluate(e.expr);
      const n = percent(inner.value);
      return { value: n.value, steps: [...inner.steps, ...n.steps] };
    }
    case "sqrt": {
      const inner = evaluate(e.expr);
      const n = squareRoot(inner.value);
      return { value: n.value, steps: [...inner.steps, ...n.steps] };
    }
    case "pow": {
      const base = evaluate(e.base);
      const exp = evaluate(e.exp);
      const n = power(base.value, exp.value);
      return { value: n.value, steps: [...base.steps, ...exp.steps, ...n.steps] };
    }
    case "mixed": {
      const whole = evaluate(e.whole);
      const part = evaluate(e.part);
      return evalMixed(e, whole, part);
    }
    case "bin": {
      const left = evaluate(e.left);
      const right = evaluate(e.right);
      const pre: Step[] = e.paired
        ? [
            {
              title: "連寫的四段分數",
              lines: [[T("四個數字用斜線連寫，先切成兩個分數，再相除")], pretty(e)],
            },
          ]
        : [];
      const op =
        e.op === "+"
          ? addSub(left.value, right.value, "+")
          : e.op === "-"
            ? addSub(left.value, right.value, "-")
            : e.op === "*"
              ? multiply(left.value, right.value)
              : divide(left.value, right.value, e.op === "÷" ? "÷" : "/");
      return { value: op.value, steps: [...pre, ...left.steps, ...right.steps, ...op.steps] };
    }
    default:
      throw new CalcError("沒辦法計算這個式子");
  }
}

function decimalLine(info: DecimalInfo): Piece[] {
  if (!info.nonRepeat && !info.repeat) {
    return [T("小數正好是 "), { k: "dec", info }];
  }
  if (info.repeat) return [T("小數會循環，橫線是循環節 "), { k: "dec", info }];
  if (info.truncated) return [T("小數很長，先寫到這裡 "), { k: "dec", info }];
  return [T("小數正好是 "), { k: "dec", info }];
}

export function solve(input: string): Solution {
  const ast = parse(input);
  const ev = evaluate(ast);
  const result = simplify(ev.value);
  const decimal = toDecimal(result);
  const mixed = toMixed(result);
  const view = pretty(ast);
  const lines: Piece[][] = [[T("最簡分數是 "), ...F(result, "auto")]];
  if (mixed) {
    lines.push([
      T("帶分數是 "),
      T(mixed.neg ? "−" : ""),
      T(mixed.whole),
      T("又"),
      { k: "f", num: [T(mixed.n)], den: [T(mixed.d)] },
    ]);
  }
  lines.push(decimalLine(decimal));
  const steps: Step[] = [{ title: "原式", lines: [view] }, ...ev.steps, { title: "結果", lines }];
  return {
    input,
    steps,
    result,
    decimal,
    mixed,
    linear: linear(result),
    pretty: view,
  };
}

export function tryPretty(input: string): Piece[] | null {
  try {
    return pretty(parse(input));
  } catch {
    return null;
  }
}
