"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  REVISION_PRIORITIES,
  REVISION_PRIORITY_LABELS,
} from "@/features/revisions/constants";

import { submitRevisionAction } from "../actions";
import {
  submitRevisionSchema,
  type SubmitRevisionInput,
} from "../schemas";
import type { PortalRevisionActionResult } from "../types";

interface RevisionSubmitFormProps {
  projectId: string;
  attachmentOptions: { id: string; fileName: string }[];
}

export function RevisionSubmitForm({
  projectId,
  attachmentOptions,
}: RevisionSubmitFormProps) {
  const router = useRouter();
  const [result, setResult] = useState<PortalRevisionActionResult | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SubmitRevisionInput>({
    resolver: zodResolver(submitRevisionSchema),
    defaultValues: {
      pageName: "",
      sectionName: "",
      title: "",
      description: "",
      priority: "medium",
      attachmentFileId: "",
    },
  });

  const submit = handleSubmit((values) => {
    startTransition(async () => {
      const response = await submitRevisionAction(projectId, values);
      setResult(response);
      if (response.ok) {
        reset();
        router.refresh();
      }
    });
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="pageName" label="Page" hint="Optional">
          <Input id="pageName" {...register("pageName")} />
        </FormField>
        <FormField id="sectionName" label="Section" hint="Optional">
          <Input id="sectionName" {...register("sectionName")} />
        </FormField>
      </div>
      <FormField id="title" label="Title" required error={errors.title?.message}>
        <Input id="title" {...register("title")} />
      </FormField>
      <FormField
        id="description"
        label="Description"
        required
        error={errors.description?.message}
      >
        <Textarea id="description" {...register("description")} />
      </FormField>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="priority" label="Priority" required>
          <Select id="priority" {...register("priority")}>
            {REVISION_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {REVISION_PRIORITY_LABELS[priority]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField
          id="attachmentFileId"
          label="Attachment"
          hint={
            attachmentOptions.length === 0
              ? "Upload a file below first to attach it."
              : "Optional"
          }
        >
          <Select id="attachmentFileId" {...register("attachmentFileId")}>
            <option value="">No attachment</option>
            {attachmentOptions.map((file) => (
              <option key={file.id} value={file.id}>
                {file.fileName}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
      <div className="flex items-center justify-between gap-4">
        {result ? (
          <p
            role={result.ok ? "status" : "alert"}
            className={result.ok ? "text-sm text-success" : "text-sm text-error"}
          >
            {result.message}
          </p>
        ) : (
          <span />
        )}
        <Button type="submit" disabled={isPending}>
          {isPending ? "Submitting…" : "Submit revision"}
        </Button>
      </div>
    </form>
  );
}
