"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { recordManualPaymentAction } from "../actions";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "../constants";
import { formatMoney } from "../format";
import { recordPaymentSchema, type RecordPaymentInput } from "../schemas";
import type { InvoiceActionResult } from "../types";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

interface RecordPaymentFormProps {
  invoiceId: string;
  balanceDue: number;
  currency: string;
}

export function RecordPaymentForm({
  invoiceId,
  balanceDue,
  currency,
}: RecordPaymentFormProps) {
  const [result, setResult] = useState<InvoiceActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  // Generated once (lazy initializer) and reused across every submit
  // attempt (including retries of the same click) so
  // record_manual_payment's idempotency check can actually recognize a
  // retry as the same request. A plain state value rather than a ref: the
  // React Compiler's react-hooks/refs rule flags ref.current access inside
  // a callback handed to an external hook like react-hook-form's
  // handleSubmit (it cannot prove the callback never runs during render),
  // and state reads/writes carry no such restriction while behaving
  // identically here — reset only on an explicit, successful submission.
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() =>
    crypto.randomUUID(),
  );
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<RecordPaymentInput>({
    resolver: zodResolver(recordPaymentSchema),
    defaultValues: {
      amount: "",
      paymentMethod: "bank_transfer",
      paidDate: todayIsoDate(),
      providerReference: "",
      notes: "",
    },
  });

  const submit = handleSubmit((values) => {
    setResult(null);
    startTransition(async () => {
      const response = await recordManualPaymentAction(
        invoiceId,
        values,
        idempotencyKey,
      );

      if (response?.fieldErrors) {
        for (const [field, messages] of Object.entries(response.fieldErrors)) {
          const message = messages?.[0];
          if (message) {
            setError(field as keyof RecordPaymentInput, { message });
          }
        }
      }

      if (response) {
        setResult(response);
        if (response.ok) {
          setIdempotencyKey(crypto.randomUUID());
          reset({
            amount: "",
            paymentMethod: "bank_transfer",
            paidDate: todayIsoDate(),
            providerReference: "",
            notes: "",
          });
        }
      }
    });
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Record a payment</CardTitle>
        <CardDescription>
          Remaining balance: {formatMoney(balanceDue, currency)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
          <FormField id="amount" label="Amount" required error={errors.amount?.message}>
            <Input id="amount" inputMode="decimal" {...register("amount")} />
          </FormField>
          <FormField
            id="paymentMethod"
            label="Payment method"
            required
            error={errors.paymentMethod?.message}
          >
            <Select id="paymentMethod" {...register("paymentMethod")}>
              {PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {PAYMENT_METHOD_LABELS[method]}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="paidDate" label="Paid date" required error={errors.paidDate?.message}>
            <Input id="paidDate" type="date" {...register("paidDate")} />
          </FormField>
          <FormField
            id="providerReference"
            label="Reference number"
            hint="Optional. E.g. bank transfer or GCash reference."
            error={errors.providerReference?.message}
          >
            <Input id="providerReference" {...register("providerReference")} />
          </FormField>
          <div className="sm:col-span-2">
            <FormField id="notes" label="Note" error={errors.notes?.message}>
              <Textarea id="notes" {...register("notes")} />
            </FormField>
          </div>
          <div className="sm:col-span-2 flex flex-col gap-2">
            {result ? (
              <p
                role={result.ok ? "status" : "alert"}
                className={result.ok ? "text-sm text-success" : "text-sm text-error"}
              >
                {result.message}
              </p>
            ) : null}
            <div className="flex justify-end">
              <Button type="submit" disabled={isPending || balanceDue <= 0}>
                {isPending ? "Recording…" : "Record payment"}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
