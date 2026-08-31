"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
	FieldLegend,
	FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type { McqErrorResponse } from "@/lib/types/mcq-api";
import type { Mcq } from "@/lib/types/mcq";

type McqFormProps = {
	mode: "create" | "edit";
	mcqId?: string;
};

type ChoiceDraft = {
	key: string;
	id?: string;
	choiceText: string;
};

type LoadState = "idle" | "loading" | "ready" | "error";

function createChoiceDraft(choice?: Mcq["choices"][number]): ChoiceDraft {
	return {
		key: choice?.id ?? crypto.randomUUID(),
		id: choice?.id,
		choiceText: choice?.choiceText ?? "",
	};
}

function defaultChoices(): ChoiceDraft[] {
	return [createChoiceDraft(), createChoiceDraft()];
}

function choiceFieldError(
	fieldErrors: McqErrorResponse["fieldErrors"],
	index: number,
): string | undefined {
	return fieldErrors?.[`choices.${index}.choiceText`]?.[0];
}

export function McqForm({ mode, mcqId }: McqFormProps) {
	const router = useRouter();
	const formId = useId();
	const [loadState, setLoadState] = useState<LoadState>(
		mode === "edit" ? "loading" : "ready",
	);
	const [loadError, setLoadError] = useState<string | undefined>();
	const [name, setName] = useState("");
	const [question, setQuestion] = useState("");
	const [choices, setChoices] = useState<ChoiceDraft[]>(() => defaultChoices());
	const [correctChoiceKey, setCorrectChoiceKey] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const [formError, setFormError] = useState<string | undefined>();
	const [fieldErrors, setFieldErrors] = useState<
		McqErrorResponse["fieldErrors"]
	>({});

	useEffect(() => {
		if (mode !== "edit" || !mcqId) {
			return;
		}

		let cancelled = false;

		async function loadMcq() {
			try {
				const response = await fetch(`/api/mcqs/${mcqId}`);
				const data = (await response.json()) as { mcq?: Mcq } & McqErrorResponse;

				if (cancelled) {
					return;
				}

				if (!response.ok || !data.mcq) {
					setLoadState("error");
					setLoadError(
						data.formError ?? "Something went wrong. Please try again.",
					);
					return;
				}

				const loadedChoices = data.mcq.choices.map((choice) =>
					createChoiceDraft(choice),
				);
				const correctChoice = data.mcq.choices.find((choice) => choice.isCorrect);

				setName(data.mcq.name);
				setQuestion(data.mcq.question);
				setChoices(loadedChoices);
				setCorrectChoiceKey(
					correctChoice
						? loadedChoices.find((choice) => choice.id === correctChoice.id)?.key ??
								null
						: null,
				);
				setLoadState("ready");
			} catch {
				if (!cancelled) {
					setLoadState("error");
					setLoadError("Something went wrong. Please try again.");
				}
			}
		}

		void loadMcq();

		return () => {
			cancelled = true;
		};
	}, [mode, mcqId]);

	function addChoice() {
		if (choices.length >= 6) {
			return;
		}

		setChoices((current) => [...current, createChoiceDraft()]);
		setFieldErrors((current) => {
			if (!current) {
				return current;
			}

			const next = { ...current };
			for (const key of Object.keys(next)) {
				if (key.startsWith("choices.")) {
					delete next[key];
				}
			}
			return next;
		});
	}

	function removeChoice(index: number) {
		if (choices.length <= 2) {
			return;
		}

		const removed = choices[index];
		setChoices((current) => current.filter((_, choiceIndex) => choiceIndex !== index));
		if (removed && correctChoiceKey === removed.key) {
			setCorrectChoiceKey(null);
		}
	}

	function handleCorrectChoiceChange(value: string | null) {
		setCorrectChoiceKey(value);
		setFieldErrors((current) => {
			if (!current?.choices) {
				return current;
			}

			const next = { ...current };
			delete next.choices;
			return next;
		});
	}

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();

		if (submitting || loadState !== "ready") {
			return;
		}

		setSubmitting(true);
		setFormError(undefined);
		setFieldErrors({});

		const payload = {
			name,
			question,
			choices: choices.map((choice) => ({
				...(choice.id ? { id: choice.id } : {}),
				choiceText: choice.choiceText,
				isCorrect: choice.key === correctChoiceKey,
			})),
		};

		try {
			const response = await fetch(
				mode === "create" ? "/api/mcqs" : `/api/mcqs/${mcqId}`,
				{
					method: mode === "create" ? "POST" : "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				},
			);

			if (response.ok) {
				router.push("/mcq");
				return;
			}

			const data = (await response.json()) as McqErrorResponse;
			setFieldErrors(data.fieldErrors ?? {});
			setFormError(data.formError);
		} catch {
			setFormError("Something went wrong. Please try again.");
		} finally {
			setSubmitting(false);
		}
	}

	function handleCancel() {
		router.push("/mcq");
	}

	if (mode === "edit" && loadState === "loading") {
		return <p className="text-sm text-muted-foreground">Loading MCQ…</p>;
	}

	if (mode === "edit" && loadState === "error") {
		return (
			<p className="text-sm text-destructive" role="alert">
				{loadError}
			</p>
		);
	}

	const controlsDisabled = submitting;

	return (
		<form
			className="flex w-full flex-col gap-6"
			noValidate
			onSubmit={handleSubmit}
		>
			<div className="flex flex-col gap-1">
				<h1 className="text-2xl font-semibold tracking-tight">
					{mode === "create" ? "Create MCQ" : "Edit MCQ"}
				</h1>
			</div>

			<FieldGroup>
				{formError ? (
					<FieldError className="mb-1">{formError}</FieldError>
				) : null}

				<Field data-invalid={!!fieldErrors?.name}>
					<FieldLabel htmlFor={`${formId}-name`}>Name</FieldLabel>
					<Input
						id={`${formId}-name`}
						name="name"
						value={name}
						onChange={(event) => setName(event.target.value)}
						disabled={controlsDisabled}
						aria-invalid={!!fieldErrors?.name}
						required
					/>
					<FieldError>{fieldErrors?.name?.[0]}</FieldError>
				</Field>

				<Field data-invalid={!!fieldErrors?.question}>
					<FieldLabel htmlFor={`${formId}-question`}>Question</FieldLabel>
					<Textarea
						id={`${formId}-question`}
						name="question"
						value={question}
						onChange={(event) => setQuestion(event.target.value)}
						disabled={controlsDisabled}
						aria-invalid={!!fieldErrors?.question}
						required
					/>
					<FieldError>{fieldErrors?.question?.[0]}</FieldError>
				</Field>

				<FieldSet>
					<FieldLegend>Choices</FieldLegend>
					<RadioGroup
						value={correctChoiceKey}
						onValueChange={handleCorrectChoiceChange}
						disabled={controlsDisabled}
						className="flex flex-col gap-4"
					>
						<FieldGroup>
							{choices.map((choice, index) => {
								const choiceLabel = `Choice ${index + 1}`;
								const choiceInputId = `${formId}-choice-${choice.key}`;
								const choiceError = choiceFieldError(fieldErrors, index);

								return (
									<div
										key={choice.key}
										className="flex flex-col gap-3 rounded-lg border p-4"
									>
										<Field data-invalid={!!choiceError}>
											<FieldLabel htmlFor={choiceInputId}>{choiceLabel}</FieldLabel>
											<Input
												id={choiceInputId}
												name={`choice-${index + 1}`}
												value={choice.choiceText}
												onChange={(event) => {
													const value = event.target.value;
													setChoices((current) =>
														current.map((item, choiceIndex) =>
															choiceIndex === index
																? { ...item, choiceText: value }
																: item,
														),
													);
												}}
												disabled={controlsDisabled}
												aria-invalid={!!choiceError}
												required
											/>
											<FieldError>{choiceError}</FieldError>
										</Field>

										<Field orientation="horizontal">
											<RadioGroupItem
												value={choice.key}
												disabled={controlsDisabled}
												aria-label={`Mark choice ${index + 1} as correct`}
											/>
											<span className="text-sm text-muted-foreground">
												Mark as correct answer
											</span>
										</Field>

										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={() => removeChoice(index)}
											disabled={controlsDisabled || choices.length <= 2}
										>
											{`Remove choice ${index + 1}`}
										</Button>
									</div>
								);
							})}
						</FieldGroup>
					</RadioGroup>
					<Field data-invalid={!!fieldErrors?.choices}>
						<FieldError>{fieldErrors?.choices?.[0]}</FieldError>
					</Field>
				</FieldSet>

				<div className="flex flex-wrap gap-2">
					<Button
						type="button"
						variant="outline"
						onClick={addChoice}
						disabled={controlsDisabled || choices.length >= 6}
					>
						Add choice
					</Button>
				</div>

				<div className="flex flex-wrap gap-2">
					<Button type="submit" disabled={controlsDisabled}>
						{submitting ? "Saving…" : "Save"}
					</Button>
					<Button
						type="button"
						variant="outline"
						onClick={handleCancel}
						disabled={controlsDisabled}
					>
						Cancel
					</Button>
				</div>
			</FieldGroup>
		</form>
	);
}
