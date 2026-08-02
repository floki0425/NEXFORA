"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { updateInvoiceAction } from "../actions";
import { invoiceEditSchema, type InvoiceEditInput } from "../schemas";
import type { InvoiceActionResult, InvoiceDetail } from "../types";

function defaultsFromInvoice(invoice: InvoiceDetail): InvoiceEditInput {
  return {
    dueDate: invoice.due_date ?? "",
    discount: String(invoice.discount),
    tax: String(invoice.tax),
    notes: invoice.notes ?? "",
  };
}

export function InvoiceEditForm({ invoice }: { invoice: InvoiceDetail }) {
  const [result, setResult] = useState<InvoiceActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<InvoiceEditInput>({
    resolver: zodResolver(invoiceEditSchema),
    defaultValues: defaultsFromInvoice(invoice),
  });

  const submit = handleSubmit((values) => {
    setResult(null);
    startTransition(async () => {
      const response = await updateInvoiceAction(invoice.id, values);

      if (response?.fieldErrors) {
        for (const [field, messages] of Object.entries(response.fieldErrors)) {
          const message = messages?.[0];
          if (message) {
            setError(field as keyof InvoiceEditInput, { message });
          }
        }
      }

      if (response) {
        setResult(response);
      }
    });
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Invoice details</CardTitle>
          <CardDescription>
            Client: {invoice.clientName ?? "Not linked"}
            {invoice.projectName ? ` · Project: ${invoice.projectName}` : ""}.
            The client and project are set at creation and cannot be changed here.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <FormField id="dueDate" label="Due date" required error={errors.dueDate?.message}>
            <Input id="dueDate" type="date" {...register("dueDate")} />
          </FormField>
          <div />
          <FormField id="discount" label="Discount (PHP)" error={errors.discount?.message}>
            <Input id="discount" inputMode="decimal" {...register("discount")} />
          </FormField>
          <FormField id="tax" label="Tax (PHP)" error={errors.tax?.message}>
            <Input id="tax" inputMode="decimal" {...register("tax")} />
          </FormField>
          <div className="md:col-span-2">
            <FormField id="notes" label="Internal notes" hint="Never shown to the client." error={errors.notes?.message}>
              <Textarea id="notes" {...register("notes")} />
            </FormField>
          </div>
        </CardContent>
      </Card>

      {result ? (
        <p
          role={result.ok ? "status" : "alert"}
          className={result.ok ? "text-sm text-success" : "text-sm text-error"}
        >
          {result.message}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
