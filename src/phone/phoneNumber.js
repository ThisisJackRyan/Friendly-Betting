export function nationalFromInput(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('1')) digits = digits.slice(1);
  return digits.slice(0, 10);
}

export function formatNational(national) {
  const digits = nationalFromInput(national);
  if (digits.length < 4) return digits;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function phoneFieldValue(national) {
  const digits = nationalFromInput(national);
  if (!digits) return '+1 ';
  return `+1 ${formatNational(digits)}`;
}

export function toE164(national) {
  const digits = nationalFromInput(national);
  if (digits.length !== 10) return '';
  return `+1${digits}`;
}

export function maskPhone(e164) {
  const digits = String(e164 || '').replace(/\D/g, '');
  const last4 = digits.slice(-4);
  return last4 ? `\u2022\u2022\u2022${last4}` : '\u2022\u2022\u2022';
}
