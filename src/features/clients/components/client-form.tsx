"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
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
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { updateClientAction } from "../actions";
import {
  CLIENT_STATUSES,
  CLIENT_STATUS_LABELS,
} from "../constants";
import {
  clientFormSchema,
  type ClientFormInput,
} from "../schemas";
import type {
  ClientActionResult,
  ClientDetail,
} from "../types";

function defaultsFromClient(client: ClientDetail): ClientFormInput {
  return {
    businessName: client.business_name,
    contactName: client.contact_name,
    email: client.email,
    phone: client.phone ?? "",
    industry: client.industry ?? "",
    websiteUrl: client.website_url ?? "",
    billingAddress: client.billing_address ?? "",
    notes: client.notes ?? "",
    status: client.status,
  };
}

export function ClientForm({ client }: { client: ClientDetail }) {
  const [result, setResult] = useState<ClientActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ClientFormInput>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: defaultsFromClient(client),
  });
  const statusOptions =
    client.status === "archived"
      ? CLIENT_STATUSES.filter((status) => status === "archived")
      : CLIENT_STATUSES.filter((status) => status !== "archived");

  const submit = handleSubmit((values) => {
    setResult(null);
    startTransition(async () => {
      const response = await updateClientAction(client.id, values);

      if (response?.fieldErrors) {
        for (const [field, messages] of Object.entries(response.fieldErrors)) {
          const message = messages?.[0];
          if (message) {
            setError(field as keyof ClientFormInput, { message });
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
          <CardTitle>Client information</CardTitle>
          <CardDescription>
            Update the primary business and contact information for this
            client.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <FormField
            id="businessName"
            label="Business name"
            required
            error={errors.businessName?.message}
          >
            <Input
              id="businessName"
              autoComplete="organization"
              aria-invalid={Boolean(errors.businessName)}
              {...register("businessName")}
            />
          </FormField>
          <FormField
            id="contactName"
            label="Primary contact"
            required
            error={errors.contactName?.message}
          >
            <Input
              id="contactName"
              autoComplete="name"
              aria-invalid={Boolean(errors.contactName)}
              {...register("contactName")}
            />
          </FormField>
          <FormField
            id="email"
            label="Email"
            required
            error={errors.email?.message}
          >
            <Input
              id="email"
              type="email"
              autoComplete="email"
              aria-invalid={Boolean(errors.email)}
              {...register("email")}
            />
          </FormField>
          <FormField
            id="phone"
            label="Phone"
            error={errors.phone?.message}
          >
            <Input
              id="phone"
              type="tel"
              autoComplete="tel"
              aria-invalid={Boolean(errors.phone)}
              {...register("phone")}
            />
          </FormField>
          <FormField
            id="industry"
            label="Industry"
            error={errors.industry?.message}
          >
            <Input
              id="industry"
              aria-invalid={Boolean(errors.industry)}
              {...register("industry")}
            />
          </FormField>
          <FormField
            id="websiteUrl"
            label="Website"
            hint="Include http:// or https://."
            error={errors.websiteUrl?.message}
          >
            <Input
              id="websiteUrl"
              type="url"
              autoComplete="url"
              aria-invalid={Boolean(errors.websiteUrl)}
              {...register("websiteUrl")}
            />
          </FormField>
          <div className="md:col-span-2">
            <FormField
              id="billingAddress"
              label="Billing address"
              error={errors.billingAddress?.message}
            >
              <Textarea
                id="billingAddress"
                autoComplete="street-address"
                aria-invalid={Boolean(errors.billingAddress)}
                {...register("billingAddress")}
              />
            </FormField>
          </div>
          <div className="md:col-span-2">
            <FormField
              id="notes"
              label="Internal notes"
              hint="Visible only in the internal admin workspace."
              error={errors.notes?.message}
            >
              <Textarea
                id="notes"
                aria-invalid={Boolean(errors.notes)}
                {...register("notes")}
              />
            </FormField>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Client status</CardTitle>
          <CardDescription>
            Use active or inactive here. Archiving remains a separate
            confirmation workflow so history is never removed accidentally.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormField
            id="status"
            label="Status"
            required
            error={errors.status?.message}
          >
            <Select
              id="status"
              aria-invalid={Boolean(errors.status)}
              {...register("status")}
            >
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {CLIENT_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </FormField>
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

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link
          href={`/admin/clients/${client.id}`}
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-border-strong bg-white px-4 text-sm font-medium text-foreground hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Cancel
        </Link>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
