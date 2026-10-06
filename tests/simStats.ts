/** Chi-square goodness of fit for the distribution tests. */

function logGamma(x: number): number {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (const k of c) ser += k / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

/** Regularised upper incomplete gamma Q(a, x). */
function gammaQ(a: number, x: number): number {
  if (x <= 0) return 1;
  if (x < a + 1) {
    let ap = a;
    let sum = 1 / a;
    let del = sum;
    for (let n = 0; n < 500; n++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-14) break;
    }
    return 1 - sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
  }
  let b = x + 1 - a;
  let c = 1 / 1e-300;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

export interface ChiSquare {
  statistic: number;
  df: number;
  p: number;
}

/** Compares observed counts with probabilities; categories with probability 0 are ignored. */
export function chiSquare(observed: readonly number[], probs: readonly number[]): ChiSquare {
  const n = observed.reduce((a, v) => a + v, 0);
  let statistic = 0;
  let cells = 0;
  probs.forEach((p, i) => {
    if (p <= 0) {
      if ((observed[i] as number) > 0) statistic = Infinity;
      return;
    }
    const expected = n * p;
    cells++;
    statistic += ((observed[i] as number) - expected) ** 2 / expected;
  });
  const df = cells - 1;
  return { statistic, df, p: df <= 0 ? 1 : gammaQ(df / 2, statistic / 2) };
}
