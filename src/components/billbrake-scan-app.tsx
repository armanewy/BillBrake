"use client";

import {
  Bell,
  CheckCircle2,
  Clipboard,
  Clock3,
  Database,
  FileText,
  LoaderCircle,
  LogOut,
  Mail,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCcw,
  Save,
  ScanLine,
  ShieldCheck,
  Trash2,
  Upload,
  UserRound,
  WalletCards,
  XCircle,
} from "lucide-react";
import { Session } from "@supabase/supabase-js";
import {
  ChangeEvent,
  FormEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  DetectedPayment,
  ImportSourceType,
  ObligationType,
  PayFrequency,
  RecurrenceType,
  addDays,
  buildPaycheckMap,
  centsFromDollars,
  createDefaultIncome,
  createSampleDetections,
  dollarsForInput,
  formatDate,
  formatExactMoney,
  formatMoney,
  getTodayISO,
  parseImportedText,
  parseISODate,
  toISODate,
  IncomeSchedule,
} from "@/lib/billbrake";
import {
  ensureAppUser,
  loadBillBrakeState,
  saveBillBrakeState,
} from "@/lib/billbrake-persistence";
import { supabase } from "@/lib/supabase";

const sourceOptions: {
  value: ImportSourceType;
  label: string;
  helper: string;
}[] = [
  {
    value: "screenshot",
    label: "Screenshot",
    helper: "Apple, Google Play, BNPL, or bill screens",
  },
  { value: "pdf", label: "PDF", helper: "Bank or card statements" },
  { value: "csv", label: "CSV", helper: "Bank export or spreadsheet" },
  { value: "pasted_text", label: "Paste", helper: "Receipt, email, or messy text" },
  { value: "email_forward", label: "Forward", helper: "Receipts and notices later" },
];

const frequencyOptions: { value: PayFrequency; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "semimonthly", label: "Semimonthly" },
  { value: "monthly", label: "Monthly" },
];

const typeOptions: { value: ObligationType; label: string }[] = [
  { value: "bnpl", label: "BNPL" },
  { value: "subscription", label: "Subscription" },
  { value: "bill", label: "Bill" },
  { value: "debt_minimum", label: "Debt minimum" },
  { value: "rent", label: "Rent" },
  { value: "other", label: "Other" },
];

const recurrenceOptions: { value: RecurrenceType; label: string }[] = [
  { value: "none", label: "One time" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
  { value: "custom_installments", label: "Installments" },
];

const samplePaste = `NETFLIX.COM 15.49 recurring monthly due 07/02/2026
APPLE.COM/BILL iCloud 2.99 monthly due July 6, 2026
Your next payment of $42.50 to Affirm is due July 3, 2026. 4 payments
PLANET FITNESS 10.00 monthly
Credit card minimum payment due $78.00 on 07/18/2026`;

export function BillBrakeScanApp() {
  const todayISO = useMemo(() => getTodayISO(), []);
  const [sourceType, setSourceType] = useState<ImportSourceType>("pasted_text");
  const [rawText, setRawText] = useState(samplePaste);
  const [detectedPayments, setDetectedPayments] = useState<DetectedPayment[]>([]);
  const [income, setIncome] = useState<IncomeSchedule>(() =>
    createDefaultIncome(todayISO),
  );
  const [status, setStatus] = useState(
    "Drop in a file, paste text, or try a sample scan.",
  );
  const [fileName, setFileName] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up">("sign-up");
  const [authStatus, setAuthStatus] = useState("");
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState("Sign in to save scans.");
  const [incomeScheduleId, setIncomeScheduleId] = useState<string | null>(null);
  const [importBatchId, setImportBatchId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const paycheckMap = useMemo(
    () => buildPaycheckMap(income, detectedPayments, todayISO),
    [detectedPayments, income, todayISO],
  );
  const pendingCount = detectedPayments.filter(
    (payment) => payment.reviewStatus === "pending",
  ).length;
  const acceptedCount = detectedPayments.filter(
    (payment) =>
      payment.reviewStatus === "accepted" || payment.reviewStatus === "edited",
  ).length;
  const ignoredCount = detectedPayments.filter(
    (payment) => payment.reviewStatus === "ignored",
  ).length;
  const signedInUser = session?.user ?? null;

  const loadSavedDataForUser = useCallback(async (user: Session["user"]) => {
    setIsDataLoading(true);
    setSaveStatus("Loading saved data...");

    try {
      await ensureAppUser(user);
      const loaded = await loadBillBrakeState(user.id);

      if (loaded.income) {
        setIncome(loaded.income);
        setIncomeScheduleId(loaded.incomeScheduleId);
      }

      if (loaded.importBatch) {
        setImportBatchId(loaded.importBatch.id);
        setSourceType(loaded.importBatch.source_type);
        setRawText(loaded.importBatch.raw_text ?? "");
        setFileName(loaded.importBatch.original_filename ?? "saved-import");
        setSelectedFile(null);
        setDetectedPayments(loaded.detectedPayments);
        setStatus(
          loaded.detectedPayments.length
            ? `Loaded ${loaded.detectedPayments.length} saved detected payment${
                loaded.detectedPayments.length === 1 ? "" : "s"
              }.`
            : "Loaded your latest saved import batch.",
        );
      } else {
        setStatus("Signed in. Start a scan or try sample data.");
      }

      setSaveStatus("Signed in. Changes are ready to save.");
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : "Load failed.");
    } finally {
      setIsDataLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) {
        return;
      }

      setSession(data.session);
      setIsAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsAuthLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const user = session?.user;

    if (!user) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void loadSavedDataForUser(user);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadSavedDataForUser, session]);

  function runSampleScan() {
    setDetectedPayments(createSampleDetections(todayISO));
    setFileName("sample-scan.txt");
    setSelectedFile(null);
    setImportBatchId(null);
    setStatus("We found 5 possible payments. Review them before saving.");
    markUnsaved();
  }

  function runPasteImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const detections = parseImportedText(rawText, sourceType);
    setDetectedPayments(detections);
    setFileName(sourceType === "csv" ? "pasted.csv" : "pasted-text.txt");
    setSelectedFile(null);
    setImportBatchId(null);
    setStatus(
      detections.length
        ? `We found ${detections.length} possible payment${
            detections.length === 1 ? "" : "s"
          }. Review them before saving.`
        : "No likely payments found. Try sample scan or paste more detail.",
    );
    markUnsaved();
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setFileName(file.name);
    setSelectedFile(file);
    setImportBatchId(null);
    const lowerName = file.name.toLowerCase();

    if (
      file.type.includes("csv") ||
      lowerName.endsWith(".csv") ||
      file.type.startsWith("text/") ||
      lowerName.endsWith(".txt")
    ) {
      const text = await file.text();
      const detections = parseImportedText(
        text,
        lowerName.endsWith(".csv") ? "csv" : "pasted_text",
      );
      setRawText(text);
      setDetectedPayments(detections);
      setStatus(
        detections.length
          ? `Processed ${file.name} and found ${detections.length} possible payment${
              detections.length === 1 ? "" : "s"
            }.`
          : `Processed ${file.name}, but no likely payments were found.`,
      );
      markUnsaved();
      return;
    }

    setStatus(
      `${file.name} is staged. PDF and screenshot OCR need the server extraction pipeline; use sample scan or paste text in this prototype.`,
    );
    markUnsaved();
  }

  function updatePayment(id: string, patch: Partial<DetectedPayment>) {
    setDetectedPayments((payments) =>
      payments.map((payment) =>
        payment.id === id
          ? {
              ...payment,
              ...patch,
              reviewStatus:
                patch.reviewStatus ?? (payment.reviewStatus === "pending" ? "edited" : payment.reviewStatus),
            }
          : payment,
      ),
    );
    markUnsaved();
  }

  function addManualPayment() {
    setDetectedPayments((payments) => [
      ...payments,
      {
        id: `manual-${Date.now()}`,
        merchantName: "Manual payment",
        amountCents: 0,
        currency: "USD",
        firstDueDate: toISODate(addDays(parseISODate(todayISO), 7)),
        recurrence: "monthly",
        type: "bill",
        confidence: 1,
        sourceSnippet: "Added manually",
        reviewStatus: "edited",
      },
    ]);
    markUnsaved();
  }

  function acceptAllPending() {
    setDetectedPayments((payments) =>
      payments.map((payment) =>
        payment.reviewStatus === "pending"
          ? { ...payment, reviewStatus: "accepted" }
          : payment,
      ),
    );
    markUnsaved();
  }

  function resetImport() {
    setDetectedPayments([]);
    setFileName("");
    setSelectedFile(null);
    setImportBatchId(null);
    setStatus("Drop in a file, paste text, or try a sample scan.");
    markUnsaved();
  }

  async function copyForwardingAddress() {
    await navigator.clipboard.writeText("arman@in.billbrake.app");
    setCopyStatus("Copied forwarding address.");
  }

  function updateIncome(patch: Partial<IncomeSchedule>) {
    setIncome((current) => ({ ...current, ...patch }));
    markUnsaved();
  }

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthStatus(authMode === "sign-up" ? "Creating account..." : "Signing in...");
    setIsAuthLoading(true);

    const authResult =
      authMode === "sign-up"
        ? await supabase.auth.signUp({
            email: authEmail,
            password: authPassword,
          })
        : await supabase.auth.signInWithPassword({
            email: authEmail,
            password: authPassword,
          });

    setIsAuthLoading(false);

    if (authResult.error) {
      setAuthStatus(authResult.error.message);
      return;
    }

    if (authResult.data.session) {
      setAuthStatus("Signed in.");
      return;
    }

    setAuthStatus("Check your email if confirmation is enabled.");
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setSession(null);
    setIncomeScheduleId(null);
    setImportBatchId(null);
    setSaveStatus("Sign in to save scans.");
  }

  async function handleLoadSavedData() {
    if (!signedInUser) {
      setSaveStatus("Sign in first.");
      return;
    }

    setIsDataLoading(true);
    setSaveStatus("Loading saved data...");

    await loadSavedDataForUser(signedInUser);
  }

  async function handleSaveState() {
    if (!signedInUser) {
      setSaveStatus("Sign in first.");
      return;
    }

    setIsSaving(true);
    setSaveStatus("Saving to Supabase...");

    try {
      const saved = await saveBillBrakeState({
        user: signedInUser,
        income,
        incomeScheduleId,
        sourceType,
        originalFilename: fileName || selectedFile?.name || null,
        rawText,
        selectedFile,
        importBatchId,
        detectedPayments,
      });
      setIncomeScheduleId(saved.incomeScheduleId);
      setImportBatchId(saved.importBatchId);
      setSelectedFile(null);
      setSaveStatus("Saved to Supabase.");
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setIsSaving(false);
    }
  }

  function markUnsaved() {
    if (signedInUser) {
      setSaveStatus("Unsaved changes.");
    }
  }

  return (
    <div className="min-h-screen bg-[#f6f7f2] text-[#141711]">
      <header className="border-b border-[#d9ded1] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <a href="#top" className="flex items-center gap-3 font-semibold">
            <span className="grid size-9 place-items-center rounded-lg bg-[#141711] text-white">
              <ScanLine aria-hidden="true" size={19} />
            </span>
            <span className="text-lg">BillBrake Scan</span>
          </a>
          <nav className="hidden items-center gap-6 text-sm font-medium text-[#50594a] md:flex">
            <a href="#scan" className="hover:text-[#141711]">
              Scan
            </a>
            <a href="#review" className="hover:text-[#141711]">
              Review
            </a>
            <a href="#map" className="hover:text-[#141711]">
              Paycheck Map
            </a>
          </nav>
          <div className="hidden items-center gap-2 text-sm text-[#50594a] lg:flex">
            <UserRound aria-hidden="true" size={16} />
            <span>{signedInUser?.email ?? "Not signed in"}</span>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="border-b border-[#d9ded1] bg-[#eef4ee]">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:px-8 lg:py-14">
            <div className="flex flex-col justify-center">
              <p className="mb-4 flex w-fit items-center gap-2 rounded-lg border border-[#b5d6c7] bg-white px-3 py-2 text-sm font-semibold text-[#176b56]">
                <ShieldCheck aria-hidden="true" size={16} />
                No bank login required
              </p>
              <h1 className="max-w-2xl text-4xl font-semibold leading-tight tracking-normal sm:text-5xl">
                Your next paycheck may already be spent.
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-8 text-[#4f5949]">
                Upload a statement, screenshot, CSV, or forwarded receipt.
                BillBrake finds subscriptions, BNPL payments, bills, and
                renewals, then shows which paycheck they hit.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <a href="#scan" className={heroButtonClassName}>
                  <ScanLine aria-hidden="true" size={18} />
                  Scan my payments
                </a>
                <button
                  type="button"
                  onClick={runSampleScan}
                  className={heroSecondaryButtonClassName}
                >
                  <RefreshCcw aria-hidden="true" size={18} />
                  Try sample scan
                </button>
              </div>
              <p className="mt-4 max-w-lg text-sm leading-6 text-[#65715f]">
                You review everything before saving. The app says what it found,
                not that it found everything.
              </p>
            </div>

            <ImportPanel
              sourceType={sourceType}
              setSourceType={setSourceType}
              rawText={rawText}
              setRawText={setRawText}
              status={status}
              fileName={fileName}
              onPasteSubmit={runPasteImport}
              onFileChange={handleFileChange}
              onSampleScan={runSampleScan}
              onCopyForwardingAddress={copyForwardingAddress}
              copyStatus={copyStatus}
            />
          </div>
        </section>

        <section className="bg-white">
          <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_390px] lg:px-8 lg:py-10">
            <div className="space-y-6">
              <Panel
                id="review"
                title="Confirm what we found"
                icon={<CheckCircle2 size={18} />}
                action={
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={acceptAllPending}
                      className={smallButtonClassName}
                      disabled={!pendingCount}
                    >
                      <CheckCircle2 aria-hidden="true" size={16} />
                      Accept pending
                    </button>
                    <button
                      type="button"
                      onClick={addManualPayment}
                      className={smallButtonClassName}
                    >
                      <Plus aria-hidden="true" size={16} />
                      Add manually
                    </button>
                  </div>
                }
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  <Metric label="Possible payments" value={`${detectedPayments.length}`} />
                  <Metric label="Accepted or edited" value={`${acceptedCount}`} />
                  <Metric label="Ignored" value={`${ignoredCount}`} />
                </div>

                <div className="mt-4 space-y-3">
                  {detectedPayments.length ? (
                    detectedPayments.map((payment) => (
                      <DetectedPaymentCard
                        key={payment.id}
                        payment={payment}
                        onChange={(patch) => updatePayment(payment.id, patch)}
                      />
                    ))
                  ) : (
                    <EmptyReview onSampleScan={runSampleScan} />
                  )}
                </div>
              </Panel>

              <Panel
                id="map"
                title="Paycheck Map"
                icon={<WalletCards size={18} />}
                action={
                  <button
                    type="button"
                    onClick={resetImport}
                    className={smallButtonClassName}
                  >
                    <Trash2 aria-hidden="true" size={16} />
                    Clear scan
                  </button>
                }
              >
                <div className="grid gap-3 md:grid-cols-4">
                  <Metric
                    label="Due before next paycheck"
                    value={formatMoney(paycheckMap.dueBeforeNextPaycheckCents)}
                  />
                  <Metric
                    label="Next paycheck committed"
                    value={formatMoney(paycheckMap.nextPaycheckCommittedCents)}
                  />
                  <Metric
                    label="Next 30 days"
                    value={formatMoney(paycheckMap.next30DaysCents)}
                  />
                  <Metric
                    label="Highest pressure date"
                    value={
                      paycheckMap.highestPressureDate
                        ? formatDate(paycheckMap.highestPressureDate)
                        : "--"
                    }
                  />
                </div>

                <div className="mt-5 grid gap-3 xl:grid-cols-2">
                  {paycheckMap.windows.slice(0, 6).map((window) => (
                    <WindowCard key={window.id} window={window} />
                  ))}
                </div>
              </Panel>
            </div>

            <aside className="space-y-6">
              <AuthPanel
                email={authEmail}
                password={authPassword}
                mode={authMode}
                status={authStatus}
                session={session}
                isLoading={isAuthLoading}
                onEmailChange={setAuthEmail}
                onPasswordChange={setAuthPassword}
                onModeChange={setAuthMode}
                onSubmit={handleAuthSubmit}
                onSignOut={handleSignOut}
              />

              <Panel title="Database" icon={<Database size={18} />}>
                <div className="space-y-3">
                  <p className="text-sm leading-6 text-[#586451]">
                    {saveStatus}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={handleSaveState}
                      disabled={!signedInUser || isSaving}
                      className={primaryButtonClassName}
                    >
                      {isSaving ? (
                        <LoaderCircle
                          aria-hidden="true"
                          className="animate-spin"
                          size={17}
                        />
                      ) : (
                        <Save aria-hidden="true" size={17} />
                      )}
                      Save scan
                    </button>
                    <button
                      type="button"
                      onClick={handleLoadSavedData}
                      disabled={!signedInUser || isDataLoading}
                      className={secondaryButtonClassName}
                    >
                      {isDataLoading ? (
                        <LoaderCircle
                          aria-hidden="true"
                          className="animate-spin"
                          size={17}
                        />
                      ) : (
                        <RefreshCcw aria-hidden="true" size={17} />
                      )}
                      Load
                    </button>
                  </div>
                </div>
              </Panel>

              <Panel title="Payday setup" icon={<Clock3 size={18} />}>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    {frequencyOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => updateIncome({ frequency: option.value })}
                        className={`h-10 rounded-lg border px-3 text-sm font-semibold transition ${
                          income.frequency === option.value
                            ? "border-[#141711] bg-[#141711] text-white"
                            : "border-[#c5cdbb] bg-white text-[#4e5948] hover:border-[#899778]"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <Field label="Next payday">
                    <input
                      type="date"
                      value={income.nextPayday}
                      onChange={(event) =>
                        updateIncome({ nextPayday: event.target.value })
                      }
                      className={inputClassName}
                    />
                  </Field>
                  <Field label="Paycheck amount">
                    <MoneyInput
                      value={income.paycheckAmountCents}
                      onChange={(paycheckAmountCents) =>
                        updateIncome({ paycheckAmountCents })
                      }
                    />
                  </Field>
                  <Field label="Desired buffer">
                    <MoneyInput
                      value={income.bufferAmountCents}
                      onChange={(bufferAmountCents) =>
                        updateIncome({ bufferAmountCents })
                      }
                    />
                  </Field>
                  {income.frequency === "semimonthly" ? (
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Day 1">
                        <NumberInput
                          value={income.semimonthlyDay1}
                          min={1}
                          max={31}
                          onChange={(semimonthlyDay1) =>
                            updateIncome({ semimonthlyDay1 })
                          }
                        />
                      </Field>
                      <Field label="Day 2">
                        <NumberInput
                          value={income.semimonthlyDay2}
                          min={1}
                          max={31}
                          onChange={(semimonthlyDay2) =>
                            updateIncome({ semimonthlyDay2 })
                          }
                        />
                      </Field>
                    </div>
                  ) : null}
                </div>
              </Panel>

              <Panel title="Extraction JSON" icon={<FileText size={18} />}>
                <pre className="max-h-[340px] overflow-auto rounded-lg bg-[#151a20] p-4 text-xs leading-5 text-[#e4f2df]">
                  {JSON.stringify(
                    {
                      payments: detectedPayments.slice(0, 4).map((payment) => ({
                        merchant_name: payment.merchantName,
                        amount: payment.amountCents / 100,
                        currency: payment.currency,
                        first_due_date: payment.firstDueDate,
                        recurrence: payment.recurrence,
                        category: payment.type,
                        confidence: payment.confidence,
                        source_snippet: payment.sourceSnippet,
                      })),
                    },
                    null,
                    2,
                  )}
                </pre>
              </Panel>

              <Panel title="Trust guardrails" icon={<ShieldCheck size={18} />}>
                <div className="space-y-3 text-sm leading-6 text-[#586451]">
                  <Guardrail icon={<CheckCircle2 size={16} />}>
                    Here are the payments we found. Add anything missing.
                  </Guardrail>
                  <Guardrail icon={<Pencil size={16} />}>
                    Nothing is saved until you accept or edit a detection.
                  </Guardrail>
                  <Guardrail icon={<Bell size={16} />}>
                    Reminders stay email-only for the first MVP.
                  </Guardrail>
                </div>
              </Panel>
            </aside>
          </div>
        </section>
      </main>
    </div>
  );
}

function ImportPanel({
  sourceType,
  setSourceType,
  rawText,
  setRawText,
  status,
  fileName,
  onPasteSubmit,
  onFileChange,
  onSampleScan,
  onCopyForwardingAddress,
  copyStatus,
}: {
  sourceType: ImportSourceType;
  setSourceType: (sourceType: ImportSourceType) => void;
  rawText: string;
  setRawText: (rawText: string) => void;
  status: string;
  fileName: string;
  onPasteSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSampleScan: () => void;
  onCopyForwardingAddress: () => void;
  copyStatus: string;
}) {
  return (
    <section
      id="scan"
      className="rounded-lg border border-[#cbd8c1] bg-white p-4 shadow-sm"
    >
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Scan source</h2>
          <p className="mt-1 text-sm text-[#65715f]">{status}</p>
        </div>
        <ScanLine aria-hidden="true" className="text-[#176b56]" size={24} />
      </div>

      <div className="grid gap-2 sm:grid-cols-5">
        {sourceOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setSourceType(option.value)}
            className={`min-h-20 rounded-lg border p-3 text-left transition ${
              sourceType === option.value
                ? "border-[#176b56] bg-[#ecf7f1]"
                : "border-[#dce3d6] bg-white hover:border-[#9cad8f]"
            }`}
          >
            <span className="block text-sm font-semibold">{option.label}</span>
            <span className="mt-1 block text-xs leading-4 text-[#65715f]">
              {option.helper}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-lg border border-dashed border-[#b9c7af] bg-[#fbfcf8] p-4">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-3 text-center">
            <span className="grid size-12 place-items-center rounded-lg bg-[#e6efe0] text-[#176b56]">
              <Upload aria-hidden="true" size={24} />
            </span>
            <span className="text-sm font-semibold">
              Upload screenshot, PDF, CSV, or text
            </span>
            <span className="text-xs leading-5 text-[#65715f]">
              CSV and text parse in this prototype. PDF and screenshot OCR are
              staged for the server extraction pipeline.
            </span>
            <input
              type="file"
              accept=".csv,.txt,.pdf,image/*"
              onChange={onFileChange}
              className="sr-only"
            />
          </label>
          {fileName ? (
            <p className="mt-3 rounded-md bg-white px-3 py-2 text-xs text-[#50594a]">
              Current file: {fileName}
            </p>
          ) : null}
        </div>

        <form onSubmit={onPasteSubmit} className="space-y-3">
          <textarea
            value={rawText}
            onChange={(event) => setRawText(event.target.value)}
            className="min-h-44 w-full resize-y rounded-lg border border-[#c5cdbb] bg-white p-3 text-sm leading-6 outline-none transition placeholder:text-[#8a9384] focus:border-[#176b56] focus:ring-2 focus:ring-[#b5d6c7]"
            placeholder="Paste statement rows, receipt text, renewal emails, or BNPL schedule text..."
          />
          <div className="grid gap-3 2xl:grid-cols-3">
            <button type="submit" className={primaryButtonClassName}>
              <ReceiptText aria-hidden="true" size={17} />
              Parse text
            </button>
            <button
              type="button"
              onClick={onSampleScan}
              className={secondaryButtonClassName}
            >
              <RefreshCcw aria-hidden="true" size={17} />
              Sample scan
            </button>
            <button
              type="button"
              onClick={onCopyForwardingAddress}
              className={secondaryButtonClassName}
            >
              <Mail aria-hidden="true" size={17} />
              Forward email
            </button>
          </div>
          <p className="text-xs leading-5 text-[#65715f]">
            Forwarding address: <span className="font-semibold">arman@in.billbrake.app</span>
            {copyStatus ? ` - ${copyStatus}` : ""}
          </p>
        </form>
      </div>
    </section>
  );
}

function AuthPanel({
  email,
  password,
  mode,
  status,
  session,
  isLoading,
  onEmailChange,
  onPasswordChange,
  onModeChange,
  onSubmit,
  onSignOut,
}: {
  email: string;
  password: string;
  mode: "sign-in" | "sign-up";
  status: string;
  session: Session | null;
  isLoading: boolean;
  onEmailChange: (email: string) => void;
  onPasswordChange: (password: string) => void;
  onModeChange: (mode: "sign-in" | "sign-up") => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSignOut: () => void;
}) {
  if (session?.user) {
    return (
      <Panel title="Account" icon={<UserRound size={18} />}>
        <div className="space-y-3">
          <div className="rounded-lg border border-[#dfe6d8] bg-[#fbfcf8] p-3">
            <p className="text-xs font-semibold uppercase tracking-normal text-[#65715f]">
              Signed in
            </p>
            <p className="mt-1 truncate text-sm font-semibold">
              {session.user.email}
            </p>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className={secondaryButtonClassName}
          >
            <LogOut aria-hidden="true" size={17} />
            Sign out
          </button>
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Account" icon={<UserRound size={18} />}>
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onModeChange("sign-up")}
            className={`h-10 rounded-lg border px-3 text-sm font-semibold transition ${
              mode === "sign-up"
                ? "border-[#141711] bg-[#141711] text-white"
                : "border-[#c5cdbb] bg-white text-[#4e5948] hover:border-[#899778]"
            }`}
          >
            Create account
          </button>
          <button
            type="button"
            onClick={() => onModeChange("sign-in")}
            className={`h-10 rounded-lg border px-3 text-sm font-semibold transition ${
              mode === "sign-in"
                ? "border-[#141711] bg-[#141711] text-white"
                : "border-[#c5cdbb] bg-white text-[#4e5948] hover:border-[#899778]"
            }`}
          >
            Sign in
          </button>
        </div>
        <Field label="Email">
          <input
            type="email"
            required
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            className={inputClassName}
            placeholder="you@example.com"
          />
        </Field>
        <Field label="Password">
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            className={inputClassName}
            placeholder="At least 6 characters"
          />
        </Field>
        <button
          type="submit"
          disabled={isLoading}
          className={primaryButtonClassName}
        >
          {isLoading ? (
            <LoaderCircle aria-hidden="true" className="animate-spin" size={17} />
          ) : (
            <UserRound aria-hidden="true" size={17} />
          )}
          {mode === "sign-up" ? "Create account" : "Sign in"}
        </button>
        {status ? (
          <p className="text-xs leading-5 text-[#65715f]">{status}</p>
        ) : (
          <p className="text-xs leading-5 text-[#65715f]">
            Sign in to persist scans, payday settings, and reviewed detections.
          </p>
        )}
      </form>
    </Panel>
  );
}

function Panel({
  id,
  title,
  icon,
  action,
  children,
}: {
  id?: string;
  title: string;
  icon: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="rounded-lg border border-[#d9ded1] bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <span className="text-[#176b56]">{icon}</span>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#e0e7da] bg-[#fbfcf8] p-4">
      <p className="text-xs font-semibold uppercase tracking-normal text-[#65715f]">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function DetectedPaymentCard({
  payment,
  onChange,
}: {
  payment: DetectedPayment;
  onChange: (patch: Partial<DetectedPayment>) => void;
}) {
  const accepted =
    payment.reviewStatus === "accepted" || payment.reviewStatus === "edited";
  const ignored = payment.reviewStatus === "ignored";

  return (
    <article
      className={`rounded-lg border p-4 ${
        accepted
          ? "border-[#a9cdbb] bg-[#f4fbf6]"
          : ignored
            ? "border-[#e5c0b8] bg-[#fff7f5]"
            : "border-[#dfe6d8] bg-white"
      }`}
    >
      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-[1.25fr_0.7fr_0.9fr_0.95fr_0.95fr_auto]">
        <Field label="Merchant">
          <input
            value={payment.merchantName}
            onChange={(event) => onChange({ merchantName: event.target.value })}
            className={inputClassName}
          />
        </Field>
        <Field label="Amount">
          <MoneyInput
            value={payment.amountCents}
            onChange={(amountCents) => onChange({ amountCents })}
          />
        </Field>
        <Field label="First due">
          <input
            type="date"
            value={payment.firstDueDate}
            onChange={(event) => onChange({ firstDueDate: event.target.value })}
            className={inputClassName}
          />
        </Field>
        <Field label="Type">
          <select
            value={payment.type}
            onChange={(event) =>
              onChange({ type: event.target.value as ObligationType })
            }
            className={inputClassName}
          >
            {typeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Recurrence">
          <select
            value={payment.recurrence}
            onChange={(event) =>
              onChange({ recurrence: event.target.value as RecurrenceType })
            }
            className={inputClassName}
          >
            {recurrenceOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            aria-label={`Accept ${payment.merchantName}`}
            onClick={() => onChange({ reviewStatus: "accepted" })}
            className="grid size-10 place-items-center rounded-lg border border-[#b7d1bd] bg-white text-[#176b56] transition hover:border-[#176b56]"
          >
            <CheckCircle2 aria-hidden="true" size={18} />
          </button>
          <button
            type="button"
            aria-label={`Ignore ${payment.merchantName}`}
            onClick={() => onChange({ reviewStatus: "ignored" })}
            className="grid size-10 place-items-center rounded-lg border border-[#e1bbb2] bg-white text-[#a23a2a] transition hover:border-[#a23a2a]"
          >
            <XCircle aria-hidden="true" size={18} />
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-[#e6eadf] pt-3 text-xs text-[#65715f]">
        <span className="rounded-md bg-white px-2 py-1 font-semibold">
          Confidence {Math.round(payment.confidence * 100)}%
        </span>
        <span className="min-w-0 flex-1 truncate">
          Source: {payment.sourceSnippet}
        </span>
        <span
          className={`rounded-md px-2 py-1 font-semibold ${
            accepted
              ? "bg-[#deefe3] text-[#176b56]"
              : ignored
                ? "bg-[#ffe1da] text-[#8b2e22]"
                : "bg-[#fff0c7] text-[#76510b]"
          }`}
        >
          {payment.reviewStatus}
        </span>
      </div>
    </article>
  );
}

function WindowCard({
  window,
}: {
  window: ReturnType<typeof buildPaycheckMap>["windows"][number];
}) {
  const ratio = Math.min(100, Math.max(0, Math.round((window.commitmentRatio ?? 0) * 100)));

  return (
    <article className="rounded-lg border border-[#dfe6d8] bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold">{window.label}</h3>
          <p className="mt-1 text-xs text-[#65715f]">
            {formatDate(window.startDate)} to {formatDate(window.endDate)}
          </p>
        </div>
        <p className="text-xl font-semibold text-[#176b56]">
          {formatMoney(window.committedAmountCents)}
        </p>
      </div>
      <div className="mt-4">
        <div className="mb-1 flex justify-between text-xs text-[#65715f]">
          <span>Committed</span>
          <span>{ratio}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-md bg-[#e9eee2]">
          <div
            className={`h-full rounded-md ${
              ratio > 80 ? "bg-[#b93a2b]" : ratio > 55 ? "bg-[#c88420]" : "bg-[#176b56]"
            }`}
            style={{ width: `${ratio}%` }}
          />
        </div>
      </div>
      <div className="mt-4 border-t border-[#edf0e8] pt-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-[#65715f]">Estimated unassigned</span>
          <span
            className={`font-semibold ${
              (window.remainingEstimateCents ?? 0) < 0 ? "text-[#a23a2a]" : ""
            }`}
          >
            {window.remainingEstimateCents === null
              ? "--"
              : formatMoney(window.remainingEstimateCents)}
          </span>
        </div>
        <ul className="mt-3 space-y-2">
          {window.instances.length ? (
            window.instances.slice(0, 4).map((instance) => (
              <li
                key={instance.id}
                className="flex items-center justify-between gap-3 rounded-md bg-[#f2f5ee] px-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate">
                  {formatDate(instance.dueDate)} - {instance.merchantName}
                </span>
                <span className="shrink-0 font-semibold">
                  {formatExactMoney(instance.amountCents)}
                </span>
              </li>
            ))
          ) : (
            <li className="rounded-md bg-[#f2f5ee] px-3 py-2 text-sm text-[#65715f]">
              No accepted payments in this window.
            </li>
          )}
        </ul>
      </div>
    </article>
  );
}

function EmptyReview({ onSampleScan }: { onSampleScan: () => void }) {
  return (
    <div className="rounded-lg border border-dashed border-[#c6d0bd] bg-[#fbfcf8] p-6 text-center">
      <Clipboard aria-hidden="true" className="mx-auto text-[#176b56]" size={28} />
      <h3 className="mt-3 text-base font-semibold">No detected payments yet</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#65715f]">
        Scan or paste payment artifacts first. BillBrake will show candidate
        payments here so you can accept, edit, or ignore each one.
      </p>
      <button
        type="button"
        onClick={onSampleScan}
        className={`${secondaryButtonClassName} mx-auto mt-4`}
      >
        <RefreshCcw aria-hidden="true" size={17} />
        Try sample scan
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-normal text-[#65715f]">
        {label}
      </span>
      {children}
    </label>
  );
}

function MoneyInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <input
      type="number"
      min="0"
      step="0.01"
      value={dollarsForInput(value)}
      onChange={(event) => onChange(centsFromDollars(event.target.value))}
      className={inputClassName}
    />
  );
}

function NumberInput({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <input
      type="number"
      min={min}
      max={max}
      value={value}
      onChange={(event) => {
        const parsed = Number(event.target.value);
        onChange(Math.max(min, Math.min(max, Number.isFinite(parsed) ? parsed : min)));
      }}
      className={inputClassName}
    />
  );
}

function Guardrail({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="mt-1 text-[#176b56]">{icon}</span>
      <p>{children}</p>
    </div>
  );
}

const inputClassName =
  "h-10 w-full rounded-lg border border-[#c5cdbb] bg-white px-3 text-sm text-[#141711] outline-none transition placeholder:text-[#8a9384] focus:border-[#176b56] focus:ring-2 focus:ring-[#b5d6c7]";

const primaryButtonClassName =
  "inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-[#141711] px-3 text-sm font-semibold text-white transition hover:bg-[#2b3028]";

const secondaryButtonClassName =
  "inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-[#c5cdbb] bg-white px-3 text-sm font-semibold text-[#253020] transition hover:border-[#899778]";

const smallButtonClassName =
  "inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-[#c5cdbb] bg-white px-3 text-sm font-semibold text-[#253020] transition hover:border-[#899778] disabled:cursor-not-allowed disabled:opacity-50";

const heroButtonClassName =
  "inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#141711] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#2b3028]";

const heroSecondaryButtonClassName =
  "inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[#b7c4ae] bg-white px-4 text-sm font-semibold text-[#253020] transition hover:border-[#899778]";
