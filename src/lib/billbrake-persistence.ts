import { User } from "@supabase/supabase-js";
import {
  DetectedPayment,
  ImportSourceType,
  IncomeSchedule,
  ObligationType,
  RecurrenceType,
  ReviewStatus,
} from "@/lib/billbrake";
import { supabase } from "@/lib/supabase";

type IncomeScheduleRow = {
  id: string;
  frequency: IncomeSchedule["frequency"];
  next_payday: string;
  paycheck_amount_cents: number | null;
  buffer_amount_cents: number | null;
  semimonthly_day_1: number | null;
  semimonthly_day_2: number | null;
};

type ImportBatchRow = {
  id: string;
  source_type: ImportSourceType;
  original_filename: string | null;
  file_url: string | null;
  raw_text: string | null;
  status: "uploaded" | "processing" | "needs_review" | "confirmed" | "failed";
};

type DetectedPaymentRow = {
  id: string;
  merchant_name: string;
  amount_cents: number | null;
  currency: string | null;
  first_due_date: string | null;
  recurrence: RecurrenceType | null;
  type: ObligationType | null;
  installment_count: number | null;
  confidence: number | null;
  source_snippet: string | null;
  review_status: ReviewStatus;
};

export type LoadedBillBrakeState = {
  income: IncomeSchedule | null;
  incomeScheduleId: string | null;
  importBatch: ImportBatchRow | null;
  detectedPayments: DetectedPayment[];
};

export type SaveBillBrakeStateInput = {
  user: User;
  income: IncomeSchedule;
  incomeScheduleId: string | null;
  sourceType: ImportSourceType;
  originalFilename: string | null;
  rawText: string;
  selectedFile: File | null;
  importBatchId: string | null;
  detectedPayments: DetectedPayment[];
};

export async function ensureAppUser(user: User) {
  const email = user.email ?? "";
  const { error } = await supabase.from("app_user").upsert({
    id: user.id,
    email,
  });

  if (error) {
    throw error;
  }
}

export async function loadBillBrakeState(
  userId: string,
): Promise<LoadedBillBrakeState> {
  const [incomeResult, importResult] = await Promise.all([
    supabase
      .from("income_schedule")
      .select("*")
      .eq("user_id", userId)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<IncomeScheduleRow>(),
    supabase
      .from("import_batch")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<ImportBatchRow>(),
  ]);

  if (incomeResult.error) {
    throw incomeResult.error;
  }

  if (importResult.error) {
    throw importResult.error;
  }

  const importBatch = importResult.data ?? null;
  let detectedPayments: DetectedPayment[] = [];

  if (importBatch) {
    const detectedResult = await supabase
      .from("detected_payment")
      .select("*")
      .eq("import_batch_id", importBatch.id)
      .order("created_at", { ascending: true })
      .returns<DetectedPaymentRow[]>();

    if (detectedResult.error) {
      throw detectedResult.error;
    }

    detectedPayments = (detectedResult.data ?? []).map(mapDetectedPaymentFromRow);
  }

  return {
    income: incomeResult.data ? mapIncomeFromRow(incomeResult.data) : null,
    incomeScheduleId: incomeResult.data?.id ?? null,
    importBatch,
    detectedPayments,
  };
}

export async function saveBillBrakeState({
  user,
  income,
  incomeScheduleId,
  sourceType,
  originalFilename,
  rawText,
  selectedFile,
  importBatchId,
  detectedPayments,
}: SaveBillBrakeStateInput) {
  await ensureAppUser(user);

  const savedIncomeScheduleId = await saveIncomeSchedule(
    user.id,
    income,
    incomeScheduleId,
  );
  const filePath = selectedFile
    ? await uploadImportFile(user.id, selectedFile)
    : null;
  const savedImportBatchId = await saveImportBatch({
    userId: user.id,
    importBatchId,
    sourceType,
    originalFilename,
    filePath,
    rawText,
    detectedPayments,
  });

  await replaceDetectedPayments(user.id, savedImportBatchId, detectedPayments);

  return {
    incomeScheduleId: savedIncomeScheduleId,
    importBatchId: savedImportBatchId,
  };
}

async function saveIncomeSchedule(
  userId: string,
  income: IncomeSchedule,
  incomeScheduleId: string | null,
) {
  const payload = {
    user_id: userId,
    frequency: income.frequency,
    next_payday: income.nextPayday,
    paycheck_amount_cents: income.paycheckAmountCents,
    buffer_amount_cents: income.bufferAmountCents,
    semimonthly_day_1: income.semimonthlyDay1,
    semimonthly_day_2: income.semimonthlyDay2,
    active: true,
    updated_at: new Date().toISOString(),
  };

  if (incomeScheduleId) {
    const { error } = await supabase
      .from("income_schedule")
      .update(payload)
      .eq("id", incomeScheduleId)
      .eq("user_id", userId);

    if (error) {
      throw error;
    }

    return incomeScheduleId;
  }

  const { data, error } = await supabase
    .from("income_schedule")
    .insert(payload)
    .select("id")
    .single<{ id: string }>();

  if (error) {
    throw error;
  }

  return data.id;
}

async function saveImportBatch({
  userId,
  importBatchId,
  sourceType,
  originalFilename,
  filePath,
  rawText,
  detectedPayments,
}: {
  userId: string;
  importBatchId: string | null;
  sourceType: ImportSourceType;
  originalFilename: string | null;
  filePath: string | null;
  rawText: string;
  detectedPayments: DetectedPayment[];
}) {
  const hasPending = detectedPayments.some(
    (payment) => payment.reviewStatus === "pending",
  );
  const payload = {
    user_id: userId,
    source_type: sourceType,
    original_filename: originalFilename,
    file_url: filePath,
    raw_text: rawText || null,
    status: hasPending ? "needs_review" : "confirmed",
    processed_at: new Date().toISOString(),
  };

  if (importBatchId) {
    const { error } = await supabase
      .from("import_batch")
      .update(payload)
      .eq("id", importBatchId)
      .eq("user_id", userId);

    if (error) {
      throw error;
    }

    return importBatchId;
  }

  const { data, error } = await supabase
    .from("import_batch")
    .insert(payload)
    .select("id")
    .single<{ id: string }>();

  if (error) {
    throw error;
  }

  return data.id;
}

async function replaceDetectedPayments(
  userId: string,
  importBatchId: string,
  detectedPayments: DetectedPayment[],
) {
  const deleteResult = await supabase
    .from("detected_payment")
    .delete()
    .eq("import_batch_id", importBatchId)
    .eq("user_id", userId);

  if (deleteResult.error) {
    throw deleteResult.error;
  }

  if (!detectedPayments.length) {
    return;
  }

  const { error } = await supabase.from("detected_payment").insert(
    detectedPayments.map((payment) => ({
      user_id: userId,
      import_batch_id: importBatchId,
      merchant_name: payment.merchantName || "Unknown merchant",
      amount_cents: payment.amountCents,
      currency: payment.currency,
      first_due_date: payment.firstDueDate || null,
      recurrence: payment.recurrence,
      type: payment.type,
      installment_count: payment.installmentCount ?? null,
      confidence: payment.confidence,
      source_snippet: payment.sourceSnippet,
      review_status: payment.reviewStatus,
      raw_json: payment,
    })),
  );

  if (error) {
    throw error;
  }
}

async function uploadImportFile(userId: string, file: File) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const path = `${userId}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from("imports").upload(path, file, {
    upsert: false,
  });

  if (error) {
    throw error;
  }

  return path;
}

function mapIncomeFromRow(row: IncomeScheduleRow): IncomeSchedule {
  return {
    frequency: row.frequency,
    nextPayday: row.next_payday,
    paycheckAmountCents: row.paycheck_amount_cents ?? 0,
    bufferAmountCents: row.buffer_amount_cents ?? 0,
    semimonthlyDay1: row.semimonthly_day_1 ?? 1,
    semimonthlyDay2: row.semimonthly_day_2 ?? 15,
  };
}

function mapDetectedPaymentFromRow(row: DetectedPaymentRow): DetectedPayment {
  return {
    id: row.id,
    merchantName: row.merchant_name,
    amountCents: row.amount_cents ?? 0,
    currency: "USD",
    firstDueDate: row.first_due_date ?? "",
    recurrence: row.recurrence ?? "none",
    type: row.type ?? "other",
    installmentCount: row.installment_count ?? undefined,
    confidence: Number(row.confidence ?? 0),
    sourceSnippet: row.source_snippet ?? "",
    reviewStatus: row.review_status,
  };
}
