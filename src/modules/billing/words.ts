const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowHundred(n: number): string {
  return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
}

function belowThousand(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", r ? belowHundred(r) : ""].filter(Boolean).join(" ");
}

/** Whole rupees in Indian words: 123456 → "One Lakh Twenty Three Thousand Four Hundred Fifty Six". */
function rupeesInWords(n: number): string {
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7);
  const lakh = Math.floor((n % 1e7) / 1e5);
  const thousand = Math.floor((n % 1e5) / 1e3);
  const rest = n % 1e3;
  if (crore) parts.push(`${rupeesInWords(crore)} Crore`);
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (rest) parts.push(belowThousand(rest));
  return parts.join(" ");
}

/** 1234550 paise → "Rupees Twelve Thousand Three Hundred Forty Five and Fifty Paise Only" */
export function amountInWords(paise: number): string {
  const p = Math.round(Math.abs(paise));
  const rupees = Math.floor(p / 100);
  const rem = p % 100;
  return `Rupees ${rupeesInWords(rupees)}${rem ? ` and ${belowHundred(rem)} Paise` : ""} Only`;
}
