const S1 = -0.16666666666666632;
const S2 = 0.00833333333332249;
const S3 = -0.0001984126982985795;
const S4 = 0.0000027557313707070068;
const S5 = -2.5050760253406863e-8;
const S6 = 1.58969099521155e-10;
const C1 = 0.0416666666666666;
const C2 = -0.001388888888887411;
const C3 = 0.00002480158728947673;
const C4 = -2.7557314351390663e-7;
const C5 = 2.087572321298175e-9;
const C6 = -1.1359647557788195e-11;

const sinPolynomial = (z: number): number => {
  const w = z * z;
  return S2 + z * (S3 + z * S4) + z * w * (S5 + z * S6);
};

export const sinKernel = (x: number): number => {
  const z = x * x;
  const v = z * x;
  return x + v * (S1 + z * sinPolynomial(z));
};

export const sinKernelTail = (x: number, y: number): number => {
  const z = x * x;
  const v = z * x;
  return x - (z * (0.5 * y - v * sinPolynomial(z)) - y - v * S1);
};

export const cosKernel = (x: number, y: number): number => {
  const z = x * x;
  const w = z * z;
  const r = z * (C1 + z * (C2 + z * C3)) + w * w * (C4 + z * (C5 + z * C6));
  const hz = 0.5 * z;
  const head = 1 - hz;
  return head + (1 - head - hz + (z * r - x * y));
};
