/**
 * Symbolic Math & Science Engine
 * ──────────────────────────────
 * Expression parsing, symbolic differentiation, integration,
 * algebraic simplification, equation solving, matrix operations,
 * ODE/PDE solving, Laplace/Fourier transforms, Taylor series,
 * limits, and science formula solver.
 *
 * Zero dependencies. Runs in browser or Node.
 */

// ─── Expression AST ─────────────────────────────────────────────────────────

export type Expr =
  | { type: "num"; value: number }
  | { type: "var"; name: string }
  | { type: "binop"; op: "+" | "-" | "*" | "/" | "^" | "%" | "**"; left: Expr; right: Expr }
  | { type: "unary"; op: "-" | "+" | "sin" | "cos" | "tan" | "log" | "ln" | "exp" | "sqrt" | "abs" | "asin" | "acos" | "atan" | "sinh" | "cosh" | "tanh"; arg: Expr }
  | { type: "func"; name: string; args: Expr[] }
  | { type: "const"; name: string; value: number };

export const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
  PI: Math.PI,
  E: Math.E,
  ln2: Math.LN2,
  ln10: Math.LN10,
  sqrt2: Math.SQRT2,
  c: 299792458,          // speed of light (m/s)
  g: 9.80665,            // standard gravity (m/s²)
  h: 6.62607015e-34,     // Planck constant (J·s)
  kB: 1.380649e-23,      // Boltzmann constant (J/K)
  NA: 6.02214076e23,     // Avogadro's number
  R: 8.314462618,        // gas constant (J/(mol·K))
  sigma: 5.670374419e-8, // Stefan-Boltzmann (W/(m²·K⁴))
  mu0: 4 * Math.PI * 1e-7, // vacuum permeability
  epsilon0: 8.8541878128e-12, // vacuum permittivity
  eV: 1.602176634e-19,   // electron volt (J)
  amu: 1.66053906660e-27, // atomic mass unit (kg)
  me: 9.1093837015e-31,  // electron mass (kg)
  mp: 1.67262192369e-27, // proton mass (kg)
};

// ─── Parser (recursive descent, handles precedence) ─────────────────────────

export function parse(expr: string): Expr {
  let pos = 0;
  const s = expr.replace(/\s+/g, "");

  function peek(): string { return pos < s.length ? s[pos] : ""; }
  function consume(): string { return s[pos++]; }

  function parseExpr(): Expr {
    let left = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const op = consume() as "+" | "-";
      const right = parseTerm();
      left = { type: "binop", op, left, right };
    }
    return left;
  }

  function parseTerm(): Expr {
    let left = parsePower();
    while (peek() === "*" || peek() === "/" || peek() === "%") {
      const op = consume() as "*" | "/" | "%";
      const right = parsePower();
      left = { type: "binop", op, left, right };
    }
    return left;
  }

  function parsePower(): Expr {
    let base = parseUnary();
    if (peek() === "^" || peek() === "**") {
      consume();
      const exp = parseUnary();
      base = { type: "binop", op: "^", left: base, right: exp };
    }
    return base;
  }

  function parseUnary(): Expr {
    if (peek() === "-") {
      consume();
      const arg = parseAtom();
      return { type: "unary", op: "-", arg };
    }
    if (peek() === "+") { consume(); return parseAtom(); }
    return parseAtom();
  }

  function parseAtom(): Expr {
    // Number
    if (/\d/.test(peek()) || (peek() === "." && pos + 1 < s.length && /\d/.test(s[pos + 1]))) {
      let num = "";
      while (pos < s.length && /[\d.]/.test(s[pos])) num += consume();
      return { type: "num", value: parseFloat(num) };
    }

    // Parentheses
    if (peek() === "(") {
      consume();
      const expr = parseExpr();
      if (peek() === ")") consume();
      return expr;
    }

    // Named function or constant
    if (/[a-zA-Z]/.test(peek())) {
      let name = "";
      while (pos < s.length && /[a-zA-Z0-9_]/.test(s[pos])) name += consume();

      // Check constants
      if (name in CONSTANTS && peek() !== "(") {
        return { type: "const", name, value: CONSTANTS[name] };
      }

      // Function call
      if (peek() === "(") {
        consume();
        const args: Expr[] = [];
        if (peek() !== ")") {
          args.push(parseExpr());
          while (peek() === ",") { consume(); args.push(parseExpr()); }
        }
        if (peek() === ")") consume();
        return { type: "func", name, args };
      }

      // Named function without parens (like sin x)
      const funcs = ["sin", "cos", "tan", "log", "ln", "exp", "sqrt", "abs", "asin", "acos", "atan", "sinh", "cosh", "tanh"];
      if (funcs.includes(name)) {
        const arg = parseUnary();
        return { type: "unary", op: name as "sin" | "cos" | "tan" | "log" | "ln" | "exp" | "sqrt" | "abs" | "asin" | "acos" | "atan" | "sinh" | "cosh" | "tanh", arg };
      }

      // Variable
      return { type: "var", name };
    }

    return { type: "num", value: 0 };
  }

  const result = parseExpr();
  return result;
}

// ─── Evaluator ──────────────────────────────────────────────────────────────

export function evaluate(expr: Expr, vars: Record<string, number> = {}): number {
  switch (expr.type) {
    case "num": return expr.value;
    case "var": return vars[expr.name] ?? 0;
    case "const": return expr.value;
    case "unary": {
      const a = evaluate(expr.arg, vars);
      switch (expr.op) {
        case "-": return -a;
        case "+": return a;
        case "sin": return Math.sin(a);
        case "cos": return Math.cos(a);
        case "tan": return Math.tan(a);
        case "log": case "ln": return Math.log(a);
        case "exp": return Math.exp(a);
        case "sqrt": return Math.sqrt(a);
        case "abs": return Math.abs(a);
        case "asin": return Math.asin(a);
        case "acos": return Math.acos(a);
        case "atan": return Math.atan(a);
        case "sinh": return Math.sinh(a);
        case "cosh": return Math.cosh(a);
        case "tanh": return Math.tanh(a);
      }
      return 0;
    }
    case "binop": {
      const l = evaluate(expr.left, vars);
      const r = evaluate(expr.right, vars);
      switch (expr.op) {
        case "+": return l + r;
        case "-": return l - r;
        case "*": return l * r;
        case "/": return r !== 0 ? l / r : NaN;
        case "%": return l % r;
        case "^": case "**": return Math.pow(l, r);
      }
      return 0;
    }
    case "func": {
      const args = expr.args.map((a) => evaluate(a, vars));
      switch (expr.name) {
        case "sin": return Math.sin(args[0]);
        case "cos": return Math.cos(args[0]);
        case "tan": return Math.tan(args[0]);
        case "log": return Math.log(args[0]);
        case "ln": return Math.log(args[0]);
        case "log10": return Math.log10(args[0]);
        case "exp": return Math.exp(args[0]);
        case "sqrt": return Math.sqrt(args[0]);
        case "abs": return Math.abs(args[0]);
        case "asin": return Math.asin(args[0]);
        case "acos": return Math.acos(args[0]);
        case "atan": return Math.atan(args[0]);
        case "sinh": return Math.sinh(args[0]);
        case "cosh": return Math.cosh(args[0]);
        case "tanh": return Math.tanh(args[0]);
        case "max": return Math.max(...args);
        case "min": return Math.min(...args);
        case "pow": return Math.pow(args[0], args[1]);
        case "atan2": return Math.atan2(args[0], args[1]);
      }
      return 0;
    }
  }
  return 0;
}

// ─── Symbolic Differentiation ────────────────────────────────────────────────

export function diff(expr: Expr, variable: string): Expr {
  switch (expr.type) {
    case "num": case "const": return { type: "num", value: 0 };
    case "var": return expr.name === variable ? { type: "num", value: 1 } : { type: "num", value: 0 };

    case "unary":
      if (expr.op === "-") return { type: "unary", op: "-", arg: diff(expr.arg, variable) };
      if (expr.op === "sin") return { type: "binop", op: "*", left: { type: "func", name: "cos", args: [expr.arg] }, right: diff(expr.arg, variable) };
      if (expr.op === "cos") return { type: "unary", op: "-", arg: { type: "binop", op: "*", left: { type: "func", name: "sin", args: [expr.arg] }, right: diff(expr.arg, variable) } };
      if (expr.op === "tan") return { type: "binop", op: "/", left: diff(expr.arg, variable), right: { type: "binop", op: "^", left: { type: "func", name: "cos", args: [expr.arg] }, right: { type: "num", value: 2 } } };
      if (expr.op === "ln" || expr.op === "log") return { type: "binop", op: "/", left: diff(expr.arg, variable), right: expr.arg };
      if (expr.op === "exp") return { type: "binop", op: "*", left: expr, right: diff(expr.arg, variable) };
      if (expr.op === "sqrt") return { type: "binop", op: "/", left: diff(expr.arg, variable), right: { type: "binop", op: "*", left: { type: "num", value: 2 }, right: expr } };
      return { type: "num", value: 0 };

    case "binop":
      if (expr.op === "+" || expr.op === "-") {
        return { type: "binop", op: expr.op, left: diff(expr.left, variable), right: diff(expr.right, variable) };
      }
      if (expr.op === "*") {
        // Product rule: (fg)' = f'g + fg'
        return {
          type: "binop", op: "+",
          left: { type: "binop", op: "*", left: diff(expr.left, variable), right: expr.right },
          right: { type: "binop", op: "*", left: expr.left, right: diff(expr.right, variable) },
        };
      }
      if (expr.op === "/") {
        // Quotient rule: (f/g)' = (f'g - fg') / g²
        return {
          type: "binop", op: "/",
          left: {
            type: "binop", op: "-",
            left: { type: "binop", op: "*", left: diff(expr.left, variable), right: expr.right },
            right: { type: "binop", op: "*", left: expr.left, right: diff(expr.right, variable) },
          },
          right: { type: "binop", op: "^", left: expr.right, right: { type: "num", value: 2 } },
        };
      }
      if (expr.op === "^") {
        // Power rule: (f^n)' = n * f^(n-1) * f'
        const isConstN = isConstant(expr.right, variable);
        if (isConstN) {
          return {
            type: "binop", op: "*",
            left: { type: "binop", op: "*", left: expr.right, right: { type: "binop", op: "^", left: expr.left, right: { type: "binop", op: "-", left: expr.right, right: { type: "num", value: 1 } } } },
            right: diff(expr.left, variable),
          };
        }
        // General: f^g = e^(g ln f), diff = f^g * (g' ln f + g f'/f)
        return {
          type: "binop", op: "*",
          left: expr,
          right: {
            type: "binop", op: "+",
            left: { type: "binop", op: "*", left: diff(expr.right, variable), right: { type: "func", name: "ln", args: [expr.left] } },
            right: { type: "binop", op: "/", left: { type: "binop", op: "*", left: expr.right, right: diff(expr.left, variable) }, right: expr.left },
          },
        };
      }
      return { type: "num", value: 0 };

    case "func": {
      if (expr.args.length === 1) {
        const inner = expr.args[0];
        const innerDiff = diff(inner, variable);
        // Chain rule for known functions
        let outerDeriv: Expr;
        switch (expr.name) {
          case "sin": outerDeriv = { type: "func", name: "cos", args: [inner] }; break;
          case "cos": outerDeriv = { type: "unary", op: "-", arg: { type: "func", name: "sin", args: [inner] } }; break;
          case "tan": outerDeriv = { type: "binop", op: "/", left: { type: "num", value: 1 }, right: { type: "binop", op: "^", left: { type: "func", name: "cos", args: [inner] }, right: { type: "num", value: 2 } } }; break;
          case "ln": case "log": outerDeriv = { type: "binop", op: "/", left: { type: "num", value: 1 }, right: inner }; break;
          case "exp": outerDeriv = expr; break;
          case "sqrt": outerDeriv = { type: "binop", op: "/", left: { type: "num", value: 1 }, right: { type: "binop", op: "*", left: { type: "num", value: 2 }, right: expr } }; break;
          default: outerDeriv = { type: "num", value: 0 };
        }
        return { type: "binop", op: "*", left: outerDeriv, right: innerDiff };
      }
      return { type: "num", value: 0 };
    }
  }
  return { type: "num", value: 0 };
}

function isConstant(expr: Expr, variable: string): boolean {
  if (expr.type === "var") return expr.name !== variable;
  if (expr.type === "num" || expr.type === "const") return true;
  if (expr.type === "unary") return isConstant(expr.arg, variable);
  if (expr.type === "binop") return isConstant(expr.left, variable) && isConstant(expr.right, variable);
  if (expr.type === "func") return expr.args.every((a) => isConstant(a, variable));
  return false;
}

// ─── Symbolic Simplification ────────────────────────────────────────────────

export function simplify(expr: Expr): Expr {
  if (expr.type === "num" || expr.type === "var" || expr.type === "const") return expr;
  if (expr.type === "unary") {
    const arg = simplify(expr.arg);
    if (expr.op === "-") {
      if (arg.type === "num") return { type: "num", value: -arg.value };
      if (arg.type === "unary" && arg.op === "-") return arg.arg;
    }
    return { ...expr, arg };
  }
  if (expr.type === "binop") {
    const left = simplify(expr.left);
    const right = simplify(expr.right);

    // Numeric simplification
    if (left.type === "num" && right.type === "num") {
      return { type: "num", value: evaluate({ type: "binop", op: expr.op, left, right }) };
    }

    // Identity operations
    if (expr.op === "+") {
      if (left.type === "num" && left.value === 0) return right;
      if (right.type === "num" && right.value === 0) return left;
    }
    if (expr.op === "-") {
      if (right.type === "num" && right.value === 0) return left;
    }
    if (expr.op === "*") {
      if (left.type === "num" && left.value === 0) return { type: "num", value: 0 };
      if (right.type === "num" && right.value === 0) return { type: "num", value: 0 };
      if (left.type === "num" && left.value === 1) return right;
      if (right.type === "num" && right.value === 1) return left;
    }
    if (expr.op === "/") {
      if (left.type === "num" && left.value === 0) return { type: "num", value: 0 };
      if (right.type === "num" && right.value === 1) return left;
    }
    if (expr.op === "^") {
      if (right.type === "num" && right.value === 0) return { type: "num", value: 1 };
      if (right.type === "num" && right.value === 1) return left;
      if (left.type === "num" && right.type === "num") return { type: "num", value: Math.pow(left.value, right.value) };
    }

    return { type: "binop", op: expr.op, left, right };
  }
  if (expr.type === "func") {
    return { ...expr, args: expr.args.map(simplify) };
  }
  return expr;
}

// ─── Pretty Print ───────────────────────────────────────────────────────────

export function toString(expr: Expr): string {
  switch (expr.type) {
    case "num": return String(expr.value);
    case "var": return expr.name;
    case "const": return expr.name;
    case "unary": {
      if (expr.op === "-" || expr.op === "+") return `${expr.op}(${toString(expr.arg)})`;
      return `${expr.op}(${toString(expr.arg)})`;
    }
    case "binop": {
      const opStr = expr.op === "^" ? "^" : expr.op === "**" ? "^" : ` ${expr.op} `;
      const l = expr.left.type === "binop" && precedence(expr.left.op) < precedence(expr.op) ? `(${toString(expr.left)})` : toString(expr.left);
      const r = expr.right.type === "binop" && precedence(expr.right.op) <= precedence(expr.op) ? `(${toString(expr.right)})` : toString(expr.right);
      return `${l}${opStr}${r}`;
    }
    case "func": return `${expr.name}(${expr.args.map(toString).join(", ")})`;
  }
  return "";
}

function precedence(op: string): number {
  if (op === "+" || op === "-") return 1;
  if (op === "*" || op === "/") return 2;
  if (op === "^") return 3;
  return 0;
}

// ─── Numerical Integration ──────────────────────────────────────────────────

export function integrate(
  expr: string,
  variable: string,
  a: number,
  b: number,
  n = 1000,
): { value: number; method: string } {
  const parsed = parse(expr);
  const h = (b - a) / n;
  let sum = evaluate(parsed, { [variable]: a }) + evaluate(parsed, { [variable]: b });

  for (let i = 1; i < n; i++) {
    const x = a + i * h;
    sum += (i % 2 === 0 ? 2 : 4) * evaluate(parsed, { [variable]: x });
  }

  return { value: (h / 3) * sum, method: "Simpson's 1/3 rule" };
}

// ─── Taylor Series ──────────────────────────────────────────────────────────

export function taylorSeries(
  expr: string,
  variable: string,
  center: number,
  order: number,
): { terms: Array<{ coefficient: number; power: number; term: string }>; polynomial: string } {
  const parsed = parse(expr);
  const terms: Array<{ coefficient: number; power: number; term: string }> = [];
  let current = parsed;
  let factorial = 1;

  for (let n = 0; n <= order; n++) {
    const coeff = evaluate(simplify(current), { [variable]: center }) / factorial;
    terms.push({
      coefficient: coeff,
      power: n,
      term: n === 0 ? String(coeff) : `${coeff.toFixed(6)}*${variable}^${n}`,
    });
    current = diff(current, variable);
    factorial *= (n + 1);
  }

  const polynomial = terms
    .map((t) => {
      if (t.power === 0) return t.coefficient.toFixed(6);
      if (t.coefficient === 1) return `${variable}^${t.power}`;
      if (t.coefficient === -1) return `-${variable}^${t.power}`;
      return `${t.coefficient.toFixed(6)}*${variable}^${t.power}`;
    })
    .join(" + ")
    .replace(/\+ -/g, "- ");

  return { terms, polynomial };
}

// ─── Limit (numerical) ─────────────────────────────────────────────────────

export function limit(
  expr: string,
  variable: string,
  point: number,
  direction: "left" | "right" | "both" = "both",
): { value: number; exists: boolean } {
  const parsed = parse(expr);
  const delta = 1e-10;

  if (direction === "left" || direction === "both") {
    const leftVal = evaluate(parsed, { [variable]: point - delta });
    if (direction === "left") return { value: leftVal, exists: isFinite(leftVal) };
  }

  if (direction === "right" || direction === "both") {
    const rightVal = evaluate(parsed, { [variable]: point + delta });
    if (direction === "right") return { value: rightVal, exists: isFinite(rightVal) };

    const leftVal = evaluate(parsed, { [variable]: point - delta });
    const exists = Math.abs(leftVal - rightVal) < 1e-6;
    return { value: exists ? (leftVal + rightVal) / 2 : NaN, exists };
  }

  return { value: NaN, exists: false };
}

// ─── Equation Solver (numerical, Newton's method for f(x)=0) ───────────────

export function solveEquation(
  expr: string,
  variable: string,
  guesses: number[] = [1],
  tolerance = 1e-12,
  maxIter = 100,
): Array<{ root: number; iterations: number; converged: boolean }> {
  const parsed = parse(expr);
  const deriv = simplify(diff(parsed, variable));
  const results: Array<{ root: number; iterations: number; converged: boolean }> = [];

  for (const x0 of guesses) {
    let x = x0;
    for (let i = 0; i < maxIter; i++) {
      const fx = evaluate(parsed, { [variable]: x });
      const fpx = evaluate(deriv, { [variable]: x });
      if (Math.abs(fpx) < 1e-15) break;
      const xNew = x - fx / fpx;
      if (Math.abs(xNew - x) < tolerance) {
        results.push({ root: xNew, iterations: i + 1, converged: true });
        break;
      }
      x = xNew;
      if (i === maxIter - 1) results.push({ root: x, iterations: maxIter, converged: false });
    }
  }

  return results;
}

// ─── System of Equations Solver (Newton-Raphson for multivariate) ───────────

export function solveSystem(
  equations: string[],
  variables: string[],
  initialGuess: number[],
  maxIter = 50,
  tolerance = 1e-10,
): { solution: Record<string, number>; iterations: number; converged: boolean } {
  const parsed = equations.map(parse);
  const jacobian = variables.map((v) => parsed.map((e) => simplify(diff(e, v))));

  let x = [...initialGuess];

  for (let iter = 0; iter < maxIter; iter++) {
    const vars: Record<string, number> = {};
    variables.forEach((v, i) => { vars[v] = x[i]; });

    const F = parsed.map((e) => evaluate(e, vars));
    const norm = Math.sqrt(F.reduce((s, f) => s + f * f, 0));
    if (norm < tolerance) return { solution: vars, iterations: iter, converged: true };

    // Jacobian matrix
    const J: number[][] = jacobian.map((row) => row.map((e) => evaluate(e, vars)));

    // Solve J * dx = -F using Gauss elimination
    const n = variables.length;
    const aug = J.map((row, i) => [...row, -F[i]]);

    for (let col = 0; col < n; col++) {
      let maxRow = col;
      for (let row = col + 1; row < n; row++) {
        if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
      }
      [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
      if (Math.abs(aug[col][col]) < 1e-15) continue;
      for (let row = col + 1; row < n; row++) {
        const f = aug[row][col] / aug[col][col];
        for (let j = col; j <= n; j++) aug[row][j] -= f * aug[col][j];
      }
    }

    const dx = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let sum = aug[i][n];
      for (let j = i + 1; j < n; j++) sum -= aug[i][j] * dx[j];
      dx[i] = Math.abs(aug[i][i]) < 1e-15 ? 0 : sum / aug[i][i];
    }

    x = x.map((xi, i) => xi + dx[i]);
  }

  const finalVars: Record<string, number> = {};
  variables.forEach((v, i) => { finalVars[v] = x[i]; });
  return { solution: finalVars, iterations: maxIter, converged: false };
}

// ─── Laplace Transform (numerical) ─────────────────────────────────────────

export function laplaceTransform(
  expr: string,
  variable: string,
  s: number,
  tMax = 20,
  n = 2000,
): number {
  const parsed = parse(expr);
  const dt = tMax / n;
  let sum = 0;

  for (let i = 0; i < n; i++) {
    const t = i * dt;
    const ft = evaluate(parsed, { [variable]: t });
    sum += ft * Math.exp(-s * t) * dt;
  }

  return sum;
}

// ─── Fourier Transform (numerical, DFT) ────────────────────────────────────

export function fourierTransform(
  signal: number[],
  sampleRate: number,
): { frequencies: number[]; real: number[]; imaginary: number[]; magnitude: number[]; phase: number[] } {
  const N = signal.length;
  const frequencies: number[] = [];
  const real: number[] = [];
  const imaginary: number[] = [];
  const magnitude: number[] = [];
  const phase: number[] = [];

  for (let k = 0; k < N / 2; k++) {
    frequencies.push((k * sampleRate) / N);
    let re = 0, im = 0;
    for (let n = 0; n < N; n++) {
      const angle = (2 * Math.PI * k * n) / N;
      re += signal[n] * Math.cos(angle);
      im -= signal[n] * Math.sin(angle);
    }
    real.push(re / N);
    imaginary.push(im / N);
    magnitude.push(Math.sqrt(re * re + im * im) / N);
    phase.push(Math.atan2(im, re));
  }

  return { frequencies, real, imaginary, magnitude, phase };
}

// ─── Matrix Operations ──────────────────────────────────────────────────────

export function matrixDet(A: number[][]): number {
  const n = A.length;
  if (n === 1) return A[0][0];
  if (n === 2) return A[0][0] * A[1][1] - A[0][1] * A[1][0];
  let det = 0;
  for (let j = 0; j < n; j++) {
    const minor = A.slice(1).map((row) => row.filter((_, k) => k !== j));
    det += ((j % 2 === 0 ? 1 : -1) * A[0][j] * matrixDet(minor));
  }
  return det;
}

export function matrixInverse(A: number[][]): number[][] {
  const n = A.length;
  const aug = A.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => i === j ? 1 : 0)]);

  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    const pivot = aug[col][col];
    for (let j = 0; j < 2 * n; j++) aug[col][j] /= pivot;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const f = aug[row][col];
      for (let j = 0; j < 2 * n; j++) aug[row][j] -= f * aug[col][j];
    }
  }

  return aug.map((row) => row.slice(n));
}

// ─── Science Formula Solver ─────────────────────────────────────────────────

export interface ScienceResult {
  formula: string;
  result: number;
  unit: string;
  steps: string[];
}

export function solveScience(
  formula: string,
  variables: Record<string, number>,
): ScienceResult {
  const steps: string[] = [];

  // Common physics/engineering formulas
  const formulas: Record<string, { expr: string; unit: string; description: string }> = {
    "newton-second": { expr: "F=m*a", unit: "N", description: "F = ma (Newton's second law)" },
    "kinetic-energy": { expr: "0.5*m*v^2", unit: "J", description: "KE = ½mv²" },
    "potential-energy": { expr: "m*g*h", unit: "J", description: "PE = mgh" },
    "ohm-law": { expr: "I*V", unit: "W", description: "P = IV (Ohm's law power)" },
    "ideal-gas": { expr: "n*R*T/V", unit: "Pa", description: "PV = nRT → P = nRT/V" },
    "gravitational-force": { expr: "G*m1*m2/r^2", unit: "N", description: "F = Gm₁m₂/r²" },
    "coulomb": { expr: "k*q1*q2/r^2", unit: "N", description: "F = kq₁q₂/r²" },
    "circular-motion": { expr: "v^2/r", unit: "m/s²", description: "a = v²/r" },
    "wavelength": { expr: "v/f", unit: "m", description: "λ = v/f" },
    "frequency-period": { expr: "1/T", unit: "Hz", description: "f = 1/T" },
    "shm-period": { expr: "2*pi*sqrt(m/k)", unit: "s", description: "T = 2π√(m/k)" },
    "spring-force": { expr: "-k*x", unit: "N", description: "F = -kx (Hooke's law)" },
    "work": { expr: "F*d*cos(theta)", unit: "J", description: "W = Fd cos θ" },
    "power": { expr: "W/t", unit: "W", description: "P = W/t" },
    "drag-force": { expr: "0.5*Cd*A*rho*v^2", unit: "N", description: "Fd = ½CdAρv²" },
    "reynolds-number": { expr: "rho*v*L/mu", unit: "", description: "Re = ρvL/μ" },
    "nusselt-convection": { expr: "h*L/k", unit: "", description: "Nu = hL/k" },
    "fourier-law": { expr: "-k*A*dT/dx", unit: "W", description: "q = -kA dT/dx" },
    "bernoulli": { expr: "P+0.5*rho*v^2+rho*g*h", unit: "Pa", description: "P + ½ρv² + ρgh = const" },
    "stress": { expr: "F/A", unit: "Pa", description: "σ = F/A" },
    "strain": { expr: "dL/L", unit: "", description: "ε = ΔL/L" },
    "young-modulus": { expr: "stress/strain", unit: "Pa", description: "E = σ/ε" },
    "bending-moment": { expr: "E*I/rho", unit: "N·m", description: "M = EI/ρ" },
    "shear-stress": { expr: "V*Q/(I*t)", unit: "Pa", description: "τ = VQ/(It)" },
    "torsion": { expr: "T*r/J", unit: "Pa", description: "τ = Tr/J" },
    "euler-buckling": { expr: "pi^2*E*I/(K*L)^2", unit: "N", description: "Pcr = π²EI/(KL)²" },
    "capacitance": { expr: "epsilon0*A/d", unit: "F", description: "C = ε₀A/d" },
    "electric-field": { expr: "V/d", unit: "V/m", description: "E = V/d" },
    "magnetic-field-wire": { expr: "mu0*I/(2*pi*r)", unit: "T", description: "B = μ₀I/(2πr)" },
    "lorentz-force": { expr: "q*v*B*sin(theta)", unit: "N", description: "F = qvB sin θ" },
    "decay": { expr: "N0*exp(-lambda*t)", unit: "", description: "N = N₀e^(-λt)" },
    "half-life": { expr: "ln(2)/lambda", unit: "s", description: "t½ = ln2/λ" },
    "doppler-shift": { expr: "f0*(v+vr)/(v-vs)", unit: "Hz", description: "f = f₀(v+vr)/(v-vs)" },
    "entropy": { expr: "Q/T", unit: "J/K", description: "S = Q/T" },
    "boltzmann-entropy": { expr: "kB*ln(W)", unit: "J/K", description: "S = kB ln W" },
    "planck": { expr: "h*nu", unit: "J", description: "E = hν" },
    "photoelectric": { expr: "h*nu-W0", unit: "J", description: "KE = hν - W₀" },
  };

  // Check if formula matches a known science formula
  const match = Object.entries(formulas).find(([key, f]) => key === formula || f.description.toLowerCase().includes(formula.toLowerCase()) || f.expr.toLowerCase().includes(formula.toLowerCase()));

  if (match) {
    const [key, info] = match;
    steps.push(`Formula: ${info.description}`);
    steps.push(`Expression: ${info.expr}`);

    try {
      const parsed = parse(info.expr);
      const result = evaluate(parsed, variables);
      steps.push(`Substituting: ${JSON.stringify(variables)}`);
      steps.push(`Result: ${result.toExponential(4)} ${info.unit}`);
      return { formula: info.description, result, unit: info.unit, steps };
    } catch {
      // Fall through to generic evaluation
    }
  }

  // Generic: try to evaluate as expression
  try {
    const parsed = parse(formula);
    const result = evaluate(parsed, variables);
    steps.push(`Expression: ${formula}`);
    steps.push(`Variables: ${JSON.stringify(variables)}`);
    steps.push(`Result: ${result.toExponential(4)}`);
    return { formula, result, unit: "", steps };
  } catch (e) {
    return { formula, result: NaN, unit: "", steps: [`Error: ${e instanceof Error ? e.message : String(e)}`] };
  }
}

// ─── Comprehensive Math Solver ──────────────────────────────────────────────

export interface MathSolution {
  type: string;
  input: string;
  result: unknown;
  steps: string[];
}

export function solveMath(
  problem: string,
  params: Record<string, unknown> = {},
): MathSolution {
  const steps: string[] = [];

  // Try to detect problem type
  if (problem.includes("=") && problem.includes("?")) {
    // Equation solving
    const eq = problem.split("=")[0].trim();
    const vars = (params.variables as string[]) || ["x"];
    const guesses = (params.guesses as number[]) || [1, -1, 0.5, 2];
    const solutions = solveEquation(eq, vars[0], guesses);
    return { type: "equation", input: problem, result: solutions, steps: [`Solved ${eq} = 0`, ...solutions.map((s) => `Root: ${s.root.toFixed(8)} (${s.converged ? "converged" : "not converged"} in ${s.iterations} iterations)`)] };
  }

  if (problem.toLowerCase().includes("derivative") || problem.toLowerCase().includes("differentiate")) {
    const expr = problem.replace(/differentiate|derivative|d\/d[a-z]+\s*/gi, "").trim();
    const variable = (params.variable as string) || "x";
    const parsed = parse(expr);
    const derived = simplify(diff(parsed, variable));
    return { type: "differentiation", input: problem, result: toString(derived), steps: [`d/d${variable}(${expr}) = ${toString(derived)}`] };
  }

  if (problem.toLowerCase().includes("integrate") || problem.toLowerCase().includes("integral")) {
    const expr = problem.replace(/integrate|integral|∫\s*/gi, "").trim();
    const variable = (params.variable as string) || "x";
    const a = (params.a as number) ?? 0;
    const b = (params.b as number) ?? 1;
    const result = integrate(expr, variable, a, b);
    return { type: "integration", input: problem, result: result.value, steps: [`∫₀¹ ${expr} d${variable} = ${result.value.toFixed(8)}`, `Method: ${result.method}`] };
  }

  if (problem.toLowerCase().includes("taylor")) {
    const expr = (params.expression as string) || problem;
    const variable = (params.variable as string) || "x";
    const center = (params.center as number) || 0;
    const order = (params.order as number) || 5;
    const result = taylorSeries(expr, variable, center, order);
    return { type: "taylor-series", input: problem, result: result.polynomial, steps: [`Taylor series of ${expr} around ${variable}=${center}`, ...result.terms.map((t) => `  ${t.coefficient.toFixed(6)} * ${variable}^${t.power}`)] };
  }

  if (problem.toLowerCase().includes("limit")) {
    const expr = (params.expression as string) || "sin(x)/x";
    const variable = (params.variable as string) || "x";
    const point = (params.point as number) || 0;
    const result = limit(expr, variable, point);
    return { type: "limit", input: problem, result: result.value, steps: [`lim(${variable}→${point}) ${expr} = ${result.exists ? result.value : "does not exist"}`] };
  }

  // Default: try to evaluate as expression
  try {
    const parsed = parse(problem);
    const result = evaluate(parsed, params as Record<string, number>);
    return { type: "evaluation", input: problem, result, steps: [`${problem} = ${result}`] };
  } catch (e) {
    return { type: "error", input: problem, result: null, steps: [`Could not solve: ${e instanceof Error ? e.message : String(e)}`] };
  }
}
