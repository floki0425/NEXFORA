"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import {
  addProposalItemAction,
  removeProposalItemAction,
  updateProposalItemAction,
} from "../actions";
import { formatMoney } from "../format";
import { proposalItemFormSchema, type ProposalItemFormInput } from "../schemas";
import type { ProposalItemRow } from "../types";

interface ItemFormProps {
  defaultValues: ProposalItemFormInput;
  onSubmit: (values: ProposalItemFormInput) => void;
  isPending: boolean;
  submitLabel: string;
  onCancel?: () => void;
}

function ItemForm({
  defaultValues,
  onSubmit,
  isPending,
  submitLabel,
  onCancel,
}: ItemFormProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProposalItemFormInput>({
    resolver: zodResolver(proposalItemFormSchema),
    defaultValues,
  });

  const submit = handleSubmit((values) => {
    onSubmit(values);
    reset(defaultValues.name ? values : { name: "", description: "", quantity: "1", unitPrice: "0" });
  });

  return (
    <form onSubmit={submit} noValidate className="grid gap-3 sm:grid-cols-[1fr_6rem_8rem_auto]">
      <FormField id="name" label="Item name" error={errors.name?.message}>
        <Input id="name" {...register("name")} />
      </FormField>
      <FormField id="quantity" label="Qty" error={errors.quantity?.message}>
        <Input id="quantity" inputMode="decimal" {...register("quantity")} />
      </FormField>
      <FormField id="unitPrice" label="Unit price" error={errors.unitPrice?.message}>
        <Input id="unitPrice" inputMode="decimal" {...register("unitPrice")} />
      </FormField>
      <div className="flex items-end gap-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Saving…" : submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
      <div className="sm:col-span-4">
        <FormField id="description" label="Description" error={errors.description?.message}>
          <Textarea id="description" {...register("description")} />
        </FormField>
      </div>
    </form>
  );
}

interface LineItemsEditorProps {
  proposalId: string;
  items: ProposalItemRow[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  currency: string;
  editable: boolean;
}

export function LineItemsEditor({
  proposalId,
  items,
  subtotal,
  discount,
  tax,
  total,
  currency,
  editable,
}: LineItemsEditorProps) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAdd(values: ProposalItemFormInput) {
    startTransition(async () => {
      await addProposalItemAction(proposalId, values);
      router.refresh();
    });
  }

  function handleUpdate(itemId: string, values: ProposalItemFormInput) {
    startTransition(async () => {
      await updateProposalItemAction(proposalId, itemId, values);
      setEditingId(null);
      router.refresh();
    });
  }

  function handleRemove(itemId: string) {
    if (!window.confirm("Remove this line item?")) {
      return;
    }

    startTransition(async () => {
      await removeProposalItemAction(proposalId, itemId);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Line items</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {items.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Proposal line items</caption>
              <thead className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
                <tr>
                  <th scope="col" className="py-2 pr-3 font-semibold">Item</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Qty</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Unit price</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Line total</th>
                  {editable ? <th scope="col" className="py-2 font-semibold">Actions</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((item) =>
                  editingId === item.id ? (
                    <tr key={item.id}>
                      <td colSpan={editable ? 5 : 4} className="py-3">
                        <ItemForm
                          defaultValues={{
                            name: item.name,
                            description: item.description ?? "",
                            quantity: String(item.quantity),
                            unitPrice: String(item.unit_price),
                          }}
                          onSubmit={(values) => handleUpdate(item.id, values)}
                          isPending={isPending}
                          submitLabel="Save item"
                          onCancel={() => setEditingId(null)}
                        />
                      </td>
                    </tr>
                  ) : (
                    <tr key={item.id}>
                      <td className="py-3 pr-3">
                        <p className="font-medium text-foreground">{item.name}</p>
                        {item.description ? (
                          <p className="mt-1 text-xs text-text-muted">{item.description}</p>
                        ) : null}
                      </td>
                      <td className="py-3 pr-3 text-text-secondary">{item.quantity}</td>
                      <td className="py-3 pr-3 text-text-secondary">
                        {formatMoney(item.unit_price, currency)}
                      </td>
                      <td className="py-3 pr-3 font-medium text-foreground">
                        {formatMoney(item.quantity * item.unit_price, currency)}
                      </td>
                      {editable ? (
                        <td className="py-3">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              aria-label={`Edit ${item.name}`}
                              className="inline-flex size-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-muted hover:text-foreground"
                              onClick={() => setEditingId(item.id)}
                            >
                              <Pencil className="size-4" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Remove ${item.name}`}
                              className="inline-flex size-8 items-center justify-center rounded-md text-text-muted hover:bg-error-soft hover:text-error"
                              onClick={() => handleRemove(item.id)}
                            >
                              <Trash2 className="size-4" aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-text-muted">No line items yet.</p>
        )}

        {editable ? (
          <div className="border-t border-border pt-5">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Add a line item</h3>
            <ItemForm
              defaultValues={{ name: "", description: "", quantity: "1", unitPrice: "0" }}
              onSubmit={handleAdd}
              isPending={isPending}
              submitLabel="Add item"
            />
          </div>
        ) : null}

        <dl className="ml-auto max-w-xs space-y-2 border-t border-border pt-5 text-sm">
          <div className="flex justify-between">
            <dt className="text-text-secondary">Subtotal</dt>
            <dd className="font-medium text-foreground">{formatMoney(subtotal, currency)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-secondary">Discount</dt>
            <dd className="font-medium text-foreground">-{formatMoney(discount, currency)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-secondary">Tax</dt>
            <dd className="font-medium text-foreground">{formatMoney(tax, currency)}</dd>
          </div>
          <div className="flex justify-between border-t border-border pt-2 text-base">
            <dt className="font-semibold text-foreground">Total</dt>
            <dd className="font-semibold text-foreground">{formatMoney(total, currency)}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
