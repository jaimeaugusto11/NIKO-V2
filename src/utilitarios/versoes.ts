export function versaoMaisNova(nova: string, atual: string): boolean {
  const ler = (versao: string) => /^v?(\d+)\.(\d+)\.(\d+)(?:-([\da-zA-Z.-]+))?(?:\+[\da-zA-Z.-]+)?$/.exec(versao);
  const a = ler(nova);
  const b = ler(atual);
  if (!a || !b) return false;
  for (let i = 1; i <= 3; i++) {
    if (Number(a[i]) !== Number(b[i])) return Number(a[i]) > Number(b[i]);
  }
  if (!a[4] || !b[4]) return Boolean(b[4]) && !a[4];
  const partesA = a[4].split(".");
  const partesB = b[4].split(".");
  for (let i = 0; i < Math.max(partesA.length, partesB.length); i++) {
    const x = partesA[i];
    const y = partesB[i];
    if (x === y) continue;
    if (x === undefined || y === undefined) return y === undefined;
    const numeroX = /^\d+$/.test(x);
    const numeroY = /^\d+$/.test(y);
    if (numeroX && numeroY) return Number(x) > Number(y);
    if (numeroX !== numeroY) return numeroY;
    return x > y;
  }
  return false;
}
