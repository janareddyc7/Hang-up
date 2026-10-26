/**
 * Cohen's kappa between two raters over the same items (classifier vs human
 * gold labels). Landis & Koch read 0.61-0.80 as substantial agreement.
 */
export function cohensKappa<T extends string>(a: readonly T[], b: readonly T[]): number {
  if (a.length !== b.length) throw new Error("raters must label the same items");
  const n = a.length;
  if (n === 0) throw new Error("no items");
  const labels = [...new Set([...a, ...b])];
  let agree = 0;
  const countA = new Map<T, number>();
  const countB = new Map<T, number>();
  for (let i = 0; i < n; i++) {
    if (a[i] === b[i]) agree++;
    countA.set(a[i]!, (countA.get(a[i]!) ?? 0) + 1);
    countB.set(b[i]!, (countB.get(b[i]!) ?? 0) + 1);
  }
  const po = agree / n;
  const pe = labels.reduce((sum, l) => sum + ((countA.get(l) ?? 0) / n) * ((countB.get(l) ?? 0) / n), 0);
  return pe === 1 ? 1 : (po - pe) / (1 - pe);
}

/** Precision and recall of one label, treating `gold` as truth. */
export function precisionRecall<T extends string>(predicted: readonly T[], gold: readonly T[], label: T) {
  let tp = 0, fp = 0, fn = 0;
  for (let i = 0; i < gold.length; i++) {
    const p = predicted[i] === label, g = gold[i] === label;
    if (p && g) tp++;
    else if (p) fp++;
    else if (g) fn++;
  }
  return { precision: tp + fp === 0 ? 1 : tp / (tp + fp), recall: tp + fn === 0 ? 1 : tp / (tp + fn), support: tp + fn };
}
