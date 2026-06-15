export type ImportSourceType =
  | "screenshot"
  | "pdf"
  | "csv"
  | "pasted_text"
  | "email_forward";

export type ImportStatus =
  | "uploaded"
  | "processing"
  | "needs_review"
  | "confirmed"
  | "failed";

export type ObligationType =
  | "bnpl"
  | "subscription"
  | "bill"
  | "debt_minimum"
  | "rent"
  | "other";

export type RecurrenceType =
  | "none"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "yearly"
  | "custom_installments";

export type ReviewStatus = "pending" | "accepted" | "edited" | "ignored";
export type PayFrequency = "weekly" | "biweekly" | "semimonthly" | "monthly";

export interface DetectedPayment {
  id: string;
  merchantName: string;
  amountCents: number;
  currency: "USD";
  firstDueDate: string;
  recurrence: RecurrenceType;
  type: ObligationType;
  installmentCount?: number;
  confidence: number;
  sourceSnippet: string;
  reviewStatus: ReviewStatus;
}

export interface IncomeSchedule {
  frequency: PayFrequency;
  nextPayday: string;
  paycheckAmountCents: number;
  bufferAmountCents: number;
  semimonthlyDay1: number;
  semimonthlyDay2: number;
}

export interface PaymentInstance {
  id: string;
  sourcePaymentId: string;
  merchantName: string;
  type: ObligationType;
  dueDate: string;
  amountCents: number;
  installmentNumber?: number;
  installmentCount?: number;
}

export interface PaycheckWindow {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  instances: PaymentInstance[];
  committedAmountCents: number;
  remainingEstimateCents: number | null;
  commitmentRatio: number | null;
}

export interface PaycheckMap {
  windows: PaycheckWindow[];
  instances: PaymentInstance[];
  dueBeforeNextPaycheckCents: number;
  nextPaycheckCommittedCents: number;
  next30DaysCents: number;
  highestPressureDate: string | null;
}

const monthNames = new Map([
  ["jan", 0],
  ["january", 0],
  ["feb", 1],
  ["february", 1],
  ["mar", 2],
  ["march", 2],
  ["apr", 3],
  ["april", 3],
  ["may", 4],
  ["jun", 5],
  ["june", 5],
  ["jul", 6],
  ["july", 6],
  ["aug", 7],
  ["august", 7],
  ["sep", 8],
  ["sept", 8],
  ["september", 8],
  ["oct", 9],
  ["october", 9],
  ["nov", 10],
  ["november", 10],
  ["dec", 11],
  ["december", 11],
]);

export function getTodayISO() {
  return toISODate(new Date());
}

export function parseISODate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function toISODate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return atNoon(next);
}

export function addMonths(date: Date, months: number) {
  const next = new Date(date.getFullYear(), date.getMonth() + months, 1, 12);
  next.setDate(Math.min(date.getDate(), daysInMonth(next)));
  return atNoon(next);
}

export function centsFromDollars(value: string | number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100)) : 0;
}

export function dollarsForInput(cents: number) {
  return cents ? (cents / 100).toFixed(2) : "";
}

export function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function formatExactMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(parseISODate(value));
}

export function parseImportedText(rawText: string, sourceType: ImportSourceType) {
  const normalized = rawText.replace(/\r/g, "\n");
  const rows =
    sourceType === "csv" ? parseCsvRows(normalized) : normalized.split("\n");
  const detections = rows.flatMap((row, index) =>
    detectPaymentsFromLine(row, index),
  );

  return dedupeDetections(detections);
}

export function createSampleDetections(todayISO = getTodayISO()): DetectedPayment[] {
  const today = parseISODate(todayISO);

  return [
    {
      id: "sample-netflix",
      merchantName: "Netflix",
      amountCents: 1549,
      currency: "USD",
      firstDueDate: toISODate(addDays(today, 7)),
      recurrence: "monthly",
      type: "subscription",
      confidence: 0.92,
      sourceSnippet: "NETFLIX.COM 15.49 recurring monthly",
      reviewStatus: "pending",
    },
    {
      id: "sample-icloud",
      merchantName: "iCloud",
      amountCents: 299,
      currency: "USD",
      firstDueDate: toISODate(addDays(today, 11)),
      recurrence: "monthly",
      type: "subscription",
      confidence: 0.88,
      sourceSnippet: "APPLE.COM/BILL iCloud 2.99 monthly",
      reviewStatus: "pending",
    },
    {
      id: "sample-affirm",
      merchantName: "Affirm",
      amountCents: 4250,
      currency: "USD",
      firstDueDate: toISODate(addDays(today, 4)),
      recurrence: "custom_installments",
      type: "bnpl",
      installmentCount: 4,
      confidence: 0.84,
      sourceSnippet: "Your next payment of $42.50 to Affirm is due soon",
      reviewStatus: "pending",
    },
    {
      id: "sample-gym",
      merchantName: "Planet Fitness",
      amountCents: 1000,
      currency: "USD",
      firstDueDate: toISODate(addDays(today, 16)),
      recurrence: "monthly",
      type: "subscription",
      confidence: 0.68,
      sourceSnippet: "PLANET FITNESS 10.00",
      reviewStatus: "pending",
    },
    {
      id: "sample-card",
      merchantName: "Credit card minimum",
      amountCents: 7800,
      currency: "USD",
      firstDueDate: toISODate(addDays(today, 19)),
      recurrence: "monthly",
      type: "debt_minimum",
      confidence: 0.75,
      sourceSnippet: "Minimum payment due $78.00",
      reviewStatus: "pending",
    },
  ];
}

export function buildPaycheckMap(
  income: IncomeSchedule,
  payments: DetectedPayment[],
  startDateISO = getTodayISO(),
): PaycheckMap {
  const acceptedPayments = payments.filter(
    (payment) => payment.reviewStatus === "accepted" || payment.reviewStatus === "edited",
  );
  const instances = generatePaymentInstances(acceptedPayments, startDateISO);
  const windows = generatePaycheckWindows(income, startDateISO).map((window) => {
    const start = parseISODate(window.startDate);
    const end = parseISODate(window.endDate);
    const windowInstances = instances.filter((instance) => {
      const dueDate = parseISODate(instance.dueDate);
      return dueDate >= start && dueDate < end;
    });
    const committedAmountCents = windowInstances.reduce(
      (sum, instance) => sum + instance.amountCents,
      0,
    );
    const hasPaycheck = income.paycheckAmountCents > 0;

    return {
      ...window,
      instances: windowInstances,
      committedAmountCents,
      remainingEstimateCents: hasPaycheck
        ? income.paycheckAmountCents - committedAmountCents - income.bufferAmountCents
        : null,
      commitmentRatio: hasPaycheck
        ? committedAmountCents / income.paycheckAmountCents
        : null,
    };
  });
  const start = parseISODate(startDateISO);
  const next30 = addDays(start, 30);
  const next30DaysCents = instances
    .filter((instance) => {
      const dueDate = parseISODate(instance.dueDate);
      return dueDate >= start && dueDate <= next30;
    })
    .reduce((sum, instance) => sum + instance.amountCents, 0);

  return {
    windows,
    instances,
    dueBeforeNextPaycheckCents: windows[0]?.committedAmountCents ?? 0,
    nextPaycheckCommittedCents: windows[1]?.committedAmountCents ?? 0,
    next30DaysCents,
    highestPressureDate: findHighestPressureDate(instances),
  };
}

export function createDefaultIncome(todayISO = getTodayISO()): IncomeSchedule {
  const today = parseISODate(todayISO);

  return {
    frequency: "biweekly",
    nextPayday: toISODate(nextWeekday(today, 5)),
    paycheckAmountCents: 145000,
    bufferAmountCents: 15000,
    semimonthlyDay1: 1,
    semimonthlyDay2: 15,
  };
}

function detectPaymentsFromLine(line: string, index: number): DetectedPayment[] {
  const cleaned = line.trim().replace(/\s+/g, " ");

  if (!cleaned || cleaned.length < 4) {
    return [];
  }

  const amountMatch = cleaned.match(/(?:\$|USD\s*)?(\d{1,5}(?:,\d{3})*(?:\.\d{2})?)/i);

  if (!amountMatch) {
    return [];
  }

  const amount = Number(amountMatch[1].replace(/,/g, ""));

  if (!Number.isFinite(amount) || amount <= 0) {
    return [];
  }

  const dueDate = findDate(cleaned) ?? toISODate(addDays(new Date(), 14));
  const recurrence = classifyRecurrence(cleaned);
  const type = classifyType(cleaned);
  const installmentCount = findInstallmentCount(cleaned);
  const merchantName = guessMerchantName(cleaned, amountMatch[0], type);
  const confidence =
    0.45 +
    (findDate(cleaned) ? 0.18 : 0) +
    (recurrence !== "none" ? 0.14 : 0) +
    (merchantName !== "Unknown merchant" ? 0.13 : 0) +
    (type !== "other" ? 0.08 : 0);

  return [
    {
      id: `detected-${index}-${merchantName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      merchantName,
      amountCents: centsFromDollars(amount),
      currency: "USD",
      firstDueDate: dueDate,
      recurrence:
        type === "bnpl" && installmentCount ? "custom_installments" : recurrence,
      type,
      installmentCount: type === "bnpl" ? installmentCount ?? 4 : undefined,
      confidence: Math.min(0.96, Number(confidence.toFixed(2))),
      sourceSnippet: cleaned.slice(0, 160),
      reviewStatus: "pending",
    },
  ];
}

function parseCsvRows(rawText: string) {
  const rows = rawText
    .split("\n")
    .map((row) => row.trim())
    .filter(Boolean);
  const [headerRow, ...bodyRows] = rows;
  const headers = headerRow?.split(",").map((cell) => cell.trim().toLowerCase());

  if (!headers || !bodyRows.length) {
    return rows;
  }

  const merchantIndex = findHeader(headers, ["merchant", "description", "name", "payee"]);
  const amountIndex = findHeader(headers, ["amount", "charge", "debit"]);
  const dateIndex = findHeader(headers, ["date", "due", "next"]);

  if (merchantIndex === -1 || amountIndex === -1) {
    return rows;
  }

  return bodyRows.map((row) => {
    const cells = row.split(",").map((cell) => cell.trim());
    return [
      cells[merchantIndex],
      cells[amountIndex],
      dateIndex >= 0 ? cells[dateIndex] : "",
    ]
      .filter(Boolean)
      .join(" ");
  });
}

function findHeader(headers: string[], candidates: string[]) {
  return headers.findIndex((header) =>
    candidates.some((candidate) => header.includes(candidate)),
  );
}

function findDate(line: string) {
  const isoMatch = line.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);

  if (isoMatch) {
    return toISODate(
      new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]), 12),
    );
  }

  const slashMatch = line.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);

  if (slashMatch) {
    const year = slashMatch[3]
      ? normalizeYear(Number(slashMatch[3]))
      : new Date().getFullYear();
    return toISODate(
      new Date(year, Number(slashMatch[1]) - 1, Number(slashMatch[2]), 12),
    );
  }

  const monthMatch = line.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:,\s*(20\d{2}))?\b/i,
  );

  if (monthMatch) {
    const month = monthNames.get(monthMatch[1].toLowerCase());
    const year = monthMatch[3] ? Number(monthMatch[3]) : new Date().getFullYear();

    if (month !== undefined) {
      return toISODate(new Date(year, month, Number(monthMatch[2]), 12));
    }
  }

  return null;
}

function classifyRecurrence(line: string): RecurrenceType {
  const lower = line.toLowerCase();

  if (/(biweekly|every 2 weeks|every two weeks)/.test(lower)) {
    return "biweekly";
  }

  if (/(weekly|every week)/.test(lower)) {
    return "weekly";
  }

  if (/(annual|annually|yearly|per year)/.test(lower)) {
    return "yearly";
  }

  if (/(monthly|subscription|recurring|renewal|renews|minimum payment|rent)/.test(lower)) {
    return "monthly";
  }

  return "none";
}

function classifyType(line: string): ObligationType {
  const lower = line.toLowerCase();

  if (/(affirm|klarna|afterpay|sezzle|pay later|installment)/.test(lower)) {
    return "bnpl";
  }

  if (/(netflix|spotify|hulu|disney|icloud|apple\.com\/bill|subscription|renewal|renews|gym|fitness)/.test(lower)) {
    return "subscription";
  }

  if (/(minimum payment|credit card|card minimum|loan minimum)/.test(lower)) {
    return "debt_minimum";
  }

  if (/\brent\b/.test(lower)) {
    return "rent";
  }

  if (/(bill|insurance|utility|phone|internet|electric|water)/.test(lower)) {
    return "bill";
  }

  return "other";
}

function findInstallmentCount(line: string) {
  const match = line.match(/\b(\d{1,2})\s*(?:payments|installments|x)\b/i);
  return match ? Math.max(2, Number(match[1])) : undefined;
}

function guessMerchantName(line: string, amountToken: string, type: ObligationType) {
  const beforeAmount = line.split(amountToken)[0]?.trim();
  const afterDue = line.replace(/your next payment of/i, "").replace(/is due.*/i, "");
  const candidate = (beforeAmount || afterDue)
    .replace(/\b(pending|posted|debit|credit|recurring|monthly|subscription|payment|due|next|to)\b/gi, "")
    .replace(/[$,\d./-]+/g, "")
    .trim();
  const cleaned = candidate
    .split(" ")
    .filter(Boolean)
    .slice(0, 4)
    .join(" ");

  if (cleaned.length >= 2) {
    return titleCase(cleaned);
  }

  if (type === "bnpl") {
    const provider = line.match(/\b(affirm|klarna|afterpay|sezzle)\b/i)?.[0];
    return provider ? titleCase(provider) : "BNPL payment";
  }

  return "Unknown merchant";
}

function dedupeDetections(payments: DetectedPayment[]) {
  const seen = new Set<string>();

  return payments.filter((payment) => {
    const key = `${payment.merchantName}-${payment.amountCents}-${payment.firstDueDate}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function generatePaymentInstances(
  payments: DetectedPayment[],
  startDateISO: string,
  horizonDays = 90,
) {
  const start = parseISODate(startDateISO);
  const horizon = addDays(start, horizonDays);

  return payments
    .flatMap((payment) => {
      if (payment.recurrence === "custom_installments") {
        return generateInstallmentInstances(payment, start, horizon);
      }

      const instances: PaymentInstance[] = [];
      let dueDate = parseISODate(payment.firstDueDate);

      while (dueDate < start) {
        dueDate = advanceByRecurrence(dueDate, payment.recurrence);
      }

      while (dueDate <= horizon) {
        instances.push({
          id: `${payment.id}-${toISODate(dueDate)}`,
          sourcePaymentId: payment.id,
          merchantName: payment.merchantName,
          type: payment.type,
          dueDate: toISODate(dueDate),
          amountCents: payment.amountCents,
        });

        if (payment.recurrence === "none") {
          break;
        }

        dueDate = advanceByRecurrence(dueDate, payment.recurrence);
      }

      return instances;
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

function generateInstallmentInstances(
  payment: DetectedPayment,
  start: Date,
  horizon: Date,
) {
  const count = Math.max(2, payment.installmentCount ?? 4);

  return Array.from({ length: count }, (_, index) => {
    const dueDate = addDays(parseISODate(payment.firstDueDate), index * 14);

    return {
      id: `${payment.id}-installment-${index + 1}`,
      sourcePaymentId: payment.id,
      merchantName: payment.merchantName,
      type: payment.type,
      dueDate: toISODate(dueDate),
      amountCents: payment.amountCents,
      installmentNumber: index + 1,
      installmentCount: count,
    };
  }).filter((instance) => {
    const dueDate = parseISODate(instance.dueDate);
    return dueDate >= start && dueDate <= horizon;
  });
}

function generatePaycheckWindows(income: IncomeSchedule, startDateISO: string) {
  const start = parseISODate(startDateISO);
  let windowStart = start;
  let windowEnd = normalizeNextPayday(income, start);
  const windows = [];

  for (let index = 0; index < 8; index += 1) {
    windows.push({
      id: `window-${index}-${toISODate(windowStart)}`,
      label:
        index === 0
          ? "Before next paycheck"
          : index === 1
            ? "Next paycheck committed"
            : `Paycheck window ${index + 1}`,
      startDate: toISODate(windowStart),
      endDate: toISODate(windowEnd),
      instances: [],
      committedAmountCents: 0,
      remainingEstimateCents: null,
      commitmentRatio: null,
    });
    windowStart = windowEnd;
    windowEnd = advancePayday(windowEnd, income);
  }

  return windows;
}

function normalizeNextPayday(income: IncomeSchedule, start: Date) {
  let payday = parseISODate(income.nextPayday);

  while (payday < start) {
    payday = advancePayday(payday, income);
  }

  return payday;
}

function advancePayday(date: Date, income: IncomeSchedule) {
  if (income.frequency === "weekly") {
    return addDays(date, 7);
  }

  if (income.frequency === "biweekly") {
    return addDays(date, 14);
  }

  if (income.frequency === "monthly") {
    return addMonths(date, 1);
  }

  return nextSemiMonthlyDateAfter(date, income.semimonthlyDay1, income.semimonthlyDay2);
}

function nextSemiMonthlyDateAfter(date: Date, day1: number, day2: number) {
  const days = [day1, day2].map(clampDay).sort((a, b) => a - b);

  for (let monthOffset = 0; monthOffset < 14; monthOffset += 1) {
    const monthStart = new Date(date.getFullYear(), date.getMonth() + monthOffset, 1, 12);
    const next = days
      .map((day) => new Date(monthStart.getFullYear(), monthStart.getMonth(), Math.min(day, daysInMonth(monthStart)), 12))
      .find((candidate) => candidate > date);

    if (next) {
      return next;
    }
  }

  return addMonths(date, 1);
}

function advanceByRecurrence(date: Date, recurrence: RecurrenceType) {
  if (recurrence === "weekly") {
    return addDays(date, 7);
  }

  if (recurrence === "biweekly") {
    return addDays(date, 14);
  }

  if (recurrence === "monthly") {
    return addMonths(date, 1);
  }

  if (recurrence === "yearly") {
    return addMonths(date, 12);
  }

  return addMonths(date, 1200);
}

function findHighestPressureDate(instances: PaymentInstance[]) {
  const byDate = new Map<string, number>();

  for (const instance of instances) {
    byDate.set(instance.dueDate, (byDate.get(instance.dueDate) ?? 0) + instance.amountCents);
  }

  return [...byDate.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\bCom\b/g, "COM");
}

function normalizeYear(year: number) {
  return year < 100 ? 2000 + year : year;
}

function nextWeekday(date: Date, weekday: number) {
  const next = new Date(date);
  const distance = (weekday + 7 - next.getDay()) % 7 || 7;
  next.setDate(next.getDate() + distance);
  return atNoon(next);
}

function atNoon(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
}

function daysInMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function clampDay(day: number) {
  return Math.max(1, Math.min(31, Math.floor(day)));
}
