import { useEffect, useMemo, useRef, useState } from "react";
import { History } from "lucide-react";
import { DecimalText, MathLine } from "@/components/math-line";
import { solveCalculus, tryPrettyCalc, type CalcOp, type CalculusSolution } from "@/lib/math/calculus";
import { CalcError, solve, tryPretty, type Solution } from "@/lib/math/solve";

const STARTER = "1/2 + 1/3";
const CALC_STARTER = "x^3 + 2x";
const HISTORY_KEY = "xisuan.history.v2";

const FRAC_EXAMPLES = ["1/2 + 1/3", "2/3÷4/5", "2/3/4/5", "2又1/3", "0.1 + 0.2", "(1/2)^3", "50% + 1/4", "√(9/4)"];
const CALC_EXAMPLES = ["x^3 + 2x", "sin(2x)", "x sin x", "e^x", "ln x", "1/(1+x^2)", "(2x+1)^3"];

const CALC_CHIPS: { label: string; insert: string }[] = [
  { label: "x", insert: "x" },
  { label: "π", insert: "π" },
  { label: "eˣ", insert: "e^(" },
  { label: "sin", insert: "sin(" },
  { label: "cos", insert: "cos(" },
  { label: "tan", insert: "tan(" },
  { label: "ln", insert: "ln(" },
  { label: "√", insert: "√(" },
  { label: "arctan", insert: "arctan(" },
];

type Mode = "frac" | "calc";
type HistItem = { expr: string; linear: string; at: number; mode?: Mode; op?: CalcOp };

type Key =
  | { label: string; insert: string; tone: "num" | "op" | "util" }
  | { label: string; action: "clear" | "back"; tone: "util" }
  | { label: string; action: "eq"; tone: "eq" };

const KEYS: Key[][] = [
  [
    { label: "C", action: "clear", tone: "util" },
    { label: "(", insert: "(", tone: "util" },
    { label: ")", insert: ")", tone: "util" },
    { label: "⌫", action: "back", tone: "util" },
  ],
  [
    { label: "7", insert: "7", tone: "num" },
    { label: "8", insert: "8", tone: "num" },
    { label: "9", insert: "9", tone: "num" },
    { label: "÷", insert: "÷", tone: "op" },
  ],
  [
    { label: "4", insert: "4", tone: "num" },
    { label: "5", insert: "5", tone: "num" },
    { label: "6", insert: "6", tone: "num" },
    { label: "×", insert: "×", tone: "op" },
  ],
  [
    { label: "1", insert: "1", tone: "num" },
    { label: "2", insert: "2", tone: "num" },
    { label: "3", insert: "3", tone: "num" },
    { label: "−", insert: "-", tone: "op" },
  ],
  [
    { label: "0", insert: "0", tone: "num" },
    { label: ".", insert: ".", tone: "num" },
    { label: "/", insert: "/", tone: "num" },
    { label: "+", insert: "+", tone: "op" },
  ],
  [
    { label: "又", insert: "又", tone: "util" },
    { label: "√", insert: "√", tone: "util" },
    { label: "%", insert: "%", tone: "util" },
    { label: "=", action: "eq", tone: "eq" },
  ],
];

const CALC_KEYS: Key[][] = [
  [
    { label: "C", action: "clear", tone: "util" },
    { label: "(", insert: "(", tone: "util" },
    { label: ")", insert: ")", tone: "util" },
    { label: "⌫", action: "back", tone: "util" },
  ],
  [
    { label: "7", insert: "7", tone: "num" },
    { label: "8", insert: "8", tone: "num" },
    { label: "9", insert: "9", tone: "num" },
    { label: "÷", insert: "÷", tone: "op" },
  ],
  [
    { label: "4", insert: "4", tone: "num" },
    { label: "5", insert: "5", tone: "num" },
    { label: "6", insert: "6", tone: "num" },
    { label: "×", insert: "×", tone: "op" },
  ],
  [
    { label: "1", insert: "1", tone: "num" },
    { label: "2", insert: "2", tone: "num" },
    { label: "3", insert: "3", tone: "num" },
    { label: "−", insert: "-", tone: "op" },
  ],
  [
    { label: "0", insert: "0", tone: "num" },
    { label: ".", insert: ".", tone: "num" },
    { label: "^", insert: "^", tone: "num" },
    { label: "+", insert: "+", tone: "op" },
  ],
];

const toneClass: Record<Key["tone"], string> = {
  num: "bg-key text-fg border-line",
  util: "bg-key text-muted border-line",
  op: "bg-fg text-surface border-fg",
  eq: "bg-accent text-accent-fg border-accent",
};

function readHistory(): HistItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter(
      (item): item is HistItem =>
        !!item &&
        typeof item === "object" &&
        typeof (item as HistItem).expr === "string" &&
        typeof (item as HistItem).linear === "string",
    );
  } catch {
    return [];
  }
}

export function Calculator() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>("calc");
  const [op, setOp] = useState<CalcOp>("diff");
  const [value, setValue] = useState(CALC_STARTER);
  const [caret, setCaret] = useState(CALC_STARTER.length);
  const [selEnd, setSelEnd] = useState(CALC_STARTER.length);
  const [solved, setSolved] = useState<Solution | null>(null);
  const [calcSolved, setCalcSolved] = useState<CalculusSolution | null>(() => {
    try {
      return solveCalculus(CALC_STARTER, "diff");
    } catch {
      return null;
    }
  });
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistItem[]>([]);
  const [histOpen, setHistOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const preview = useMemo(() => (mode === "calc" ? tryPrettyCalc(value) : tryPretty(value)), [mode, value]);
  const showing = mode === "frac" && solved && solved.input === value ? solved : null;
  const showingCalc = mode === "calc" && calcSolved && calcSolved.input === value && calcSolved.op === op ? calcSolved : null;
  const steps = showingCalc?.steps ?? showing?.steps ?? null;
  const examples = mode === "calc" ? CALC_EXAMPLES : FRAC_EXAMPLES;
  const keys = mode === "calc" ? CALC_KEYS : KEYS;

  useEffect(() => {
    setHistory(readHistory());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }, [history, hydrated]);

  function range(): [number, number] {
    const el = inputRef.current;
    if (el && document.activeElement === el && el.selectionStart !== null && el.selectionEnd !== null) {
      return [el.selectionStart, el.selectionEnd];
    }
    return [Math.min(caret, selEnd), Math.max(caret, selEnd)];
  }

  function syncCaret(el: HTMLInputElement) {
    setCaret(el.selectionStart ?? value.length);
    setSelEnd(el.selectionEnd ?? value.length);
  }

  function remember(next: string, pos: number) {
    setValue(next);
    setCaret(pos);
    setSelEnd(pos);
    setError(null);
    setCopied(false);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el || document.activeElement !== el) return;
      el.setSelectionRange(pos, pos);
    });
  }

  function insert(text: string) {
    const [start, end] = range();
    const next = value.slice(0, start) + text + value.slice(end);
    remember(next, start + text.length);
  }

  function backspace() {
    const [start, end] = range();
    if (start !== end) {
      remember(value.slice(0, start) + value.slice(end), start);
      return;
    }
    if (start === 0) return;
    remember(value.slice(0, start - 1) + value.slice(end), start - 1);
  }

  function clearAll() {
    remember("", 0);
  }

  function pushHistory(expr: string, linear: string, itemMode: Mode, itemOp?: CalcOp) {
    setHistory((prev) =>
      [{ expr, linear, at: Date.now(), mode: itemMode, op: itemOp }, ...prev.filter((item) => item.expr !== expr || item.mode !== itemMode || item.op !== itemOp)].slice(0, 12),
    );
  }

  function calculateFrac(expr: string) {
    try {
      const next = solve(expr);
      setSolved(next);
      setError(null);
      setCopied(false);
      pushHistory(next.input, next.linear, "frac");
    } catch (err) {
      if (/[a-zπ∫]/i.test(expr)) {
        setError("這是微積分的式子，先點上面的「微積分」。");
        return;
      }
      setError(err instanceof CalcError ? err.message : "沒辦法計算這個式子");
    }
  }

  function calculateCalc(expr: string, nextOp = op) {
    try {
      const next = solveCalculus(expr, nextOp);
      setOp(nextOp);
      setCalcSolved(next);
      setError(null);
      setCopied(false);
      pushHistory(next.input, next.linear, "calc", nextOp);
    } catch (err) {
      setError(err instanceof CalcError ? err.message : "沒辦法計算這個式子");
    }
  }

  function calculate(expr = value) {
    if (mode === "calc") calculateCalc(expr, op);
    else calculateFrac(expr);
  }

  function loadExpr(expr: string, itemMode: Mode = mode, itemOp: CalcOp = op) {
    setMode(itemMode);
    setOp(itemOp);
    setValue(expr);
    setCaret(expr.length);
    setSelEnd(expr.length);
    setHistOpen(false);
    setError(null);
    if (itemMode === "calc") calculateCalc(expr, itemOp);
    else calculateFrac(expr);
  }

  function switchMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
    setError(null);
    setCopied(false);
    if (next === "calc" && (value === STARTER || value.trim() === "")) {
      loadExpr(CALC_STARTER, "calc", "diff");
      return;
    }
    if (next === "frac" && (value === CALC_STARTER || value.trim() === "")) {
      loadExpr(STARTER, "frac");
    }
  }

  async function copyAnswer() {
    const linear = showingCalc?.linear ?? showing?.linear;
    if (!linear) return;
    try {
      await navigator.clipboard.writeText(linear);
      setCopied(true);
    } catch {
      setError("沒辦法複製，答案是 " + linear);
    }
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-surface text-fg">
      <div className="w-1 shrink-0 bg-accent" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col lg:flex-row">
        <form
          className="contents lg:flex lg:h-dvh lg:w-96 lg:shrink-0 lg:flex-col lg:border-r lg:border-line"
          onSubmit={(event) => {
            event.preventDefault();
            if (mode === "calc") calculateCalc(value, "diff");
            else calculate();
          }}
        >
          <header className="order-1 px-4 pt-4 pb-2 lg:px-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h1 className="font-serif text-3xl leading-none">析算</h1>
                <p className="mt-1 text-sm text-muted">
                  {mode === "calc" ? "對 x 微分或積分，按下去看過程" : "分數計算機，按等於看過程"}
                </p>
              </div>
              <button
                type="button"
                aria-label="最近算過"
                aria-pressed={histOpen}
                onClick={() => setHistOpen((open) => !open)}
                className="flex size-11 items-center justify-center rounded-full border border-line bg-key text-fg"
              >
                <History className="size-5" aria-hidden />
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 rounded-full border border-line bg-key p-1">
              <button
                type="button"
                aria-pressed={mode === "frac"}
                onClick={() => switchMode("frac")}
                className={`h-11 rounded-full ${mode === "frac" ? "bg-fg text-surface" : "text-muted"}`}
              >
                分數
              </button>
              <button
                type="button"
                aria-pressed={mode === "calc"}
                onClick={() => switchMode("calc")}
                className={`h-11 rounded-full ${mode === "calc" ? "bg-fg text-surface" : "text-muted"}`}
              >
                微積分
              </button>
            </div>
          </header>

          <div className="order-2 min-w-0 px-4 lg:px-5">
            <label className="block text-sm text-muted" htmlFor="expr">
              算式
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                id="expr"
                ref={inputRef}
                value={value}
                placeholder={mode === "calc" ? "例如 x^3 + 2x" : "例如 1/2 + 1/3"}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="done"
                onChange={(event) => {
                  setValue(event.target.value);
                  syncCaret(event.target);
                  setError(null);
                  setCopied(false);
                }}
                onSelect={(event) => syncCaret(event.currentTarget)}
                className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-key px-3 font-serif text-xl tabular-nums text-fg outline-none"
              />
              <button
                type="submit"
                className="h-12 shrink-0 rounded-xl bg-accent px-4 font-medium text-accent-fg"
              >
                {mode === "calc" ? "微分" : "計算"}
              </button>
            </div>
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
              {examples.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => loadExpr(example)}
                  className="min-h-11 shrink-0 rounded-full border border-line bg-key px-3 font-serif text-sm text-fg"
                >
                  {example}
                </button>
              ))}
            </div>
            {error ? (
              <p role="alert" className="pb-2 text-sm text-accent">
                {error}
              </p>
            ) : null}
          </div>

          <div className="order-3 min-w-0 px-4 py-3 lg:px-5" aria-live="polite">
            {showingCalc ? (
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-muted">{showingCalc.headline}</p>
                  <div className="mt-1 overflow-x-auto">
                    <MathLine pieces={showingCalc.answer} size={showingCalc.linear.length > 24 ? "md" : "lg"} />
                  </div>
                </div>
                <button type="button" onClick={copyAnswer} className="shrink-0 text-sm text-accent">
                  {copied ? "已複製" : "複製答案"}
                </button>
              </div>
            ) : showing ? (
              <div className="flex items-end justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-muted">最簡分數</p>
                  <div className="mt-1 overflow-x-auto">
                    {showing.result.d === 1n ? (
                      <p className="font-serif text-4xl tabular-nums">
                        {showing.result.n < 0n ? "−" : ""}
                        {(showing.result.n < 0n ? -showing.result.n : showing.result.n).toString()}
                      </p>
                    ) : (
                      <div className="flex items-center font-serif text-4xl">
                        {showing.result.n < 0n ? <span className="mr-1">−</span> : null}
                        <span className="inline-grid justify-items-center leading-none">
                          <span className="px-2">{(showing.result.n < 0n ? -showing.result.n : showing.result.n).toString()}</span>
                          <span className="h-0.5 w-full bg-fg" />
                          <span className="px-2">{showing.result.d.toString()}</span>
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  {showing.mixed ? (
                    <p className="font-serif text-lg">
                      <span className="mr-1 text-sm text-muted">帶分數</span>
                      {showing.mixed.neg ? "−" : ""}
                      {showing.mixed.whole}又
                      <span className="inline-grid justify-items-center align-middle text-base leading-none">
                        <span className="px-1">{showing.mixed.n}</span>
                        <span className="h-px w-full bg-fg" />
                        <span className="px-1">{showing.mixed.d}</span>
                      </span>
                    </p>
                  ) : null}
                  <p className="text-lg">
                    <DecimalText info={showing.decimal} />
                  </p>
                  <button type="button" onClick={copyAnswer} className="mt-1 text-sm text-accent">
                    {copied ? "已複製" : "複製答案"}
                  </button>
                </div>
              </div>
            ) : preview ? (
              <div>
                <p className="text-sm text-muted">{mode === "calc" ? "式子" : "分數寫法"}</p>
                <div className="mt-1 overflow-x-auto">
                  <MathLine pieces={preview} size="lg" />
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted">
                {mode === "calc" ? "輸入含 x 的式子，按微分或積分。" : "輸入算式後，按等於或計算，過程會寫在下面。"}
              </p>
            )}
          </div>

          <div className="pad-safe order-5 min-w-0 px-4 pt-1 lg:px-5">
            {mode === "calc" ? (
              <div className="mb-2 flex gap-2 overflow-x-auto">
                {CALC_CHIPS.map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={() => insert(chip.insert)}
                    className="min-h-11 shrink-0 rounded-full border border-line bg-key px-3 font-serif text-sm text-fg"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="grid grid-cols-4 gap-2">
              {keys.flat().map((key) => {
                const name = "insert" in key ? key.insert : key.action;
                return (
                  <button
                    key={key.label + name}
                    type={"action" in key && key.action === "eq" ? "submit" : "button"}
                    aria-label={key.label === "⌫" ? "退格" : key.label === "C" ? "清除" : key.label}
                    onClick={() => {
                      if ("action" in key) {
                        if (key.action === "clear") clearAll();
                        if (key.action === "back") backspace();
                        return;
                      }
                      insert(key.insert);
                    }}
                    className={`h-12 rounded-xl border font-serif text-xl ${toneClass[key.tone]}`}
                  >
                    {key.label}
                  </button>
                );
              })}
              {mode === "calc" ? (
                <>
                  <button type="submit" className={`col-span-2 h-12 rounded-xl border font-serif text-lg ${toneClass.eq}`}>
                    微分
                  </button>
                  <button
                    type="button"
                    onClick={() => calculateCalc(value, "int")}
                    className="col-span-2 h-12 rounded-xl border border-fg bg-fg font-serif text-lg text-surface"
                  >
                    積分
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </form>

        <section className="order-4 min-h-0 flex-1 overflow-y-auto border-t border-line lg:order-none lg:h-dvh lg:border-t-0">
          {histOpen ? (
            <div className="border-b border-line px-4 py-3 lg:px-6">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm text-muted">最近算過</h2>
                {history.length > 0 ? (
                  <button type="button" onClick={() => setHistory([])} className="text-sm text-accent">
                    清除紀錄
                  </button>
                ) : null}
              </div>
              {history.length === 0 ? (
                <p className="text-sm text-pretty">還沒有紀錄。按過計算的式子會留在這台裝置上。</p>
              ) : (
                <ul>
                  {history.map((item) => (
                    <li key={`${item.at}-${item.expr}`} className="border-t border-line">
                      <button
                        type="button"
                        onClick={() => loadExpr(item.expr, item.mode ?? "frac", item.op ?? "diff")}
                        className="flex min-h-11 w-full items-center justify-between gap-3 py-2 text-left"
                      >
                        <span className="truncate font-serif">{item.expr}</span>
                        <span className="shrink-0 font-serif text-accent">{item.linear}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          <div className="px-4 py-3 lg:px-6">
            <h2 className="text-sm text-muted">解題過程</h2>
            {steps ? (
              <ol className="mt-2">
                {steps.map((step, index) => (
                  <li key={`${step.title}-${index}`} className="flex gap-3 border-b border-line py-3">
                    <span className="w-6 shrink-0 font-serif text-lg text-accent">{index + 1}</span>
                    <div className="min-w-0">
                      <p className="text-sm text-muted">{step.title}</p>
                      <div className="mt-1 space-y-1 overflow-x-auto">
                        {step.lines.map((line, lineIndex) => (
                          <MathLine key={lineIndex} pieces={line} size="sm" />
                        ))}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            ) : mode === "calc" ? (
              <p className="mt-3 max-w-md text-pretty text-base leading-relaxed">
                按「微分」或「積分」，這裡會寫出冪次、乘積、連鎖，或湊微分。
                <span className="mt-2 block text-sm text-muted">
                  變數用 x。可以寫 sin、cos、tan、ln、e^x、arctan。積分會加上 C，並把答案微分回去驗算。
                </span>
              </p>
            ) : (
              <p className="mt-3 max-w-md text-pretty text-base leading-relaxed">
                按 <span className="font-serif">＝</span> 或「計算」，這裡會一步一步寫出通分、約分和結果。
                <span className="mt-2 block text-sm text-muted">
                  / 是分數線，÷ 是除法。2/3/4/5 會先看成兩個分數再相除。帶分數寫 2又1/3。
                </span>
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
