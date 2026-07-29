"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";

import { addProjectMemberAction } from "../actions";
import { PROJECT_MEMBER_ROLES, PROJECT_MEMBER_ROLE_LABELS } from "../constants";
import { projectMemberFormSchema, type ProjectMemberFormInput } from "../schemas";
import type { ProjectActionResult, ProjectManagerOption } from "../types";

interface ProjectMemberFormProps {
  projectId: string;
  candidates: ProjectManagerOption[];
}

export function ProjectMemberForm({
  projectId,
  candidates,
}: ProjectMemberFormProps) {
  const router = useRouter();
  const [result, setResult] = useState<ProjectActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProjectMemberFormInput>({
    resolver: zodResolver(projectMemberFormSchema),
    defaultValues: { userId: "", role: "member" },
  });

  const submit = handleSubmit((values) => {
    startTransition(async () => {
      const response = await addProjectMemberAction(projectId, values);
      setResult(response);
      if (response.ok) {
        reset();
        router.refresh();
      }
    });
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
        <FormField id="userId" label="Team member" error={errors.userId?.message}>
          <Select id="userId" {...register("userId")}>
            <option value="">Select a member</option>
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>{candidate.fullName}</option>
            ))}
          </Select>
        </FormField>
        <FormField id="role" label="Role" error={errors.role?.message}>
          <Select id="role" {...register("role")}>
            {PROJECT_MEMBER_ROLES.map((role) => (
              <option key={role} value={role}>{PROJECT_MEMBER_ROLE_LABELS[role]}</option>
            ))}
          </Select>
        </FormField>
      </div>
      <div className="flex items-center justify-between gap-4">
        {result ? (
          <p role={result.ok ? "status" : "alert"} className={result.ok ? "text-sm text-success" : "text-sm text-error"}>
            {result.message}
          </p>
        ) : <span />}
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Assigning…" : "Assign member"}
        </Button>
      </div>
    </form>
  );
}
