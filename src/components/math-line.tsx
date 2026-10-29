import type { DecimalInfo, Piece } from "@/lib/math/solve";

type Size = "sm" | "md" | "lg";

const textSize: Record<Size, string> = {
  sm: "text-base",
  md: "text-xl",
  lg: "text-4xl",
};

function smaller(size: Size): Size {
  return size === "lg" ? "md" : "sm";
}

export function DecimalText({ info, className = "" }: { info: DecimalInfo; className?: string }) {
  const tail = info.truncated ? "…" : "";
  return (
    <span className={`font-serif tabular-nums ${className}`}>
      {info.sign}
      {info.int}
      {(info.nonRepeat || info.repeat || info.truncated) && "."}
      {info.nonRepeat}
      {info.repeat ? <span className="overline">{info.repeat}</span> : null}
      {tail}
    </span>
  );
}

function Fraction({
  num,
  den,
  size,
}: {
  num: Piece[];
  den: Piece[];
  size: Size;
}) {
  const bar = size === "lg" ? "h-0.5" : "h-px";
  return (
    <span className="mx-0.5 inline-grid justify-items-center align-middle leading-none" role="img">
      <MathPieces pieces={num} size={size} />
      <span className={`${bar} col-span-1 w-full bg-fg`} aria-hidden />
      <MathPieces pieces={den} size={size} />
    </span>
  );
}

function PieceView({ piece, size }: { piece: Piece; size: Size }) {
  if (piece.k === "t") return <span className="font-serif">{piece.v}</span>;
  if (piece.k === "sup") return <span className="math-sup font-serif">{piece.v}</span>;
  if (piece.k === "dec") return <DecimalText info={piece.info} />;
  if (piece.k === "f") return <Fraction num={piece.num} den={piece.den} size={smaller(size)} />;
  return null;
}

export function MathPieces({ pieces, size = "md" }: { pieces: Piece[]; size?: Size }) {
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-1 ${textSize[size]}`}>
      {pieces.map((piece, index) => (
        <PieceView key={index} piece={piece} size={size} />
      ))}
    </span>
  );
}

export function MathLine({ pieces, size = "md" }: { pieces: Piece[]; size?: Size }) {
  return (
    <p className="flex flex-wrap items-center gap-x-1 gap-y-2">
      <MathPieces pieces={pieces} size={size} />
    </p>
  );
}
